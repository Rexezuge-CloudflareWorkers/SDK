import { useState, type CSSProperties, type FocusEvent, type InputHTMLAttributes, type ReactElement } from 'react';
import { Input } from './Input.tsx';
import { theme } from './theme.ts';

/**
 * A text field that paints its border while it holds focus.
 *
 * ## Provenance
 *
 * `components/ui/FocusInput.tsx` in **AWS-AccessBridge** — the only copy in the
 * family, and the only AWS primitive still in active use after the Tailwind
 * repos' `Input` absorbed the focus treatment into its class list
 * (`focus:border-[var(--color-accent)]`). It is kept because the two mechanisms
 * are not equivalent for a consumer without Tailwind: the class version needs
 * the stylesheet, the inline version needs nothing.
 *
 * Two normalizations from the original:
 *
 * - It **renders `Input`**, so the field's base styling (padding, radius,
 *   disabled opacity, placeholder colour) comes from the kit instead of a
 *   second, drifting copy.
 * - It no longer re-spells `inputStyle`. The original built its own style
 *   object and merged the caller's over it; this one passes `style` straight
 *   through, which is the same contract with one less place to change.
 *
 * Auto-focus is the standard `autoFocus` attribute — React applies it on mount,
 * and a component-level `focus()` call in an effect would race the caller's own
 * focus management for no gain.
 */

interface FocusInputProps extends InputHTMLAttributes<HTMLInputElement> {}

function FocusInput({ style, onFocus, onBlur, ...rest }: Readonly<FocusInputProps>): ReactElement {
  const [focused, setFocused] = useState(false);
  const focusStyle: CSSProperties = { borderColor: focused ? theme.focusBorder : theme.border, ...style };

  const handleFocus = (event: FocusEvent<HTMLInputElement>): void => {
    setFocused(true);
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>): void => {
    setFocused(false);
    onBlur?.(event);
  };

  return <Input {...rest} style={focusStyle} onFocus={handleFocus} onBlur={handleBlur} />;
}

export { FocusInput };
export type { FocusInputProps };
