// @ts-nocheck
const MOBILE_MAX = 899;

const COPY = {
  insert: { desktop: 'INSERT DATABUN', mobile: 'DRAG AND INSERT DATABUN' },
  click:  { desktop: 'CLICK TO PLACE', mobile: 'DRAG AND INSERT DATABUN' },
  load:   { desktop: 'LOAD DATA',      mobile: 'LOAD DATA' }
};

function variant() {
  return window.innerWidth <= MOBILE_MAX ? 'mobile' : 'desktop';
}

export function createTip(el) {
  const textEl = el.querySelector('.tip-wrapper');
  let idlePromise = Promise.resolve();

  function setText(key) {
    textEl.textContent = COPY[key][variant()];
  }

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
    show(key) {
      setText(key);
      el.classList.add('active');
      requestAnimationFrame(() => el.classList.add('shown'));
    },
    showText(text, onShown) {
      textEl.textContent = text;
      el.classList.add('active');
      requestAnimationFrame(() => {
        el.classList.add('shown');
        if (onShown) {
          const handler = (e) => {
            if (e.propertyName !== 'clip-path') return;
            el.removeEventListener('transitionend', handler);
            onShown();
          };
          el.addEventListener('transitionend', handler);
        }
      });
    },
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
