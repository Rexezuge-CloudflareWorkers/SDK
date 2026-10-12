import type { HTMLAttributes, ReactElement } from 'react';
import { cn } from './utils.ts';

/**
 * Surface primitives: `Card`, `CardHeader`, `CardTitle`.
 *
 * ## Provenance
 *
 * `components/ui/Card.tsx` in **CalDAV-Bridge**, **Durable-DAV**,
 * **Durable-DAV-Router**, **Edge-Git**, **Edge-Sonic** and **Mail-Otter** — six
 * copies that are identical apart from Edge-Sonic's two improvements, both of
 * which are adopted here:
 *
 * 1. **Props spread onto the DOM element.** The other five take only
 *    `className` and `children`, so a card that needs an `id`, a `role` or a
 *    `data-testid` has to be wrapped in a redundant element.
 * 2. **The base classes live in one exported string** rather than being
 *    re-spelled by `CardHeader`/`CardTitle`, so a change to the surface lands
 *    once.
 *
 * `CardTitle` renders an `<h2>` in every copy. No copy in the family
 * parameterised the heading level, and inventing a `headingLevel` prop here
 * would strand the other six call sites, so the level stays fixed and a caller
 * that needs a different level composes the class string it needs from
 * `cardTitleClass`.
 */

/**
The card surface.
*/
const cardClass = 'rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5';

type CardProps = HTMLAttributes<HTMLDivElement>;

function Card({ className, ...rest }: Readonly<CardProps>): ReactElement {
  return <div className={cn(cardClass, className)} {...rest} />;
}

/**
The header row: title on the left, actions on the right.
*/
const cardHeaderClass = 'mb-4 flex items-center justify-between gap-3';

type CardHeaderProps = HTMLAttributes<HTMLDivElement>;

function CardHeader({ className, ...rest }: Readonly<CardHeaderProps>): ReactElement {
  return <div className={cn(cardHeaderClass, className)} {...rest} />;
}

/**
The card's title. Renders an `<h2>`; nested headings override the level via `role`.
*/
const cardTitleClass = 'text-lg font-semibold text-[var(--color-text-primary)]';

type CardTitleProps = HTMLAttributes<HTMLHeadingElement>;

function CardTitle({ className, ...rest }: Readonly<CardTitleProps>): ReactElement {
  return <h2 className={cn(cardTitleClass, className)} {...rest} />;
}

export { Card, cardClass, cardHeaderClass, cardTitleClass, CardHeader, CardTitle };
export type { CardHeaderProps, CardProps, CardTitleProps };
