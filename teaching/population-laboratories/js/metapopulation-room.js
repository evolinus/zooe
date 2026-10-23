// THE METAPOPULATION ROOM — Levins' patch-occupancy model.
//
// The last room changes the unit. Everywhere else in the lab a population is a
// number of individuals; here it is a number of *populations*, each one living
// on a patch, each one certain to go extinct eventually. What persists is not
// any of them but the set — occupancy is held up by colonisation faster than
// extinction empties it.
//
//   dp/dt = c·p·(1 − h − p) − e·p          p* = 1 − h − e/c
//
// p is the fraction of all patches occupied, so (1 − h − p) is the fraction
// still empty and still habitable: the targets a coloniser can reach. Note what
// the equilibrium does not contain — any notion of how good a patch is, or how
// many individuals are on it. A patch is occupied or it is not.
//
// Patches are simulated one at a time rather than through the equation, because
// the room's point is that the equation's steady p is made of patches that are
// anything but steady. At equilibrium the grid keeps blinking and the two
// turnover counters keep climbing while p sits still. The deterministic
// solution is drawn alongside as a dashed line, which is the only thing the
// equation above can tell you.
//
// Levins is spatially *implicit*: patches have no positions and every patch is
// reachable from every other. The grid is therefore a tally, not a map — which
// is why habitat destruction is scattered through it by a fixed stride rather
// than taking a bite out of one side. Nothing here knows what a side is.

