// The Effective Size Room: why the N of the Drift Room is an effective size,
// not a head count.
//
// The Drift Room's population is an idealised one, and the room says so: N the
// same in every generation, every individual equally likely to be a parent,
// mating at random. Each of the three parts here breaks one of those promises
// and measures what it costs, always in the same currency — the genetic
// diversity H that the Drift Room showed falls at a predictable rate, 1/2N per
// generation in a diploid. Whatever population is being simulated, the N that
// would lose H at the rate it actually loses it is its effective size, Ne.
//
//   Part 1  N changes from one generation to the next. Ne is close to the
//           HARMONIC mean of the sizes, which the small generations dominate.
//   Part 2  Nm breeding males and Nf breeding females. Every offspring has one
//           of each, so Ne = 4·Nm·Nf / (Nm + Nf), set by the rarer sex.
//   Part 3  Partial self-fertilisation at rate σ. Two separate effects: a
//           heterozygote deficit inside individuals, F = σ/(2 − σ), and a
//           smaller Ne for the gene pool as a whole, Ne = N/(1 + F).
//
// Each part runs a whole simulation the moment Run is pressed and then reveals
// it a generation at a time, so there is nothing to pause: leaving the room, or
// asking for reduced motion, simply shows the finished run.
//
// Parts 1 and 2 follow allele frequencies, because with neutral, unlinked loci
// and random union of gametes the frequencies are all there is to follow. Part 3
// cannot: selfing makes WHO carries a gene matter, so it keeps every
// individual's two genomes.
(function () {
  const $ = (id) => document.getElementById(id + '_ne');

  const COLORS = {
    paper: '#EDE6D6', paperDim: '#E2D9C4', ink: '#262220', inkSoft: '#5A5249',
    rule: '#cabfa8',
    room: '#4B4F94',          // the tab colour; canvas cannot read var(--room)
    stamp: '#C08A2E',
    alleleA: '#2E5C8A', alleleB: '#A8442A',  // A₁ and A₂, as in the Drift Room
    // The same purple the Drift Room uses for its diversity line, and for the
    // same reason: it is one number for the population, not an allele.
    diversity: '#7A5C99',
    observed: '#C08A2E',      // Part 3's observed heterozygosity, against it
    census: '#A8442A',        // whatever the census alone would predict
    male: '#2F7A8C', female: '#C08A2E'
  };

  // The Drift Room's ten run colours (wright-fisher-core.js), so a locus line
  // here reads the way a run line does there. Part 1 draws ten loci for that
  // reason: one colour each, so any one line can be followed through the
  // bottleneck. The diversity chart still averages all 200.
  const LOCUS_COLORS = [
    '#3D6E6E', '#A8442A', '#7A5C99', '#C08A2E', '#3C6E3F',
    '#8B3E62', '#3A5A8C', '#B5651D', '#4F7CAC', '#9B4F4F'
  ];

  const G = 100;         // generations in every part
  const BLOCK = 5;       // Part 1: generations per bar of the size schedule
  const BLOCKS = G / BLOCK;
  const N_MIN = 5, N_MAX = 1000;
  const LOCI_FREQ = 200; // Parts 1 and 2: unlinked loci followed by frequency
  const LOCI_SHOWN = 10; // Part 1: how many of them get a trajectory drawn
  const LOCI_IND = 100;  // Part 3: loci carried by every individual
  const GRID_ROWS = 30, GRID_COLS = 40; // Part 3: the part of the genomes drawn
  const H0 = 0.5;        // every locus starts at p = 0.5

  // The sizes the schedule snaps to. A free log scale would hand out sizes like
  // 437, which nobody can do arithmetic with; these are the round numbers a
  // reader would have typed.
  const LADDER = [5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150,
                  200, 250, 300, 400, 500, 600, 800, 1000];

  const PRESETS = {
    constant:   () => Array(BLOCKS).fill(200),
    // Five generations at 10 in a population otherwise of 500. Short enough to
    // look like nothing on the arithmetic mean, which is the point.
    bottleneck: () => { const s = Array(BLOCKS).fill(500); s[8] = 10; return s; },
    // A founding pair-of-handfuls that grows to a thousand and stays there.
    expansion:  () => [10, 20, 50, 100, 200, 500].concat(Array(BLOCKS - 6).fill(1000)),
    decline:    () => Array.from({ length: BLOCKS }, (_, i) =>
                      snap(1000 * Math.pow(20 / 1000, i / (BLOCKS - 1)))),
    // Lemming years: ten generations at a thousand, ten at twenty, repeated.
    cycles:     () => Array.from({ length: BLOCKS }, (_, i) => (Math.floor(i / 2) % 2 ? 20 : 1000))
  };

  const DOM = {
    presetSeg: $('presetSeg'), schedCanvas: $('schedCanvas'),
    btnRun1: $('btnRun1'), btnReset1: $('btnReset1'), status1: $('status1'),
    trajCanvas: $('trajCanvas'), het1Canvas: $('het1Canvas'),
    am: $('amVal'), hm: $('hmVal'), min: $('minVal'), hLeft1: $('hLeft1Val'), neHat1: $('neHat1Val'),
    reading1: $('reading1'),

    sliderNm: $('sliderNm'), nmVal: $('nmVal'), sliderNf: $('sliderNf'), nfVal: $('nfVal'),
    sexHint: $('sexHint'),
    btnRun2: $('btnRun2'), status2: $('status2'),
    breedCanvas: $('breedCanvas'), breedLabel: $('breedLabel'),
    curveCanvas: $('curveCanvas'), het2Canvas: $('het2Canvas'),
    census2: $('census2Val'), ne2: $('ne2Val'), ratio2: $('ratio2Val'),
    fathers: $('fathersVal'), neHat2: $('neHat2Val'),
    reading2: $('reading2'),

    sliderN3: $('sliderN3'), n3Val: $('n3Val'), sliderSelf: $('sliderSelf'), selfVal: $('selfVal'),
    selfHint: $('selfHint'),
    btnRun3: $('btnRun3'), status3: $('status3'),
    genomeCanvas: $('genomeCanvas'), genomeLabel: $('genomeLabel'),
    fCanvas: $('fCanvas'), het3Canvas: $('het3Canvas'),
    fis: $('fisVal'), hObs: $('hObsVal'), hExp: $('hExpVal'), ne3: $('ne3Val'), neHat3: $('neHat3Val'),
    reading3: $('reading3')
  };
  if (!DOM.schedCanvas) return;

  const state = {
    sched: PRESETS.bottleneck(), preset: 'bottleneck', selBlock: 8,
    run1: null, shown1: 0,
    Nm: 5, Nf: 45, run2: null, shown2: 0, breed: null,
    N3: 50, sigma: 0.5, run3: null, shown3: 0,
    timers: {}
  };

  // ---- numbers ---------------------------------------------------------------

  function snap(n) {
    let best = LADDER[0];
    for (const v of LADDER) if (Math.abs(Math.log(v / n)) < Math.abs(Math.log(best / n))) best = v;
    return best;
  }

  // Binomial draw. Inversion when the expected count of the rarer outcome is
  // small, where the shape matters; a rounded normal above that, where it is
  // indistinguishable and inversion would cost a loop of hundreds per draw —
  // Part 1 makes 20,000 of these per run with n up to 2,000.
  function binom(n, p) {
    if (p <= 0) return 0;
    if (p >= 1) return n;
    const q = Math.min(p, 1 - p);
    let k;
    if (n * q < 30) {
      const s = q / (1 - q), a = (n + 1) * s;
      let r = Math.pow(1 - q, n), u = Math.random();
      k = 0;
      while (u > r) { u -= r; k++; if (k >= n) { k = n; break; } r *= (a / k - s); }
    } else {
      const g = Math.sqrt(-2 * Math.log(Math.random() || 1e-12)) * Math.cos(2 * Math.PI * Math.random());
      k = Math.max(0, Math.min(n, Math.round(n * q + g * Math.sqrt(n * q * (1 - q)))));
    }
    return p > 0.5 ? n - k : k;
  }

  // The N that would leave H_end out of H_start after t generations of the
  // ideal decay H(1 − 1/2N)^t, solved for N. It is how every part measures its
  // own run: the simulation is never told the formula it is being checked by.
  function neFromDecay(hStart, hEnd, t) {
    if (!(hEnd > 0) || !(hStart > 0) || hEnd >= hStart) return null;
    return 1 / (2 * (1 - Math.pow(hEnd / hStart, 1 / t)));
  }
  const idealDecay = (n, t) => H0 * Math.pow(1 - 1 / (2 * n), t);

  function fmtN(n) {
    if (n === null || !isFinite(n)) return '—';
    return n >= 100 ? String(Math.round(n)) : n.toFixed(1);
  }

  // ---- drawing helpers ---------------------------------------------------------

  function withCanvas(canvas, cb) {
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = Math.round(rect.width), H = Math.round(rect.height);
    if (W < 2 || H < 2) return;
    const ctx = canvas.getContext('2d');
    scaleCanvas(canvas, ctx, W, H);
    ctx.clearRect(0, 0, W, H);
    cb(ctx, W, H);
  }

  // The axis title is left off the upper panels of a stack whose bottom panel
  // already carries it: Part 1's three share one generation axis, and the
  // height saved is what lets all three fit on screen together.
  function genAxis(ctx, W, H, pad, title = true) {
    const graphW = W - pad.l - pad.r, axisY = H - pad.b;
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, axisY); ctx.lineTo(W - pad.r, axisY); ctx.stroke();
    ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'center';
    for (let g = 0; g <= G; g += 20) {
      const x = pad.l + (g / G) * graphW;
      ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 5); ctx.stroke();
      ctx.fillText(String(g), x, axisY + 16);
    }
    if (title) {
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(T('ne.axisGen', 'Generation'), pad.l + graphW / 2, axisY + 30);
    }
    ctx.textAlign = 'left';
  }

  function yTitle(ctx, text, x, pad, graphH) {
    ctx.save();
    ctx.translate(x, pad.t + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillStyle = COLORS.inkSoft; ctx.font = '10px ui-monospace, monospace';
    fillSci(ctx, text, 0, 0);
    ctx.restore();
  }

  // One chart against generation, used by every curve panel in the room.
  // A series may be shorter than G + 1: a run being revealed is drawn only as
  // far as it has got, while the expectations it is measured against are drawn
  // in full from the start, so the reader sees where it ought to go first.
  function lineChart(canvas, opts) {
    withCanvas(canvas, (ctx, W, H) => {
      const xTitle = opts.xTitle !== false;
      const pad = { l: 46, r: 16, t: 10, b: xTitle ? 40 : 22 };
      const graphW = W - pad.l - pad.r, graphH = H - pad.t - pad.b;
      const X = (g) => pad.l + (g / G) * graphW;
      const Y = (v) => pad.t + graphH * (1 - v / opts.ymax);

      ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = COLORS.inkSoft; ctx.textAlign = 'right';
      opts.yticks.forEach(v => {
        ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke();
        ctx.fillText(v.toFixed(opts.ydp ?? 1), pad.l - 6, Y(v) + 4);
      });
      ctx.setLineDash([]); ctx.textAlign = 'left';
      genAxis(ctx, W, H, pad, xTitle);
      yTitle(ctx, opts.ylabel, 12, pad, graphH);

      (opts.series || []).forEach(s => {
        if (!s.data || s.data.length < 1) return;
        ctx.save();
        ctx.beginPath();
        s.data.forEach((v, g) => { if (g === 0) ctx.moveTo(X(g), Y(v)); else ctx.lineTo(X(g), Y(v)); });
        ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2;
        ctx.globalAlpha = s.alpha ?? 1;
        ctx.setLineDash(s.dash || []);
        ctx.stroke();
        ctx.restore();
      });

      if (opts.cursor != null && opts.cursor < G) {
        ctx.save();
        ctx.strokeStyle = COLORS.stamp; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(X(opts.cursor), pad.t); ctx.lineTo(X(opts.cursor), H - pad.b); ctx.stroke();
        ctx.restore();
      }
    });
  }

  // ---- running and revealing ---------------------------------------------------

  // Fifteen generations a second: a hundred-generation run takes about seven
  // seconds. Thirty was tried first and was too quick to follow the loci
  // lurching through a bottleneck while also watching the diversity fall.
  const STEP_MS = 66;
  const reducedMotion = () => !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function reveal(part, btn, draw, done) {
    stopReveal(part);
    btn.disabled = true;
    let g = 0;
    const tick = () => {
      draw(g);
      if (g >= G) { stopReveal(part); btn.disabled = false; done(); return; }
      g++;
    };
    if (reducedMotion()) { g = G; tick(); return; }
    tick();
    state.timers[part] = { id: setInterval(tick, STEP_MS), finish: () => { g = G; tick(); } };
  }
  function stopReveal(part) {
    const t = state.timers[part];
    if (t) { clearInterval(t.id); state.timers[part] = null; }
  }

  // A run left half-revealed in a hidden tab would be a run the reader never
  // sees end, so leaving the room finishes it.
  document.addEventListener('lab:tabchange', (e) => {
    if (e.detail.tabId === 'effective') return;
    Object.keys(state.timers).forEach(k => { const t = state.timers[k]; if (t) t.finish(); });
  });

  // =============================================================================
  // PART 1 — a population that changes size
  // =============================================================================

  // The size of generation g (1..G). Generation g is drawn as 2N_g gene copies
  // from generation g − 1, so it is N_g that sets the loss on the way into it.
  const sizeAt = (sched, g) => sched[Math.floor((g - 1) / BLOCK)];

  function scheduleStats(sched) {
    let sum = 0, inv = 0, min = Infinity;
    const exp = [H0];
    for (let g = 1; g <= G; g++) {
      const n = sizeAt(sched, g);
      sum += n; inv += 1 / n; min = Math.min(min, n);
      exp.push(exp[g - 1] * (1 - 1 / (2 * n)));
    }
    return { am: sum / G, hm: G / inv, min, exp };
  }

  function simulate1() {
    const p = new Float64Array(LOCI_FREQ).fill(0.5);
    const traj = Array.from({ length: LOCI_SHOWN }, () => [0.5]);
    const H = [H0];
    for (let g = 1; g <= G; g++) {
      const n2 = 2 * sizeAt(state.sched, g);
      let s = 0;
      for (let i = 0; i < LOCI_FREQ; i++) {
        p[i] = binom(n2, p[i]) / n2;
        s += 2 * p[i] * (1 - p[i]);
        if (i < LOCI_SHOWN) traj[i].push(p[i]);
      }
      H.push(s / LOCI_FREQ);
    }
    return { traj, H, sched: state.sched.slice() };
  }

  // -- the schedule editor --
  // l and r must match lineChart's, or the three Part 1 panels stop lining up.
  const SCHED_PAD = { l: 46, r: 16, t: 10, b: 22 };
  const logN = (n) => Math.log(n / N_MIN) / Math.log(N_MAX / N_MIN);

  function drawSchedule(cursorG) {
    const st = scheduleStats(state.sched);
    withCanvas(DOM.schedCanvas, (ctx, W, H) => {
      const pad = SCHED_PAD;
      const graphW = W - pad.l - pad.r, graphH = H - pad.t - pad.b;
      const barW = graphW / BLOCKS;
      const Y = (n) => pad.t + graphH * (1 - logN(n));

      ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = COLORS.inkSoft; ctx.textAlign = 'right';
      ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      [5, 10, 50, 100, 500, 1000].forEach(v => {
        ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke();
        ctx.fillText(String(v), pad.l - 6, Y(v) + 4);
      });
      ctx.setLineDash([]);
      yTitle(ctx, T('ne.axisN', 'Census <var>N</var> (log)'), 10, pad, graphH);

      // Each bar's size is written at its foot rather than its top: the tops are
      // where the two mean lines run, and a number there sits on one of them.
      // A bar too short to hold its number has it just above instead.
      const axisY = pad.t + graphH;
      state.sched.forEach((n, b) => {
        const x = pad.l + b * barW;
        ctx.fillStyle = COLORS.room;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x + 1, Y(n), barW - 2, axisY - Y(n));
        ctx.globalAlpha = 1;
        if (barW >= 26) {
          const inside = axisY - Y(n) >= 16;
          ctx.fillStyle = inside ? COLORS.paper : COLORS.ink;
          ctx.textAlign = 'center'; ctx.font = 'bold 9px ui-monospace, monospace';
          ctx.fillText(String(n), x + barW / 2, inside ? axisY - 5 : Y(n) - 4);
        }
      });

      // The block the keyboard is on, outlined only while the editor has focus
      // so a mouse reader is not shown a selection they did not make.
      if (document.activeElement === DOM.schedCanvas) {
        const x = pad.l + state.selBlock * barW;
        ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, pad.t, barW - 2, graphH);
      }

      // The two averages, as lines across the whole schedule. The harmonic one
      // is drawn in the ink of the dashed expectation on the chart below, which
      // it predicts; the arithmetic one in the census red, which it does not.
      // Labels on a paper patch so they read across the bars. Above the line,
      // unless the other label is already there: when the two means are close
      // (and in a constant population they are equal) the lower one goes below.
      const close = Math.abs(Y(st.am) - Y(st.hm)) < 14;
      const mean = (v, color, label, dash, below) => {
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash(dash);
        ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke();
        ctx.restore();
        ctx.font = 'bold 10px ui-monospace, monospace';
        const w = ctx.measureText(label).width, xr = W - pad.r - 4;
        const ty = below ? Y(v) + 12 : Y(v) - 4;
        ctx.fillStyle = COLORS.paper; ctx.globalAlpha = 0.88;
        ctx.fillRect(xr - w - 3, ty - 9, w + 6, 12);
        ctx.globalAlpha = 1;
        ctx.fillStyle = color; ctx.textAlign = 'right';
        ctx.fillText(label, xr, ty);
      };
      mean(st.am, COLORS.census, T('ne.amLine', 'arithmetic mean {n}', { n: fmtN(st.am) }), [2, 3], false);
      mean(st.hm, COLORS.ink, T('ne.hmLine', 'harmonic mean {n}', { n: fmtN(st.hm) }), [6, 3], close || Y(st.hm) - pad.t < 14);

      ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, axisY); ctx.lineTo(W - pad.r, axisY); ctx.stroke();
      ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'center';
      for (let g = 0; g <= G; g += 20) {
        const x = pad.l + (g / G) * graphW;
        ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 4); ctx.stroke();
        ctx.fillText(String(g), x, axisY + 14);
      }

      if (cursorG != null && cursorG < G) {
        const x = pad.l + (cursorG / G) * graphW;
        ctx.save();
        ctx.strokeStyle = COLORS.stamp; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, axisY); ctx.stroke();
        ctx.restore();
      }
    });
    const b = state.selBlock, n = state.sched[b];
    DOM.schedCanvas.setAttribute('aria-valuenow', String(n));
    DOM.schedCanvas.setAttribute('aria-valuetext', T('ne.aria.block',
      'Generations {a} to {b}: N = {n}. Arithmetic mean {am}, harmonic mean {hm}.',
      { a: b * BLOCK + 1, b: (b + 1) * BLOCK, n, am: fmtN(st.am), hm: fmtN(st.hm) }));
  }

  function blockAt(evt) {
    const rect = DOM.schedCanvas.getBoundingClientRect();
    const pad = SCHED_PAD;
    const graphW = rect.width - pad.l - pad.r, graphH = rect.height - pad.t - pad.b;
    const x = evt.clientX - rect.left, y = evt.clientY - rect.top;
    const b = Math.max(0, Math.min(BLOCKS - 1, Math.floor((x - pad.l) / (graphW / BLOCKS))));
    const frac = Math.max(0, Math.min(1, 1 - (y - pad.t) / graphH));
    return { b, n: snap(N_MIN * Math.pow(N_MAX / N_MIN, frac)) };
  }

  function scheduleEdited() {
    state.preset = null;
    DOM.presetSeg.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
    if (typeof syncSegmented === 'function') syncSegmented(DOM.presetSeg.parentElement);
    clearRun1();
  }

  let painting = null;
  DOM.schedCanvas.addEventListener('pointerdown', (e) => {
    if (state.timers.p1) return;
    painting = blockAt(e);
    DOM.schedCanvas.setPointerCapture(e.pointerId);
    state.sched[painting.b] = painting.n;
    state.selBlock = painting.b;
    scheduleEdited();
  });
  DOM.schedCanvas.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const at = blockAt(e);
    // A fast drag skips blocks between two events; fill them in on the line
    // between the two points, so the stroke has no gaps.
    const from = painting.b, step = at.b > from ? 1 : -1;
    for (let b = from; b !== at.b + step; b += step) {
      const t = at.b === from ? 1 : (b - from) / (at.b - from);
      state.sched[b] = snap(Math.exp(Math.log(painting.n) + t * (Math.log(at.n) - Math.log(painting.n))));
    }
    painting = at;
    state.selBlock = at.b;
    scheduleEdited();
  });
  const endPaint = () => { painting = null; };
  DOM.schedCanvas.addEventListener('pointerup', endPaint);
  DOM.schedCanvas.addEventListener('pointercancel', endPaint);

  DOM.schedCanvas.addEventListener('keydown', (e) => {
    if (state.timers.p1) return;
    const i = LADDER.indexOf(state.sched[state.selBlock]);
    let handled = true;
    if (e.key === 'ArrowLeft') state.selBlock = Math.max(0, state.selBlock - 1);
    else if (e.key === 'ArrowRight') state.selBlock = Math.min(BLOCKS - 1, state.selBlock + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const j = Math.max(0, Math.min(LADDER.length - 1, (i < 0 ? 0 : i) + (e.key === 'ArrowUp' ? 1 : -1)));
      state.sched[state.selBlock] = LADDER[j];
      scheduleEdited();
      return void e.preventDefault();
    }
    else if (e.key === 'Home') state.selBlock = 0;
    else if (e.key === 'End') state.selBlock = BLOCKS - 1;
    else handled = false;
    if (handled) { e.preventDefault(); drawSchedule(); }
  });
  DOM.schedCanvas.addEventListener('focus', () => drawSchedule());
  DOM.schedCanvas.addEventListener('blur', () => drawSchedule());

  DOM.presetSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-preset]');
    if (!btn || state.timers.p1) return;
    state.sched = PRESETS[btn.dataset.preset]();
    state.preset = btn.dataset.preset;
    DOM.presetSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    clearRun1();
  });

  function clearRun1() {
    state.run1 = null; state.shown1 = 0;
    DOM.reading1.textContent = '';
    DOM.status1.textContent = T('ne.status1Ready', 'Draw the sizes, or pick a preset, then press Run.');
    draw1();
  }

  function draw1(cursor) {
    const st = scheduleStats(state.sched);
    drawSchedule(cursor);
    DOM.am.textContent = fmtN(st.am);
    DOM.hm.textContent = fmtN(st.hm);
    DOM.min.textContent = String(st.min);

    const run = state.run1, upto = state.shown1;
    lineChart(DOM.trajCanvas, {
      ymax: 1, yticks: [0, 0.25, 0.5, 0.75, 1], ydp: 2,
      ylabel: T('ne.axisP', 'Frequency <var>p</var>'),
      xTitle: false,
      series: run ? run.traj.map((t, i) => ({ data: t.slice(0, upto + 1), color: LOCUS_COLORS[i % LOCUS_COLORS.length], width: 1.25, alpha: 0.85 })) : [],
      cursor: run ? cursor : null
    });
    lineChart(DOM.het1Canvas, {
      ymax: 0.5, yticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
      ylabel: T('ne.axisH', 'Mean <var>H</var> across loci'),
      series: [
        { data: Array.from({ length: G + 1 }, (_, g) => idealDecay(st.am, g)), color: COLORS.census, width: 1.5, dash: [2, 3] },
        { data: Array.from({ length: G + 1 }, (_, g) => idealDecay(st.hm, g)), color: COLORS.room, width: 1.75, dash: [8, 3, 2, 3] },
        { data: st.exp, color: COLORS.ink, width: 1.75, dash: [5, 4] },
        { data: run ? run.H.slice(0, upto + 1) : [], color: COLORS.diversity, width: 2.5 }
      ],
      cursor: run ? cursor : null
    });

    const h = run ? run.H[Math.min(upto, G)] : null;
    DOM.hLeft1.textContent = run ? h.toFixed(3) : '—';
    DOM.neHat1.textContent = run && upto >= G ? fmtN(neFromDecay(H0, run.H[G], G)) : '—';
    DOM.het1Canvas.setAttribute('aria-label', run
      ? T('ne.aria.het1', 'Mean heterozygosity against generation. At generation {g} it is {h}; a constant population at the harmonic mean, {hm}, would end at {e}.',
          { g: upto, h: h.toFixed(3), hm: fmtN(st.hm), e: idealDecay(st.hm, G).toFixed(3) })
      : T('ne.aria.het1Empty', 'Expected heterozygosity against generation for this schedule, for its arithmetic mean and for its harmonic mean. No run yet.'));
  }

  function reading1() {
    const st = scheduleStats(state.run1.sched);
    const hEnd = state.run1.H[G], neHat = neFromDecay(H0, hEnd, G);
    if (st.am / st.hm < 1.02) {
      return T('ne.read1Const',
        'The census never changed, so the two averages agree, and the run lost diversity like a population of about {ne}: that is the Drift Room, with nothing in the way. Now pick <em>Bottleneck</em> and run again.',
        { ne: fmtN(neHat) });
    }
    return T('ne.read1',
      'The census averaged {am} over these hundred generations, but the diversity left at the end, {h} of the starting 0.50, is what a constant population of only about {ne} would have kept. The harmonic mean of the sizes, {hm}, predicts that; the arithmetic mean does not come close. A generation at size <var>N</var> removes 1/2<var>N</var> of the diversity that is left, so the small generations take far more than their share of the time would suggest — and nothing in the large ones gives it back.',
      { am: fmtN(st.am), h: hEnd.toFixed(3), ne: fmtN(neHat), hm: fmtN(st.hm) });
  }

  DOM.btnRun1.addEventListener('click', () => {
    state.run1 = simulate1();
    DOM.reading1.textContent = '';
    DOM.status1.textContent = T('ne.status1Run', 'Running 200 loci through the schedule…');
    reveal('p1', DOM.btnRun1, (g) => { state.shown1 = g; draw1(g); }, () => {
      DOM.status1.textContent = T('ne.status1Done', 'Done. Change the sizes and run again.');
      DOM.reading1.innerHTML = reading1();
    });
  });
  DOM.btnReset1.addEventListener('click', () => {
    if (state.timers.p1) return;
    state.sched = PRESETS.bottleneck(); state.preset = 'bottleneck'; state.selBlock = 8;
    DOM.presetSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.preset === 'bottleneck'));
    if (typeof syncSegmented === 'function') syncSegmented(DOM.presetSeg.parentElement);
    clearRun1();
  });

  // =============================================================================
  // PART 2 — unequal numbers of breeding males and females
  // =============================================================================

  const neSex = (m, f) => 4 * m * f / (m + f);

  // Each offspring takes one gene copy from a random father and one from a
  // random mother. A random gene of a random parent is a random gene of that
  // sex's gene pool, so all a locus needs is its frequency in males and in
  // females: sons are Nm draws from each pool, daughters Nf from each.
  function simulate2() {
    const m = state.Nm, f = state.Nf, n = m + f;
    const pm = new Float64Array(LOCI_FREQ).fill(0.5), pf = new Float64Array(LOCI_FREQ).fill(0.5);
    const H = [H0];
    for (let g = 1; g <= G; g++) {
      let s = 0;
      for (let i = 0; i < LOCI_FREQ; i++) {
        const a = pm[i], b = pf[i];
        pm[i] = (binom(m, a) + binom(m, b)) / (2 * m);
        pf[i] = (binom(f, a) + binom(f, b)) / (2 * f);
        const p = (m * pm[i] + f * pf[i]) / n;
        s += 2 * p * (1 - p);
      }
      H.push(s / LOCI_FREQ);
    }
    return { H, Nm: m, Nf: f };
  }

  // One generation of parentage, drawn individual by individual. It is the
  // same rule the loci above follow, made visible: the loci never need to know
  // who fathered whom, but the reader does.
  function drawParentage() {
    const m = state.Nm, f = state.Nf, n = m + f;
    const kids = [];
    for (let i = 0; i < n; i++) kids.push({ dad: (Math.random() * m) | 0, mum: (Math.random() * f) | 0 });
    const dads = new Set(kids.map(k => k.dad)), mums = new Set(kids.map(k => k.mum));
    state.breed = { m, f, kids, dads: dads.size, mums: mums.size };
  }

  function drawBreeding() {
    const br = state.breed;
    if (!br) return;
    withCanvas(DOM.breedCanvas, (ctx, W, H) => {
      const n = br.m + br.f;
      const padX = 14, gap = Math.max(10, W * 0.03);
      const step = (W - 2 * padX - gap) / n;
      const r = Math.max(1.2, Math.min(6, step * 0.38));
      const parentX = (i, isDad) => padX + step * (isDad ? i : br.m + i) + (isDad ? 0 : gap) + step / 2;
      const kidX = (j) => padX + step * j + (j >= br.m ? gap : 0) + step / 2;
      const yP = 34, yK = H - 34;

      ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = COLORS.inkSoft; ctx.textAlign = 'left';
      ctx.fillText(T('ne.parents', 'Parents'), padX, 14);
      ctx.fillText(T('ne.offspring', 'Offspring'), padX, H - 8);

      // Lines first, so the marks sit on top. Faint when there are many of
      // them: two hundred offspring is four hundred lines, and what has to read
      // is where they converge, not each one.
      const alpha = Math.max(0.12, Math.min(0.6, 12 / n));
      ctx.lineWidth = 1;
      br.kids.forEach((k, j) => {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = COLORS.male;
        ctx.beginPath(); ctx.moveTo(kidX(j), yK - r); ctx.lineTo(parentX(k.dad, true), yP + r); ctx.stroke();
        ctx.strokeStyle = COLORS.female;
        ctx.beginPath(); ctx.moveTo(kidX(j), yK - r); ctx.lineTo(parentX(k.mum, false), yP + r); ctx.stroke();
      });
      ctx.globalAlpha = 1;

      const used = { dad: new Set(br.kids.map(k => k.dad)), mum: new Set(br.kids.map(k => k.mum)) };
      const mark = (x, y, male, filled) => {
        ctx.beginPath();
        if (male) ctx.rect(x - r, y - r, 2 * r, 2 * r); else ctx.arc(x, y, r, 0, Math.PI * 2);
        const col = male ? COLORS.male : COLORS.female;
        if (filled) { ctx.fillStyle = col; ctx.fill(); }
        else { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); }
      };
      for (let i = 0; i < br.m; i++) mark(parentX(i, true), yP, true, used.dad.has(i));
      for (let i = 0; i < br.f; i++) mark(parentX(i, false), yP, false, used.mum.has(i));
      for (let j = 0; j < n; j++) mark(kidX(j), yK, j < br.m, true);
    });
    DOM.breedLabel.textContent = T('ne.breedLabel', '{d} of {m} fathers · {u} of {f} mothers',
      { d: br.dads, m: br.m, u: br.mums, f: br.f });
    DOM.breedCanvas.setAttribute('aria-label', T('ne.aria.breed',
      'One generation of breeding: {n} offspring, fathered by {d} of the {m} males and mothered by {u} of the {f} females.',
      { n: br.m + br.f, d: br.dads, m: br.m, u: br.mums, f: br.f }));
  }

  function drawCurve() {
    const m = state.Nm, f = state.Nf, x0 = m / (m + f), y0 = neSex(m, f) / (m + f);
    withCanvas(DOM.curveCanvas, (ctx, W, H) => {
      const pad = { l: 46, r: 16, t: 14, b: 40 };
      const graphW = W - pad.l - pad.r, graphH = H - pad.t - pad.b;
      const X = (x) => pad.l + x * graphW, Y = (y) => pad.t + graphH * (1 - y);
      ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = COLORS.inkSoft; ctx.textAlign = 'right';
      [0, 0.25, 0.5, 0.75, 1].forEach(v => {
        ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke();
        ctx.fillText(v.toFixed(2), pad.l - 6, Y(v) + 4);
      });
      ctx.setLineDash([]);
      ctx.strokeStyle = COLORS.ink; ctx.beginPath(); ctx.moveTo(pad.l, H - pad.b); ctx.lineTo(W - pad.r, H - pad.b); ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = '9px ui-monospace, monospace';
      [0, 0.25, 0.5, 0.75, 1].forEach(v => {
        ctx.beginPath(); ctx.moveTo(X(v), H - pad.b); ctx.lineTo(X(v), H - pad.b + 5); ctx.stroke();
        ctx.fillText(v.toFixed(2), X(v), H - pad.b + 16);
      });
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(T('ne.axisShare', 'Share of breeders that are male'), pad.l + graphW / 2, H - pad.b + 30);
      yTitle(ctx, T('ne.axisRatio', '<var>N</var>ₑ / <var>N</var>'), 12, pad, graphH);

      ctx.beginPath();
      for (let i = 0; i <= 100; i++) { const x = i / 100; const y = 4 * x * (1 - x); if (i) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y)); }
      ctx.strokeStyle = COLORS.room; ctx.lineWidth = 2; ctx.stroke();

      ctx.save(); ctx.strokeStyle = COLORS.stamp; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(X(x0), Y(0)); ctx.lineTo(X(x0), Y(y0)); ctx.lineTo(pad.l, Y(y0)); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(X(x0), Y(y0), 5, 0, Math.PI * 2); ctx.fillStyle = COLORS.stamp; ctx.fill();
    });
    DOM.curveCanvas.setAttribute('aria-label', T('ne.aria.curve',
      'Effective size as a share of the census against the share of breeders that are male: highest, 1, at an even split. Here {x} of the breeders are male and Ne/N = {y}.',
      { x: x0.toFixed(2), y: y0.toFixed(2) }));
  }

  function draw2(cursor) {
    const m = state.Nm, f = state.Nf, n = m + f, ne = neSex(m, f);
    DOM.census2.textContent = String(n);
    DOM.ne2.textContent = fmtN(ne);
    DOM.ratio2.textContent = (ne / n).toFixed(2);
    DOM.fathers.textContent = state.breed ? `${state.breed.dads} / ${m}` : '—';
    DOM.sexHint.innerHTML = T('ne.sexHint', 'census <var>N</var> = {n} · <var>N</var>ₑ = 4·{m}·{f} / {n} = {ne}',
      { n, m, f, ne: fmtN(ne) });
    drawBreeding();
    drawCurve();

    const run = state.run2, upto = state.shown2;
    lineChart(DOM.het2Canvas, {
      ymax: 0.5, yticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
      ylabel: T('ne.axisH', 'Mean <var>H</var> across loci'),
      series: [
        { data: Array.from({ length: G + 1 }, (_, g) => idealDecay(n, g)), color: COLORS.census, width: 1.5, dash: [2, 3] },
        { data: Array.from({ length: G + 1 }, (_, g) => idealDecay(ne, g)), color: COLORS.ink, width: 1.75, dash: [5, 4] },
        { data: run ? run.H.slice(0, upto + 1) : [], color: COLORS.diversity, width: 2.5 }
      ],
      cursor: run ? cursor : null
    });
    DOM.neHat2.textContent = run && upto >= G ? fmtN(neFromDecay(H0, run.H[G], G)) : '—';
    DOM.het2Canvas.setAttribute('aria-label', run
      ? T('ne.aria.het2', 'Mean heterozygosity against generation. At generation {g} it is {h}; expected {e} from Ne = {ne}, and {c} from the census.',
          { g: upto, h: run.H[upto].toFixed(3), e: idealDecay(ne, upto).toFixed(3), ne: fmtN(ne), c: idealDecay(n, upto).toFixed(3) })
      : T('ne.aria.het2Empty', 'Expected heterozygosity against generation, from the effective size and from the census. No run yet.'));
  }

  function reading2() {
    const { Nm: m, Nf: f, H } = state.run2, n = m + f, ne = neSex(m, f);
    const neHat = neFromDecay(H0, H[G], G);
    if (m === f) {
      return T('ne.read2Even',
        'Equal numbers of each sex: <var>N</var><sub>e</sub> = 4·{m}·{f}/{n} = {n}, the census itself, and the run lost diversity like a population of about {neHat}. An even split is the best a population with separate sexes can do. Now take most of the males away.',
        { m, f, n, neHat: fmtN(neHat) });
    }
    const few = m < f ? T('ne.males', 'males') : T('ne.females', 'females');
    return T('ne.read2',
      'A census of {n}, but every offspring has exactly one father and one mother, so half of every generation\'s genes come through the {k} {few}. Their sex is the bottleneck: <var>N</var><sub>e</sub> = 4·{m}·{f}/{n} = {ne}, and the run lost diversity like a population of about {neHat}. Adding more of the common sex barely helps — the rarer one sets the limit, and <var>N</var><sub>e</sub> can never exceed four times its number.',
      { n, k: Math.min(m, f), few, m, f, ne: fmtN(ne), neHat: fmtN(neHat) });
  }

  function onSexSlider() {
    state.Nm = parseInt(DOM.sliderNm.value, 10);
    state.Nf = parseInt(DOM.sliderNf.value, 10);
    DOM.nmVal.textContent = state.Nm;
    DOM.nfVal.textContent = state.Nf;
    state.run2 = null; state.shown2 = 0;
    DOM.reading2.textContent = '';
    DOM.status2.textContent = T('ne.status2Ready', 'Set the breeders, then press Run.');
    drawParentage();
    draw2();
  }
  DOM.sliderNm.addEventListener('input', onSexSlider);
  DOM.sliderNf.addEventListener('input', onSexSlider);

  DOM.btnRun2.addEventListener('click', () => {
    state.run2 = simulate2();
    DOM.reading2.textContent = '';
    DOM.sliderNm.disabled = DOM.sliderNf.disabled = true;
    DOM.status2.textContent = T('ne.status2Run', 'Running 200 loci…');
    reveal('p2', DOM.btnRun2, (g) => {
      state.shown2 = g;
      // A fresh parentage every few generations, so the panel shows that the
      // same few males win every time rather than one lucky draw.
      if (g % 5 === 0) drawParentage();
      draw2(g);
    }, () => {
      DOM.sliderNm.disabled = DOM.sliderNf.disabled = false;
      DOM.status2.textContent = T('ne.status2Done', 'Done. Change the sex ratio and run again.');
      DOM.reading2.innerHTML = reading2();
    });
  });

  // =============================================================================
  // PART 3 — mating with relatives
  // =============================================================================

  const fEq = (s) => s / (2 - s);

  // Individuals as two genomes of LOCI_IND unlinked loci, 1 for A₁ and 0 for
  // A₂. Each offspring has a random mother; with probability σ she fertilises
  // herself, and otherwise the father is drawn at random from all N — himself
  // included, with the 1/N chance the Wright–Fisher population always had.
  function simulate3() {
    const N = state.N3, L = LOCI_IND, sigma = state.sigma;
    let A = new Uint8Array(N * L), B = new Uint8Array(N * L);
    for (let i = 0; i < N * L; i++) { A[i] = Math.random() < 0.5 ? 1 : 0; B[i] = Math.random() < 0.5 ? 1 : 0; }
    const rows = Math.min(N, GRID_ROWS);
    const hObs = [], hExp = [], snaps = [];

    const measure = () => {
      let ho = 0, he = 0;
      for (let l = 0; l < L; l++) {
        let c = 0, h = 0;
        for (let i = 0; i < N; i++) { const a = A[i * L + l], b = B[i * L + l]; c += a + b; h += a !== b ? 1 : 0; }
        const p = c / (2 * N);
        he += 2 * p * (1 - p); ho += h / N;
      }
      hObs.push(ho / L); hExp.push(he / L);
      // What the genome panel draws: a corner of the genotypes, and each drawn
      // individual's heterozygosity over all its loci, not just the shown ones.
      const cells = new Uint8Array(rows * GRID_COLS), rowHet = new Float32Array(rows);
      for (let i = 0; i < rows; i++) {
        let h = 0;
        for (let l = 0; l < L; l++) {
          const a = A[i * L + l], b = B[i * L + l];
          if (a !== b) h++;
          if (l < GRID_COLS) cells[i * GRID_COLS + l] = a + b; // 0 A₂A₂, 1 het, 2 A₁A₁
        }
        rowHet[i] = h / L;
      }
      snaps.push({ cells, rowHet });
    };

    measure();
    for (let g = 1; g <= G; g++) {
      const A2 = new Uint8Array(N * L), B2 = new Uint8Array(N * L);
      for (let j = 0; j < N; j++) {
        const mum = (Math.random() * N) | 0;
        const dad = Math.random() < sigma ? mum : (Math.random() * N) | 0;
        for (let l = 0; l < L; l++) {
          A2[j * L + l] = Math.random() < 0.5 ? A[mum * L + l] : B[mum * L + l];
          B2[j * L + l] = Math.random() < 0.5 ? A[dad * L + l] : B[dad * L + l];
        }
      }
      A = A2; B = B2;
      measure();
    }
    return { N, sigma, rows, hObs, hExp, snaps };
  }

  // The expectations, by recursion rather than closed form, because F starts at
  // zero and takes a few generations to reach σ/(2 − σ), and the gene pool's
  // loss depends on F as it goes: two genes drawn from the next generation share
  // a parent with probability 1/N, and are then identical with probability
  // (1 + F)/2 — so H falls by (1 + F)/2N, which is 1/2Ne with Ne = N/(1 + F).
  function theory3(N, sigma) {
    let F = 0, h = H0;
    const hExp = [h], hObs = [h], fis = [0];
    for (let g = 1; g <= G; g++) {
      h *= 1 - (1 + F) / (2 * N);
      F = sigma * (1 + F) / 2;
      hExp.push(h); hObs.push(h * (1 - F)); fis.push(F);
    }
    return { hExp, hObs, fis };
  }

  function drawGenomes(snap, N) {
    withCanvas(DOM.genomeCanvas, (ctx, W, H) => {
      if (!snap) {
        ctx.fillStyle = COLORS.inkSoft; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'center';
        ctx.fillText(T('ne.genomeEmpty', 'Press Run to see the genomes.'), W / 2, H / 2);
        return;
      }
      const rows = snap.rowHet.length;
      const barW = 46, padL = 4, padT = 4, padB = 18;
      const cw = (W - padL - barW - 10) / GRID_COLS, ch = (H - padT - padB) / rows;
      for (let i = 0; i < rows; i++) {
        for (let l = 0; l < GRID_COLS; l++) {
          const v = snap.cells[i * GRID_COLS + l], x = padL + l * cw, y = padT + i * ch;
          if (v === 1) {
            // A heterozygote is drawn as both its alleles, split along the
            // diagonal, so it reads as a mix the way the Drift Room's half-discs do.
            ctx.fillStyle = COLORS.alleleA;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cw - 1, y); ctx.lineTo(x, y + ch - 1); ctx.fill();
            ctx.fillStyle = COLORS.alleleB;
            ctx.beginPath(); ctx.moveTo(x + cw - 1, y); ctx.lineTo(x + cw - 1, y + ch - 1); ctx.lineTo(x, y + ch - 1); ctx.fill();
          } else {
            ctx.fillStyle = v === 2 ? COLORS.alleleA : COLORS.alleleB;
            ctx.globalAlpha = 0.35;
            ctx.fillRect(x, y, cw - 1, ch - 1);
            ctx.globalAlpha = 1;
          }
        }
        const bx = W - barW - 2, y = padT + i * ch;
        ctx.fillStyle = COLORS.paperDim; ctx.fillRect(bx, y, barW, ch - 1);
        ctx.fillStyle = COLORS.observed; ctx.fillRect(bx, y, barW * Math.min(1, snap.rowHet[i] / 0.5), ch - 1);
      }
      ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'left';
      ctx.fillText(T('ne.genomeLoci', '{c} of {l} loci →', { c: GRID_COLS, l: LOCI_IND }), padL, H - 5);
      ctx.textAlign = 'right';
      ctx.fillText(T('ne.genomeBar', 'own H'), W - 2, H - 5);
    });
    DOM.genomeLabel.textContent = snap
      ? T('ne.genomeShown', '{r} of {n} individuals', { r: snap.rowHet.length, n: N })
      : '—';
  }

  function draw3(cursor) {
    const N = state.N3, s = state.sigma, F = fEq(s), ne = N / (1 + F);
    DOM.selfHint.innerHTML = T('ne.selfHint', '<var>F</var> → {s}/(2 − {s}) = {f} · <var>N</var>ₑ = {n}/(1 + <var>F</var>) = {ne}',
      { s: s.toFixed(2), f: F.toFixed(2), n: N, ne: fmtN(ne) });
    DOM.ne3.textContent = fmtN(ne);

    const run = state.run3, upto = state.shown3;
    const th = theory3(N, s);
    const part = (arr) => run ? arr.slice(0, upto + 1) : [];
    lineChart(DOM.fCanvas, {
      ymax: 1, yticks: [0, 0.25, 0.5, 0.75, 1], ydp: 2,
      ylabel: T('ne.axisF', 'Inbreeding <var>F</var>'),
      series: [
        { data: th.fis, color: COLORS.room, width: 1.5, dash: [5, 4] },
        { data: th.hObs.map(h => 1 - h / H0), color: COLORS.observed, width: 1.5, dash: [5, 4] },
        { data: part(run ? run.hObs.map((h, g) => run.hExp[g] > 0 ? 1 - h / run.hExp[g] : 1) : []), color: COLORS.room, width: 2.5 },
        { data: part(run ? run.hObs.map(h => 1 - h / H0) : []), color: COLORS.observed, width: 2.5 }
      ],
      cursor: run ? cursor : null
    });
    lineChart(DOM.het3Canvas, {
      ymax: 0.5, yticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
      ylabel: T('ne.axisH3', 'Heterozygosity'),
      series: [
        { data: Array.from({ length: G + 1 }, (_, g) => idealDecay(N, g)), color: COLORS.census, width: 1.5, dash: [2, 3] },
        { data: th.hExp, color: COLORS.diversity, width: 1.5, dash: [5, 4] },
        { data: th.hObs, color: COLORS.observed, width: 1.5, dash: [5, 4] },
        { data: part(run ? run.hExp : []), color: COLORS.diversity, width: 2.5 },
        { data: part(run ? run.hObs : []), color: COLORS.observed, width: 2.5 }
      ],
      cursor: run ? cursor : null
    });
    drawGenomes(run ? run.snaps[Math.min(upto, G)] : null, N);

    if (run) {
      const g = Math.min(upto, G), he = run.hExp[g], ho = run.hObs[g];
      DOM.fis.textContent = he > 0 ? (1 - ho / he).toFixed(2) : '—';
      DOM.hObs.textContent = ho.toFixed(3);
      DOM.hExp.textContent = he.toFixed(3);
      DOM.neHat3.textContent = upto >= G ? fmtN(neFromDecay(run.hExp[10], run.hExp[G], G - 10)) : '—';
    } else {
      DOM.fis.textContent = DOM.hObs.textContent = DOM.hExp.textContent = DOM.neHat3.textContent = '—';
    }
    DOM.het3Canvas.setAttribute('aria-label', run
      ? T('ne.aria.het3', 'Heterozygosity against generation. At generation {g} the expected heterozygosity is {he} and the observed {ho}.',
          { g: upto, he: run.hExp[upto].toFixed(3), ho: run.hObs[upto].toFixed(3) })
      : T('ne.aria.het3Empty', 'Expected and observed heterozygosity against generation, with their expectations. No run yet.'));
    DOM.fCanvas.setAttribute('aria-label', T('ne.aria.f',
      'Inbreeding coefficient against generation: within the population, levelling at {f}, and relative to the founders, rising throughout.',
      { f: F.toFixed(2) }));
  }

  function reading3() {
    const { N, sigma, hObs, hExp } = state.run3;
    const fis = hExp[G] > 0 ? 1 - hObs[G] / hExp[G] : 1;
    const fit = 1 - hObs[G] / H0;
    const neHat = neFromDecay(hExp[10], hExp[G], G - 10);
    if (sigma === 0) {
      return T('ne.read3Out',
        'No selfing, so the genotypes stay in Hardy–Weinberg proportions and <var>F</var> within the population stays near zero ({fis}). Yet the population is inbred all the same: measured against its founders it has lost {pct}% of its heterozygosity, <var>F</var> = {fit}, not from any choice of mate but because in a population of {n} everyone ends up related to everyone. That is drift, under its other name.',
        { fis: fis.toFixed(2), pct: Math.round(fit * 100), fit: fit.toFixed(2), n: N });
    }
    return T('ne.read3',
      'With selfing at <var>σ</var> = {s}, <var>F</var> within the population rose in a few generations to {fis} (expected {feq}): that many fewer heterozygotes than random mating would make from the same allele frequencies. That part stops; it is a balance between selfing and outcrossing. The gene pool itself drained faster too — the purple line fell like a population of about {neHat}, against <var>N</var><sub>e</sub> = <var>N</var>/(1 + <var>F</var>) = {ne} and a census of {n}. A selfed offspring carries two copies of one parent\'s genes, so fewer genomes are passed on than there are individuals.',
      { s: sigma.toFixed(2), fis: fis.toFixed(2), feq: fEq(sigma).toFixed(2), neHat: fmtN(neHat), ne: fmtN(N / (1 + fEq(sigma))), n: N });
  }

  function onInbreedSlider() {
    state.N3 = parseInt(DOM.sliderN3.value, 10);
    state.sigma = parseFloat(DOM.sliderSelf.value);
    DOM.n3Val.textContent = state.N3;
    DOM.selfVal.textContent = state.sigma.toFixed(2);
    state.run3 = null; state.shown3 = 0;
    DOM.reading3.textContent = '';
    DOM.status3.textContent = T('ne.status3Ready', 'Set the population, then press Run.');
    draw3();
  }
  DOM.sliderN3.addEventListener('input', onInbreedSlider);
  DOM.sliderSelf.addEventListener('input', onInbreedSlider);

  DOM.btnRun3.addEventListener('click', () => {
    state.run3 = simulate3();
    DOM.reading3.textContent = '';
    DOM.sliderN3.disabled = DOM.sliderSelf.disabled = true;
    DOM.status3.textContent = T('ne.status3Run', 'Running {n} individuals × 100 loci…', { n: state.N3 });
    reveal('p3', DOM.btnRun3, (g) => { state.shown3 = g; draw3(g); }, () => {
      DOM.sliderN3.disabled = DOM.sliderSelf.disabled = false;
      DOM.status3.textContent = T('ne.status3Done', 'Done. Change the selfing rate and run again.');
      DOM.reading3.innerHTML = reading3();
    });
  });

  // ---- start -------------------------------------------------------------------

  function drawAll() {
    draw1(state.timers.p1 ? state.shown1 : null);
    draw2(state.timers.p2 ? state.shown2 : null);
    draw3(state.timers.p3 ? state.shown3 : null);
  }
  // The room is hidden on load, and a hidden canvas has no size to draw at;
  // switchTab fires a resize on every room change, which is the first moment
  // this room can be drawn.
  window.addEventListener('resize', () => {
    if (document.getElementById('tab-effective').classList.contains('active')) drawAll();
  });

  document.addEventListener('DOMContentLoaded', () => {
    drawParentage();
    onSexSlider();
    onInbreedSlider();
    clearRun1();
  });
})();
