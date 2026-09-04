// Sequential blue ramp (light -> dark), matching the validated dataviz palette's
// step-100..700 sequential hue. Darker = higher affordability share.
/**
 * Sequential ramp in the partners' azure family (Chicago Growth Project's
 * #00abe5 hue). Verified monotone light→dark with every adjacent lightness gap
 * >= 0.06, so the steps stay distinguishable.
 */
export const SEQUENTIAL_BLUE = [
  "#e2f4fc",
  "#b3e2f6",
  "#7cccef",
  "#3fb2e3",
  "#0d96c9",
  "#00718f",
  "#004a63",
];

export const NO_DATA_COLOR = "#e4e9eb";

// Diverging poles from the reference palette (blue = improved, red = worsened),
// gray = ~flat. Magnitude is encoded as opacity rather than invented intermediate
// hex steps, since only the poles + neutral midpoint are documented.
/** Azure improves / coral worsens — one pole per partner palette. */
export const DIVERGING_POSITIVE = "#0d96c9";
export const DIVERGING_NEGATIVE = "#d85a42";
export const DIVERGING_NEUTRAL = "#c3cbcf";

/**
 * Fixed (absolute) breaks, deliberately NOT quantile.
 * Quantile breaks are rank-based, so they would re-scale on every toggle and make
 * 60% AMI and 100% AMI look nearly identical — hiding the fact that ~2.6x more
 * listings clear the 100% AMI bar. Fixed breaks keep every view on one scale, so
 * switching year / threshold / listing type shows a real shift in color.
 */
export const FIXED_BREAKS = [5, 10, 20, 30, 45, 60];

export const FIXED_BREAK_LABELS = [
  "0–5%",
  "5–10%",
  "10–20%",
  "20–30%",
  "30–45%",
  "45–60%",
  "60%+",
];

export function sequentialColor(value: number | null, breaks: number[]): string {
  if (value == null) return NO_DATA_COLOR;
  let bin = 0;
  while (bin < breaks.length && value > breaks[bin]) bin++;
  return SEQUENTIAL_BLUE[Math.min(bin, SEQUENTIAL_BLUE.length - 1)];
}

// value is a percentage-point delta (e.g. +4.2 means +4.2pp affordable).
export function divergingColor(value: number | null, maxAbs: number): { fill: string; opacity: number } {
  if (value == null) return { fill: NO_DATA_COLOR, opacity: 1 };
  if (Math.abs(value) < 0.05) return { fill: DIVERGING_NEUTRAL, opacity: 0.5 };
  const magnitude = maxAbs > 0 ? Math.min(Math.abs(value) / maxAbs, 1) : 0;
  const opacity = 0.35 + magnitude * 0.65;
  return { fill: value > 0 ? DIVERGING_POSITIVE : DIVERGING_NEGATIVE, opacity };
}
