import { Value } from "@sinclair/typebox/value";
import {
  RealtimeFrameSchema,
  RealtimeTicketSchema,
  SyncStateSchema,
  VehicleListSchema,
  type SyncState,
  type VehicleList,
} from "@samokettik/contracts";

export type RealtimeStatus = "restoring" | "connected" | "reconnecting";
type Options = {
  token?: string;
  onFleet: (fleet: VehicleList) => void;
  onSync?: (state: SyncState) => void;
  onStatus: (state: RealtimeStatus) => void;
  onError?: (status: number) => void;
};
const INITIAL_RETRY_MS = 500,
  MAX_RETRY_MS = 10000,
  REQUEST_TIMEOUT_MS = 10000;
export function connectRealtime(options: Options): { stop: () => void } {
  let stopped = false,
    generation = 0,
    retryMs = INITIAL_RETRY_MS;
  let socket: WebSocket | null = null,
    request: AbortController | null = null,
    timer: ReturnType<typeof setTimeout> | undefined;
  const headers = options.token
    ? { authorization: `Bearer ${options.token}` }
    : undefined;
  function retry() {
    if (stopped || timer) return;
    options.onStatus("reconnecting");
    timer = setTimeout(() => {
      timer = undefined;
      void attempt();
    }, retryMs);
    retryMs = Math.min(MAX_RETRY_MS, retryMs * 2);
  }
  async function attempt() {
    if (stopped) return;
    const epoch = ++generation;
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ]);
    try {
      options.onStatus("restoring");
      // API restores authoritative state on EVERY reconnection. The initial WS
      // snapshot then closes the gap between this read and the new subscription.
      const restored = await fetch(
        options.token ? "/api/v1/sync" : "/api/v1/vehicles",
        { ...(headers ? { headers } : {}), signal, cache: "no-store" },
      );
      if (!restored.ok) {
        options.onError?.(restored.status);
        throw new Error("State restoration failed");
      }
      const data: unknown = await restored.json();
      if (stopped || generation !== epoch) return;
      if (options.token) {
        if (!Value.Check(SyncStateSchema, data))
          throw new Error("Invalid state response");
        options.onSync?.(data);
        options.onFleet(data.fleet);
      } else {
        if (!Value.Check(VehicleListSchema, data))
          throw new Error("Invalid fleet response");
        options.onFleet(data);
      }
      const protocols = ["samokettik.v1"];
      if (options.token) {
        const response = await fetch("/api/v1/realtime/tickets", {
          method: "POST",
          ...(headers ? { headers } : {}),
          signal,
          cache: "no-store",
        });
        const ticket: unknown = await response.json();
        if (!response.ok || !Value.Check(RealtimeTicketSchema, ticket))
          throw new Error("Ticket request failed");
        protocols.push(`ticket.${ticket.ticket}`);
      }
      if (stopped || generation !== epoch) return;
      const url = new URL("/api/v1/realtime", window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const connection = new WebSocket(url, protocols);
      socket = connection;
      let connectionId: string | null = null,
        sequence = 0;
      connection.onopen = () => {
        if (!stopped && generation === epoch) {
          retryMs = INITIAL_RETRY_MS;
          options.onStatus("connected");
        }
      };
      connection.onmessage = (event) => {
        if (stopped || generation !== epoch) return;
        try {
          const frame: unknown =
            typeof event.data === "string" ? JSON.parse(event.data) : null;
          if (
            !Value.Check(RealtimeFrameSchema, frame) ||
            (connectionId !== null && connectionId !== frame.connectionId)
          )
            throw new Error("Invalid realtime frame");
          connectionId = frame.connectionId;
          if (frame.sequence <= sequence) return;
          sequence = frame.sequence;
          if (frame.type === "state_snapshot" && options.token) {
            options.onSync?.(frame.state);
            options.onFleet(frame.state.fleet);
          } else if (frame.type === "fleet_snapshot" && !options.token)
            options.onFleet(frame.fleet);
          else throw new Error("Unexpected stream identity");
        } catch {
          connection.close(1002, "Invalid snapshot");
        }
      };
      connection.onerror = () => connection.close();
      connection.onclose = () => {
        if (socket === connection) socket = null;
        if (!stopped && generation === epoch) retry();
      };
    } catch {
      if (!stopped && generation === epoch) retry();
    }
  }
  void attempt();
  return {
    stop() {
      stopped = true;
      generation++;
      clearTimeout(timer);
      request?.abort();
      socket?.close();
      socket = null;
    },
  };
}
