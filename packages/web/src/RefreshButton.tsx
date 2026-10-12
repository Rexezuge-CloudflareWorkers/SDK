import { RefreshCw } from 'lucide-react';
import { Button } from './Button.tsx';

/**
 * The refresh control.
 *
 * ## Provenance
 *
 * `components/shared/RefreshButton.tsx` in **Durable-DAV**, **Durable-DAV-Router**,
 * **Edge-Git** and **Mail-Otter** — four byte-identical copies.
 *
 * ## Why the icon stays but the label does not
 *
 * This is the one place the kit takes `lucide-react` as a peer, and the split is
 * deliberate. `RefreshCw` is iconography: reimplementing its path data in this
 * package would fork lucide's artwork and freeze it at whatever version the kit
 * vendored it. A label, by contrast, is the consuming app's string catalogue —
 * the app knows whether this reads "Refresh" or "Neu laden", and a kit that
 * hard-codes English text for it has taken over something it should not own.
 *
 * So: glyph in, string out. That is also why the kit's own `Button` keeps
 * using its own `Spinner` rather than lucide's `Loader2` — chrome is cheap to
 * draw, iconography is not.
 *
 * `loading` is passed straight through to `Button`, which already blocks
 * activation while busy, so a caller does not also thread `disabled`.
 */

interface RefreshButtonProps {
  onRefresh: () => void;
  /** Shows the spinner and blocks activation until the caller's work clears. */
  loading?: boolean;
  /** The button's text. */
  label: string;
  className?: string;
}

function RefreshButton({ onRefresh, loading, label, className }: Readonly<RefreshButtonProps>) {
  return (
    <Button variant="secondary" size="sm" onClick={onRefresh} loading={loading} className={className}>
      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Button>
  );
}

export { RefreshButton };
export type { RefreshButtonProps };