(function () {
  const FRAMES = 300;    // playback resolution; also the simulation's sample count
  const FIELD_H = 210;   // patch-grid height (matches .pop-wrap in the stylesheet)

  // Patch states. Destroyed patches are drawn, because the room is partly about
  // what happens when habitat stops being available, and a landscape that
  // simply got smaller would hide that.
  const EMPTY = 0, OCCUPIED = 1, DESTROYED = 2;

  let ui, plots, sim = null, dirty = true;

  // Occupancy is blue; the two processes take the lab's established pair for a
  // gain and a loss — green for colonisation, terracotta for extinction, the
  // same way the Crowding Room draws births against deaths. p* is --cap, the
  // colour this lab gives an equilibrium level.
  const C_OCC = () => LAB.C.res1;
  const C_COL = () => LAB.C.res2;
  const C_EXT = () => LAB.C.spB;

  function buildUI() {
    ui = {
      H:  LAB.slider('H_meta',  { valueId: 'HVal_meta',  format: v => String(v), onChange: markDirty }),
      p0: LAB.slider('p0_meta', { valueId: 'p0Val_meta', format: v => v.toFixed(2), onChange: markDirty }),
      c:  LAB.slider('c_meta',  { valueId: 'cVal_meta',  format: v => v.toFixed(2), onChange: onRateChange }),
      e:  LAB.slider('e_meta',  { valueId: 'eVal_meta',  format: v => v.toFixed(2), onChange: onRateChange }),
      T:  LAB.slider('T_meta',  { valueId: 'TVal_meta',  format: v => String(v), onChange: markDirty }),
      h:  LAB.slider('h_meta',  { valueId: 'hVal_meta',  format: v => v.toFixed(2), onChange: onRateChange }),
      reps: LAB.segmented('repSeg_meta', 'reps', { onChange: markDirty }),
      status: LAB.$('status_meta'),
      reading: LAB.$('reading_meta'),
      note: LAB.$('note_meta'),
      chartStat: LAB.$('chartStat_meta'),
      tDisp: LAB.$('tDisp_meta'),
      occDisp: LAB.$('occDisp_meta'),
      pDisp: LAB.$('pDisp_meta'),
      pStarDisp: LAB.$('pStarDisp_meta'),
      colDisp: LAB.$('colDisp_meta'),
      extDisp: LAB.$('extDisp_meta')
    };
    plots = {
      fieldCvs: LAB.$('fieldCanvas_meta'),
      field: LAB.$('fieldCanvas_meta').getContext('2d'),
      chart: createPlot(LAB.$('chartCanvas_meta'), { height: 300 }),
      rates: createPlot(LAB.$('ratesCanvas_meta'), { height: 190, padL: 60 }),
      dpdt: createPlot(LAB.$('dpdtCanvas_meta'), { height: 190, padL: 60 })
    };
  }

  // Every slider move redraws the room, so the panels drawn from the sliders —
  // the two rate panels — follow them at once rather than waiting for a Run.
  function markDirty() { dirty = true; player.redraw(); }

  // The run on screen still belongs to the sliders. Once one has moved, the
  // run's markers come off the rate panels: they were made on other curves.
  const fresh = () => sim && !dirty;

  // Straight off the sliders, so the rate panels and p* can be shown before
  // anything has been run — with two quantities rounded to whole patches,
  // because a landscape cannot hold a fraction of one.
  //
  // h is the realised fraction destroyed, not the one on the slider: 30% of 16
  // patches is 4.8, the landscape gets 5, and the prediction has to be made
  // about the landscape that exists rather than the one that was asked for.
  // The two agree exactly whenever h·H is a whole number, which it is at the
  // default hundred patches. n0 is clamped the same way — p₀ = 1 on a
  // half-destroyed landscape means every patch that is left, not every patch.
  function params() {
    const H = Math.round(ui.H.value);
    const h = Math.round(ui.h.value * H) / H;
    return { H, h, n0: Math.min(Math.round(ui.p0.value * H), Math.round((1 - h) * H)),
             c: ui.c.value, e: ui.e.value, T: ui.T.value };
  }

  // The equilibrium occupancy. Negative means the colonisation hump never
  // reaches the extinction line and the only equilibrium is an empty landscape,
  // so it is reported as zero rather than as a fraction below none.
  const pStar = P => Math.max(0, 1 - P.h - (P.c > 0 ? P.e / P.c : Infinity));

  // p* and the rate curves belong to the sliders alone.
  function onRateChange() {
    const P = params();
    ui.pStarDisp.textContent = P.c > P.e / Math.max(1e-9, 1 - P.h) ? pStar(P).toFixed(3) : '0 (dies out)';
    markDirty();
  }

  // ------------------------------------------------------------- simulation

  // Which patches are destroyed. Spread by stride rather than taken as a block:
  // in a spatially implicit model an index is not a place, and a solid block
  // would invite the reader to see an edge that the model does not have.
  function layout(H, h) {
    const state = new Uint8Array(H).fill(EMPTY);
    const D = Math.round(h * H);
    for (let i = 0; i < D; i++) state[Math.floor(i * H / D)] = DESTROYED;
    return state;
  }

  // One replicate, patch by patch. Each occupied patch goes extinct at rate e;
  // each empty habitable patch is colonised at rate c·p, where p is the
  // fraction of *all* patches currently occupied — that product is what makes
  // colonisation depend on how much of the landscape is already producing
  // migrants, and it is the whole reason a metapopulation can collapse.
  //
  // Sub-stepping keeps the per-patch probability per step small, so the
  // discrete-time draw stays faithful to the continuous rates it stands for.
  function runReplicate(P, keepSnapshots) {
    const { H, c, e, T } = P;
    const state = layout(H, P.h);
    const suitable = [];
    for (let i = 0; i < H; i++) if (state[i] === EMPTY) suitable.push(i);

    // The start is a count, not a probability, so p₀ = 0.10 on 100 patches is
    // always exactly 10 occupied: two replicates differ in what happens next,
    // never in what they were handed.
    const start = Math.min(suitable.length, P.n0);
    for (let i = suitable.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [suitable[i], suitable[j]] = [suitable[j], suitable[i]];
    }
    for (let i = 0; i < start; i++) state[suitable[i]] = OCCUPIED;

    const dtFrame = T / FRAMES;
    const sub = Math.max(1, Math.ceil(dtFrame * Math.max(c, e, 1e-6) / 0.05));
    const dt = dtFrame / sub;

    let occ = start, cols = 0, exts = 0;
    const occupied = new Int32Array(FRAMES + 1);
    const colonised = new Int32Array(FRAMES + 1);
    const extinguished = new Int32Array(FRAMES + 1);
    const snaps = keepSnapshots ? [state.slice()] : null;
    occupied[0] = occ;

    for (let f = 1; f <= FRAMES; f++) {
      for (let s = 0; s < sub; s++) {
        // Both draws are made against the occupancy at the start of the
        // sub-step, so a patch colonised now cannot also send out colonists
        // now. Updating in place would let a wave cross the whole landscape
        // within one step, which is an artefact of the loop order and not of
        // the model.
        const p = occ / H;
        const pExt = 1 - Math.exp(-e * dt);
        const pCol = 1 - Math.exp(-c * p * dt);
        for (let i = 0; i < H; i++) {
          if (state[i] === OCCUPIED) {
            if (Math.random() < pExt) { state[i] = EMPTY; exts++; }
          } else if (state[i] === EMPTY) {
            if (Math.random() < pCol) { state[i] = OCCUPIED; cols++; }
          }
        }
        occ = 0;
        for (let i = 0; i < H; i++) if (state[i] === OCCUPIED) occ++;
      }
      occupied[f] = occ;
      colonised[f] = cols;
      extinguished[f] = exts;
      if (snaps) snaps.push(state.slice());
    }
    return { occupied, colonised, extinguished, snaps };
  }

  // The equation's own answer, for the dashed line. Integrated rather than
  // solved so that it is visibly the same model the patches are obeying.
  function deterministic(P) {
    const out = new Float64Array(FRAMES + 1);
    const dtFrame = P.T / FRAMES;
    const sub = 8;
    const deriv = y => [P.c * y[0] * (1 - P.h - y[0]) - P.e * y[0]];
    let y = [P.n0 / P.H];
    out[0] = y[0];
    for (let f = 1; f <= FRAMES; f++) {
      for (let s = 0; s < sub; s++) y = LAB.rk4(y, dtFrame / sub, deriv);
      out[f] = LAB.clamp(y[0], 0, 1);
    }
    return out;
  }

  function simulate() {
    const P = params();
    const reps = parseInt(ui.reps.value, 10);
    const runs = [];
    for (let i = 0; i < reps; i++) runs.push(runReplicate(P, i === 0));
    sim = { P, runs, det: deterministic(P), pStar: pStar(P),
            extinct: runs.filter(r => r.occupied[FRAMES] === 0).length };
    dirty = false;
    player.load(FRAMES);
  }

  // ---------------------------------------------------------------- drawing

  // The patch grid. One cell per patch: filled when occupied, a thin outline
  // when habitable and empty, and struck through when destroyed. Cells are laid
  // out in whatever grid is squarest for the count — their arrangement carries
  // no meaning, which the panel note says out loud.
  function drawField(frame) {
    const cvs = plots.fieldCvs, ctx = plots.field;
    const W = cvs.parentElement.clientWidth || 300;
    const H = FIELD_H;
    scaleCanvas(cvs, ctx, W, H);
    ctx.clearRect(0, 0, W, H);

    const P = sim ? sim.P : params();
    const labelH = 20;
    const areaH = H - labelH;
    const state = sim ? sim.runs[0].snaps[frame] : startState(P);

    const n = state.length;
    const cols = Math.max(1, Math.round(Math.sqrt(n * W / areaH)));
    const rows = Math.ceil(n / cols);
    const cw = W / cols, ch = areaH / rows;
    const size = Math.max(3, Math.min(cw, ch) - 2.5);

    for (let i = 0; i < n; i++) {
      const x = (i % cols) * cw + (cw - size) / 2;
      const y = Math.floor(i / cols) * ch + (ch - size) / 2;
      if (state[i] === OCCUPIED) {
        ctx.fillStyle = C_OCC();
        ctx.fillRect(x, y, size, size);
      } else if (state[i] === EMPTY) {
        ctx.strokeStyle = LAB.C.rule;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      } else {
        // destroyed: a cross rather than a fainter square, so it reads as gone
        // rather than as merely empty — those are the two states the room most
        // needs to keep apart.
        ctx.strokeStyle = LAB.C.inkSoft;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + size - 1, y + size - 1);
        ctx.moveTo(x + size - 1, y + 1); ctx.lineTo(x + 1, y + size - 1);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    let occ = 0, dead = 0;
    for (let i = 0; i < n; i++) {
      if (state[i] === OCCUPIED) occ++;
      else if (state[i] === DESTROYED) dead++;
    }
    const caption = occ === 0 ? 'the metapopulation is extinct'
                  : `${occ} occupied · ${n - occ - dead} empty`
                    + (dead ? ` · ${dead} destroyed` : '');
    ctx.fillStyle = LAB.C.inkSoft;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(caption, W / 2, H - 6);
  }

  // What the landscape looks like before anything is run, so the panel is never
  // blank and moving the habitat slider shows its effect immediately.
  function startState(P) {
    const state = layout(P.H, P.h);
    let want = P.n0;
    for (let i = 0; i < P.H && want > 0; i++) {
      if (state[i] === EMPTY) { state[i] = OCCUPIED; want--; }
    }
    return state;
  }

  function drawChart(frame) {
    const p = plots.chart;
    const P = sim ? sim.P : params();
    p.begin({ height: 300, xMin: 0, xMax: P.T, yMin: 0, yMax: 1.04,
              xLabel: 'Time', yLabel: 'Fraction of patches occupied p' });
    p.grid({ yTicks: 5 });

    // The ceiling the landscape itself imposes — p can never reach above the
    // habitat that is left. Drawn before the curves so they sit on top of it,
    // and only when habitat is missing: at h = 0 it would be a line along the
    // top of the panel saying nothing.
    if (P.h > 0) {
      p.hline(1 - P.h, { color: LAB.C.inkSoft, dash: [2, 3], alpha: 0.7,
                         label: `1 − h = ${(1 - P.h).toFixed(2)}` });
    }
    if (!sim) { p.frame(); return; }

    const star = sim.pStar;
    if (star > 0) p.hline(star, { color: LAB.C.cap, label: `p* = ${star.toFixed(3)}` });

    const xs = i => (i / FRAMES) * P.T;
    const upto = (arr, scale) => {
      const pts = [];
      for (let i = 0; i <= frame; i++) pts.push([xs(i), arr[i] / scale]);
      return pts;
    };

    p.line(upto(sim.det, 1), { color: LAB.C.inkSoft, width: 1.5, dash: [6, 4], alpha: 0.85 });
    sim.runs.forEach(r => p.line(upto(r.occupied, P.H), {
      color: C_OCC(),
      width: sim.runs.length > 5 ? 1 : 2,
      alpha: sim.runs.length > 1 ? 0.6 : 1
    }));

    p.cursor(xs(frame));
    p.dot(xs(frame), sim.runs[0].occupied[frame] / P.H, { color: LAB.C.ink, r: 4 });
    p.legend([
      { color: C_OCC(), label: 'simulated patches' },
      { color: LAB.C.inkSoft, dash: [5, 3], label: 'Levins prediction' }
    ], { bottom: sim.runs[0].occupied[frame] / P.H > 0.55 });
    p.describe(`Occupancy over time. At time ${LAB.fmt(xs(frame), 1)}, `
             + `p = ${(sim.runs[0].occupied[frame] / P.H).toFixed(3)}`
             + (star > 0 ? `, against a predicted equilibrium of ${star.toFixed(3)}.`
                         : `; the predicted equilibrium is zero.`));
    p.frame();
  }

  // The mechanism, and the reason p* is where it is. Colonisation is a hump —
  // it needs occupied patches to send migrants and empty ones to receive them,
  // so it vanishes at both ends. Extinction is a straight line through the
  // origin. Where they cross, the landscape is standing still.
  //
  // Drawn from the sliders, not from the run: both curves are the equation's,
  // and the equation can be read before anything is simulated or after.
  function drawRatePanels(frame) {
    const P = params();
    const star = pStar(P);
    // Where the landscape is: the run's occupancy while the run still belongs
    // to the sliders, otherwise the starting occupancy it would set out from —
    // drawn paler, as the room draws anything that has not happened yet.
    const live = fresh() && frame != null;
    const now = live ? sim.runs[0].occupied[frame] / P.H : P.n0 / P.H;
    const mark = live ? LAB.C.ink : LAB.C.inkSoft;
    const lim = 1 - P.h;

    const col = x => P.c * x * Math.max(0, lim - x);
    const ext = x => P.e * x;

    const curve = f => {
      const pts = [];
      for (let i = 0; i <= 100; i++) { const x = i / 100; pts.push([x, f(x)]); }
      return pts;
    };
    const yMax = Math.max(P.c * lim * lim / 4, P.e, 0.02) * 1.25;

    const r = plots.rates;
    r.begin({ height: 190, padL: 60, xMin: 0, xMax: 1, yMin: 0, yMax,
              xLabel: 'Fraction occupied p', yLabel: 'Patches per unit time' });
    r.grid({ yTicks: 4 });
    if (P.h > 0) r.vline(lim, { color: LAB.C.inkSoft, dash: [2, 3], alpha: 0.6,
                                label: '1 − h', labelBottom: true });
    r.line(curve(col), { color: C_COL(), width: 2.5 });
    r.line(curve(ext), { color: C_EXT(), width: 2.5 });
    if (star > 0) {
      r.vline(star, { color: LAB.C.cap, dash: [3, 3], alpha: 0.8 });
      r.dot(star, ext(star), { color: LAB.C.cap, r: 5, ring: LAB.C.paper });
    }
    r.dot(now, col(now), { color: mark, r: 3.5 });
    r.dot(now, ext(now), { color: mark, r: 3.5 });
    r.legend([{ color: C_COL(), label: 'colonisation c·p(1−h−p)' },
              { color: C_EXT(), label: 'extinction e·p' }], { right: false });
    r.frame();

    const d = plots.dpdt;
    const net = x => col(x) - ext(x);
    // Fitted to the curve rather than to a symmetric span around zero. The two
    // halves are nothing like equal — the hump tops out well under c·(1−h)²/4
    // while the tail reaches −e at a full landscape — so a window sized for the
    // hump alone clips the tail flat against the floor, and a flat line there
    // would say dp/dt stops falling, which is the opposite of what it does.
    let lo = 0, hi = 0;
    for (let i = 0; i <= 100; i++) {
      const v = net(i / 100);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const pad = Math.max((hi - lo) * 0.12, 0.004);
    d.begin({ height: 190, padL: 60, xMin: 0, xMax: 1,
              yMin: lo - pad, yMax: hi + pad,
              xLabel: 'Fraction occupied p', yLabel: 'dp/dt' });
    d.grid({ yTicks: 4 });
    d.hline(0, { color: LAB.C.ink, dash: [], width: 1, alpha: 0.5 });
    d.line(curve(net), { color: C_OCC(), width: 2.5 });
    if (star > 0) {
      d.vline(star, { color: LAB.C.cap, dash: [3, 3], alpha: 0.8, label: 'p*' });
      d.dot(star, 0, { color: LAB.C.cap, r: 5, ring: LAB.C.paper });
    }
    d.dot(now, net(now), { color: mark, r: 3.5 });
    d.frame();
  }

  function render(frame) {
    drawField(frame);
    drawChart(frame);
    drawRatePanels(sim ? frame : null);
    if (!sim) return;

    const P = sim.P, r = sim.runs[0];
    const occ = r.occupied[frame];
    ui.tDisp.textContent = LAB.fmt((frame / FRAMES) * P.T, 1);
    ui.occDisp.textContent = `${occ} / ${P.H}`;
    ui.pDisp.textContent = (occ / P.H).toFixed(3);
    ui.colDisp.textContent = LAB.fmtInt(r.colonised[frame]);
    ui.extDisp.textContent = LAB.fmtInt(r.extinguished[frame]);
    ui.chartStat.textContent = `p ${(occ / P.H).toFixed(3)} · `
      + (sim.pStar > 0 ? `p* ${sim.pStar.toFixed(3)}` : 'p* 0');
  }

  const player = LAB.createPlayer({
    playBtnId: 'playBtn_meta',
    scrubberId: 'scrub_meta',
    scrubValueId: 'scrubVal_meta',
    scrubFormat: i => LAB.fmt((i / FRAMES) * (sim ? sim.P.T : ui.T.value), 1),
    playLabel: '▶ Run', pauseLabel: '⏸ Pause',
    fps: 45,
    render,
    onEnd: finish
  });

  // ------------------------------------------------------------------ prose

  function finish() {
    if (!sim) return;
    const P = sim.P, r = sim.runs[0];
    const occ = r.occupied[FRAMES];
    const p = occ / P.H;

    ui.status.textContent = `done · t = ${P.T} · ${occ} of ${P.H} patches occupied`;

    let txt;
    if (sim.pStar <= 0) {
      txt = `Colonisation never catches extinction: with c = ${P.c.toFixed(2)} against `
          + `e = ${P.e.toFixed(2)}${P.h > 0 ? ` on ${(100 * (1 - P.h)).toFixed(0)}% of the habitat` : ''}, `
          + `every patch that goes out is replaced too slowly, and <strong>p* is zero</strong>. `
          + `The metapopulation is not in trouble because any one of its populations is weak — `
          + `each is as likely to persist as it ever was — but because there are not enough of them `
          + `to keep the rest topped up.`;
    } else {
      txt = `Occupancy settled near <strong>p = ${p.toFixed(2)}</strong>, against a predicted `
          + `p* = ${sim.pStar.toFixed(3)} = 1 ${P.h > 0 ? `− ${P.h.toFixed(2)} ` : ''}− ${P.e.toFixed(2)}/${P.c.toFixed(2)}. `
          + `Underneath that steady number, <strong>${LAB.fmtInt(r.extinguished[FRAMES])}</strong> local `
          + `populations went extinct over the run and <strong>${LAB.fmtInt(r.colonised[FRAMES])}</strong> `
          + `new ones were founded. Nothing on the landscape is at rest; the fraction is.`;
    }
    if (sim.runs.length > 1) {
      const finals = sim.runs.map(x => x.occupied[FRAMES] / P.H);
      txt += ` Across ${sim.runs.length} replicates the final occupancy ran from `
           + `<strong>${Math.min(...finals).toFixed(2)}</strong> to <strong>${Math.max(...finals).toFixed(2)}</strong>`
           + (sim.extinct > 0 ? `, and <strong>${sim.extinct}</strong> of them lost every patch.` : `.`);
    } else if (occ === 0 && sim.pStar > 0) {
      txt += ` This particular run lost its last patch even though p* is positive — with few patches `
           + `occupied, a run of simultaneous extinctions is enough, and there is no way back from zero.`;
    }
    ui.reading.innerHTML = txt;

    const notes = [];
    if (sim.pStar > 0 && P.h === 0) {
      notes.push(`Raise the habitat destroyed slider in the drawer to h = ${sim.pStar.toFixed(2)} — `
               + `exactly the fraction of patches this species occupies — and p* reaches zero. `
               + `A species is lost when the habitat taken equals the habitat it was using, `
               + `not when the last patch of it is taken.`);
    }
    if (P.h > 0 && sim.pStar > 0) {
      notes.push(`Destroying ${(100 * P.h).toFixed(0)}% of the patches took p* from `
               + `${(1 - P.e / P.c).toFixed(3)} to ${sim.pStar.toFixed(3)} — down by `
               + `${P.h.toFixed(2)}, one for one with the habitat removed, which is more than `
               + `the share of the occupied patches that were destroyed.`);
    }
    notes.push(`Turnover over the whole run: ${LAB.fmtInt(r.colonised[FRAMES])} colonisations, `
             + `${LAB.fmtInt(r.extinguished[FRAMES])} extinctions.`);
    ui.note.textContent = notes.join(' ');
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

  function ensureSim() {
    if (dirty || !sim) { simulate(); ui.note.textContent = ''; }
  }

  function onSkip() { ensureSim(); player.showAll(); }

  function onReset() {
    player.reset();
    sim = null;
    dirty = true;
    const P = params();
    ui.status.textContent = 'Set the parameters and press Run.';
    ui.note.textContent = '';
    ui.reading.innerHTML = 'Press <strong>Run</strong>. Every occupied patch is a population '
      + 'that will go extinct sooner or later; every empty one can be reached from an occupied '
      + 'one. Watch the grid keep changing after the fraction stops.';
    ui.chartStat.textContent = '—';
    ui.tDisp.textContent = '0';
    ui.occDisp.textContent = `${P.n0} / ${P.H}`;
    ui.pDisp.textContent = (P.n0 / P.H).toFixed(3);
    ui.colDisp.textContent = '0';
    ui.extDisp.textContent = '0';
    onRateChange();
    render(0);
  }

  LAB.ready(() => {
    buildUI();
    LAB.onClick('playBtn_meta', onRun);
    LAB.onClick('endBtn_meta', onSkip);
    LAB.onClick('resetBtn_meta', onReset);
    LAB.bindSteps('meta', player, ensureSim);
    onReset();
    LAB.onResize(() => player.redraw());
  });
})();
