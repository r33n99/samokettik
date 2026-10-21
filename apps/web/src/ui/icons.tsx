export const scooterMarkup =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M5 18h9l3-4-3-10h-4m4 0h3M17 14l2 4"/></svg>';
export function ScooterIcon() {
  return (
    <span
      className="scooter-icon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: scooterMarkup }}
    />
  );
}
export function ScooterDrawing() {
  return (
    <svg viewBox="0 0 240 140" fill="none" aria-hidden="true">
      <ellipse cx="119" cy="125" rx="105" ry="4" fill="#20252210" />
      <circle cx="36" cy="108" r="17" fill="#252e29" />
      <circle cx="36" cy="108" r="7" fill="#c7d0c5" />
      <circle cx="202" cy="108" r="17" fill="#252e29" />
      <circle cx="202" cy="108" r="7" fill="#c7d0c5" />
      <path
        d="M35 108h112l27-34"
        stroke="#455149"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <path d="M174 74l-13-58" stroke="#ae4a30" strokeWidth="9" />
      <path
        d="M165 33l-4-17h-25"
        stroke="#252e29"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M174 74l28 34" stroke="#455149" strokeWidth="6" />
      <path d="M50 101h81" stroke="#ae4a30" strokeWidth="8" />
    </svg>
  );
}
