import type { ButtonHTMLAttributes, MouseEvent, ReactElement } from 'react';
import { cn } from './utils.ts';
import { Spinner } from './Spinner.tsx';

/**
 * The one button.
 *
 * ## Provenance
 *
 * `components/ui/Button.tsx` in **CalDAV-Bridge**, **Durable-DAV**,
 * **Durable-DAV-Router**, **Edge-Git**, **Edge-Sonic** and **Mail-Otter** — six
 * copies written from one design, agreeing on the base classes, the four
 * variants (`primary`/`secondary`/`ghost`/`danger`) and the three sizes. The
 * differences that had to be settled:
 *
 * - **Default variant.** CalDAV-Bridge defaults to `primary`; the other five
 *   default to `secondary`. The majority wins: a page of solid-coloured
 *   buttons is noise, and `primary` should mark the one action that matters.
 * - **`type`.** Durable-DAV and Edge-Sonic default it to `button`; the others
 *   leave the HTML default (`submit`) in place, so a `<Button>` inside a
 *   `<form>` submits it. The explicit default is kept — it is the documented
 *   fix, and a consumer that wants a submit button passes `type="submit"`.
 * - **`ghost` hover.** Four repos hover to `--color-surface-3` with
 *   `--color-text-secondary`; Edge-Sonic uses `surface-2`/`text-muted`. The
 *   majority wins.
 * - **`danger` hover.** Four repos use `hover:brightness-125`; Edge-Sonic uses
 *   `hover:opacity-90`. The majority wins.
 *
 * ## Loading
 *
 * Converged from **AWS-AccessBridge**'s `components/ui/LoadingButton.tsx`, the
 * one place the family tracked busy state itself. Its two behaviours fold
 * cleanly into this component's `loading` prop: the button is `disabled` while
 * loading (so neither a pointer, a keyboard, nor a screen reader can activate
 * it), *and* the click handler bails out, so a synthesized `click()` — which
 * jsdom and some test harnesses dispatch without honouring `disabled` — cannot
 * fire a second submission. The ring is this package's `Spinner`, which
 * inherits the button's text colour.
 */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Layout and focus affordance. The focus ring is on `focus-visible`, so a
 * pointer press does not paint it and a keyboard press always does.
 */
const buttonBaseClass =
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-accent)] text-[#0d1008] hover:bg-[var(--color-accent-dim)]',
  secondary: 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-4)]',
  ghost: 'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)]',
  danger: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:brightness-125',
};

const buttonSizeClass: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2',
  lg: 'px-5 py-2.5 text-base',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
  Visual weight; defaults to `secondary`.
  */
  variant?: ButtonVariant;
  /**
  Control size; defaults to `md`.
  */
  size?: ButtonSize;
  /**
   * Shows the spinner and blocks activation until it clears. A busy button is
   * a disabled button: the prop alone is enough, no `disabled` bookkeeping at
   * the call site.
   */
  loading?: boolean;
}

function Button({
  className,
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  onClick,
  type = 'button',
  ...rest
}: Readonly<ButtonProps>): ReactElement {
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    // Belt and braces: `disabled` already stops a real pointer or key press,
    // and this stops a synthesized event from re-entering an in-flight action.
    if (disabled || loading) {
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      type={type}
      className={cn(buttonBaseClass, buttonVariantClass[variant], buttonSizeClass[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? <Spinner size={16} color="currentColor" padding="0" /> : null}
      {children}
    </button>
  );
}

/**
 * The class string for a button, for callers rendering the element themselves —
 * a link styled as a button, or a toolbar control that is not a `<button>`.
 */
function buttonClass(
  { variant = 'secondary', size = 'md' }: { variant?: ButtonVariant; size?: ButtonSize } = {},
  className?: string,
): string {
  return cn(buttonBaseClass, buttonVariantClass[variant], buttonSizeClass[size], className);
}

export { Button, buttonBaseClass, buttonClass, buttonSizeClass, buttonVariantClass };
export type { ButtonProps, ButtonSize, ButtonVariant };
