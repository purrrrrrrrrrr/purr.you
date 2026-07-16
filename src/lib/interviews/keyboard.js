/**
 * @param {{ state: string, send: (event: string) => void }} machine
 * @param {{ toggle: () => void, back15: () => void, fwd15: () => void, prev: () => void, next: () => void }} actions
 */
export function bindKeyboard(machine, actions) {
  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (machine.state !== 'playing' && machine.state !== 'paused') return;
    const k = e.key;
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); actions.toggle(); }
    else if (k === 'ArrowLeft')  { e.preventDefault(); actions.back15(); }
    else if (k === 'ArrowRight') { e.preventDefault(); actions.fwd15(); }
    else if (k === '[')          { e.preventDefault(); actions.prev(); }
    else if (k === ']')          { e.preventDefault(); actions.next(); }
  }
  window.addEventListener('keydown', onKeydown);
  return () => window.removeEventListener('keydown', onKeydown);
}
