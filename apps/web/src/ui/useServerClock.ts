import { useEffect, useMemo, useState } from "react";
export function useServerClock(serverTime: string | undefined) {
  const anchor = useMemo(
    () => ({
      server: serverTime ? Date.parse(serverTime) : 0,
      received: performance.now(),
    }),
    [serverTime],
  );
  const [now, setNow] = useState(anchor.server);
  useEffect(() => {
    const update = () =>
      setNow(
        anchor.server +
          Math.max(0, Math.floor(performance.now() - anchor.received)),
      );
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [anchor]);
  return { now, elapsedSinceSnapshot: Math.max(0, now - anchor.server) };
}
