const MOBILE_MAX = 899;

const COPY = {
  insert: { desktop: 'INSERT DATABUN', mobile: 'TAP TO INSERT DATABUN' },
  click:  { desktop: 'CLICK TO PLACE', mobile: 'TAP TO INSERT DATABUN' },
  load:   { desktop: 'LOAD DATA',      mobile: 'LOAD DATA' }
};

function variant() {
  return window.innerWidth <= MOBILE_MAX ? 'mobile' : 'desktop';
}

/** @param {HTMLElement} el */
export function createTip(el) {
  const textEl = /** @type {HTMLElement} */ (el.querySelector('.tip-wrapper'));
  let idlePromise = Promise.resolve();

  /** @param {keyof typeof COPY} key */
  function setText(key) {
    textEl.textContent = COPY[key][variant()];
  }

  /** @param {() => void} setContent */
  function transition(setContent) {
    if (!el.classList.contains('shown')) {
      setContent();
      return;
    }
    el.classList.add('fading');
    setTimeout(() => {
      el.style.transition = 'none';
      el.classList.remove('fading', 'shown');
      setContent();
      requestAnimationFrame(() => {
        el.style.transition = '';
        requestAnimationFrame(() => el.classList.add('shown'));
      });
    }, 300);
  }

  return {
    /** @param {keyof typeof COPY} key */
    show(key) {
      setText(key);
      el.classList.add('active');
      requestAnimationFrame(() => el.classList.add('shown'));
    },
    /**
     * @param {string} text
     * @param {(() => void) | undefined} [onShown]
     */
    showText(text, onShown) {
      textEl.textContent = text;
      el.classList.add('active');
      requestAnimationFrame(() => {
        el.classList.add('shown');
        if (onShown) {
          /** @param {TransitionEvent} e */
          const handler = (e) => {
            if (e.propertyName !== 'clip-path') return;
            el.removeEventListener('transitionend', handler);
            onShown();
          };
          el.addEventListener('transitionend', handler);
        }
      });
    },
    /** @param {keyof typeof COPY} key */
    setKey(key) { transition(() => setText(key)); },
    hide() {
      if (!el.classList.contains('shown')) return;
      el.classList.add('fading');
      idlePromise = new Promise((resolve) => {
        setTimeout(() => {
          el.style.transition = 'none';
          el.classList.remove('fading', 'shown', 'active');
          requestAnimationFrame(() => { el.style.transition = ''; resolve(); });
        }, 300);
      });
    },
    ready() { return idlePromise; }
  };
}
