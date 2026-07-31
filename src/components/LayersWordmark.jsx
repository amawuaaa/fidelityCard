import { RAINBOW_COLORS } from "../config/theme.js";

/**
 * "the LAYERS" con cada letra de un color (como el logo).
 */
export default function LayersWordmark({ className = "" }) {
  const letters = "LAYERS".split("");

  return (
    <span className={["inline-flex items-baseline", className].join(" ")}>
      <span className="mr-1.5 text-sm font-bold tracking-normal text-stone-400">
        the
      </span>
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
