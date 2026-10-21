import { useCallback, useEffect, useRef, useState } from "react";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  ClientConfigSchema,
  DemoSessionSchema,
  ReservationResultSchema,
  TripResultSchema,
  PaymentResultSchema,
  ServiceZoneSchema,
  UuidSchema,
  type ClientConfig,
  type DemoProfile,
  type DemoSession,
  type ServiceZone,
  type SyncState,
  type VehicleList,
} from "@samokettik/contracts";
import { createApiClient, ApiFailure } from "../api/client";
import { connectRealtime, type RealtimeStatus } from "../api/realtime";

const PendingSchema = Type.Object(
  {
    key: UuidSchema,
    path: Type.String(),
    body: Type.Object(
      {
        vehicleId: Type.Optional(UuidSchema),
        outcome: Type.Optional(
          Type.Union([Type.Literal("approved"), Type.Literal("declined")]),
        ),
      },
      { additionalProperties: false },
    ),
    kind: Type.Union([
      Type.Literal("reservation"),
      Type.Literal("trip"),
      Type.Literal("payment"),
    ]),
  },
  { additionalProperties: false },
);
type Pending = Static<typeof PendingSchema>;
function storedSession(): DemoSession | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem("samokettik.demo.session") ?? "null",
    );
    return Value.Check(DemoSessionSchema, value) ? value : null;
  } catch {
    return null;
  }
}
function storedPending(profile: DemoProfile): Pending | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(`samokettik.command.${profile}`) ?? "null",
    );
    return Value.Check(PendingSchema, value) ? value : null;
  } catch {
    return null;
  }
}
export function useRentalApp() {
  const [session, setSession] = useState<DemoSession | null>(storedSession),
    [config, setConfig] = useState<ClientConfig | null>(null),
    [zone, setZone] = useState<ServiceZone | null>(null);
  const [fleet, setFleet] = useState<VehicleList | null>(null),
    [sync, setSync] = useState<SyncState | null>(null);
  const [connection, setConnection] = useState<RealtimeStatus>("restoring"),
    [offline, setOffline] = useState(!navigator.onLine),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Pending | null>(() => {
      const value = storedSession();
      return value ? storedPending(value.profile) : null;
    });
  const [error, setError] = useState<ApiFailure | null>(null),
    [fatal, setFatal] = useState(false),
    [revision, setRevision] = useState(0),
    [initialRevision, setInitialRevision] = useState(0);
  const epoch = useRef(0),
    commandController = useRef<AbortController | null>(null),
    sessionRef = useRef(session);
  sessionRef.current = session;
  const refresh = useCallback(() => {
    setConnection("restoring");
    setRevision((v) => v + 1);
  }, []);
  const leave = useCallback(() => {
    commandController.current?.abort();
    epoch.current++;
    sessionStorage.removeItem("samokettik.demo.session");
    sessionRef.current = null;
    setSession(null);
    setSync(null);
    setPending(null);
    setBusy(false);
    setError(null);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setFatal(false);
    const api = createApiClient();
    void Promise.all([
      api.get("/api/v1/client-config", ClientConfigSchema, controller.signal),
      api.get("/api/v1/service-zone", ServiceZoneSchema, controller.signal),
    ])
      .then(([configuration, serviceZone]) => {
        setConfig(configuration);
        setZone(serviceZone);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFatal(true);
      });
    return () => controller.abort();
  }, [initialRevision]);
  useEffect(() => {
    const online = () => {
        setOffline(false);
        refresh();
      },
      offline = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [refresh]);
  useEffect(() => {
    const generation = ++epoch.current;
    setBusy(false);
    setPending(session ? storedPending(session.profile) : null);
    setConnection("restoring");
    const client = connectRealtime({
      ...(session ? { token: session.token } : {}),
      onFleet: (data) => {
        if (epoch.current === generation) setFleet(data);
      },
      onSync: (data) => {
        if (epoch.current === generation) setSync(data);
      },
      onStatus: (status) => {
        if (epoch.current === generation) setConnection(status);
      },
      onError: (status) => {
        if (status === 401 && epoch.current === generation) {
          leave();
          setError(
            new ApiFailure(
              "Демо-доступ истёк. Выберите профиль снова.",
              "UNAUTHORIZED",
              401,
              false,
            ),
          );
        }
      },
    });
    return () => {
      epoch.current++;
      client.stop();
    };
  }, [session, revision, leave]);
  async function login(profile: DemoProfile) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const generation = epoch.current;
    try {
      const value = await createApiClient().post(
        "/api/v1/demo/session",
        { profile },
        DemoSessionSchema,
      );
      if (generation !== epoch.current) return;
      sessionStorage.setItem("samokettik.demo.session", JSON.stringify(value));
      setSync(null);
      sessionRef.current = value;
      setSession(value);
    } catch (error) {
      if (generation === epoch.current)
        setError(
          error instanceof ApiFailure
            ? error
            : new ApiFailure(
                "Не удалось сохранить демо-доступ",
                "SESSION_STORAGE",
                null,
                false,
              ),
        );
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  }
  async function execute(intent: Pending) {
    const current = sessionRef.current;
    if (!current || busy) return;
    const profile = current.profile,
      generation = epoch.current;
    setBusy(true);
    setError(null);
    commandController.current?.abort();
    const controller = new AbortController();
    commandController.current = controller;
    try {
      // Persist the intent before sending. This is request metadata, never a
      // local source of fleet/rental/cost state. Keep it after lost responses.
      sessionStorage.setItem(
        `samokettik.command.${profile}`,
        JSON.stringify(intent),
      );
      setPending(intent);
      const api = createApiClient({ token: current.token });
      const schema =
        intent.kind === "reservation"
          ? ReservationResultSchema
          : intent.kind === "payment"
            ? PaymentResultSchema
            : TripResultSchema;
      await api.post(
        intent.path,
        intent.body,
        schema,
        intent.key,
        controller.signal,
      );
      sessionStorage.removeItem(`samokettik.command.${profile}`);
      if (generation === epoch.current) {
        setPending(null);
        refresh();
      }
    } catch (error) {
      if (generation !== epoch.current) return;
      const failure =
        error instanceof ApiFailure
          ? error
          : new ApiFailure(
              "Не удалось сохранить или выполнить команду",
              "LOCAL_REQUEST_STORAGE",
              null,
              true,
            );
      if (!failure.retrySameKey) {
        sessionStorage.removeItem(`samokettik.command.${profile}`);
        setPending(null);
      }
      setError(failure);
      if (failure.status === 401) {
        leave();
        setError(failure);
      } else if (!failure.retrySameKey) refresh();
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  }
  function command(path: string, body: Pending["body"], kind: Pending["kind"]) {
    if (pending || busy || offline || connection !== "connected" || !session)
      return;
    void execute({ path, body, kind, key: crypto.randomUUID() });
  }
  useEffect(
    () => () => {
      commandController.current?.abort();
    },
    [],
  );
  return {
    config,
    zone,
    session,
    fleet,
    sync,
    connection,
    offline,
    busy,
    pending,
    error,
    fatal,
    login,
    leave,
    command,
    retryCommand: () => {
      if (pending) void execute(pending);
    },
    refresh,
    reload: () => setInitialRevision((v) => v + 1),
    clearError: () => setError(null),
    ready:
      !offline && connection === "connected" && (!session || Boolean(sync)),
  };
}
export type RentalApp = ReturnType<typeof useRentalApp>;
