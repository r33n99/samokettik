import { useEffect, useState } from "react";
import { useRentalApp } from "../state/useRentalApp";
import { TransportMap } from "../features/map/TransportMap";
import { RentalPanel } from "../features/rental/RentalPanel";
import { History } from "../features/history/History";
import { Modal } from "../ui/Modal";
import { ScooterIcon } from "../ui/icons";
import { ServerNotice } from "../ui/ServerNotice";
import { text, errorText, type Locale } from "../i18n/text";
import { dateTime } from "../ui/format";
import "./app.scss";

export function App() {
  const app = useRentalApp(),
    [locale, setLocale] = useState<Locale>(() =>
      sessionStorage.getItem("samokettik.locale") === "ky" ? "ky" : "ru",
    ),
    [view, setView] = useState<"map" | "trips" | "invoices">("map");
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [fitRequest, setFitRequest] = useState(0),
    [loginOpen, setLoginOpen] = useState(false),
    [listOpen, setListOpen] = useState(false),
    [noticesOpen, setNoticesOpen] = useState(false),
    [search, setSearch] = useState(""),
    [onlyFree, setOnlyFree] = useState(false);
  const t = text(locale),
    activeId =
      app.sync?.current.trip?.vehicleId ??
      app.sync?.current.reservation?.vehicleId ??
      null;
  const selected =
    app.fleet?.items.find((v) => v.id === (selectedId ?? activeId)) ?? null;
  const profile = app.config?.profiles.find(
    (p) => p.id === app.session?.profile,
  );
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `СамоКеттик · ${t.city}`;
    sessionStorage.setItem("samokettik.locale", locale);
  }, [locale, t.city]);
  useEffect(() => {
    if (app.session) setLoginOpen(false);
  }, [app.session]);
  function select(id: string) {
    setSelectedId(id);
    setListOpen(false);
    setFitRequest((v) => v + 1);
    setView("map");
  }
  const notifications = app.sync?.notifications.items ?? [];
  function noticeLabel(code: string, reason: string | null) {
    return reason === "battery_depleted"
      ? t.autoFinished
      : code === "RESERVATION_EXPIRING"
        ? t.bookingWarning
        : code === "RESERVATION_EXPIRED"
          ? t.bookingExpired
          : code === "RESERVATION_UNAVAILABLE"
            ? t.bookingUnavailable
            : t.tripFinished;
  }
  return (
    <div className={`application${view === "map" ? " map-view" : ""}`}>
      <header className="app-header">
        <a className="brand" href="#map" onClick={() => setView("map")}>
          <ScooterIcon />
          <span>
            СамоКеттик<small>{app.config?.city ?? t.city}</small>
          </span>
        </a>
        <nav
          aria-label={
            locale === "ru" ? "Основная навигация" : "Негизги навигация"
          }
        >
          {(["map", "trips", "invoices"] as const).map((tab) => (
            <button
              type="button"
              key={tab}
              aria-current={view === tab ? "page" : undefined}
              onClick={() => setView(tab)}
            >
              {t[tab]}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="locale-button"
            type="button"
            aria-label={locale === "ru" ? "Кыргызча" : "Русский"}
            onClick={() => setLocale(locale === "ru" ? "ky" : "ru")}
          >
            {locale === "ru" ? "КЫР" : "РУС"}
          </button>
          {app.session ? (
            <button
              className="notice-button"
              type="button"
              onClick={() => setNoticesOpen(true)}
              aria-label={`${t.notifications}: ${notifications.length}`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Z" />
                <path d="M10 20h4" />
              </svg>
              <span>{notifications.length}</span>
            </button>
          ) : null}
          <button
            className="account-button"
            aria-label={profile ? `${t.demo}: ${profile.label}` : t.signIn}
            type="button"
            onClick={() => setLoginOpen(true)}
            disabled={app.busy}
          >
            {profile ? (
              <span className="avatar" aria-hidden="true">
                {profile.label[0]}
              </span>
            ) : null}
            <span>{profile ? `${t.demo}: ${profile.label}` : t.signIn}</span>
            <span aria-hidden="true">⌄</span>
          </button>
        </div>
      </header>
      <div className="connection-strip" role="status" aria-live="polite">
        {app.offline ? (
          <span className="connection-warning">{t.offline}</span>
        ) : app.connection !== "connected" ? (
          <span className="connection-warning">{t.reconnect}</span>
        ) : (
          <span className="connection-ok">
            {t.online}
            {app.fleet ? (
              <span className="sync-time" aria-hidden="true">
                {" "}
                ·{" "}
                {new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "ky-KG", {
                  timeZone: "Asia/Bishkek",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(new Date(app.fleet.serverTime))}
              </span>
            ) : null}
          </span>
        )}
        {app.connection !== "connected" || app.offline ? (
          <button type="button" onClick={app.refresh} disabled={app.offline}>
            {t.retry}
          </button>
        ) : null}
      </div>
      {app.error || (app.pending && !app.busy) ? (
        <div className="action-notice" role="alert">
          <div>
            <strong>
              {app.error
                ? errorText(locale, app.error.code, app.error.message)
                : t.savedRequest}
            </strong>
            {app.pending ? <p>{t.pending}</p> : null}
            {app.error?.requestId ? (
              <small>requestId: {app.error.requestId}</small>
            ) : null}
          </div>
          {app.pending ? (
            <div className="notice-actions">
              <button
                type="button"
                className="secondary"
                onClick={app.retryCommand}
                disabled={app.busy || !app.ready}
              >
                {app.busy ? t.working : t.networkRetry}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={app.refresh}
              >
                {t.checkState}
              </button>
            </div>
          ) : (
            <button
              className="icon-button"
              type="button"
              aria-label={t.close}
              onClick={app.clearError}
            >
              ×
            </button>
          )}
        </div>
      ) : null}
      {app.fatal ? (
        <main className="startup-state" role="alert">
          <h1>{t.error}</h1>
          <button className="primary" type="button" onClick={app.reload}>
            {t.retry}
          </button>
        </main>
      ) : !app.config || !app.zone || !app.fleet ? (
        <main className="startup-state" role="status">
          <span className="loading-ring" />
          <p>{t.loading}</p>
        </main>
      ) : view === "map" ? (
        <main className="map-workspace">
          <TransportMap
            fleet={app.fleet}
            zone={app.zone}
            config={app.config}
            selectedId={selected?.id ?? null}
            activeId={activeId}
            onSelect={select}
            locale={locale}
            fitRequest={fitRequest}
          />
          <button
            className="list-toggle"
            type="button"
            onClick={() => setListOpen(true)}
          >
            {t.allScooters} · {app.fleet.items.length}
          </button>
          {activeId ? (
            <button
              className="locate-toggle"
              type="button"
              onClick={() => select(activeId)}
            >
              {t.locate}
            </button>
          ) : null}
          <RentalPanel
            app={app}
            vehicle={selected}
            locale={locale}
            onClose={() => setSelectedId(null)}
            onLogin={() => setLoginOpen(true)}
          />
        </main>
      ) : (
        <History
          key={`history:${app.session?.profile ?? "guest"}`}
          app={app}
          view={view}
          locale={locale}
          onLogin={() => setLoginOpen(true)}
        />
      )}
      {app.session && app.sync ? (
        <ServerNotice
          key={`notice:${app.session.profile}`}
          profile={app.session.profile}
          notifications={notifications}
          locale={locale}
          activeRentalId={
            app.sync.current.trip?.id ??
            app.sync.current.reservation?.id ??
            null
          }
        />
      ) : null}
      {loginOpen ? (
        <Modal
          title={t.demoLabel}
          locale={locale}
          onClose={() => setLoginOpen(false)}
          busy={app.busy}
        >
          <p className="modal-description">{t.demoInfo}</p>
          {app.error ? (
            <p className="inline-error" role="alert">
              {errorText(locale, app.error.code, app.error.message)}
            </p>
          ) : null}
          {app.config?.demoBrowserEnabled ? (
            <div className="profile-options">
              {app.config.profiles.map((item) => (
                <button
                  type="button"
                  className={`profile-option${app.session?.profile === item.id ? " selected" : ""}`}
                  key={item.id}
                  disabled={app.busy}
                  onClick={() => {
                    void app.login(item.id);
                  }}
                >
                  <span className="avatar">{item.label[0]}</span>
                  <span>{item.label}</span>
                  <small>{t.demo}</small>
                </button>
              ))}
            </div>
          ) : (
            <p role="status">{t.loginDisabled}</p>
          )}
          {app.session ? (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                app.leave();
                setLoginOpen(false);
              }}
              disabled={app.busy}
            >
              {t.guest}
            </button>
          ) : null}
        </Modal>
      ) : null}
      {listOpen && app.fleet ? (
        <Modal
          title={t.allScooters}
          locale={locale}
          onClose={() => setListOpen(false)}
        >
          <label className="search-label">
            {t.search}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SK-005"
            />
          </label>
          <label className="free-filter">
            <input
              type="checkbox"
              checked={onlyFree}
              onChange={(e) => setOnlyFree(e.target.checked)}
            />
            {t.free}
          </label>
          <div className="vehicle-list">
            {app.fleet.items
              .filter(
                (v) =>
                  (!onlyFree || v.status === "available") &&
                  v.publicCode.toLowerCase().includes(search.toLowerCase()),
              )
              .map((v) => (
                <button
                  className="vehicle-list-row"
                  type="button"
                  key={v.id}
                  onClick={() => select(v.id)}
                >
                  <ScooterIcon />
                  <span>
                    <strong>{v.publicCode}</strong>
                    <small>{t[v.status]}</small>
                  </span>
                  <span>{Math.floor(v.batteryBp / 100)}%</span>
                </button>
              ))}
          </div>
        </Modal>
      ) : null}
      {noticesOpen ? (
        <Modal
          title={t.notifications}
          locale={locale}
          onClose={() => setNoticesOpen(false)}
        >
          {notifications.length ? (
            <ol className="notification-list">
              {notifications.map((n) => (
                <li key={n.id}>
                  <p>{noticeLabel(n.code, n.reason)}</p>
                  <time dateTime={n.createdAt}>
                    {dateTime(n.createdAt, locale)}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p>{t.noNotifications}</p>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
