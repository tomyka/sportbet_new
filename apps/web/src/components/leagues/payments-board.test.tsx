import { paymentsMeter, type PaymentsPage } from '@sportbet/domain';
import { leagueNo } from '@sportbet/domain/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { postedBody } from '../../../tests/support/fetch-calls';
import { PaymentsBoard } from './payments-board';

// league-payments-form.blade.php: the meter and one box per member, each
// posting itself (R-123: one amount format).

const TOTALS = { collected: 0, expected: 4000, paidCount: 0, memberCount: 2 };

function pageOf(overrides: Partial<PaymentsPage> = {}): PaymentsPage {
  return {
    league: { id: leagueNo(9), name: 'Draugų lyga' },
    hasFee: true,
    meter: paymentsMeter(TOTALS, true),
    rows: [
      {
        member: 5,
        display: 'Jonas Jonaitis',
        username: 'jonas',
        isGuest: false,
        paid: false,
        amountText: '',
      },
      {
        member: 6,
        display: 'Ona Onaitė',
        username: 'ona',
        isGuest: true,
        paid: true,
        amountText: '12.5',
      },
    ],
    details: { beneficiary: '', iban: '', note: '' },
    ...overrides,
  };
}

const answer = (collectedCents: number, paidCount: number) =>
  Response.json({
    saved: true,
    collected: '0',
    expected: '0',
    collectedCents,
    expectedCents: 4000,
    paidCount,
    memberCount: 2,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(...answers: (() => Promise<Response>)[]) {
  const fetchMock =
    vi.fn<(path: string, init: RequestInit) => Promise<Response>>();
  for (const next of answers) fetchMock.mockImplementationOnce(next);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const boxOf = (name: string): HTMLInputElement => {
  const box = screen.getByLabelText(name);
  if (!(box instanceof HTMLInputElement)) throw new Error('no box');
  return box;
};

describe('PaymentsBoard', () => {
  it('draws the meter, the columns and a box per member holding what is recorded', () => {
    render(<PaymentsBoard page={pageOf()} />);
    expect(screen.getByTestId('collected').textContent).toBe('0.00€');
    expect(screen.getByTestId('expected').textContent).toBe('40.00€');
    expect(screen.getByTestId('count').textContent).toBe('Sumokėjo 0 iš 2');
    for (const heading of ['Dalyvis', 'Būsena', 'Sumokėta (€)']) {
      expect(screen.getByText(heading)).toBeTruthy();
    }
    expect(boxOf('Jonas Jonaitis').value).toBe('');
    expect(boxOf('Ona Onaitė').value).toBe('12.5');
    expect(screen.getByText('jonas')).toBeTruthy();
  });

  it('the label is for the box, the box takes three characters and has no Save button or form', () => {
    const { container } = render(<PaymentsBoard page={pageOf()} />);
    const box = boxOf('Jonas Jonaitis');
    expect(screen.getByText('Jonas Jonaitis').getAttribute('for')).toBe(box.id);
    expect(box.getAttribute('maxlength')).toBe('3');
    expect(box.getAttribute('inputmode')).toBe('numeric');
    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('chips read Nesumokėta and Sumokėta, and a guest member has the Svečias tag', () => {
    render(<PaymentsBoard page={pageOf()} />);
    expect(screen.getByText('Nesumokėta')).toBeTruthy();
    expect(screen.getByText('Sumokėta')).toBeTruthy();
    expect(screen.getAllByText('Svečias')).toHaveLength(1);
  });

  it('a row posts its own id and trimmed text on change; the chip and the meter follow the answer', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(answer(2000, 1)));
    render(<PaymentsBoard page={pageOf()} />);
    fireEvent.change(boxOf('Jonas Jonaitis'), { target: { value: ' 20 ' } });
    await waitFor(() => {
      expect(screen.getByTestId('state-5').textContent).toBe('✓');
    });
    const [path, init] = fetchMock.mock.calls[0] ?? ['', {}];
    expect(path).toBe('/leagues/9/payments/save');
    expect(postedBody(init)).toBe('paid%5B5%5D=20');
    expect(screen.getByTestId('collected').textContent).toBe('20.00€');
    expect(screen.getByTestId('count').textContent).toBe('Sumokėjo 1 iš 2');
    expect(screen.getAllByText('Sumokėta')).toHaveLength(2);
    expect(screen.getByTestId('bar').getAttribute('style')).toContain(
      'width: 50%',
    );
  });

  it('a pot over a thousand keeps its comma after a save (R-123)', async () => {
    stubFetch(() =>
      Promise.resolve(
        Response.json({
          saved: true,
          collected: '1234.50',
          expected: '4000.00',
          collectedCents: 123450,
          expectedCents: 400000,
          paidCount: 1,
          memberCount: 2,
        }),
      ),
    );
    render(<PaymentsBoard page={pageOf()} />);
    fireEvent.change(boxOf('Jonas Jonaitis'), { target: { value: '99' } });
    await waitFor(() => {
      expect(screen.getByTestId('collected').textContent).toBe('1,234.50€');
    });
    expect(screen.getByTestId('expected').textContent).toBe('4,000.00€');
  });

  it('a blank posts paid[id]= and shows Nesumokėta', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(answer(0, 0)));
    render(<PaymentsBoard page={pageOf()} />);
    fireEvent.change(boxOf('Ona Onaitė'), { target: { value: '  ' } });
    await waitFor(() => {
      expect(screen.getByTestId('state-6').textContent).toBe('✓');
    });
    expect(postedBody(fetchMock.mock.calls[0]?.[1] ?? {})).toBe('paid%5B6%5D=');
    expect(screen.getAllByText('Nesumokėta')).toHaveLength(2);
  });

  it('a failure shows Neišsaugota, marks the box and keeps what was typed', async () => {
    stubFetch(() => Promise.resolve(Response.json({}, { status: 422 })));
    render(<PaymentsBoard page={pageOf()} />);
    const box = boxOf('Jonas Jonaitis');
    fireEvent.change(box, { target: { value: 'abc' } });
    await waitFor(() => {
      expect(screen.getByTestId('state-5').textContent).toBe('Neišsaugota');
    });
    expect(box.value).toBe('abc');
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('collected').textContent).toBe('0.00€');
  });

  it('shows Saugoma... while the post is out', async () => {
    let finish: (response: Response) => void = () => undefined;
    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    render(<PaymentsBoard page={pageOf()} />);
    fireEvent.change(boxOf('Jonas Jonaitis'), { target: { value: '5' } });
    await waitFor(() => {
      expect(screen.getByTestId('state-5').textContent).toBe('Saugoma...');
    });
    finish(answer(500, 1));
    await waitFor(() => {
      expect(screen.getByTestId('state-5').textContent).toBe('✓');
    });
  });

  it('two quick changes post in order, one at a time', async () => {
    const order: string[] = [];
    let finishFirst: (response: Response) => void = () => undefined;
    const fetchMock = stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          finishFirst = resolve;
        }),
      () => Promise.resolve(answer(700, 2)),
    );
    render(<PaymentsBoard page={pageOf()} />);
    fireEvent.change(boxOf('Jonas Jonaitis'), { target: { value: '5' } });
    fireEvent.change(boxOf('Ona Onaitė'), { target: { value: '7' } });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    finishFirst(answer(500, 1));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    for (const call of fetchMock.mock.calls) {
      order.push(postedBody(call[1]));
    }
    expect(order).toEqual(['paid%5B5%5D=5', 'paid%5B6%5D=7']);
  });

  it('with no fee there is no "iš" and no bar; with nothing expected the bar is empty', () => {
    const { unmount } = render(
      <PaymentsBoard
        page={pageOf({
          hasFee: false,
          meter: paymentsMeter({ ...TOTALS, expected: 0 }, false),
        })}
      />,
    );
    expect(screen.queryByTestId('expected')).toBeNull();
    expect(screen.queryByText(/iš 40/u)).toBeNull();
    expect(screen.queryByTestId('bar')).toBeNull();
    unmount();
    render(
      <PaymentsBoard
        page={pageOf({
          meter: paymentsMeter({ ...TOTALS, expected: 0 }, true),
        })}
      />,
    );
    expect(screen.getByTestId('bar').getAttribute('style')).toContain(
      'width: 0%',
    );
  });
});
