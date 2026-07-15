const TRANSITIONS = {
  boot:      { TIP_READY: 'tipShown' },
  tipShown:  { HOVER_SLOT: 'placing', PLACE: 'placed' },
  placing:   { PLACE: 'placed', LEAVE_SLOT: 'tipShown' },
  placed:    { LOAD_PRESSED: 'loading' },
  loading:   { READY: 'paused', ERROR: 'placed' },
  playing:   { TOGGLE_PLAY: 'paused', ENDED: 'playing' },
  paused:    { TOGGLE_PLAY: 'playing' }
};

export function createMachine(initial = 'boot') {
  let state = initial;
  const subs = new Set();

  return {
    get state() { return state; },
    send(event) {
      const next = TRANSITIONS[state]?.[event];
      if (next && next !== state) {
        state = next;
        subs.forEach(fn => fn(state));
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    }
  };
}
