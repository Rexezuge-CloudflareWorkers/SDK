import { useCallback, useEffect, useRef, useState } from 'react';
import { COPY_FEEDBACK_TIMEOUT_MS } from './constants.ts';

/**
 * Copy text to the clipboard, reporting success only when it happened.
 *
 * ## Provenance
 *
 * `hooks/useCopyToClipboard.ts` in **Durable-DAV** — the one copy that had
 * solved the two failures the others carried. The other three handlers were
 * inlined into `ReadOnlyField` (Edge-Git, Mail-Otter, Durable-DAV-Router) and
 * `TypeToConfirmModal`, and were byte-identical to each other.
 *
 * ## The two live bugs this converges away
 *
 * 1. **`navigator.clipboard` is absent in an insecure context.** A plain
 *    `navigator.clipboard.writeText` throws *synchronously* there, so the
 *    handler dies before setting state. Where it was guarded with
 *    `if (clipboard)`, the guard fell through to `setCopied(true)` anyway and
 *    showed a checkmark for a copy that never happened.
 * 2. **The write is a promise that rejects on a denied permission.** Awaiting
 *    it is not enough; the rejection has to be handled, or it surfaces as an
 *    unhandled rejection *and* the checkmark still appears.
 *
 * That second case is why this is a hook rather than a helper. The honest
 * answer — "nothing was copied, so there is nothing to undo" — is expressed by
 * `copied` simply never becoming true, which is state a helper function cannot
 * hold.
 *
 * Every call site in the family is a secret reveal: a bucket credential's
 * copy-once password, a resource name typed to confirm a destructive action.
 * A false success sends the operator away believing they have something they do
 * not.
 *
 * ## `reset`
 *
 * The timer is cleared on unmount, but that is not the only way the affordance
 * goes away: a clone menu that closes on an outside click hides the button
 * while its feedback window is still running. `reset` covers that, and cancels
 * the pending timer so the later unmount has nothing left to clear.
 *
 * ## Timer handling
 *
 * The reset timer is a ref and is cleared on unmount. Local `setTimeout` handles
 * in the inlined copies leaked both ways: a modal closed inside the feedback
 * window set state on an unmounted component, and repeated clicks each replaced
 * the timer without cancelling the previous one, so an early timer could clear
 * the checkmark while a later copy was still pending.
 */

interface UseCopyToClipboardResult {
  /**
   * True only after a write that actually resolved.
   *
   * Never optimistically set: a denied permission or an insecure context leaves
   * this `false`, which is the answer that matters — there is nothing to undo.
   */
  copied: boolean;
  /**
  Writes `text`, or does nothing if the clipboard is unavailable.
  */
  copy: (text: string) => void;
  /**
   * Clear the feedback early, cancelling the pending reset.
   *
   * For a host that hides the affordance itself — a clone menu that closes on
   * an outside click, a tab that is no longer showing the field. Without this
   * the only way to clear `copied` is to wait out the timer, and a consumer
   * that hides the button is left holding a stale `true` for a copy whose
   * confirmation is no longer on screen. Cancelling the timer here is what
   * keeps a later unmount from clearing state twice.
   */
  reset: () => void;
}

function useCopyToClipboard(): UseCopyToClipboardResult {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = useCallback((text: string): void => {
    // Optional chaining rather than an assumption: `navigator.clipboard` is
    // genuinely absent over plain HTTP, and for a self-hosted deployment over
    // plain HTTP that is a normal configuration, not an error to surface.
    const clipboard = globalThis.navigator?.clipboard as Clipboard | undefined;
    // Nothing was copied, so there is nothing to report and nothing to undo.
    if (!clipboard) return;

    void clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        // Cancel any pending reset before arming a new one. Replacing the
        // handle without clearing leaves the earlier timer live, and it can
        // clear the checkmark for a copy that is still being reported.
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => {
          resetTimer.current = null;
          setCopied(false);
        }, COPY_FEEDBACK_TIMEOUT_MS);
      })
      // Leave `copied` false rather than flashing and clearing it: a rejection
      // means the text is still on screen and unread, so the affordance must
      // not claim otherwise.
      .catch(() => {});
  }, []);

  const reset = useCallback((): void => {
    if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    resetTimer.current = null;
    setCopied(false);
  }, []);

  return { copied, copy, reset };
}

export { useCopyToClipboard };
export type { UseCopyToClipboardResult };
