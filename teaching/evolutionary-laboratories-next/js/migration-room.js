// The Migration Room: two Wright-Fisher populations that sample independently
// and then trade individuals.
//
// WHY THIS IS NOT BUILT ON wright-fisher-core.js. The obvious move is two calls
// to createWrightFisherRoom with a suffix each, and it does not work: that
// factory keeps one `state` in a closure and returns nothing, so two instances
// share no clock and there is nowhere to interleave the exchange between their
// generations — and the exchange has to happen between them, every generation,
// in a fixed order. Bending the engine to carry coupled populations would mean
// touching the two most-used rooms in the set for the benefit of a third. It is
// also unnecessary, because this room drops the wheel, the binomial panel and
// the variance panel: all three have done their teaching by the time the reader
// arrives, and running them twice over would point attention at how each
// population samples when what matters here is the gap between them.
//
// THE MODEL, ONE GENERATION AT A TIME
//
//   1. Selection, if it is switched on. A1 is reweighted by (1+s) in A and by
//      (1-s) in B — opposite habitats, same magnitude. Off by default.
//   2. Drift. Each population independently draws N individuals from its OWN
//      gene pool. Two separate binomial draws, never one draw on a shared pool:
//      a shared pool would make these one population of 2N drawn in halves, and
//      nothing would ever diverge.
//   3. Migration. M individuals are picked at random from each population and
//      swapped, so both stay at exactly N and E[dp_A] = m(p_B - p_A).
//
// The frequencies the charts plot are the post-migration ones — the state each
// population is actually in when the next generation starts.
//
// Mutation is optional and off by default, exactly as in the Drift Room. With
// it off the two alleles present are the only ones there will ever be, so the
// pair eventually fixes for one allele between them however much they exchange,
// and the differentiation this room measures is what builds up before that.
// Turn mu up and the variation stops running out, so a run can be carried as
// long as you like and F_ST settles instead of being a transient.
//
// What it does NOT do is move the numbers onto the textbook curve, and the
// reason is worth knowing: with only two alleles, symmetric mutation pulls BOTH
// populations towards p = 0.5, so it is itself a homogenising force and it
// pushes F_ST down rather than up. The textbook result assumes infinite
// alleles, where mutation makes variants that are new rather than remaking the
// two already there, and so adds diversity within a population without making
// two populations any more alike. See drawSweep.
(function () {
  const id = (name) => document.getElementById(`${name}_mig`);

  const DOM = {
    sliderN: id('sliderN'), sliderFA: id('sliderFA'), sliderFB: id('sliderFB'),
    sliderG: id('sliderG'), sliderM: id('sliderM'), sliderS: id('sliderS'),
    nVal: id('nVal'), faVal: id('faVal'), fbVal: id('fbVal'),
    gVal: id('gVal'), mVal: id('mVal'), sVal: id('sVal'),
    nmVal: id('nmVal'), rateVal: id('rateVal'),
    selSeg: id('selSeg'), sField: id('sField'),
    sliderMu: id('sliderMu'), muVal: id('muVal'),
    btnRun: id('btnRun'), btnRun20: id('btnRun20'), btnPause: id('btnPause'),
    btnReset: id('btnReset'), btnSweep: id('btnSweep'),
    statusBar: id('statusBar'), sweepStatus: id('sweepStatus'),
    genDisp: id('genDisplay'), paDisp: id('paDisplay'), pbDisp: id('pbDisplay'),
    gapDisp: id('gapDisplay'), migDisp: id('migDisplay'),
    demeCvs: id('demeCanvas'), freqCvs: id('freqCanvas'), fstCvs: id('fstCanvas'),
    repCvs: id('repCanvas'), sweepCvs: id('sweepCanvas'),
    fstMean: id('fstMean'), repSummary: id('repSummary'), sweepSummary: id('sweepSummary'),
    verdict: id('verdict'),
    timeScrubber: id('timeScrubber'), scrubVal: id('scrubVal')
  };

  const CTX = {
    d: DOM.demeCvs.getContext('2d'),
    f: DOM.freqCvs.getContext('2d'),
    s: DOM.fstCvs.getContext('2d'),
    r: DOM.repCvs.getContext('2d'),
    w: DOM.sweepCvs.getContext('2d')
  };

  // Mirrored from the shared engine rather than imported: canvas contexts cannot
  // resolve var(--ink) and the two rooms have to agree on what an A1 looks like.
  const COLORS = {
    paper: '#EDE6D6', paperDim: '#E2D9C4',
    ink: '#262220', inkSoft: '#5A5249', rule: '#cabfa8',
    alleleA: '#2E5C8A', alleleB: '#A8442A',
    stamp: '#C08A2E',
    // The two POPULATIONS need colours of their own on the charts, and they
    // cannot be the allele colours — a line saying "how much A1 is in
    // population A" drawn in A1's blue would be two different claims in one
    // mark. Teal is the room's own accent, gold the stamp; solid against
    // dashed repeats the distinction for anyone who cannot separate the hues.
    demeA: '#2F7A8C', demeB: '#C08A2E'
  };

  // The stops on the migrant slider. Everything the room has to show happens
  // between 0 and 1, so that stretch gets nine of the fourteen positions and
  // the rest hurry through the range where more migrants change nothing.
  const MIGRANT_STEPS = [0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 10];
  // What the sweep samples. Zero cannot sit on a log axis and is drawn in a
  // slot of its own at the left; the other nine span two decades.
  const SWEEP_STEPS = [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 2, 4, 10];
  // Twenty for the replicate panel, which is a number the reader is meant to
  // hold in their head against a histogram of twenty bars; a hundred for the
  // sweep, which is not read run by run and whose gold series is a proportion —
  // at twenty runs a point carries a standard error of about 0.11, enough wobble
  // to put a kink in the curve that is not in the model. The runs are cheap
  // enough (a whole sweep is a fraction of a second) that there is no reason to
  // economise here.
  const REPLICATES = 20;
  const SWEEP_REPLICATES = 100;
  // Every sweep run starts from an even split in both populations — see
  // silentRun for why it cannot use the deck's starting frequencies.
  const SWEEP_START = 0.5;
  // What counts as strongly differentiated. Half the variation accounted for by
  // the split is a conventional "these are two things" line, and it is the
  // quantity the rule of thumb is really about — see drawSweep.
  const STRONG = 0.5;

  let state = {
    N: 50, fA: 0.90, fB: 0.10, G: 200, mIdx: 7, sel: 'off', s: 0.10, mu: 0,
    running: false, stopFlag: false,
    pauseRequested: false, paused: false, resumeResolve: null,
    busy: false, // a replicate set or a sweep is occupying the room
    popA: [], popB: [],
    histA: [], histB: [], histFst: [], histMig: [],
    historyCache: [],
    replicates: null, sweep: null,
    endedGlobalFix: false,
    // Set the moment the reader moves the generations slider, after which the
    // default stops following N. Their number, not ours.
    gTouched: false
  };

  const migrants = () => MIGRANT_STEPS[state.mIdx];

  /* crypto.getRandomValues is the right source, but the sweep asks for a few
     million draws and a call each would take longer than the run. Drawn in
     blocks and handed out one at a time instead. */
  const _pool = new Uint32Array(8192);
  let _poolAt = _pool.length;
  function rand() {
    if (_poolAt >= _pool.length) { crypto.getRandomValues(_pool); _poolAt = 0; }
    return _pool[_poolAt++] / 0x100000000;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  function yieldToPage() { return new Promise(r => setTimeout(r, 0)); }

  /* A population is a Uint8Array, 1 for A1 and 0 for A2, rather than the array
     of 'A'/'B' strings the shared engine uses. The sweep plays two hundred runs
     of up to a thousand generations before it can draw a single point, which is
     a few million individuals; typed arrays and no per-generation allocation
     churn are what keep that inside a few seconds instead of half a minute. */
  const A1 = 1, A2 = 0;

  function freqOf(pop) {
    let a = 0;
    for (let i = 0; i < pop.length; i++) a += pop[i];
    return a / pop.length;
  }

  // The deterministic starting population at the chosen frequency — assigned to
  // hit p as closely as rounding allows and then shuffled, rather than drawn
  // with a generation of sampling noise the reader did not ask for.
  function makePopulation(p) {
    const countA = Math.round(p * state.N);
    const pop = new Uint8Array(state.N);
    for (let i = 0; i < state.N; i++) pop[i] = i < countA ? A1 : A2;
    shuffle(pop);
    return pop;
  }

  /* The sampling probability for the next generation. With selection off this
     is just the current frequency, exactly as in the Drift Room. With it on,
     A1 carries (1+s) in population A and (1-s) in population B — the same
     allele favoured in one habitat and disfavoured in the other, which is the
     only arrangement in which gene flow and local adaptation genuinely oppose
     each other. `sign` is +1 for A and -1 for B. */
  function samplingFreq(freq, sign) {
    let f = freq;
    if (state.sel !== 'off' && state.s !== 0) {
      const wA = 1 + sign * state.s;
      const weighted = f * wA;
      f = weighted / (weighted + (1 - f));
    }
    // Symmetric recurrent mutation, applied after selection in both populations
    // — the same composition and the same formula as the Drift Room's engine.
    if (state.mu > 0) f = f * (1 - state.mu) + (1 - f) * state.mu;
    return f;
  }

  // How many cross this generation. A fractional setting is not a rounded one:
  // floor(M) cross for certain and one more with the leftover probability, so
  // Nm = M holds in the long run and "0.3 migrants" is visibly a statement
  // about the long run rather than about any one generation.
  function migrantsThisGen() {
    const M = migrants();
    const whole = Math.floor(M);
    const extra = rand() < (M - whole) ? 1 : 0;
    return Math.min(state.N, whole + extra);
  }

  /* One generation: drift inside each population, then the exchange. Returns
     the indices that crossed, so the single run can animate them; the replicate
     and sweep paths ignore them. Both paths run THIS function, so there is no
     second copy of the model that could drift out of step with the one the
     reader is watching. */
  function stepGeneration(popA, popB) {
    const pA = samplingFreq(freqOf(popA), +1);
    const pB = samplingFreq(freqOf(popB), -1);
    const n = popA.length;
    const nextA = new Uint8Array(n), nextB = new Uint8Array(n);
    for (let i = 0; i < n; i++) nextA[i] = rand() < pA ? A1 : A2;
    for (let i = 0; i < n; i++) nextB[i] = rand() < pB ? A1 : A2;

    const k = migrantsThisGen();
    const idxA = pickIndices(n, k), idxB = pickIndices(n, k);
    // Read the travellers off before the swap overwrites them: the animation
    // needs to know what each migrant is carrying, and afterwards each of those
    // slots holds the individual arriving from the other side instead.
    const sentA = idxA.map(i => nextA[i]);
    const sentB = idxB.map(i => nextB[i]);
    for (let i = 0; i < k; i++) {
      nextA[idxA[i]] = sentB[i];
      nextB[idxB[i]] = sentA[i];
    }
    return { popA: nextA, popB: nextB, crossed: k, idxA, idxB, sentA, sentB };
  }

  /* k distinct positions out of n. Rejection sampling while k is a small part
     of n, which is the case that runs millions of times — M is at most 10 and N
     at least 10, so building an n-long scratch list every generation to draw one
     index out of it was most of the sweep's cost. Falls back to a partial
     Fisher-Yates once k is a large enough share of n for rejection to start
     retrying, which includes the degenerate k = n. */
  function pickIndices(n, k) {
    if (k <= 0) return [];
    if (k * 2 < n) {
      const out = [];
      while (out.length < k) {
        const j = Math.floor(rand() * n);
        if (out.indexOf(j) < 0) out.push(j); // k is at most 10, so a scan beats a Set
      }
      return out;
    }
    const pool = new Int32Array(n);
    for (let i = 0; i < n; i++) pool[i] = i;
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rand() * (n - i));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return Array.from(pool.subarray(0, k));
  }

  /* Differentiation. H_S is the variation inside the populations, H_T the
     variation in the two taken together; F_ST is the share of the total that
     the split accounts for. Null once there is no variation anywhere left to
     divide — which this room always reaches in the end, because nothing here
     replaces what drift removes. */
  function fst(pA, pB) {
    const pbar = (pA + pB) / 2;
    const hT = 2 * pbar * (1 - pbar);
    if (hT <= 0) return null;
    const hS = (2 * pA * (1 - pA) + 2 * pB * (1 - pB)) / 2;
    return 1 - hS / hT;
  }

  // Plays a whole run with nothing drawn, for the replicate sets and the sweep.
  // Returns the mean F_ST over the generations where it was defined — the run's
  // own answer to "how far apart did these two get, and stay" — and the highest
  // it ever reached.
  //
  // The starting pair is an argument rather than read off the deck because the
  // two panels that call this are asking different questions. The replicate set
  // asks what happens at YOUR settings, so it passes them. The sweep asks how
  // much differentiation drift BUILDS against a given amount of gene flow, and
  // that can only be measured from populations that start undifferentiated:
  // begin it at 0.90 and 0.10 and every run is already past the strong-
  // differentiation mark before the first generation, so the panel would report
  // 100% at every setting and mean nothing by it.
  function silentRun(G, fA, fB) {
    let a = makePopulation(fA), b = makePopulation(fB);
    let sum = 0, n = 0, peak = 0;
    for (let g = 1; g <= G; g++) {
      const next = stepGeneration(a, b);
      a = next.popA; b = next.popB;
      const v = fst(freqOf(a), freqOf(b));
      if (v === null) break; // no variation anywhere: the run has nothing more to say
      sum += v; n++;
      if (v > peak) peak = v;
    }
    return { mean: n ? sum / n : 0, peak, generations: n };
  }

  // ---- drawing -------------------------------------------------------------

  function wrapOf(cvs) { return cvs.parentElement; }
  function sizeOf(cvs) {
    const w = wrapOf(cvs);
    return { W: w.offsetWidth || 700, H: w.clientHeight || 220 };
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
    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, axisY); ctx.lineTo(W - padR, axisY); ctx.stroke();
    ctx.fillStyle = COLORS.inkSoft;
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let g = 0; g <= maxG; g += step) {
      const x = padL + (g / maxG) * graphW;
      ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 5); ctx.stroke();
      ctx.fillText(String(g), x, axisY + 16);
    }
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(T('mig.axisGen', 'Generation'), padL + graphW / 2, axisY + 30);
    ctx.textAlign = 'left';
  }

  function drawYAxisTitle(ctx, text, x, padT, graphH) {
    ctx.save();
    ctx.translate(x, padT + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.inkSoft;
    ctx.font = '10px ui-monospace, monospace';
    fillSci(ctx, text, 0, 0);
    ctx.restore();
  }

  function gridGeom(count, w, h) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count * w / h)));
    const rows = Math.ceil(count / cols);
    return { cols, rows, cellW: w / cols, cellH: h / rows, r: Math.min(w / cols, h / rows) * 0.28 };
  }

  /* Both populations on ONE canvas, with the channel between them. This is the
     whole reason the room does not use two cards: a mark has to be seen leaving
     one grid and arriving in the other, and nothing can cross between two
     canvases. `flight` (0 to 1) is how far along the channel the migrants are;
     null draws the settled state with nobody in transit. */
  function drawDemes(popA, popB, flight, movers) {
    const { W, H } = sizeOf(DOM.demeCvs);
    scaleCanvas(DOM.demeCvs, CTX.d, W, H);
    const ctx = CTX.d;
    ctx.clearRect(0, 0, W, H);

    const capH = 16;                                   // room for the captions
    const chanW = Math.max(64, Math.min(110, W * 0.14));
    const gw = (W - chanW) / 2, gh = H - capH;
    const geom = gridGeom(popA.length, gw, gh);
    const xOfSide = (side) => side === 'A' ? 0 : gw + chanW;

    const cellAt = (side, i) => ({
      x: xOfSide(side) + geom.cellW * ((i % geom.cols) + 0.5),
      y: geom.cellH * (Math.floor(i / geom.cols) + 0.5)
    });

    // The channel, drawn first so the marks cross over it.
    ctx.fillStyle = COLORS.paperDim;
    ctx.fillRect(gw, 0, chanW, gh);
    ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gw + 0.5, 0); ctx.lineTo(gw + 0.5, gh);
    ctx.moveTo(gw + chanW - 0.5, 0); ctx.lineTo(gw + chanW - 0.5, gh);
    ctx.stroke();

    const hidden = new Set();
    if (flight !== null && movers) {
      movers.idxA.forEach(i => hidden.add('A' + i));
      movers.idxB.forEach(i => hidden.add('B' + i));
    }

    const disc = (cx, cy, allele, r) => {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = allele === A1 ? COLORS.alleleA : COLORS.alleleB;
      ctx.fill();
    };

    [['A', popA], ['B', popB]].forEach(([side, pop]) => {
      for (let i = 0; i < pop.length; i++) {
        if (hidden.has(side + i)) continue;
        const c = cellAt(side, i);
        disc(c.x, c.y, pop[i], geom.r);
      }
    });

    // The migrants themselves, part-way across. They travel along a straight
    // line between the cell they left and the cell they are going to, which is
    // the cell their counterpart vacated — the swap made visible.
    if (flight !== null && movers) {
      for (let i = 0; i < movers.idxA.length; i++) {
        const from = cellAt('A', movers.idxA[i]), to = cellAt('B', movers.idxB[i]);
        const cx = from.x + (to.x - from.x) * flight;
        const cy = from.y + (to.y - from.y) * flight;
        disc(cx, cy, movers.fromA[i], geom.r * 1.15);
        ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1; ctx.stroke();
      }
      for (let i = 0; i < movers.idxB.length; i++) {
        const from = cellAt('B', movers.idxB[i]), to = cellAt('A', movers.idxA[i]);
        const cx = from.x + (to.x - from.x) * flight;
        const cy = from.y + (to.y - from.y) * flight;
        disc(cx, cy, movers.fromB[i], geom.r * 1.15);
        ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    ctx.fillStyle = COLORS.inkSoft;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(T('mig.popA', 'Population A'), gw / 2, H - 4);
    ctx.fillText(T('mig.popB', 'Population B'), gw + chanW + gw / 2, H - 4);
    // The channel needs to read as a channel even in the generations when
    // nobody crosses it, so the arrows are drawn at a size that carries.
    ctx.font = '20px ui-monospace, monospace';
    ctx.fillStyle = COLORS.rule;
    ctx.fillText('⇄', gw + chanW / 2, gh / 2 + 7);
    ctx.textAlign = 'left';

    DOM.demeCvs.setAttribute('aria-label', T('mig.aria.demes',
      'Two populations of {n}. Population A is at frequency {a} for allele A1, population B at {b}.',
      { n: popA.length, a: freqOf(popA).toFixed(3), b: freqOf(popB).toFixed(3) }));
  }

  /* One chart, both trajectories, and the band between them filled. What the
     room is about is the distance between the two lines, so the distance is
     given a shape of its own rather than being left for the eye to measure. */
  function drawFreqChart(upTo) {
    const { W, H } = sizeOf(DOM.freqCvs);
    scaleCanvas(DOM.freqCvs, CTX.f, W, H);
    const ctx = CTX.f;
    ctx.clearRect(0, 0, W, H);
    const padL = 46, padR = 20, padT = 15, padB = 40;
    const graphW = W - padL - padR, graphH = H - padT - padB;
    const maxG = state.G;
    const n = Math.min(upTo + 1, state.histA.length);
    const X = (i) => padL + (i / maxG) * graphW;
    const Y = (v) => padT + graphH * (1 - v);

    if (n > 1) {
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.lineTo(X(i), Y(state.histA[i]));
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), Y(state.histB[i]));
      ctx.closePath();
      ctx.fillStyle = COLORS.ink; ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    [0, 0.25, 0.5, 0.75, 1.0].forEach(v => {
      ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(W - padR, Y(v)); ctx.stroke();
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(2), padL - 6, Y(v) + 4);
    });
    ctx.setLineDash([]); ctx.textAlign = 'left';

    drawGenXAxis(ctx, W, H, padL, padR, padB, maxG);
    drawYAxisTitle(ctx, T('mig.axisFreq', 'Frequency of <var>A</var>₁'), 12, padT, graphH);

    const line = (hist, colour, dash) => {
      if (n < 1) return;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = X(i), y = Y(hist[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colour; ctx.lineWidth = 2;
      ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
    };
    line(state.histA, COLORS.demeA, []);
    line(state.histB, COLORS.demeB, [6, 4]);

    if (upTo < state.histA.length && n > 0) {
      ctx.save();
      ctx.strokeStyle = COLORS.stamp; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(X(upTo), padT); ctx.lineTo(X(upTo), H - padB); ctx.stroke();
      ctx.restore();
    }

    DOM.freqCvs.setAttribute('aria-label', state.histA.length
      ? T('mig.aria.freq',
          'Frequency of allele A1 in each population against generation. At generation {g}, population A is at {a} and population B at {b}.',
          { g: upTo, a: state.histA[Math.min(upTo, state.histA.length - 1)].toFixed(3),
            b: state.histB[Math.min(upTo, state.histB.length - 1)].toFixed(3) })
      : T('mig.aria.freqEmpty', 'Allele frequency in two populations against generation — no run yet'));
  }

  function definedFst() { return state.histFst.filter(v => v !== null); }

  function drawFstChart(upTo) {
    const { W, H } = sizeOf(DOM.fstCvs);
    scaleCanvas(DOM.fstCvs, CTX.s, W, H);
    const ctx = CTX.s;
    ctx.clearRect(0, 0, W, H);
    const padL = 42, padR = 16, padT = 14, padB = 40;
    const graphW = W - padL - padR, graphH = H - padT - padB;
    const maxG = state.G;
    const X = (i) => padL + (i / maxG) * graphW;
    const Y = (v) => padT + graphH * (1 - v);

    ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    [0, 0.5, 1.0].forEach(v => {
      ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(W - padR, Y(v)); ctx.stroke();
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(1), padL - 6, Y(v) + 4);
    });
    ctx.setLineDash([]); ctx.textAlign = 'left';

    drawGenXAxis(ctx, W, H, padL, padR, padB, maxG);
    drawYAxisTitle(ctx, T('mig.axisFst', '<var>F</var>ST'), 11, padT, graphH);

    // The trace stops where F_ST stops being defined rather than being carried
    // on flat: once no variation is left anywhere there is nothing to divide,
    // and a line drawn past that point would be an answer to no question.
    const n = Math.min(upTo + 1, state.histFst.length);
    let started = false;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = state.histFst[i];
      if (v === null) break;
      if (!started) { ctx.moveTo(X(i), Y(v)); started = true; } else ctx.lineTo(X(i), Y(v));
    }
    if (started) { ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 2; ctx.stroke(); }

    const vals = definedFst();
    if (vals.length) {
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      ctx.save();
      ctx.strokeStyle = COLORS.stamp; ctx.lineWidth = 1.25; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(padL, Y(mean)); ctx.lineTo(W - padR, Y(mean)); ctx.stroke();
      ctx.restore();
    }
    DOM.fstCvs.setAttribute('aria-label', vals.length
      ? T('mig.aria.fst', 'Differentiation against generation. Mean over the run so far, {m}.',
          { m: (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(3) })
      : T('mig.aria.fstEmpty', 'Differentiation against generation — no run yet'));
  }

  function drawPlaceholder(ctx, cvs, message) {
    const { W, H } = sizeOf(cvs);
    scaleCanvas(cvs, ctx, W, H);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.inkSoft;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(message, W / 2, H / 2);
    ctx.textAlign = 'left';
    cvs.setAttribute('aria-label', message);
  }

  /* Twenty replicates as a histogram of their run-mean differentiation. A
     histogram rather than twenty lines, because the claim being tested is about
     the spread of outcomes and not about any trajectory. */
  function drawReplicates() {
    if (!state.replicates) {
      drawPlaceholder(CTX.r, DOM.repCvs, T('mig.repEmpty', 'Press Run 20 Replicates.'));
      return;
    }
    const { W, H } = sizeOf(DOM.repCvs);
    scaleCanvas(DOM.repCvs, CTX.r, W, H);
    const ctx = CTX.r;
    ctx.clearRect(0, 0, W, H);
    const padL = 42, padR = 16, padT = 14, padB = 40;
    const graphW = W - padL - padR, graphH = H - padT - padB;

    const BINS = 10;
    const counts = new Array(BINS).fill(0);
    state.replicates.forEach(r => {
      counts[Math.min(BINS - 1, Math.floor(r.mean * BINS))]++;
    });
    const top = Math.max(...counts, 1);

    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + graphH);
    ctx.lineTo(W - padR, padT + graphH);
    ctx.stroke();

    const barW = graphW / BINS;
    for (let i = 0; i < BINS; i++) {
      if (!counts[i]) continue;
      const h = (counts[i] / top) * graphH;
      ctx.fillStyle = COLORS.demeA;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(padL + i * barW + 1, padT + graphH - h, barW - 2, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(counts[i]), padL + i * barW + barW / 2, padT + graphH - h - 4);
    }

    ctx.fillStyle = COLORS.inkSoft;
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    [0, 0.25, 0.5, 0.75, 1].forEach(v => {
      ctx.fillText(v.toFixed(2), padL + v * graphW, padT + graphH + 14);
    });
    ctx.font = '10px ui-monospace, monospace';
    fillSci(ctx, T('mig.axisRunMean', 'Run-mean <var>F</var>ST'), padL + graphW / 2, padT + graphH + 30);
    ctx.textAlign = 'left';
    drawYAxisTitle(ctx, T('mig.axisRuns', 'Runs'), 11, padT, graphH);
    DOM.repCvs.setAttribute('aria-label', DOM.repSummary.textContent ||
      T('mig.aria.repEmpty', 'Replicate outcomes — none run yet'));
  }

  /* The room's actual result, and it takes two series rather than one, because
     measuring this room over many runs showed that the two ways of asking the
     question do not have the same answer.

     Mean F_ST falls away smoothly and never falls off anything: over 2000 runs
     at N=50, G=200 it comes out 0.43, 0.31, 0.20, 0.15, 0.09, 0.05, 0.03 as Nm
     goes 0, 0.1, 0.3, 0.5, 1, 2, 4. A steady decline, and a reader told to look
     for a cliff in it would not find one.

     The share of runs that ever became STRONGLY differentiated — F_ST reaching
     0.5 at any point — does fall off a cliff, and it falls off it where the rule
     of thumb says: 67%, 64%, 58%, 49%, 28%, 5%, 0% across those same settings.
     That is the claim in its own terms. "One migrant a generation is
     enough" was never a statement about the average; it is a statement about
     preventing COMPLETE differentiation, and that is the quantity that answers
     it.

     Showing both is the point rather than a hedge: a rule of thumb about
     complete differentiation is not a rule about mean F_ST, and a reader who
     has watched the two curves behave differently will not confuse them again.

     No theoretical curve is drawn over either, and turning the mutation slider
     up does not change that. The formula everyone quotes, F_ST ~ 1/(1+4Nm), is
     the MANY-island result — with two populations the coefficient is about four
     times larger — and it is an equilibrium between migration and mutation
     under INFINITE alleles. This room has two. Measured over 1000 runs, mu
     moves the no-migration end down (mean F_ST 0.44, 0.32, 0.24 at mu = 0,
     0.002, 0.005) and leaves the cliff where it is — the share of runs reaching
     0.5 is 27%, 25%, 24% at Nm = 1 across those same settings. Mutation with
     two alleles pulls both populations towards 0.5, so it homogenises them; it
     does not carry the numbers up onto the curve. The cliff surviving it
     untouched is the result worth having here. */
  function drawSweep() {
    if (!state.sweep) {
      drawPlaceholder(CTX.w, DOM.sweepCvs, T('mig.sweepEmpty', 'Press Run the sweep.'));
      return;
    }
    const { W, H } = sizeOf(DOM.sweepCvs);
    scaleCanvas(DOM.sweepCvs, CTX.w, W, H);
    const ctx = CTX.w;
    ctx.clearRect(0, 0, W, H);
    const padL = 48, padR = 22, padT = 18, padB = 44;
    const graphW = W - padL - padR, graphH = H - padT - padB;
    // Zero has no place on a log axis, so it gets a slot of its own at the far
    // left with a visible gap after it — the reader should not read it as the
    // continuation of the decade beside it.
    const zeroW = 46;
    const logL = padL + zeroW, logW = graphW - zeroW;
    const LO = Math.log10(0.1), HI = Math.log10(10);
    const X = (m) => m === 0 ? padL + zeroW / 2
                             : logL + ((Math.log10(m) - LO) / (HI - LO)) * logW;
    const Y = (v) => padT + graphH * (1 - v);

    ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    [0, 0.25, 0.5, 0.75, 1].forEach(v => {
      ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(W - padR, Y(v)); ctx.stroke();
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(2), padL - 6, Y(v) + 4);
    });
    ctx.setLineDash([]); ctx.textAlign = 'left';

    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, padT + graphH); ctx.lineTo(W - padR, padT + graphH); ctx.stroke();

    // One migrant a generation, which is the whole point of the panel.
    ctx.save();
    ctx.strokeStyle = COLORS.stamp; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(X(1), padT); ctx.lineTo(X(1), padT + graphH); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = COLORS.stamp;
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    fillSci(ctx, T('mig.oneMigrant', '<var>Nm</var> = 1'), X(1), padT - 6);

    ctx.fillStyle = COLORS.inkSoft;
    ctx.font = '9px ui-monospace, monospace';
    [0, 0.1, 0.3, 1, 3, 10].forEach(m => {
      ctx.fillText(String(m), X(m), padT + graphH + 14);
    });
    ctx.font = '10px ui-monospace, monospace';
    fillSci(ctx, T('mig.axisNm', 'Migrants per generation, <var>Nm</var> (log scale)'),
            padL + graphW / 2, padT + graphH + 32);
    ctx.textAlign = 'left';
    drawYAxisTitle(ctx, T('mig.axisDiff', 'Differentiation'), 12, padT, graphH);

    const pts = state.sweep.filter(p => p.mean !== null);
    const positive = pts.filter(p => p.m > 0);

    const series = (key, colour, dash) => {
      if (positive.length > 1) {
        ctx.beginPath();
        positive.forEach((p, i) => i ? ctx.lineTo(X(p.m), Y(p[key])) : ctx.moveTo(X(p.m), Y(p[key])));
        ctx.strokeStyle = colour; ctx.lineWidth = 2;
        ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
      }
      pts.forEach(p => {
        ctx.beginPath(); ctx.arc(X(p.m), Y(p[key]), 4, 0, Math.PI * 2);
        ctx.fillStyle = colour; ctx.fill();
        ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1; ctx.stroke();
      });
    };
    series('strong', COLORS.demeB, [6, 4]);
    series('mean', COLORS.demeA, []);
    DOM.sweepCvs.setAttribute('aria-label', DOM.sweepSummary.textContent ||
      T('mig.aria.sweepEmpty', 'Differentiation against migration rate — not run yet'));
  }

  function redrawAll(upTo) {
    const at = upTo === undefined ? state.histA.length - 1 : upTo;
    const cache = state.historyCache[at] || state.historyCache[0];
    if (cache) drawDemes(cache.popA, cache.popB, null, null);
    drawFreqChart(at);
    drawFstChart(at);
    drawReplicates();
    drawSweep();
  }

  // ---- readouts ------------------------------------------------------------

  function showGeneration(g) {
    const pA = state.histA[g], pB = state.histB[g];
    DOM.genDisp.textContent = g;
    DOM.paDisp.textContent = pA === undefined ? '—' : pA.toFixed(3);
    DOM.pbDisp.textContent = pB === undefined ? '—' : pB.toFixed(3);
    DOM.gapDisp.textContent = (pA === undefined || pB === undefined)
      ? '—' : Math.abs(pA - pB).toFixed(3);
    DOM.migDisp.textContent = g === 0 ? '—' : String(state.histMig[g]);
    const vals = definedFst();
    DOM.fstMean.textContent = vals.length
      ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(3) : '—';
  }

  function updateDerived() {
    const M = migrants();
    DOM.mVal.textContent = String(M);
    DOM.nmVal.innerHTML = `<var>Nm</var> = ${M.toFixed(2)}`;
    DOM.rateVal.innerHTML = `<var>m</var> = ${(M / state.N).toFixed(4)}`;
  }

  // The generations slider opens at 4N — long enough for a run with no
  // migration to reach an edge, and for a run with migration to settle and
  // stay settled long enough to be worth averaging — and follows N until the
  // reader sets a number of their own.
  function applyDefaultG() {
    if (state.gTouched) return;
    const g = Math.max(20, Math.min(1000, Math.round(state.N * 4 / 10) * 10));
    state.G = g;
    DOM.sliderG.value = g;
    DOM.gVal.textContent = g;
  }

  // ---- lifecycle -----------------------------------------------------------

  function init() {
    applyDefaultG();
    updateDerived();

    state.popA = makePopulation(state.fA);
    state.popB = makePopulation(state.fB);
    const pA = freqOf(state.popA), pB = freqOf(state.popB);
    state.histA = [pA]; state.histB = [pB];
    state.histFst = [fst(pA, pB)];
    state.histMig = [0];
    state.historyCache = [{ popA: state.popA.slice(), popB: state.popB.slice() }];
    state.endedGlobalFix = false;

    DOM.timeScrubber.min = 0; DOM.timeScrubber.max = 0;
    DOM.timeScrubber.value = 0; DOM.scrubVal.textContent = 0;
    DOM.timeScrubber.disabled = true;

    showGeneration(0);
    redrawAll(0);
    DOM.verdict.textContent = '';
    if (state.histFst[0] === null) {
      DOM.verdict.innerHTML = T('mig.noVariation',
        'Both populations already carry only one allele, so there is nothing for drift or migration to do. Move a starting frequency.');
      DOM.statusBar.textContent = T('mig.noVariationStatus', 'No variation to start from — adjust the starting frequencies.');
    } else {
      DOM.statusBar.textContent = T('mig.ready', 'Ready. Press Run Simulation.');
    }
  }

  function lockControls(on) {
    [DOM.sliderN, DOM.sliderFA, DOM.sliderFB, DOM.sliderG, DOM.sliderM, DOM.sliderS, DOM.sliderMu]
      .forEach(el => { if (el) el.disabled = on; });
    DOM.selSeg.querySelectorAll('button').forEach(b => b.disabled = on);
    DOM.btnRun.disabled = on; DOM.btnRun20.disabled = on;
    DOM.btnReset.disabled = on; DOM.btnSweep.disabled = on;
  }

  function showPauseControl(on) {
    DOM.btnPause.style.display = on ? '' : 'none';
    DOM.btnReset.style.display = on ? 'none' : '';
  }

  function waitForResume() {
    return new Promise(res => { state.resumeResolve = res; });
  }

  // The migrants crossing, animated. Slow for the first two generations so the
  // reader sees what the exchange actually is, then quick enough to keep the
  // run at a watchable pace — the same bargain the Drift Room strikes with its
  // one-at-a-time opening.
  function animateCrossing(before, after, movers, dur) {
    if (!movers.idxA.length) {
      drawDemes(after.popA, after.popB, null, null);
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const t0 = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        drawDemes(before.popA, before.popB, t, movers);
        if (t < 1 && !state.stopFlag) requestAnimationFrame(frame);
        else { drawDemes(after.popA, after.popB, null, null); resolve(); }
      };
      requestAnimationFrame(frame);
    });
  }

  DOM.btnRun.addEventListener('click', async () => {
    if (state.running || state.busy) return;

    const resumeAt = state.histA.length - 1;
    if (resumeAt >= state.G) init();

    state.running = true; state.stopFlag = false;
    state.paused = false; state.pauseRequested = false;
    lockControls(true);
    DOM.timeScrubber.disabled = true;
    showPauseControl(true);
    DOM.btnPause.textContent = T('mig.pauseAfter', '⏸ Pause after gen');
    DOM.verdict.textContent = '';

    for (let gen = state.histA.length; gen <= state.G; gen++) {
      if (state.stopFlag) break;
      if (state.pauseRequested) {
        state.paused = true; state.pauseRequested = false;
        DOM.btnPause.textContent = T('mig.resume', '▶ Resume simulation');
        DOM.statusBar.textContent = T('mig.paused',
          'Paused at generation {g}. Scrub history or resume.', { g: gen - 1 });
        if (state.historyCache.length > 1) DOM.timeScrubber.disabled = false;
        await waitForResume();
        const liveMax = state.historyCache.length - 1;
        DOM.timeScrubber.value = liveMax;
        showGeneration(liveMax);
        redrawAll(liveMax);
        state.paused = false;
        DOM.btnPause.textContent = T('mig.pauseAfter', '⏸ Pause after gen');
        DOM.timeScrubber.disabled = true;
      }

      const next = stepGeneration(state.popA, state.popB);
      const movers = { idxA: next.idxA, idxB: next.idxB, fromA: next.sentA, fromB: next.sentB };
      // The state the animation starts from: after drift, before the exchange —
      // the travellers put back in the slots they are about to leave.
      const drifted = { popA: next.popA.slice(), popB: next.popB.slice() };
      for (let i = 0; i < next.idxA.length; i++) {
        drifted.popA[next.idxA[i]] = next.sentA[i];
        drifted.popB[next.idxB[i]] = next.sentB[i];
      }

      DOM.statusBar.textContent = T('mig.simulating', 'Simulating generation {g}…', { g: gen });
      await animateCrossing(drifted, next, movers, gen <= 2 ? 700 : 110);
      if (state.stopFlag) break;

      state.popA = next.popA; state.popB = next.popB;
      const pA = freqOf(state.popA), pB = freqOf(state.popB);
      state.histA.push(pA); state.histB.push(pB);
      state.histFst.push(fst(pA, pB));
      state.histMig.push(next.crossed);
      state.historyCache.push({ popA: state.popA.slice(), popB: state.popB.slice() });

      DOM.timeScrubber.max = gen; DOM.timeScrubber.value = gen;
      DOM.scrubVal.textContent = gen;
      showGeneration(gen);
      drawFreqChart(gen); drawFstChart(gen);

      if (state.histFst[gen] === null) {
        state.endedGlobalFix = true;
        DOM.statusBar.textContent = T('mig.doneFixed',
          'Run ended at generation {g}: no variation left anywhere.', { g: gen });
        break;
      }
      await delay(gen > 2 ? 90 : 400);
    }

    state.running = false;
    lockControls(false);
    showPauseControl(false);
    if (state.historyCache.length > 1) DOM.timeScrubber.disabled = false;
    if (!state.paused) {
      writeVerdict();
      if (!state.endedGlobalFix) DOM.statusBar.textContent = T('mig.finished', 'Simulation finished.');
    }
  });

  function writeVerdict() {
    const last = state.histA.length - 1;
    const pA = state.histA[last], pB = state.histB[last];
    const vals = definedFst();
    const mean = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    // The gap at the start against the gap at the end, rather than the largest
    // gap the run ever had. At the default starting frequencies the largest gap
    // is nearly always generation 0 or thereabouts, which tells the reader
    // something they set themselves; where the two ended up relative to where
    // they began is what gene flow actually did to them.
    const gap0 = Math.abs(state.histA[0] - state.histB[0]);
    const gap1 = Math.abs(pA - pB);
    if ((pA === 0 && pB === 1) || (pA === 1 && pB === 0)) {
      DOM.verdict.innerHTML = T('mig.verdictSplit',
        'Complete differentiation: the two populations are fixed for different alleles at generation {g}. <var>F</var>ST = 1.',
        { g: last });
    } else if (state.endedGlobalFix) {
      DOM.verdict.innerHTML = T('mig.verdictGlobal',
        'All variation gone by generation {g} — both populations fixed for the same allele. Mean <var>F</var>ST along the way, {m}.',
        { g: last, m: mean.toFixed(3) });
    } else {
      DOM.verdict.innerHTML = T('mig.verdictRun',
        'Ran {g} generations at <var>Nm</var> = {nm}. The two began {d0} apart and ended {d1} apart; mean <var>F</var>ST over the run, {m}.',
        { g: last, nm: migrants().toFixed(2), d0: gap0.toFixed(2), d1: gap1.toFixed(2), m: mean.toFixed(3) });
    }
  }

  DOM.btnPause.addEventListener('click', () => {
    if (!state.running) return;
    if (!state.pauseRequested && !state.paused) {
      state.pauseRequested = true;
      DOM.btnPause.textContent = T('mig.pauseReq', '⏸ Pause requested…');
    } else if (state.paused) {
      state.paused = false; state.pauseRequested = false;
      DOM.btnPause.textContent = T('mig.pauseAfter', '⏸ Pause after gen');
      if (state.resumeResolve) { state.resumeResolve(); state.resumeResolve = null; }
    } else {
      state.pauseRequested = false;
      DOM.btnPause.textContent = T('mig.pauseAfter', '⏸ Pause after gen');
    }
  });

  DOM.btnReset.addEventListener('click', () => {
    state.stopFlag = true;
    if (state.resumeResolve) { state.resumeResolve(); state.resumeResolve = null; }
    state.replicates = null; state.sweep = null;
    DOM.repSummary.textContent = ''; DOM.sweepSummary.textContent = '';
    init();
  });

  DOM.btnRun20.addEventListener('click', async () => {
    if (state.running || state.busy) return;
    state.busy = true; state.stopFlag = false;
    lockControls(true);
    DOM.repSummary.textContent = '';
    DOM.statusBar.textContent = T('mig.replicating', 'Running {r} replicates…', { r: REPLICATES });
    await yieldToPage();

    const runs = [];
    for (let i = 0; i < REPLICATES; i++) {
      if (state.stopFlag) break;
      runs.push(silentRun(state.G, state.fA, state.fB));
      if (i % 5 === 4) await yieldToPage();
    }
    state.replicates = runs;

    const mean = runs.reduce((s, r) => s + r.mean, 0) / (runs.length || 1);
    const strong = runs.filter(r => r.peak >= STRONG).length;
    DOM.repSummary.innerHTML = T('mig.repSummary',
      'mean <var>F</var>ST = {m} · {s} of {n} reached 0.5 at some point',
      { m: mean.toFixed(3), s: strong, n: runs.length });
    DOM.statusBar.innerHTML = T('mig.repDone',
      'Ran {n} replicates at <var>N</var> = {N}, <var>Nm</var> = {nm}, <var>G</var> = {g}.',
      { n: runs.length, N: state.N, nm: migrants().toFixed(2), g: state.G });
    drawReplicates();
    state.busy = false;
    lockControls(false);
  });

  DOM.btnSweep.addEventListener('click', async () => {
    if (state.running || state.busy) return;
    state.busy = true; state.stopFlag = false;
    lockControls(true);
    DOM.sweepSummary.textContent = '';
    const savedIdx = state.mIdx;
    const points = [];

    for (const m of SWEEP_STEPS) {
      if (state.stopFlag) break;
      // The sweep drives the same control the reader does, so a setting can
      // only be swept if it is a setting the room can actually be put in.
      state.mIdx = MIGRANT_STEPS.indexOf(m);
      DOM.sweepStatus.innerHTML = T('mig.sweepProgress',
        'Running {r} replicates at <var>Nm</var> = {m}…', { r: SWEEP_REPLICATES, m: m });
      await yieldToPage();
      let sum = 0, n = 0, strong = 0;
      for (let i = 0; i < SWEEP_REPLICATES; i++) {
        if (state.stopFlag) break;
        const r = silentRun(state.G, SWEEP_START, SWEEP_START);
        sum += r.mean; n++;
        if (r.peak >= STRONG) strong++;
      }
      points.push({ m, mean: n ? sum / n : null, strong: n ? strong / n : null });
      state.sweep = points.slice();
      drawSweep();
    }

    state.mIdx = savedIdx;
    updateDerived();
    const atOne = points.find(p => p.m === 1);
    const atZero = points.find(p => p.m === 0);
    DOM.sweepSummary.innerHTML = (atZero && atOne && atZero.strong !== null && atOne.strong !== null)
      ? T('mig.sweepSummary',
          'strongly differentiated: {z} of runs with no migrants, {o} with one',
          { z: Math.round(atZero.strong * 100) + '%', o: Math.round(atOne.strong * 100) + '%' })
      : '';
    DOM.sweepStatus.innerHTML = T('mig.sweepDone',
      '{r} replicates at each of {k} settings, each starting at <var>p</var> = 0.5 in both populations, at <var>N</var> = {N} and <var>G</var> = {g}.',
      { r: SWEEP_REPLICATES, k: SWEEP_STEPS.length, N: state.N, g: state.G });
    state.busy = false;
    lockControls(false);
  });

  // ---- controls ------------------------------------------------------------

  // A replicate set was run at one value of M; a sweep was run across all of
  // them at one N, G and starting pair. Changing a control has to discard
  // whichever of the two is no longer a result about the room on screen —
  // leaving a panel up that answers a question nobody is asking any more is
  // worse than leaving it empty.
  function invalidate(sweepToo) {
    state.replicates = null;
    DOM.repSummary.textContent = '';
    if (sweepToo) { state.sweep = null; DOM.sweepSummary.textContent = ''; }
  }

  const onSlider = (el, apply, sweepToo = true) => el.addEventListener('input', () => {
    apply();
    invalidate(sweepToo);
    if (!state.running && !state.busy) init();
  });

  onSlider(DOM.sliderN, () => {
    state.N = parseInt(DOM.sliderN.value);
    DOM.nVal.textContent = state.N;
    applyDefaultG();
    updateDerived(); // m = M/N moves with N even though M has not
  });
  onSlider(DOM.sliderFA, () => {
    state.fA = parseFloat(DOM.sliderFA.value);
    DOM.faVal.textContent = state.fA.toFixed(2);
  });
  onSlider(DOM.sliderFB, () => {
    state.fB = parseFloat(DOM.sliderFB.value);
    DOM.fbVal.textContent = state.fB.toFixed(2);
  });
  // The sweep already covers every value of M, so moving M alone does not
  // invalidate it — it moves the reader along a curve that is still true.
  onSlider(DOM.sliderM, () => {
    state.mIdx = parseInt(DOM.sliderM.value);
    updateDerived();
  }, false);
  onSlider(DOM.sliderS, () => {
    state.s = parseFloat(DOM.sliderS.value);
    DOM.sVal.textContent = state.s.toFixed(2);
  });
  onSlider(DOM.sliderMu, () => {
    state.mu = parseFloat(DOM.sliderMu.value);
    DOM.muVal.textContent = state.mu.toFixed(4);
  });
  DOM.sliderG.addEventListener('input', () => {
    state.gTouched = true;
    state.G = parseInt(DOM.sliderG.value);
    DOM.gVal.textContent = state.G;
    invalidate(true);
    if (!state.running && !state.busy) init();
  });

  DOM.selSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    DOM.selSeg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.sel = btn.dataset.sel;
    DOM.sField.style.display = state.sel === 'opposite' ? '' : 'none';
    invalidate(true);
    if (!state.running && !state.busy) init();
  });

  DOM.timeScrubber.addEventListener('input', (e) => {
    if (state.running && !state.paused) return;
    const g = parseInt(e.target.value);
    DOM.scrubVal.textContent = g;
    showGeneration(g);
    redrawAll(g);
  });

  // Leaving the room pauses a single run at the next generation rather than
  // letting it sample on in a hidden tab, and stops a sweep outright — a sweep
  // has no resume, and two hundred runs nobody is watching are two hundred runs
  // wasted.
  document.addEventListener('lab:tabchange', (e) => {
    if (e.detail.tabId === 'migration') return;
    if (state.busy) state.stopFlag = true;
    if (state.running && !state.paused && !state.pauseRequested) {
      state.pauseRequested = true;
      DOM.btnPause.textContent = T('mig.pauseReq', '⏸ Pause requested…');
    }
  });

  window.addEventListener('resize', () => {
    if (state.running && !state.paused) return;
    const g = parseInt(DOM.timeScrubber.value) || 0;
    redrawAll(Math.min(g, state.histA.length - 1));
  });

  init();
})();
