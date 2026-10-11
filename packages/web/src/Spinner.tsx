import type { CSSProperties } from 'react';
import { theme } from './theme';

/**
 * The loading ring.
 *
 * ## Provenance
 *
 * `components/ui/Spinner.tsx` in **AWS-AccessBridge** — the only named spinner
 * in the family. The other repos inline the same ring into their buttons as a
 * `Loader2` icon from `lucide-react`, which the kit does not depend on, so this
 * component *is* the kit's spinner vocabulary: `Button` and `LoadingButton`
 * render it while busy.
 *
 * The ring is a bordered circle with one transparent edge, animated by
 * Tailwind's `animate-spin` (present in every consuming app's stylesheet).
 */

interface SpinnerProps {
  /** Diameter in pixels. */
  size?: number;
  /** Border colour; `currentColor` inherits from the surrounding text. */
  color?: string;
  /** Optional caption under the ring. */
  label?: string;
  /** Padding around the whole block, as a CSS shorthand. */
  padding?: string;
  /** Extra styles for the outer wrapper. */
  style?: CSSProperties;
}

function Spinner({ size = 24, color = theme.spinnerBlue, label, padding = '16px 0', style }: Readonly<SpinnerProps>): React.JSX.Element {
  return (
    <div style={{ textAlign: 'center', padding, ...style }}>
      <div
        className="animate-spin"
        aria-hidden="true"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          border: `2px solid ${color}`,
          borderTopColor: 'transparent',
          margin: '0 auto',
        }}
      />
      {label ? <p style={{ color: '#9ca3af', marginTop: '12px' }}>{label}</p> : null}
    </div>
  );
}

export { Spinner };
export type { SpinnerProps };
