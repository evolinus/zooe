// THE COEXISTENCE ROOM — competition with the mechanism put back in.
//
//   dR_j/dt = S_j − l·R_j − Σ_i a_ij·R_j·N_i
//   dN_i/dt = N_i·(e·Σ_j a_ij·R_j − m_i)
//
// The Neighbours Room asserted that one species suppresses another and gave the
// strength of that suppression a name. Here nothing is asserted: the two
// consumers never meet, and everything that passes between them passes through
// the food.
//
// ONE RESOURCE. Species i breaks even where e·a_i1·R = m_i, that is at
// R*_i = m_i/(e·a_i1). Whichever species has the lower R* eventually holds the
// resource at that level, which is below what its rival needs — so the rival
// declines, from every starting abundance. That is Tilman's R* rule, and it is
// the mechanistic content of Gause's competitive exclusion principle.
//
// TWO RESOURCES. Each species' break-even condition becomes a line in (R1, R2)
// space. If the lines cross, there is a resource pair at which both species
// exactly break even; whether the environment actually delivers that pair — and
// therefore whether the two coexist — is settled by solving for the equilibrium
// consumer densities and asking whether both come out positive.

(function () {
  const FRAMES = 420;
  const EXTINCT = 0.5;

  let ui, plots, sim = null, dirty = true;

  function buildUI() {
    ui = {
      mode: LAB.segmented('modeSeg_cx', 'mode', { onChange: onModeChange }),
      aA1: LAB.slider('aA1_cx', { valueId: 'aA1Val_cx', format: v => v.toFixed(3), onChange: onParam }),
      aA2: LAB.slider('aA2_cx', { valueId: 'aA2Val_cx', format: v => v.toFixed(3), onChange: onParam }),
      mA:  LAB.slider('mA_cx',  { valueId: 'mAVal_cx',  format: v => v.toFixed(2), onChange: onParam }),
      NA0: LAB.slider('NA0_cx', { valueId: 'NA0Val_cx', format: v => String(v), onChange: markDirty }),
      aB1: LAB.slider('aB1_cx', { valueId: 'aB1Val_cx', format: v => v.toFixed(3), onChange: onParam }),
      aB2: LAB.slider('aB2_cx', { valueId: 'aB2Val_cx', format: v => v.toFixed(3), onChange: onParam }),
      mB:  LAB.slider('mB_cx',  { valueId: 'mBVal_cx',  format: v => v.toFixed(2), onChange: onParam }),
      NB0: LAB.slider('NB0_cx', { valueId: 'NB0Val_cx', format: v => String(v), onChange: markDirty }),
      S1:  LAB.slider('S1_cx',  { valueId: 'S1Val_cx',  format: v => v.toFixed(1), onChange: onParam }),
      S2:  LAB.slider('S2_cx',  { valueId: 'S2Val_cx',  format: v => v.toFixed(1), onChange: onParam }),
      l:   LAB.slider('l_cx',   { valueId: 'lVal_cx',   format: v => v.toFixed(2), onChange: onParam }),
      e:   LAB.slider('e_cx',   { valueId: 'eVal_cx',   format: v => v.toFixed(2), onChange: onParam }),
      T:   LAB.slider('T_cx',   { valueId: 'TVal_cx',   format: v => String(v), onChange: markDirty }),
      status: LAB.$('status_cx'),
      reading: LAB.$('reading_cx'),
      note: LAB.$('note_cx'),
      chartStat: LAB.$('chartStat_cx'),
      verdict: LAB.$('verdict_cx'),
      table: LAB.$('rstarTable_cx'),
      lastTitle: LAB.$('lastPanelTitle_cx'),
      zngiNote: LAB.$('zngiNote_cx')
    };
    plots = {
      N: createPlot(LAB.$('chartN_cx'), { height: 280 }),
      R: createPlot(LAB.$('chartR_cx'), { height: 250 }),
      zngi: createPlot(LAB.$('zngi_cx'), { height: 250, padL: 56 })
    };
  }

  function markDirty() { dirty = true; }
  function onParam() { markDirty(); refreshTheory(); if (!sim) render(0); }

  function twoRes() { return ui.mode.value === 'two'; }

  function onModeChange() {
    const two = twoRes();
    document.querySelectorAll('#tab-coexistence .res2only').forEach(el => {
      el.style.display = two ? '' : 'none';
    });
    ui.lastTitle.textContent = two ? 'Resource space & break-even lines' : 'Growth rate vs. resource level';
    ui.zngiNote.innerHTML = two
      ? 'Each line is one species\' break-even condition: every resource pair on it leaves that species exactly replacing itself, and it can only grow above and to the right of its own line. Where the lines cross, both break even at once.'
      : 'Each line is a species\' per-capita growth rate as a function of how much resource is available. Where a line crosses zero is that species\' R*. Whichever line crosses further to the <em>left</em> belongs to the species that can survive on less — and that species wins.';
    markDirty();
    refreshTheory();
    render(0);
  }

  // ------------------------------------------------------------- the theory

  function params() {
    return {
      aA1: ui.aA1.value, aA2: twoRes() ? ui.aA2.value : 0,
      aB1: ui.aB1.value, aB2: twoRes() ? ui.aB2.value : 0,
      mA: ui.mA.value, mB: ui.mB.value,
      S1: ui.S1.value, S2: twoRes() ? ui.S2.value : 0,
      l: ui.l.value, e: ui.e.value, two: twoRes()
    };
  }

  function rstar(m, a, e) { return a > 1e-9 ? m / (e * a) : Infinity; }

  function theory() {
    const P = params();
    const t = {
      P,
      RsA1: rstar(P.mA, P.aA1, P.e), RsB1: rstar(P.mB, P.aB1, P.e),
      RsA2: rstar(P.mA, P.aA2, P.e), RsB2: rstar(P.mB, P.aB2, P.e),
      R1max: P.l > 0 ? P.S1 / P.l : Infinity,
      R2max: P.l > 0 ? P.S2 / P.l : Infinity
    };

    if (!P.two) {
      const aViable = t.RsA1 < t.R1max, bViable = t.RsB1 < t.R1max;
      t.winner = !aViable && !bViable ? 'none'
               : !bViable ? 'A' : !aViable ? 'B'
               : t.RsA1 < t.RsB1 ? 'A' : t.RsB1 < t.RsA1 ? 'B' : 'tie';
      if (t.winner === 'A' || t.winner === 'B') {
        const Rw = t.winner === 'A' ? t.RsA1 : t.RsB1;
        const aw = t.winner === 'A' ? P.aA1 : P.aB1;
        t.Nwin = (P.S1 - P.l * Rw) / (aw * Rw);
      }
      return t;
    }

    // Two resources: solve both break-even lines simultaneously, then solve the
    // resource equations for the consumer densities that hold them there.
    const det = P.aA1 * P.aB2 - P.aA2 * P.aB1;
    if (Math.abs(det) > 1e-12) {
      const kA = P.mA / P.e, kB = P.mB / P.e;
      const R1 = (kA * P.aB2 - kB * P.aA2) / det;
      const R2 = (P.aA1 * kB - P.aB1 * kA) / det;
      if (R1 > 0 && R2 > 0) {
        const C1 = (P.S1 - P.l * R1) / R1;
        const C2 = (P.S2 - P.l * R2) / R2;
        const det2 = P.aA1 * P.aB2 - P.aB1 * P.aA2;
        const NA = (C1 * P.aB2 - C2 * P.aB1) / det2;
        const NB = (P.aA1 * C2 - P.aA2 * C1) / det2;
        t.coexEq = { R1, R2, NA, NB };
        t.coexists = NA > 0 && NB > 0;
      }
    }
    return t;
  }

  function refreshTheory() {
    const t = theory(), P = t.P;
    const cell = v => (isFinite(v) ? LAB.fmt(v, 2) : '∞');

    let html = '<table class="datatable"><thead><tr><th>Species</th><th>R*<sub>1</sub></th>'
             + (P.two ? '<th>R*<sub>2</sub></th>' : '') + '<th>mortality m</th></tr></thead><tbody>';
    const aWin = !P.two && t.winner === 'A', bWin = !P.two && t.winner === 'B';
    html += `<tr class="${aWin ? 'win' : ''}"><td style="color:var(--sp-a)">A</td><td>${cell(t.RsA1)}</td>`
          + (P.two ? `<td>${cell(t.RsA2)}</td>` : '') + `<td>${LAB.fmt(P.mA, 2)}</td></tr>`;
    html += `<tr class="${bWin ? 'win' : ''}"><td style="color:var(--sp-b)">B</td><td>${cell(t.RsB1)}</td>`
          + (P.two ? `<td>${cell(t.RsB2)}</td>` : '') + `<td>${LAB.fmt(P.mB, 2)}</td></tr>`;
    html += `<tr><td>supply / loss</td><td>${cell(t.R1max)}</td>`
          + (P.two ? `<td>${cell(t.R2max)}</td>` : '') + `<td>—</td></tr>`;
    html += '</tbody></table>';
    ui.table.innerHTML = html;

    if (!sim) showVerdict(t, false);
  }

  function showVerdict(t, ran) {
    const P = t.P;
    let cls = '', title, body = '';

    if (!P.two) {
      if (t.winner === 'none') {
        cls = ''; title = 'Neither species can persist';
        body = `Both break-even levels are above the resource concentration this environment reaches even when empty (S/l = ${LAB.fmt(t.R1max, 2)}). Raise the supply, or lower a mortality.`;
      } else if (t.winner === 'tie') {
        cls = 'is-either'; title = 'A knife-edge tie';
        body = `The two species have identical R*, so neither can displace the other and the model has no unique answer — a boundary case that never survives contact with reality. Nudge one mortality and the tie breaks.`;
      } else {
        const w = t.winner, lo = w === 'A' ? t.RsA1 : t.RsB1, hi = w === 'A' ? t.RsB1 : t.RsA1;
        cls = w === 'A' ? 'is-a' : 'is-b';
        title = `Species ${w} excludes species ${w === 'A' ? 'B' : 'A'}`;
        body = `Species ${w} breaks even at R* = ${LAB.fmt(lo, 2)}, its rival at ${LAB.fmt(hi, 2)}. Once ${w} is common enough to hold the resource near its own R*, there is less food present than the other species needs to replace itself, so that species shrinks — and every individual it loses leaves still more resource for ${w}. `
             + `This is decided by R* alone: not by growth rate, not by attack rate, not by who arrived first or in what numbers.`;
        if (isFinite(t.Nwin)) {
          body += `<p class="mono" style="font-size:12px;margin-top:8px;">Predicted equilibrium: R = ${LAB.fmt(lo, 2)}, N<sub>${w}</sub> = ${LAB.fmt(t.Nwin, 0)}, N<sub>${w === 'A' ? 'B' : 'A'}</sub> = 0.</p>`;
        }
      }
    } else {
      if (t.coexists) {
        cls = 'is-both'; title = 'Coexistence on two resources';
        body = `The two break-even lines cross at R₁ = ${LAB.fmt(t.coexEq.R1, 2)}, R₂ = ${LAB.fmt(t.coexEq.R2, 2)}, and the environment can actually be held there by positive numbers of both species `
             + `(N<sub>A</sub> ≈ ${LAB.fmt(t.coexEq.NA, 0)}, N<sub>B</sub> ≈ ${LAB.fmt(t.coexEq.NB, 0)}). `
             + `Each species draws down mainly the resource it is better at exploiting, so each ends up limited more by its own preferred food than by its rival's — which is precisely the condition for coexistence, and what niche partitioning means mechanistically.`;
      } else if (t.coexEq) {
        cls = 'is-either'; title = 'The lines cross, but coexistence is not feasible';
        body = `There is a resource pair at which both species would break even, but holding the environment there would require a negative abundance of one of them (N<sub>A</sub> = ${LAB.fmt(t.coexEq.NA, 0)}, N<sub>B</sub> = ${LAB.fmt(t.coexEq.NB, 0)}), which is impossible. `
             + `Crossing break-even lines are necessary for coexistence but not sufficient: the environment also has to supply the two resources in roughly the proportions the two species consume them.`;
      } else {
        cls = ''; title = 'No crossing point — one species is simply better';
        body = `One species breaks even at lower levels of <em>both</em> resources. Having two foods available does not help if the same competitor wins on each of them separately: coexistence requires a trade-off, not merely a second resource. Try giving each species the higher attack rate on a different resource.`;
      }
    }

    ui.verdict.className = 'verdict ' + cls;
    ui.verdict.innerHTML = `<h4>${title}</h4><p>${body}</p>`
      + (ran ? '' : `<p style="font-size:13px;color:var(--ink-soft);">Predicted from the parameters alone. Press Run to watch it play out.</p>`);
  }

  // ------------------------------------------------------------- simulation

  function simulate() {
    const P = params();
    const T = ui.T.value;
    const sub = 8, dt = T / FRAMES / sub;

    let R1 = Math.min(P.l > 0 ? P.S1 / P.l : 20, 30);
    let R2 = P.two ? Math.min(P.l > 0 ? P.S2 / P.l : 20, 30) : 0;
    let NA = ui.NA0.value, NB = ui.NB0.value;

    const arr = () => new Float64Array(FRAMES + 1);
    const R1s = arr(), R2s = arr(), As = arr(), Bs = arr();
    R1s[0] = R1; R2s[0] = R2; As[0] = NA; Bs[0] = NB;

    for (let f = 1; f <= FRAMES; f++) {
      for (let s = 0; s < sub; s++) {
        const y = LAB.rk4([R1, R2, NA, NB], dt, ([r1, r2, na, nb]) => [
          P.S1 - P.l * r1 - (P.aA1 * na + P.aB1 * nb) * r1,
          P.two ? P.S2 - P.l * r2 - (P.aA2 * na + P.aB2 * nb) * r2 : 0,
          na * (P.e * (P.aA1 * r1 + P.aA2 * r2) - P.mA),
          nb * (P.e * (P.aB1 * r1 + P.aB2 * r2) - P.mB)
        ]);
        R1 = Math.max(0, y[0]);
        R2 = P.two ? Math.max(0, y[1]) : 0;
        NA = y[2] < EXTINCT ? 0 : y[2];
        NB = y[3] < EXTINCT ? 0 : y[3];
      }
      R1s[f] = R1; R2s[f] = R2; As[f] = NA; Bs[f] = NB;
    }

    let nPeak = 1, rPeak = 1;
    for (let f = 0; f <= FRAMES; f++) {
      nPeak = Math.max(nPeak, As[f], Bs[f]);
      rPeak = Math.max(rPeak, R1s[f], R2s[f]);
    }

    sim = { P, T, R1s, R2s, As, Bs, nPeak, rPeak, t: theory() };
    dirty = false;
    player.load(FRAMES);
  }

  // ---------------------------------------------------------------- drawing

  function drawConsumers(frame) {
    const p = plots.N;
    const T = sim ? sim.T : ui.T.value;
    const yMax = (sim ? sim.nPeak : Math.max(ui.NA0.value, ui.NB0.value)) * 1.15;
    p.begin({ height: 280, xMin: 0, xMax: T, yMin: 0, yMax: Math.max(yMax, 10),
              xLabel: 'Time', yLabel: 'Consumers' });
    p.grid();
    if (!sim) { p.frame(); return; }
    const pa = [], pb = [];
    for (let i = 0; i <= frame; i++) {
      pa.push([(i / FRAMES) * sim.T, sim.As[i]]);
      pb.push([(i / FRAMES) * sim.T, sim.Bs[i]]);
    }
    p.line(pa, { color: LAB.C.spA, width: 2.4 });
    p.line(pb, { color: LAB.C.spB, width: 2.4 });
    const t = (frame / FRAMES) * sim.T;
    p.cursor(t);
    p.dot(t, sim.As[frame], { color: LAB.C.spA, r: 4, ring: LAB.C.paper });
    p.dot(t, sim.Bs[frame], { color: LAB.C.spB, r: 4, ring: LAB.C.paper });
    p.legend([{ color: LAB.C.spA, label: 'species A' }, { color: LAB.C.spB, label: 'species B' }], { right: false });
    p.frame();
  }

  function drawResources(frame) {
    const p = plots.R;
    const t = sim ? sim.t : theory();
    const T = sim ? sim.T : ui.T.value;
    const two = sim ? sim.P.two : twoRes();
    const yMax = Math.max(sim ? sim.rPeak : 20, isFinite(t.RsA1) ? t.RsA1 : 0,
                          isFinite(t.RsB1) ? t.RsB1 : 0, 1) * 1.2;
    p.begin({ height: 250, xMin: 0, xMax: T, yMin: 0, yMax, xLabel: 'Time', yLabel: 'Resource' });
    p.grid();
    // R* is a break-even level only when there is a single resource to break
    // even on; with two, a species' requirement is a line, not a number.
    if (!two) {
      if (isFinite(t.RsA1)) p.hline(t.RsA1, { color: LAB.C.spA, dash: [5, 4], label: 'R*_A' });
      if (isFinite(t.RsB1)) p.hline(t.RsB1, { color: LAB.C.spB, dash: [5, 4], label: 'R*_B' });
    }
    if (!sim) { p.frame(); return; }
    const p1 = [], p2 = [];
    for (let i = 0; i <= frame; i++) {
      p1.push([(i / FRAMES) * sim.T, sim.R1s[i]]);
      if (two) p2.push([(i / FRAMES) * sim.T, sim.R2s[i]]);
    }
    p.line(p1, { color: LAB.C.res1, width: 2.2 });
    if (two) p.line(p2, { color: LAB.C.res2, width: 2.2 });
    p.cursor((frame / FRAMES) * sim.T);
    if (two) p.legend([{ color: LAB.C.res1, label: 'resource 1' }, { color: LAB.C.res2, label: 'resource 2' }]);
    p.frame();
  }

  // One resource: per-capita growth as a function of R, so R* is literally the
  // point where a species' line crosses zero.
  function drawGrowthVsR(frame) {
    const p = plots.zngi;
    const t = sim ? sim.t : theory(), P = t.P;
    // Frame the two break-even crossings rather than the whole resource axis:
    // when the environment is rich, S/l can be an order of magnitude above both
    // R* values and would squash the only part of the plot that matters.
    const rStarMax = Math.max(isFinite(t.RsA1) ? t.RsA1 : 0, isFinite(t.RsB1) ? t.RsB1 : 0, 0.5);
    let xMax = rStarMax * 2.2;
    if (isFinite(t.R1max) && t.R1max < xMax) xMax = Math.max(t.R1max * 1.15, rStarMax * 1.2);
    const gAt = (a, m, R) => P.e * a * R - m;
    const yHi = Math.max(gAt(P.aA1, P.mA, xMax), gAt(P.aB1, P.mB, xMax), 0.05);
    const yLo = Math.min(-P.mA, -P.mB) * 1.15;

    p.begin({ height: 250, padL: 56, xMin: 0, xMax, yMin: yLo, yMax: yHi * 1.1,
              xLabel: 'Resource level R', yLabel: 'per-capita growth' });
    p.grid({ yTicks: 4 });
    p.hline(0, { color: LAB.C.ink, dash: [], width: 1, alpha: 0.5 });
    p.line([[0, -P.mA], [xMax, gAt(P.aA1, P.mA, xMax)]], { color: LAB.C.spA, width: 2.2 });
    p.line([[0, -P.mB], [xMax, gAt(P.aB1, P.mB, xMax)]], { color: LAB.C.spB, width: 2.2 });
    if (isFinite(t.RsA1) && t.RsA1 <= xMax) p.dot(t.RsA1, 0, { color: LAB.C.spA, r: 4.5, ring: LAB.C.paper });
    if (isFinite(t.RsB1) && t.RsB1 <= xMax) p.dot(t.RsB1, 0, { color: LAB.C.spB, r: 4.5, ring: LAB.C.paper });
    if (isFinite(t.R1max) && t.R1max <= xMax) p.vline(t.R1max, { color: LAB.C.inkSoft, dash: [2, 3], alpha: 0.7, label: 'S/l' });
    if (sim) p.vline(sim.R1s[frame], { color: LAB.C.stamp, dash: [], width: 1.5, alpha: 0.9, label: 'R now' });
    p.legend([{ color: LAB.C.spA, label: 'species A' }, { color: LAB.C.spB, label: 'species B' }], { bottom: true });
    p.frame();
  }

  // Two resources: Tilman's picture. Break-even lines in resource space, the
  // supply point the environment would reach with no consumers, and the path
  // the resources actually took.
  function drawZNGI(frame) {
    const p = plots.zngi;
    const t = sim ? sim.t : theory(), P = t.P;
    // Frame the break-even lines and the path the resources took, not the whole
    // resource plane: in a rich environment the supply point sits far outside
    // this region and framing to it would crush everything worth seeing into
    // the bottom-left corner. When it is off-scale it gets a corner marker.
    const fin = (v, d) => (isFinite(v) && v > 0 ? v : d);
    let trajX = 0, trajY = 0;
    if (sim) for (let i = 0; i <= FRAMES; i++) { trajX = Math.max(trajX, sim.R1s[i]); trajY = Math.max(trajY, sim.R2s[i]); }
    const xMax = Math.max(fin(t.RsA1, 0), fin(t.RsB1, 0), trajX, 1) * 1.35;
    const yMax = Math.max(fin(t.RsA2, 0), fin(t.RsB2, 0), trajY, 1) * 1.35;

    p.begin({ height: 250, padL: 56, xMin: 0, xMax, yMin: 0, yMax,
              xLabel: 'Resource 1', yLabel: 'Resource 2' });
    p.grid({ xTicks: 4, yTicks: 4 });

    // a_i1·R1 + a_i2·R2 = m_i/e, drawn between its two axis intercepts.
    const zngi = (a1, a2, m, color) => {
      const k = m / P.e;
      const x0 = a1 > 1e-9 ? k / a1 : Infinity;   // R2 = 0
      const y0 = a2 > 1e-9 ? k / a2 : Infinity;   // R1 = 0
      if (isFinite(x0) && isFinite(y0)) p.line([[x0, 0], [0, y0]], { color, width: 2.2 });
      else if (isFinite(x0)) p.line([[x0, 0], [x0, yMax]], { color, width: 2.2 });
      else if (isFinite(y0)) p.line([[0, y0], [xMax, y0]], { color, width: 2.2 });
    };
    zngi(P.aA1, P.aA2, P.mA, LAB.C.spA);
    zngi(P.aB1, P.aB2, P.mB, LAB.C.spB);

    if (isFinite(t.R1max) && isFinite(t.R2max)) {
      if (t.R1max <= xMax && t.R2max <= yMax) {
        p.dot(t.R1max, t.R2max, { color: LAB.C.stamp, r: 5, ring: LAB.C.paper });
        p.text(t.R1max, t.R2max, ' supply point', { color: LAB.C.stamp, baseline: 'bottom' });
      } else {
        p.text(p.right - 6, p.top + 4, '↗ supply point (' + LAB.fmt(t.R1max, 0) + ', ' + LAB.fmt(t.R2max, 0) + ')',
               { color: LAB.C.stamp, align: 'right', baseline: 'top', screen: true });
      }
    }
    if (t.coexEq && t.coexists) p.dot(t.coexEq.R1, t.coexEq.R2, { color: LAB.C.cap, r: 6, ring: LAB.C.paper });

    if (sim) {
      const traj = [];
      for (let i = 0; i <= frame; i++) traj.push([sim.R1s[i], sim.R2s[i]]);
      p.line(traj, { color: LAB.C.ink, width: 1.5, alpha: 0.8 });
      p.dot(sim.R1s[frame], sim.R2s[frame], { color: LAB.C.ink, r: 4.5, ring: LAB.C.paper });
    }
    p.legend([{ color: LAB.C.spA, label: 'A breaks even' }, { color: LAB.C.spB, label: 'B breaks even' }],
             { bottom: true });
    p.frame();
  }

  function render(frame) {
    drawConsumers(frame);
    drawResources(frame);
    if (twoRes()) drawZNGI(frame); else drawGrowthVsR(frame);
    if (sim) {
      ui.chartStat.textContent = `t = ${LAB.fmt((frame / FRAMES) * sim.T, 0)} · A = ${LAB.fmt(sim.As[frame], 0)} · B = ${LAB.fmt(sim.Bs[frame], 0)} · R₁ = ${LAB.fmt(sim.R1s[frame], 2)}`;
    }
  }

  const player = LAB.createPlayer({
    scrubberId: 'scrub_cx',
    scrubValueId: 'scrubVal_cx',
    playBtnId: 'playBtn_cx',
    playLabel: '▶ Run', pauseLabel: '⏸ Pause',
    fps: 75,
    scrubFormat: i => sim ? LAB.fmt((i / FRAMES) * sim.T, 0) : '0',
    render,
    onEnd: finish
  });

  function finish() {
    if (!sim) return;
    const A = sim.As[FRAMES], B = sim.Bs[FRAMES], t = sim.t;
    showVerdict(t, true);
    ui.status.textContent = `done · A = ${LAB.fmt(A, 0)} · B = ${LAB.fmt(B, 0)}`;

    let txt;
    if (!sim.P.two) {
      if (A > 0 && B === 0) {
        txt = `Species A survived and species B did not. A held the resource at <strong>${LAB.fmt(sim.R1s[FRAMES], 2)}</strong>, below B's break-even level of ${LAB.fmt(t.RsB1, 2)}, so B lost a little ground every moment it stayed. `
            + `Nothing else was needed — no interference, no aggression, no head start.`;
      } else if (B > 0 && A === 0) {
        txt = `Species B survived and species A did not. B held the resource at <strong>${LAB.fmt(sim.R1s[FRAMES], 2)}</strong>, below A's break-even level of ${LAB.fmt(t.RsA1, 2)}. `
            + `Try giving A ten times B's starting abundance and running again: the result will not change, only the time it takes.`;
      } else if (A > 0 && B > 0) {
        txt = `Both species are still present, but on a single resource that cannot last: the one with the higher R* is still declining and would disappear given enough time. Raise the time span and run again to see it through.`;
      } else {
        txt = `Both species died out — the environment cannot sustain either of them at these mortality rates.`;
      }
    } else {
      if (A > 0 && B > 0) {
        txt = `Both species persisted, at <strong>${LAB.fmt(A, 0)}</strong> and <strong>${LAB.fmt(B, 0)}</strong> individuals, with resource 1 held at ${LAB.fmt(sim.R1s[FRAMES], 2)} and resource 2 at ${LAB.fmt(sim.R2s[FRAMES], 2)}. `
            + `The second resource did not merely add food — it added a <em>trade-off</em>. Each species depresses most the resource it exploits best, so each suffers more from its own kind than from its competitor.`;
      } else {
        const w = A > 0 ? 'A' : B > 0 ? 'B' : null;
        txt = w
          ? `Species ${w} excluded the other even with two resources available. Two foods are not enough on their own: coexistence needs each species to be better at a <em>different</em> one. Give ${w === 'A' ? 'B' : 'A'} the higher attack rate on the resource it currently neglects and run again.`
          : `Both species died out — check the supplies and the mortality rates.`;
      }
    }
    ui.reading.innerHTML = txt;

    ui.note.textContent = sim.P.two
      ? `Final resources: R₁ = ${LAB.fmt(sim.R1s[FRAMES], 2)}, R₂ = ${LAB.fmt(sim.R2s[FRAMES], 2)}.`
      : `Final resource level ${LAB.fmt(sim.R1s[FRAMES], 2)} · R*_A = ${LAB.fmt(t.RsA1, 2)} · R*_B = ${LAB.fmt(t.RsB1, 2)}.`;
  }

  function onRun() {
    if (player.running) { player.pause(); return; }
    if (dirty || !sim) { simulate(); ui.status.textContent = 'running…'; ui.note.textContent = ''; }
    player.play();
  }
  // Shared by Skip-to-end and the scrubber's step buttons: a stale or cold
  // room has to be simulated before there is anything to move through.
  function ensureSim() {
    if (dirty || !sim) { simulate(); ui.note.textContent = ''; }
  }

  function onSkip() { ensureSim(); player.showAll(); }
  function onReset() {
    player.reset(); sim = null; dirty = true;
    ui.status.textContent = 'Set the parameters and press Run.';
    ui.note.textContent = '';
    ui.chartStat.textContent = '—';
    refreshTheory();
    ui.reading.innerHTML = 'Press <strong>Run</strong>. In one-resource mode, try giving the losing species ten times the starting abundance of the winner — and watch it lose anyway.';
    render(0);
  }

  LAB.ready(() => {
    buildUI();
    LAB.onClick('playBtn_cx', onRun);
    LAB.onClick('endBtn_cx', onSkip);
    LAB.onClick('resetBtn_cx', onReset);
    LAB.bindSteps('cx', player, ensureSim);
    onModeChange();
    LAB.onResize(() => player.redraw());
  });
})();
