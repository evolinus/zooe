// Shared engine behind both "The Drift Room" and "The Selection Room".
//
// Both rooms are the same Wright-Fisher machinery — population grid, spinning
// wheel, frequency/binomial/variance charts, history scrubber, "run 10
// simulations" — differing only in how the sampling probability for the next
// generation is computed. Drift Room samples directly from the current
// frequency; Selection Room first reweights it by a fitness advantage before
// sampling. That single function (`cfg.samplingFreq`) is the one thing each
// room supplies; everything else lives here once.
//
// To add a new room built on this same engine: call createWrightFisherRoom
// with a new `suffix` (matching a `_<suffix>` id convention in the HTML) and
// a `samplingFreq(freq, state)` function. Set `selection: true` if the room
// should show the deterministic reference trajectory, the pre-adjustment
// wheel marker, and the "N·f′" binomial label — see selection-room.js.
function createWrightFisherRoom(cfg) {
  const suffix = cfg.suffix;
  const id = (name) => document.getElementById(`${name}_${suffix}`);

  const DOM = {
    sliderN: id('sliderN'),
    sliderF: id('sliderF'),
    sliderG: id('sliderG'),
    sliderS: id('sliderS'), // only present in rooms with selection: true
    sliderH: id('sliderH'), // only present when selection room also supports diploid dominance
    ploidySeg: id('ploidySeg'),
    dominanceField: id('dominanceField'),
    nVal: id('nVal'),
    fVal: id('fVal'),
    gVal: id('gVal'),
    sVal: id('sVal'),
    hVal: id('hVal'),
    btnRun: id('btnRun'),
    btnRun10: id('btnRun10'),
    btnPause: id('btnPause'),
    btnReset: id('btnReset'),
    genDisp: id('genDisplay'),
    spinDisp: id('spinDisplay'),
    freqDisp: id('freqDisplay'),
    deltaFDisp: id('deltaFDisplay'),
    statusBar: id('statusBar'),
    fixBanner: id('fixBanner'),
    wheelCvs: id('wheelCanvas'),
    popCvs: id('popCanvas'),
    chartCvs: id('chartCanvas'),
    binomCvs: id('binomCanvas'),
    varCvs: id('varCanvas'),
    timeScrubber: id('timeScrubber'),
    scrubVal: id('scrubVal'),
    expectedK: id('expectedK'),
    realizedK: id('realizedK'),
    kFormula: id('kFormula'),
    varFormula: id('varFormula'),
    legendAB: id('legendAB'),
    popTitle: id('popTitle'),
    singleRunStage: id('singleRunStage'),
    binomCard: id('binomCard'),
    varCard: id('varCard'),
    readingRow: id('readingRow'),
    scrubberRow: id('scrubberRow'),
    chartWrap: id('chartWrap'),
    multiRunSummary: id('multiRunSummary')
  };

  const CTX = {
    w: DOM.wheelCvs.getContext('2d'),
    p: DOM.popCvs.getContext('2d'),
    c: DOM.chartCvs.getContext('2d'),
    b: DOM.binomCvs.getContext('2d'),
    v: DOM.varCvs.getContext('2d')
  };

  const COLORS = {
    paper: '#EDE6D6',
    paperDim: '#E2D9C4',
    ink: '#262220',
    inkSoft: '#6b6258',
    rule: '#cabfa8',
    alleleA: '#3D6E6E',
    alleleB: '#A8442A',
    stamp: '#C08A2E', // canvas contexts can't resolve var(--stamp), so mirror it literally here
    expectedK: '#1F3A52', // darker blue for the binomial panel's expected-k bar
    deterministic: '#262220' // dashed reference line for the noise-free selection trajectory
  };

  // Ten visually distinct colors for the "Run 10 Simulations" overlay chart.
  const MULTI_RUN_COLORS = [
    '#3D6E6E', '#A8442A', '#7A5C99', '#C08A2E', '#3C6E3F',
    '#8B3E62', '#3A5A8C', '#B5651D', '#4F7CAC', '#9B4F4F'
  ];

  let state = {
    N: 50, f: 0.5, G: 100, s: cfg.selection ? (cfg.defaultS ?? 0.1) : 0,
    ploidy: 1, h: 0.5, // h (dominance) only meaningful for diploid + selection
    running: false, stopFlag: false,
    pauseRequested: false, paused: false,
    resumeResolve: null,
    wheelAngle: 0, wheelAnim: null,
    freqHistory: [], population: [],
    historyCache: [],
    detHistory: [],
    multiRunMode: false, multiRuns: [], multiRunning: false
  };

  // Ploidy is a property of the population, not of any one room: N always
  // means "number of individuals"; geneCount is how many allele copies that
  // represents (N haploid, 2N diploid) — the actual pool sampled each
  // generation.
  function geneCount() { return state.N * state.ploidy; }

  // Counts total A alleles and total allele copies in a population array.
  // Haploid: array of 'A'/'B', one entry per individual. Diploid: array of
  // 'AA'/'AB'/'BB' genotypes, one entry per individual (two allele copies each).
  function countAlleles(pop) {
    if (state.ploidy === 1) {
      const a = pop.filter(x => x === 'A').length;
      return { a, total: pop.length };
    }
    let a = 0;
    for (const g of pop) { if (g === 'AA') a += 2; else if (g === 'AB') a += 1; }
    return { a, total: pop.length * 2 };
  }

  // Pairs a flat array of independently-drawn alleles into N genotypes
  // (random mating / Hardy-Weinberg pairing). No-op under haploidy. Assumes
  // the genes are already in random order (true for independent Bernoulli
  // draws; makeInitialPopulation shuffles first since its genes start
  // grouped by allele).
  function pairIntoPopulation(genes) {
    if (state.ploidy === 1) return genes;
    const pop = [];
    for (let i = 0; i < state.N; i++) {
      const a1 = genes[i * 2], a2 = genes[i * 2 + 1];
      pop.push(a1 === a2 ? a1 + a1 : 'AB');
    }
    return pop;
  }

  // The deterministic starting population at the chosen initial frequency —
  // genes are assigned to hit f as closely as rounding allows, then shuffled
  // and (if diploid) paired, rather than drawn with fresh sampling noise.
  function makeInitialPopulation(f) {
    const genes = geneCount();
    const countA = Math.round(f * genes);
    const drawn = [];
    for (let i = 0; i < genes; i++) drawn.push(i < countA ? 'A' : 'B');
    shuffle(drawn);
    const pop = pairIntoPopulation(drawn);
    const counted = countAlleles(pop);
    return { pop, freq: counted.a / counted.total };
  }

  // The sampling probability actually used to draw each individual for the
  // next generation. For Drift Room this is just the current frequency; for
  // Selection Room it's been reweighted by fitness first. Reused as the
  // no-noise recursion for the deterministic reference trajectory too.
  function samplingFreq(freq) {
    return cfg.samplingFreq(freq, state);
  }

  const _rBuf = new Uint32Array(1);
  function cryptoRand() {
    crypto.getRandomValues(_rBuf);
    return _rBuf[0] / 0x100000000;
  }

  function cryptoRandBatch(count) {
    const buf = new Uint32Array(count);
    crypto.getRandomValues(buf);
    const out = new Float64Array(count);
    for (let i = 0; i < count; i++) out[i] = buf[i] / 0x100000000;
    return out;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(cryptoRand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  function logFactorial(n) {
    let sum = 0;
    for (let i = 1; i <= n; i++) sum += Math.log(i);
    return sum;
  }

  function binomPmf(k, n, p) {
    if (p <= 0) return k === 0 ? 1 : 0;
    if (p >= 1) return k === n ? 1 : 0;
    if (k < 0 || k > n) return 0;
    const logCoeff = logFactorial(n) - logFactorial(k) - logFactorial(n - k);
    return Math.exp(logCoeff + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }

  function applyGCap() {
    const maxG = Math.floor(4.5 * geneCount());
    DOM.sliderG.max = maxG;
    if (state.G > maxG) {
      state.G = maxG; DOM.sliderG.value = state.G; DOM.gVal.textContent = state.G;
    }
  }

  // Computes the noise-free trajectory selection alone would produce, with no
  // sampling drift — the reference dashed line. For Drift Room (identity
  // samplingFreq) this is just flat at f0, so it's only drawn when
  // cfg.selection is true.
  function computeDeterministicHistory(f0, G) {
    const hist = [f0];
    let f = f0;
    for (let g = 1; g <= G; g++) {
      f = samplingFreq(f);
      hist.push(f);
    }
    return hist;
  }

  DOM.sliderN.addEventListener('input', () => {
    state.N = +DOM.sliderN.value; DOM.nVal.textContent = state.N;
    applyGCap(); if (!state.running && !state.multiRunMode) init();
  });

  DOM.sliderF.addEventListener('input', () => {
    state.f = +DOM.sliderF.value; DOM.fVal.textContent = state.f.toFixed(2);
    if (!state.running && !state.multiRunMode) init();
  });

  DOM.sliderG.addEventListener('input', () => {
    state.G = +DOM.sliderG.value; DOM.gVal.textContent = state.G;
    if (!state.running && !state.multiRunMode) {
      state.detHistory = computeDeterministicHistory(state.f, state.G);
      drawChart(state.freqHistory, state.G);
      drawVariance(state.freqHistory, state.G);
    }
  });

  if (DOM.sliderS) {
    DOM.sliderS.addEventListener('input', () => {
      state.s = +DOM.sliderS.value; DOM.sVal.textContent = state.s.toFixed(2);
      if (!state.running && !state.multiRunMode) init();
    });
  }

  if (DOM.sliderH) {
    DOM.sliderH.addEventListener('input', () => {
      state.h = +DOM.sliderH.value; DOM.hVal.textContent = state.h.toFixed(2);
      if (!state.running && !state.multiRunMode) init();
    });
  }

  // Reflects the current ploidy in every label that depends on it: the
  // binomial panel's "N·f" formula, the variance panel's "/N" denominator,
  // the population legend's heterozygote swatch, and (Selection Room only)
  // whether the dominance slider is relevant at all.
  function updatePloidyLabels() {
    const nTerm = state.ploidy === 2 ? '2N' : 'N';
    const fTerm = cfg.selection ? 'f′' : 'f';
    if (DOM.kFormula) DOM.kFormula.textContent = `${nTerm}·${fTerm}`;
    if (DOM.varFormula) DOM.varFormula.textContent = nTerm;
    if (DOM.legendAB) DOM.legendAB.style.display = state.ploidy === 2 ? '' : 'none';
    if (DOM.dominanceField) DOM.dominanceField.style.display = state.ploidy === 2 ? '' : 'none';
    if (DOM.popTitle && state.ploidy === 1) DOM.popTitle.textContent = 'Current Population';
  }

  if (DOM.ploidySeg) {
    DOM.ploidySeg.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.running || state.multiRunning) return;
        state.ploidy = +btn.dataset.ploidy;
        DOM.ploidySeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
        updatePloidyLabels();
        applyGCap();
        if (!state.multiRunMode) init();
      });
    });
  }

  DOM.btnPause.addEventListener('click', () => {
    if (!state.running) return;
    if (!state.pauseRequested && !state.paused) {
      state.pauseRequested = true;
      DOM.btnPause.textContent = '⏸ Pause requested…';
    } else if (state.paused) {
      state.paused = false; state.pauseRequested = false;
      DOM.btnPause.textContent = '⏸ Pause after gen';
      if (state.resumeResolve) { state.resumeResolve(); state.resumeResolve = null; }
    } else {
      state.pauseRequested = false; DOM.btnPause.textContent = '⏸ Pause after gen';
    }
  });

  function waitForResume() {
    return new Promise(res => { state.resumeResolve = res; });
  }

  function init() {
    setMultiRunMode(false);
    updatePloidyLabels();
    if (state.ploidy === 2 && DOM.popTitle) DOM.popTitle.textContent = 'Current Population — individuals in HW equilibrium';

    const initial = makeInitialPopulation(state.f);
    state.population = initial.pop;

    state.freqHistory = [initial.freq];
    state.detHistory = computeDeterministicHistory(state.f, state.G);
    state.wheelAngle = 0;

    state.historyCache = [{
      population: [...state.population],
      freq: initial.freq
    }];

    DOM.timeScrubber.min = 0;
    DOM.timeScrubber.max = 0;
    DOM.timeScrubber.value = 0;
    DOM.scrubVal.textContent = 0;
    DOM.timeScrubber.disabled = true;

    drawWheel(samplingFreq(state.f), 0, cfg.selection ? state.f : null);
    drawPopSettled(state.population);
    drawChart(state.freqHistory, state.G);
    drawBinom(samplingFreq(state.f), geneCount());
    drawVariance(state.freqHistory, state.G);

    DOM.genDisp.textContent = '0';
    DOM.spinDisp.textContent = '—';
    DOM.freqDisp.textContent = state.f.toFixed(3);

    if (initial.freq === 0 || initial.freq === 1) {
      DOM.fixBanner.textContent = `Already fixed at N=${state.N}, f=${state.f.toFixed(2)}. Adjust parameters to see drift.`;
      DOM.statusBar.textContent = 'Population already fixed — adjust parameters.';
    } else {
      DOM.statusBar.textContent = 'Ready. Press Run Simulation.';
      DOM.fixBanner.textContent = '';
    }
  }

  // markerFreq (optional): the pre-adjustment frequency, shown as a thin tick
  // around the rim so you can see how far selection moved the wheel from
  // where plain drift would have left it.
  function drawWheel(freq, angle, markerFreq = null) {
    scaleCanvas(DOM.wheelCvs, CTX.w, 150, 150);
    const cx = 75, cy = 75, r = 70;
    const ctx = CTX.w;
    ctx.clearRect(0, 0, 150, 150);

    const angleA = freq * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx, cy, r, angle, angle + angleA); ctx.closePath();
    ctx.fillStyle = COLORS.alleleA; ctx.fill();

    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx, cy, r, angle + angleA, angle + Math.PI*2); ctx.closePath();
    ctx.fillStyle = COLORS.alleleB; ctx.fill();

    // Shows how far selection moved the A/B split from where plain drift
    // would have left it (markerFreq), without adding a third wedge that
    // could be mistaken for a third possible outcome — this is a thin band
    // along the rim, outside the real two-outcome pie, plus a numeric
    // readout of the exact shift.
    if (markerFreq !== null) {
      const preAngle = angle + markerFreq * Math.PI * 2;
      const postAngle = angle + angleA;
      const a1 = Math.min(preAngle, postAngle), a2 = Math.max(preAngle, postAngle);
      if (a2 - a1 > 0.001) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, a1, a2, false);
        ctx.arc(cx, cy, r - 10, a2, a1, true);
        ctx.closePath();
        ctx.fillStyle = COLORS.stamp;
        ctx.globalAlpha = 0.75;
        ctx.fill();
        ctx.restore();
      }
      if (DOM.deltaFDisp) {
        const delta = freq - markerFreq;
        DOM.deltaFDisp.textContent = (delta >= 0 ? '+' : '') + delta.toFixed(3);
      }
    } else if (DOM.deltaFDisp) {
      DOM.deltaFDisp.textContent = '—';
    }

    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 3; ctx.stroke();

    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI*2);
    ctx.fillStyle = COLORS.paper; ctx.fill();
    ctx.lineWidth = 2; ctx.stroke();
  }

  function getSpinTiming(spinIdx, genIdx) {
    const TARGET_TOTAL = 50, SLOW_TOTAL = 1000;
    const RAMP_START = 4, RAMP_LEN = 5;
    if (genIdx >= 3) return { dur: Math.round(TARGET_TOTAL * 0.82), gap: Math.round(TARGET_TOTAL * 0.18) };
    if (spinIdx < RAMP_START) return { dur: Math.round(SLOW_TOTAL * 0.82), gap: Math.round(SLOW_TOTAL * 0.18) };
    const t = Math.min((spinIdx - RAMP_START) / RAMP_LEN, 1);
    const total = SLOW_TOTAL + (TARGET_TOTAL - SLOW_TOTAL) * t * t;
    return { dur: Math.round(total * 0.82), gap: Math.round(total * 0.18) };
  }

  function spinWheel(freq, dur, markerFreq = null) {
    return new Promise(resolve => {
      const X_deg = cryptoRand() * 360;
      const X_rad = X_deg * Math.PI / 180;
      const outcome = X_deg < freq * 360 ? 'A' : 'B';

      const fullSpins = 3 + Math.floor(cryptoRand() * 3);
      const totalRot  = -Math.PI/2 - X_rad + fullSpins * Math.PI * 2;
      const start     = performance.now();
      state.wheelAngle = 0;

      function frame(ts) {
        const raw = Math.min((ts - start) / dur, 1);
        const t   = 1 - Math.pow(1 - raw, 3);
        state.wheelAngle = totalRot * t;
        drawWheel(freq, state.wheelAngle, markerFreq);

        if (raw < 1) {
          state.wheelAnim = requestAnimationFrame(frame);
        } else {
          state.wheelAngle = ((totalRot % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
          state.wheelAnim  = null;
          resolve(outcome);
        }
      }
      if (state.wheelAnim) cancelAnimationFrame(state.wheelAnim);
      state.wheelAnim = requestAnimationFrame(frame);
    });
  }

  function popGeom(count) {
    const W = DOM.popCvs.parentElement.offsetWidth || 700;
    const cols = Math.ceil(Math.sqrt(count * W / 200));
    const rows = Math.ceil(count / cols);
    return { W, cols, cellW: W / cols, cellH: 200 / rows, r: Math.min(W/cols, 200/rows) * 0.28 };
  }

  function drawAlleleMarker(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
  }

  // Diploid genotype marker: AA is a solid teal circle, BB a solid red
  // circle, and the heterozygote AB is a circle split teal/red so it reads
  // as "carries both" at a glance.
  function drawGenotypeMarker(ctx, genotype, cx, cy, r) {
    if (genotype === 'AA') {
      drawAlleleMarker(ctx, cx, cy, r);
      ctx.fillStyle = COLORS.alleleA; ctx.fill();
    } else if (genotype === 'BB') {
      drawAlleleMarker(ctx, cx, cy, r);
      ctx.fillStyle = COLORS.alleleB; ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, -Math.PI/2, Math.PI/2); ctx.closePath();
      ctx.fillStyle = COLORS.alleleB; ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, Math.PI/2, Math.PI*1.5); ctx.closePath();
      ctx.fillStyle = COLORS.alleleA; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 0.75; ctx.stroke();
    }
  }

  function drawPopSettled(pop) {
    const { W, cols, cellW, cellH, r } = popGeom(pop.length);
    scaleCanvas(DOM.popCvs, CTX.p, W, 200);
    const ctx = CTX.p;
    ctx.clearRect(0,0,W,200);
    pop.forEach((type, i) => {
      const cx = cellW * ((i%cols) + 0.5), cy = cellH * (Math.floor(i/cols) + 0.5);
      if (state.ploidy === 2) {
        drawGenotypeMarker(ctx, type, cx, cy, r);
      } else {
        drawAlleleMarker(ctx, cx, cy, r);
        ctx.fillStyle = type === 'A' ? COLORS.alleleA : COLORS.alleleB;
        ctx.fill();
      }
    });
  }

  // Used only during the animated first-3-generations intro, which always
  // shows raw allele draws one at a time (geneCount of them) — even under
  // diploidy, individual gene draws are simple A/B until drawPopSettled
  // pairs them into genotypes once the generation is complete.
  function drawPopInProgress(newPop, highlightIdx) {
    const total = geneCount();
    const { W, cols, cellW, cellH, r } = popGeom(total);
    scaleCanvas(DOM.popCvs, CTX.p, W, 200);
    const ctx = CTX.p;
    ctx.clearRect(0,0,W,200);
    for (let i = 0; i < total; i++) {
      const cx = cellW * ((i%cols) + 0.5), cy = cellH * (Math.floor(i/cols) + 0.5);
      if (i === highlightIdx) {
        ctx.beginPath(); ctx.arc(cx, cy, r*1.2, 0, Math.PI*2);
        ctx.fillStyle = COLORS.paperDim; ctx.fill();
        ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 2; ctx.stroke();
      } else if (i < newPop.length) {
        const type = newPop[i];
        drawAlleleMarker(ctx, cx, cy, r);
        ctx.fillStyle = type === 'A' ? COLORS.alleleA : COLORS.alleleB;
        ctx.fill();
      }
    }
  }


  function genAxisStep(maxG) {
    if (maxG <= 20) return 5;
    if (maxG <= 60) return 10;
    if (maxG <= 150) return 20;
    if (maxG <= 400) return 50;
    if (maxG <= 900) return 100;
    return 200;
  }

  function drawGenXAxis(ctx, W, H, padL, padR, padB, maxG) {
    const graphW = W - padL - padR;
    const axisY = H - padB;
    const step = genAxisStep(maxG);

    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, axisY); ctx.lineTo(W - padR, axisY); ctx.stroke();

    ctx.fillStyle = COLORS.inkSoft;
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';

    // If maxG isn't a multiple of the tick step, an extra label gets drawn at
    // the true end (below). When that end label would land too close to the
    // last regular tick, drop the regular tick's label so the two don't
    // collide into unreadable overlapping text.
    const hasExtraLabel = maxG % step !== 0;
    const lastRegular = Math.floor(maxG / step) * step;
    const MIN_LABEL_GAP_PX = 26;
    const collides = hasExtraLabel && (graphW - (lastRegular / maxG) * graphW) < MIN_LABEL_GAP_PX;

    for (let g = 0; g <= maxG; g += step) {
      const x = padL + (g / maxG) * graphW;
      ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 5); ctx.stroke();
      if (g === lastRegular && collides) continue;
      ctx.fillText(String(g), x, axisY + 16);
    }
    if (hasExtraLabel) {
      const x = padL + graphW;
      ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 5); ctx.stroke();
      ctx.fillText(String(maxG), x, axisY + 16);
    }

    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('Generation', padL + graphW / 2, axisY + 30);
    ctx.textAlign = 'left';
  }

  function drawYAxisTitle(ctx, text, x, padT, graphH) {
    ctx.save();
    ctx.translate(x, padT + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.inkSoft;
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawChart(freqHistory, maxG, currentG = freqHistory.length - 1) {
    const W = DOM.chartCvs.parentElement.offsetWidth || 700;
    const H = 180;
    scaleCanvas(DOM.chartCvs, CTX.c, W, H);
    const ctx = CTX.c;
    ctx.clearRect(0, 0, W, H);

    const padL = 46, padR = 20, padT = 15, padB = 40;
    const graphW = W - padL - padR;
    const graphH = H - padT - padB;

    const visibleLen = Math.min(currentG + 1, freqHistory.length);

    // Stacked bars: for each generation, the fraction of the population carrying
    // allele A (teal, bottom) vs allele B (red, top), split at that generation's f.
    // Drawn first so gridlines, axes, and the frequency line stay crisp on top.
    if (visibleLen > 0) {
      const barW = Math.max(1, graphW / maxG);
      ctx.save();
      ctx.globalAlpha = 0.45;
      for (let i = 0; i < visibleLen; i++) {
        const x = padL + (i / maxG) * graphW;
        const splitY = padT + graphH * (1 - freqHistory[i]);
        ctx.fillStyle = COLORS.alleleA;
        ctx.fillRect(x, splitY, barW, (padT + graphH) - splitY);
        ctx.fillStyle = COLORS.alleleB;
        ctx.fillRect(x, padT, barW, splitY - padT);
      }
      ctx.restore();
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    [0, 0.25, 0.5, 0.75, 1.0].forEach(v => {
      const y = padT + graphH * (1 - v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(2), padL - 6, y + 4);
    });
    ctx.setLineDash([]);
    ctx.textAlign = 'left';

    drawGenXAxis(ctx, W, H, padL, padR, padB, maxG);
    drawYAxisTitle(ctx, 'Frequency f(A)', 12, padT, graphH);

    // Deterministic (noise-free) reference trajectory — shows what selection
    // alone would do with no sampling drift, so the gap between this line and
    // the actual jagged one is visually "how much of this is luck."
    if (cfg.selection && state.detHistory.length > 1) {
      ctx.beginPath();
      for (let i = 0; i <= maxG; i++) {
        const f = i < state.detHistory.length ? state.detHistory[i] : state.detHistory[state.detHistory.length - 1];
        const x = padL + (i / maxG) * graphW;
        const y = padT + graphH * (1 - f);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.save();
      ctx.strokeStyle = COLORS.deterministic;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([5, 4]);
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.restore();
    }

    if (visibleLen > 0) {
      ctx.beginPath();
      for (let i = 0; i < visibleLen; i++) {
        const x = padL + (i / maxG) * graphW;
        const y = padT + graphH * (1 - freqHistory[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (currentG !== undefined && currentG < visibleLen) {
      const x = padL + (currentG / maxG) * graphW;
      ctx.save();
      ctx.strokeStyle = COLORS.stamp;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
      ctx.restore();

      const y = padT + graphH * (1 - freqHistory[currentG]);
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.stamp; ctx.fill();
    }
  }

  // Draws several independent frequency trajectories overlaid on one chart —
  // used by "Run 10 Simulations". Each line stops where its own history
  // actually ends (fixation or the run's last generation), it isn't extended
  // flat to maxG.
  function drawMultiChart(runs, maxG) {
    const W = DOM.chartCvs.parentElement.offsetWidth || 700;
    const H = 360;
    scaleCanvas(DOM.chartCvs, CTX.c, W, H);
    const ctx = CTX.c;
    ctx.clearRect(0, 0, W, H);

    const padL = 46, padR = 20, padT = 15, padB = 40;
    const graphW = W - padL - padR;
    const graphH = H - padT - padB;

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    [0, 0.25, 0.5, 0.75, 1.0].forEach(v => {
      const y = padT + graphH * (1 - v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(2), padL - 6, y + 4);
    });
    ctx.setLineDash([]);
    ctx.textAlign = 'left';

    drawGenXAxis(ctx, W, H, padL, padR, padB, maxG);
    drawYAxisTitle(ctx, 'Frequency f(A)', 12, padT, graphH);

    if (cfg.selection && state.detHistory.length > 1) {
      ctx.beginPath();
      for (let i = 0; i <= maxG; i++) {
        const f = i < state.detHistory.length ? state.detHistory[i] : state.detHistory[state.detHistory.length - 1];
        const x = padL + (i / maxG) * graphW;
        const y = padT + graphH * (1 - f);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.save();
      ctx.strokeStyle = COLORS.deterministic;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.restore();
    }

    runs.forEach((history, i) => {
      if (!history.length) return;
      ctx.beginPath();
      for (let g = 0; g < history.length; g++) {
        const x = padL + (g / maxG) * graphW;
        const y = padT + graphH * (1 - history[g]);
        if (g === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = MULTI_RUN_COLORS[i % MULTI_RUN_COLORS.length];
      ctx.lineWidth = 1.75;
      ctx.stroke();
    });
  }

  // Shows/hides the panels that only make sense for a single, generation-by-
  // generation run (wheel, population grid, binomial panels, scrubber),
  // leaving just the frequency chart when comparing 10 runs at once.
  function setMultiRunMode(active) {
    state.multiRunMode = active;
    const display = active ? 'none' : '';
    DOM.singleRunStage.style.display = display;
    DOM.binomCard.style.display = display;
    DOM.varCard.style.display = display;
    DOM.readingRow.style.display = display;
    DOM.scrubberRow.style.display = display;
    DOM.chartWrap.classList.toggle('multi-run', active);
    DOM.btnRun10.classList.toggle('secondary', !active);
    DOM.btnRun.classList.toggle('secondary', active);
    if (!active) DOM.multiRunSummary.textContent = '';
  }

  function drawBinom(p, n, kOutcome = null) {
    const W = DOM.binomCvs.parentElement.offsetWidth || 340;
    const H = 160;
    scaleCanvas(DOM.binomCvs, CTX.b, W, H);
    const ctx = CTX.b;
    ctx.clearRect(0, 0, W, H);

    const expectedKVal = Math.round(n * p);
    DOM.expectedK.textContent = expectedKVal;
    DOM.realizedK.textContent = kOutcome !== null ? Math.round(kOutcome) : '—';

    const padL = 46, padR = 15, padT = 15, padB = 34;
    const graphW = W - padL - padR;
    const graphH = H - padT - padB;
    const axisY = H - padB;

    let maxP = 0.05;
    for (let k = 0; k <= n; k++) {
      const pmf = binomPmf(k, n, p);
      if (pmf > maxP) maxP = pmf;
    }

    // y-axis: gridlines + probability labels + title
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    [0, 0.5, 1.0].forEach(v => {
      const y = padT + graphH * (1 - v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText((v * maxP).toFixed(3), padL - 6, y + 3);
    });
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
    drawYAxisTitle(ctx, 'Probability', 12, padT, graphH);

    // x-axis: solid baseline + tick marks + k labels + title
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, axisY); ctx.lineTo(W - padR, axisY); ctx.stroke();

    const kStep = genAxisStep(n);
    ctx.fillStyle = COLORS.inkSoft;
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let k = 0; k <= n; k += kStep) {
      const x = padL + (k / n) * graphW;
      ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 5); ctx.stroke();
      ctx.fillText(String(k), x, axisY + 16);
    }
    if (n % kStep !== 0) {
      const x = padL + graphW;
      ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 5); ctx.stroke();
      ctx.fillText(String(n), x, axisY + 16);
    }
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('k (count of allele A next gen)', padL + graphW / 2, H - 2);
    ctx.textAlign = 'left';

    // bars
    const barW = Math.max(1, graphW / (n + 1));
    for (let k = 0; k <= n; k++) {
      const pmf = binomPmf(k, n, p);
      const x = padL + (k / n) * graphW;
      const h = (pmf / maxP) * graphH;
      const y = axisY - h;

      let barColor = COLORS.alleleA;
      if (k === expectedKVal) barColor = COLORS.expectedK;
      if (kOutcome !== null && Math.round(kOutcome) === k) barColor = COLORS.stamp;
      ctx.fillStyle = barColor;
      ctx.fillRect(x - barW/2, y, Math.max(1, barW - 1), h);
    }
  }

  function drawVariance(freqHistory, maxG, currentG = freqHistory.length - 1) {
    const W = DOM.varCvs.parentElement.offsetWidth || 340;
    const H = 160;
    scaleCanvas(DOM.varCvs, CTX.v, W, H);
    const ctx = CTX.v;
    ctx.clearRect(0, 0, W, H);

    const padL = 52, padR = 15, padT = 15, padB = 40;
    const graphW = W - padL - padR;
    const graphH = H - padT - padB;
    const maxV = 0.25 / geneCount();

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    [0, 0.5, 1.0].forEach(v => {
      const val = v * maxV;
      const y = padT + graphH * (1 - v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(4), padL - 6, y + 3);
    });
    ctx.setLineDash([]);
    ctx.textAlign = 'left';

    drawGenXAxis(ctx, W, H, padL, padR, padB, maxG);
    drawYAxisTitle(ctx, 'Variance', 12, padT, graphH);

    const visibleLen = Math.min(currentG + 1, freqHistory.length);
    if (visibleLen > 0) {
      ctx.beginPath();
      for (let i = 0; i < visibleLen; i++) {
        const f = freqHistory[i];
        const v = (f * (1 - f)) / geneCount();
        const x = padL + (i / maxG) * graphW;
        const y = padT + graphH * (1 - (v / maxV));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = COLORS.alleleB;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (currentG !== undefined && currentG < visibleLen) {
      const x = padL + (currentG / maxG) * graphW;
      ctx.save();
      ctx.strokeStyle = COLORS.stamp;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
      ctx.restore();
    }
  }

  function scrubToRoom(genIndex) {
    DOM.scrubVal.textContent = genIndex;
    const cache = state.historyCache[genIndex];
    if (!cache) return;

    DOM.genDisp.textContent = genIndex;
    DOM.freqDisp.textContent = cache.freq.toFixed(3);
    DOM.spinDisp.textContent = '—';

    const pFreq = genIndex === 0 ? state.f : state.historyCache[genIndex - 1].freq;
    const pDraw = samplingFreq(pFreq);
    state.wheelAngle = 0;
    drawWheel(pDraw, 0, cfg.selection ? pFreq : null);
    drawPopSettled(cache.population);
    drawChart(state.freqHistory, state.G, genIndex);
    drawVariance(state.freqHistory, state.G, genIndex);
    drawBinom(pDraw, geneCount(), genIndex === 0 ? null : cache.freq * geneCount());
  }

  DOM.timeScrubber.addEventListener('input', (e) => {
    if (!state.running || state.paused) {
      scrubToRoom(parseInt(e.target.value));
    }
  });

  DOM.btnRun.addEventListener('click', async () => {
    if (state.running) return;

    if (state.multiRunMode) {
      setMultiRunMode(false);
      init();
    }

    const currentMax = state.historyCache.length - 1;
    if (parseInt(DOM.timeScrubber.value) < currentMax) {
      scrubToRoom(currentMax);
      DOM.timeScrubber.value = currentMax;
    }

    state.running = true; state.stopFlag = false; state.paused = false; state.pauseRequested = false;

    DOM.btnRun.disabled = true; DOM.btnRun10.disabled = true; DOM.btnReset.disabled = true;
    DOM.sliderN.disabled = true; DOM.sliderF.disabled = true; DOM.sliderG.disabled = true;
    if (DOM.sliderS) DOM.sliderS.disabled = true;
    if (DOM.sliderH) DOM.sliderH.disabled = true;
    if (DOM.ploidySeg) DOM.ploidySeg.querySelectorAll('button').forEach(b => b.disabled = true);
    DOM.timeScrubber.disabled = true;

    DOM.btnPause.style.display = 'inline-block';
    DOM.btnPause.textContent = '⏸ Pause after gen';

    let gStart = state.freqHistory.length - 1;
    if (gStart >= state.G) { init(); gStart = 0; }

    for (let gen = gStart + 1; gen <= state.G; gen++) {
      if (state.stopFlag) break;
      if (state.pauseRequested) {
        state.paused = true;
        state.pauseRequested = false;
        DOM.btnPause.textContent = '▶ Resume simulation';
        DOM.statusBar.textContent = `Simulation paused at generation ${gen - 1}. Scrub history or resume.`;
        if (state.historyCache.length > 1) DOM.timeScrubber.disabled = false;
        await waitForResume();
        const liveMax = state.historyCache.length - 1;
        if (parseInt(DOM.timeScrubber.value) < liveMax) {
          scrubToRoom(liveMax);
          DOM.timeScrubber.value = liveMax;
        }
        state.paused = false;
        DOM.btnPause.textContent = '⏸ Pause after gen';
        DOM.timeScrubber.disabled = true;
      }

      DOM.genDisp.textContent = gen;
      const currentF = state.freqHistory[gen - 1];
      const pDraw = samplingFreq(currentF);
      const genes = geneCount();
      let drawnGenes = []; // raw allele draws for this generation, length genes

      if (gen <= 3) {
        DOM.statusBar.textContent = `Generation ${gen}: sampling individuals one-by-one…`;
        if (state.ploidy === 2 && DOM.popTitle) DOM.popTitle.textContent = 'Current Population — sampled alleles';
        for (let i = 0; i < genes; i++) {
          if (state.stopFlag) break;
          DOM.spinDisp.textContent = `${i + 1} / ${genes}`;
          const outcome = await spinWheel(pDraw, getSpinTiming(i, gen).dur, cfg.selection ? currentF : null);
          drawnGenes.push(outcome);
          drawPopInProgress(drawnGenes, i + 1 < genes ? i + 1 : -1);
          await delay(getSpinTiming(i, gen).gap);
        }
      } else {
        DOM.statusBar.textContent = `Simulating generation ${gen}…`;
        DOM.spinDisp.textContent = 'instant';
        drawWheel(pDraw, state.wheelAngle, cfg.selection ? currentF : null);
        const rands = cryptoRandBatch(genes);
        for (let i = 0; i < genes; i++) drawnGenes.push(rands[i] < pDraw ? 'A' : 'B');
      }

      if (state.stopFlag) break;

      const nextPop = pairIntoPopulation(drawnGenes);
      const counted = countAlleles(nextPop);
      const nextFreq = counted.a / counted.total;
      state.population = nextPop;
      state.freqHistory.push(nextFreq);

      state.historyCache.push({
        population: [...nextPop],
        freq: nextFreq
      });

      DOM.timeScrubber.max = gen;
      DOM.timeScrubber.value = gen;
      DOM.scrubVal.textContent = gen;

      DOM.freqDisp.textContent = nextFreq.toFixed(3);
      if (state.ploidy === 2 && DOM.popTitle) DOM.popTitle.textContent = 'Current Population — individuals in HW equilibrium';
      drawPopSettled(nextPop);
      drawChart(state.freqHistory, state.G);
      drawVariance(state.freqHistory, state.G);
      drawBinom(pDraw, genes, counted.a);

      if (gen > 3) await delay(200); // ~5 generations/sec once past the animated intro
      else if (state.ploidy === 2) await delay(1000); // pause on the paired genotypes so the HW pairing is visible

      if (nextFreq === 0 || nextFreq === 1) {
        DOM.fixBanner.textContent = `Allele ${nextFreq === 1 ? 'A' : 'B'} reached FIXATION at generation ${gen}!`;
        DOM.statusBar.textContent = `Simulation complete. Fixation reached at generation ${gen}.`;
        break;
      }
    }

    state.running = false;
    DOM.btnRun.disabled = false; DOM.btnRun10.disabled = false; DOM.btnReset.disabled = false;
    DOM.sliderN.disabled = false; DOM.sliderF.disabled = false; DOM.sliderG.disabled = false;
    if (DOM.sliderS) DOM.sliderS.disabled = false;
    if (DOM.sliderH) DOM.sliderH.disabled = false;
    if (DOM.ploidySeg) DOM.ploidySeg.querySelectorAll('button').forEach(b => b.disabled = false);
    if (state.historyCache.length > 1) DOM.timeScrubber.disabled = false;
    DOM.btnPause.style.display = 'none';
    if (!DOM.statusBar.textContent.includes('complete') && !DOM.statusBar.textContent.includes('paused')) {
      DOM.statusBar.textContent = 'Simulation finished.';
    }
  });

  DOM.btnRun10.addEventListener('click', async () => {
    if (state.running || state.multiRunning) return;

    state.stopFlag = true; // in case a single run is paused mid-way
    if (state.resumeResolve) { state.resumeResolve(); state.resumeResolve = null; }

    state.multiRunning = true;
    setMultiRunMode(true);
    DOM.multiRunSummary.textContent = ''; // clear any previous run's summary until this one finishes
    DOM.btnRun.disabled = true; DOM.btnRun10.disabled = true; DOM.btnReset.disabled = true;
    DOM.sliderN.disabled = true; DOM.sliderF.disabled = true; DOM.sliderG.disabled = true;
    if (DOM.sliderS) DOM.sliderS.disabled = true;
    if (DOM.sliderH) DOM.sliderH.disabled = true;
    if (DOM.ploidySeg) DOM.ploidySeg.querySelectorAll('button').forEach(b => b.disabled = true);

    const N = state.N, f0 = state.f, G = state.G, genes = geneCount();
    state.detHistory = computeDeterministicHistory(f0, G);
    const runs = Array.from({ length: 10 }, () => [f0]);
    const isActive = Array(10).fill(true);
    const fixation = Array(10).fill(null); // { gen, allele } once a run fixes

    // Pace generations so a run that goes the full distance takes ~5s total,
    // regardless of G — fast for large G, comfortably watchable for small G.
    const delayPerGen = Math.max(0, 5000 / G);

    for (let g = 1; g <= G; g++) {
      for (let i = 0; i < 10; i++) {
        if (!isActive[i]) continue;
        const freq = runs[i][runs[i].length - 1];
        const pDraw = samplingFreq(freq);
        const rands = cryptoRandBatch(genes);
        let countA = 0;
        for (let k = 0; k < genes; k++) if (rands[k] < pDraw) countA++;
        const nextFreq = countA / genes;
        runs[i].push(nextFreq);
        if (nextFreq === 0 || nextFreq === 1) {
          isActive[i] = false;
          fixation[i] = { gen: g, allele: nextFreq === 1 ? 'A' : 'B' };
        }
      }

      DOM.statusBar.textContent = `Running 10 simulations… generation ${g} / ${G}`;
      drawMultiChart(runs, G);

      if (isActive.every(a => !a)) break;
      if (delayPerGen > 0) await delay(delayPerGen);
    }

    state.multiRuns = runs;

    const fixedARuns = fixation.filter(f => f && f.allele === 'A');
    const fixedBRuns = fixation.filter(f => f && f.allele === 'B');
    const polymorphic = 10 - fixedARuns.length - fixedBRuns.length;
    const avg = (arr) => arr.length ? (arr.reduce((s, f) => s + f.gen, 0) / arr.length).toFixed(1) : '—';

    DOM.multiRunSummary.textContent =
      `Fixed A: ${fixedARuns.length} (avg gen ${avg(fixedARuns)}) · ` +
      `Fixed B: ${fixedBRuns.length} (avg gen ${avg(fixedBRuns)}) · ` +
      `Polymorphic: ${polymorphic}`;
    DOM.statusBar.textContent = `Ran 10 independent simulations (N=${N}, f=${f0}, G=${G}).`;

    state.multiRunning = false;
    DOM.btnRun.disabled = false; DOM.btnRun10.disabled = false; DOM.btnReset.disabled = false;
    DOM.sliderN.disabled = false; DOM.sliderF.disabled = false; DOM.sliderG.disabled = false;
    if (DOM.sliderS) DOM.sliderS.disabled = false;
    if (DOM.sliderH) DOM.sliderH.disabled = false;
    if (DOM.ploidySeg) DOM.ploidySeg.querySelectorAll('button').forEach(b => b.disabled = false);
  });

  DOM.btnReset.addEventListener('click', () => {
    state.stopFlag = true;
    if (state.resumeResolve) { state.resumeResolve(); state.resumeResolve = null; }
    init();
  });

  window.addEventListener('resize', () => {
    if (state.multiRunMode) {
      drawMultiChart(state.multiRuns, state.G);
    } else if (!state.running || state.paused) {
      const curGen = parseInt(DOM.timeScrubber.value) || 0;
      if (state.historyCache && state.historyCache[curGen]) scrubToRoom(curGen);
    }
  });

  init();
}
