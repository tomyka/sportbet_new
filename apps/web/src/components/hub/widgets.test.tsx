import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TIP_OFF } from '../../../tests/support/hub-cards';
import {
  HowItWorks,
  LeadersPanel,
  MedalsPanel,
  StatsPanel,
  UpcomingGames,
} from './widgets';

describe('HowItWorks (R-52)', () => {
  it("how it works: sportbet's three items, the second speaking of points, not goals", () => {
    render(<HowItWorks />);
    const box = screen.getByTestId('how-it-works');
    expect(within(box).getByText('Kaip tai veikia?')).toBeDefined();
    expect(box.textContent).toContain('Spėk rungtynių rezultatus');
    expect(box.textContent).toContain(
      'Prognozuok tikslų rezultatą prieš kiekvieną rungtynę',
    );
    expect(box.textContent).toContain(
      'Taškus gauni už tikslų rezultatą, nugalėtoją ir taškų skirtumą',
    );
    expect(box.textContent).not.toContain('įvarčių');
    expect(box.textContent).toContain(
      'Sukurk privačią lygą su draugais arba prisijunk prie esamos',
    );
  });
});

describe('UpcomingGames (R-51)', () => {
  it('next games: each in Vilnius time, home vs away', () => {
    render(
      <UpcomingGames
        games={[
          {
            id: 1,
            tipOff: TIP_OFF,
            home: 'Zalgiris Kaunas',
            away: 'Real Madrid',
          },
        ]}
      />,
    );
    const list = screen.getByTestId('upcoming-games');
    expect(within(list).getByText('Artėjančios rungtynės')).toBeDefined();
    expect(list.textContent).toContain('spalio 6 d., 21:00');
    expect(list.textContent).toContain('Zalgiris Kaunas vs Real Madrid');
  });
});

describe('LeadersPanel', () => {
  it('leaders: rank, username and the total to one decimal in "pt"; "Visos vietos →" to the leaderboard (hub.blade.php)', () => {
    render(
      <LeadersPanel
        leaders={[
          { rank: 1, username: 'ada', totalCents: 12345 },
          { rank: 2, username: 'ben', totalCents: 1000 },
          { rank: 2, username: 'cai', totalCents: 1000 },
          { rank: 4, username: 'dan', totalCents: -50 },
        ]}
      />,
    );
    const panel = screen.getByTestId('leaders');
    const rows = within(panel).getAllByTestId('leader');
    expect(rows.map((row) => row.getAttribute('data-rank'))).toEqual([
      '1',
      '2',
      '2',
      '4',
    ]);
    expect(rows[0]?.textContent).toContain('ada');
    expect(rows[0]?.textContent).toContain('123.5 pt');
    expect(rows[3]?.textContent).toContain('4');
    expect(rows[3]?.textContent).toContain('-0.5 pt');
    expect(
      within(panel)
        .getByRole('link', { name: 'Visos vietos →' })
        .getAttribute('href'),
    ).toBe('/leaderboard');
  });
});

describe('MedalsPanel', () => {
  it('medals: each team with its crest and its four counts', () => {
    render(
      <MedalsPanel
        medals={[
          { team: 'Real Madrid', first: 2, second: 1, third: 0, fourth: 0 },
        ]}
      />,
    );
    const row = within(screen.getByTestId('medals')).getByTestId('medal-row');
    expect(row.querySelector('img')?.getAttribute('src')).toBe(
      '/img/teams/real%20madrid.png',
    );
    expect(row.querySelector('img')?.getAttribute('alt')).toBe('Real Madrid');
    expect(
      [...row.querySelectorAll('[data-testid="medal-count"]')].map(
        (each) => each.textContent,
      ),
    ).toEqual(['2', '1', '0', '0']);
  });

  it("medals: each place in its own medal's colour (.pos-1 to .pos-4), a zero faded (.pos-zero)", () => {
    render(
      <MedalsPanel
        medals={[
          { team: 'Real Madrid', first: 2, second: 1, third: 0, fourth: 3 },
        ]}
      />,
    );
    const badges = [
      ...screen.getByTestId('medal-row').querySelectorAll('[data-place]'),
    ];
    expect(
      badges.map((badge) => badge.className.includes('bg-medal-')),
    ).toEqual([true, true, true, true]);
    expect(badges[0]?.className).toContain('bg-medal-1');
    expect(badges[3]?.className).toContain('bg-medal-4');
    expect(
      badges.map((badge) => badge.className.includes('opacity-30')),
    ).toEqual([false, false, true, false]);
  });

  it('medals: the hub titles it "Finalų prognozės"; a league\'s card (standings.blade.php) "Finalų dalyvių prognozės"', () => {
    const medals = [
      { team: 'Real Madrid', first: 2, second: 1, third: 0, fourth: 0 },
    ];
    const { unmount } = render(<MedalsPanel medals={medals} />);
    expect(screen.getByText('Finalų prognozės')).toBeDefined();
    unmount();
    render(<MedalsPanel medals={medals} variant="league" />);
    const title = screen.getByText('Finalų dalyvių prognozės');
    expect(title.className).toContain('uppercase');
    expect(screen.getByTestId('medals').className).toContain('bg-card');
  });
});

describe('StatsPanel', () => {
  it('stats: the players, and the predictions with thousands marked when there are any', () => {
    render(<StatsPanel participants={42} predictions={1234} />);
    const panel = screen.getByTestId('stats');
    expect(panel.textContent).toContain('42');
    expect(panel.textContent).toContain('dalyviai');
    expect(panel.textContent).toContain('1,234');
    expect(panel.textContent).toContain('prognozės');
  });

  it('stats: no predictions line while there are none', () => {
    render(<StatsPanel participants={1} predictions={0} />);
    expect(screen.getByTestId('stats').textContent).not.toContain('prognozės');
  });
});
