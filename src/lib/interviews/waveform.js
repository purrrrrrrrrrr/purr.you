/**
 * Drives a scrolling, audio-reactive waveform onto a canvas: newest sample
 * rendered at the canvas's right edge (NOW, adjacent to the timeline's
 * center playhead), older samples scroll left as history accumulates.
 * @param {HTMLAudioElement} audioEl
 * @param {HTMLCanvasElement} canvas
 */
export function createWaveform(audioEl, canvas) {
  const AudioCtx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  const audioCtx = new AudioCtx();
  const source = audioCtx.createMediaElementSource(audioEl);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  const timeData = new Uint8Array(analyser.frequencyBinCount);
  /** @type {number[]} */
  let history = [];
  /** @type {number | null} */
  let rafId = null;

  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function sampleAmplitude() {
    analyser.getByteTimeDomainData(timeData);
    let peak = 0;
    for (let i = 0; i < timeData.length; i++) {
      const d = Math.abs(timeData[i] - 128);
      if (d > peak) peak = d;
    }
    return peak / 128; // 0..1
  }

  function renderFrame() {
    sizeCanvas();
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    const fg = getComputedStyle(canvas).getPropertyValue('--fg').trim() || '#FFE600';
    const mid = h / 2;

    // Placeholder wobble for the stretch not yet covered by real samples.
    const emptyW = w - history.length;
    if (emptyW > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = fg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const amp = h * 0.12;
      const freq = 0.15;
      for (let x = 0; x <= emptyW; x++) {
        const y = mid + Math.sin(x * freq) * amp;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = fg;
    for (let i = 0; i < history.length; i++) {
      const x = w - 1 - i;
      if (x < 0) break;
      const amp = history[i];
      const barH = Math.max(1, amp * h);
      ctx.fillRect(x, mid - barH / 2, 1, barH);
    }
  }

  function draw() {
    history.unshift(sampleAmplitude());
    if (history.length > canvas.width) history.length = canvas.width;
    renderFrame();
    rafId = requestAnimationFrame(draw);
  }

  renderFrame();

  function start() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (rafId === null) draw();
  }

  function pause() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function reset() {
    history = [];
    renderFrame();
  }

  function destroy() {
    pause();
    audioCtx.close();
  }

  return { start, pause, reset, destroy };
}
