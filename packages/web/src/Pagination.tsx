import type { ReactElement } from 'react';
import { Button } from './Button.tsx';
import { cn } from './utils.ts';

/**
 * Pager controls.
 *
 * ## Provenance
 *
 * `components/ui/Pagination.tsx` in **AWS-AccessBridge**, with the arithmetic
 * (`totalPages`, `clampPage`, `pageNumbers`) that this component reached for
 * across `lib/pagination.ts` and `lib/presentation.ts` inlined, because a
 * consumer importing the pager should not have to import two more modules to
 * understand it. The DAV repos' `VolumeFilePager` (Durable-DAV and
 * Durable-DAV-Router) is the family's other pager and informs two decisions: it
 * gates on the rows actually being present, and it renders nothing at all when
 * the collection fits on one page.
 *
 * The API is normalized away from the AWS names (`currentPage`, `totalPages`,
 * `onPageChange`) to `page`, `pageCount`, `onChange`. `pageCount` may be
 * derived instead of passed: give `total` and `pageSize` and the pager does the
 * arithmetic, which is what the DAV pager did by hand at its call site.
 *
 * `full` shows a window of page numbers (AWS's default); `compact` shows
 * "Page X of Y" (AWS's other variant, and what the DAV pager renders). Both
 * render `null` for a single page.
 */

/** How many pages `total` items occupy. A non-positive page size yields 1, never `Infinity`/`NaN`. */
function pageCountFor(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(pageSize) || pageSize <= 0 || total <= 0) {
    return 1;
  }
  return Math.ceil(total / pageSize);
}

/** Pins `page` into `[1, pageCount]`, rounding to the first page when it cannot be read. */
function clampPage(page: number, pageCount: number): number {
  const upper = Math.max(1, Math.trunc(Number.isFinite(pageCount) ? pageCount : 1));
  const wanted = Number.isFinite(page) ? Math.trunc(page) : 1;
  return Math.min(upper, Math.max(1, wanted));
}

/**
 * The 1-based page numbers to show, keeping the current page as close to the
 * middle of the window as the ends allow. The window is clamped against
 * `windowSize` rather than a fixed `pageCount - 2`, so a non-default window
 * cannot emit page numbers past the last page.
 */
function pageWindow(currentPage: number, pageCount: number, windowSize = 5): number[] {
  const count = Math.min(windowSize, pageCount);
  if (count <= 0) {
    return [];
  }
  const start = Math.max(1, Math.min(currentPage - Math.floor(windowSize / 2), pageCount - count + 1));
  return Array.from({ length: count }, (_, index) => start + index);
}

/** Overridable text, so an i18next app is not stuck with the English defaults. */
interface PaginationLabels {
  /** Prev-button accessible name / label. */
  previous?: string;
  /** Next-button accessible name / label. */
  next?: string;
  /** The "Page X of Y" summary in `compact` (and as the pager's `aria-label` in `full`). */
  summary?: (page: number, pageCount: number) => string;
}

interface PaginationProps {
  /** The page being displayed, 1-based. Clamped into range for rendering. */
  page: number;
  /** Total pages. Omit to derive it from `total` and `pageSize`. */
  pageCount?: number;
  /** Total item count across every page. */
  total?: number;
  /** Items per page. */
  pageSize?: number;
  /** Called with the 1-based page to move to; already clamped into range. */
  onChange: (page: number) => void;
  /** `full` shows page numbers, `compact` shows a summary. */
  variant?: 'full' | 'compact';
  labels?: PaginationLabels;
}

function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
  variant = 'full',
  labels = {},
}: Readonly<PaginationProps>): ReactElement | null {
  const derivedPageCount = pageCount ?? (total !== undefined && pageSize !== undefined ? pageCountFor(total, pageSize) : 1);
  const pages = Math.max(1, Math.trunc(Number.isFinite(derivedPageCount) ? derivedPageCount : 1));
  const current = clampPage(page, pages);
  const previousLabel = labels.previous ?? 'Previous';
  const nextLabel = labels.next ?? 'Next';
  const summaryLabel = labels.summary ?? ((page: number, count: number) => `Page ${page} of ${count}`);

  // Nothing to page: a single-page list shows no pager rather than a disabled one.
  if (pages <= 1) {
    return null;
  }

  const step = (next: number): void => {
    const target = clampPage(next, pages);
    if (target !== current) {
      onChange(target);
    }
  };

  const summary = <span className="text-xs text-[var(--color-text-muted)] tabular-nums">{summaryLabel(current, pages)}</span>;

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label={summaryLabel(current, pages)}>
      <Button variant="secondary" size="sm" disabled={current <= 1} onClick={() => step(current - 1)} aria-label={previousLabel}>
        {previousLabel}
      </Button>
      {variant === 'compact' ? (
        summary
      ) : (
        <div className="flex items-center gap-1">
          {pageWindow(current, pages).map((pageNumber) => (
            <Button
              key={pageNumber}
              variant="secondary"
              size="sm"
              className={cn(pageNumber === current && 'bg-[var(--color-accent)] text-[#0d1008]')}
              aria-current={pageNumber === current ? 'page' : undefined}
              onClick={() => step(pageNumber)}
            >
              {pageNumber}
            </Button>
          ))}
        </div>
      )}
      <Button variant="secondary" size="sm" disabled={current >= pages} onClick={() => step(current + 1)} aria-label={nextLabel}>
        {nextLabel}
      </Button>
    </nav>
  );
}

export { Pagination, clampPage, pageCountFor, pageWindow };
export type { PaginationLabels, PaginationProps };
