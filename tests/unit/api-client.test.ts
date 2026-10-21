import { describe, expect, it } from "vitest";
import { Type } from "@sinclair/typebox";
import { ApiFailure, createApiClient } from "../../apps/web/src/api/client.js";

const schema = Type.Object(
  { accepted: Type.Boolean() },
  { additionalProperties: false },
);
describe("browser API boundary", () => {
  it("preserves the supplied intent key and payload after a lost response", async () => {
    const calls: {
      url: string;
      key: string | null;
      body: BodyInit | null | undefined;
    }[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      calls.push({
        url: String(url),
        key: new Headers(init?.headers).get("idempotency-key"),
        body: init?.body,
      });
      if (calls.length === 1)
        throw new TypeError("Connection closed after server commit");
      return Response.json({ accepted: true });
    };
    const api = createApiClient({ fetcher }),
      key = "71000000-0000-4000-8000-000000000001";
    await expect(
      api.post("/api/v1/reservations", { vehicleId: "vehicle" }, schema, key),
    ).rejects.toMatchObject({ code: "CONNECTION_LOST", retrySameKey: true });
    expect(
      await api.post(
        "/api/v1/reservations",
        { vehicleId: "vehicle" },
        schema,
        key,
      ),
    ).toEqual({ accepted: true });
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0]?.key).toBe(key);
  });
  it("treats a validated conflict as a definitive result and retains requestId", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json(
        {
          code: "VEHICLE_NOT_AVAILABLE",
          message: "Этот самокат уже забронирован",
          requestId: "req-7",
        },
        { status: 409 },
      );
    await expect(
      createApiClient({ fetcher }).post(
        "/api/v1/reservations",
        {},
        schema,
        "key",
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "VEHICLE_NOT_AVAILABLE",
      retrySameKey: false,
      requestId: "req-7",
    });
  });
  it("rejects malformed successful replies and considers 503 uncertain", async () => {
    for (const response of [
      Response.json({ accepted: "yes" }),
      new Response("upstream unavailable", { status: 503 }),
    ]) {
      const fetcher: typeof fetch = async () => response;
      await expect(
        createApiClient({ fetcher }).post(
          "/api/v1/trips/id/finish",
          {},
          schema,
          "key",
        ),
      ).rejects.toMatchObject({ retrySameKey: true });
    }
  });
  it("does not forward credentials outside the internal API and supports abort", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async (_url, init) => {
      calls++;
      throw init?.signal?.reason;
    };
    const api = createApiClient({ token: "test-only-credential", fetcher });
    await expect(
      api.get("https://example.test/api/v1/invoices", schema),
    ).rejects.toThrow("Expected internal API path");
    expect(calls).toBe(0);
    const controller = new AbortController(),
      reason = new DOMException("Cancelled", "AbortError");
    controller.abort(reason);
    await expect(
      api.get("/api/v1/invoices", schema, controller.signal),
    ).rejects.toBe(reason);
    expect(new ApiFailure("failure", "TEST", null, true).message).toBe(
      "failure",
    );
  });
});
