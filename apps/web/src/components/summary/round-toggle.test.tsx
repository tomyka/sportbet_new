import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoundGroup } from './round-toggle';

const columns = [
  { key: '1', text: '12.5', me: true },
  { key: '2', text: '', me: false },
];

const group = (defaultOpen: boolean) =>
  render(
    <table>
      <RoundGroup
        name="1 turas"
        count={2}
        columns={columns}
        defaultOpen={defaultOpen}
      >
        <tr>
          <td>game row</td>
        </tr>
      </RoundGroup>
    </table>,
  );

describe("RoundGroup (a round's header row and its games)", () => {
  it('the header: a chevron button with the round\'s name and "(n)"', () => {
    group(true);
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('1 turas(2)');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.querySelector('[data-icon="chevron-down"]')).not.toBeNull();
  });

  it('an open round shows its games, and the toggle folds them', () => {
    group(true);
    expect(screen.getByText('game row')).toBeDefined();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('game row')).toBeNull();
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(
      screen.getByRole('button').querySelector('[data-icon="chevron-right"]'),
    ).not.toBeNull();
  });

  it('a folded round hides its games until the toggle shows them', () => {
    group(false);
    expect(screen.queryByText('game row')).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('game row')).toBeDefined();
  });

  it("the round sums, with the viewer's marked", () => {
    group(true);
    const sums = screen.getAllByTestId('sr-round-total');
    expect(sums.map((each) => each.textContent)).toEqual(['12.5', '']);
    expect(sums.map((each) => each.getAttribute('data-me'))).toEqual([
      'true',
      null,
    ]);
  });
});
