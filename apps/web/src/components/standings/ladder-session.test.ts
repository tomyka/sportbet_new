import { team } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  FIXTURE_ROWS,
  fixtureRow,
  savedRows,
  standingsView,
} from '../../../tests/support/standings-views';
import {
  ANNOUNCE_DELAY_MS,
  createLadderSession,
  ERROR_RING_MS,
  REORDER_DELAY_MS,
  type LadderPosts,
  type LadderState,
  type LadderTimer,
} from './ladder-session';
import type { StandingsOutcome } from './standings-answer';
import type { StandingsRowRequest } from './standings-protocol';

// The ladder's save orchestration without the DOM (#24): one queue, the
// debounced order, a tick flushing a waiting order, a row posting its place
// as last saved, the rollbacks and R-79's button.

const row = fixtureRow;
const ROWS = FIXTURE_ROWS;
const page = standingsView;
/** Every row's place saved, in ROWS' order. */
const saved = () => standingsView({ rows: savedRows() });

const SAVED: StandingsOutcome = { kind: 'saved' };
const refused = (message: string): StandingsOutcome => ({
  kind: 'refused',
  message,
});

/** A timer moved by hand: `advance(ms)` runs what falls due, in order. */
function fakeTimer() {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; run: () => void }>();
  const timer: LadderTimer = {
    set: (run, ms) => {
      const handle = next;
      next += 1;
      due.set(handle, { at: now + ms, run });
      return handle;
    },
    clear: (handle) => {
      due.delete(handle);
    },
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const [handle, first] =
        [...due].sort(([, a], [, b]) => a.at - b.at)[0] ?? [];
      if (handle === undefined || first === undefined || first.at > until)
        break;
      due.delete(handle);
      now = first.at;
      first.run();
    }
    now = until;
  };
  return { timer, advance };
}

type Sent =
  | { readonly kind: 'row'; readonly request: StandingsRowRequest }
  | { readonly kind: 'order'; readonly teams: readonly string[] };

/**
 * Posts that record what is sent and answer as told: each kind's answers
 * in turn (the last repeats; saved when none), or held until `release`.
 */
function fakePosts(
  answers: {
    readonly row?: readonly StandingsOutcome[];
    readonly order?: readonly StandingsOutcome[];
  } = {},
) {
  const sent: Sent[] = [];
  const held: (() => void)[] = [];
  let holding = false;
  const count = { row: 0, order: 0 };
  const answer = (kind: 'row' | 'order'): Promise<StandingsOutcome> => {
    const list = answers[kind] ?? [];
    const outcome = list[Math.min(count[kind], list.length - 1)] ?? SAVED;
    count[kind] += 1;
    if (!holding) return Promise.resolve(outcome);
    return new Promise((resolve) => {
      held.push(() => {
        resolve(outcome);
      });
    });
  };
  /** The session's state as each post is sent (set by start). */
  const seen: LadderState[] = [];
  let peek: (() => LadderState) | null = null;
  const look = () => {
    if (peek !== null) seen.push(peek());
  };
  const post: LadderPosts = {
    row: (request) => {
      look();
      sent.push({ kind: 'row', request });
      return answer('row');
    },
    order: (teams) => {
      look();
      sent.push({ kind: 'order', teams: [...teams] });
      return answer('order');
    },
  };
  return {
    post,
    sent,
    seen,
    watch: (state: () => LadderState) => {
      peek = state;
    },
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      for (const run of held.splice(0)) run();
    },
  };
}

