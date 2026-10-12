import type { Notice, NoticeKind } from './useNotice.ts';

/**
 * The transient status banner.
 *
 * ## Provenance
 *
 * `components/layout/NoticeBar.tsx` in **CalDAV-Bridge**, **Durable-DAV**,
 * **Durable-DAV-Router**, **Edge-Git**, **Edge-Sonic** and **Mail-Otter** —
 * six copies in three distinct shapes.
 *
 * ## This renders the kit's own `Notice`
 *
 * Every copy took `{ type: 'success' | 'error'; text: string }`, while
 * `@rexezuge/web`'s `useNotice` — converged from the same six repos, and
 * already shipping — returns `{ kind, message }`. The copies were therefore
 * each doing a field-by-field shuffle at their call site to feed a component
 * the hook had already produced.
 *
 * Taking the kit's own type makes the pair compose directly. Consumers rename
 * two fields at their call sites; in exchange the banner and the hook can never
 * drift apart, because there is only one shape.
 *
 * ## Durable-DAV's fix is the one that shipped
 *
 * All six used `role="status"`, which implies `aria-live="polite"`. A failed
 * credential revoke was therefore announced at the same priority as a
 * background update, and a screen-reader user might never hear it. Durable-DAV's
 * copy splits it: errors assert, successes stay polite. That is the base here.
 *
 * Mail-Otter's copy dropped the screen-reader-only status prefix entirely,
 * which loses the kind for a user who cannot see the colour.
 */

/** The two accessible names, keyed by the kind they announce. */
type NoticeStatusLabels = Record<NoticeKind, string>;

interface NoticeBarProps {
  /** The notice to show, or `null` for nothing — which is what `useNotice` hands back when idle. */
  notice: Notice | null;
  /**
   * The screen-reader prefix for each kind, e.g. `{ success: 'Success', error: 'Error' }`.
   *
   * Required, and keyed rather than a single string, because the label depends
   * on the kind: one label would either mislabel half the notices or need a
   * conditional at every call site — which is where the copies diverged.
   */
  statusLabels: NoticeStatusLabels;
}

function NoticeBar({ notice, statusLabels }: Readonly<NoticeBarProps>) {
  if (notice === null) return null;

  const isError = notice.kind === 'error';

  return (
    <div
      // Errors assert; successes stay polite. See the file header for why this
      // is not one role for both.
      role={isError ? 'alert' : 'status'}
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slide-down px-5 py-3 rounded-xl shadow-xl bg-[var(--color-surface-2)] border border-[var(--color-border-muted)] max-w-[calc(100vw-2rem)]"
    >
      <span className="sr-only">{statusLabels[notice.kind]}: </span>
      <span className={isError ? 'text-[var(--color-error-text)]' : 'text-[var(--color-success-text)]'}>{notice.message}</span>
    </div>
  );
}

export { NoticeBar };
export type { NoticeBarProps, NoticeStatusLabels };
