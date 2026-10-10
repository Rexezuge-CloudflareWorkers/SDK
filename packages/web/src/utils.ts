/**
 * Class-name composition.
 *
 * ## Provenance
 *
 * `lib/utils.ts` in **CalDAV-Bridge**, **Durable-DAV**, **Durable-DAV-Router**,
 * **Edge-Git**, **Edge-Sonic** and **Mail-Otter** — six byte-identical copies of
 *
 * ```ts
 * export function cn(...inputs: ClassValue[]) {
 *   return twMerge(clsx(inputs));
 * }
 * ```
 *
 * The kit cannot import `clsx` or `tailwind-merge` (this package declares no
 * dependency on either, and the consumers' own copies stay theirs), so the same
 * contract is implemented here in-dependency-free form:
 *
 * - **clsx semantics** — strings, numbers, arrays and `{ [class]: active }`
 *   dictionaries are flattened, and falsy entries are dropped.
 * - **tailwind-merge semantics, for a documented subset** — when a later class
 *   belongs to the same utility family as an earlier one, the earlier one is
 *   dropped, so `<Button className="px-6">` really does override the base
 *   `px-4` instead of shipping both and letting stylesheet order decide.
 *
 * The merged families are the ones whose value is a length or a count —
 * spacing, sizing, border width, radius, transitions — plus the single-word
 * utilities (position, display, flex direction, justification, alignment, text
 * alignment, font weight). Families whose suffix is *not* a value
 * (`text-red-500`, `bg-[var(--color-accent)]`, `border-white`) are left in
 * source order on purpose: telling `text-sm` from `text-red-500` takes
 * tailwind-merge's full class table, and guessing wrong would silently drop a
 * colour. A consumer that needs the complete table can wrap this one:
 * `const cn = (...values: ClassValue[]) => twMerge(kitCn(...values))`.
 */

/** Everything `cn` accepts, mirroring clsx's `ClassValue`. */
type ClassValue = string | number | boolean | null | undefined | ClassDictionary | readonly ClassValue[];

/** `{ 'px-4': isActive }` — a class is present when its value is truthy. */
interface ClassDictionary {
  [className: string]: boolean | null | undefined;
}

/**
 * Utility prefixes whose remainder is a length/count, merged longest-first so
 * `px-` is matched before `p-`.
 */
const VALUE_UTILITY_PREFIXES: readonly string[] = [
  // Inset / spacing
  'inset-x',
  'inset-y',
  'inset',
  'scroll-mx',
  'scroll-my',
  'scroll-m',
  'scroll-px',
  'scroll-py',
  'scroll-p',
  'start',
  'end',
  'top',
  'right',
  'bottom',
  'left',
  'space-x',
  'space-y',
  'gap-x',
  'gap-y',
  'gap',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'ps',
  'pe',
  'p',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'ms',
  'me',
  'm',
  // Sizing
  'min-w',
  'min-h',
  'max-w',
  'max-h',
  'size',
  'w',
  'h',
  // Radius
  'rounded-ss',
  'rounded-se',
  'rounded-ee',
  'rounded-es',
  'rounded-tl',
  'rounded-tr',
  'rounded-br',
  'rounded-bl',
  'rounded-s',
  'rounded-e',
  'rounded-t',
  'rounded-r',
  'rounded-b',
  'rounded-l',
  'rounded',
  // Border width (a border *colour* never has a numeric suffix)
  'border-x',
  'border-y',
  'border-t',
  'border-r',
  'border-b',
  'border-l',
  'border-s',
  'border-e',
  'border',
  // Ring / outline width, divide, translate/scale/rotate
  'ring-offset',
  'ring',
  'divide-x',
  'divide-y',
  'outline-offset',
  'translate-x',
  'translate-y',
  'scale',
  'rotate',
  // Grid
  'col-span',
  'row-span',
  'grid-cols',
  'grid-rows',
  // Flex box
  'basis',
  'grow',
  'shrink',
  'order',
  'z',
  'opacity',
  'leading',
  'tracking',
  'duration',
  'delay',
];

/**
 * Single-word utilities that have no value, grouped by the property they set.
 * Only words that are unambiguously that property are listed — `font-medium`
 * (weight) is here, `font-mono` (family) is not.
 */
const SINGLETON_UTILITIES: Record<string, string> = {
  // Position
  static: 'position',
  fixed: 'position',
  absolute: 'position',
  relative: 'position',
  sticky: 'position',
  // Display
  block: 'display',
  inline: 'display',
  'inline-block': 'display',
  flex: 'display',
  'inline-flex': 'display',
  grid: 'display',
  'inline-grid': 'display',
  table: 'display',
  hidden: 'display',
  contents: 'display',
  'flow-root': 'display',
  'list-item': 'display',
  // Flex direction / wrapping
  'flex-row': 'flex-direction',
  'flex-col': 'flex-direction',
  'flex-row-reverse': 'flex-direction',
  'flex-col-reverse': 'flex-direction',
  'flex-wrap': 'flex-wrap',
  'flex-wrap-reverse': 'flex-wrap',
  'flex-nowrap': 'flex-wrap',
  // Justification / alignment
  'justify-normal': 'justify-content',
  'justify-start': 'justify-content',
  'justify-end': 'justify-content',
  'justify-center': 'justify-content',
  'justify-between': 'justify-content',
  'justify-around': 'justify-content',
  'justify-evenly': 'justify-content',
  'justify-stretch': 'justify-content',
  'items-start': 'align-items',
  'items-end': 'align-items',
  'items-center': 'align-items',
  'items-baseline': 'align-items',
  'items-stretch': 'align-items',
  'self-auto': 'align-self',
  'self-start': 'align-self',
  'self-end': 'align-self',
  'self-center': 'align-self',
  'self-stretch': 'align-self',
  // Text alignment
  'text-left': 'text-align',
  'text-center': 'text-align',
  'text-right': 'text-align',
  'text-justify': 'text-align',
  'text-start': 'text-align',
  'text-end': 'text-align',
  // Font weight (families are deliberately absent — see the comment above)
  'font-thin': 'font-weight',
  'font-extralight': 'font-weight',
  'font-light': 'font-weight',
  'font-normal': 'font-weight',
  'font-medium': 'font-weight',
  'font-semibold': 'font-weight',
  'font-bold': 'font-weight',
  'font-extrabold': 'font-weight',
  'font-black': 'font-weight',
  // Visibility
  visible: 'visibility',
  invisible: 'visibility',
  collapse: 'visibility',
};

