import { useCallback, useEffect, useRef, useState } from 'react';
import { NOTICE_TIMEOUT_MS } from './constants.ts';

/**
 * A transient status message.
 *
 * ## Provenance
 *
 * `hooks/useNotice.ts` in **CalDAV-Bridge**, **Durable-DAV**,
 * **Durable-DAV-Router**, **Edge-Git**, **Edge-Sonic** and **Mail-Otter** — six
 * copies of one hook, with AWS-AccessBridge's `useToast` as the seventh in
 * everything but name. Each contributes one thing:
 *
 * - **Durable-DAV** — the unmount cleanup. Its comment records the bug: the
 *   timer was only ever cleared in favour of the *next* notice, so unmounting
 *   with a notice showing left it live to call `setState` on a gone component.
 * - **Edge-Sonic** — `clearNotice`, a dismissal that is not just "replace it",
 *   and the exported `ShowNotice` type so feature tabs stop re-spelling the
 *   setter's signature.
 * - **CalDAV-Bridge / Mail-Otter** — seeding the first notice from the URL's
 *   `?oauth2=` result. That is *left local*: the parameter names are
 *   product-specific, and a hook that reads a query string is a hook a test
 *   has to fake a location for. A consumer seeds its own notice by passing
 *   `initial` — see `UseNoticeOptions`.
 * - **All six** — a ref-held timer, so a new notice replaces the old one's
 *   dismissal instead of being cut short by it ("the error banner vanished
 *   before I read it").
 *
 * ## Normalization
 *
 * The type is `{ kind, message }`. Every copy used `{ type, text }`, and the
 * field names collided with the DOM's `type` on unrelated elements often enough
 * that `kind`/`message` read better at the call sites that build one by hand
 * (`describeProbe` in Edge-Sonic returns a notice-shaped value). The imperative
 * API is `showNotice(kind, message)` — positional, as every copy had it, so a
 * call site reads as the event it reports — plus `dismissNotice()`.
 */

type NoticeKind = 'success' | 'error';

/**
One transient message. `kind` is the tone, `message` the sentence.
*/
interface Notice {
  kind: NoticeKind;
  message: string;
}

/**
The setter views and hooks are handed.
*/
type ShowNotice = (kind: NoticeKind, message: string) => void;

interface UseNoticeOptions {
  /**
  How long a notice stays up. Defaults to `NOTICE_TIMEOUT_MS`.
  */
  dismissAfterMs?: number;
  /**
  A notice to start with — the URL-seeded OAuth result, in a consumer.
  */
  initial?: Notice | null;
}

interface UseNoticeResult {
  /**
  The notice to render, or `null` when there is nothing to say.
  */
  notice: Notice | null;
  /**
  Shows a notice, replacing any notice already showing (and its timer).
  */
  showNotice: ShowNotice;
  /**
  Hides the notice and cancels its pending dismissal.
  */
  dismissNotice: () => void;
}

function useNotice({ dismissAfterMs = NOTICE_TIMEOUT_MS, initial = null }: Readonly<UseNoticeOptions> = {}): UseNoticeResult {
  const [notice, setNotice] = useState<Notice | null>(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingDismissal = useCallback(() => {
    if (timerRef.current === null) {
      return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const dismissNotice = useCallback(() => {
    clearPendingDismissal();
    setNotice(null);
  }, [clearPendingDismissal]);

  const showNotice = useCallback<ShowNotice>(
    (kind, message) => {
      // Replace the pending dismissal rather than stacking a second timer: two
      // live timers mean the first notice's timeout fires while the second is
      // still on screen.
      clearPendingDismissal();
      setNotice({ kind, message });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setNotice(null);
      }, dismissAfterMs);
    },
    [clearPendingDismissal, dismissAfterMs],
  );

  // Unmounting cancels the dismissal. Without this the timer outlives the
  // component and calls `setState` on a tree that is gone.
  useEffect(() => clearPendingDismissal, [clearPendingDismissal]);

  return { notice, showNotice, dismissNotice };
}

export { useNotice };
export type { Notice, NoticeKind, ShowNotice, UseNoticeOptions, UseNoticeResult };
