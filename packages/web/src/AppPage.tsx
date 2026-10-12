import type { ReactNode } from 'react';
import { cn } from './utils.ts';

/**
 * The one page container.
 *
 * ## Provenance
 *
 * `components/layout/AppPage.tsx` in **Durable-DAV**, **Durable-DAV-Router**,
 * **Edge-Git** and **Edge-Sonic** — four copies, three of them identical.
 *
 * ## The divergence, and which side won
 *
 * Three copies used `max-w-7xl`; Edge-Sonic's used `max-w-5xl` and recorded
 * why: the operator surface is two lists and two forms, and the wider measure
 * only adds line length to prose already at its readable limit. That is the
 * better answer, so it is the one here — with `className` as the documented
 * escape hatch for a repo that genuinely wants the wider measure, because the
 * decision is per-app and a vendored copy would freeze ours.
 *
 * `hero` follows `wide` rather than carrying its own width: a hero that is
 * wider than the page it introduces is a layout bug, not a style.
 */

/**
`wide` is the default for every view. `narrow` is for centered forms.
*/
type AppPageVariant = 'wide' | 'narrow' | 'hero';

interface AppPageProps {
  variant?: AppPageVariant;
  /**
  Merged last, so it wins over the variant's own classes.
  */
  className?: string;
  children: ReactNode;
}

function AppPage({ variant = 'wide', className, children }: Readonly<AppPageProps>) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-6',
        variant === 'wide' && 'max-w-5xl py-8 space-y-4',
        variant === 'narrow' && 'max-w-2xl py-8 space-y-4',
        variant === 'hero' && 'max-w-5xl py-16',
        className,
      )}
    >
      {children}
    </div>
  );
}

export { AppPage };
export type { AppPageProps, AppPageVariant };
