// Shared machinery for every room: the colour vocabulary, control wiring,
// the numerical integrator, a few random-number helpers, and the playback
// engine that drives the animation and the history scrubber.
//
// The playback model is deliberately simple and is the same in all eight rooms:
// pressing Run computes the *entire* trajectory in one synchronous pass and
// stores it as an array of frames, then a requestAnimationFrame loop reveals
// those frames one at a time. Nothing is simulated during the animation, so
// the scrubber can jump anywhere instantly, replaying is free, and a room can
// never end up half-computed.

const LAB = (function () {

  // Read the palette out of the stylesheet so the CSS stays the single source
  // of truth for colour, and canvas drawing matches the surrounding page.
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  const C = {};
  function refreshColors() {
    Object.assign(C, {
      paper:    cssVar('--paper', '#EDE6D6'),
      paperDim: cssVar('--paper-dim', '#E2D9C4'),
      ink:      cssVar('--ink', '#262220'),
      inkSoft:  cssVar('--ink-soft', '#6b6258'),
      rule:     cssVar('--rule', '#cabfa8'),
      stamp:    cssVar('--stamp', '#C08A2E'),
      spA:      cssVar('--sp-a', '#3D6E6E'),
      spB:      cssVar('--sp-b', '#A8442A'),
      pred:     cssVar('--pred', '#8C3F5D'),
      res1:     cssVar('--res-1', '#2E5C8A'),
      res2:     cssVar('--res-2', '#388047'),
      cap:      cssVar('--cap', '#7A5C99'),
      warn:     cssVar('--help-red', '#B3141F')
    });
  }
  document.addEventListener('DOMContentLoaded', refreshColors);
  refreshColors();

  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------- controls

  // Wires a range input to its live readout. `format` turns the raw number into
  // the displayed string; `onChange` fires after every move. Returns an object
  // whose `.value` is always the current number, so rooms read parameters at
  // Run time rather than caching them on every input event.
  function slider(id, opts = {}) {
    const el = $(id);
    if (!el) { console.warn('slider missing:', id); return { value: 0, set() {} }; }
    const out = opts.valueId ? $(opts.valueId) : null;
    const fmt = opts.format || (v => String(v));
    const handle = {
      el,
      get value() { return parseFloat(el.value); },
      set(v) { el.value = v; render(); if (opts.onChange) opts.onChange(handle.value); }
    };
    function render() { if (out) out.textContent = fmt(parseFloat(el.value)); }
    el.addEventListener('input', () => { render(); if (opts.onChange) opts.onChange(handle.value); });
    render();
    return handle;
  }

  // Wires a .segmented button group. Buttons carry their payload in a data
  // attribute (`data-<key>`); the handle's `.value` is the active button's.
  function segmented(id, key, opts = {}) {
    const el = $(id);
    if (!el) { console.warn('segmented missing:', id); return { value: null, set() {} }; }
    const btns = Array.from(el.querySelectorAll('button'));
    const handle = {
      el, btns,
      get value() {
        const active = btns.find(b => b.classList.contains('active')) || btns[0];
        return active ? active.dataset[key] : null;
      },
      set(v, silent) {
        btns.forEach(b => b.classList.toggle('active', b.dataset[key] === String(v)));
        if (!silent && opts.onChange) opts.onChange(handle.value);
      }
    };
    btns.forEach(b => b.addEventListener('click', () => {
      btns.forEach(o => o.classList.remove('active'));
      b.classList.add('active');
      if (opts.onChange) opts.onChange(handle.value);
    }));
    return handle;
  }

  // The Growth and Crowding rooms can run a second population beside the first.
  // Which controls, chips and sentences that reveals is entirely a CSS question,
  // so a room only has to flip one class on its own tab and let the stylesheet
  // do the rest — nothing is shown or hidden element by element.
  function setRoomFlag(tabId, cls, on) {
    const el = $(tabId);
    if (el) el.classList.toggle(cls, !!on);
  }

  function onClick(id, fn) {
    const el = $(id);
    if (el) el.addEventListener('click', fn);
    return el;
  }

  // ---------------------------------------------------------------- numerics

  // Classical fourth-order Runge–Kutta on a state vector. Every continuous
  // model in this lab is integrated with it: the consumer–resource equations in
  // particular are stiff enough near equilibrium that plain Euler steps visibly
  // overshoot at any step size coarse enough to stay fast.
  function rk4(y, dt, deriv) {
    const n = y.length;
    const k1 = deriv(y);
    const t2 = new Array(n), t3 = new Array(n), t4 = new Array(n);
    for (let i = 0; i < n; i++) t2[i] = y[i] + 0.5 * dt * k1[i];
    const k2 = deriv(t2);
    for (let i = 0; i < n; i++) t3[i] = y[i] + 0.5 * dt * k2[i];
    const k3 = deriv(t3);
    for (let i = 0; i < n; i++) t4[i] = y[i] + dt * k3[i];
    const k4 = deriv(t4);
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = y[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    return out;
  }

  // Poisson draw. Knuth's product method below ~30, then a normal
  // approximation — the individual-based rooms call this once per time step per
  // population, and at large N the exact algorithm is both slow and irrelevant.
  function poisson(lambda) {
    if (!(lambda > 0)) return 0;
    if (lambda < 30) {
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do { k++; p *= Math.random(); } while (p > L);
      return k - 1;
    }
    const g = lambda + Math.sqrt(lambda) * gauss();
    return Math.max(0, Math.round(g));
  }

  let spare = null;
  function gauss() {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u, v, s;
    do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v; }
    while (s >= 1 || s === 0);
    const mul = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * mul;
    return u * mul;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // One row of a YES/NO condition list. Three rooms present their outcome as a
  // set of invasion criteria answered before the run, and they all render them
  // the same way; the matching CSS lives under `.verdict .cond`.
  function condRow(label, ok) {
    return `<div class="cond"><span>${label}</span>`
         + `<span class="${ok ? 'yes' : 'no'}">${ok ? 'YES' : 'NO'}</span></div>`;
  }

  function fmt(v, dp = 2) {
    if (!isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (a >= 1e4) return Math.round(v).toLocaleString('en-US');
    return v.toFixed(dp);
  }
  const fmtInt = v => (isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—');

  // Unchecked growth leaves the countable range within a couple of doublings,
  // and the rooms have to keep saying how big it has become. Past a million
  // that is a power of ten rather than a wall of digits.
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴',
                5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = e => String(e).split('').map(c => SUP[c]).join('');
  function fmtBig(v) {
    if (!isFinite(v)) return '—';
    if (v < 1e6) return fmtInt(v);
    const e = Math.floor(Math.log10(v));
    return `${(v / Math.pow(10, e)).toFixed(1)} × 10${sup(e)}`;
  }
  // Decade labels for a logarithmic axis, which runs past anything '1.2M' says.
  function fmtPow10(v) {
    const e = Math.round(Math.log10(v));
    return e === 0 ? '1' : e === 1 ? '10' : `10${sup(e)}`;
  }

  // ---------------------------------------------------------------- playback

  // Checked at each press of Run rather than cached, so changing the system
  // setting takes effect without a reload.
  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Drives one room's animation. The room supplies a render callback and the
  // ids of its transport controls; the player owns the frame index, the RAF
  // loop, the play/pause button label, and the scrubber.
  //
  //   player.load(nFrames)  — a new trajectory is ready; rewind and enable the scrubber
  //   player.play()         — animate forward from the current frame
  //   player.seek(i)        — jump (used by the scrubber and by paused stepping)
  function createPlayer(opts) {
    const scrub = opts.scrubberId ? $(opts.scrubberId) : null;
    const scrubOut = opts.scrubValueId ? $(opts.scrubValueId) : null;
    const playBtn = opts.playBtnId ? $(opts.playBtnId) : null;

    const st = { frames: 0, i: 0, running: false, raf: null, last: 0,
                 fps: opts.fps || 60, completed: false };

    function setPlayLabel(running) {
      if (!playBtn) return;
      playBtn.textContent = running ? (opts.pauseLabel || '⏸ Pause')
                                    : (opts.playLabel || '▶ Run');
    }

    function draw() {
      if (scrub) scrub.value = st.i;
      if (scrubOut && opts.scrubFormat) scrubOut.textContent = opts.scrubFormat(st.i);
      else if (scrubOut) scrubOut.textContent = String(st.i);
      opts.render(st.i);
    }

    // "The run has been seen through to its end" is a single fact, and it should
    // not depend on *how* the last frame was reached. Playing through, dragging
    // the scrubber to the right-hand end, stepping onto the last frame and
    // pressing Skip to end all mean the same thing, so they all land here and
    // the room's onEnd (which writes the conclusion text) fires exactly once per
    // loaded trajectory.
    function maybeComplete() {
      if (st.frames > 0 && st.i >= st.frames && !st.completed) {
        st.completed = true;
        if (opts.onEnd) opts.onEnd();
      }
    }

    function tick(ts) {
      if (!st.running) return;
      if (!st.last) st.last = ts;
      const elapsed = ts - st.last;
      const perFrame = 1000 / st.fps;
      if (elapsed >= perFrame) {
        const advance = Math.max(1, Math.floor(elapsed / perFrame));
        st.last = ts;
        st.i = Math.min(st.frames, st.i + advance);
        draw();
        if (st.i >= st.frames) {
          st.running = false;
          setPlayLabel(false);
          maybeComplete();
          return;
        }
      }
      st.raf = requestAnimationFrame(tick);
    }

    const api = {
      get frame() { return st.i; },
      get frames() { return st.frames; },
      get running() { return st.running; },
      setFps(f) { st.fps = f; },
      load(n) {
        api.pause();
        st.frames = n;
        st.i = 0;
        st.completed = false;
        if (scrub) { scrub.max = n; scrub.value = 0; scrub.disabled = false; }
        draw();
      },
      play() {
        if (st.frames <= 0) return;
        if (st.i >= st.frames) { st.i = 0; st.completed = false; }
        // A reader who has asked the system for reduced motion gets the finished
        // trajectory instead of the animation. Nothing is lost: the whole run is
        // already computed, every panel draws its final state, and the scrubber
        // still replays any moment on request.
        if (prefersReducedMotion()) { api.showAll(); return; }
        st.running = true;
        st.last = 0;
        setPlayLabel(true);
        st.raf = requestAnimationFrame(tick);
      },
      pause() {
        st.running = false;
        setPlayLabel(false);
        if (st.raf) cancelAnimationFrame(st.raf);
        st.raf = null;
      },
      toggle() { st.running ? api.pause() : api.play(); },
      seek(i) {
        st.i = clamp(Math.round(i), 0, st.frames);
        draw();
        maybeComplete();
      },
      // Nudge by whole frames. Every room with a scrubber binds this to a pair
      // of buttons: in the Overshoot Room it walks the cobweb one generation at
      // a time, and in the continuous rooms it is how you park exactly on a
      // peak or a crossing rather than near one.
      step(delta) {
        api.pause();
        api.seek(st.i + delta);
      },
      showAll() { api.pause(); st.i = st.frames; draw(); maybeComplete(); },
      redraw() { opts.render(st.i); },
      reset() {
        api.pause();
        st.frames = 0; st.i = 0;
        st.completed = false;
        if (scrub) { scrub.max = 0; scrub.value = 0; scrub.disabled = true; }
        if (scrubOut) scrubOut.textContent = opts.scrubFormat ? opts.scrubFormat(0) : '0';
      }
    };

    if (scrub) {
      scrub.addEventListener('input', e => {
        api.pause();
        api.seek(parseInt(e.target.value, 10));
      });
    }
    return api;
  }

  // Wires a room's pair of scrubber step buttons, which follow the naming
  // convention stepBack_<suffix> / stepFwd_<suffix>. `ensure` is the room's
  // "make sure a trajectory exists" callback: stepping forward from a cold or
  // stale room should simulate first rather than doing nothing.
  function bindSteps(suffix, player, ensure) {
    onClick('stepBack_' + suffix, () => player.step(-1));
    onClick('stepFwd_' + suffix, () => {
      if (ensure) ensure();
      player.step(1);
    });
  }

  // Rooms redraw on resize (and on tab switch, which dispatches resize) so a
  // canvas that was hidden at draw time gets a second chance at its true width.
  function onResize(fn) {
    let t = null;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(fn, 60);
    });
  }

  // Runs a room's setup once the DOM exists, whether or not we're already past
  // DOMContentLoaded when the room script is evaluated.
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  return { C, $, slider, segmented, onClick, setRoomFlag, rk4, poisson, clamp, condRow,
           fmt, fmtInt, fmtBig, fmtPow10, createPlayer, bindSteps, onResize, ready };
})();
