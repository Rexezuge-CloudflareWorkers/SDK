import type { CSSProperties } from 'react';

/**
 * Design tokens for the inline-styled parts of the SPA.
 *
 * ## Provenance
 *
 * Verbatim from `apps/web/src/components/ui/theme.ts` in **AWS-AccessBridge**,
 * which is the only repo of the eight that styled its primitives with inline
 * styles rather than Tailwind classes. It wins by default: nothing else in the
 * family carries a token table, and the six Tailwind repos encode the same
 * decisions as CSS custom properties (`--color-accent`, `--color-surface-1`, …)
 * in their `globals.css` instead of in TypeScript.
 *
 * So this file serves two audiences:
 *
 * - Consumers that render the class-based primitives (`Button`, `Card`, `Input`,
 *   `Badge`, `Pagination`) need nothing from here — those components carry
 *   Tailwind classes that read the CSS variables their `globals.css` defines.
 * - Consumers with bespoke, non-Tailwind surfaces (AWS-AccessBridge's admin
 *   tables and its `LoadingButton` chrome) use these tokens directly.
 *
 * The two are deliberately not unified: collapsing them would either push hex
 * values into the class-based components or force every Tailwind consumer to
 * declare a TypeScript mirror of their theme. Neither repo family does that
 * today, and a token that exists in two places is a token that drifts.
 */

/**
 * The palette. One flat record so a consumer can spread it into a CSS-in-JS
 * theme or read `theme.accent`-style names without a nested lookup.
 */
const theme = {
  cardBg: '#1e2433',
  inputBg: '#252d3d',
  border: '#374151',
  blue: '#2563eb',
  blueHover: '#1d4ed8',
  green: '#16a34a',
  greenHover: '#15803d',
  red: '#dc2626',
  redHover: '#b91c1c',
  spinnerBlue: '#60a5fa',
  /**
  The border colour a focused field paints.
  */
  focusBorder: '#3b82f6',
} as const;

/**
 * Background/hover pairs for the solid action colours.
 *
 * Keyed by colour name rather than by the kit's `Button` variants because a
 * plain colour table is what a bespoke button needs; `Button` maps its
 * normalized variants onto its own classes.
 */
const buttonColors: Record<string, { bg: string; hover: string }> = {
  blue: { bg: theme.blue, hover: theme.blueHover },
  green: { bg: theme.green, hover: theme.greenHover },
  red: { bg: theme.red, hover: theme.redHover },
};

/**
The standard content card surface.
*/
const cardStyle: CSSProperties = {
  background: theme.cardBg,
  borderRadius: '12px',
  padding: '24px',
};

/**
The standard text field surface.
*/
const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px',
  background: theme.inputBg,
  borderRadius: '8px',
  border: `1px solid ${theme.border}`,
  color: '#ffffff',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

/**
A card whose content is a table: the table supplies its own padding.
*/
const tableCardStyle: CSSProperties = {
  background: theme.cardBg,
  borderRadius: '12px',
  overflow: 'hidden',
};

/**
Column header cell.
*/
const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '12px',
  background: theme.inputBg,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontSize: '12px',
  fontWeight: 500,
};

/**
Body cell.
*/
const tdStyle: CSSProperties = {
  padding: '12px',
  borderTop: '1px solid rgba(55,65,81,0.3)',
};

/**
A pager control, as used by `Pagination`'s inline-styled consumers.
*/
const paginationBtnStyle: CSSProperties = {
  padding: '6px 12px',
  background: theme.inputBg,
  border: 'none',
  borderRadius: '8px',
  color: 'white',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

/**
 * Shared geometry for the solid action buttons: `btnBlueStyle`, `btnGreenStyle`
 * and the small variant each spread it and override only what differs, so a
 * change to the radius or weight lands in all of them at once.
 */
const btnBase: CSSProperties = {
  padding: '10px 20px',
  borderRadius: '8px',
  color: 'white',
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

const btnBlueStyle: CSSProperties = { ...btnBase, background: theme.blue };
const btnGreenStyle: CSSProperties = { ...btnBase, background: theme.green };

/**
The dense action button used in table rows.
*/
const btnSmallStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  color: 'white',
  fontWeight: 500,
  fontSize: '13px',
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

export {
  btnBase,
  btnBlueStyle,
  btnGreenStyle,
  btnSmallStyle,
  buttonColors,
  cardStyle,
  inputStyle,
  paginationBtnStyle,
  tableCardStyle,
  tdStyle,
  theme,
  thStyle,
};
