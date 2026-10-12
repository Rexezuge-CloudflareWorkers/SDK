import { describe, expect, it } from 'vitest';
import { cn } from './utils.ts';

describe('cn', () => {
  it('joins the classes it is given, in order', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('drops falsy entries', () => {
    expect(cn('a', undefined, null, false, '', 'b')).toBe('a b');
  });

  it('flattens nested arrays and active dictionary entries', () => {
    expect(cn(['a', ['b', { c: true, d: false }]], { e: true, f: null })).toBe('a b c e');
  });

  it('keeps a number as a class name rather than concatenating it', () => {
    // clsx parity: `0` is a value, not an absence, so it stringifies to a class.
    expect(cn(1, 2)).toBe('1 2');
    expect(cn('a', 0, 'b')).toBe('a 0 b');
  });

  it('keeps two classes of different families side by side', () => {
    // `p` and `py` are different families: `py` overrides padding on the y axis
    // only, exactly as tailwind-merge leaves them.
    expect(cn('p-2', 'py-8')).toBe('p-2 py-8');
    expect(cn('px-4', 'py-2', 'text-sm')).toBe('px-4 py-2 text-sm');
    expect(cn('absolute', 'relative')).toBe('relative');
    expect(cn('flex', 'hidden')).toBe('hidden');
    expect(cn('items-center', 'justify-between')).toBe('items-center justify-between');
  });

  it('drops an exact duplicate, keeping its last occurrence', () => {
    expect(cn('px-4', 'px-4')).toBe('px-4');
    expect(cn('bg-white', 'text-sm', 'bg-white')).toBe('text-sm bg-white');
    expect(cn('a', 'b', 'a')).toBe('b a');
  });

  it('splits a string that carries several classes before merging', () => {
    // The components hand `cn` whole class strings (`'px-4 py-2'`), so a merge
    // that only looked at whole entries would never see `px-4` to override it.
    expect(cn('px-4 py-2', 'px-6')).toBe('py-2 px-6');
    expect(cn({ 'px-4 py-2': true }, 'w-full')).toBe('px-4 py-2 w-full');
  });

  it('does not merge a variant-prefixed class into an unprefixed one', () => {
    expect(cn('px-4', 'hover:px-6')).toBe('px-4 hover:px-6');
    expect(cn('sm:px-4', 'sm:px-8')).toBe('sm:px-8');
  });

  it('leaves a class whose suffix is not a length alone', () => {
    // `text-sm` is a font size but `text-red-500` is a colour; telling them
    // apart needs tailwind-merge's full table, so neither is merged.
    expect(cn('text-sm', 'text-red-500')).toBe('text-sm text-red-500');
    expect(cn('border', 'border-red-500')).toBe('border border-red-500');
    expect(cn('bg-white', 'bg-black')).toBe('bg-white bg-black');
  });

  it('does not merge a numeric-looking class from an unrelated family', () => {
    expect(cn('w-2', 'w-2')).toBe('w-2');
    expect(cn('top-0', 'top-4')).toBe('top-4');
  });

  it('leaves an arbitrary value that contains a colon intact', () => {
    // A colon inside brackets is part of the value, not a variant separator —
    // `bg-[image:var(--hero)]` must survive as one class.
    expect(cn('hover:bg-[image:var(--hero)]')).toBe('hover:bg-[image:var(--hero)]');
    expect(cn('bg-[image:var(--hero)]', 'bg-[image:var(--hero)]')).toBe('bg-[image:var(--hero)]');
  });

  it('returns an empty string for no input', () => {
    expect(cn()).toBe('');
  });
});