/** Lets every answer already given settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function start(view = page(), answers?: Parameters<typeof fakePosts>[0]) {
  const { timer, advance } = fakeTimer();
  const posts = fakePosts(answers);
  const states: LadderState[] = [];
  const session = createLadderSession({
    view,
    post: posts.post,
    timer,
    onChange: (state) => states.push(state),
  });
  posts.watch(session.state);
  return { session, advance, ...posts };
}

// What the tests read of a state, in one place.
const shown = (state: LadderState) => state.view.rows.map((each) => each.name);
const placeOf = (state: LadderState, name: string) =>
  state.view.rows.find((each) => each.name === name)?.place;

describe('move: the order, debounced (REORDER_DELAY_MS)', () => {
  it('shows the move at once and posts the whole order once the moves pause', async () => {
    const { session, advance, sent } = start();
    session.move(0, 1);
    session.move(1, 2);
    expect(shown(session.state())).toEqual([
      'Zalgiris',
      'Real Madrid',
      'Olympiacos',
    ]);
    advance(REORDER_DELAY_MS - 1);
    expect(sent).toEqual([]);
    advance(1);
    await settle();
    expect(sent).toEqual([{ kind: 'order', teams: ['2', '3', '1'] }]);
  });

  it('a move past either end changes nothing and posts nothing', async () => {
    const { session, advance, sent } = start();
    session.move(0, -1);
    session.move(2, 3);
    advance(REORDER_DELAY_MS);
    await settle();
    expect(shown(session.state())).toEqual([
      'Olympiacos',
      'Zalgiris',
      'Real Madrid',
    ]);
    expect(sent).toEqual([]);
  });

  it('announces ":team - :position vieta iš :total" a beat later (psAnnounce)', () => {
    const { session, advance } = start();
    session.move(0, 1);
    expect(session.state().live).toBe('');
    advance(ANNOUNCE_DELAY_MS);
    expect(session.state().live).toBe('Olympiacos - 2 vieta iš 3');
  });
});

describe('drop: the order at once', () => {
  it('posts without waiting, taking a waiting order with it', async () => {
    const { session, sent } = start();
    session.move(0, 1);
    session.drop(2, 0);
    await settle();
    expect(sent).toEqual([{ kind: 'order', teams: ['3', '2', '1'] }]);
  });
});

describe('a refused order', () => {
  it('puts the last saved order back, says so and rings the card for 1.5 s', async () => {
    const { session, advance } = start(saved(), {
      order: [refused('Prognozių laikas baigėsi.')],
    });
    session.move(2, 1);
    advance(REORDER_DELAY_MS);
    await settle();
    expect(shown(session.state())).toEqual([
      'Olympiacos',
      'Zalgiris',
      'Real Madrid',
    ]);
    expect(session.state().ring).toBe(true);
    advance(ANNOUNCE_DELAY_MS);
    expect(session.state().live).toBe(
      'Tvarkos išsaugoti nepavyko, grąžinta ankstesnė.',
    );
    advance(ERROR_RING_MS);
    expect(session.state().ring).toBe(false);
  });

  it('a row saved after it posts the place last saved, not the one shown before the refusal (QA)', async () => {
    const { session, advance, sent } = start(saved(), {
      order: [refused('Prognozių laikas baigėsi.')],
    });
    session.move(2, 1);
    session.tick(team('3'), 'playOffs', true);
    advance(0);
    await settle();
    expect(sent).toEqual([
      { kind: 'order', teams: ['1', '3', '2'] },
      {
        kind: 'row',
        request: {
          team: '3',
          place: 3,
          playOffs: true,
          finalFour: false,
          finalPlace: null,
        },
      },
    ]);
    expect(shown(session.state())).toEqual([
      'Olympiacos',
      'Zalgiris',
      'Real Madrid',
    ]);
  });
});

describe('R-79: saveShownOrder', () => {
  it('posts the order as shown; saved, every row has its place and placesSaved is true', async () => {
    const { session, sent } = start();
    session.saveShownOrder();
    await settle();
    expect(sent).toEqual([{ kind: 'order', teams: ['1', '2', '3'] }]);
    const state = session.state();
    expect(state.view.placesSaved).toBe(true);
    expect(placeOf(state, 'Real Madrid')).toBe(3);
    expect(state.view.counts.places).toBe(3);
  });
});

describe('a move made while an order is in flight', () => {
  it('is kept when that order is saved, and posted after it', async () => {
    const { session, advance, sent, hold, release } = start();
    hold();
    session.move(0, 1);
    advance(REORDER_DELAY_MS);
    await settle();
    session.move(2, 0);
    release();
    await settle();
    expect(shown(session.state())).toEqual([
      'Real Madrid',
      'Zalgiris',
      'Olympiacos',
    ]);
    expect(placeOf(session.state(), 'Real Madrid')).toBe(3);
    advance(REORDER_DELAY_MS);
    await settle();
    expect(sent).toEqual([
      { kind: 'order', teams: ['2', '1', '3'] },
      { kind: 'order', teams: ['3', '2', '1'] },
    ]);
  });
});

describe('a refused row put back after an order was saved', () => {
  it('keeps the place that order saved', async () => {
    const { session, advance, sent, hold, release } = start(page(), {
      row: [refused('1/4 etape jau pažymėta 8 komandų.'), SAVED],
    });
    hold();
    session.saveShownOrder();
    session.tick(team('2'), 'playOffs', true);
    release();
    await settle();
    await settle();
    expect(placeOf(session.state(), 'Zalgiris')).toBe(2);
    expect(session.state().view.rows[1]?.playOffs).toBeNull();
    session.tick(team('2'), 'playOffs', true);
    advance(0);
    await settle();
    expect(sent.at(-1)).toEqual({
      kind: 'row',
      request: {
        team: '2',
        place: 2,
        playOffs: true,
        finalFour: false,
        finalPlace: null,
      },
    });
  });
});

describe('a refusal is applied before the next queued post is sent', () => {
  it('a refused order: the row queued behind it sees the last saved order back and the ring on', async () => {
    const { session, sent, seen, hold, release } = start(saved(), {
      order: [refused('Prognozių laikas baigėsi.')],
    });
    hold();
    session.drop(2, 0);
    session.tick(team('1'), 'playOffs', true);
    release();
    await settle();
    expect(sent.map((each) => each.kind)).toEqual(['order', 'row']);
    const atRow = seen[1];
    expect(atRow && shown(atRow)).toEqual([
      'Olympiacos',
      'Zalgiris',
      'Real Madrid',
    ]);
    expect(atRow?.ring).toBe(true);
  });

  it('a refused row: the post queued behind it sees the row put back and its message', async () => {
    const { session, sent, seen, hold, release } = start(page(), {
      row: [refused('1/4 etape jau pažymėta 8 komandų.'), SAVED],
    });
    hold();
    session.tick(team('2'), 'playOffs', true);
    session.saveShownOrder();
    release();
    await settle();
    expect(sent.map((each) => each.kind)).toEqual(['row', 'order']);
    const atOrder = seen[1];
    expect(atOrder?.view.rows[1]?.playOffs).toBeNull();
    expect(atOrder?.messages[team('2')]).toBe(
      '1/4 etape jau pažymėta 8 komandų.',
    );
  });
});

describe('one queue (decision 5)', () => {
  it('a tick sends a waiting order first, then the row with its place as just saved', async () => {
    const { session, sent, hold, release } = start(saved());
    hold();
    session.move(2, 1);
    session.tick(team('3'), 'playOffs', true);
    await settle();
    // The order went at once; the row waits for its answer.
    expect(sent).toEqual([{ kind: 'order', teams: ['1', '3', '2'] }]);
    release();
    await settle();
    release();
    await settle();
    expect(sent).toEqual([
      { kind: 'order', teams: ['1', '3', '2'] },
      {
        kind: 'row',
        request: {
          team: '3',
          place: 2,
          playOffs: true,
          finalFour: false,
          finalPlace: null,
        },
      },
    ]);
  });

  it('the flushed order is not posted again when its delay runs out (as ladder.test.tsx asserted before #24)', async () => {
    const { session, advance, sent } = start(saved());
    session.move(2, 1);
    session.tick(team('3'), 'playOffs', true);
    await settle();
    await settle();
    expect(sent.map((each) => each.kind)).toEqual(['order', 'row']);
    advance(REORDER_DELAY_MS);
    await settle();
    expect(sent).toHaveLength(2);
  });
});

describe('a row save', () => {
  it('posts the row kept to R-78 (the table mends it): a final place without a Final Four tick cleared', async () => {
    const { session, sent } = start(
      page({
        rows: [
          row(1, 'Olympiacos', {
            playOffs: false,
            finalFour: false,
            finalPlace: 1,
          }),
          ...ROWS.slice(1),
        ],
      }),
    );
    session.tick(team('1'), 'playOffs', true);
    await settle();
    expect(sent).toEqual([
      {
        kind: 'row',
        request: {
          team: '1',
          place: null,
          playOffs: true,
          finalFour: false,
          finalPlace: null,
        },
      },
    ]);
  });

  it('refused: the row goes back and shows the message (R-59); a later save clears it', async () => {
    const { session } = start(page(), {
      row: [refused('1/4 etape jau pažymėta 8 komandų.'), SAVED],
    });
    session.tick(team('2'), 'playOffs', true);
    await settle();
    let state = session.state();
    expect(state.messages[team('2')]).toBe('1/4 etape jau pažymėta 8 komandų.');
    expect(state.view.rows[1]?.playOffs).toBeNull();
    session.tick(team('2'), 'playOffs', true);
    await settle();
    state = session.state();
    expect(state.messages[team('2')]).toBeUndefined();
    expect(state.view.rows[1]?.playOffs).toBe(true);
  });

  it('a final place: blank, 1 or 2 posted; anything else not', async () => {
    const { session, sent } = start(
      page({
        rows: [
          row(1, 'Olympiacos', { playOffs: true, finalFour: true }),
          ...ROWS.slice(1),
        ],
      }),
    );
    session.finalPlace(team('1'), '3');
    session.finalPlace(team('1'), '2');
    await settle();
    expect(sent).toEqual([
      {
        kind: 'row',
        request: {
          team: '1',
          place: null,
          playOffs: true,
          finalFour: true,
          finalPlace: 2,
        },
      },
    ]);
  });
});

describe('dispose', () => {
  it('sends an order still waiting for the moves to pause', async () => {
    const { session, sent } = start();
    session.move(0, 1);
    session.dispose();
    await settle();
    expect(sent).toEqual([{ kind: 'order', teams: ['2', '1', '3'] }]);
  });
});

describe('onChange', () => {
  it('is told every new state', () => {
    const { timer } = fakeTimer();
    const states: LadderState[] = [];
    const session = createLadderSession({
      view: page(),
      post: fakePosts().post,
      timer,
      onChange: (state) => states.push(state),
    });
    session.move(0, 1);
    expect(states.at(-1)).toBe(session.state());
    expect(shown(states.at(-1) ?? session.state())[0]).toBe('Zalgiris');
  });
});
