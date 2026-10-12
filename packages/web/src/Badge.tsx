import type { HTMLAttributes, ReactElement } from 'react';
import { cn } from './utils.ts';

/**
 * A status pill.
 *
 * ## Provenance
 *
 * `components/ui/Badge.tsx` in **CalDAV-Bridge**, **Durable-DAV**,
 * **Durable-DAV-Router**, **Edge-Git**, **Edge-Sonic** and **Mail-Otter** — six
 * copies that agree on the base classes, the five variants, and the `neutral`
 * default. Edge-Sonic's is the best of them (its props spread onto the DOM
 * element, so a badge can carry `id`/`role`/`data-*`), so it is the shape here.
 *
 * The variants are *tones*, not statuses: every repo additionally carries a
 * stack of domain badges (`ConnectionBadge`, `VisibilityBadge`,
 * `TaskRunStatusBadge`, …) that map its own status vocabulary onto a tone and
 * translate a label with `t()`. Those are product vocabularies with
 * product-specific translation keys, so they stay with their apps — the kit
 * ships the tone layer and `badgeClass()` so a consumer's own
 * `variantFor(status)` maps onto it without re-deriving the classes.
 *
 * Requires the CSS variables `--color-{success,error,warning,info,neutral}-{bg,text}`,
 * which all six consuming apps already define.
 */

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral';

/**
Layout and type scale, shared by every variant.
*/
const badgeBaseClass = 'inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium';

/**
The tone palette. `neutral` is the default: an unknown verdict is not a failure.
*/
const badgeVariantClass: Record<BadgeVariant, string> = {
  neutral: 'bg-[var(--color-neutral-bg)] text-[var(--color-neutral-text)]',
  success: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  error: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  info: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /**
  Tone; defaults to `neutral`.
  */
  variant?: BadgeVariant;
}

function Badge({ className, variant = 'neutral', ...rest }: Readonly<BadgeProps>): ReactElement {
  return <span className={cn(badgeBaseClass, badgeVariantClass[variant], className)} {...rest} />;
}

/**
 * The class string for a badge, for callers building the element themselves —
 * a `<button>` that looks like a badge, or a domain badge wrapper that adds
 * `t()`-translated children.
 */
function badgeClass(variant: BadgeVariant = 'neutral', className?: string): string {
  return cn(badgeBaseClass, badgeVariantClass[variant], className);
}

export { Badge, badgeBaseClass, badgeClass, badgeVariantClass };
export type { BadgeProps, BadgeVariant };
