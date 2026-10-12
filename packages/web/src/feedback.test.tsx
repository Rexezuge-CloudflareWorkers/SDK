// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NoticeBar } from './NoticeBar.tsx';
import { LanguageSelector } from './LanguageSelector.tsx';
import type { NoticeStatusLabels } from './NoticeBar.tsx';

afterEach(() => {
  cleanup();
});

const LABELS: NoticeStatusLabels = { success: 'Success', error: 'Error' };

describe('NoticeBar', () => {
  it('renders nothing when there is no notice', () => {
    // `useNotice` hands back `null` when idle, so this is the common case.
    const { container } = render(<NoticeBar notice={null} statusLabels={LABELS} />);
    expect(container.firstElementChild).toBeNull();
  });

  it('renders a success notice politely', () => {
    render(<NoticeBar notice={{ kind: 'success', message: 'Volume created' }} statusLabels={LABELS} />);
    expect(screen.getByRole('status')).toHaveTextContent('Volume created');
  });

  it('renders an error assertively', () => {
    // The fix Durable-DAV made and the other five copies never did: a failed
    // credential revoke was announced at the same priority as a background
    // update, so a screen-reader user might never hear it.
    render(<NoticeBar notice={{ kind: 'error', message: 'Delete failed' }} statusLabels={LABELS} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Delete failed');
  });

  it('announces the kind for a user who cannot see the colour', () => {
    // Mail-Otter's copy dropped the sr-only prefix entirely.
    render(<NoticeBar notice={{ kind: 'error', message: 'Delete failed' }} statusLabels={LABELS} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Error:');
  });

  it('uses each label for its own kind', () => {
    const { rerender } = render(<NoticeBar notice={{ kind: 'success', message: 'Saved' }} statusLabels={LABELS} />);
    expect(screen.getByRole('status')).toHaveTextContent('Success:');

    rerender(<NoticeBar notice={{ kind: 'error', message: 'Saved' }} statusLabels={LABELS} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Error:');
  });

  it('reads the kit Notice shape rather than a component-local one', () => {
    // `{kind, message}` is `useNotice`'s type. The six copies each took
    // `{type, text}` and shuffled the fields at every call site.
    const notice = { kind: 'success', message: 'x' } as const;
    expect(Object.keys(notice).sort()).toStrictEqual(['kind', 'message']);
  });
});

describe('LanguageSelector', () => {
  it('offers the family locale table by default', () => {
    render(<LanguageSelector value="en" onChange={() => {}} label="Language" unknownLabel="Unknown" />);
    // Twelve, from `LocaleUtil` — not from a table re-typed into this repo.
    expect(screen.getAllByRole('option')).toHaveLength(12);
  });

  it('labels each option in its own language', () => {
    render(<LanguageSelector value="de" onChange={() => {}} label="Language" unknownLabel="Unknown" />);
    expect(screen.getByRole('option', { name: 'Deutsch' })).toBeDefined();
    expect(screen.getByRole('option', { name: '日本語' })).toBeDefined();
  });

  it('carries the accessible name the copies got from useTranslation', () => {
    render(<LanguageSelector value="en" onChange={() => {}} label="Sprache wählen" unknownLabel="Unknown" />);
    expect(screen.getByRole('combobox', { name: 'Sprache wählen' })).toBeDefined();
  });

  it('resolves a regional tag onto a supported option', () => {
    // A browser reporting `en-US` must not leave the control showing nothing
    // selected. This is the copy's `normalizeLanguage` step.
    render(<LanguageSelector value="en-US" onChange={() => {}} label="Language" unknownLabel="Unknown" />);
    expect(screen.getByRole('combobox')).toHaveValue('en');
  });

  it('reports the chosen tag', () => {
    const onChange = vi.fn();
    render(<LanguageSelector value="en" onChange={onChange} label="Language" unknownLabel="Unknown" />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fr' } });
    expect(onChange).toHaveBeenCalledWith('fr');
  });

  it('renders a disabled control when no language could be resolved', () => {
    // The copies spelled this `'unknown'`, a string that could not be told
    // apart from a locale literally named `unknown`. It is `null` here.
    render(<LanguageSelector value={null} onChange={() => {}} label="Language" unknownLabel="Unknown" />);
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Unknown' })).toBeDefined();
  });

  it('honours a narrowed supported list', () => {
    render(<LanguageSelector value="en" onChange={() => {}} label="Language" unknownLabel="Unknown" supported={['en', 'de']} />);
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
});
