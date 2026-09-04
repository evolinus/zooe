// The Hardy–Weinberg Room: how allele frequency sets genotype frequency under
// random mating — and why that lets the diploid Drift/Selection sims sample
// gametes and read the genotypes straight off.
//
// With allele A at frequency p (and a at q = 1 − p), the random union of two
// gametes gives genotypes in Hardy–Weinberg proportions: AA = p², Aa = 2pq,
// aa = q². Those proportions depend ONLY on p, so the sims never carry
// genotypes as state — they track p, then draw 2N gametes and pair them, which
// reproduces H-W for free.
//
// The room has two modes, and the "One generation of random mating" panel is
// the switch between them:
//   panel CLOSED — the allele-frequency slider is in charge and G0 is built in
//                  Hardy–Weinberg proportions at that p;
//   panel OPEN   — the two handles on the genotype bar are in charge. They cut
//                  the population into ANY mix of AA, Aa and aa, so the allele
//                  frequency becomes a consequence of the mix rather than an
//                  input. The p slider goes inactive and follows along.
//
// Layout: parameters, then the panel that carries the room's whole claim — the
// parents' genotype bar plus three histograms, Observed (G0) vs Expected
// (p²:2pq:q²) vs After one random mating (G1). Drag the handles to a mix far
// from Hardy–Weinberg and the observed bars move a long way while the offspring
// still land on the expected ones: that is the lesson in one gesture. Below it,
// the G0 → gamete wheel → G1 machinery that actually performs the mating, then
// the H-W square and the genotype curves.
(function () {
  const $ = (id) => document.getElementById(id + '_hw');
  // Fills {placeholders} in an English template string.
  // Variables and allele symbols are italic by convention, the digit indexing
  // them is not. Applied at the HTML sinks only: the same L labels also go to
  // canvas, which carries no markup.
  const V = (html) => String(html).replace(/([A-Za-z])([\u2080\u2081\u2082])/g, '<var>$1</var>$2');


  const COLORS = {
    paper: '#EDE6D6', paperDim: '#E2D9C4', ink: '#262220', inkSoft: '#6b6258',
    rule: '#cabfa8',
    A: '#2E5C8A',      // allele A / genotype AA — same blue as the Drift room
    a: '#A8442A',      // allele a / genotype aa
    het: '#7A5C99',    // heterozygote Aa
    stamp: '#C08A2E'
  };

  const state = {
    p: 0.5,
    N: 50,
    // Advanced mode: a 0..1 bar cut by two draggable handles into AA | Aa | aa.
    custom: false,
    cutA: 0.25, cutB: 0.75,
    g0: null,          // array of 'AA'|'AB'|'BB'
    g1: null,
    g1Partial: null,   // gametes drawn so far while G1 is being assembled
    p0: null, p1: null,
    building: false,
    wheelAngle: 0,
    wheelFreq: 0.5
  };

  const DOM = {
    sliderP: $('sliderP'), pVal: $('pVal'), qVal: $('qVal'), pHint: $('pHint'),
    sliderN: $('sliderN'), nVal: $('nVal'),
    btnMate: $('btnMate'), btnBuild: $('btnBuild'), btnReset: $('btnReset'),
    statusBar: $('statusBar'),
    g0Canvas: $('g0Canvas'), g0Stat: $('g0Stat'),
    wheelCanvas: $('wheelCanvas'), gamStat: $('gamStat'),
    g1Canvas: $('g1Canvas'), g1Stat: $('g1Stat'),
    squareCanvas: $('squareCanvas'), squareNote: $('squareNote'), curvesCanvas: $('curvesCanvas'),
    freqAA: $('freqAA'), freqAa: $('freqAa'), freqaa: $('freqaa'),
    reading: $('reading'),
    customPanel: $('customPanel'),
    genoBar: $('genoBar'), genoBarSvg: $('genoBarSvg'),
    startAAVal: $('startAAVal'), startAaVal: $('startAaVal'), startaaVal: $('startaaVal'),
    startP: $('startP'),
    equilCanvas: $('equilCanvas'), equilNote: $('equilNote')
  };

  // Display names. The model still stores gametes as 'A'/'a' and genotypes as
  // 'AA'/'AB'/'BB'; these are labels only, so the object keys below stay put.
  const L = { A: 'A₁', a: 'A₂', AA: 'A₁A₁', Aa: 'A₁A₂', aa: 'A₂A₂' };

  const genoFreqs = (p) => ({ AA: p * p, Aa: 2 * p * (1 - p), aa: (1 - p) * (1 - p) });
  const freqOf = (pop) => {
    if (!pop || !pop.length) return null;
    let a = 0;
    for (const g of pop) { if (g === 'AA') a += 2; else if (g === 'AB') a += 1; }
    return a / (2 * pop.length);
  };
  const counts = (pop) => ({
    AA: pop.filter(g => g === 'AA').length,
    Aa: pop.filter(g => g === 'AB').length,
    aa: pop.filter(g => g === 'BB').length
  });
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const pNow = () => (state.p0 != null ? state.p0 : state.p);

  function withCanvas(canvas, cb) {
    const r = canvas.parentElement.getBoundingClientRect();
    const W = Math.round(r.width), H = Math.round(r.height);
    if (W < 2 || H < 2) return;
    const ctx = canvas.getContext('2d');
    scaleCanvas(canvas, ctx, W, H);
    ctx.clearRect(0, 0, W, H);
    cb(ctx, W, H);
  }

  const setStatus = (fn) => { DOM.statusBar.textContent = fn(); };

  // The genotype mix G0 is asked to have: the handle cuts in custom mode,
  // Hardy–Weinberg at the slider's p otherwise.
  const cutFreqs = () => ({ AA: state.cutA, Aa: state.cutB - state.cutA, aa: 1 - state.cutB });
  const targetFreqs = () => (state.custom ? cutFreqs() : genoFreqs(state.p));

  // ---- individuals ----------------------------------------------------------
  // Same convention as the Drift/Selection rooms: an individual is one circle
  // split into two half-discs, left half = first gamete, right half = second.
  const alleleColor = (al) => (al === 'A' ? COLORS.A : COLORS.a);

  function drawIndividual(ctx, cx, cy, r, a0, a1) {
    if (a0) {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
      ctx.fillStyle = alleleColor(a0); ctx.fill();
    }
    if (a1) {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2); ctx.closePath();
      ctx.fillStyle = alleleColor(a1); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 0.75; ctx.stroke();
  }

  function popGeom(n, W, H) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * W / H)));
    const rows = Math.ceil(n / cols);
    const cellW = W / cols, cellH = H / rows;
    return { cols, cellW, cellH, r: Math.min(cellW, cellH) * 0.34 };
  }

  function drawPop(canvas, pop) {
    withCanvas(canvas, (ctx, W, H) => {
      if (!pop) return;
      const { cols, cellW, cellH, r } = popGeom(pop.length, W, H);
      pop.forEach((g, i) => {
        const cx = cellW * ((i % cols) + 0.5), cy = cellH * (Math.floor(i / cols) + 0.5);
        drawIndividual(ctx, cx, cy, r, g[0], g[1]);
      });
    });
  }

  // G1 mid-assembly: gamete j fills the (j mod 2) half of individual ⌊j/2⌋.
  function drawG1Partial(gametes, highlightGene) {
    withCanvas(DOM.g1Canvas, (ctx, W, H) => {
      const n = state.N;
      const { cols, cellW, cellH, r } = popGeom(n, W, H);
      const curInd = highlightGene >= 0 ? Math.floor(highlightGene / 2) : -1;
      for (let k = 0; k < n; k++) {
        const cx = cellW * ((k % cols) + 0.5), cy = cellH * (Math.floor(k / cols) + 0.5);
        if (k === curInd) {
          ctx.beginPath(); ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.paperDim; ctx.fill();
          ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 2; ctx.stroke();
        }
        const a0 = 2 * k < gametes.length ? gametes[2 * k] : null;
        const a1 = 2 * k + 1 < gametes.length ? gametes[2 * k + 1] : null;
        if (a0 || a1) drawIndividual(ctx, cx, cy, r, a0, a1);
      }
    });
  }

  // ---- the gamete wheel -----------------------------------------------------
  function drawWheel(angle) {
    withCanvas(DOM.wheelCanvas, (ctx, W, H) => {
      const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 6;
      const aA = state.wheelFreq * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, angle, angle + aA); ctx.closePath();
      ctx.fillStyle = COLORS.A; ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, angle + aA, angle + Math.PI * 2); ctx.closePath();
      ctx.fillStyle = COLORS.a; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.paper; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    });
  }

  // Timing ramp copied from the Drift room's intro: the first few draws are
  // slow enough to follow, then it accelerates to full speed.
  function spinTiming(i) {
    const TARGET = 55, SLOW = 900, RAMP_START = 3, RAMP_LEN = 4;
    if (i < RAMP_START) return { dur: SLOW * 0.82, gap: SLOW * 0.18 };
    const t = Math.min((i - RAMP_START) / RAMP_LEN, 1);
    const total = SLOW + (TARGET - SLOW) * t * t;
    return { dur: total * 0.82, gap: total * 0.18 };
  }

  function spinOnce(freq, dur) {
    return new Promise(resolve => {
      const X = Math.random();
      const outcome = X < freq ? 'A' : 'a';
      const target = -Math.PI / 2 - X * Math.PI * 2 + (3 + Math.floor(Math.random() * 2)) * Math.PI * 2;
      const start = performance.now();
      function frame(t) {
        const raw = Math.min((t - start) / dur, 1);
        state.wheelAngle = target * (1 - Math.pow(1 - raw, 3));
        drawWheel(state.wheelAngle);
        if (raw < 1) requestAnimationFrame(frame);
        else { state.wheelAngle = ((target % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); resolve(outcome); }
      }
      requestAnimationFrame(frame);
    });
  }

  // ---- G0 -------------------------------------------------------------------
  // G0 is built to order rather than sampled, so that "observed" differs from
  // "expected" only because of the mix you asked for — no sampling noise
  // muddying the comparison. Largest-remainder rounding turns the three target
  // frequencies into three integer counts that still add up to exactly N.
  function makeG0(f, N) {
    const raw = [f.AA * N, f.Aa * N, f.aa * N];
    const n = raw.map(v => Math.floor(Math.max(0, v)));
    let left = N - n[0] - n[1] - n[2];
    const order = raw.map((v, i) => [v - n[i], i]).sort((x, y) => y[0] - x[0]);
    for (let k = 0; left > 0; k++, left--) n[order[k % 3][1]]++;

    const pop = [];
    for (let i = 0; i < n[0]; i++) pop.push('AA');
    for (let i = 0; i < n[1]; i++) pop.push('AB');
    for (let i = 0; i < n[2]; i++) pop.push('BB');
    for (let i = pop.length - 1; i > 0; i--) {   // shuffle, so the picture looks like a population
      const j = Math.floor(Math.random() * (i + 1));
      [pop[i], pop[j]] = [pop[j], pop[i]];
    }
    return pop;
  }

  function statLine(pop, expectedP) {
    const c = counts(pop), N = pop.length, e = genoFreqs(expectedP);
    return V(`${L.AA} <strong>${c.AA}</strong> · ${L.Aa} <strong>${c.Aa}</strong> · ${L.aa} <strong>${c.aa}</strong>` +
      ` <span style="color:var(--ink-soft)">(` +
      T('hw.expects', 'H-W expects {aa} / {ab} / {bb}',
        { aa: (e.AA * N).toFixed(1), ab: (e.Aa * N).toFixed(1), bb: (e.aa * N).toFixed(1) }) +
      `)</span> · f(${L.A}) = <strong>${freqOf(pop).toFixed(3)}</strong>`);
  }

  function newG0() {
    state.g0 = makeG0(targetFreqs(), state.N);
    state.p0 = freqOf(state.g0);
    if (state.custom) {
      // Snap the handles onto the population they actually produced: you can
      // only have whole individuals, so the cuts land on multiples of 1/N and
      // the bar, the handles and the counts all tell the same story.
      const c = counts(state.g0);
      state.cutA = c.AA / state.N;
      state.cutB = (c.AA + c.Aa) / state.N;
    }
    state.g1 = null; state.p1 = null; state.g1Partial = null;
    state.wheelFreq = state.p0;
    // In custom mode the handles are in charge, so the (inactive) p slider
    // follows the allele frequency they imply rather than dictating it.
    if (state.custom) { state.p = state.p0; syncDeckP(); }
    DOM.g0Stat.innerHTML = statLine(state.g0, state.p0);
    DOM.g1Stat.innerHTML = '—';
    DOM.gamStat.textContent = '—';
    drawPop(DOM.g0Canvas, state.g0);
    withCanvas(DOM.g1Canvas, () => {});
    drawWheel(state.wheelAngle);
    renderSquareAndCurves();
    renderMixPanel();
  }

  function syncDeckP() {
    DOM.pVal.textContent = state.p.toFixed(2);
    DOM.qVal.textContent = (1 - state.p).toFixed(2);
    DOM.sliderP.value = Math.min(0.99, Math.max(0.01, state.p));
  }

  // ---- G1: the same random mating, animated or instant -----------------------
  const drawGametes = (p, n) => Array.from({ length: n }, () => (Math.random() < p ? 'A' : 'a'));

  function pairGametes(gametes) {
    const pop = [];
    for (let k = 0; k * 2 + 1 < gametes.length; k++) {
      const a = gametes[2 * k], b = gametes[2 * k + 1];
      pop.push(a === b ? (a === 'A' ? 'AA' : 'BB') : 'AB');
    }
    return pop;
  }

  function settleG1(pop) {
    state.g1 = pop; state.p1 = freqOf(pop); state.g1Partial = null;
    drawPop(DOM.g1Canvas, pop);
    DOM.g1Stat.innerHTML = statLine(pop, state.p0);
    renderSquareAndCurves();
    renderMixPanel();
    DOM.reading.innerHTML = matedReading();
  }

  function lockControls(on) {
    [DOM.btnMate, DOM.btnBuild, DOM.btnReset, DOM.sliderN].forEach(el => { el.disabled = on; });
    DOM.sliderP.disabled = on || state.custom;
  }

  // Instant version: 2N gametes drawn from G0's gene pool and paired at random.
  function mateInstantly() {
    if (state.building || !state.g0) return;
    settleG1(pairGametes(drawGametes(state.p0, 2 * state.N)));
    setStatus(() => T('hw.g1Complete', 'G1 complete — {n} individuals from {g} gametes.',
      { n: state.N, g: 2 * state.N }));
  }

  // Animated version: exactly the same draw, one spin of the wheel at a time.
  async function buildG1() {
    if (state.building || !state.g0) return;
    state.building = true;
    lockControls(true);

    const p0 = state.p0, N = state.N, total = 2 * N;
    state.wheelFreq = p0;
    const gametes = [];
    state.g1Partial = gametes;

    for (let j = 0; j < total; j++) {
      const { dur, gap } = spinTiming(j);
      setStatus(() => T('hw.drawing', "Drawing gamete {j} / {total} from G0's gene pool…",
        { j: j + 1, total }));
      DOM.gamStat.textContent = `${j + 1} / ${total}`;
      const al = await spinOnce(p0, dur);
      gametes.push(al);
      drawG1Partial(gametes, j + 1 < total ? j + 1 : -1);
      if (gap > 2) await delay(gap);
    }

    settleG1(pairGametes(gametes));
    setStatus(() => T('hw.g1Complete', 'G1 complete — {n} individuals from {g} gametes.',
      { n: N, g: total }));
    state.building = false;
    lockControls(false);
  }

  // ---- the H-W square -------------------------------------------------------
  // Each cell carries its genotype, its frequency and the expected NUMBER of
  // individuals in a population of N — so the abstract areas become countable
  // things. The heterozygote sits in two cells of pq each; the note below the
  // square adds them up, which is where the 2 in 2pq comes from.
  function drawSquare(ctx, W, H) {
    const p = pNow(), q = 1 - p, N = state.N;
    const padL = 30, padR = 10, padT = 14, padB = 30;
    const S = Math.min(W - padL - padR, H - padT - padB);
    const x0 = padL, y0 = padT, px = x0 + p * S, py = y0 + p * S;

    ctx.fillStyle = COLORS.A; ctx.fillRect(x0, y0, p * S, p * S);
    ctx.fillStyle = COLORS.a; ctx.fillRect(px, py, q * S, q * S);
    ctx.fillStyle = COLORS.het;
    ctx.fillRect(px, y0, q * S, p * S);
    ctx.fillRect(x0, py, p * S, q * S);

    ctx.strokeStyle = COLORS.paper; ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y0, S, S);
    ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y0 + S); ctx.moveTo(x0, py); ctx.lineTo(x0 + S, py); ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Genotype, frequency, and expected head-count — dropping lines as cells shrink.
    const cell = (geno, freq, cx, cy, w, h) => {
      if (w < 22 || h < 16) return;
      if (w < 58 || h < 44) {
        ctx.font = 'bold 12px ui-monospace, monospace';
        fillSci(ctx, geno, cx, cy);
        return;
      }
      ctx.font = 'bold 13px ui-monospace, monospace';
      fillSci(ctx, geno, cx, cy - 14);
      ctx.font = '10.5px ui-monospace, monospace';
      ctx.fillText(freq.toFixed(3), cx, cy + 1);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText(T('hw.indShort', '{n} ind.', { n: (freq * N).toFixed(1) }), cx, cy + 16);
    };
    cell(L.AA, p * p, x0 + p * S / 2, y0 + p * S / 2, p * S, p * S);
    cell(L.aa, q * q, px + q * S / 2, py + q * S / 2, q * S, q * S);
    cell(L.Aa, p * q, px + q * S / 2, y0 + p * S / 2, q * S, p * S);
    cell(L.Aa, p * q, x0 + p * S / 2, py + q * S / 2, p * S, q * S);

    ctx.fillStyle = COLORS.inkSoft; ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    if (p > 0.08) fillSci(ctx, L.A, x0 + p * S / 2, y0 + S + 4);
    if (q > 0.08) fillSci(ctx, L.a, px + q * S / 2, y0 + S + 4);
    ctx.save(); ctx.translate(x0 - 5, 0); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (p > 0.08) fillSci(ctx, L.A, -(y0 + p * S / 2), 0);
    if (q > 0.08) fillSci(ctx, L.a, -(py + q * S / 2), 0);
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(T('hw.eggAllele', 'egg allele →'), x0 + S / 2, y0 + S + 15);
  }

  // ---- genotype-frequency curves, with a marker per generation --------------
  function drawCurves(ctx, W, H) {
    const padL = 34, padR = 12, padT = 28, padB = 32;
    const gw = W - padL - padR, gh = H - padT - padB;
    const X = (t) => padL + t * gw, Y = (f) => padT + (1 - f) * gh;

    ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace';
    [0, 0.5, 1].forEach(v => {
      const y = Y(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(v.toFixed(1), padL - 4, y);
    });
    ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [0, 0.5, 1].forEach(v => ctx.fillText(v.toFixed(1), X(v), H - padB + 6));
    fillSci(ctx, T('hw.freqAxis', 'allele frequency  <var>p</var>'), padL + gw / 2, H - 12);

    const curve = (fn, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 100; i++) { const t = i / 100, x = X(t), y = Y(fn(t)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    };
    curve(t => t * t, COLORS.A);
    curve(t => 2 * t * (1 - t), COLORS.het);
    curve(t => (1 - t) * (1 - t), COLORS.a);

    ctx.font = '9px ui-monospace, monospace'; ctx.textBaseline = 'middle';
    let lx = padL + 2;
    [[L.AA, COLORS.A], [L.Aa, COLORS.het], [L.aa, COLORS.a]].forEach(([t, c]) => {
      ctx.strokeStyle = c; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(lx, padT - 16); ctx.lineTo(lx + 12, padT - 16); ctx.stroke();
      ctx.fillStyle = COLORS.inkSoft; ctx.textAlign = 'left'; ctx.fillText(t, lx + 15, padT - 16); lx += 44;
    });

    // One marker per generation: solid for G0, hollow for G1.
    const mark = (p, label, filled) => {
      if (p == null) return;
      const mx = X(p);
      ctx.save(); ctx.strokeStyle = COLORS.stamp; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(mx, padT); ctx.lineTo(mx, padT + gh); ctx.stroke(); ctx.restore();
      const f = genoFreqs(p);
      [[f.AA, COLORS.A], [f.Aa, COLORS.het], [f.aa, COLORS.a]].forEach(([v, c]) => {
        ctx.beginPath(); ctx.arc(mx, Y(v), 4, 0, Math.PI * 2);
        if (filled) { ctx.fillStyle = c; ctx.fill(); }
        else { ctx.fillStyle = COLORS.paper; ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke(); }
      });
      ctx.fillStyle = COLORS.ink; ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(label, mx, padT - 3);
    };
    mark(pNow(), state.p0 != null ? 'G0' : 'p', true);
    mark(state.p1, 'G1', false);
  }

  function renderSquareAndCurves() {
    const p = pNow(), N = state.N, f = genoFreqs(p);
    DOM.freqAA.textContent = f.AA.toFixed(3);
    DOM.freqAa.textContent = f.Aa.toFixed(3);
    DOM.freqaa.textContent = f.aa.toFixed(3);
    DOM.squareNote.innerHTML = V(T('hw.squareNote',
      `Expected in <var>N</var> = {n}: {Laa} <strong>{eaa}</strong> · ` +
      `{Lab} <strong>{half} + {half} = {eab}</strong> · ` +
      `{Lbb} <strong>{ebb}</strong> &nbsp;—&nbsp; the two mixed cells are where the 2 in 2pq comes from.`,
      { n: N, Laa: L.AA, Lab: L.Aa, Lbb: L.aa,
        eaa: (f.AA * N).toFixed(1), half: (p * (1 - p) * N).toFixed(1),
        eab: (f.Aa * N).toFixed(1), ebb: (f.aa * N).toFixed(1) }));
    withCanvas(DOM.squareCanvas, drawSquare);
    withCanvas(DOM.curvesCanvas, drawCurves);
  }

  // ---- the parents' genotype bar, cut by two draggable handles ---------------
  function renderGenoBar() {
    const svg = DOM.genoBarSvg;
    const W = svg.clientWidth || svg.parentElement.clientWidth || 600;
    // The H-W caption goes above the bar and the handles below it, so the two
    // never collide when the mix sits exactly on the dashed marks.
    const H = 66, barY = 18, barH = 30;
    if (!state.g0) return;
    const N = state.N, c = counts(state.g0);
    const obs = { AA: c.AA / N, Aa: c.Aa / N, aa: c.aa / N };
    const hw = genoFreqs(pNow());
    const x = (t) => t * W;

    const seg = (x0, x1, color, label) => {
      const w = Math.max(0, x1 - x0);
      let s = `<rect x="${x0}" y="${barY}" width="${w}" height="${barH}" fill="${color}"/>`;
      if (w > 30) s += `<text x="${x0 + w / 2}" y="${barY + barH / 2 + 4}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="11" font-weight="bold" fill="#fff">${sciTspan(label)}</text>`;
      return s;
    };
    // Where Hardy–Weinberg would place the two cuts, so the gap is visible.
    const hwMark = (t, first) =>
      `<line x1="${x(t)}" y1="${barY - 4}" x2="${x(t)}" y2="${barY + barH + 4}" stroke="${COLORS.ink}" stroke-width="1.5" stroke-dasharray="3 3"/>` +
      (first ? `<text x="${x(t)}" y="${barY - 8}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="${COLORS.inkSoft}">${T('hw.hwCuts', 'H–W cuts')}</text>` : '');
    const handle = (t, id) =>
      `<g class="hw-handle" data-handle="${id}" style="cursor:ew-resize">` +
      `<line x1="${x(t)}" y1="${barY - 4}" x2="${x(t)}" y2="${barY + barH + 4}" stroke="${COLORS.ink}" stroke-width="3"/>` +
      `<circle cx="${x(t)}" cy="${barY + barH + 11}" r="6" fill="${COLORS.paper}" stroke="${COLORS.ink}" stroke-width="2"/>` +
      `<rect x="${x(t) - 12}" y="${barY - 6}" width="24" height="${barH + 24}" fill="transparent"/></g>`;

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML =
      seg(x(0), x(obs.AA), COLORS.A, `${L.AA} ${obs.AA.toFixed(2)}`) +
      seg(x(obs.AA), x(obs.AA + obs.Aa), COLORS.het, `${L.Aa} ${obs.Aa.toFixed(2)}`) +
      seg(x(obs.AA + obs.Aa), x(1), COLORS.a, `${L.aa} ${obs.aa.toFixed(2)}`) +
      `<rect x="0" y="${barY}" width="${W}" height="${barH}" fill="none" stroke="${COLORS.ink}" stroke-width="1"/>` +
      hwMark(hw.AA, true) + hwMark(hw.AA + hw.Aa, false) +
      handle(state.cutA, 'A') + handle(state.cutB, 'B');
  }

  let dragging = null;
  function barPos(evt) {
    const r = DOM.genoBarSvg.getBoundingClientRect();
    return Math.min(1, Math.max(0, (evt.clientX - r.left) / r.width));
  }
  DOM.genoBarSvg.addEventListener('pointerdown', (e) => {
    if (state.building) return;
    const g = e.target.closest('.hw-handle');
    if (!g) return;
    dragging = g.dataset.handle;
    DOM.genoBarSvg.setPointerCapture(e.pointerId);
  });
  DOM.genoBarSvg.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const t = barPos(e);
    if (dragging === 'A') state.cutA = Math.min(t, state.cutB);
    else state.cutB = Math.max(t, state.cutA);
    newG0();
    DOM.reading.innerHTML = startReading();
    setStatus(() => T('hw.recut', 'Parents re-cut by hand.'));
  });
  DOM.genoBarSvg.addEventListener('pointerup', (e) => {
    if (dragging) { DOM.genoBarSvg.releasePointerCapture(e.pointerId); dragging = null; }
  });

  // Draws text centred in a box, shrinking the font until it fits. The three
  // histogram captions sit shoulder to shoulder, so a long one has to give way
  // rather than run across the next group.
  function fitText(ctx, text, cx, cy, maxW, baseSize, weight) {
    let size = baseSize;
    const font = (px) => `${weight ? weight + ' ' : ''}${px}px ui-monospace, monospace`;
    ctx.font = font(size);
    while (size > 6 && ctx.measureText(text).width > maxW) {
      size -= 0.5;
      ctx.font = font(size);
    }
    ctx.fillText(text, cx, cy);
  }

  // ---- the three histograms -------------------------------------------------
  // Observed (what the parents actually are) · Expected (p²:2pq:q² from their
  // allele frequency) · After one random mating (the realised offspring). Bars
  // are counts of individuals on a fixed 0…N axis so all three are comparable
  // at a glance, and so they read the same way as the H-W square above.
  function drawHist(ctx, W, H) {
    const N = state.N, p = pNow(), e = genoFreqs(p);
    const groups = [
      { title: T('hw.hObserved', 'OBSERVED'), sub: T('hw.subG0', 'G0 parents'),
        v: state.g0 ? counts(state.g0) : null, ghost: false },
      { title: T('hw.hExpected', 'EXPECTED'), sub: 'p² : 2pq : q²',
        v: { AA: e.AA * N, Aa: e.Aa * N, aa: e.aa * N }, ghost: true },
      { title: T('hw.hAfter', 'AFTER ONE RANDOM MATING'), sub: T('hw.subG1', 'G1 offspring'),
        v: state.g1 ? counts(state.g1) : null, ghost: false,
        empty: T('hw.emptyPress', 'press ⚡ Mate randomly') }
    ];

    const padL = 44, padR = 14, padT = 20, padB = 52;
    const gw = W - padL - padR, gh = H - padT - padB;
    if (gw < 60 || gh < 40) return;
    const Y = (v) => padT + (1 - v / N) * gh;

    ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach(v => {
      const y = Y(v * N);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(String(Math.round(v * N)), padL - 6, y);
    });
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(11, padT + gh / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLORS.inkSoft; ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(T('hw.individuals', 'Individuals'), 0, 0);
    ctx.restore();

    const gap = 20;
    const groupW = (gw - gap * (groups.length - 1)) / groups.length;
    groups.forEach((g, gi) => {
      const gx = padL + (groupW + gap) * gi;
      const barW = groupW / 3;

      if (!g.v) {
        ctx.save();
        ctx.setLineDash([4, 4]); ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1;
        ctx.strokeRect(gx + 2, padT, groupW - 4, gh);
        ctx.restore();
        ctx.fillStyle = COLORS.inkSoft; ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        fitText(ctx, g.empty || '—', gx + groupW / 2, padT + gh / 2, groupW - 8, 10);
      } else {
        [['AA', COLORS.A], ['Aa', COLORS.het], ['aa', COLORS.a]].forEach(([k, c], bi) => {   // k indexes g.v; L[k] is what gets drawn
          const bx = gx + bi * barW + 4, bw = barW - 8;
          const h = Math.max(0, (g.v[k] / N) * gh), y = padT + gh - h;
          if (g.ghost) {
            ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = c; ctx.fillRect(bx, y, bw, h); ctx.restore();
            ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
            ctx.strokeRect(bx + 0.5, y + 0.5, bw - 1, Math.max(1, h - 1));
            ctx.setLineDash([]);
          } else {
            ctx.fillStyle = c; ctx.fillRect(bx, y, bw, h);
          }
          ctx.fillStyle = COLORS.ink; ctx.font = 'bold 9.5px ui-monospace, monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(g.ghost ? g.v[k].toFixed(1) : String(g.v[k]), bx + bw / 2, y - 2);
        });
      }

      ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      if (g.v) ['AA', 'Aa', 'aa'].forEach((k, bi) => fillSci(ctx, L[k], gx + (bi + 0.5) * barW, padT + gh + 4));
      ctx.fillStyle = COLORS.ink;
      fitText(ctx, g.title, gx + groupW / 2, padT + gh + 20, groupW - 6, 9.5, 'bold');
      ctx.fillStyle = COLORS.inkSoft;
      fitText(ctx, g.sub, gx + groupW / 2, padT + gh + 33, groupW - 6, 9);
    });
  }

  function renderMixPanel() {
    if (!state.g0) return;
    const N = state.N, c = counts(state.g0);
    DOM.startAAVal.textContent = (c.AA / N).toFixed(2);
    DOM.startAaVal.textContent = (c.Aa / N).toFixed(2);
    DOM.startaaVal.textContent = (c.aa / N).toFixed(2);
    DOM.startP.textContent = state.p0.toFixed(3);
    renderGenoBar();
    withCanvas(DOM.equilCanvas, drawHist);
    DOM.equilNote.innerHTML = state.g1 ? matedNote() : mixPrompt();
  }

  // ---- mode switch ----------------------------------------------------------
  // Opening the panel hands control to the handles: they start on the current
  // Hardy–Weinberg split so nothing jumps, and the p slider goes inactive
  // because p is now a consequence of the mix. Closing it gives the slider back
  // and snaps G0 to Hardy–Weinberg at whatever p the handles left behind.
  function setCustom(on) {
    state.custom = on;
    if (on) {
      const f = genoFreqs(pNow());
      state.cutA = f.AA;
      state.cutB = f.AA + f.Aa;
    }
    DOM.sliderP.disabled = on;
    DOM.pHint.hidden = !on;
    newG0();
    DOM.reading.innerHTML = startReading();
    setStatus(() => (on
      ? T('hw.modeCustom', 'Custom mix: the two handles set the parents, and p follows them.')
      : T('hw.modeHW', 'Hardy–Weinberg mix: the allele-frequency slider sets the parents.')));
  }

  // ---- narrative ------------------------------------------------------------
  function startReading() {
    const how = state.custom
      ? T('hw.startCustom',
          `<strong>G0</strong> is the population you cut out with the two handles — any mix of {aa}, {ab} and {bb} you like. ` +
          `Its allele frequency p is whatever that mix implies, which is why the slider above is following rather than leading. `,
          { aa: L.AA, ab: L.Aa, bb: L.aa })
      : T('hw.startHW',
          `<strong>G0</strong> is a population of N individuals in Hardy–Weinberg proportions at the allele frequency you set: ` +
          `{aa} = p², {ab} = 2pq, {bb} = q². Open the panel below to build a population that is <em>not</em> in Hardy–Weinberg. `,
          { aa: L.AA, ab: L.Aa, bb: L.aa });
    return V(how + T('hw.startTail',
      `Press <strong>⚡ Mate randomly</strong> for the result of one generation of random mating, or ` +
      `<strong>▶ Build G1 gamete by gamete</strong> to watch the very same draw happen one spin at a time.`));
  }

  const mixPrompt = () => {
    const e = genoFreqs(pNow()), N = state.N, c = counts(state.g0);
    const off = Math.abs(c.AA - e.AA * N) > 0.5 || Math.abs(c.Aa - e.Aa * N) > 0.5;
    return V(T('hw.mixPrompt',
      `The bar and the first histogram show <strong>what the parents actually are</strong>; the middle histogram ` +
      `shows what Hardy–Weinberg <strong>expects</strong> from their allele frequency, <var>p</var> = {p}. `,
      { p: pNow().toFixed(3) }) +
      (off
        ? T('hw.mixOff',
            `Right now they disagree — your mix is not in Hardy–Weinberg. Press <strong>⚡ Mate randomly</strong> and ` +
            `watch where one generation of random mating puts the offspring.`)
        : T('hw.mixOn',
            `Right now they agree, because the handles sit on the Hardy–Weinberg cuts. Drag a handle away from the dashed ` +
            `marks and watch which of the two histograms moves.`)));
  };

  const matedNote = () => {
    const N = state.N, e = genoFreqs(state.p0);
    const c = counts(state.g1), c0 = counts(state.g0);
    return V(T('hw.matedNote',
      `The parents were <strong>{p0aa} {Laa} · {p0ab} {Lab} · {p0bb} {Lbb}</strong>, at p = ` +
      `<strong>{p}</strong>. Hardy–Weinberg expects <strong>{eaa} · {eab} · {ebb}</strong> — and their offspring came out at ` +
      `<strong>{caa} · {cab} · {cbb}</strong>. <em>The key move:</em> drag the handles to a very different mix ` +
      `but keep p the same — more {Laa} <em>and</em> more {Lbb}, fewer {Lab} — then mate again. The observed parent bars move a ` +
      `long way; the expected bars do not move at all, and the offspring follow the expected ones every time. However ` +
      `the alleles were packaged into the parents, one round of random mating forgets it — only p survives.`,
      { p0aa: c0.AA, p0ab: c0.Aa, p0bb: c0.aa, Laa: L.AA, Lab: L.Aa, Lbb: L.aa,
        p: state.p0.toFixed(3),
        eaa: (e.AA * N).toFixed(1), eab: (e.Aa * N).toFixed(1), ebb: (e.aa * N).toFixed(1),
        caa: c.AA, cab: c.Aa, cbb: c.aa }));
  };

  const matedReading = () =>
    V(T('hw.matedReading',
      `G1 was built from <strong>{g} gametes</strong> drawn out of G0's gene pool and paired at random — two ` +
      `per individual, exactly what the diploid Drift and Selection rooms do. G0 had f({a}) = ` +
      `<strong>{p0}</strong> and its offspring came out at <strong>{p1}</strong>: ` +
      `close, but not identical, because 2<var>N</var> draws are a finite sample — that small wobble <em>is</em> genetic drift, ` +
      `which the next room follows over many generations. The genotypes, meanwhile, land on p², 2pq and q² whatever the ` +
      `parents looked like: genotype frequency simply follows allele frequency.`,
      { g: 2 * state.N, a: L.A, p0: state.p0.toFixed(3), p1: state.p1.toFixed(3) }));

  // ---- wiring ---------------------------------------------------------------
  DOM.sliderP.addEventListener('input', () => {
    state.p = +DOM.sliderP.value;
    DOM.pVal.textContent = state.p.toFixed(2);
    DOM.qVal.textContent = (1 - state.p).toFixed(2);
    newG0();
    drawWheel(state.wheelAngle);
  });
  DOM.sliderN.addEventListener('input', () => {
    state.N = +DOM.sliderN.value; DOM.nVal.textContent = state.N; newG0();
  });
  DOM.customPanel.addEventListener('toggle', () => setCustom(DOM.customPanel.open));
  DOM.btnMate.addEventListener('click', mateInstantly);
  DOM.btnBuild.addEventListener('click', buildG1);
  DOM.btnReset.addEventListener('click', () => {
    if (state.building) return;
    state.wheelAngle = 0;
    newG0();
    DOM.reading.innerHTML = startReading();
    setStatus(() => T('hw.newG0', 'New G0 drawn. Ready.'));
  });

  function renderAll() {
    drawPop(DOM.g0Canvas, state.g0);
    if (state.g1) drawPop(DOM.g1Canvas, state.g1);
    else if (state.g1Partial) drawG1Partial(state.g1Partial, -1);
    if (!state.building) drawWheel(state.wheelAngle);
    renderSquareAndCurves();
    renderMixPanel();
  }

  const ro = new ResizeObserver(() => renderAll());
  [DOM.g0Canvas, DOM.wheelCanvas, DOM.g1Canvas, DOM.squareCanvas, DOM.curvesCanvas, DOM.equilCanvas]
    .forEach(c => ro.observe(c.parentElement));
  ro.observe(DOM.genoBar);
  window.addEventListener('resize', renderAll);

  // The panel ships open, so the room starts in custom mode with the handles
  // sitting exactly on the Hardy–Weinberg cuts — identical to the closed mode
  // until you drag one.
  state.custom = DOM.customPanel.open;
  { const f = genoFreqs(state.p); state.cutA = f.AA; state.cutB = f.AA + f.Aa; }
  DOM.sliderP.disabled = state.custom;
  DOM.pHint.hidden = !state.custom;
  DOM.reading.innerHTML = startReading();
  setStatus(() => T('hw.ready', 'Ready.'));
  newG0();
  renderAll();
})();
