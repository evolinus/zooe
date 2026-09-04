// THE RESOURCE ROOM — where the carrying capacity actually comes from.
//
// A MacArthur-style consumer–resource model with an abiotic, chemostat-like
// resource:
//
//     dR/dt = S − l·R − a·R·N
//     dN/dt = N·(e·a·R − m)
//
// Nothing called "K" appears anywhere in it, yet the consumer population
// settles on a definite number. Setting dN/dt = 0 gives the break-even resource
// level R* = m/(e·a) — a property of the consumer alone — and substituting that
// into dR/dt = 0 gives the abundance the environment can support,
// N* = (S − l·R*)/(a·R*). Enrich the environment and N* rises while R* does not
// budge, which is the fact Room 6 turns into a rule for who wins a competition.

(function () {
  const FRAMES = 400;
  const EXTINCT = 0.25;   // consumers below this are treated as gone

  let ui, plots, sim = null, dirty = true;

  function buildUI() {
    ui = {
      S:  LAB.slider('S_res',  { valueId: 'SVal_res',  format: v => v.toFixed(1), onChange: onParam }),
      l:  LAB.slider('l_res',  { valueId: 'lVal_res',  format: v => v.toFixed(2), onChange: onParam }),
      R0: LAB.slider('R0_res', { valueId: 'R0Val_res', format: v => String(v), onChange: markDirty }),
      a:  LAB.slider('a_res',  { valueId: 'aVal_res',  format: v => v.toFixed(3), onChange: onParam }),
      e:  LAB.slider('e_res',  { valueId: 'eVal_res',  format: v => v.toFixed(2), onChange: onParam }),
      m:  LAB.slider('m_res',  { valueId: 'mVal_res',  format: v => v.toFixed(2), onChange: onParam }),
      N0: LAB.slider('N0_res', { valueId: 'N0Val_res', format: v => String(v), onChange: markDirty }),
      T:  LAB.slider('T_res',  { valueId: 'TVal_res',  format: v => String(v), onChange: markDirty }),
      shift:  LAB.segmented('shiftSeg_res', 'shift', { onChange: markDirty }),
      shiftF: LAB.slider('shiftF_res', { valueId: 'shiftFVal_res', format: v => v.toFixed(2), onChange: markDirty }),
      status: LAB.$('status_res'),
      reading: LAB.$('reading_res'),
      note: LAB.$('note_res'),
      rStar: LAB.$('rStarDisp_res'),
      nStar: LAB.$('nStarDisp_res'),
      rNow: LAB.$('rNowDisp_res'),
      nNow: LAB.$('nNowDisp_res'),
      tDisp: LAB.$('tDisp_res'),
      perCap: LAB.$('perCapDisp_res'),
      rStarNote: LAB.$('rStarNote_res')
    };
    plots = {
      R: createPlot(LAB.$('chartR_res'), { height: 240 }),
      N: createPlot(LAB.$('chartN_res'), { height: 240 }),
      phase: createPlot(LAB.$('phase_res'), { height: 300, padL: 58 })
    };
  }

  function markDirty() { dirty = true; }

  // R* and N* are pure algebra, so they can be shown the moment a slider moves.
  function onParam() {
    markDirty();
    const eq = equilibrium(ui.S.value);
    ui.rStar.textContent = LAB.fmt(eq.Rstar, 2);
    ui.nStar.textContent = eq.viable ? LAB.fmt(eq.Nstar, 0) : 'none';
    ui.rStarNote.innerHTML = eq.viable
      ? 'R* = m / (e·a) — notice that the supply rate S is nowhere in it. Enriching the environment raises how many consumers it holds, never the resource level they leave behind.'
      : `R* = ${LAB.fmt(eq.Rstar, 2)} is higher than the resource level the environment reaches even with no consumers at all (S/l = ${LAB.fmt(eq.Rmax, 2)}). This consumer cannot persist here: raise the supply, raise the attack rate or efficiency, or lower the mortality.`;
    if (!sim) render(0);
  }

  function equilibrium(S) {
    const a = ui.a.value, e = ui.e.value, m = ui.m.value, l = ui.l.value;
    const Rstar = m / (e * a);
    const Rmax = l > 0 ? S / l : Infinity;
    const Nstar = (S - l * Rstar) / (a * Rstar);
    return { Rstar, Nstar, Rmax, viable: Nstar > 0 };
  }

  // ------------------------------------------------------------- simulation

  function simulate() {
    const S0 = ui.S.value, l = ui.l.value, a = ui.a.value, e = ui.e.value, m = ui.m.value;
    const T = ui.T.value;
    const shifted = ui.shift.value === 'on';
    const shiftT = T / 2, shiftF = ui.shiftF.value;

    const sub = 10;
    const dt = T / FRAMES / sub;
    const supplyAt = t => (shifted && t >= shiftT) ? S0 * shiftF : S0;

    let R = ui.R0.value, N = ui.N0.value, t = 0;
    const Rs = new Float64Array(FRAMES + 1), Ns = new Float64Array(FRAMES + 1);
    Rs[0] = R; Ns[0] = N;

    for (let f = 1; f <= FRAMES; f++) {
      for (let s = 0; s < sub; s++) {
        const S = supplyAt(t);
        const y = LAB.rk4([R, N], dt, ([r, n]) => [
          S - l * r - a * r * n,
          n * (e * a * r - m)
        ]);
        R = Math.max(0, y[0]);
        N = y[1] < EXTINCT ? 0 : y[1];
        t += dt;
      }
      Rs[f] = R; Ns[f] = N;
    }

    const eqBefore = equilibrium(S0);
    const eqAfter = equilibrium(S0 * shiftF);

    let rPeak = 0, nPeak = 0, nPeakT = 0;
    for (let f = 0; f <= FRAMES; f++) {
      rPeak = Math.max(rPeak, Rs[f]);
      if (Ns[f] > nPeak) { nPeak = Ns[f]; nPeakT = (f / FRAMES) * T; }
    }

    // Count how often the resource crosses R*. Each crossing is a turning point
    // in the consumer curve, so the count is also the number of overshoot-and-
    // correct swings — and zero means the approach was monotone.
    let crossings = 0;
    const limit = shifted ? Math.floor(FRAMES / 2) : FRAMES;
    for (let f = 1; f <= limit; f++) {
      if ((Rs[f - 1] - eqBefore.Rstar) * (Rs[f] - eqBefore.Rstar) < 0) crossings++;
    }

    sim = { Rs, Ns, T, S0, l, a, e, m, shifted, shiftT, shiftF,
            eq: eqBefore, eq2: eqAfter, rPeak, nPeak, nPeakT, crossings };
    dirty = false;
    player.load(FRAMES);
  }

  // ---------------------------------------------------------------- drawing

  function seriesPts(arr, frame, T) {
    const pts = [];
    for (let i = 0; i <= frame; i++) pts.push([(i / FRAMES) * T, arr[i]]);
    return pts;
  }

  function drawR(frame) {
    const p = plots.R;
    const T = sim ? sim.T : ui.T.value;
    const eq = sim ? sim.eq : equilibrium(ui.S.value);
    const yMax = Math.max(sim ? sim.rPeak : ui.R0.value, eq.Rstar, 1) * 1.2;
    p.begin({ height: 240, xMin: 0, xMax: T, yMin: 0, yMax, xLabel: 'Time', yLabel: 'Resource R' });
    p.grid();
    p.hline(eq.Rstar, { color: LAB.C.cap, label: 'R* = ' + LAB.fmt(eq.Rstar, 1) });
    if (!sim) { p.frame(); return; }
    if (sim.shifted) p.vline(sim.shiftT, { color: LAB.C.stamp, dash: [3, 3], label: 'supply changes' });
    p.area(seriesPts(sim.Rs, frame, sim.T), { color: LAB.C.res1, alpha: 0.14 });
    p.line(seriesPts(sim.Rs, frame, sim.T), { color: LAB.C.res1, width: 2.2 });
    p.cursor((frame / FRAMES) * sim.T);
    p.dot((frame / FRAMES) * sim.T, sim.Rs[frame], { color: LAB.C.res1, r: 4, ring: LAB.C.paper });
    p.frame();
  }

  function drawN(frame) {
    const p = plots.N;
    const T = sim ? sim.T : ui.T.value;
    const eq = sim ? sim.eq : equilibrium(ui.S.value);
    const yMax = Math.max(sim ? sim.nPeak : ui.N0.value, eq.viable ? eq.Nstar : 0, 5) * 1.2;
    p.begin({ height: 240, xMin: 0, xMax: T, yMin: 0, yMax, xLabel: 'Time', yLabel: 'Consumers N' });
    p.grid();
    if (eq.viable) p.hline(eq.Nstar, { color: LAB.C.cap, label: 'N* = ' + LAB.fmt(eq.Nstar, 0) });
    if (!sim) { p.frame(); return; }
    if (sim.shifted) {
      p.vline(sim.shiftT, { color: LAB.C.stamp, dash: [3, 3], label: 'supply changes' });
      if (sim.eq2.viable) p.hline(sim.eq2.Nstar, { color: LAB.C.cap, dash: [2, 4], alpha: 0.6, label: 'new N*' });
    }
    p.area(seriesPts(sim.Ns, frame, sim.T), { color: LAB.C.stamp, alpha: 0.14 });
    p.line(seriesPts(sim.Ns, frame, sim.T), { color: LAB.C.stamp, width: 2.2 });
    p.cursor((frame / FRAMES) * sim.T);
    p.dot((frame / FRAMES) * sim.T, sim.Ns[frame], { color: LAB.C.stamp, r: 4, ring: LAB.C.paper });
    p.frame();
  }

  // Resource on the x-axis, consumers on the y-axis. The two nullclines say
  // where each variable stops changing; where they cross, both do.
  function drawPhase(frame) {
    const p = plots.phase;
    const eq = sim ? sim.eq : equilibrium(ui.S.value);
    const S = sim ? sim.S0 : ui.S.value;
    const l = ui.l.value, a = ui.a.value;
    const xMax = Math.max(sim ? sim.rPeak : ui.R0.value, eq.Rstar * 2, 1) * 1.15;
    const yMax = Math.max(sim ? sim.nPeak : ui.N0.value, eq.viable ? eq.Nstar : 0, 5) * 1.2;

    p.begin({ height: 300, padL: 58, xMin: 0, xMax, yMin: 0, yMax,
              xLabel: 'Resource R', yLabel: 'Consumers N' });
    p.grid();

    // dR/dt = 0  ⇒  N = (S − l·R)/(a·R)
    const nullR = [];
    for (let i = 1; i <= 200; i++) {
      const R = (i / 200) * xMax;
      const N = (S - l * R) / (a * R);
      if (N >= 0 && N <= yMax * 3) nullR.push([R, N]);
    }
    p.line(nullR, { color: LAB.C.res1, width: 1.8, dash: [7, 4] });
    // dN/dt = 0  ⇒  R = R*
    p.vline(eq.Rstar, { color: LAB.C.stamp, dash: [7, 4], width: 1.8, label: 'R = R*' });

    if (sim) {
      const traj = [];
      for (let i = 0; i <= frame; i++) traj.push([sim.Rs[i], sim.Ns[i]]);
      p.line(traj, { color: LAB.C.ink, width: 1.6, alpha: 0.85 });
      p.dot(sim.Rs[0], sim.Ns[0], { color: LAB.C.inkSoft, r: 3.5 });
      p.dot(sim.Rs[frame], sim.Ns[frame], { color: LAB.C.ink, r: 5, ring: LAB.C.paper });
    }
    if (eq.viable) p.dot(eq.Rstar, eq.Nstar, { color: LAB.C.cap, r: 6, ring: LAB.C.paper });
    p.legend([
      { color: LAB.C.res1, dash: [5, 3], label: 'resource unchanging' },
      { color: LAB.C.stamp, dash: [5, 3], label: 'consumers unchanging' },
      { color: LAB.C.ink, label: 'trajectory' }
    ]);
    p.frame();
  }

  function render(frame) {
    drawR(frame); drawN(frame); drawPhase(frame);
    if (!sim) {
      ui.rNow.textContent = LAB.fmt(ui.R0.value, 1);
      ui.nNow.textContent = LAB.fmt(ui.N0.value, 0);
      ui.perCap.textContent = LAB.fmt(ui.R0.value / Math.max(ui.N0.value, 1), 2);
      return;
    }
    const R = sim.Rs[frame], N = sim.Ns[frame];
    ui.tDisp.textContent = LAB.fmt((frame / FRAMES) * sim.T, 0);
    ui.rNow.textContent = LAB.fmt(R, 2);
    ui.nNow.textContent = LAB.fmt(N, 0);
    ui.perCap.textContent = N > 0 ? LAB.fmt(R / N, 3) : '—';
  }

  const player = LAB.createPlayer({
    scrubberId: 'scrub_res',
    scrubValueId: 'scrubVal_res',
    playBtnId: 'playBtn_res',
    playLabel: '▶ Run', pauseLabel: '⏸ Pause',
    fps: 70,
    scrubFormat: i => sim ? LAB.fmt((i / FRAMES) * sim.T, 0) : '0',
    render,
    onEnd: finish
  });

  function finish() {
    if (!sim) return;
    const R = sim.Rs[FRAMES], N = sim.Ns[FRAMES];
    const eq = sim.shifted ? sim.eq2 : sim.eq;
    ui.status.textContent = `done · R = ${LAB.fmt(R, 2)} · N = ${LAB.fmt(N, 0)}`;

    let txt;
    if (N === 0) {
      txt = `The consumers went extinct. Their break-even level R* = ${LAB.fmt(sim.eq.Rstar, 2)} is above the resource concentration this environment can sustain, so even an empty world does not hold enough food for them to replace themselves. `
          + `Persistence is not about how much a species eats but about how little it can survive on.`;
    } else {
      txt = `The consumers settled near <strong>${LAB.fmt(eq.Nstar, 0)}</strong> individuals, having ground the resource down from a peak of ${LAB.fmt(sim.rPeak, 1)} to <strong>${LAB.fmt(eq.Rstar, 2)}</strong>. `
          + `That second number is R*, and it is fixed entirely by the consumer's own mortality and efficiency: m/(e·a) = ${LAB.fmt(sim.m, 2)}/(${LAB.fmt(sim.e, 2)}×${LAB.fmt(sim.a, 3)}). `
          + `Double the supply and you double the consumers, but R* will not move by a hair.`;
      // Whether the approach oscillated is a property of the parameters, so the
      // room reports what this particular run actually did rather than assuming.
      const overshoot = sim.nPeak / (eq.Nstar || 1);
      if (sim.crossings > 0 && overshoot > 1.02) {
        txt += ` Notice how it got there: the population climbed to <strong>${LAB.fmt(sim.nPeak, 0)}</strong> at t ≈ ${LAB.fmt(sim.nPeakT, 0)} — ${LAB.fmt((overshoot - 1) * 100, 0)}% above the level the environment can actually hold — before falling back and oscillating in. `
             + `Consumers keep breeding for as long as the resource is above R*, so by the time the resource has been drawn down there are already too many of them. `
             + `Push the resource loss rate l past the mortality m and this overshoot disappears — but raise the supply S along with it, or the resource will no longer reach R* at all and the consumer will simply die out.`;
      } else {
        txt += ` This particular run slid into equilibrium without ever overshooting it: the resource decays fast enough on its own (l = ${LAB.fmt(sim.l, 2)}, against a mortality of ${LAB.fmt(sim.m, 2)}) that no exploitable surplus ever builds up. `
             + `Bring l back below m, keeping S/l comfortably above R*, and the same model oscillates instead.`;
      }
    }
    if (sim.shifted) {
      const dir = sim.shiftF < 1 ? 'cut' : 'raised';
      txt += ` Halfway through the run the supply was ${dir} to ${LAB.fmt(sim.shiftF * 100, 0)}% of its original value, and the population followed it to a new level`;
      txt += sim.eq2.viable ? ` of about ${LAB.fmt(sim.eq2.Nstar, 0)} — the same species, the same traits, a different carrying capacity.`
                            : ` — in this case, extinction. The species did not change; its environment did.`;
    }
    ui.reading.innerHTML = txt;

    ui.note.textContent = N > 0
      ? `Resource per consumer at equilibrium: ${LAB.fmt(R / N, 3)}. Every consumer added takes a share out of everyone else's — intraspecific competition, now with a currency attached.`
      : '';
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
    ui.tDisp.textContent = '0';
    ui.reading.innerHTML = 'Press <strong>Run</strong>. Watch the two panels side by side: every time the consumer curve turns over, the resource is crossing its R* line at that same instant. That is not a coincidence — it is the second equation with dN/dt set to zero.';
    render(0);
  }

  LAB.ready(() => {
    buildUI();
    LAB.onClick('playBtn_res', onRun);
    LAB.onClick('endBtn_res', onSkip);
    LAB.onClick('resetBtn_res', onReset);
    LAB.bindSteps('res', player, ensureSim);
    onParam();
    render(0);
    LAB.onResize(() => player.redraw());
  });
})();
