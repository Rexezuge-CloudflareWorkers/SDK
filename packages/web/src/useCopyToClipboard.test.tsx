// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCopyToClipboard } from './useCopyToClipboard.ts';
import { COPY_FEEDBACK_TIMEOUT_MS } from './constants.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Replace `navigator.clipboard` with a controllable double. */
function withClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

/** Remove the clipboard entirely, as an insecure context has it. */
function withoutClipboard(): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
}

describe('useCopyToClipboard', () => {
  it('reports success only after the write resolves', async () => {
    let resolveWrite: (() => void) | undefined;
    withClipboard(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    const { result } = renderHook(() => useCopyToClipboard());

    act(() => {
      result.current.copy('secret');
    });
    // Still pending — the check must not appear before the write lands.
    expect(result.current.copied).toBe(false);

    await act(async () => {
      resolveWrite?.();
    });
    expect(result.current.copied).toBe(true);
  });

  it('never reports success when the write rejects on a denied permission', async () => {
    // A rejection means the text is still on screen and unread. Showing a
    // checkmark anyway sends the operator away believing they have it.
    withClipboard(() => Promise.reject(new Error('denied')));
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      result.current.copy('secret');
    });

    expect(result.current.copied).toBe(false);
  });

  it('does nothing when there is no clipboard at all', () => {
    // Plain HTTP: `navigator.clipboard` is undefined, and `writeText` on it
    // throws synchronously — which is what killed the inlined handler.
    withoutClipboard();
    const { result } = renderHook(() => useCopyToClipboard());

    expect(() => {
      act(() => {
        result.current.copy('secret');
      });
    }).not.toThrow();
    expect(result.current.copied).toBe(false);
  });

  it('does not throw when `navigator` itself is absent', () => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });

    try {
      const { result } = renderHook(() => useCopyToClipboard());
      expect(() => {
        act(() => {
          result.current.copy('secret');
        });
      }).not.toThrow();
      expect(result.current.copied).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: original });
    }
  });

  it('clears the checkmark after the feedback window', async () => {
    vi.useFakeTimers();
    withClipboard(() => Promise.resolve());
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      result.current.copy('secret');
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_TIMEOUT_MS - 1);
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.copied).toBe(false);
  });

  it('restarts the window rather than letting an earlier timer clear a later copy', async () => {
    // Two clicks inside one window: the first timer, left live, would clear
    // the checkmark for the second copy while it is still being reported.
    vi.useFakeTimers();
    withClipboard(() => Promise.resolve());
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      result.current.copy('first');
    });
    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_TIMEOUT_MS - 100);
    });
    await act(async () => {
      result.current.copy('second');
    });

    // The first timer would have fired here.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_TIMEOUT_MS - 100);
    });
    expect(result.current.copied).toBe(false);
  });

  it('cancels its pending reset on unmount', async () => {
    // A modal closed inside the feedback window must not set state on a tree
    // that is gone.
    vi.useFakeTimers();
    withClipboard(() => Promise.resolve());
    const { result, unmount } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      result.current.copy('secret');
    });
    expect(result.current.copied).toBe(true);

    expect(() => {
      unmount();
      act(() => {
        vi.advanceTimersByTime(COPY_FEEDBACK_TIMEOUT_MS * 2);
      });
    }).not.toThrow();
  });

  it('keeps a stable `copy` identity across renders', async () => {
    withClipboard(() => Promise.resolve());
    const { result, rerender } = renderHook(() => useCopyToClipboard());
    const first = result.current.copy;

    rerender();
    await act(async () => {
      result.current.copy('secret');
    });

    // A new identity per render would let a memoized child re-run its effect on
    // every parent render and arm a second timer.
    expect(result.current.copy).toBe(first);
  });
});
