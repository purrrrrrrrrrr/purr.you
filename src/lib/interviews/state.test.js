import { describe, it, expect } from 'vitest';
import { createMachine } from './state.js';

describe('state machine', () => {
  it('starts in boot', () => {
    const m = createMachine();
    expect(m.state).toBe('boot');
  });

  it('boot → tipShown on TIP_READY', () => {
    const m = createMachine();
    m.send('TIP_READY');
    expect(m.state).toBe('tipShown');
  });

  it('tipShown → placing on HOVER_SLOT', () => {
    const m = createMachine();
    m.send('TIP_READY');
    m.send('HOVER_SLOT');
    expect(m.state).toBe('placing');
  });

  it('placing → placed on PLACE', () => {
    const m = createMachine();
    m.send('TIP_READY');
    m.send('HOVER_SLOT');
    m.send('PLACE');
    expect(m.state).toBe('placed');
  });

  it('placed → loading on LOAD_PRESSED', () => {
    const m = createMachine();
    m.send('TIP_READY');
    m.send('PLACE');
    m.send('LOAD_PRESSED');
    expect(m.state).toBe('loading');
  });

  it('loading → paused on READY', () => {
    const m = createMachine();
    m.send('TIP_READY');
    m.send('PLACE');
    m.send('LOAD_PRESSED');
    m.send('READY');
    expect(m.state).toBe('paused');
  });

  it('paused toggles to playing and back on TOGGLE_PLAY', () => {
    const m = createMachine();
    ['TIP_READY', 'PLACE', 'LOAD_PRESSED', 'READY'].forEach(e => m.send(e));
    m.send('TOGGLE_PLAY');
    expect(m.state).toBe('playing');
    m.send('TOGGLE_PLAY');
    expect(m.state).toBe('paused');
  });

  it('notifies subscribers on transition', () => {
    const m = createMachine();
    /** @type {string[]} */
    const seen = [];
    m.subscribe(s => seen.push(s));
    m.send('TIP_READY');
    expect(seen).toEqual(['tipShown']);
  });

  it('ignores unknown events in current state', () => {
    const m = createMachine();
    m.send('TOGGLE_PLAY');
    expect(m.state).toBe('boot');
  });
});
