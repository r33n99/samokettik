import { useEffect, useState } from "react";
import type { Static, TSchema } from "@sinclair/typebox";
import { createApiClient } from "../../api/client";

// A stack of cursors provides Back without offsets or storing private history.
export function useHistoryPage<S extends TSchema>(
  path: string,
  schema: S,
  token: string | undefined,
  enabled: boolean,
  refreshKey: string,
) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [data, setData] = useState<Static<S> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const cursor = cursors.at(-1) ?? null;
  useEffect(() => {
    if (!enabled || !token) return;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    void createApiClient({ token }).get(`${path}?${query}`, schema, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setData(value); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, schema, token, enabled, cursor, refreshKey, retry]);
  return {
    data, loading, error, page: cursors.length,
    next: (nextCursor: string) => {
      setLoading(true);
      setCursors((values) => [...values, nextCursor]);
    },
    previous: () => {
      setLoading(true);
      setCursors((values) => values.length > 1 ? values.slice(0, -1) : values);
    },
    reload: () => {
      setError(false);
      setLoading(true);
      setRetry((value) => value + 1);
    },
  };
}
