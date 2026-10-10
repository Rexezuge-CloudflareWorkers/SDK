// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useNotice } from './useNotice';
import { NOTICE_TIMEOUT_MS } from './constants';

afterEach(cleanup);
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useNotice', () => {
  it('starts with nothing to say', () => {
    const { result } = renderHook(() => useNotice());
    expect(result.current.notice).toBeNull();
  });

  it('shows a pushed notice, keyed by kind and message', () => {
    const { result } = renderHook(() => useNotice());
    act(() => {
      result.current.showNotice('error', 'The bucket was not found.');
    });
    expect(result.current.notice).toEqual({ kind: 'error', message: 'The bucket was not found.' });
  });

  it('accepts a notice to start with', () => {
    const { result } = renderHook(() => useNotice({ initial: { kind: 'success', message: 'Connected.' } }));
    expect(result.current.notice).toEqual({ kind: 'success', message: 'Connected.' });
  });

  it('dismisses a notice on its own after the timeout', () => {
    const { result } = renderHook(() => useNotice());
    act(() => {
      result.current.showNotice('success', 'Saved.');
    });
    expect(result.current.notice).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(NOTICE_TIMEOUT_MS - 1);
    });
    expect(result.current.notice).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.notice).toBeNull();
  });

  it('honours a caller-supplied dismissal delay', () => {
    const { result } = renderHook(() => useNotice({ dismissAfterMs: 1000 }));
    act(() => {
      result.current.showNotice('success', 'Saved.');
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.notice).toBeNull();
  });

  it('replaces a showing notice instead of stacking a second timer', () => {
    const { result } = renderHook(() => useNotice());
    act(() => {
      result.current.showNotice('error', 'First.');
    });
    act(() => {
      vi.advanceTimersByTime(NOTICE_TIMEOUT_MS - 1);
    });
    act(() => {
      result.current.showNotice('success', 'Second.');
    });
    // The first notice's timer is gone; only the second one's is running.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.notice).toEqual({ kind: 'success', message: 'Second.' });
    act(() => {
      vi.advanceTimersByTime(NOTICE_TIMEOUT_MS);
    });
    expect(result.current.notice).toBeNull();
  });

  it('dismisses on request and cancels the pending timer', () => {
    const { result } = renderHook(() => useNotice());
    act(() => {
      result.current.showNotice('error', 'Boom.');
    });
    act(() => {
      result.current.dismissNotice();
    });
    expect(result.current.notice).toBeNull();
    act(() => {
      vi.advanceTimersByTime(NOTICE_TIMEOUT_MS * 2);
    });
    expect(result.current.notice).toBeNull();
  });

  it('cancels the pending timer when the component goes away', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { result, unmount } = renderHook(() => useNotice());
    act(() => {
      result.current.showNotice('error', 'Boom.');
    });
    clearSpy.mockClear();
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(NOTICE_TIMEOUT_MS * 2);
    });
    clearSpy.mockRestore();
  });
});