/** A length/count-like remainder: `-2`, `1.5`, `[3px]`, `px`, `full`, `none`. */
const VALUE_SUFFIX = /^(-?(?:\d+\.?\d*|\[[^\]]*\]|px|full|none|auto|screen|min|max|fit))$/;

function isClassList(value: ClassValue): value is readonly ClassValue[] {
  return Array.isArray(value);
}

/** Pushes the whitespace-separated classes of one string, dropping empties. */
function pushClasses(into: string[], value: string): void {
  for (const className of value.split(/\s+/)) {
    if (className !== '') {
      into.push(className);
    }
  }
}

/** Flattens clsx-style inputs into the classes they contribute, in order. */
function flattenClasses(values: readonly ClassValue[], into: string[]): void {
  for (const value of values) {
    if (value === null || value === undefined || value === false || value === '') {
      continue;
    }
    if (typeof value === 'string') {
      pushClasses(into, value);
      continue;
    }
    if (typeof value === 'number') {
      into.push(String(value));
      continue;
    }
    if (isClassList(value)) {
      flattenClasses(value, into);
      continue;
    }
    for (const [className, active] of Object.entries(value)) {
      if (active) {
        // A dictionary key may itself carry several classes.
        pushClasses(into, className);
      }
    }
  }
}

/**
 * Splits `hover:focus:px-2` into its variants and base, ignoring the colons
 * that appear inside an arbitrary value such as `bg-[url(https://…)]`.
 */
function splitVariants(className: string): { variants: string; base: string } {
  let depth = 0;
  let lastSeparator = -1;
  for (let index = 0; index < className.length; index += 1) {
    const character = className[index];
    if (character === '[' || character === '(') {
      depth += 1;
    } else if (character === ']' || character === ')') {
      depth -= 1;
    } else if (character === ':' && depth === 0) {
      lastSeparator = index;
    }
  }
  if (lastSeparator === -1) {
    return { variants: '', base: className };
  }
  return { variants: className.slice(0, lastSeparator), base: className.slice(lastSeparator + 1) };
}

/**
 * The merge group a class belongs to, or `null` when it must be left alone.
 *
 * Two classes merge only when their group is equal, and the group carries the
 * variant prefix — `sm:px-2` never overrides a bare `px-4`.
 */
function groupKeyFor(className: string): string | null {
  const { variants, base } = splitVariants(className);
  const singletonGroup = SINGLETON_UTILITIES[base];
  if (singletonGroup !== undefined) {
    return `${variants}|${singletonGroup}`;
  }
  for (const prefix of VALUE_UTILITY_PREFIXES) {
    if (base === prefix) {
      return `${variants}|${prefix}`;
    }
    if (!base.startsWith(`${prefix}-`)) {
      continue;
    }
    // `important` and a trailing `!` are not values; neither is an unknown word,
    // which is how `text-sm`/`border-white` escape the numeric families.
    const suffix = base.slice(prefix.length + 1);
    if (!VALUE_SUFFIX.test(suffix)) {
      return null;
    }
    return `${variants}|${prefix}`;
  }
  return null;
}

/** Drops an exact duplicate, keeping its last occurrence. */
function dedupeClasses(classes: readonly string[]): string[] {
  const lastIndex = new Map<string, number>();
  classes.forEach((className, index) => {
    lastIndex.set(className, index);
  });
  return classes.filter((className, index) => lastIndex.get(className) === index);
}

/** Drops each class that a later member of its own group has replaced. */
function mergeGroups(classes: readonly string[]): string[] {
  const merged: string[] = [];
  const positionByGroup = new Map<string, number>();
  for (const className of classes) {
    const group = groupKeyFor(className);
    if (group !== null) {
      const previous = positionByGroup.get(group);
      if (previous !== undefined) {
        merged[previous] = '';
      }
      positionByGroup.set(group, merged.length);
    }
    merged.push(className);
  }
  return merged.filter((className) => className !== '');
}

/**
 * Joins class names, dropping falsy entries, exact duplicates, and superseded
 * utilities.
 *
 * ```ts
 * cn('px-4', undefined, ['py-2', { 'font-bold': isActive }], 'px-6'); // 'py-2 px-6'
 * ```
 */
function cn(...inputs: ClassValue[]): string {
  const flattened: string[] = [];
  flattenClasses(inputs, flattened);
  return mergeGroups(dedupeClasses(flattened)).join(' ');
}

export { cn };
export type { ClassDictionary, ClassValue };
