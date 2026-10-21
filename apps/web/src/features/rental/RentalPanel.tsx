import { useState } from "react";
import type { VehicleList } from "@samokettik/contracts";
import type { RentalApp } from "../../state/useRentalApp";
import { text, type Locale } from "../../i18n/text";
import { duration, money } from "../../ui/format";
import { useServerClock } from "../../ui/useServerClock";
import { ScooterDrawing } from "../../ui/icons";
import { Modal } from "../../ui/Modal";
import "./rental.scss";
export function RentalPanel({
  app,
  vehicle,
  locale,
  onClose,
  onLogin,
}: {
  app: RentalApp;
  vehicle: VehicleList["items"][number] | null;
  locale: Locale;
  onClose: () => void;
  onLogin: () => void;
}) {
  const t = text(locale),
    [confirm, setConfirm] = useState(false),
    current = app.sync?.current,
    trip =
      current?.trip && current.trip.vehicleId === vehicle?.id
        ? current.trip
        : null,
    reservation =
      current?.reservation && current.reservation.vehicleId === vehicle?.id
        ? current.reservation
        : null;
  const clock = useServerClock(app.sync?.serverTime ?? app.fleet?.serverTime);
  if (!vehicle && !trip && !reservation)
    return (
      <aside className="rental-panel empty-selection">
        <h1>{t.noSelected}</h1>
        <p>{t.selectHint}</p>
      </aside>
    );
  const own = Boolean(trip || reservation),
    anotherRental = !own && Boolean(current?.trip || current?.reservation),
    disabled = app.busy || !app.ready || Boolean(app.pending),
    config = app.config;
  const serverVehicle = own
    ? app.fleet?.items.find(
        (v) => v.id === (trip?.vehicleId ?? reservation?.vehicleId),
      )
    : vehicle;
  const remaining = reservation
    ? Math.max(0, Date.parse(reservation.expiresAt) - clock.now)
    : 0;
  const warning =
    reservation &&
    app.sync?.notifications.items.some(
      (n) => n.rentalId === reservation.id && n.code === "RESERVATION_EXPIRING",
    );
  return (
    <aside
      className={`rental-panel${own ? " own-rental" : ""}`}
      aria-label={own ? (trip ? t.active : t.booking) : t.selected}
    >
      <div className="panel-caption">
        <span>{trip ? t.active : reservation ? t.booking : t.selected}</span>
        {!own ? (
          <button
            className="icon-button"
            type="button"
            aria-label={t.close}
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
      </div>
      <p className="eyebrow">{t.scooter}</p>
      <div className="vehicle-title">
        <h1>{serverVehicle?.publicCode ?? "—"}</h1>
        <span
          className={`vehicle-state ${trip ? "in_ride" : reservation ? "reserved" : (serverVehicle?.status ?? "")}`}
        >
          {trip
            ? t[trip.state === "paused" ? "paused" : "riding"]
            : reservation
              ? t.reserved
              : serverVehicle
                ? t[serverVehicle.status]
                : ""}
        </span>
      </div>
      {!own ? (
        <div className="vehicle-drawing">
          <ScooterDrawing />
        </div>
      ) : null}
      {reservation ? (
        <div className={`booking-clock${warning ? " warning" : ""}`}>
          <span>{t.remains}</span>
          <strong data-testid="booking-timer">
            {remaining > 0
              ? duration(Math.ceil(remaining / 1000) * 1000)
              : t.checkExpiry}
          </strong>
          {warning ? <p role="status">{t.warning}</p> : null}
        </div>
      ) : null}
      {trip ? (
        <>
          <div className="trip-cost">
            <span>{t.cost}</span>
            <strong data-testid="trip-cost">
              {money(trip.totalMinor, locale)} <small>{t.currency}</small>
            </strong>
          </div>
          <dl className="trip-times">
            <div>
              <dt>{t.activeTime}</dt>
              <dd>
                {duration(
                  BigInt(trip.activeMilliseconds) +
                    (trip.state === "riding"
                      ? BigInt(clock.elapsedSinceSnapshot)
                      : 0n) +
                    "",
                )}
              </dd>
            </div>
            <div>
              <dt>{t.pauseTime}</dt>
              <dd>
                {duration(
                  BigInt(trip.pausedMilliseconds) +
                    (trip.state === "paused"
                      ? BigInt(clock.elapsedSinceSnapshot)
                      : 0n) +
                    "",
                )}
              </dd>
            </div>
          </dl>
        </>
      ) : null}
      <dl className="vehicle-facts">
        <div>
          <dt>{t.battery}</dt>
          <dd>
            {serverVehicle ? Math.floor(serverVehicle.batteryBp / 100) : "—"}
            <small> %</small>
          </dd>
        </div>
        <div>
          <dt>{t.fare}</dt>
          <dd>
            {money(
              trip?.rideRateMinorPerMinute ??
                config?.rideRateMinorPerMinute ??
                0,
              locale,
            )}{" "}
            <small>
              {t.currency}/{t.minute}
            </small>
          </dd>
        </div>
      </dl>
      <div className="pause-fare">
        <span>{t.pauseFare}</span>
        <span>
          {money(
            trip?.pauseRateMinorPerMinute ??
              config?.pauseRateMinorPerMinute ??
              0,
            locale,
          )}{" "}
          {t.currency}/{t.minute}
        </span>
      </div>
      {!own && serverVehicle?.status !== "available" ? (
        <p className="availability-message">
          {serverVehicle?.unavailableReason === "BATTERY_TOO_LOW"
            ? t.lowBattery
            : serverVehicle?.unavailableReason === "MAINTENANCE"
              ? t.maintenance
              : t.occupied}
        </p>
      ) : null}
      {anotherRental ? (
        <p className="availability-message">{t.anotherRental}</p>
      ) : null}
      {!own ? (
        app.session ? (
          <>
            <button
              className="primary"
              aria-busy={app.busy}
              type="button"
              disabled={
                disabled ||
                anotherRental ||
                serverVehicle?.status !== "available"
              }
              onClick={() => {
                if (serverVehicle)
                  app.command(
                    "/api/v1/reservations",
                    { vehicleId: serverVehicle.id },
                    "reservation",
                  );
              }}
            >
              {`${t.book} · ${(config?.reservationDurationSeconds ?? 0) / 60} ${t.minute}`}
            </button>
            <p className="fine-print">{t.freeBooking}</p>
          </>
        ) : (
          <button
            className="primary"
            type="button"
            onClick={onLogin}
            disabled={!app.ready}
          >
            {t.signIn}
          </button>
        )
      ) : null}
      {reservation ? (
        <div className="rental-actions">
          <button
            className="primary"
            aria-busy={app.busy}
            type="button"
            disabled={disabled || remaining <= 0}
            onClick={() =>
              app.command(`/api/v1/trips/${reservation.id}/start`, {}, "trip")
            }
          >
            {t.start}
          </button>
          <button
            className="secondary"
            type="button"
            disabled={disabled}
            onClick={() =>
              app.command(
                `/api/v1/reservations/${reservation.id}/cancel`,
                {},
                "reservation",
              )
            }
          >
            {t.cancel}
          </button>
        </div>
      ) : null}
      {trip ? (
        <>
          <div className="rental-actions">
            <button
              className="primary"
              aria-busy={app.busy}
              type="button"
              disabled={disabled}
              onClick={() =>
                app.command(
                  `/api/v1/trips/${trip.id}/${trip.state === "paused" ? "resume" : "pause"}`,
                  {},
                  "trip",
                )
              }
            >
              {trip.state === "paused" ? t.resume : t.pause}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={disabled}
              onClick={() => setConfirm(true)}
            >
              {t.finish}
            </button>
          </div>
          <p className="fine-print">{t.rounding}</p>
        </>
      ) : null}
      {confirm && trip ? (
        <Modal
          title={t.finishQuestion}
          locale={locale}
          onClose={() => setConfirm(false)}
        >
          <p>{t.finishInfo}</p>
          <p className="confirm-cost">
            {t.cost}:{" "}
            <strong>
              {money(trip.totalMinor, locale)} {t.currency}
            </strong>
          </p>
          <button
            className="primary"
            type="button"
            disabled={disabled}
            onClick={() => {
              app.command(`/api/v1/trips/${trip.id}/finish`, {}, "trip");
              setConfirm(false);
            }}
          >
            {t.finishConfirm}
          </button>
        </Modal>
      ) : null}
    </aside>
  );
}
