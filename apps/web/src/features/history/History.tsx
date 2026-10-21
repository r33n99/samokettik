import { useState } from "react";
import { TripHistorySchema, InvoiceHistorySchema, type Invoice } from "@samokettik/contracts";
import type { RentalApp } from "../../state/useRentalApp";
import { text, errorText, type Locale } from "../../i18n/text";
import { dateTime, duration, money } from "../../ui/format";
import { Modal } from "../../ui/Modal";
import { useHistoryPage } from "./useHistoryPage";
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
  const refreshKey = `${app.connection}:${app.sync?.invoices.items.map((i) => `${i.id}:${i.status}`).join(",") ?? ""}`;
  const trips = useHistoryPage("/api/v1/trips", TripHistorySchema, app.session?.token, view === "trips", refreshKey);
  const bills = useHistoryPage("/api/v1/invoices", InvoiceHistorySchema, app.session?.token, view === "invoices", refreshKey);
  const page = view === "trips" ? trips : bills;
  const pageInvoices = view === "trips" ? trips.data?.items.flatMap((item) => item.invoice ? [item.invoice] : []) : bills.data?.items;
  const invoice = selected
    ? (pageInvoices?.find((i) => i.id === selected.id) ?? app.sync?.invoices.items.find((i) => i.id === selected.id) ?? selected)
    : null;
  return (
    <section className="history-page">
      <div className="history-heading">
        <h1>{view === "trips" ? t.trips : t.invoices}</h1>
        {app.session ? <p>{t.page} {page.page}</p> : null}
      </div>
      {!app.session ? (
        <div className="empty-history">
          <p>{t.loginHistory}</p>
          <button className="primary" type="button" onClick={onLogin}>
            {t.signIn}
          </button>
        </div>
      ) : page.error ? (
        <div role="alert">
          <p>{t.error}</p>
          <button className="secondary" onClick={page.reload} disabled={app.offline}>
            {t.retry}
          </button>
        </div>
      ) : !app.sync || !page.data ? (
        <p role="status">{t.loading}</p>
      ) : view === "trips" ? (
        trips.data?.items.length ? (
          <div className="history-list" aria-busy={page.loading}>
            {trips.data.items.map(({ trip, invoice }) => (
              <article className="history-entry" key={trip.id} data-trip-id={trip.id}>
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
                      disabled={page.loading}
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
      ) : bills.data?.items.length ? (
        <div className="history-list" aria-busy={page.loading}>
          {bills.data.items.map((item) => (
            <article className="history-entry invoice-entry" key={item.id} data-invoice-id={item.id}>
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
                  disabled={page.loading}
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
      {app.session && page.data ? (
        <nav className="history-pagination" aria-label={t.pagination}>
          <button type="button" className="secondary" onClick={page.previous} disabled={page.page === 1 || page.loading || app.offline}>
            {t.previousPage}
          </button>
          <span role="status" aria-live="polite">{page.loading ? t.loading : `${t.page} ${page.page}`}</span>
          <button type="button" className="secondary" onClick={() => { if (page.data?.nextCursor) page.next(page.data.nextCursor); }} disabled={!page.data.nextCursor || page.loading || page.error || app.offline}>
            {t.nextPage}
          </button>
        </nav>
      ) : null}
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
