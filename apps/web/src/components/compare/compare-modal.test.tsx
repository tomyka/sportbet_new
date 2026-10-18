import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { roundNo } from '@sportbet/domain/testing';
import {
  comparison,
  JONAS,
  side,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import { CompareLink, CompareModalProvider } from './compare-modal';

const compared = comparison(
  side(JONAS, 'jonas', { totalCents: 1000 }),
  side(ZUKAUSKAS, 'zuk', { totalCents: 500 }),
  {
    record: { wins: 1, draws: 0, losses: 0 },
    rounds: [
      { round: roundNo(1), name: '1 turas', meCents: 1000, themCents: 500 },
    ],
  },
);

const ERROR_TEXT = 'Klaida. Bandykite dar kartą.';

const answering = (status: number, body: unknown) =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));

const open = (fetchStub: ReturnType<typeof vi.fn>) => {
  vi.stubGlobal('fetch', fetchStub);
  const onRow = vi.fn();
  render(
    <CompareModalProvider>
      <div onClick={onRow}>
        <CompareLink href="/compare/2" className="x">
          zuk
        </CompareLink>
      </div>
    </CompareModalProvider>,
  );
  return { link: screen.getByRole('link', { name: 'zuk' }), onRow };
};

const opened = async (fetchStub = answering(200, compared)) => {
  const view = open(fetchStub);
  view.link.focus();
  fireEvent.click(view.link);
  await screen.findByText('Bendri statistikos');
  return view;
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

describe('CompareLink and CompareModalProvider (sportbet #cmpModal)', () => {
  it("is the compare page's link until it is clicked, and nothing is open", () => {
    const { link } = open(answering(200, compared));
    expect(link.getAttribute('href')).toBe('/compare/2');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a click opens "Žaidėjų palyginimas" over the page with the card, asked from the same URL', async () => {
    const stub = answering(200, compared);
    const { link, onRow } = open(stub);
    expect(fireEvent.click(link)).toBe(false);
    const dialog = screen.getByRole('dialog', { name: 'Žaidėjų palyginimas' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByTestId('compare-loading')).toBeDefined();
    await screen.findByText('Bendri statistikos');
    expect(screen.queryByTestId('compare-loading')).toBeNull();
    expect(dialog.textContent).toContain('jonas');
    expect(dialog.textContent).toContain('1 turas');
    expect(screen.queryByRole('link', { name: /Atgal/u })).toBeNull();
    expect(stub).toHaveBeenCalledWith('/compare/2/card');
    expect(onRow).not.toHaveBeenCalled();
  });

  it('the close button shuts it, and focus goes back to the link', async () => {
    const { link } = await opened();
    fireEvent.click(screen.getByRole('button', { name: 'Uždaryti' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(link);
  });

  it('Escape shuts it', async () => {
    await opened();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a click on the backdrop shuts it', async () => {
    await opened();
    const backdrop = document.querySelector('[aria-hidden="true"].fixed');
    if (backdrop === null) throw new Error('no backdrop');
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a click inside the dialog leaves it open', async () => {
    await opened();
    fireEvent.click(screen.getByText('Bendri statistikos'));
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('focus moves into the dialog, and the page does not scroll behind it until it shuts', async () => {
    await opened();
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.body.style.overflow).toBe('');
  });

  it('Tab stays in the dialog: from the dialog onto its first element, and round from the last', async () => {
    await opened();
    const close = screen.getByRole('button', { name: 'Uždaryti' });
    expect(fireEvent.keyDown(window, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(close);
    expect(fireEvent.keyDown(window, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(close);
  });

  it('Shift+Tab from the first element goes round to the last', async () => {
    await opened();
    const close = screen.getByRole('button', { name: 'Uždaryti' });
    close.focus();
    expect(fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })).toBe(
      false,
    );
    expect(document.activeElement).toBe(close);
  });

  it('Tab from outside the dialog comes back in', async () => {
    const { link } = await opened();
    link.focus();
    expect(fireEvent.keyDown(window, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Uždaryti' }),
    );
  });

  it.each([
    { status: 404, body: { status: 'not-found' } },
    { status: 200, body: { nope: true } },
    { status: 500, body: null },
  ])("shows sportbet's error for $status", async ({ status, body }) => {
    const { link } = open(answering(status, body));
    fireEvent.click(link);
    expect((await screen.findByRole('alert')).textContent).toBe(ERROR_TEXT);
  });

  it('shows the error when the request fails', async () => {
    const { link } = open(vi.fn(() => Promise.reject(new Error('offline'))));
    fireEvent.click(link);
    expect((await screen.findByRole('alert')).textContent).toBe(ERROR_TEXT);
  });

  it('a guest (401) is taken to the page itself, which sends them to sign in', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    const { link } = open(answering(401, { status: 'guest' }));
    fireEvent.click(link);
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/compare/2');
    });
  });

  it.each([
    { name: 'ctrl', init: { ctrlKey: true } },
    { name: 'meta', init: { metaKey: true } },
    { name: 'shift', init: { shiftKey: true } },
    { name: 'alt', init: { altKey: true } },
    { name: 'middle button', init: { button: 1 } },
  ])('a $name click is left to the browser', ({ init }) => {
    const stub = answering(200, compared);
    const { link, onRow } = open(stub);
    expect(fireEvent.click(link, init)).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stub).not.toHaveBeenCalled();
    expect(onRow).not.toHaveBeenCalled();
  });

  it("outside a provider it is a plain link: the click is not the row's and opens nothing", () => {
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <CompareLink href="/compare/2" className="x">
          zuk
        </CompareLink>
      </div>,
    );
    expect(fireEvent.click(screen.getByRole('link', { name: 'zuk' }))).toBe(
      true,
    );
    expect(onRow).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
