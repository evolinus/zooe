// THE CROWDING ROOM — intraspecific competition and the logistic curve.
//
// Everything here follows from one change to the Growth Room: the per-capita
// rates now depend on N. Rather than bolting noise onto a logistic curve, the
// room defines the two underlying rate functions and derives everything else
// from them, so the birth/death panel, the per-capita panel, the deterministic
// curve and the stochastic replicates are all guaranteed to describe the same
// model:
//
//     d(N) = d0 + (r/2K)·N          deaths rise with crowding
//     b(N) = g(N) + d(N)            births are whatever the model's per-capita
//                                   growth requires them to be
//
// With plain logistic growth g(N) = r(1 − N/K), which makes b(N) a straight
// falling line crossing d(N) exactly at K — the textbook figure. With the Allee
// effect switched on, g is a quadratic and b(N) becomes a hump: rare
// populations breed badly because mates are hard to find, crowded ones because
// there isn't enough to go round.
//
// The room can also run a second population with its own r, K, N₀ and Allee
// setting. The two are separate models sharing only the clock, the noise and the
// replicate count; they never compete for the same K. (Populations that do feel
// each other are the Neighbours Room.) Every panel then carries both.

(function () {
  const FRAMES = 320;
  const N_CAP = 20000;    // a guard against a runaway integration, far above any K on the dial
  const FIELD_H = 210;    // dot-field height with one population…
  const FIELD_H2 = 300;   // …and with two, one band each (matches .pop-wrap in the stylesheet)

  let ui, plots, sim = null, dirty = true;

  // Population 1 keeps the room's own teal; population 2 is plum, a colour no
  // other mark in this room uses — K stays purple, deaths stay terracotta.
  const popColor = k => (k === 1 ? LAB.C.spA : LAB.C.pred);
  const sub = k => (k === 1 ? '₁' : '₂');

  function buildUI() {
    ui = {
      cmp: LAB.segmented('cmpSeg_crowd', 'cmp', { onChange: onCompareChange }),
      n0: LAB.slider('n0_crowd', { valueId: 'n0Val_crowd', format: v => String(v), onChange: markDirty }),
      r:  LAB.slider('r_crowd',  { valueId: 'rVal_crowd',  format: v => v.toFixed(2), onChange: markDirty }),
      K:  LAB.slider('K_crowd',  { valueId: 'KVal_crowd',  format: v => String(v), onChange: markDirty }),
      A:  LAB.slider('A_crowd',  { valueId: 'AVal_crowd',  format: v => String(v), onChange: markDirty }),
      allee: LAB.segmented('alleeSeg_crowd', 'allee', { onChange: markDirty }),
      n02: LAB.slider('n02_crowd', { valueId: 'n0Val2_crowd', format: v => String(v), onChange: markDirty }),
      r2:  LAB.slider('r2_crowd',  { valueId: 'rVal2_crowd',  format: v => v.toFixed(2), onChange: markDirty }),
      K2:  LAB.slider('K2_crowd',  { valueId: 'KVal2_crowd',  format: v => String(v), onChange: markDirty }),
      A2:  LAB.slider('A2_crowd',  { valueId: 'AVal2_crowd',  format: v => String(v), onChange: markDirty }),
      allee2: LAB.segmented('alleeSeg2_crowd', 'allee', { onChange: markDirty }),
      T:  LAB.slider('T_crowd',  { valueId: 'TVal_crowd',  format: v => String(v), onChange: markDirty }),
      noise: LAB.segmented('noiseSeg_crowd', 'noise', { onChange: onNoiseChange }),
      reps:  LAB.segmented('repSeg_crowd', 'reps', { onChange: onRepsChange }),
      status: LAB.$('status_crowd'),
      reading: LAB.$('reading_crowd'),
      note: LAB.$('note_crowd'),
      chartStat: LAB.$('chartStat_crowd'),
      tDisp: LAB.$('tDisp_crowd'),
      nDisp: [LAB.$('nDisp_crowd'), LAB.$('nDisp2_crowd')],
      nkDisp: [LAB.$('nkDisp_crowd'), LAB.$('nkDisp2_crowd')],
      pcDisp: [LAB.$('pcDisp_crowd'), LAB.$('pcDisp2_crowd')]
    };
    plots = {
      popCvs: LAB.$('popCanvas_crowd'),
      pop: LAB.$('popCanvas_crowd').getContext('2d'),
      chart: createPlot(LAB.$('chartCanvas_crowd'), { height: 300 }),
      pc: createPlot(LAB.$('pcCanvas_crowd'), { height: 190, padL: 58 }),
      dndt: createPlot(LAB.$('dndtCanvas_crowd'), { height: 190, padL: 58 }),
      bd: createPlot(LAB.$('bdCanvas_crowd'), { height: 190, padL: 58 })
    };
  }

  function markDirty() { dirty = true; }

  const comparing = () => ui.cmp.value === 'on';

  // Replicates only mean something when births and deaths are random, so the
  // two controls keep each other honest rather than sitting there inert.
  function onRepsChange() {
    if (parseInt(ui.reps.value, 10) > 1) ui.noise.set('on', true);
    markDirty();
  }
  function onNoiseChange() {
    if (ui.noise.value === 'off') ui.reps.set('1', true);
    markDirty();
  }

  // Turning the comparison on or off changes how many populations every panel is
  // about, so the room goes cold rather than showing a one-population run under
  // a two-population set of readouts.
  function onCompareChange() {
    LAB.setRoomFlag('tab-crowding', 'compare-on', comparing());
    onReset();
  }

  // ------------------------------------------------------------------ model

  function makeModel(k) {
    const r = k === 1 ? ui.r.value : ui.r2.value;
    const K = k === 1 ? ui.K.value : ui.K2.value;
    const allee = (k === 1 ? ui.allee.value : ui.allee2.value) === 'on';
    const A = Math.min(k === 1 ? ui.A.value : ui.A2.value, K * 0.9);
    // A higher baseline turnover is needed under the Allee effect, otherwise the
    // birth rate the model implies at very low density would be negative.
    const d0 = allee ? r * 1.2 : r * 0.5;
    const slope = r / (2 * K);

    const g = allee
      ? N => r * (N / A - 1) * (1 - N / K)
      : N => r * (1 - N / K);
    const death = N => d0 + slope * N;
    const birth = N => Math.max(0, g(N) + death(N));

    return { r, K, allee, A, d0, slope, g, birth, death };
  }

  const startOf = k => (k === 1 ? ui.n0.value : ui.n02.value);

  // What is on the dials right now, in the shape the drawing code expects. Used
  // before anything has been simulated, so the panels are never blank.
  function livePops() {
    const list = [];
    for (let k = 1; k <= (comparing() ? 2 : 1); k++) {
      list.push({ k, color: popColor(k), M: makeModel(k), N0: startOf(k) });
    }
    return list;
  }

  function runDeterministic(M, N0, T) {
    const out = new Float64Array(FRAMES + 1);
    const steps = 12;
    const dt = T / FRAMES / steps;
    let N = N0;
    out[0] = N;
    for (let f = 1; f <= FRAMES; f++) {
      for (let s = 0; s < steps; s++) {
        const y = LAB.rk4([N], dt, y => [y[0] * M.g(y[0])]);
        N = Math.min(N_CAP, Math.max(0, y[0]));
        if (N < 1e-6) N = 0;
      }
      out[f] = N;
    }
    return out;
  }

  function runStochastic(M, N0, T) {
    const dtFrame = T / FRAMES;
    const peakRate = Math.max(M.birth(0), M.death(M.K * 2), M.r * 2, 1e-6);
    const steps = Math.max(1, Math.ceil(dtFrame * peakRate / 0.04));
    const dt = dtFrame / steps;
    let N = N0;
    const out = new Float64Array(FRAMES + 1);
    out[0] = N;
    for (let f = 1; f <= FRAMES; f++) {
      for (let s = 0; s < steps && N > 0 && N < N_CAP; s++) {
        const births = LAB.poisson(M.birth(N) * N * dt);
        const deaths = LAB.poisson(M.death(N) * N * dt);
        N = Math.max(0, Math.min(N_CAP, N + births - deaths));
      }
      out[f] = N;
    }
    return out;
  }

  // The purple K lines, one per distinct value. Two populations given the same
  // carrying capacity would otherwise draw one line on top of another and label
  // it with whichever was drawn last; here they share a line called simply K.
  function kMarks(pops, cmp) {
    const out = [];
    pops.forEach(P => {
      const same = out.find(u => u.K === P.M.K);
      if (same) same.ks.push(P.k); else out.push({ K: P.M.K, ks: [P.k] });
    });
    return out.map(u => ({ K: u.K, label: !cmp || u.ks.length > 1 ? 'K' : 'K' + sub(u.ks[0]) }));
  }

  function buildPop(k, T, noisy, reps) {
    const M = makeModel(k);
    const N0 = startOf(k);
    const runs = [];
    for (let i = 0; i < reps; i++) runs.push(noisy ? runStochastic(M, N0, T) : runDeterministic(M, N0, T));
    const det = noisy ? runDeterministic(M, N0, T) : runs[0];
    return { k, color: popColor(k), M, N0, runs, det };
  }

  function simulate() {
    const T = ui.T.value;
    const noisy = ui.noise.value === 'on';
    const reps = noisy ? parseInt(ui.reps.value, 10) : 1;
    const cmp = comparing();

    const pops = [buildPop(1, T, noisy, reps)];
    if (cmp) pops.push(buildPop(2, T, noisy, reps));

    // The Growth Room's curve for the same r and N0, as a visual control. It is
    // not clamped: this is the room's one quantity that nothing holds back, and
    // the whole comparison rests on it saying so. With two populations sharing
    // the panel it is left off — the comparison on offer is between them.
    let exp = null;
    if (!cmp) {
      const P = pops[0];
      exp = new Float64Array(FRAMES + 1);
      for (let f = 0; f <= FRAMES; f++) exp[f] = P.N0 * Math.exp(P.M.r * (f / FRAMES) * T);
    }

    let peak = 5;
    pops.forEach(P => {
      peak = Math.max(peak, P.M.K, P.N0);
      P.runs.forEach(run => run.forEach(v => { if (v > peak) peak = v; }));
    });

    sim = { pops, cmp, exp, T, noisy, peak };
    dirty = false;
    player.load(FRAMES);
  }

  // ---------------------------------------------------------------- drawing

  // Comparing splits the panel into a band per population, each laid out for its
  // own K, so "room left in the environment" stays readable side by side.
  function drawPopField(frame) {
    const cvs = plots.popCvs, ctx = plots.pop;
    const W = cvs.parentElement.clientWidth || 300;
    const cmp = sim ? sim.cmp : comparing();
    const H = cmp ? FIELD_H2 : FIELD_H;
    scaleCanvas(cvs, ctx, W, H);
    ctx.clearRect(0, 0, W, H);

    const pops = sim ? sim.pops : livePops();
    const bandH = H / pops.length;
    pops.forEach((P, i) => {
      const N = sim ? P.runs[0][frame] : P.N0;
      drawBand(ctx, W, i * bandH, bandH, N, P.M.K, P.color, cmp ? `population ${P.k}` : null);
    });
    if (pops.length > 1) {
      ctx.save();
      ctx.strokeStyle = LAB.C.rule;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, bandH); ctx.lineTo(W, bandH); ctx.stroke();
      ctx.restore();
    }
  }

  function drawBand(ctx, W, y0, bandH, N, K, color, label) {
    const labelH = 20, areaH = bandH - labelH;
    const capacity = Math.max(K, N);
    // The grid is laid out for K individuals and then filled to N, so the empty
    // cells read directly as "room left in the environment".
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(capacity, 1) * W / areaH)));
    const rows = Math.max(1, Math.ceil(Math.max(capacity, 1) / cols));
    const cw = W / cols, ch = areaH / rows;
    const rad = Math.max(0.8, Math.min(cw, ch) * 0.33);
    const shown = Math.min(Math.round(capacity), 4000);

    for (let i = 0; i < shown; i++) {
      const cx = (i % cols + 0.5) * cw;
      const cy = y0 + (Math.floor(i / cols) + 0.5) * ch;
      const filled = i < Math.round(N);
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      if (filled) { ctx.fillStyle = color; ctx.fill(); }
      else { ctx.fillStyle = LAB.C.rule; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1; }
    }

    // The filled/pale convention only needs saying once, so a labelled band
    // spends its line on saying whose it is.
    const caption = N === 0 ? 'extinct'
                  : label ? label
                  : 'filled = alive · pale = unused capacity';
    ctx.fillStyle = LAB.C.inkSoft;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label && N === 0 ? `${label} · ${caption}` : caption, W / 2, y0 + bandH - 6);
  }

  function drawChart(frame) {
    const p = plots.chart;
    const pops = sim ? sim.pops : livePops();
    const cmp = sim ? sim.cmp : comparing();
    const T = sim ? sim.T : ui.T.value;
    // The panel is scaled to the populations, which settle at their K; the
    // control curve leaves it within a few time units. `ceiling` sits below the
    // top so the tail that carries it out has somewhere to go.
    const top = Math.max(sim ? sim.peak : 5, ...pops.map(P => P.M.K));
    const yMax = top * 1.18;
    const ceiling = top * 1.08;

    p.begin({ height: 300, xMin: 0, xMax: T, yMin: 0, yMax: yMax,
              xLabel: 'Time', yLabel: 'Population size N' });
    p.grid();
    kMarks(pops, cmp).forEach(m => {
      p.hline(m.K, { color: LAB.C.cap, label: `${m.label} = ` + LAB.fmtInt(m.K) });
    });
    pops.forEach(P => {
      if (P.M.allee) {
        p.hline(Math.min(P.M.A, P.M.K * 0.9),
                { color: LAB.C.spB, dash: [2, 4],
                  label: `Allee threshold A${cmp ? sub(P.k) : ''}` });
      }
    });
    if (!sim) { p.frame(); return; }

    const toPts = arr => {
      const pts = [];
      for (let i = 0; i <= frame; i++) pts.push([(i / FRAMES) * sim.T, arr[i]]);
      return pts;
    };

    // Drawn as it is in the Growth Room: up to the ceiling and then out through
    // the top as a dotted tail. Pinned flat along the top edge it would say the
    // unchecked population levelled off too, which is the one thing this
    // comparison must not say.
    const exit = sim.exp
      ? p.lineOut(toPts(sim.exp), ceiling, { color: LAB.C.inkSoft, width: 1.25, dash: [4, 4], alpha: 0.45 })
      : null;
    if (sim.noisy) {
      sim.pops.forEach(P => p.line(toPts(P.det), {
        color: sim.cmp ? P.color : LAB.C.ink, width: 1.25, dash: [6, 4], alpha: 0.55
      }));
    }
    sim.pops.forEach(P => P.runs.forEach(run => p.line(toPts(run), {
      color: P.color, width: P.runs.length > 5 ? 1 : 2.2,
      alpha: P.runs.length > 1 ? 0.6 : 1
    })));

    const t = (frame / FRAMES) * sim.T;
    p.cursor(t);
    sim.pops.forEach(P => p.dot(t, P.runs[0][frame], { color: LAB.C.ink, r: 4 }));
    if (exit != null) {
      const wide = p.right - exit > 86;
      p.text(exit + (wide ? 5 : -5), p.top + 9, 'still growing',
             { screen: true, align: wide ? 'left' : 'right', alpha: 0.7 });
    }

    let items;
    if (sim.cmp) {
      items = [{ color: popColor(1), label: 'population 1' },
               { color: popColor(2), label: 'population 2' }];
      if (sim.noisy) items.push({ color: LAB.C.inkSoft, dash: [5, 3], label: 'dashed: mean' });
    } else {
      items = [{ color: popColor(1), label: 'with crowding' },
               { color: LAB.C.inkSoft, dash: [4, 3], label: 'no crowding' }];
      if (sim.noisy) items.splice(1, 0, { color: LAB.C.ink, dash: [5, 3], label: 'logistic (mean)' });
    }
    // the key steps aside when the control curve leaves early enough to sit under it
    p.legend(items, { right: exit != null && exit < p.left + p.plotW / 3 });
    p.frame();
  }

  function drawDiagnostics(frame) {
    const pops = sim ? sim.pops : livePops();
    const cmp = sim ? sim.cmp : comparing();
    const at = P => (sim && frame != null ? P.runs[0][frame] : null);
    const xMax = Math.max(...pops.map(P => P.M.K * 1.35), sim ? sim.peak * 1.1 : 0);
    const STEPS = 160;
    const sample = fn => {
      const pts = [];
      for (let i = 0; i <= STEPS; i++) { const x = (i / STEPS) * xMax; pts.push([x, fn(x)]); }
      return pts;
    };
    const marks = kMarks(pops, cmp);

    // --- per-capita growth ---
    const gCurves = pops.map(P => sample(P.M.g));
    let gLo = 0, gHi = 0;
    gCurves.forEach(pts => pts.forEach(([, v]) => { gLo = Math.min(gLo, v); gHi = Math.max(gHi, v); }));
    const gPad = Math.max(0.05, (gHi - gLo) * 0.15);
    const pc = plots.pc;
    pc.begin({ height: 190, padL: 58, xMin: 0, xMax: xMax, yMin: gLo - gPad, yMax: gHi + gPad,
               xLabel: 'Population size N', yLabel: '(dN/dt)/N' });
    pc.grid({ yTicks: 4 });
    pc.hline(0, { color: LAB.C.ink, dash: [], width: 1, alpha: 0.45 });
    marks.forEach(m => pc.vline(m.K, { color: LAB.C.cap, label: m.label }));
    pops.forEach((P, i) => {
      pc.line(gCurves[i], { color: P.color, width: 2.4 });
      const N = at(P);
      if (N != null) pc.dot(N, P.M.g(N), { color: LAB.C.ink, r: 4 });
    });
    pc.frame();

    // --- total growth ---
    const dCurves = pops.map(P => sample(x => x * P.M.g(x)));
    let dLo = 0, dHi = 0;
    dCurves.forEach(pts => pts.forEach(([, v]) => { dLo = Math.min(dLo, v); dHi = Math.max(dHi, v); }));
    const dPad = Math.max(1, (dHi - dLo) * 0.15);
    const dn = plots.dndt;
    dn.begin({ height: 190, padL: 58, xMin: 0, xMax: xMax, yMin: dLo - dPad, yMax: dHi + dPad,
               xLabel: 'Population size N', yLabel: 'dN/dt' });
    dn.grid({ yTicks: 4 });
    dn.hline(0, { color: LAB.C.ink, dash: [], width: 1, alpha: 0.45 });
    // K/2 gets a labelled line of its own when there is one population to say it
    // about; with two, a dot on each hump says the same thing without four
    // vertical rules crossing the panel.
    pops.forEach(P => {
      if (P.M.allee) return;
      const half = P.M.K / 2;
      if (!cmp) dn.vline(half, { color: LAB.C.stamp, label: 'K/2' });
      dn.dot(half, half * P.M.g(half), { color: cmp ? P.color : LAB.C.stamp, r: 3.5 });
    });
    marks.forEach(m => dn.vline(m.K, { color: LAB.C.cap, label: m.label }));
    pops.forEach((P, i) => {
      dn.line(dCurves[i], { color: P.color, width: 2.4 });
      const N = at(P);
      if (N != null) dn.dot(N, N * P.M.g(N), { color: LAB.C.ink, r: 4 });
    });
    dn.frame();

    // --- birth and death rates ---
    // Colour keeps its meaning here — green is births, terracotta deaths — and
    // the second population is dashed instead, so each population's own crossing
    // point still reads as the place where its two lines meet.
    const bdCurves = pops.map(P => ({ b: sample(P.M.birth), d: sample(P.M.death) }));
    let rHi = 0;
    bdCurves.forEach(c => c.b.concat(c.d).forEach(([, v]) => { rHi = Math.max(rHi, v); }));
    const bd = plots.bd;
    bd.begin({ height: 190, padL: 58, xMin: 0, xMax: xMax, yMin: 0, yMax: rHi * 1.15 + 0.01,
               xLabel: 'Population size N', yLabel: 'per-capita rate' });
    bd.grid({ yTicks: 4 });
    pops.forEach((P, i) => {
      const dash = cmp && P.k === 2 ? [5, 4] : [];
      bd.line(bdCurves[i].b, { color: LAB.C.res2, width: 2.2, dash });
      bd.line(bdCurves[i].d, { color: LAB.C.spB, width: 2.2, dash });
      bd.dot(P.M.K, P.M.death(P.M.K), { color: LAB.C.cap, r: 4, ring: LAB.C.paper });
      const N = at(P);
      if (N != null) {
        bd.dot(N, P.M.birth(N), { color: LAB.C.res2, r: 3.5 });
        bd.dot(N, P.M.death(N), { color: LAB.C.spB, r: 3.5 });
      }
    });
    // this panel's top-right corner belongs to the key, so K names itself at the
    // foot of its line
    marks.forEach(m => bd.vline(m.K, { color: LAB.C.cap, label: m.label, labelBottom: true }));
    const bdItems = [{ color: LAB.C.res2, label: 'births b(N)' },
                     { color: LAB.C.spB, label: 'deaths d(N)' }];
    if (cmp) bdItems.push({ color: LAB.C.inkSoft, dash: [5, 4], label: 'dashed: pop 2' });
    bd.legend(bdItems);
    bd.frame();
  }

  function render(frame) {
    if (!sim) {
      drawPopField(0);
      drawChart(frame);
      drawDiagnostics(null);
      livePops().forEach(P => {
        ui.nDisp[P.k - 1].textContent = String(P.N0);
        ui.nkDisp[P.k - 1].textContent = (P.N0 / P.M.K).toFixed(2);
        ui.pcDisp[P.k - 1].textContent = P.M.g(P.N0).toFixed(3);
      });
      return;
    }
    const t = (frame / FRAMES) * sim.T;
    drawPopField(frame);
    drawChart(frame);
    drawDiagnostics(frame);

    ui.tDisp.textContent = LAB.fmt(t, 1);
    sim.pops.forEach(P => {
      const N = P.runs[0][frame];
      ui.nDisp[P.k - 1].textContent = LAB.fmtInt(N);
      ui.nkDisp[P.k - 1].textContent = (N / P.M.K).toFixed(2);
      ui.pcDisp[P.k - 1].textContent = P.M.g(N).toFixed(3);
    });
    ui.chartStat.textContent = sim.cmp
      ? `N₁ ${LAB.fmtInt(sim.pops[0].runs[0][frame])} · N₂ ${LAB.fmtInt(sim.pops[1].runs[0][frame])}`
      : `unlimited growth would give ${LAB.fmtBig(sim.exp[frame])} by now`;
  }

  const player = LAB.createPlayer({
    scrubberId: 'scrub_crowd',
    scrubValueId: 'scrubVal_crowd',
    playBtnId: 'playBtn_crowd',
    playLabel: '▶ Run', pauseLabel: '⏸ Pause',
    fps: 55,
    scrubFormat: i => sim ? LAB.fmt((i / FRAMES) * sim.T, 1) : '0',
    render,
    onEnd: finish
  });

  function finish() {
    if (!sim) return;
    ui.status.textContent = sim.cmp
      ? `done · t = ${sim.T} · N₁ = ${LAB.fmtInt(sim.pops[0].runs[0][FRAMES])} · N₂ = ${LAB.fmtInt(sim.pops[1].runs[0][FRAMES])}`
      : `done · t = ${sim.T} · N = ${LAB.fmtInt(sim.pops[0].runs[0][FRAMES])} (K = ${LAB.fmtInt(sim.pops[0].M.K)})`;

    ui.reading.innerHTML = sim.cmp ? comparisonText() : singleText();
    ui.note.textContent = sim.cmp ? '' : peakNote(sim.pops[0]);
  }

  // The moment a population passed K/2, which is where it was adding
  // individuals fastest. Meaningless under an Allee effect, where the hump moves.
  function peakNote(P) {
    if (P.M.allee) return '';
    for (let i = 0; i <= FRAMES; i++) {
      if (P.det[i] >= P.M.K / 2) {
        const t = (i / FRAMES) * sim.T;
        return `Fastest growth (dN/dt = rK/4 = ${LAB.fmt(P.M.r * P.M.K / 4, 1)} individuals per unit time)`
             + ` occurred at t ≈ ${LAB.fmt(t, 1)}, as the population passed K/2 = ${LAB.fmtInt(P.M.K / 2)}.`;
      }
    }
    return '';
  }

  // What one population did, in its own terms.
  function fateOf(P) {
    const M = P.M;
    const N = P.runs[0][FRAMES];
    if (M.allee && P.N0 < M.A) {
      return `started at ${P.N0}, below its Allee threshold of ${Math.round(M.A)}, so its per-capita growth rate was negative from the first instant and it collapsed`;
    }
    if (P.N0 > M.K) {
      return `started at ${P.N0}, above its carrying capacity of ${LAB.fmtInt(M.K)}, and fell to ${LAB.fmtInt(N)}`;
    }
    const reached = Math.abs(N - M.K) / M.K < 0.1;
    return `${reached ? 'levelled off at' : 'is heading for'} ${LAB.fmtInt(N)}, against a K of ${LAB.fmtInt(M.K)}`;
  }

  function singleText() {
    const P = sim.pops[0];
    const M = P.M;
    const finals = P.runs.map(r => r[FRAMES]);
    const N = finals[0];
    const extinct = finals.filter(v => v === 0).length;

    let txt;
    if (M.allee && P.N0 < M.A) {
      txt = `The population started at ${P.N0}, below the Allee threshold of ${Math.round(M.A)}, so its per-capita growth rate was negative from the first instant and it collapsed. `
          + `An Allee effect turns rarity itself into a cause of decline: there is a floor beneath which a population cannot recover, however much unused capacity is sitting above it.`;
    } else if (P.N0 > M.K) {
      txt = `The population started at ${P.N0}, <em>above</em> the carrying capacity of ${LAB.fmtInt(M.K)}, so deaths outnumbered births and it fell — settling on the same value it would have climbed to from below. `
          + `K is not a ceiling the population presses against; it is the point where births and deaths balance, approached from whichever side you start on.`;
    } else {
      const reached = Math.abs(N - M.K) / M.K < 0.1;
      txt = `Unchecked, this population would have reached <strong>${LAB.fmtBig(sim.exp[FRAMES])}</strong> individuals by now. Instead it ${reached ? 'levelled off at' : 'is heading for'} <strong>${LAB.fmtInt(N)}</strong>, near K = ${LAB.fmtInt(M.K)}. `
          + `Nothing was imposed from outside: the population's own numbers pushed its birth rate down and its death rate up until the two met.`;
    }
    if (P.runs.length > 1) {
      const lo = Math.min(...finals), hi = Math.max(...finals);
      txt += ` Across ${P.runs.length} noisy replicates the final size ranged from ${LAB.fmtInt(lo)} to ${LAB.fmtInt(hi)}`;
      txt += extinct ? `, and ${extinct} went extinct.` : ` — they fluctuate around K rather than sitting on it, because births and deaths never balance exactly in any finite population.`;
    }
    return txt;
  }

  // Which sliders the two populations actually disagree on. A comparison in
  // which two things changed at once cannot say which one mattered, and the
  // room says so rather than leaving the reader to assume.
  function differences() {
    const [A, B] = sim.pops;
    const out = [];
    if (A.N0 !== B.N0) out.push(`N₀ (${A.N0} vs ${B.N0})`);
    if (A.M.r !== B.M.r) out.push(`r (${A.M.r.toFixed(2)} vs ${B.M.r.toFixed(2)})`);
    if (A.M.K !== B.M.K) out.push(`K (${LAB.fmtInt(A.M.K)} vs ${LAB.fmtInt(B.M.K)})`);
    if (A.M.allee !== B.M.allee) out.push(`the Allee effect (${A.M.allee ? 'on for population 1' : 'on for population 2'} only)`);
    else if (A.M.allee && A.M.A !== B.M.A) out.push(`the Allee threshold A (${Math.round(A.M.A)} vs ${Math.round(B.M.A)})`);
    return out;
  }

  function comparisonText() {
    const [A, B] = sim.pops;
    const diffs = differences();

    let txt = `Population 1 ${fateOf(A)}. Population 2 ${fateOf(B)}. `;

    if (diffs.length === 0) {
      txt += `The two were given <em>identical</em> parameters, so anything separating them is chance — `
           + `which with demographic noise off means nothing at all, and with it on means the whole difference.`;
    } else if (diffs.length === 1) {
      txt += `The only parameter that differs is <strong>${diffs[0]}</strong>, so everything separating the two curves follows from that one change. `
           + `Look at the per-capita panel underneath: the same difference is visible there as a difference in the <em>line</em>, before any population has been simulated at all.`;
    } else {
      txt += `The two differ in <strong>${diffs.join('</strong>, <strong>')}</strong> at once, so the chart cannot say which of them produced the difference. `
           + `Return one of the pair to its partner's value and the comparison becomes a controlled one.`;
    }

    if (A.runs.length > 1) {
      const spread = P => {
        const f = P.runs.map(r => r[FRAMES]);
        return `${LAB.fmtInt(Math.min(...f))}–${LAB.fmtInt(Math.max(...f))}`;
      };
      txt += ` Across ${A.runs.length} noisy replicates each, the final sizes spanned ${spread(A)} and ${spread(B)}:`
           + ` a difference between the two populations only means something if it is larger than the spread within each.`;
    }
    return txt;
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

  function onSkip() {
    ensureSim();
    player.showAll();
  }
  function onReset() {
    player.reset();
    sim = null; dirty = true;
    ui.status.textContent = 'Set the parameters and press Run.';
    ui.note.textContent = '';
    ui.chartStat.textContent = '—';
    ui.tDisp.textContent = '0';
    ui.reading.innerHTML = comparing()
      ? 'Press <strong>Run</strong>. Each population has its own r, K and starting size and never meets the other, so the gap that opens between the two curves is exactly what the parameters you changed are worth.'
      : 'Press <strong>Run</strong>. Watch the gap between the logistic curve and the pale exponential open up: that gap is everything the population <em>failed</em> to add because of its own numbers.';
    render(0);
  }

  LAB.ready(() => {
    buildUI();
    LAB.onClick('playBtn_crowd', onRun);
    LAB.onClick('endBtn_crowd', onSkip);
    LAB.onClick('resetBtn_crowd', onReset);
    LAB.bindSteps('crowd', player, ensureSim);
    render(0);
    LAB.onResize(() => player.redraw());
  });
})();
