import { ZERO_TRUST_AUTHENTICATION_PATH } from './constants';

/**
 * The "you are not signed in" page.
 *
 * ## Provenance
 *
 * `components/layout/Unauthorized.tsx` in **Durable-DAV**, **Durable-DAV-Router**,
 * **Edge-Git**, **Mail-Otter** and **Edge-Sonic** — five copies, byte-identical
 * apart from the doc comment — plus `Unauthorized.tsx` at the components root
 * in **AWS-AccessBridge** and **CalDAV-Bridge**.
 *
 * ## Why `onAuthenticate` is an argument and not a fixed `location.assign`
 *
 * All seven copies hard-coded `globalThis.location.assign(ZERO_TRUST_AUTHENTICATION_PATH)`.
 * That is untestable — jsdom refuses to navigate, so the one branch that
 * matters (what happens when the operator actually clicks the button) had no
 * assertions at all — and it hard-codes a routing assumption into a component
 * that a repo may not share.
 *
 * The default keeps the original behaviour for a repo that wants it, and a
 * caller with a different sign-in route passes its own.
 */

interface UnauthorizedProps {
  /** The heading. Required: this is the page's only `h1`. */
  title: string;
  /**
   * Why they are being stopped.
   *
   * Optional, and `null`/omitted renders no paragraph rather than an empty one.
   * A blank line under the heading reads as a rendering bug.
   */
  message?: string;
  /** The sign-in button's label. Required. */
  actionLabel: string;
  /**
   * What the button does.
   *
   * Defaults to navigating to {@link ZERO_TRUST_AUTHENTICATION_PATH}, which is
   * what every copy in the family did.
   */
  onAuthenticate?: () => void;
}

function Unauthorized({ title, message, actionLabel, onAuthenticate }: Readonly<UnauthorizedProps>) {
  const authenticate =
    onAuthenticate ??
    ((): void => {
      globalThis.location.assign(ZERO_TRUST_AUTHENTICATION_PATH);
    });

  return (
    <div className="bg-[var(--color-surface-base)] text-[var(--color-text-primary)] flex items-center justify-center py-16">
      <div className="text-center px-6">
        <h1 className="text-lg font-medium mt-4 mb-1">{title}</h1>
        {message && <p className="text-[var(--color-text-secondary)] text-sm">{message}</p>}
        <button
          type="button"
          onClick={authenticate}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[#0d1008] transition-colors hover:bg-[var(--color-accent-dim)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

export { Unauthorized };
export type { UnauthorizedProps };
