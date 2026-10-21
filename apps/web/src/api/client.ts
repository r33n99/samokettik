import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import { ErrorResponseSchema } from "@samokettik/contracts";

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null,
    readonly retrySameKey: boolean,
    readonly requestId?: string,
  ) {
    super(message);
  }
}
type Options = { token?: string; fetcher?: typeof fetch };
export function createApiClient({ token, fetcher = fetch }: Options = {}) {
  async function request<S extends TSchema>(
    path: string,
    schema: S,
    method: "GET" | "POST",
    body?: unknown,
    key?: string,
    signal?: AbortSignal,
  ): Promise<Static<S>> {
    // Never send the credential to an arbitrary URL supplied by UI state.
    if (!path.startsWith("/api/v1/") || path.includes("\\"))
      throw new Error("Expected internal API path");
    const headers = new Headers({ accept: "application/json" });
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (method === "POST") headers.set("content-type", "application/json");
    if (key) headers.set("idempotency-key", key);
    let response: Response;
    try {
      response = await fetcher(path, {
        method,
        headers,
        cache: "no-store",
        ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
        signal: AbortSignal.any([
          ...(signal ? [signal] : []),
          AbortSignal.timeout(15000),
        ]),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiFailure(
        "Нет связи с сервером. Результат операции пока неизвестен",
        "CONNECTION_LOST",
        null,
        true,
      );
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiFailure(
        "Сервер вернул некорректный ответ. Обновите состояние и повторите запрос",
        "INVALID_RESPONSE",
        response.status,
        true,
      );
    }
    if (!response.ok) {
      const uncertain =
        response.status >= 500 ||
        response.status === 408 ||
        response.status === 429;
      if (Value.Check(ErrorResponseSchema, data))
        throw new ApiFailure(
          data.message,
          data.code,
          response.status,
          uncertain,
          data.requestId,
        );
      throw new ApiFailure(
        "Не удалось обработать запрос. Обновите состояние и повторите запрос",
        "REQUEST_FAILED",
        response.status,
        uncertain,
      );
    }
    if (!Value.Check(schema, data))
      throw new ApiFailure(
        "Не удалось проверить ответ сервера. Обновите состояние",
        "INVALID_RESPONSE",
        response.status,
        true,
      );
    return data;
  }
  return {
    get<S extends TSchema>(path: string, schema: S, signal?: AbortSignal) {
      return request(path, schema, "GET", undefined, undefined, signal);
    },
    // The caller owns the intent and MUST preserve its key after an uncertain
    // response. Repeating a user intent must not silently generate a fresh key.
    post<S extends TSchema>(
      path: string,
      body: unknown,
      schema: S,
      key?: string,
      signal?: AbortSignal,
    ) {
      return request(path, schema, "POST", body, key, signal);
    },
  };
}
