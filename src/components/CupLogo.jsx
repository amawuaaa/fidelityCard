/**
 * Taza CupTrack (misma forma que public/favicon.svg).
 * Usa currentColor → hereda text-brand / color del café.
 */
export default function CupLogo({
  className = "size-5",
  title = "CupTrack",
  decorative = false,
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
    >
      <ellipse
        cx="30"
        cy="54"
        rx="18"
        ry="4"
        fill="currentColor"
        opacity="0.25"
      />
      <path
        d="M14 18h28c1.1 0 2 .9 2 2v18c0 7.7-6.3 14-14 14s-14-6.3-14-14V20c0-1.1.9-2 2-2z"
        fill="currentColor"
      />
      <ellipse
        cx="28"
        cy="22"
        rx="12"
        ry="4"
        fill="currentColor"
        opacity="0.55"
      />
      <path
        d="M44 24h4c4.4 0 8 3.6 8 8s-3.6 8-8 8h-4"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M22 12c0-2 2-3 2-5s-2-3-2-5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M28 11c0-2 2-3 2-5s-2-3-2-5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M34 12c0-2 2-3 2-5s-2-3-2-5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
