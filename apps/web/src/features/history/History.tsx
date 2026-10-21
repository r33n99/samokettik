import { useState } from "react";
import type { Invoice } from "@samokettik/contracts";
import type { RentalApp } from "../../state/useRentalApp";
import { text, errorText, type Locale } from "../../i18n/text";
import { dateTime, duration, money } from "../../ui/format";
import { Modal } from "../../ui/Modal";
import "./history.scss";
export function History({
  app,
  view,
  locale,
  onLogin,
}: {
  app: RentalApp;
  view: "trips" | "invoices";
  locale: Locale;
  onLogin: () => void;
}) {
  const t = text(locale),
    [selected, setSelected] = useState<Invoice | null>(null);
  const invoice = selected
    ? (app.sync?.invoices.items.find((i) => i.id === selected.id) ?? selected)
    : null;
  return (
    <section className="history-page">
      <div className="history-heading">
        <h1>{view === "trips" ? t.trips : t.invoices}</h1>
        {app.session ? <p>{t.historyLimit}</p> : null}
      </div>
      {!app.session ? (
        <div className="empty-history">
          <p>{t.loginHistory}</p>
          <button className="primary" type="button" onClick={onLogin}>
            {t.signIn}
          </button>
        </div>
      ) : view === "trips" && app.historyError ? (
        <div role="alert">
          <p>{t.error}</p>
          <button className="secondary" onClick={app.refresh}>
            {t.retry}
          </button>
        </div>
      ) : !app.sync || (view === "trips" && !app.history) ? (
        <p role="status">{t.loading}</p>
      ) : view === "trips" ? (
        app.history?.items.length ? (
          <div className="history-list">
            {app.history.items.map(({ trip, invoice }) => (
              <article className="history-entry" key={trip.id}>
                <div>
                  <p className="entry-date">
                    {dateTime(trip.endedAt ?? trip.startedAt, locale)}
                  </p>
                  <h2>
                    {app.fleet?.items.find((v) => v.id === trip.vehicleId)
                      ?.publicCode ?? t.scooter}
                  </h2>
                  <p className="entry-meta">
                    {trip.endReason === "battery_depleted"
                      ? t.autoFinished
                      : t.manualFinished}
                  </p>
                </div>
                <dl>
                  <div>
                    <dt>{t.activeTime}</dt>
                    <dd>{duration(trip.activeMilliseconds)}</dd>
                  </div>
                  <div>
                    <dt>{t.pauseTime}</dt>
                    <dd>{duration(trip.pausedMilliseconds)}</dd>
                  </div>
                </dl>
                <div className="entry-price">
                  <strong>
                    {money(trip.totalMinor, locale)} {t.currency}
                  </strong>
                  {invoice ? (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => setSelected(invoice)}
                    >
                      {t.detail}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-history">{t.emptyTrips}</p>
        )
      ) : app.sync.invoices.items.length ? (
        <div className="history-list">
          {app.sync.invoices.items.map((item) => (
            <article className="history-entry invoice-entry" key={item.id}>
              <div>
                <p className="entry-date">{dateTime(item.createdAt, locale)}</p>
                <h2>{item.id.slice(0, 8)}</h2>
                <p className={`payment-state ${item.status}`}>
                  {t[item.status]}
                </p>
              </div>
              <div className="entry-price">
                <strong>
                  {money(item.totalMinor, locale)} {t.currency}
                </strong>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setSelected(item)}
                >
                  {item.status === "unpaid" ? t.pay : t.detail}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-history">{t.emptyInvoices}</p>
      )}
      {invoice ? (
        <Modal
          title={t.details}
          locale={locale}
          onClose={() => setSelected(null)}
          busy={app.busy}
        >
          <p className="invoice-id">{invoice.id}</p>
          <p className="entry-date">
            {t.issued}: {dateTime(invoice.createdAt, locale)}
          </p>
          <dl className="invoice-breakdown">
            <div>
              <dt>
                {t.activeTime} · {invoice.activeMinutes} {t.minute}
              </dt>
              <dd>
                {money(
                  BigInt(invoice.activeMinutes) *
                    BigInt(invoice.rideRateMinorPerMinute) +
                    "",
                  locale,
                )}{" "}
                {t.currency}
              </dd>
            </div>
            <div>
              <dt>
                {t.pauseTime} · {invoice.pausedMinutes} {t.minute}
              </dt>
              <dd>
                {money(
                  BigInt(invoice.pausedMinutes) *
                    BigInt(invoice.pauseRateMinorPerMinute) +
                    "",
                  locale,
                )}{" "}
                {t.currency}
              </dd>
            </div>
            <div className="invoice-total">
              <dt>{t.total}</dt>
              <dd>
                {money(invoice.totalMinor, locale)} {t.currency}
              </dd>
            </div>
          </dl>
          <p className={`payment-state ${invoice.status}`}>
            {t[invoice.status]}
          </p>
          {app.error ? (
            <p className="inline-error" role="alert">
              {errorText(locale, app.error.code, app.error.message)}
            </p>
          ) : null}
          {app.pending && !app.busy ? (
            <button
              className="secondary"
              type="button"
              onClick={app.retryCommand}
              disabled={!app.ready}
            >
              {t.networkRetry}
            </button>
          ) : null}
          {invoice.status === "unpaid" ? (
            <>
              <button
                type="button"
                className="primary"
                disabled={app.busy || !app.ready || Boolean(app.pending)}
                onClick={() =>
                  app.command(
                    `/api/v1/invoices/${invoice.id}/pay-demo`,
                    {},
                    "payment",
                  )
                }
              >
                {app.busy ? t.working : t.pay}
              </button>
              <button
                className="text-button"
                type="button"
                disabled={app.busy || !app.ready || Boolean(app.pending)}
                onClick={() =>
                  app.command(
                    `/api/v1/invoices/${invoice.id}/pay-demo`,
                    { outcome: "declined" },
                    "payment",
                  )
                }
              >
                {t.paymentDecline}
              </button>
              <p className="fine-print">{t.paymentInfo}</p>
            </>
          ) : null}
        </Modal>
      ) : null}
    </section>
  );
}
