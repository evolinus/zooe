// THE GROWTH ROOM — density-independent (exponential) growth.
//
// The baseline the whole lab is measured against: per-capita birth and death
// rates are constants, so an individual's prospects don't depend on how many
// neighbours it has. Two things are drawn at once — the textbook curve
// N₀e^(rt), and a set of replicate populations in which every birth and death
// is an independent random event. The gap between them is the room's second
// lesson: a positive growth rate is a statement about the average, and small
// populations routinely go extinct in spite of it.
//
// The room can also run a *second* population with its own N₀, b and d. The two
// never interact — they share the clock, the noise and the replicate count and
// nothing else — so the chart is a controlled comparison: change one slider on
// population 2 and every difference between the curves is that slider's doing.

(function () {
  const FRAMES = 300;      // playback resolution; also the simulation's sample count
  const N_CEIL = 200000;   // the chart's ceiling — a limit of the panel, never of the model
  const DOT_CAP = 1500;    // above this, one dot on the population field means several individuals
  const FIELD_H = 210;     // dot-field height with one population…
  const FIELD_H2 = 300;    // …and with two, one band each (matches .pop-wrap in the stylesheet)

  let ui, plots, sim = null, dirty = true;

  // Population 1 keeps the room's own green; population 2 is plum, a colour no
  // other mark in this room uses.
  const popColor = k => (k === 1 ? LAB.C.res2 : LAB.C.pred);

  function buildUI() {
    ui = {
      cmp: LAB.segmented('cmpSeg_growth', 'cmp', { onChange: onCompareChange }),
      n0: LAB.slider('n0_growth', { valueId: 'n0Val_growth', format: v => String(v), onChange: markDirty }),
      b:  LAB.slider('b_growth',  { valueId: 'bVal_growth',  format: v => v.toFixed(2), onChange: onRateChange }),
      d:  LAB.slider('d_growth',  { valueId: 'dVal_growth',  format: v => v.toFixed(2), onChange: onRateChange }),
      n02: LAB.slider('n02_growth', { valueId: 'n0Val2_growth', format: v => String(v), onChange: markDirty }),
      b2:  LAB.slider('b2_growth',  { valueId: 'bVal2_growth',  format: v => v.toFixed(2), onChange: onRateChange }),
      d2:  LAB.slider('d2_growth',  { valueId: 'dVal2_growth',  format: v => v.toFixed(2), onChange: onRateChange }),
      T:  LAB.slider('T_growth',  { valueId: 'TVal_growth',  format: v => String(v), onChange: markDirty }),
      reps: LAB.segmented('repSeg_growth', 'reps', { onChange: markDirty }),
      scale: LAB.segmented('scaleSeg_growth', 'scale', { onChange: () => player.redraw() }),
      status: LAB.$('status_growth'),
      reading: LAB.$('reading_growth'),
      note: LAB.$('note_growth'),
      chartStat: LAB.$('chartStat_growth'),
      tDisp: LAB.$('tDisp_growth'),
      nDisp: [LAB.$('nDisp_growth'), LAB.$('nDisp2_growth')],
      rDisp: [LAB.$('rDisp_growth'), LAB.$('rDisp2_growth')],
      dblDisp: [LAB.$('dblDisp_growth'), LAB.$('dblDisp2_growth')]
    };
    plots = {
      pop: LAB.$('popCanvas_growth').getContext('2d'),
      popCvs: LAB.$('popCanvas_growth'),
      chart: createPlot(LAB.$('chartCanvas_growth'), { height: 300 }),
      pc: createPlot(LAB.$('pcCanvas_growth'), { height: 180, padL: 56 }),
      dndt: createPlot(LAB.$('dndtCanvas_growth'), { height: 180, padL: 56 })
    };
  }

  function markDirty() { dirty = true; }

  const comparing = () => ui.cmp.value === 'on';

  // The parameters of population k, straight off the sliders.
  function params(k) {
    return k === 1
      ? { N0: ui.n0.value, b: ui.b.value, d: ui.d.value }
      : { N0: ui.n02.value, b: ui.b2.value, d: ui.d2.value };
  }

  // What is on the dials right now, in the shape the drawing code expects. Used
  // before anything has been simulated, so the panels are never blank.
  function livePops() {
    const list = [];
    for (let k = 1; k <= (comparing() ? 2 : 1); k++) {
      const P = params(k);
      list.push({ k, color: popColor(k), N0: P.N0, b: P.b, d: P.d, r: P.b - P.d });
    }
    return list;
  }

  // Turning the comparison on or off changes how many populations every panel is
  // about, so the room goes cold rather than showing a one-population run under
  // a two-population set of readouts.
  function onCompareChange() {
    LAB.setRoomFlag('tab-growth', 'compare-on', comparing());
    onRateChange();
    onReset();
  }

  // r and the doubling time are properties of the sliders alone, so they can be
  // shown before anything is simulated.
  function onRateChange() {
    markDirty();
    livePops().forEach(P => {
      ui.rDisp[P.k - 1].textContent = (P.r >= 0 ? '+' : '') + P.r.toFixed(2);
      ui.dblDisp[P.k - 1].textContent = P.r > 0 ? LAB.fmt(Math.log(2) / P.r, 1)
                                      : P.r < 0 ? 'halves in ' + LAB.fmt(Math.log(2) / -P.r, 1)
                                      : '∞';
    });
    if (!sim) drawRatePanels(null);
  }

  // ------------------------------------------------------------- simulation

  // One replicate as a Poisson birth–death process. Sub-steps are chosen so that
  // the expected number of events per individual per step stays small, which is
  // what makes the tau-leaping approximation faithful.
  function runReplicate(N0, b, d, T) {
    const dtFrame = T / FRAMES;
    const maxRate = Math.max(b, d, 1e-6);
    const sub = Math.max(1, Math.ceil(dtFrame * maxRate / 0.05));
    const dt = dtFrame / sub;
    const r = b - d;
    let N = N0;
    const out = new Float64Array(FRAMES + 1);
    out[0] = N;
    for (let f = 1; f <= FRAMES; f++) {
      // Once a replicate has passed the chart's ceiling it is carried on
      // deterministically instead of event by event. At those sizes chance has
      // nothing left to say — the coefficient of variation is 1/√N, under a
      // quarter of a percent at 200 000 — and the trajectory has to keep rising
      // rather than freeze, because nothing in this model ever stops it.
      if (N >= N_CEIL) { N *= Math.exp(r * dtFrame); out[f] = N; continue; }
      for (let s = 0; s < sub && N > 0; s++) {
        const births = LAB.poisson(b * N * dt);
        const deaths = LAB.poisson(d * N * dt);
        N = Math.max(0, N + births - deaths);
      }
      out[f] = N;
    }
    return out;
  }

  // One population: its replicates and its own deterministic prediction.
  function buildPop(k, T, reps) {
    const P = params(k);
    const r = P.b - P.d;
    const runs = [];
    for (let i = 0; i < reps; i++) runs.push(runReplicate(P.N0, P.b, P.d, T));
    const det = new Float64Array(FRAMES + 1);
    for (let f = 0; f <= FRAMES; f++) det[f] = P.N0 * Math.exp(r * (f / FRAMES) * T);
    return { k, color: popColor(k), N0: P.N0, b: P.b, d: P.d, r, runs, det,
             extinct: runs.filter(rn => rn[FRAMES] === 0).length };
  }

  function simulate() {
    const T = ui.T.value;
    const reps = parseInt(ui.reps.value, 10);
    const cmp = comparing();

    const pops = [buildPop(1, T, reps)];
    if (cmp) pops.push(buildPop(2, T, reps));

    let raw = 2;
    pops.forEach(P => {
      P.runs.forEach(run => run.forEach(v => { if (v > raw) raw = v; }));
      raw = Math.max(raw, P.det[FRAMES], P.N0 * 1.5);
    });
    // the axis stops at the ceiling; whatever grows past it is drawn leaving
    // the panel rather than pressed flat against the top of it
    const peak = Math.min(raw, N_CEIL);

    sim = { pops, cmp, T, peak, raw };
    dirty = false;
    player.load(FRAMES);
  }

  // ---------------------------------------------------------------- drawing

  // The population field: one dot per individual while that stays legible, then
  // one dot per k individuals with the scale stated underneath. Only the first
  // replicate of each population is shown — this panel is about feeling the size
  // of a number. Comparing splits the panel into a band per population.
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
      drawBand(ctx, W, i * bandH, bandH, N, P.color, cmp ? `population ${P.k}` : null);
    });
    if (pops.length > 1) {
      ctx.save();
      ctx.strokeStyle = LAB.C.rule;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, bandH); ctx.lineTo(W, bandH); ctx.stroke();
      ctx.restore();
    }
  }

  function drawBand(ctx, W, y0, bandH, N, color, label) {
    const labelH = 20;
    const areaH = bandH - labelH;

    const per = N > DOT_CAP ? Math.ceil(N / DOT_CAP) : 1;
    const dots = Math.min(DOT_CAP, Math.round(N / per));

    if (dots > 0) {
      // Choose a grid whose cells are as square as possible for this dot count.
      const cols = Math.max(1, Math.ceil(Math.sqrt(dots * W / areaH)));
      const rows = Math.max(1, Math.ceil(dots / cols));
      const cw = W / cols, ch = areaH / rows;
      const rad = Math.max(0.7, Math.min(cw, ch) * 0.32);
      ctx.fillStyle = color;
      for (let i = 0; i < dots; i++) {
        const cx = (i % cols + 0.5) * cw;
        const cy = y0 + (Math.floor(i / cols) + 0.5) * ch;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const scale = N === 0 ? 'extinct'
                : per === 1 ? '1 dot = 1 individual'
                : `1 dot = ${LAB.fmtBig(per)} individuals`;
    ctx.fillStyle = LAB.C.inkSoft;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label ? `${label} · ${scale}` : scale, W / 2, y0 + bandH - 6);
  }

  function drawChart(frame) {
    const p = plots.chart;
    const log = ui.scale.value === 'log';
    const T = sim ? sim.T : ui.T.value;
    const peak = sim ? sim.peak : 100;

    // The linear panel stops at the ceiling and lets the curves leave through
    // the top of it. The logarithmic one has no such trouble — decades are cheap
    // — so it grows to whatever the run actually reached and shows the lot, which
    // is the view in which unchecked growth is a straight line.
    const yMax = log ? Math.max((sim ? sim.raw : peak) * 1.6, 10) : peak * 1.08;
    const ceiling = log ? Infinity : N_CEIL;

    p.begin({
      height: 300, xMin: 0, xMax: T,
      yMin: log ? 0.5 : 0, yMax,
      yLog: log, xLabel: 'Time', yLabel: 'Population size N'
    });
    p.grid(log ? { yFmt: LAB.fmtPow10, yDecade: Math.ceil((Math.log10(yMax) + 1) / 9) } : {});
    if (!sim) { p.frame(); return; }

    const floor = log ? 0.5 : 0;
    let exit = null;   // rightmost point at which a series left the panel

    const series = (arr, style) => {
      const x = drawSeries(p, arr, frame, floor, ceiling, style);
      if (x != null && (exit == null || x > exit)) exit = x;
    };

    // Predictions first so the simulated runs sit on top of them. With one
    // population the prediction is the room's usual grey; with two it takes the
    // population's colour, because whose prediction it is has become a question.
    sim.pops.forEach(P => series(P.det, {
      color: sim.cmp ? P.color : LAB.C.inkSoft,
      width: 1.5, dash: [6, 4], alpha: sim.cmp ? 0.6 : 0.85
    }));
    sim.pops.forEach(P => P.runs.forEach(run => series(run, {
      color: P.color,
      width: P.runs.length > 5 ? 1 : 2,
      alpha: P.runs.length > 1 ? 0.65 : 1
    })));

    const t = (frame / FRAMES) * sim.T;
    p.cursor(t);
    // no marker once a leading replicate is off the panel: a dot pinned to the
    // top edge would say the population had settled there
    sim.pops.forEach(P => {
      if (P.runs[0][frame] <= ceiling) {
        p.dot(t, Math.max(P.runs[0][frame], floor), { color: LAB.C.ink, r: 4 });
      }
    });
    if (exit != null) {
      // beside the tail, or on its left where the tail leaves near the edge
      const wide = p.right - exit > 86;
      p.text(exit + (wide ? 5 : -5), p.top + 9, 'still growing',
             { screen: true, align: wide ? 'left' : 'right', alpha: 0.75 });
    }
    // The key sits top left, where the curves start — unless they leave so early
    // that it would cover the exit, in which case the emptied right half of the
    // panel is the better home for it.
    const items = sim.cmp
      ? [{ color: popColor(1), label: 'population 1' },
         { color: popColor(2), label: 'population 2' },
         { color: LAB.C.inkSoft, dash: [5, 3], label: 'dashed: N₀e^rt' }]
      : [{ color: popColor(1), label: 'simulated' },
         { color: LAB.C.inkSoft, dash: [5, 3], label: 'N₀e^rt' }];
    p.legend(items, { right: exit != null && exit < p.left + p.plotW / 3 });
    p.frame();
  }

  // One series, up to the frame being shown. On the linear axis it stops at the
  // ceiling and leaves through the top of the panel; on the logarithmic one,
  // which reaches the whole run, `ceiling` is Infinity and it is drawn entire.
  function drawSeries(p, arr, frame, floor, ceiling, style) {
    const pts = [];
    for (let i = 0; i <= frame; i++) pts.push([(i / FRAMES) * sim.T, Math.max(arr[i], floor)]);
    return p.lineOut(pts, ceiling, style);
  }

  // The two diagnostic panels. Their whole point is comparison with the
  // Crowding Room, where the same two plots bend.
  function drawRatePanels(frame) {
    const pops = sim ? sim.pops : livePops();
    const cmp = sim ? sim.cmp : comparing();
    const nMax = Math.max(sim ? sim.peak : Math.max(...pops.map(P => P.N0)) * 10, 10);
    const at = P => (sim && frame != null ? P.runs[0][frame] : null);

    const pc = plots.pc;
    const span = Math.max(...pops.map(P => Math.abs(P.r)), 0.1) * 1.4;
    pc.begin({ height: 180, padL: 56, xMin: 0, xMax: nMax, yMin: -span, yMax: span,
               xLabel: 'Population size N', yLabel: '(dN/dt)/N' });
    pc.grid({ yTicks: 4 });
    pc.hline(0, { color: LAB.C.ink, dash: [], width: 1, alpha: 0.5 });
    pops.forEach(P => {
      pc.line([[0, P.r], [nMax, P.r]], { color: P.color, width: 2.5 });
      // with two lines the second label goes to the right-hand end, so the two
      // never collide however close the rates are
      const rightEnd = cmp && P.k === 2;
      pc.text(nMax * (rightEnd ? 0.98 : 0.02), P.r,
              `${cmp ? 'r' + (P.k === 1 ? '₁' : '₂') : 'r'} = ${P.r.toFixed(2)}`,
              { color: P.color, baseline: 'bottom', align: rightEnd ? 'right' : 'left' });
      const N = at(P);
      if (N != null) pc.dot(N, P.r, { color: LAB.C.ink, r: 4 });
    });
    pc.frame();

    const dn = plots.dndt;
    const yMax = Math.max(...pops.map(P => Math.abs(P.r) * nMax), 1) * 1.15;
    const anyFalling = pops.some(P => P.r < 0);
    dn.begin({ height: 180, padL: 56, xMin: 0, xMax: nMax,
               yMin: anyFalling ? -yMax : 0, yMax: anyFalling ? yMax * 0.15 : yMax,
               xLabel: 'Population size N', yLabel: 'dN/dt' });
    dn.grid({ yTicks: 4 });
    dn.hline(0, { color: LAB.C.ink, dash: [], width: 1, alpha: 0.5 });
    pops.forEach(P => {
      dn.line([[0, 0], [nMax, P.r * nMax]], { color: P.color, width: 2.5 });
      const N = at(P);
      if (N != null) dn.dot(N, P.r * N, { color: LAB.C.ink, r: 4 });
    });
    dn.frame();
  }

  function render(frame) {
    if (!sim) {
      drawPopField(0);
      plots.chart.begin({ height: 300, xMin: 0, xMax: ui.T.value, yMin: 0, yMax: 100,
                          xLabel: 'Time', yLabel: 'Population size N' }).grid().frame();
      drawRatePanels(null);
      return;
    }
    const t = (frame / FRAMES) * sim.T;
    drawPopField(frame);
    drawChart(frame);
    drawRatePanels(frame);

    ui.tDisp.textContent = LAB.fmt(t, 1);
    sim.pops.forEach(P => { ui.nDisp[P.k - 1].textContent = LAB.fmtBig(P.runs[0][frame]); });

    const A = sim.pops[0];
    if (sim.cmp) {
      const B = sim.pops[1];
      ui.chartStat.textContent = `N₁ ${LAB.fmtBig(A.runs[0][frame])} · N₂ ${LAB.fmtBig(B.runs[0][frame])}`;
    } else {
      ui.chartStat.textContent = A.runs.length === 1
        ? `predicted ${LAB.fmtBig(A.det[frame])} · observed ${LAB.fmtBig(A.runs[0][frame])}`
        : `${A.runs.length} replicates · predicted ${LAB.fmtBig(A.det[frame])}`;
    }
  }

  // No history scrubber in this room. With a single monotone curve and two
  // diagnostic panels whose shape never changes, there is no second view of a
  // given instant for scrubbing to reveal — the finished chart already shows
  // every replicate's whole history at once. Pause still stops mid-run.
  const player = LAB.createPlayer({
    playBtnId: 'playBtn_growth',
    playLabel: '▶ Run', pauseLabel: '⏸ Pause',
    fps: 55,
    render,
    onEnd: finish
  });

  // Which sliders the two populations actually disagree on. A comparison in
  // which two things changed at once cannot say which one mattered, and the
  // room says so rather than leaving the reader to assume.
  function differences() {
    const [A, B] = sim.pops;
    const out = [];
    if (A.N0 !== B.N0) out.push(`N₀ (${A.N0} vs ${B.N0})`);
    if (A.b !== B.b) out.push(`b (${A.b.toFixed(2)} vs ${B.b.toFixed(2)})`);
    if (A.d !== B.d) out.push(`d (${A.d.toFixed(2)} vs ${B.d.toFixed(2)})`);
    return out;
  }

  function finish() {
    if (!sim) return;
    const A = sim.pops[0];
    ui.status.textContent = sim.cmp
      ? `done · t = ${sim.T} · N₁ = ${LAB.fmtBig(A.runs[0][FRAMES])} · N₂ = ${LAB.fmtBig(sim.pops[1].runs[0][FRAMES])}`
      : `done · t = ${sim.T} · N = ${LAB.fmtBig(A.runs[0][FRAMES])}`;

    ui.reading.innerHTML = sim.cmp ? comparisonText() : singleText(A);

    const notes = [];
    sim.pops.forEach(P => {
      if (P.r > 0) {
        const dbl = Math.log(2) / P.r;
        notes.push(`${sim.cmp ? 'Population ' + P.k + ': d' : 'D'}oubling time ${LAB.fmt(dbl, 1)} time units`
                 + ` · ${LAB.fmt(sim.T / dbl, 1)} doublings over this run.`);
      }
    });
    if (sim.raw > N_CEIL) {
      notes.push(`The linear chart stops at ${LAB.fmtInt(N_CEIL)} individuals and the curves run out through the top of it, still climbing — switch the vertical axis to logarithmic to follow them the whole way. That ceiling belongs to the panel; the model has none.`);
    }
    ui.note.textContent = notes.join(' ');
  }

  function singleText(P) {
    const finals = P.runs.map(r => r[FRAMES]);
    const mean = finals.reduce((a, b) => a + b, 0) / finals.length;
    const lo = Math.min(...finals), hi = Math.max(...finals);

    let txt;
    if (P.r > 0) {
      txt = `After ${sim.T} time units the deterministic prediction is <strong>${LAB.fmtBig(P.det[FRAMES])}</strong> individuals, `
          + `from a start of ${P.N0}. Nothing in the model ever slows this down: the curve is still accelerating at the moment it is cut off, `
          + `and it would keep accelerating for as long as you let it.`;
    } else if (P.r < 0) {
      txt = `With deaths outpacing births the population decays exponentially towards zero — the mirror image of runaway growth, and just as unstoppable within this model.`;
    } else {
      txt = `With b exactly equal to d the deterministic prediction is a flat line. The simulated populations still wander, and some of them still hit zero: with no density dependence to pull them back, a population that drifts to extinction stays extinct.`;
    }
    if (P.runs.length > 1) {
      txt += ` Across ${P.runs.length} replicates with identical parameters the final size ranged from <strong>${LAB.fmtBig(lo)}</strong> to <strong>${LAB.fmtBig(hi)}</strong> (mean ${LAB.fmtBig(mean)})`;
      txt += P.extinct > 0
        ? `, and <strong>${P.extinct}</strong> of them went extinct despite a growth rate of ${P.r.toFixed(2)}.`
        : `.`;
    } else if (finals[0] === 0) {
      txt += ` This particular population went extinct — with few individuals, a run of bad luck is enough, whatever the average says.`;
    }
    return txt;
  }

  function comparisonText() {
    const [A, B] = sim.pops;
    const a = A.runs[0][FRAMES], b = B.runs[0][FRAMES];
    const diffs = differences();

    let txt = `After ${sim.T} time units population 1 (r = ${A.r.toFixed(2)}) stands at <strong>${LAB.fmtBig(a)}</strong> `
            + `and population 2 (r = ${B.r.toFixed(2)}) at <strong>${LAB.fmtBig(b)}</strong>. `;

    if (a > 0 && b > 0) {
      const ratio = a > b ? a / b : b / a;
      txt += ratio < 1.05
        ? `They finished within a few percent of each other. `
        : `That is a <strong>${LAB.fmt(ratio, ratio < 10 ? 1 : 0)}-fold</strong> difference between them at the end of the run — `
          + `and because the gap is multiplied, not added, it keeps widening for as long as the run continues. `;
    } else if (a === 0 || b === 0) {
      txt += `Population ${a === 0 ? 1 : 2} went extinct. `;
    }

    if (diffs.length === 0) {
      txt += `The two were given <em>identical</em> parameters, so everything separating them is chance: the same model, run twice, with births and deaths drawn independently.`;
    } else if (diffs.length === 1) {
      txt += `The only parameter that differs is <strong>${diffs[0]}</strong>, so the whole gap between the curves is that one change`
           + (A.runs.length > 1 ? ` — plus whatever the noise contributed, which the spread within each colour shows.` : `, plus chance.`);
    } else {
      txt += `The two differ in <strong>${diffs.join('</strong>, <strong>')}</strong> at once, so the chart cannot say which of them is responsible for the gap. `
           + `Return one of the pair to its partner's value and the comparison becomes a controlled one.`;
    }
    return txt;
  }

  // ---------------------------------------------------------------- controls

  function onRun() {
    if (player.running) { player.pause(); return; }
    if (dirty || !sim) {
      simulate();
      ui.status.textContent = 'running…';
      ui.note.textContent = '';
    }
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
    sim = null;
    dirty = true;
    ui.status.textContent = 'Set the parameters and press Run.';
    ui.note.textContent = '';
    ui.reading.innerHTML = comparing()
      ? 'Press <strong>Run</strong>. The two populations never meet — they share the clock and nothing else — so any gap that opens between them belongs entirely to the parameters you set.'
      : 'Press <strong>Run</strong>. Each individual independently gives birth at rate <em>b</em> and dies at rate <em>d</em>, so the population grows by a factor of <em>e<sup>r</sup></em> per unit time on average — but only on average.';
    ui.chartStat.textContent = '—';
    ui.tDisp.textContent = '0';
    livePops().forEach(P => { ui.nDisp[P.k - 1].textContent = String(P.N0); });
    render(0);
  }

  LAB.ready(() => {
    buildUI();
    LAB.onClick('playBtn_growth', onRun);
    LAB.onClick('endBtn_growth', onSkip);
    LAB.onClick('resetBtn_growth', onReset);
    onRateChange();
    render(0);
    LAB.onResize(() => player.redraw());
  });
})();
