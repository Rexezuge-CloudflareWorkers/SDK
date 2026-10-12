import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from './utils.ts';

/**
 * Form controls: `Input`, `Select`, `Textarea`, `Label`.
 *
 * ## Provenance
 *
 * `components/ui/Input.tsx` in **CalDAV-Bridge**, **Durable-DAV**,
 * **Durable-DAV-Router**, **Edge-Git**, **Edge-Sonic** and **Mail-Otter** — six
 * copies that all export the same four controls and agree on the field classes
 * up to two drifting details, both settled the Edge-Sonic way:
 *
 * 1. **One shared class string** (`fieldClass`) instead of four re-spelled
 *    copies. CalDAV-Bridge, Durable-DAV-Router, Edge-Git and Mail-Otter omit
 *    `w-full` from their `Select`; CalDAV-Bridge's `Select`/`Label` and every
 *    `Textarea` re-spell the field classes minus one property. A placeholder
 *    colour that matches an input but not its select is a difference nobody
 *    notices until a client is looking at both.
 * 2. **`htmlFor` is stated, not spread.** Edge-Sonic's `Label` takes `htmlFor`
 *    and `children` explicitly, because a label with no `for` is announced as
 *    unassociated text: the click target and the accessible name both depend
 *    on it, and neither is visible in the markup that omits it.
 *
 * ## Error state
 *
 * None of the six copies carries an error state — each renders its field-level
 * error beside the input with its own markup (a `<p>` in `--color-error-text`,
 * or the app's notice bar), and none of them wires `aria-invalid`. Rather than
 * invent a sixth shape, the kit leaves the element to do what it already does:
 * `aria-invalid` and `aria-describedby` are standard input attributes and both
 * spread through here, and a consumer whose design reddens the border on error
 * passes the class itself (`className={error ? 'border-[var(--color-error-text)]' : undefined}`).
 */

/**
The shared look of every text-entry control.
*/
const fieldClass =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors duration-150 focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-60';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

function Input({ className, ...rest }: Readonly<InputProps>): ReactElement {
  return <input className={cn(fieldClass, className)} {...rest} />;
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

function Select({ className, children, ...rest }: Readonly<SelectProps>): ReactElement {
  return (
    <select className={cn(fieldClass, className)} {...rest}>
      {children}
    </select>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

function Textarea({ className, ...rest }: Readonly<TextareaProps>): ReactElement {
  return <textarea className={cn(fieldClass, 'min-h-20 resize-y', className)} {...rest} />;
}

interface LabelProps extends Omit<LabelHTMLAttributes<HTMLLabelElement>, 'htmlFor'> {
  /**
  The `id` of the control this label names.
  */
  htmlFor?: string;
  children: ReactNode;
}

function Label({ children, htmlFor, ...rest }: Readonly<LabelProps>): ReactElement {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]" {...rest}>
      {children}
    </label>
  );
}

export { Input, Label, Select, Textarea, fieldClass };
export type { InputProps, LabelProps, SelectProps, TextareaProps };
