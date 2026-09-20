// The Reproduction Room: two ways of making the next generation, run side by
// side from the same two founders.
//
// Left panel — ASEXUAL. Every individual makes two exact clones of itself, so
// the population doubles each generation: 2 → 4 → 8 → 16. Nothing recombines,
// so the number of distinct genotypes never rises above the two it started with.
//
// Right panel — SEXUAL. The two parents produce two offspring, each carrying one
// recombined copy from each parent, so the population merely replaces itself —
// the two-fold cost of sex — while every individual is a combination that never
// existed before.
//
// Population versus variety, made countable rather than merely asserted. It is
// also where the rest of the project's machinery comes from: the gametes the
// Hardy–Weinberg Room pairs up are made here, by the meiosis drawn on the right,
// and the recombination rate the Linkage Room turns into a slider is the
// crossover you can see partway down each half.
//
// Ported from the standalone sex_vs_asex page. The model is unchanged; the
// page furniture (masthead, its own help modal) was dropped in favour of the
// shared ones, and its help topics moved into js/help.js.
(function () {
  const $ = (id) => document.getElementById(id + '_sa');

  // Allele shades: teal descends from Founder 1, rust from Founder 2. Mirrored
  // literally from the CSS custom properties so the drawing code stays self-
  // contained, exactly as the canvas rooms do.
  const COLORS = { A1: '#7FB0AE', A2: '#2C5C5A', B1: '#D08A5A', B2: '#8A3B23' };

  // Fills {placeholders} in an English template string.

  // ---- genetics model -------------------------------------------------------
  // A chromatid (one copy of the chromosome) is an ordered list of segments
  // running from top (0) to bottom (1). Each segment is {end, allele}; the first
  // starts at 0, each next starts where the previous ended, the last ends at 1.
  // An allele here is just a colour identity — an ancestry label.
  function takeTop(c, x) {
    const out = [];
    let start = 0;
    for (let i = 0; i < c.length; i++) {
      if (start >= x) break;
      out.push({ end: Math.min(c[i].end, x), allele: c[i].allele });
      start = c[i].end;
      if (c[i].end >= x) break;
    }
    return out;
  }
  function takeBottom(c, x) {
    return c.filter(s => s.end > x).map(s => ({ end: s.end, allele: s.allele }));
  }
  function mergeSegs(c) {
    const out = [];
    for (const s of c) {
      if (out.length && out[out.length - 1].allele === s.allele) out[out.length - 1].end = s.end;
      else out.push({ end: s.end, allele: s.allele });
    }
    return out;
  }
  // Meiosis with a single crossover: build one gamete copy from the individual's
  // two copies. Above the crossover point comes from one copy, below from the other.
  function meiosis(ind) {
    const x = 0.18 + Math.random() * 0.64;
    const topFromLeft = Math.random() < 0.5;
    const cTop = topFromLeft ? ind.left : ind.right;
    const cBot = topFromLeft ? ind.right : ind.left;
    return mergeSegs(takeTop(cTop, x).concat(takeBottom(cBot, x)));
  }
  const cloneChr = (c) => c.map(s => ({ end: s.end, allele: s.allele }));
  const cloneInd = (ind) => ({ left: cloneChr(ind.left), right: cloneChr(ind.right) });

  // Two individuals count as the same genotype when they carry the same pair of
  // copies; which one is drawn on the left is not a genetic difference.
  const chrKey = (c) => c.map(s => s.allele + s.end.toFixed(4)).join(',');
  function distinctGenotypes(pop) {
    const seen = new Set();
    for (const ind of pop) {
      const a = chrKey(ind.left), b = chrKey(ind.right);
      seen.add(a < b ? a + '|' + b : b + '|' + a);
    }
    return seen.size;
  }

  function reproduceAsex(pop) {
    const next = [];
    for (const ind of pop) { next.push(cloneInd(ind)); next.push(cloneInd(ind)); }
    return next;
  }
  function reproduceSex(parents) {
    // Each offspring: one recombined copy from each parent.
    return [0, 1].map(() => ({ left: meiosis(parents[0]), right: meiosis(parents[1]) }));
  }

  // ---- state ----------------------------------------------------------------
  // Run length lives here only: the readout, the captions and the row labels are
  // all derived from it.
  const MAX_GEN = 3;                  // index of the last generation
  const TOTAL_GENS = MAX_GEN + 1;     // generations shown, counting the founders

  const state = { asexGens: null, sexGens: null, cur: 0, timer: null };

  const DOM = {
    btnNext: $('btnNext'), btnAuto: $('btnAuto'), btnReset: $('btnReset'),
    genReadout: $('genReadout'),
    asexSvg: $('asexSvg'), sexSvg: $('sexSvg'),
    asexCount: $('asexCount'), asexGeno: $('asexGeno'),
    sexCount: $('sexCount'), sexGeno: $('sexGeno'),
    takeaway: $('takeaway')
  };

  function founders() {
    return [
      { left: [{ end: 1, allele: 'A1' }], right: [{ end: 1, allele: 'A2' }] },
      { left: [{ end: 1, allele: 'B1' }], right: [{ end: 1, allele: 'B2' }] }
    ];
  }
  function reset() {
    stopAuto();
    const f = founders();
    state.asexGens = [[cloneInd(f[0]), cloneInd(f[1])]];
    state.sexGens = [[cloneInd(f[0]), cloneInd(f[1])]];
    state.cur = 0;
    render();
  }
  function step() {
    if (state.cur >= MAX_GEN) return;
    state.asexGens.push(reproduceAsex(state.asexGens[state.cur]));
    state.sexGens.push(reproduceSex(state.sexGens[state.cur]));
    state.cur++;
    render();
  }

  // ---- drawing --------------------------------------------------------------
  // Pure viewBox arithmetic — nothing is measured off the DOM, so the panels
  // draw correctly even while the tab is hidden.
  const VBW = 480, LG = 24, RG = 26, TOP = 34, ROW_H = 96, BOT = 34, MAX_R = 30, MIN_R = 8;
  const VBH = TOP + MAX_GEN * ROW_H + BOT;
  let clipId = 0;

  function halfBands(c, side, cx, cy, r) {
    const x = side === 'L' ? cx - r : cx;
    let start = 0, out = '';
    for (const s of c) {
      const y = cy - r + start * 2 * r;
      const h = (s.end - start) * 2 * r + 0.6;
      out += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${r.toFixed(2)}" height="${h.toFixed(2)}" fill="${COLORS[s.allele]}"/>`;
      start = s.end;
    }
    return out;
  }
  // A hairline wherever the shade changes: that is a crossover point.
  function crossHairs(c, side, cx, cy, r) {
    const x = side === 'L' ? cx - r : cx;
    let out = '';
    for (let k = 0; k < c.length - 1; k++) {
      if (c[k].allele !== c[k + 1].allele) {
        const y = cy - r + c[k].end * 2 * r;
        out += `<line x1="${x.toFixed(2)}" y1="${y.toFixed(2)}" x2="${(x + r).toFixed(2)}" y2="${y.toFixed(2)}" stroke="#262220" stroke-width="0.8" opacity="0.5"/>`;
      }
    }
    return out;
  }
  const line = (x1, y1, x2, y2) =>
    `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#6b6258" stroke-width="1" opacity="0.3"/>`;

  function paneMarkup(gens, isSex) {
    let maxN = 1;
    for (let g = 0; g <= state.cur; g++) maxN = Math.max(maxN, gens[g].length);
    const contentW = VBW - LG - RG;
    const r = Math.max(MIN_R, Math.min(MAX_R, (contentW / maxN) * 0.42));

    const xs = [], cys = [];
    for (let g = 0; g <= state.cur; g++) {
      const n = gens[g].length, slot = contentW / n, row = [];
      for (let i = 0; i < n; i++) row.push(LG + slot * (i + 0.5));
      xs.push(row); cys.push(TOP + g * ROW_H);
    }

    let defs = '', conn = '', body = '', labels = '';

    // Connectors first, so the circles sit on top of them.
    for (let g = 0; g < state.cur; g++) {
      const py = cys[g], ny = cys[g + 1];
      for (let i = 0; i < xs[g].length; i++) {
        if (isSex) {
          for (let j = 0; j < xs[g + 1].length; j++) conn += line(xs[g][i], py, xs[g + 1][j], ny);
        } else {
          for (const ci of [2 * i, 2 * i + 1]) {
            if (ci < xs[g + 1].length) conn += line(xs[g][i], py, xs[g + 1][ci], ny);
          }
        }
      }
    }

    for (let g = 0; g <= state.cur; g++) {
      for (let i = 0; i < gens[g].length; i++) {
        const ind = gens[g][i], cx = xs[g][i], cy = cys[g], id = 'sacc' + (clipId++);
        defs += `<clipPath id="${id}"><circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}"/></clipPath>`;
        body += `<g clip-path="url(#${id})">`
          + halfBands(ind.left, 'L', cx, cy, r) + halfBands(ind.right, 'R', cx, cy, r)
          + crossHairs(ind.left, 'L', cx, cy, r) + crossHairs(ind.right, 'R', cx, cy, r)
          + '</g>';
        body += `<line x1="${cx.toFixed(2)}" y1="${(cy - r).toFixed(2)}" x2="${cx.toFixed(2)}" y2="${(cy + r).toFixed(2)}" stroke="#262220" stroke-width="1" opacity="0.5"/>`;
        body += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="none" stroke="#262220" stroke-width="1.4"/>`;
      }
      labels += `<text class="sa-glabel" x="4" y="${(cys[g] + 4).toFixed(1)}">G${g + 1}</text>`;
      labels += `<text class="sa-gcount" x="${VBW - 4}" y="${(cys[g] + 4).toFixed(1)}" text-anchor="end">${gens[g].length}</text>`;
    }

    // Generations still to come: a dashed rule holds the row open, so the panel
    // keeps its full height from the start instead of growing under the reader.
    for (let g = state.cur + 1; g <= MAX_GEN; g++) {
      const gy = TOP + g * ROW_H;
      labels += `<line class="sa-grow-ghost" x1="${LG}" y1="${gy}" x2="${VBW - RG}" y2="${gy}"/>`;
      labels += `<text class="sa-glabel ghost" x="4" y="${gy + 4}">G${g + 1}</text>`;
    }

    return `<svg viewBox="0 0 ${VBW} ${VBH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${paneLabel(gens, isSex)}">`
      + `<defs>${defs}</defs>${conn}${body}${labels}</svg>`;
  }

  // Spoken description of a panel, for readers who cannot see the drawing.
  function paneLabel(gens, isSex) {
    const n = gens[state.cur].length, d = distinctGenotypes(gens[state.cur]);
    return T('sa.paneLabel',
      `${isSex ? 'Sexual' : 'Asexual'} family tree, generations 1 to {upto} of {total}. `
      + `Generation {upto} holds {n} individual${n === 1 ? '' : 's'} `
      + `in {d} distinct genotype${d === 1 ? '' : 's'}.`,
      { isSex, upto: state.cur + 1, total: TOTAL_GENS, n, d });
  }

  // ---- narrative ------------------------------------------------------------
  const startText = () => T('sa.start',
    'Both panels start with the <b>same two individuals</b>. Press <b>Next generation</b> to see them reproduce.');

  const midText = (gens, aN, aG, sN) => T('sa.mid',
    `After {gens} generation${gens > 1 ? 's' : ''}: the asexual line has grown to <b>{aN}</b> individuals, but still ` +
    `only <b>{aG}</b> distinct genotypes. The sexual line still numbers <b>{sN}</b> — and every one of them is ` +
    `genetically new.`, { gens, aN, aG, sN });

  const endText = (aN, aG, sN, sG) => T('sa.end',
    `After {total} generations: <b>{aN} asexual</b> individuals between them carry just <b>{aG}</b> genotypes, ` +
    `the two founders copied over and over. The <b>{sN} sexual</b> individuals carry <b>{sG}</b> genotypes — both of ` +
    `them combinations that have never existed before. Numbers on one side, variety on the other.`,
    { total: TOTAL_GENS, aN, aG, sN, sG });

  function render() {
    clipId = 0;
    DOM.asexSvg.innerHTML = paneMarkup(state.asexGens, false);
    DOM.sexSvg.innerHTML = paneMarkup(state.sexGens, true);

    const aN = state.asexGens[state.cur].length, sN = state.sexGens[state.cur].length;
    const aG = distinctGenotypes(state.asexGens[state.cur]);
    const sG = distinctGenotypes(state.sexGens[state.cur]);
    DOM.asexCount.textContent = aN;
    DOM.sexCount.textContent = sN;
    DOM.asexGeno.textContent = aG;
    DOM.sexGeno.textContent = sG;
    DOM.genReadout.innerHTML = T('sa.readout', 'Generation <strong>{n}</strong> of {total}',
      { n: state.cur + 1, total: TOTAL_GENS });
    DOM.btnNext.disabled = state.cur >= MAX_GEN;
    DOM.btnAuto.textContent = state.timer ? T('sa.pause', '⏸ Pause') : T('sa.auto', '⏵ Auto-play');

    DOM.takeaway.innerHTML = state.cur === 0 ? startText()
      : state.cur < MAX_GEN ? midText(state.cur, aN, aG, sN)
        : endText(aN, aG, sN, sG);
  }

  // ---- auto-play ------------------------------------------------------------
  function startAuto() {
    if (state.cur >= MAX_GEN) reset();
    state.timer = setInterval(() => {
      if (state.cur >= MAX_GEN) { stopAuto(); return; }
      step();
    }, 1400);
    DOM.btnAuto.textContent = T('sa.pause', '⏸ Pause');
  }
  function stopAuto() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    DOM.btnAuto.textContent = T('sa.auto', '⏵ Auto-play');
  }

  // ---- wiring ---------------------------------------------------------------
  DOM.btnNext.addEventListener('click', () => { stopAuto(); step(); });
  DOM.btnReset.addEventListener('click', reset);
  DOM.btnAuto.addEventListener('click', () => { state.timer ? stopAuto() : startAuto(); });
  // Don't keep playing in a tab nobody is looking at.
  document.addEventListener('lab:tabchange', (e) => {
    if (e.detail.tabId !== 'reproduction') stopAuto();
  });

  reset();
})();
