// THE TURNOVER ROOM — alpha, beta and gamma diversity.
//
// The Diversity room measured one community. This room measures a landscape of
// several and splits its diversity by scale, in Whittaker's multiplicative form
// with every term an effective number (Jost 2007):
//
//   γ = α × β
//
// γ is the effective number of species in all the sites pooled, α in a typical
// site, and β = γ/α the effective number of completely distinct sites — 1 when
// every site holds the same community, N when no two share a species. Sites are
// weighted equally throughout, which is what lets the partition hold exactly
// for richness, Shannon and Simpson alike, and the reader can switch between
// the three to see how much of β lives in the rare species.
//
// Step 1 is arithmetic on a grid the reader builds. Step 2 lets the sites
// drift as independent neutral Moran communities fed from one regional pool —
// the Diversity room's drift, N times over — beside a single large community
// holding as many individuals as all of them together. That pairing is the
// several-small-or-single-large comparison, and the room is careful to show
// it for what it is under neutrality: a race whose winner depends on how long
// it runs, with every real hazard of small sites left out.

(function () {
  const M = 12;                        // species in the pool, A–L
  const LETTERS = 'ABCDEFGHIJKL';
  const MAX_N = 6;
  const MAX_W = 100;
  const FRAMES = 300;

  // The Diversity room's twelve species colours, so a species is the same
  // colour in both rooms.
  const COLORS = ['#2E5C8A', '#A8442A', '#388047', '#B8862E', '#7A5C99', '#3D6E6E',
                  '#8C3F5D', '#5E6B21', '#454B96', '#C0703A', '#6B8FB3', '#9C8A5A'];

  // One colour per scale, kept in every panel and in the chips: α green, γ the
  // lab's blue, β the gold, and the single large site in the predator's plum.
  const C_A = () => LAB.C.res2;
  const C_G = () => LAB.C.res1;
  const C_B = () => LAB.C.stamp;
  const C_L = () => LAB.C.pred;

  let ui, plots;
  let N = 4;
  let q = 1;
  let grid = [];                // N rows of M abundances
  let selSite = 0, selSp = 0, drag = false;
  let sim = null, dirty = true;

  // --------------------------------------------------------------- arithmetic

  const sharesOf = row => {
    const tot = row.reduce((a, b) => a + b, 0);
    return row.map(x => (tot > 0 ? x / tot : 0));
  };

  // The effective number of order q of one set of shares.
  function hill(p, order) {
    if (order === 0) return p.filter(x => x > 0).length;
    if (order === 1) {
      let H = 0;
      for (const x of p) if (x > 0) H -= x * Math.log(x);
      return Math.exp(H);
    }
    let s = 0;
    for (const x of p) s += x * x;
    return s > 0 ? 1 / s : 0;
  }

  // Jost's equal-weight partition. α is not the plain mean of the sites' own
  // effective numbers but the effective number of their mean "concentration":
  // e^(mean H′) for Shannon, 1/(mean Σp²) for Simpson, mean richness for
  // richness. That is the definition under which γ = α·β holds exactly and β
  // stays between 1 and N.
  function partition(rows, order) {
    const P = rows.map(sharesOf);
    const n = P.length;
    const pbar = new Array(M).fill(0);
    P.forEach(p => p.forEach((x, i) => { pbar[i] += x / n; }));
    let alpha;
    if (order === 0) alpha = P.reduce((a, p) => a + hill(p, 0), 0) / n;
    else if (order === 1) alpha = Math.exp(P.reduce((a, p) => a + Math.log(Math.max(hill(p, 1), 1e-12)), 0) / n);
    else alpha = 1 / (P.reduce((a, p) => a + 1 / Math.max(hill(p, 2), 1e-12), 0) / n);
    const gamma = hill(pbar, order);
    return { alpha, gamma, beta: alpha > 0 ? gamma / alpha : 1, per: P.map(p => hill(p, order)), pbar };
  }

  const qName = () => ['richness', "Shannon's", "Simpson's"][q];
  const fmtD = v => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2));

  // ----------------------------------------------------------------- presets

  // All four share one pool: twelve species, each a quarter less abundant than
  // the one before, so the presets differ in how the pool is shared out among
  // the sites rather than in the species themselves.
  const base = i => Math.max(1, Math.round(100 * Math.pow(0.75, i)));

  const PRESETS = {
    identical: () => rowsOf(() => base),
    // Each site holds the first k of the pool's species, k falling site by site
    // to a quarter of the pool: every poorer site is a subset of every richer.
    nested: () => rowsOf(j => {
      const k = Math.round(M - j * (M - 3) / Math.max(1, N - 1));
      return i => (i < k ? base(i) : 0);
    }),
    // A bell of species centred further along the pool for each site, as along
    // an environmental gradient — the kind of turnover real landscapes have.
    gradient: () => rowsOf(j => {
      const c = N > 1 ? j * (M - 1) / (N - 1) : (M - 1) / 2;
      return i => { const v = Math.round(100 * Math.exp(-Math.pow((i - c) / 2.4, 2))); return v >= 4 ? v : 0; };
    }),
    // A disjoint share of the pool for each site, all equally common: β = N.
    turnover: () => rowsOf(j => {
      const lo = Math.round(j * M / N), hi = Math.round((j + 1) * M / N);
      return i => (i >= lo && i < hi ? 50 : 0);
    })
  };

  function rowsOf(make) {
    const out = [];
    for (let j = 0; j < N; j++) { const f = make(j); out.push(Array.from({ length: M }, (_, i) => f(i))); }
    return out;
  }

  let activePreset = 'gradient';
  function applyPreset(key) {
    if (!PRESETS[key]) return;
    activePreset = key;
    grid = PRESETS[key]();
    onLandscapeChange();
  }

  function clearPreset() {
    activePreset = null;
    ui.preset.btns.forEach(b => b.classList.remove('active'));
  }

  // A change of N re-deals the active preset for the new number of sites. If
  // the reader has edited the grid, there is no preset to re-deal: new sites
  // arrive as copies of the first, and dropped ones simply go.
  function setSites(v) {
    N = LAB.clamp(Math.round(v), 2, MAX_N);
    if (activePreset) { grid = PRESETS[activePreset](); }
    else {
      while (grid.length < N) grid.push(grid[0].slice());
      grid.length = N;
    }
    selSite = Math.min(selSite, N - 1);
    onLandscapeChange();
  }

  function onLandscapeChange() {
    // A site with no individuals has no shares, and every index divides by
    // its total: keep one individual of its first species rather than let it
    // empty.
    grid.forEach(row => { if (row.every(x => !(x > 0))) row[0] = 1; });
    dirty = true;
    drawEditor(); drawScales(); writeLandscape();
    player.redraw();
  }

  // ------------------------------------------------------------------ editor

  // Rows are sites and columns species. The geometry is shared by the drawing
  // and the pointer handler, so the two can never disagree about which bar
  // a click landed on.
  function editorLayout() {
    const cvs = plots.editorCvs;
    const W = cvs.parentElement.clientWidth || 600;
    const padL = 58, padR = 64, padT = 10, padB = 24;
    const rowH = Math.max(34, Math.min(52, 300 / N));
    const H = padT + rowH * N + padB;
    return { W, H, padL, padR, padT, padB, rowH, colW: (W - padL - padR) / M };
  }

  function drawEditor() {
    const L = editorLayout(), cvs = plots.editorCvs, ctx = plots.editorCtx;
    scaleCanvas(cvs, ctx, L.W, L.H);
    ctx.clearRect(0, 0, L.W, L.H);
    const part = partition(grid, q);
    const bw = Math.min(L.colW * 0.66, 30);
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    for (let j = 0; j < N; j++) {
      const y0 = L.padT + j * L.rowH, yb = y0 + L.rowH - 3, hMax = L.rowH - 8;
      ctx.strokeStyle = LAB.C.rule;
      ctx.beginPath(); ctx.moveTo(L.padL, yb + 0.5); ctx.lineTo(L.W - L.padR, yb + 0.5); ctx.stroke();
      ctx.fillStyle = LAB.C.ink; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`Site ${j + 1}`, L.padL - 8, y0 + L.rowH / 2);
      for (let i = 0; i < M; i++) {
        const cx = L.padL + L.colW * (i + 0.5), v = grid[j][i];
        if (v > 0) {
          const h = (v / MAX_W) * hMax;
          ctx.fillStyle = COLORS[i];
          ctx.fillRect(cx - bw / 2, yb - h, bw, h);
        }
        if (j === selSite && i === selSp && document.activeElement === cvs) {
          ctx.strokeStyle = LAB.C.ink; ctx.lineWidth = 1.5;
          ctx.strokeRect(cx - L.colW / 2 + 1.5, y0 + 1.5, L.colW - 3, L.rowH - 3);
          ctx.lineWidth = 1;
        }
      }
      // the site's own effective number, in the measure chosen
      ctx.textAlign = 'left'; ctx.fillStyle = LAB.C.inkSoft;
      ctx.fillText(fmtD(part.per[j]), L.W - L.padR + 8, y0 + L.rowH / 2);
    }
    ctx.fillStyle = LAB.C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 0; i < M; i++) ctx.fillText(LETTERS[i], L.padL + L.colW * (i + 0.5), L.H - L.padB + 6);
    ctx.restore();
    cvs.setAttribute('aria-label', `The landscape: ${N} sites. `
      + grid.map((row, j) => `Site ${j + 1} holds ${row.filter(x => x > 0).length} species, ${qName()} effective number ${fmtD(part.per[j])}`).join('; ')
      + '. Drag a bar, or use the arrow keys.');
  }

  function pointerTo(e) {
    const L = editorLayout(), r = plots.editorCvs.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const i = LAB.clamp(Math.floor((x - L.padL) / L.colW), 0, M - 1);
    const j = LAB.clamp(Math.floor((y - L.padT) / L.rowH), 0, N - 1);
    return { i, j, L, y };
  }
  function valueAt(L, j, y) {
    const yb = L.padT + j * L.rowH + L.rowH - 3, hMax = L.rowH - 8;
    return Math.round(LAB.clamp((yb - y) / hMax * MAX_W, 0, MAX_W));
  }

  function setCell(j, i, v) {
    if (grid[j][i] === v) return;
    grid[j][i] = v;
    clearPreset();
    onLandscapeChange();
  }

  function bindEditor() {
    const cvs = plots.editorCvs;
    cvs.addEventListener('pointerdown', e => {
      const { i, j, L, y } = pointerTo(e);
      drag = true; selSite = j; selSp = i;
      cvs.setPointerCapture(e.pointerId);
      setCell(j, i, valueAt(L, j, y));
    });
    cvs.addEventListener('pointermove', e => {
      if (!drag) return;
      const { L, y } = pointerTo(e);
      setCell(selSite, selSp, valueAt(L, selSite, y));   // the row grabbed, wherever the pointer strays
    });
    const end = e => { if (drag) { drag = false; try { cvs.releasePointerCapture(e.pointerId); } catch (_) {} } };
    cvs.addEventListener('pointerup', end);
    cvs.addEventListener('pointercancel', end);
    // ← and → walk the grid in reading order, wrapping from one site's last
    // species to the next site's first, so the arrows alone reach every cell.
    cvs.addEventListener('keydown', e => {
      const step = e.shiftKey ? 1 : 5;
      const k = selSite * M + selSp;
      if (e.key === 'ArrowRight') { const n = Math.min(N * M - 1, k + 1); selSite = Math.floor(n / M); selSp = n % M; drawEditor(); }
      else if (e.key === 'ArrowLeft') { const n = Math.max(0, k - 1); selSite = Math.floor(n / M); selSp = n % M; drawEditor(); }
      else if (e.key === 'ArrowUp') setCell(selSite, selSp, Math.min(MAX_W, grid[selSite][selSp] + step));
      else if (e.key === 'ArrowDown') setCell(selSite, selSp, Math.max(0, grid[selSite][selSp] - step));
      else return;
      e.preventDefault();
    });
    cvs.addEventListener('focus', drawEditor);
    cvs.addEventListener('blur', drawEditor);
  }

  // Each site's own diversity as a thin grey bar, then α and γ on the same
  // axis. The axis runs to the whole pool, so moving between presets changes
  // bar lengths and never the scale.
  function drawScales() {
    const p = plots.scale;
    const part = partition(grid, q);
    const rows = part.per.map((v, j) => ({ label: `Site ${j + 1}`, v, color: LAB.C.inkSoft, thin: true }))
      .concat([{ label: 'α', v: part.alpha, color: C_A() }, { label: 'γ', v: part.gamma, color: C_G() }]);
    const H = 40 + rows.length * 24;
    p.begin({ height: H, padL: 52, padB: 34, padT: 8, xMin: 0, xMax: M,
              xLabel: `Effective number of species (${['richness', 'Shannon', 'Simpson'][q]})` });
    p.grid({ xStep: 2, yStep: 10, yFmt: () => '' });
    const ctx = p.ctx, band = p.plotH / rows.length;
    ctx.save();
    rows.forEach((r, k) => {
      const yc = p.top + band * (k + 0.5), h = r.thin ? Math.min(8, band * 0.35) : Math.min(16, band * 0.7);
      ctx.fillStyle = r.color; ctx.globalAlpha = r.thin ? 0.55 : 0.9;
      ctx.fillRect(p.left, yc - h / 2, p.px(r.v) - p.left, h);
      ctx.globalAlpha = 1;
      ctx.font = (r.thin ? '' : 'bold ') + '10.5px ui-monospace, monospace';
      ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.fillStyle = r.thin ? LAB.C.inkSoft : LAB.C.ink;
      ctx.fillText(r.label, p.left - 8, yc);
      // A value near the right edge goes inside its own bar, where it fits.
      const inside = p.px(r.v) > p.right - 34 && !r.thin;
      ctx.textAlign = inside ? 'right' : 'left';
      ctx.fillStyle = inside ? LAB.C.paper : LAB.C.ink;
      ctx.fillText(fmtD(r.v), p.px(r.v) + (inside ? -5 : 5), yc);
    });
    ctx.restore();
    p.describe(`Diversity at each scale, by ${qName()} measure: sites ${part.per.map(fmtD).join(', ')}; `
             + `alpha ${fmtD(part.alpha)}, gamma ${fmtD(part.gamma)}, so beta is ${part.beta.toFixed(2)}.`);
    p.frame();
  }

  function writeLandscape() {
    const part = partition(grid, q);
    ui.alphaDisp.textContent = fmtD(part.alpha);
    ui.betaDisp.textContent = `${part.beta.toFixed(2)} of ${N}`;
    ui.gammaDisp.textContent = fmtD(part.gamma);
    ui.landStat.textContent = `${N} sites · measured by ${['richness', 'Shannon', 'Simpson'][q]}`;
    const b = part.beta;
    let txt = `By ${qName()} measure, a typical site holds the equivalent of <strong>${fmtD(part.alpha)}</strong> `
            + `equally common species and the whole landscape <strong>${fmtD(part.gamma)}</strong>, so `
            + `<strong>β = ${b.toFixed(2)}</strong>: the ${N} sites amount to ${b.toFixed(1)} completely distinct ones. `;
    if (b < 1.05) txt += `They are all but identical — adding sites like these adds no species at all.`;
    else if (b > N - 0.05) txt += `No two sites share a species, so every site adds its own and the landscape is ${N} times as diverse as any one of them.`;
    else txt += `Some species are shared and some are not; every site added brings some new ones and some already counted.`;
    ui.reading.innerHTML = txt;
    // Which measure gives the larger β says where the turnover lives: in the
    // rare species (richness larger) or in the common ones (Simpson larger).
    const b0 = partition(grid, 0).beta, b2 = partition(grid, 2).beta;
    ui.note.textContent = Math.abs(b0 - b2) < 0.05
      ? `β is ${b0.toFixed(2)} by richness and ${b2.toFixed(2)} by Simpson: the sites differ as much in their common species as in their rare ones.`
      : b0 > b2
        ? `β is ${b0.toFixed(2)} by richness but ${b2.toFixed(2)} by Simpson: the sites differ mainly in their rare species, and share the common ones.`
        : `β is ${b2.toFixed(2)} by Simpson but ${b0.toFixed(2)} by richness: each site's commonest species is its own, while the rare ones overlap.`;
  }

  // ------------------------------------------------------------------- drift

  function startCounts(J, sh) {
    const raw = sh.map(p => p * J);
    const counts = raw.map(Math.floor);
    let left = J - counts.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; left > 0; k = (k + 1) % order.length, left--) counts[order[k][1]]++;
    return counts;
  }

  // One Moran community, as in the Diversity room: each step one individual
  // dies and is replaced by an immigrant from the pool (probability m) or by
  // the offspring of another member. Recorded at FRAMES evenly spaced moments.
  function moran(J, start, m, poolCum, T) {
    const counts = startCounts(J, start);
    const who = new Uint8Array(J);
    for (let i = 0, k = 0; i < M; i++) for (let c = 0; c < counts[i]; c++) who[k++] = i;
    const top = poolCum[M - 1];
    const snaps = [counts.slice()];
    const total = T * J;
    let next = 1, at = Math.round(total / FRAMES);
    for (let step = 1; step <= total; step++) {
      const k = Math.floor(Math.random() * J);
      const dead = who[k];
      let born;
      if (Math.random() < m) {
        const r = Math.random() * top;
        born = 0;
        while (born < M - 1 && r >= poolCum[born]) born++;
      } else {
        let j = Math.floor(Math.random() * (J - 1));
        if (j >= k) j++;
        born = who[j];
      }
      counts[dead]--; counts[born]++; who[k] = born;
      if (step === at) { snaps.push(counts.slice()); next++; at = Math.round(total * next / FRAMES); }
    }
    while (snaps.length < FRAMES + 1) snaps.push(counts.slice());
    return snaps;
  }

  function driftParams() {
    return { N, J: Math.round(ui.J.value), m: ui.m.value, T: Math.round(ui.T.value),
             start: ui.start.value, grid: grid.map(r => r.slice()) };
  }

  function simulate() {
    const P = driftParams();
    const pool = partition(P.grid, 1).pbar;
    const cum = []; let acc = 0;
    for (const x of pool) { acc += x; cum.push(acc); }
    const sites = P.grid.map(row => moran(P.J, P.start === 'own' ? sharesOf(row) : pool, P.m, cum, P.T));
    const large = moran(P.N * P.J, pool, P.m, cum, P.T);
    sim = { P, sites, large, pool };
    computeSeries();
    dirty = false;
    player.load(FRAMES);
  }

  // The partition at every recorded moment, in the measure currently chosen —
  // recomputed when the measure changes, since the records are counts and
  // every order can be read off them.
  function computeSeries() {
    if (!sim) return;
    const a = [], b = [], g = [], L = [];
    for (let f = 0; f <= FRAMES; f++) {
      const part = partition(sim.sites.map(s => s[f]), q);
      a.push(part.alpha); b.push(part.beta); g.push(part.gamma);
      L.push(hill(sharesOf(sim.large[f]), q));
    }
    const p0 = partition(sim.P.grid, q);
    sim.series = { a, b, g, L, q, poolGamma: hill(sim.pool, q), builtBeta: p0.beta };
  }

  const xsOf = f => (f / FRAMES) * (sim ? sim.P.T : ui.T.value);

  // One stacked bar per site at the current moment, and the large site last,
  // set a little apart because it is the comparison rather than one of the set.
  function drawNow(frame) {
    const p = plots.now;
    const n = sim ? sim.P.N : N;
    const rows = n + 1;
    const H = 46 + rows * 26;
    p.begin({ height: H, padL: 62, padR: 42, padT: 8, padB: 34, xMin: 0, xMax: 1, yMin: 0, yMax: rows,
              xLabel: 'Share of the site' });
    p.grid({ xStep: 0.25, yStep: 100, yFmt: () => '' });
    const ctx = p.ctx, band = p.plotH / (rows + 0.4);
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    for (let r = 0; r < rows; r++) {
      const isLarge = r === n;
      const yc = p.top + band * (r + 0.5 + (isLarge ? 0.4 : 0)), h = Math.min(18, band * 0.72);
      ctx.fillStyle = LAB.C.ink; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(isLarge ? 'One large' : `Site ${r + 1}`, p.left - 8, yc);
      if (!sim) continue;
      const counts = isLarge ? sim.large[frame] : sim.sites[r][frame];
      const tot = counts.reduce((a, c) => a + c, 0);
      let x = 0;
      for (let i = 0; i < M; i++) {
        if (!counts[i]) continue;
        const wdt = counts[i] / tot;
        ctx.fillStyle = COLORS[i];
        ctx.fillRect(p.px(x), yc - h / 2, p.px(x + wdt) - p.px(x), h);
        x += wdt;
      }
      ctx.textAlign = 'left'; ctx.fillStyle = isLarge ? C_L() : LAB.C.inkSoft;
      ctx.fillText(fmtD(hill(sharesOf(counts), q)), p.right + 6, yc);
    }
    if (!sim) {
      ctx.fillStyle = LAB.C.inkSoft; ctx.textAlign = 'center';
      ctx.fillText('press Run', p.left + p.plotW / 2, p.top + p.plotH / 2);
    }
    ctx.restore();
    p.frame();
  }

  function drawSloss(frame) {
    const p = plots.sloss;
    const T = sim ? sim.P.T : Math.round(ui.T.value);
    const yMax = M + 1;
    p.begin({ height: 230, xMin: 0, xMax: T, yMin: 0, yMax,
              xLabel: 'Generation', yLabel: 'Effective number of species' });
    p.grid({ yStep: 2 });
    if (!sim) { p.frame(); return; }
    const s = sim.series;
    const upto = arr => { const pts = []; for (let f = 0; f <= frame; f++) pts.push([xsOf(f), arr[f]]); return pts; };
    p.hline(s.poolGamma, { color: LAB.C.inkSoft, dash: [4, 4], alpha: 0.5 });
    p.line(upto(s.a), { color: C_A(), width: 1.5, alpha: 0.85 });
    p.line(upto(s.L), { color: C_L(), width: 2.2 });
    p.line(upto(s.g), { color: C_G(), width: 2.2 });
    p.cursor(xsOf(frame));
    p.legend([
      { color: C_G(), label: `γ of ${sim.P.N} small sites` },
      { color: C_L(), label: `one site of ${sim.P.N * sim.P.J}` },
      { color: C_A(), label: 'α, a typical small site' }
    ]);
    p.describe(`At generation ${Math.round(xsOf(frame))}, the ${sim.P.N} small sites together hold `
      + `${fmtD(s.g[frame])} effective species and the single large site ${fmtD(s.L[frame])}, by ${qName()} measure.`);
    p.frame();
  }

  function drawBeta(frame) {
    const p = plots.beta;
    const T = sim ? sim.P.T : Math.round(ui.T.value);
    const n = sim ? sim.P.N : N;
    p.begin({ height: 230, xMin: 0, xMax: T, yMin: 1, yMax: n + 0.2,
              xLabel: 'Generation', yLabel: 'β (distinct sites)' });
    p.grid({ yStep: 1 });
    p.hline(n, { color: LAB.C.inkSoft, dash: [2, 3], alpha: 0.6, label: `N = ${n}` });
    if (!sim) { p.frame(); return; }
    const s = sim.series;
    const pts = []; for (let f = 0; f <= frame; f++) pts.push([xsOf(f), s.b[f]]);
    if (sim.P.start === 'own') p.hline(s.builtBeta, { color: C_B(), dash: [4, 4], alpha: 0.6, label: 'as built' });
    p.line(pts, { color: C_B(), width: 2.4 });
    p.cursor(xsOf(frame));
    p.describe(`Beta over time: ${s.b[frame].toFixed(2)} distinct sites of ${n} at generation ${Math.round(xsOf(frame))}.`);
    p.frame();
  }

  function renderDrift(frame) {
    drawNow(frame); drawSloss(frame); drawBeta(frame);
    if (!sim) return;
    const s = sim.series;
    ui.genDisp.textContent = Math.round(xsOf(frame));
    ui.alphaNow.textContent = fmtD(s.a[frame]);
    ui.betaNow.textContent = s.b[frame].toFixed(2);
    ui.gammaNow.textContent = fmtD(s.g[frame]);
    ui.largeNow.textContent = fmtD(s.L[frame]);
    ui.betaStat.textContent = `β ${s.b[frame].toFixed(2)} of ${sim.P.N}`;
  }

  const player = LAB.createPlayer({
    playBtnId: 'playBtn_tov',
    scrubberId: 'scrub_tov',
    scrubValueId: 'scrubVal_tov',
    scrubFormat: i => String(Math.round(xsOf(i))),
    playLabel: '▶ Run', pauseLabel: '⏸ Pause',
    fps: 45,
    render: renderDrift,
    onEnd: finishDrift
  });

  function finishDrift() {
    if (!sim) return;
    const { P } = sim, s = sim.series, f = FRAMES;
    ui.status.textContent = `done · ${P.T} generations · β ${s.b[f].toFixed(2)} of ${P.N}`;
    // Where the two SLOSS lines stand at the end, and when, if ever, the large
    // site was clearly ahead along the way. Both start from the same pool, so
    // "ahead" needs a margin — a fifth of a species or 5%, whichever is more —
    // or the first wobble of the run would read as the lead changing hands.
    const clear = (a, b) => a - b > Math.max(0.2, 0.05 * b);
    const smallAhead = clear(s.g[f], s.L[f]), largeAhead = clear(s.L[f], s.g[f]);
    const ahead = [];
    for (let k = 0; k <= f; k++) if (clear(s.L[k], s.g[k])) ahead.push(k);
    let txt = `After ${P.T} generations, by ${qName()} measure, a typical site holds <strong>${fmtD(s.a[f])}</strong> `
            + `effective species and the ${P.N} sites together <strong>${fmtD(s.g[f])}</strong>, so `
            + `<strong>β = ${s.b[f].toFixed(2)}</strong>`;
    if (P.start === 'pool') txt += ` — up from 1, since every site started the same. `;
    else txt += ` against ${s.builtBeta.toFixed(2)} as built. `;
    if (P.m === 0) txt += `With no immigration each site drifts on its own, and they lose different species. `;
    else if (P.start === 'own' && s.b[f] < s.builtBeta) txt += `Immigration from the shared pool has pulled the sites towards one another and worn the differences you built away. `;
    else txt += `Immigration from the shared pool holds the sites together. `;
    txt += `The single large site holds <strong>${fmtD(s.L[f])}</strong>: `
         + (smallAhead ? `the several small sites hold more between them`
            : largeAhead ? `more than the several small sites together` : `about the same as the small sites together`)
         + (ahead.length === 0 ? `, and the large site was never clearly ahead along the way.`
            : largeAhead ? `.`
            : `, though the large site was ahead for a while, between generations `
              + `${Math.round(xsOf(ahead[0]))} and ${Math.round(xsOf(ahead[ahead.length - 1]))}.`);
    ui.reading.innerHTML = txt;
    ui.note.textContent = P.m === 0
      ? `Scrub back through the run and look for moments when the large site is ahead — in some runs there are none. Then add a little immigration and watch β fall.`
      : `Set Each site starts from to Its own row and run again: immigration from one pool erases the differences between the sites.`;
  }

  function onRun() {
    if (player.running) { player.pause(); return; }
    if (dirty || !sim) { simulate(); ui.status.textContent = 'running…'; }
    player.play();
  }
  function ensureSim() { if (dirty || !sim) simulate(); }
  function onSkip() { ensureSim(); player.showAll(); }
  function onReset() {
    player.reset();
    sim = null; dirty = true;
    ui.status.textContent = 'Set the parameters and press Run.';
    ['genDisp', 'alphaNow', 'betaNow', 'gammaNow', 'largeNow'].forEach(k => { ui[k].textContent = k === 'genDisp' ? '0' : '—'; });
    ui.betaStat.textContent = '—';
    renderDrift(0);
  }

  // ---------------------------------------------------------------- wiring

  function buildUI() {
    const stale = () => { dirty = true; };
    ui = {
      preset: LAB.segmented('presetSeg_tov', 'preset', { onChange: applyPreset }),
      N: LAB.slider('N_tov', { valueId: 'NVal_tov', format: v => String(v), onChange: setSites }),
      q: LAB.segmented('qSeg_tov', 'q', { onChange: v => {
        q = parseInt(v, 10);
        drawEditor(); drawScales(); writeLandscape();
        computeSeries(); player.redraw();
      } }),
      start: LAB.segmented('startSeg_tov', 'start', { onChange: stale }),
      J: LAB.slider('J_tov', { valueId: 'JVal_tov', format: v => String(v), onChange: stale }),
      m: LAB.slider('m_tov', { valueId: 'mVal_tov', format: v => v.toFixed(3), onChange: stale }),
      T: LAB.slider('T_tov', { valueId: 'TVal_tov', format: v => String(v), onChange: () => { dirty = true; if (!sim) player.redraw(); } }),
      status: LAB.$('status_tov'), reading: LAB.$('reading_tov'), note: LAB.$('note_tov'),
      landStat: LAB.$('landStat_tov'),
      alphaDisp: LAB.$('alphaDisp_tov'), betaDisp: LAB.$('betaDisp_tov'), gammaDisp: LAB.$('gammaDisp_tov'),
      genDisp: LAB.$('genDisp_tov'), alphaNow: LAB.$('alphaNowDisp_tov'), betaNow: LAB.$('betaNowDisp_tov'),
      gammaNow: LAB.$('gammaNowDisp_tov'), largeNow: LAB.$('largeNowDisp_tov'), betaStat: LAB.$('betaStat_tov')
    };
    plots = {
      editorCvs: LAB.$('editorCanvas_tov'),
      editorCtx: LAB.$('editorCanvas_tov').getContext('2d'),
      scale: createPlot(LAB.$('scaleCanvas_tov'), { height: 220 }),
      now: createPlot(LAB.$('nowCanvas_tov'), { height: 200 }),
      sloss: createPlot(LAB.$('slossCanvas_tov'), { height: 230 }),
      beta: createPlot(LAB.$('betaCanvas_tov'), { height: 230 })
    };
  }

  LAB.ready(() => {
    buildUI();
    bindEditor();
    LAB.onClick('playBtn_tov', onRun);
    LAB.onClick('endBtn_tov', onSkip);
    LAB.onClick('resetBtn_tov', onReset);
    LAB.bindSteps('tov', player, ensureSim);
    applyPreset('gradient');
    onReset();
    LAB.onResize(() => { drawEditor(); drawScales(); player.redraw(); });
  });
})();
