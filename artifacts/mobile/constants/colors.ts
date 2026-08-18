/**
 * Semantic design tokens for ShipKit Mobile.
 *
 * Derived from the sibling web dashboard (artifacts/pipeline-dashboard/src/index.css)
 * which enforces a dark-mode base. HSL tokens were converted to hex so both
 * artifacts share the same visual identity. The app is always dark, so the
 * `light` and `dark` palettes are intentionally identical.
 */

const palette = {
  // Legacy aliases (kept for backward compatibility)
  text: "#f8fafc",
  tint: "#22d3ee",

  // Core surfaces
  background: "#070b14",
  foreground: "#f8fafc",

  // Cards / elevated surfaces
  card: "#0c1322",
  cardForeground: "#f8fafc",

  // Primary action color (cyan)
  primary: "#22d3ee",
  primaryForeground: "#070b14",

  // Secondary / less-emphasis interactive surfaces
  secondary: "#1b2435",
  secondaryForeground: "#f8fafc",

  // Muted / subdued elements (dividers, timestamps, placeholders)
  muted: "#1b2435",
  mutedForeground: "#94a3b8",

  // Accent highlights
  accent: "#1b2435",
  accentForeground: "#f8fafc",

  // Destructive actions / error states
  destructive: "#ef4444",
  destructiveForeground: "#f8fafc",

  // Borders and input outlines
  border: "#1e293b",
  input: "#1e293b",

  // Status colors (pipeline run / stage states)
  success: "#22c55e",
  running: "#22d3ee",
  failed: "#ef4444",
  pending: "#94a3b8",
  cancelled: "#64748b",
  skipped: "#475569",
  warn: "#f59e0b",
};

const colors = {
  light: palette,
  dark: palette,

  // Border radius (in px). Sync from the sibling web artifact's --radius.
  radius: 12,
};

export default colors;
