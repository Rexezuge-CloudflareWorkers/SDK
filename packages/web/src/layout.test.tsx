// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AppPage } from './AppPage';
import { PageHeaderCard } from './PageHeaderCard';
import { ContextBar } from './ContextBar';
import { Unauthorized } from './Unauthorized';

afterEach(() => {
  cleanup();
});

describe('AppPage', () => {
  it('defaults to the wide measure', () => {
    const { container } = render(<AppPage>content</AppPage>);
    // Edge-Sonic's `max-w-5xl`, over the three copies' `max-w-7xl`. See the
    // file header: the wider measure only added line length.
    expect(container.firstElementChild).toHaveClass('max-w-5xl');
  });

  it('uses the narrow measure for centered forms', () => {
    const { container } = render(<AppPage variant="narrow">content</AppPage>);
    expect(container.firstElementChild).toHaveClass('max-w-2xl');
  });

  it('keeps a hero no wider than the page it introduces', () => {
    const { container } = render(<AppPage variant="hero">content</AppPage>);
    // A hero wider than `wide` is a layout bug, not a style.
    expect(container.firstElementChild).toHaveClass('max-w-5xl');
    expect(container.firstElementChild).not.toHaveClass('max-w-7xl');
  });

  it('lets className override the variant, as the header says it can', () => {
    const { container } = render(<AppPage className="max-w-7xl">content</AppPage>);
    expect(container.firstElementChild).toHaveClass('max-w-7xl');
  });

  it('renders its children', () => {
    render(<AppPage>the page body</AppPage>);
    expect(screen.getByText('the page body')).toBeDefined();
  });
});

describe('PageHeaderCard', () => {
  it('renders the title as the page heading', () => {
    render(<PageHeaderCard title="Dashboard" description="Your volumes" />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeDefined();
  });

  it('renders the description when there is one', () => {
    render(<PageHeaderCard title="Settings" description="Profile and preferences" />);
    expect(screen.getByText('Profile and preferences')).toBeDefined();
  });

  it('omits the avatar slot entirely when no icon is given', () => {
    // An empty avatar circle reads as a broken image.
    const { container } = render(<PageHeaderCard title="Settings" description="" />);
    expect(container.querySelector('.rounded-full')).toBeNull();
  });

  it('renders the icon when given one', () => {
    render(<PageHeaderCard title="Settings" description="" icon={<span data-testid="avatar">*</span>} />);
    expect(screen.getByTestId('avatar')).toBeDefined();
  });

  it('renders actions when given them', () => {
    render(<PageHeaderCard title="Settings" description="" actions={<button type="button">Save</button>} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
  });
});

describe('ContextBar', () => {
  it('renders the home link, the crumb and the actions', () => {
    render(<ContextBar home={<a href="/">Home</a>} crumb={<span>Volume</span>} actions={<button type="button">Refresh</button>} />);
    expect(screen.getByRole('link', { name: 'Home' })).toBeDefined();
    expect(screen.getByText('Volume')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDefined();
  });

  it('keeps the home link the caller rendered, rather than imposing a router', () => {
    // The three copies each imported `react-router-dom` solely for this anchor.
    // Passing it in is what lets the bar work under any router.
    render(
      <ContextBar
        home={
          <button type="button" onClick={() => undefined}>
            Home
          </button>
        }
        crumb={<span>Settings</span>}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: 'Home' })).toBeDefined();
  });

  it('hides the separator from assistive tech', () => {
    // The home link and the crumb already separate these regions; a stray "/"
    // read aloud between them is noise.
    const { container } = render(<ContextBar home={<a href="/">Home</a>} crumb={<span>Volume</span>} />);
    const separator = container.querySelector('span[aria-hidden="true"]');
    expect(separator?.textContent).toBe('/');
  });

  it('omits the actions slot when there are none', () => {
    const { container } = render(<ContextBar home={<a href="/">Home</a>} crumb={<span>Volume</span>} />);
    expect(container.querySelector('.ml-auto')).toBeNull();
  });
});

describe('Unauthorized', () => {
  it('renders the title, message and action', () => {
    render(
      <Unauthorized
        title="Access Required"
        message="You must authenticate to access this page."
        actionLabel="Sign In With Cloudflare Access"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Access Required' })).toBeDefined();
    expect(screen.getByText('You must authenticate to access this page.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sign In With Cloudflare Access' })).toBeDefined();
  });

  it('omits the paragraph entirely when no message is given', () => {
    // A blank line under the heading reads as a rendering bug.
    const { container } = render(<Unauthorized title="Access Required" actionLabel="Sign In" />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('calls the supplied handler rather than navigating', () => {
    // jsdom refuses to navigate, which is why all seven copies' button branch
    // had no assertions at all.
    const onAuthenticate = vi.fn();
    render(<Unauthorized title="Access Required" actionLabel="Sign In" onAuthenticate={onAuthenticate} />);

    screen.getByRole('button', { name: 'Sign In' }).click();
    expect(onAuthenticate).toHaveBeenCalledTimes(1);
  });
});
