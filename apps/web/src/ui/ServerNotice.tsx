import { useEffect, useRef, useState } from "react";
import type { SyncState, DemoProfile } from "@samokettik/contracts";
import { text, type Locale } from "../i18n/text";
import { dateTime } from "./format";
type Notification = SyncState["notifications"]["items"][number];
export function ServerNotice({
  notifications,
  profile,
  locale,
  activeRentalId,
}: {
  notifications: Notification[];
  profile: DemoProfile;
  locale: Locale;
  activeRentalId: string | null;
}) {
  const storageKey = `samokettik.notice.${profile}`,
    announced = useRef<string | null | undefined>(undefined);
  const [visible, setVisible] = useState<Notification | null>(null),
    t = text(locale);
  useEffect(() => {
    const latest = notifications.find(
      (n) => n.code === "TRIP_FINISHED" || n.code === "RESERVATION_EXPIRED",
    );
    if (announced.current === undefined) {
      let previous: string | null = null;
      try {
        previous = sessionStorage.getItem(storageKey);
      } catch {
        /* Non-critical read preference. */
      }
      // First visit establishes an inbox baseline. Historical notices remain in
      // the inbox; they must not masquerade as a stop of a newly started ride.
      announced.current = previous ?? latest?.id ?? null;
      if (!previous && latest) {
        try {
          sessionStorage.setItem(storageKey, latest.id);
        } catch {
          /* Display preference only. */
        }
      }
    }
    if (latest && latest.id !== announced.current) {
      announced.current = latest.id;
      setVisible(latest);
      try {
        sessionStorage.setItem(storageKey, latest.id);
      } catch {
        /* Server notification remains durable. */
      }
    }
  }, [notifications, storageKey]);
  if (!visible || (activeRentalId && visible.rentalId !== activeRentalId))
    return null;
  return (
    <div className="server-notice" role="status">
      <div>
        <p>
          {visible.reason === "battery_depleted"
            ? t.autoFinished
            : visible.code === "RESERVATION_EXPIRED"
              ? t.bookingExpired
              : t.tripFinished}
        </p>
        <time dateTime={visible.createdAt}>
          {dateTime(visible.createdAt, locale)}
        </time>
      </div>
      <button
        className="icon-button"
        type="button"
        aria-label={t.close}
        onClick={() => setVisible(null)}
      >
        ×
      </button>
    </div>
  );
}
