import type { Locale } from "../i18n/text.js";
export function money(minor: string | number, locale: Locale) {
  const value = BigInt(minor),
    whole = value / 100n,
    fraction = value % 100n;
  return (
    new Intl.NumberFormat(locale === "ky" ? "ky-KG" : "ru-RU").format(whole) +
    (fraction === 0n ? "" : `,${fraction.toString().padStart(2, "0")}`)
  );
}
export function duration(milliseconds: string | number) {
  const seconds = BigInt(milliseconds) / 1000n;
  return `${seconds / 60n}:${(seconds % 60n).toString().padStart(2, "0")}`;
}
export function dateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ky" ? "ky-KG" : "ru-RU", {
    timeZone: "Asia/Bishkek",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
