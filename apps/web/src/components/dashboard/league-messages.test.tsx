import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeagueMessages } from './league-messages';

// partials/messages.blade.php: bold lines, escaped, in order (R-122).

describe('the league messages', () => {
  it('draws each message as a bold line, in the order given', () => {
    const { container } = render(
      <LeagueMessages messages={['Pirma žinutė', 'Antra žinutė']} />,
    );
    const lines = [...(container.firstElementChild?.children ?? [])];
    expect(lines.map((line) => line.textContent)).toEqual([
      'Pirma žinutė',
      'Antra žinutė',
    ]);
    expect(lines.every((line) => line.className.includes('font-bold'))).toBe(
      true,
    );
  });

  it('a message is escaped: <b>x</b> shows literally', () => {
    const { container } = render(
      <LeagueMessages messages={['<b>x</b><img src=x onerror=alert(1)>']} />,
    );
    expect(
      screen.getByText('<b>x</b><img src=x onerror=alert(1)>'),
    ).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('two equal messages are both drawn', () => {
    render(<LeagueMessages messages={['Tas pats', 'Tas pats']} />);
    expect(screen.getAllByText('Tas pats')).toHaveLength(2);
  });

  it('draws nothing for none', () => {
    const { container } = render(<LeagueMessages messages={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
