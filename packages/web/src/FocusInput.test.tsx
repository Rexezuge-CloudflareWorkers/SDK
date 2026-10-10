// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FocusInput } from './FocusInput';

afterEach(cleanup);

describe('FocusInput', () => {
  it('renders a text field with the shared field styling', () => {
    render(<FocusInput placeholder="Account name" />);
    const field = screen.getByPlaceholderText('Account name');
    expect(field).toHaveClass('w-full', 'rounded-lg', 'px-3', 'py-2');
  });

  it('forwards the standard input attributes, autoFocus included', () => {
    render(<FocusInput autoFocus aria-label="Search" defaultValue="bucket" />);
    expect(screen.getByLabelText('Search')).toHaveValue('bucket');
    expect(document.activeElement).toBe(screen.getByLabelText('Search'));
  });

  it('paints its border while it holds focus, and restores it on blur', () => {
    render(<FocusInput />);
    const field = screen.getByRole('textbox');
    // `--color-border` is `#374151`; the focus treatment paints `#3b82f6`.
    expect(field).toHaveStyle({ borderColor: 'rgb(55, 65, 81)' });

    fireEvent.focus(field);
    expect(field).toHaveStyle({ borderColor: 'rgb(59, 130, 246)' });

    fireEvent.blur(field);
    expect(field).toHaveStyle({ borderColor: 'rgb(55, 65, 81)' });
  });

  it('calls the caller focus and blur handlers too', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    render(<FocusInput onFocus={onFocus} onBlur={onBlur} />);
    const field = screen.getByRole('textbox');
    fireEvent.focus(field);
    fireEvent.blur(field);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('lets a caller style override win over the focus affordance', () => {
    render(<FocusInput style={{ borderColor: '#663399' }} />);
    const field = screen.getByRole('textbox');
    expect(field).toHaveStyle({ borderColor: '#663399' });
    fireEvent.focus(field);
    expect(field).toHaveStyle({ borderColor: '#663399' });
  });
});
