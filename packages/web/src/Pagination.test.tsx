// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Pagination, clampPage, pageCountFor, pageWindow } from './Pagination.tsx';

afterEach(cleanup);

describe('pageCountFor', () => {
  it('counts the pages a total occupies, and 1 when there is nothing to page', () => {
    expect(pageCountFor(34, 10)).toBe(4);
    expect(pageCountFor(0, 10)).toBe(1);
    expect(pageCountFor(10, 0)).toBe(1);
    expect(pageCountFor(10, -5)).toBe(1);
    expect(pageCountFor(NaN, 10)).toBe(1);
  });
});

describe('clampPage', () => {
  it('pins a page into range and never returns zero', () => {
    expect(clampPage(0, 4)).toBe(1);
    expect(clampPage(9, 4)).toBe(4);
    expect(clampPage(2.7, 4)).toBe(2);
    expect(clampPage(NaN, 4)).toBe(1);
    expect(clampPage(5, 0)).toBe(1);
  });
});

describe('pageWindow', () => {
  it('keeps the current page near the middle of the window', () => {
    expect(pageWindow(6, 10)).toEqual([4, 5, 6, 7, 8]);
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(10, 10)).toEqual([6, 7, 8, 9, 10]);
  });

  it('never runs past the last page, whatever the window size', () => {
    // The window is clamped against `windowSize`, not a fixed `pageCount - 2`,
    // so it cannot emit page numbers past the last page.
    expect(pageWindow(5, 11, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(pageWindow(11, 11, 10)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(pageWindow(3, 2)).toEqual([1, 2]);
    expect(pageWindow(1, 0)).toEqual([]);
  });
});

describe('Pagination', () => {
  it('renders nothing when the collection fits on one page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is nothing to derive a page count from', () => {
    const { container } = render(<Pagination page={1} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a window of page numbers around the current page', () => {
    render(<Pagination page={6} total={100} pageSize={10} onChange={() => {}} />);
    for (const pageNumber of [4, 5, 6, 7, 8]) {
      expect(screen.getByRole('button', { name: String(pageNumber) })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: '1' })).toBeNull();
  });

  it('reports the page the caller asked for', () => {
    const onChange = vi.fn();
    render(<Pagination page={1} total={30} pageSize={10} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('clamps the steps at both ends', () => {
    const onChange = vi.fn();
    render(<Pagination page={1} pageCount={3} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('clamps an out-of-range page it was handed', () => {
    render(<Pagination page={99} pageCount={3} onChange={() => {}} />);
    // The current page is pinned to the last one, so Next is disabled.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders a summary instead of numbers in the compact variant', () => {
    render(<Pagination page={2} pageCount={3} variant="compact" onChange={() => {}} />);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1' })).toBeNull();
  });

  it('takes its labels from the caller', () => {
    render(
      <Pagination
        page={1}
        pageCount={2}
        variant="compact"
        labels={{ previous: 'Zurück', next: 'Weiter', summary: (page, count) => `Seite ${page} von ${count}` }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Zurück' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeEnabled();
    expect(screen.getByText('Seite 1 von 2')).toBeInTheDocument();
  });
});
