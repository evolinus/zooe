// The Linkage Room: what happens when you follow TWO loci instead of one.
//
// The Hardy–Weinberg Room's whole point is that a single locus reaches its
// equilibrium in ONE generation of random mating, so genotype frequency is a
// fixed function of allele frequency and nothing about the parents survives.
// The moment you look at two loci at once, that stops being true. An
// association between them — linkage disequilibrium, D — is broken only by
// recombination, and recombination between two nearby loci is rare. So D
// decays geometrically rather than vanishing:
//
//     D(t) = D₀ (1 − r)^t
//
// which is one generation when r = 0.5 (loci on different chromosomes) and
// hundreds when r is small. Part 1 shows exactly that.
//
// Part 2 shows why it matters. Two beneficial mutations arise in different
// individuals, so they sit on different chromosomes: one gamete is Ab, the
// other aB. The chromosome carrying both, AB, does not exist and can only be
// made by a recombination event between them. Until it is, the two mutations
// compete — every copy of A that spreads displaces a copy of B — and a finite
// population usually keeps only one. That is Hill–Robertson interference, and
// it is the population-genetic statement of the Reproduction Room's blunt
// observation that two asexual lineages "never mix".
(function () {
  const $ = (id) => document.getElementById(id + '_lk');

  const COLORS = {
    paper: '#EDE6D6', paperDim: '#E2D9C4', ink: '#262220', inkSoft: '#6b6258',
    rule: '#cabfa8',
    AB: '#C08A2E',   // the double mutant — the gamete that has to be built
    Ab: '#2E5C8A',
    aB: '#388047',
    ab: '#6b6258',
    stamp: '#C08A2E'
  };

  // Fills {placeholders} in an English template string.
  // Variables and allele symbols are italic by convention, the digit indexing
  // them is not. Applied at the HTML sinks only: the same L labels also go to
  // canvas, which carries no markup.
  const V = (html) => String(html).replace(/([A-Za-z])([\u2080\u2081\u2082])/g, '<var>$1</var>$2');


  // Display names for the two loci. The model indexes gametes 0..3 in the fixed
  // order AB, Ab, aB, ab; these are labels only.
  const L = { A: 'A₁', a: 'A₂', B: 'B₁', b: 'B₂',
              AB: 'A₁B₁', Ab: 'A₁B₂', aB: 'A₂B₁', ab: 'A₂B₂' };

  const GENS_SHOWN = 60;    // horizon of the Part 1 decay chart
  const HR_MAX_GEN = 4000;  // safety cap on a Part 2 run

  const state = {
    // Part 1 — deterministic, infinite population
    r: 0.01, d0frac: 1, p: 0.5, t: 0, timer: null,
    // Part 2 — finite population with selection
    N: 50, s: 0.2, f0: 0.05, reps: 200,
    run: null,        // one population's gamete-frequency history
    outcome: null,    // {atR: {...}, free: {...}} tallies over replicates
    busy: false
  };

  const DOM = {
    sliderR: $('sliderR'), rVal: $('rVal'), rHint: $('rHint'),
    sliderD0: $('sliderD0'), d0Val: $('d0Val'),
    sliderP: $('sliderP'), pVal: $('pVal'),
    btnStep: $('btnStep'), btnAuto: $('btnAuto'), btnReset: $('btnReset'),
    statusBar: $('statusBar'), genLabel: $('genLabel'),
    squareCanvas: $('squareCanvas'), squareNote: $('squareNote'),
    decayCanvas: $('decayCanvas'),
    xAB: $('xABVal'), xAb: $('xAbVal'), xaB: $('xaBVal'), xab: $('xabVal'),
    dVal: $('dVal'), dPrime: $('dPrimeVal'), rsq: $('rsqVal'),
    reading: $('reading'),
    sliderN: $('sliderN'), nVal: $('nVal'),
    sliderS: $('sliderS'), sVal: $('sVal'),
    sliderF0: $('sliderF0'), f0Val: $('f0Val'), f0Hint: $('f0Hint'),
    sliderRep: $('sliderRep'), repVal: $('repVal'),
    btnRunOne: $('btnRunOne'), btnRunMany: $('btnRunMany'), hrStatus: $('hrStatus'),
    trajCanvas: $('trajCanvas'), hrRunLabel: $('hrRunLabel'),
    outcomeCanvas: $('outcomeCanvas'),
    hrReading: $('hrReading')
  };

  const setStatus = (fn) => { DOM.statusBar.textContent = fn(); };

  function withCanvas(canvas, cb) {
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = Math.round(rect.width), H = Math.round(rect.height);
    if (W < 2 || H < 2) return;
    const ctx = canvas.getContext('2d');
    scaleCanvas(canvas, ctx, W, H);
    ctx.clearRect(0, 0, W, H);
    cb(ctx, W, H);
  }

  // ---- two-locus bookkeeping ------------------------------------------------
  // Gametes in the fixed order AB, Ab, aB, ab. D is the excess of AB·ab over
  // Ab·aB: zero exactly when the two loci are inherited independently.
  const dOf = (x) => x[0] * x[3] - x[1] * x[2];
  const pA = (x) => x[0] + x[1];
  const pB = (x) => x[0] + x[2];

  // The largest |D| the current allele frequencies physically allow. D is a
  // covariance between two 0/1 variables, so it is boxed in by their means —
  // which is why D on its own is a poor measure and D′ and r² exist.
  function dMax(x, sign) {
    const a = pA(x), b = pB(x);
    return sign >= 0 ? Math.min(a * (1 - b), (1 - a) * b) : Math.min(a * b, (1 - a) * (1 - b));
  }
  function dPrimeOf(x) {
    const D = dOf(x), m = dMax(x, D);
    return m > 1e-12 ? D / m : 0;
  }
  function rSqOf(x) {
    const a = pA(x), b = pB(x), denom = a * (1 - a) * b * (1 - b);
    return denom > 1e-12 ? (dOf(x) * dOf(x)) / denom : 0;
  }

  // Gamete frequencies implied by the two allele frequencies plus D.
  const gametesFrom = (a, b, D) => [a * b + D, a * (1 - b) - D, (1 - a) * b - D, (1 - a) * (1 - b) + D];

  // One generation of random mating: recombination moves exactly r·D between
  // the coupling and repulsion classes, which is the whole of the dynamics.
  function recombine(x, r) {
    const D = dOf(x);
    return [x[0] - r * D, x[1] + r * D, x[2] + r * D, x[3] - r * D];
  }

  // ---- Part 1 state ---------------------------------------------------------
  function gametesAt(t) {
    const p = state.p, q = 1 - p;
    const D0 = state.d0frac * dMax([p * p, p * q, q * p, q * q], state.d0frac);
    return gametesFrom(p, p, D0 * Math.pow(1 - state.r, t));
  }
  const currentGametes = () => gametesAt(state.t);

  // ---- Part 1 drawing -------------------------------------------------------
  // A unit square: a horizontal cut at f(A) splits it into the A gametes on top
  // and the a gametes below. Inside each band, a vertical cut separates those
  // carrying B from those carrying b. Under linkage EQUILIBRIUM both vertical
  // cuts land on f(B) and the line runs straight through; every bit of D shows
  // up as a step between them. The dashed line marks where equilibrium would be.
  function drawSquare(ctx, W, H) {
    const x = currentGametes();
    const a = pA(x), b = pB(x);
    const padL = 26, padR = 12, padT = 22, padB = 26;
    const S = Math.min(W - padL - padR, H - padT - padB);
    const x0 = padL, y0 = padT;
    const yCut = y0 + a * S;
    // Within each band, the share carrying B.
    const topB = a > 1e-9 ? x[0] / a : 0;
    const botB = (1 - a) > 1e-9 ? x[2] / (1 - a) : 0;

    // Fills first, then the rules, then the labels on top — otherwise the
    // dashed equilibrium line lands across the cell text.
    const cells = [
      [x0, y0, topB * S, a * S, COLORS.AB, L.AB, x[0]],
      [x0 + topB * S, y0, (1 - topB) * S, a * S, COLORS.Ab, L.Ab, x[1]],
      [x0, yCut, botB * S, (1 - a) * S, COLORS.aB, L.aB, x[2]],
      [x0 + botB * S, yCut, (1 - botB) * S, (1 - a) * S, COLORS.ab, L.ab, x[3]]
    ];
    cells.forEach(([px, py, pw, ph, color]) => {
      if (pw > 0 && ph > 0) { ctx.fillStyle = color; ctx.fillRect(px, py, pw, ph); }
    });

    ctx.strokeStyle = COLORS.paper; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, yCut); ctx.lineTo(x0 + S, yCut); ctx.stroke();
    ctx.strokeRect(x0, y0, S, S);

    // Where linkage equilibrium would put the vertical cut, in both bands.
    ctx.save();
    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x0 + b * S, y0 - 5); ctx.lineTo(x0 + b * S, y0 + S + 5); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(T('lk.cv.noAssoc', 'no association'), x0 + b * S, y0 - 7);

    cells.forEach(([px, py, pw, ph, , name, freq]) => {
      if (pw < 44 || ph < 22) return;   // labels are 4 glyphs wide now (A₁B₁), not 2
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 13px ui-monospace, monospace';
      fillSci(ctx, name, px + pw / 2, py + ph / 2 - 7);
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(freq.toFixed(3), px + pw / 2, py + ph / 2 + 8);
    });

    ctx.fillStyle = COLORS.inkSoft; ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    fillSci(ctx, L.A, x0 - 5, y0 + a * S / 2);
    fillSci(ctx, L.a, x0 - 5, yCut + (1 - a) * S / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    fillSci(ctx, T('lk.cv.carries', `carries ${L.B}  →|←  carries ${L.b}`), x0 + S / 2, y0 + S + 8);
  }

  // D as a fraction of where it started, so every recombination rate can be
  // compared on the same axis. Faint reference curves show what a gene on
  // another chromosome (r = 0.5) and a very close neighbour (r = 0.005) do.
  function drawDecay(ctx, W, H) {
    const padL = 46, padR = 14, padT = 22, padB = 40;
    const gw = W - padL - padR, gh = H - padT - padB;
    if (gw < 40 || gh < 40) return;
    const X = (t) => padL + (t / GENS_SHOWN) * gw;
    const Y = (v) => padT + (1 - v) * gh;

    ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [0, 0.25, 0.5, 0.75, 1].forEach(v => {
      ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(W - padR, Y(v)); ctx.stroke();
      ctx.fillText(v.toFixed(2), padL - 6, Y(v));
    });
    ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = 0; t <= GENS_SHOWN; t += 10) ctx.fillText(String(t), X(t), padT + gh + 6);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(T('lk.cv.xAxis', 'generations of random mating'), padL + gw / 2, H - 14);
    ctx.save();
    ctx.translate(12, padT + gh / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    fillSci(ctx, T('lk.cv.yAxis', '<var>D</var> as a fraction of <var>D</var>₀'), 0, 0);
    ctx.restore();

    const curve = (r, color, width, dash) => {
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath();
      for (let t = 0; t <= GENS_SHOWN; t++) {
        const v = Math.pow(1 - r, t), px = X(t), py = Y(v);
        t ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke(); ctx.restore();
    };
    // References first, so the live curve sits on top of them. Each label is
    // anchored at a different point along its own curve, which keeps the three
    // apart in both directions however steeply they fall.
    [[0.5, '<var>r</var> = 0.5', 3], [0.05, '<var>r</var> = 0.05', 22], [0.005, '<var>r</var> = 0.005', 50]].forEach(([r, label, at]) => {
      curve(r, COLORS.rule, 1.5, [3, 3]);
      ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      fillSci(ctx, label, X(at) + 4, Y(Math.pow(1 - r, at)) - 3);
    });
    curve(state.r, COLORS.stamp, 2.6);

    // Where the population is now.
    const v = Math.pow(1 - state.r, state.t);
    ctx.beginPath(); ctx.arc(X(Math.min(state.t, GENS_SHOWN)), Y(v), 5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.stamp; ctx.fill();
    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1.2; ctx.stroke();
  }

  // ---- Part 2: a haploid two-locus Wright–Fisher model ----------------------
  // Fitness is multiplicative: an AB gamete gets (1+s)², a single mutant (1+s).
  // Each generation: selection reweights the four classes, recombination moves
  // r·D between coupling and repulsion, then 2N gametes are drawn at random.
  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  // Exact while the counts that matter are small — which is precisely the
  // regime a new mutation lives in — and a normal approximation once they are
  // large enough for it to be indistinguishable.
  //
  // The exact branch walks from one success to the next by drawing a geometric
  // gap, so it costs O(successes) rather than O(n). That matters: a rare gamete
  // class is the common case here, and looping over all 2N trials for each of
  // hundreds of replicates would take minutes rather than a second.
  function rbinom(n, p) {
    if (n <= 0 || p <= 0) return 0;
    if (p >= 1) return n;
    const flip = p > 0.5;
    const q = flip ? 1 - p : p;
    if (n * q < 30) {
      const logq = Math.log(1 - q);
      let k = 0, i = -1;
      for (;;) {
        i += 1 + Math.floor(Math.log(Math.random()) / logq);
        if (i >= n) break;
        k++;
      }
      return flip ? n - k : k;
    }
    const mu = n * p, sd = Math.sqrt(n * p * (1 - p));
    return Math.max(0, Math.min(n, Math.round(mu + sd * gauss())));
  }
  function multinomial(n, probs) {
    const out = [0, 0, 0, 0];
    let rem = n, remP = 1;
    for (let i = 0; i < 3 && rem > 0; i++) {
      const pi = remP > 1e-12 ? Math.min(1, Math.max(0, probs[i] / remP)) : 0;
      out[i] = rbinom(rem, pi);
      rem -= out[i];
      remP -= probs[i];
    }
    out[3] = Math.max(0, rem);
    return out;
  }

  function hrStep(x, r, s) {
    const w = [(1 + s) * (1 + s), 1 + s, 1 + s, 1];
    const wbar = x[0] * w[0] + x[1] * w[1] + x[2] * w[2] + x[3] * w[3];
    const y = x.map((v, i) => v * w[i] / wbar);
    return recombine(y, r);
  }

  // One population, from the two established mutations to the point where both
  // loci are settled. Returns the gamete-frequency history and the outcome.
  //
  // Both mutations start at the same frequency, on opposite backgrounds, so no
  // chromosome carries both: x(AB) = 0 and D is negative from the outset. That
  // is the Hill–Robertson starting position — the fittest chromosome available
  // is the one that does not yet exist.
  function hrRun(N, s, r, f0, keepHistory) {
    const G = 2 * N;
    const k = Math.max(1, Math.min(Math.floor(G / 2) - 1, Math.round(f0 * G)));
    let counts = [0, k, k, G - 2 * k];   // k Ab, k aB, the rest ab
    let x = counts.map(c => c / G);
    const hist = keepHistory ? [x.slice()] : null;

    for (let t = 0; t < HR_MAX_GEN; t++) {
      const a = pA(x), b = pB(x);
      // Both loci absorbed (fixed or lost) — nothing left to happen.
      if ((a <= 0 || a >= 1) && (b <= 0 || b >= 1)) break;
      counts = multinomial(G, hrStep(x, r, s));
      x = counts.map(c => c / G);
      if (keepHistory) hist.push(x.slice());
    }
    return { hist, aFixed: pA(x) >= 1 - 1e-12, bFixed: pB(x) >= 1 - 1e-12, x };
  }

  function hrReplicates(N, s, r, f0, reps) {
    const tally = { both: 0, one: 0, neither: 0 };
    for (let i = 0; i < reps; i++) {
      const out = hrRun(N, s, r, f0, false);
      const k = (out.aFixed ? 1 : 0) + (out.bFixed ? 1 : 0);
      if (k === 2) tally.both++; else if (k === 1) tally.one++; else tally.neither++;
    }
    return tally;
  }

  // ---- Part 2 drawing -------------------------------------------------------
  function drawTrajectory(ctx, W, H) {
    const padL = 42, padR = 14, padT = 16, padB = 34;
    const gw = W - padL - padR, gh = H - padT - padB;
    if (gw < 40 || gh < 40) return;

    ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach(v => {
      const y = padT + (1 - v) * gh;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(v.toFixed(1), padL - 6, y);
    });
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(11, padT + gh / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(T('lk.cv.gamFreq', 'gamete frequency'), 0, 0);
    ctx.restore();

    if (!state.run || !state.run.hist) {
      ctx.fillStyle = COLORS.inkSoft; ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(T('lk.cv.pressOne', 'press ▶ Watch one population'), padL + gw / 2, padT + gh / 2);
      return;
    }

    // Named tMax, not T: T is the string helper for this whole file.
    const hist = state.run.hist, tMax = Math.max(1, hist.length - 1);
    const X = (t) => padL + (t / tMax) * gw;
    const Y = (v) => padT + (1 - v) * gh;

    ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const step = Math.max(1, Math.ceil(tMax / 6 / 10) * 10);
    for (let t = 0; t <= tMax; t += step) ctx.fillText(String(t), X(t), padT + gh + 6);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(T('lk.cv.gens', 'generations'), padL + gw / 2, H - 12);

    [[3, COLORS.ab], [2, COLORS.aB], [1, COLORS.Ab], [0, COLORS.AB]].forEach(([i, c]) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = i === 0 ? 2.6 : 1.6;
      ctx.beginPath();
      hist.forEach((x, t) => { const px = X(t), py = Y(x[i]); t ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
    });
  }

  function drawOutcome(ctx, W, H) {
    const padL = 44, padR = 14, padT = 26, padB = 48;
    const gw = W - padL - padR, gh = H - padT - padB;
    if (gw < 60 || gh < 40) return;

    ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach(v => {
      const y = padT + (1 - v) * gh;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(Math.round(v * 100) + '%', padL - 6, y);
    });
    ctx.setLineDash([]);

    if (!state.outcome) {
      ctx.fillStyle = COLORS.inkSoft; ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(T('lk.cv.pressMany', 'press ▶▶ Run all replicates'), padL + gw / 2, padT + gh / 2);
      return;
    }

    const reps = state.reps;
    const groups = [
      { title: `r = ${state.r.toFixed(3)}`, sub: T('lk.cv.yourSetting', 'your setting'), t: state.outcome.atR },
      { title: 'r = 0.5', sub: T('lk.cv.diffChrom', 'different chromosomes'), t: state.outcome.free }
    ];
    const bars = [['both', T('lk.cv.bothKept', 'both kept'), COLORS.AB],
                  ['one', T('lk.cv.oneKept', 'one kept'), COLORS.Ab],
                  ['neither', T('lk.cv.bothLost', 'both lost'), COLORS.ab]];
    const gap = 26;
    const groupW = (gw - gap) / 2;

    groups.forEach((g, gi) => {
      const gx = padL + (groupW + gap) * gi;
      const barW = groupW / 3;
      bars.forEach(([key, label, color], bi) => {
        const frac = g.t[key] / reps;
        const bx = gx + bi * barW + 5, bw = barW - 10;
        const h = frac * gh, y = padT + gh - h;
        ctx.fillStyle = color; ctx.fillRect(bx, y, bw, h);
        ctx.fillStyle = COLORS.ink; ctx.font = 'bold 9.5px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText((frac * 100).toFixed(0) + '%', bx + bw / 2, y - 2);
        ctx.fillStyle = COLORS.inkSoft; ctx.font = '8.5px ui-monospace, monospace';
        ctx.textBaseline = 'top';
        ctx.fillText(label, gx + (bi + 0.5) * barW, padT + gh + 5);
      });
      ctx.fillStyle = COLORS.ink; ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(g.title, gx + groupW / 2, padT + gh + 20);
      ctx.fillStyle = COLORS.inkSoft; ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(g.sub, gx + groupW / 2, padT + gh + 33);
    });
  }

  // ---- narrative ------------------------------------------------------------
  const rHintText = (r) => {
    if (r >= 0.45) return T('lk.rHint.free', 'as good as different chromosomes');
    if (r >= 0.2) return T('lk.rHint.far', 'far apart on the same chromosome');
    if (r >= 0.05) return T('lk.rHint.mid', 'the same chromosome, some distance apart');
    if (r >= 0.01) return T('lk.rHint.near', 'close neighbours');
    if (r > 0) return T('lk.rHint.veryNear', 'almost the same spot on the chromosome');
    return T('lk.rHint.zero', 'no recombination at all — permanently linked');
  };

  const halfLife = (r) => (r <= 0 ? Infinity : Math.log(0.5) / Math.log(1 - r));

  function part1Reading() {
    const x = currentGametes(), D = dOf(x);
    const hl = halfLife(state.r);
    const n = hl < 1 ? hl.toFixed(2) : String(Math.round(hl));
    const hlText = !isFinite(hl)
      ? T('lk.halfNever',
          'never — with r = 0 the association is permanent, and the two loci are inherited as one')
      : T('lk.halfLife',
          `about <strong>{n}</strong> generation${Math.round(hl) === 1 && hl >= 1 ? '' : 's'}`, { n });
    return T('lk.reading1',
      `Recombination does not change either allele frequency — f(${L.A}) and f(${L.B}) sit still at ` +
      `<strong>{pa}</strong> and <strong>{pb}</strong> the whole way through. What it changes ` +
      `is which allele travels with which. At r = <strong>{r}</strong>, the association loses half its ` +
      `strength every {half}. Right now, after <strong>{t}</strong> generation${state.t === 1 ? '' : 's'}, ` +
      `D = <strong>{d}</strong>. ` +
      `<em>Compare with the room next door:</em> a single locus is in Hardy–Weinberg after <strong>one</strong> round of ` +
      `random mating, exactly, forever. Two loci never quite arrive — they only ever get closer, at a speed set entirely ` +
      `by how far apart the loci sit.`,
      { pa: pA(x).toFixed(2), pb: pB(x).toFixed(2), r: state.r.toFixed(3), half: hlText,
        t: state.t, d: D.toFixed(4) });
  }

  // Returns markup (an italic <var>N</var>), so its sink uses innerHTML.
  const f0HintText = () => {
    const copies = Math.max(1, Math.round(state.f0 * 2 * state.N));
    return T('lk.f0Hint', `{copies} cop${copies === 1 ? 'y' : 'ies'} of each, in 2<var>N</var> = {g} chromosomes`,
      { copies, g: 2 * state.N });
  };

  const hrPrompt = () => T('lk.hrPrompt',
    `Both mutations are good, and each sits on a different chromosome, so no chromosome yet carries both. Set a ` +
    `recombination rate in Part 1, then press <strong>▶▶ Run all replicates</strong> to see how often a population ` +
    `manages to keep both — at your r, and at r = 0.5 for comparison.`);

  function hrOutcomeReading() {
    const o = state.outcome, reps = state.reps;
    const pct = (v) => (v / reps * 100);
    const bothR = pct(o.atR.both), bothFree = pct(o.free.both);
    const oneR = pct(o.atR.one), lostR = pct(o.atR.neither);
    const gap = bothFree - bothR;

    let verdict;
    if (gap > 8) {
      verdict = T('lk.hrVerdict.gap',
        `That gap is <strong>Hill–Robertson interference</strong>, measured. With recombination this rare the ${L.AB} ` +
        `chromosome is slow to appear, so the two mutations spend their time displacing each other instead of ` +
        `accumulating — and in <strong>{one}%</strong> of runs the population ended up keeping just one of ` +
        `two perfectly good improvements.`, { one: oneR.toFixed(0) });
    } else if (state.r >= 0.35) {
      verdict = T('lk.hrVerdict.high',
        `You have set r near its maximum, so the two loci are already almost independent and there is nothing ` +
        `much left to interfere. Pull r down toward 0 in Part 1 and run this again — that is where the gap opens.`);
    } else {
      verdict = T('lk.hrVerdict.close',
        `The two settings came out close this time. Interference needs three things to bite at once: low r, an ` +
        `advantage large enough to make the mutations sweep before recombination can act, and a population small enough ` +
        `for chance to matter. Try lowering r further, or raising s.`);
    }

    const lostNote = lostR > 5
      ? T('lk.hrLostNote',
          ` In <strong>{lost}%</strong> of runs the population lost both — even a genuinely useful mutation ` +
          `is often lost by chance, which is the Selection Room's lesson arriving here in duplicate.`,
          { lost: lostR.toFixed(0) })
      : '';

    return T('lk.hrOutcome',
      `Out of <strong>{reps}</strong> populations at r = <strong>{r}</strong>, ` +
      `<strong>{bothR}%</strong> kept both mutations. With the same two mutations on different chromosomes ` +
      `(r = 0.5) the figure is <strong>{bothFree}%</strong>. {verdict}{lostNote} ` +
      `An asexual lineage is the r = 0 case forever, across its whole genome: it can only ever keep whichever mutation ` +
      `happened to win, which is precisely what the Reproduction Room means when it says two clonal lines never mix.`,
      { reps, r: state.r.toFixed(3), bothR: bothR.toFixed(0), bothFree: bothFree.toFixed(0), verdict, lostNote });
  }

  // ---- rendering ------------------------------------------------------------
  function renderPart1() {
    const x = currentGametes();
    DOM.xAB.textContent = x[0].toFixed(3);
    DOM.xAb.textContent = x[1].toFixed(3);
    DOM.xaB.textContent = x[2].toFixed(3);
    DOM.xab.textContent = x[3].toFixed(3);
    DOM.dVal.textContent = dOf(x).toFixed(4);
    DOM.dPrime.textContent = dPrimeOf(x).toFixed(3);
    DOM.rsq.textContent = rSqOf(x).toFixed(3);
    DOM.genLabel.textContent = T('lk.gen', 'Generation {t}', { t: state.t });
    DOM.squareNote.innerHTML = V(T('lk.squareNote',
      `The vertical cut sits at f(${L.B}) = <strong>{pb}</strong> in each band. The <strong>step</strong> ` +
      `between the two cuts is the association — it closes as recombination does its work.`,
      { pb: pB(x).toFixed(2) }));
    DOM.reading.innerHTML = V(part1Reading());
    withCanvas(DOM.squareCanvas, drawSquare);
    withCanvas(DOM.decayCanvas, drawDecay);
  }

  function renderPart2() {
    DOM.hrRunLabel.innerHTML = state.run
      ? V(T('lk.hrRunLabel',
          `{gens} generations · ${L.A} ${state.run.aFixed ? 'fixed' : 'lost'} · ${L.B} ${state.run.bFixed ? 'fixed' : 'lost'}`,
          { gens: state.run.hist.length - 1, a: state.run.aFixed, b: state.run.bFixed }))
      : '—';
    withCanvas(DOM.trajCanvas, drawTrajectory);
    withCanvas(DOM.outcomeCanvas, drawOutcome);
    DOM.hrReading.innerHTML = V(state.outcome ? hrOutcomeReading() : hrPrompt());
  }

  const renderAll = () => { renderPart1(); renderPart2(); };

  // ---- Part 1 wiring --------------------------------------------------------
  function stopAuto() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    DOM.btnAuto.textContent = T('lk.btnAuto', '⏵ Auto-play');
  }
  function startAuto() {
    if (state.t >= GENS_SHOWN) state.t = 0;
    state.timer = setInterval(() => {
      if (state.t >= GENS_SHOWN) {
        stopAuto();
        setStatus(() => T('lk.status.stopped', 'Stopped at generation {t}.', { t: GENS_SHOWN }));
        return;
      }
      state.t++;
      renderPart1();
      setStatus(() => T('lk.status.gen', 'Generation {t}.', { t: state.t }));
    }, 260);
    DOM.btnAuto.textContent = T('lk.btnPause', '⏸ Pause');
  }

  DOM.sliderR.addEventListener('input', () => {
    state.r = +DOM.sliderR.value;
    DOM.rVal.textContent = state.r.toFixed(3);
    DOM.rHint.textContent = rHintText(state.r);
    renderPart1();
    // The Part 2 comparison was computed at the old r, so it no longer applies.
    state.outcome = null;
    renderPart2();
  });
  DOM.sliderD0.addEventListener('input', () => {
    state.d0frac = +DOM.sliderD0.value;
    DOM.d0Val.textContent = state.d0frac.toFixed(2);
    state.t = 0; stopAuto();
    renderPart1();
    setStatus(() => T('lk.status.newAssoc', 'New starting association. Back to generation 0.'));
  });
  DOM.sliderP.addEventListener('input', () => {
    state.p = +DOM.sliderP.value;
    DOM.pVal.textContent = state.p.toFixed(2);
    state.t = 0; stopAuto();
    renderPart1();
  });
  DOM.btnStep.addEventListener('click', () => {
    stopAuto();
    if (state.t < GENS_SHOWN) state.t++;
    renderPart1();
    setStatus(() => T('lk.status.gen', 'Generation {t}.', { t: state.t }));
  });
  DOM.btnAuto.addEventListener('click', () => { state.timer ? stopAuto() : startAuto(); });
  DOM.btnReset.addEventListener('click', () => {
    stopAuto(); state.t = 0; renderPart1();
    setStatus(() => T('lk.status.reset', 'Back to generation 0.'));
  });

  // ---- Part 2 wiring --------------------------------------------------------
  DOM.sliderN.addEventListener('input', () => {
    state.N = +DOM.sliderN.value; DOM.nVal.textContent = state.N;
    DOM.f0Hint.innerHTML = f0HintText();   // the copy count depends on N
    state.outcome = null; renderPart2();
  });
  DOM.sliderS.addEventListener('input', () => {
    state.s = +DOM.sliderS.value; DOM.sVal.textContent = state.s.toFixed(2);
    state.outcome = null; renderPart2();
  });
  DOM.sliderF0.addEventListener('input', () => {
    state.f0 = +DOM.sliderF0.value;
    DOM.f0Val.textContent = state.f0.toFixed(3);
    DOM.f0Hint.innerHTML = f0HintText();
    state.outcome = null; renderPart2();
  });
  DOM.sliderRep.addEventListener('input', () => {
    state.reps = +DOM.sliderRep.value; DOM.repVal.textContent = state.reps;
    state.outcome = null; renderPart2();
  });

  DOM.btnRunOne.addEventListener('click', () => {
    if (state.busy) return;
    state.run = hrRun(state.N, state.s, state.r, state.f0, true);
    renderPart2();
    DOM.hrStatus.innerHTML = T('lk.hrStatus.one', 'One population run at <var>r</var> = {r}.', { r: state.r.toFixed(3) });
  });

  function lockPart2(on) {
    state.busy = on;
    [DOM.btnRunOne, DOM.btnRunMany, DOM.sliderN, DOM.sliderS, DOM.sliderF0, DOM.sliderRep, DOM.sliderR]
      .forEach(el => { el.disabled = on; });
  }

  // Replicates run in slices so the page keeps responding and the count climbs
  // visibly instead of the tab locking up.
  DOM.btnRunMany.addEventListener('click', () => {
    if (state.busy) return;
    lockPart2(true);
    const reps = state.reps, slice = 20;
    const tally = { atR: { both: 0, one: 0, neither: 0 }, free: { both: 0, one: 0, neither: 0 } };
    let done = 0;
    (function chunk() {
      const n = Math.min(slice, reps - done);
      const a = hrReplicates(state.N, state.s, state.r, state.f0, n);
      const b = hrReplicates(state.N, state.s, 0.5, state.f0, n);
      for (const k of ['both', 'one', 'neither']) { tally.atR[k] += a[k]; tally.free[k] += b[k]; }
      done += n;
      state.outcome = tally;
      DOM.hrStatus.innerHTML = T('lk.hrStatus.running', 'Running… {done} / {reps} populations (×2).', { done, reps });
      renderPart2();
      if (done < reps) { setTimeout(chunk, 0); return; }
      DOM.hrStatus.innerHTML = T('lk.hrStatus.done',
        '{reps} populations at <var>r</var> = {r}, and {reps} more at <var>r</var> = 0.5.', { reps, r: state.r.toFixed(3) });
      lockPart2(false);
    })();
  });

  // ---- boot -----------------------------------------------------------------
  document.addEventListener('lab:tabchange', (e) => { if (e.detail.tabId !== 'linkage') stopAuto(); });
  const ro = new ResizeObserver(() => renderAll());
  [DOM.squareCanvas, DOM.decayCanvas, DOM.trajCanvas, DOM.outcomeCanvas]
    .forEach(c => ro.observe(c.parentElement));
  window.addEventListener('resize', renderAll);

  DOM.rVal.textContent = state.r.toFixed(3);
  DOM.rHint.textContent = rHintText(state.r);
  DOM.d0Val.textContent = state.d0frac.toFixed(2);
  DOM.pVal.textContent = state.p.toFixed(2);
  DOM.nVal.textContent = state.N;
  DOM.sVal.textContent = state.s.toFixed(2);
  DOM.f0Val.textContent = state.f0.toFixed(3);
  DOM.f0Hint.innerHTML = f0HintText();
  DOM.repVal.textContent = state.reps;
  renderAll();
})();
