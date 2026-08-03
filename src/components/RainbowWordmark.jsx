import { RAINBOW_COLORS } from "../config/theme.js";

/**
 * Wordmark con cada letra de un color (demo tema rainbow).
 */
export default function RainbowWordmark({
  text = "PRISM",
  prefix = "",
  className = "",
}) {
  const letters = String(text).split("");

  return (
    <span className={["inline-flex items-baseline", className].join(" ")}>
      {prefix ? (
        <span className="mr-1.5 text-sm font-bold tracking-normal text-stone-400">
          {prefix}
        </span>
      ) : null}
      <span className="inline-flex tracking-[0.08em]">
        {letters.map((letter, i) => (
          <span
            key={`${letter}-${i}`}
            style={{ color: RAINBOW_COLORS[i % RAINBOW_COLORS.length] }}
            className="font-extrabold"
          >
            {letter}
          </span>
        ))}
      </span>
    </span>
  );
}
