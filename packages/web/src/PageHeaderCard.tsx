import type { ReactNode } from 'react';
import { Card } from './Card.tsx';

/**
 * The standard page-title header.
 *
 * ## Provenance
 *
 * `components/layout/PageHeaderCard.tsx` in **Durable-DAV**, **Durable-DAV-Router**
 * and **Edge-Git** — three copies, byte-identical apart from which views each
 * doc comment listed.
 *
 * It replaced the four ad-hoc title-`Card` variants those repos had grown, one
 * per page, which is how a header bar came to sit at four different heights.
 */

interface PageHeaderCardProps {
  /** Leading avatar. Omitted renders no avatar slot at all, not an empty one. */
  icon?: ReactNode;
  /**
   * The page's name.
   *
   * **Required.** An optional title would render a header bar with no text in
   * it — a silent no-op that looks deliberate. Forcing it means the compiler
   * asks rather than letting a page ship a nameless header.
   */
  title: ReactNode;
  /**
   * The line under the title.
   *
   * **Required**, though it may be an empty fragment. Same reason: the three
   * copies all rendered a description slot, and the ones that omitted it had
   * each re-derived the vertical rhythm with a different ad-hoc fix. Declaring
   * it means the layout is the same whether or not there is something to say.
   */
  description: ReactNode;
  /** Right-aligned. Omitted renders no actions slot. */
  actions?: ReactNode;
}

function PageHeaderCard({ icon, title, description, actions }: Readonly<PageHeaderCardProps>) {
  return (
    <Card className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-4">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-surface-3)] shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)] truncate">{title}</h1>
          {description && <div className="text-sm text-[var(--color-text-muted)] truncate">{description}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 shrink-0">{actions}</div>}
    </Card>
  );
}

export { PageHeaderCard };
export type { PageHeaderCardProps };
