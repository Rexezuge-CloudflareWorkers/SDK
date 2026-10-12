import type { ReactNode } from 'react';
import { cn } from './utils.ts';

/**
 * The sticky bar every non-root page renders.
 *
 * ## Provenance
 *
 * `components/layout/ContextBar.tsx` in **Durable-DAV**, **Durable-DAV-Router**
 * and **Edge-Git** — three copies differing only in the logo and the
 * `aria-label` on the home link.
 *
 * ## Why `home` is a node and not a `<Link>`
 *
 * All three imports `react-router-dom`, solely to wrap a logo in a `Link` to
 * `/`. That is the whole of their router coupling — and it is why none of them
 * could be lifted into a package the kit's other seven stay clear of, and why
 * a repo on a different router could not use the bar at all.
 *
 * So the caller renders the anchor and passes it in. The bar keeps the part
 * that was genuinely duplicated (the sticky geometry, the breadcrumb slot, the
 * right-aligned actions) and gives up the part that was a routing assumption.
 * The caller also owns the link's accessible name, which is the one thing that
 * genuinely differs between the three copies and could not have been defaulted.
 */

interface ContextBarProps {
  /**
   * The home link, already rendered by the caller.
   *
   * Required, even though the bar is usable without one: a bar with no way back
   * to the root is the failure this component exists to prevent, so it should
   * not be omittable. Pass an empty node only if a route genuinely has no home.
   */
  home: ReactNode;
  /**
  The current location's name. Usually a `Link` or breadcrumb segment.
  */
  crumb: ReactNode;
  /**
  Right-aligned controls — refresh, settings, a sign-out button.
  */
  actions?: ReactNode;
  /**
  Merged last onto the bar's outer element.
  */
  className?: string;
}

function ContextBar({ home, crumb, actions, className }: Readonly<ContextBarProps>) {
  return (
    <div className={cn('sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]/95 backdrop-blur', className)}>
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
        {home}
        {/* Decorative: the breadcrumb and the home link already separate these
            regions for a screen reader, and a stray "/" read aloud between them
            is noise. */}
        <span aria-hidden="true" className="text-[var(--color-text-muted)] font-normal">
          /
        </span>
        <div className="flex items-center gap-2 min-w-0 flex-1">{crumb}</div>
        {actions && <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

export { ContextBar };
export type { ContextBarProps };
