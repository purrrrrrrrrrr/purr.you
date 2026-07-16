/** @type {Record<string, Record<string, string>>} */
const TRANSITIONS = {
  boot:      { TIP_READY: 'tipShown' },
  tipShown:  { HOVER_SLOT: 'placing', PLACE: 'placed' },
  placing:   { PLACE: 'placed', LEAVE_SLOT: 'tipShown' },
  placed:    { LOAD_PRESSED: 'loading' },
  loading:   { READY: 'paused', ERROR: 'placed' },
  playing:   { TOGGLE_PLAY: 'paused', ENDED: 'playing' },
  paused:    { TOGGLE_PLAY: 'playing' }
};

/**
 * @param {string} [initial]
 */
export function createMachine(initial = 'boot') {
  let state = initial;
  /** @type {Set<(state: string) => void>} */
  const subs = new Set();

  return {
    get state() { return state; },
    /** @param {string} event */
    send(event) {
      const next = TRANSITIONS[state]?.[event];
      if (next && next !== state) {
        state = next;
        subs.forEach(fn => fn(state));
      }
    },
    /** @param {(state: string) => void} fn */
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    }
  };
}
