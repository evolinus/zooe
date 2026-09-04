// THE OVERSHOOT ROOM — density dependence with a one-generation delay.
//
// Continuous models let a population feel its own crowding instantly. Seasonal
// breeders cannot: this year's density fixes next year's recruitment and
// nothing adjusts in between. Three standard discrete maps are offered, and the
// difference between them is entirely about what happens when a cohort
// overshoots K:
//
//   Ricker (scramble)  — everyone shares equally, so a big overshoot leaves
//                        almost nothing for anyone and the crash is severe.
//   Beverton–Holt (contest) — winners get a full share and losers get none, so
//                        recruitment saturates instead of collapsing. This map
//                        is monotone: it cannot cycle at any parameter value.
//   Discrete logistic  — the May map, kept for its historical role.
//
// Nothing random is added anywhere in this room. Everything on screen, up to
// and including the chaos, is produced by the density dependence itself.

(function () {
  const BIF_COLS = 400, BIF_TRANSIENT = 300, BIF_PLOT = 120;

  const MODELS = {
    ricker: {
      label: 'Ricker (scramble competition)',
      eq: 'N<sub>t+1</sub> = N<sub>t</sub>·e<sup><span class="var">r</span>(1 − N<sub>t</sub>/<span class="var">K</span>)</sup>',
      gloss: 'Ricker — <em>scramble</em> competition. Everyone shares the resource equally, so a crowd that exceeds K leaves nearly nothing for anyone and the population crashes far below K rather than easing down to it.',
      key:
        '<dt>N<sub>t</sub></dt>'
      + '<dd>The number of individuals in generation <em>t</em>. The population is counted once per generation, not continuously — which is the whole subject of this room.</dd>'
      + '<dt>N<sub>t+1</sub></dt>'
      + '<dd>Next generation\'s number, computed entirely from this one. Nothing can adjust in between, so a crowd that overshoots K only finds out a generation later.</dd>'
      + '<dt>r</dt>'
      + '<dd>The intrinsic rate of increase, now measured <em>per generation</em>. Raise it and the population reacts more violently to the same crowding — which is what drives the whole route to chaos.</dd>'
      + '<dt>K</dt>'
      + '<dd>The carrying capacity: the density at which a generation exactly replaces itself, so N<sub>t+1</sub> = N<sub>t</sub>. The population can sit there, but nothing says it must stay.</dd>'
      + '<dt>e<sup>r(1 − N/K)</sup></dt>'
      + '<dd>The per-capita multiplier for one generation. Below K it exceeds 1 and the population grows; above K it falls below 1, and because the exponent is unbounded a big overshoot multiplies by very nearly zero.</dd>',
      step: (N, r, K) => N * Math.exp(r * (1 - N / K))
    },
    bh: {
      label: 'Beverton–Holt (contest competition)',
      eq: 'N<sub>t+1</sub> = <span class="var">R₀</span>N<sub>t</sub> / (1 + (<span class="var">R₀</span>−1)N<sub>t</sub>/<span class="var">K</span>),&nbsp; R₀ = e<sup>r</sup>',
      gloss: 'Beverton–Holt — <em>contest</em> competition. There are only so many territories, and whoever holds one breeds fully while the rest get nothing. Recruitment saturates instead of collapsing, so this population can never overshoot: it approaches K from below or above and stays there, at every growth rate.',
      key:
        '<dt>N<sub>t</sub></dt>'
      + '<dd>The number of individuals in generation <em>t</em>. The population is counted once per generation, not continuously — which is the whole subject of this room.</dd>'
      + '<dt>N<sub>t+1</sub></dt>'
      + '<dd>Next generation\'s number, computed entirely from this one. Nothing can adjust in between, so a crowd that overshoots K only finds out a generation later.</dd>'
      + '<dt>r</dt>'
      + '<dd>The intrinsic rate of increase, now measured <em>per generation</em>. Raise it and the population reacts more violently to the same crowding — which is what drives the whole route to chaos.</dd>'
      + '<dt>K</dt>'
      + '<dd>The carrying capacity: the density at which a generation exactly replaces itself, so N<sub>t+1</sub> = N<sub>t</sub>. The population can sit there, but nothing says it must stay.</dd>'
      + '<dt>R<sub>0</sub></dt>'
      + '<dd>The multiplication rate when rare, R<sub>0</sub> = e<sup>r</sup>: how many individuals one leaves in an uncrowded world. It is set by the <em>r</em> slider, not separately.</dd>'
      + '<dt>1 + (R<sub>0</sub>−1)N<sub>t</sub>/K</dt>'
      + '<dd>The denominator, and why this map cannot overshoot. Crowding divides recruitment rather than exponentiating it away, so the output saturates instead of collapsing.</dd>',
      step: (N, r, K) => { const R0 = Math.exp(r); return R0 * N / (1 + (R0 - 1) * N / K); }
    },
    logistic: {
      label: 'Discrete logistic (May map)',
      eq: 'N<sub>t+1</sub> = N<sub>t</sub> + <span class="var">r</span>N<sub>t</sub>(1 − N<sub>t</sub>/<span class="var">K</span>)',
      gloss: 'The logistic equation with time chopped into generations. Historically the map in which chaos was first noticed in ecology. It has one unbiological flaw worth knowing about: a large enough overshoot sends N below zero, at which point the run is stopped.',
      key:
        '<dt>N<sub>t</sub></dt>'
      + '<dd>The number of individuals in generation <em>t</em>. The population is counted once per generation, not continuously — which is the whole subject of this room.</dd>'
      + '<dt>N<sub>t+1</sub></dt>'
      + '<dd>Next generation\'s number, computed entirely from this one. Nothing can adjust in between, so a crowd that overshoots K only finds out a generation later.</dd>'
      + '<dt>r</dt>'
      + '<dd>The intrinsic rate of increase, now measured <em>per generation</em>. Raise it and the population reacts more violently to the same crowding — which is what drives the whole route to chaos.</dd>'
      + '<dt>K</dt>'
      + '<dd>The carrying capacity: the density at which a generation exactly replaces itself, so N<sub>t+1</sub> = N<sub>t</sub>. The population can sit there, but nothing says it must stay.</dd>'
      + '<dt>rN<sub>t</sub>(1 − N<sub>t</sub>/K)</dt>'
      + '<dd>The increment added to this generation to get the next — the logistic equation\'s growth term, applied in one jump instead of continuously. It is what a large overshoot can drive past zero, ending the run.</dd>',
      step: (N, r, K) => N + r * N * (1 - N / K)
    }
  };

  let ui, plots, sim = null, dirty = true, bif = null, bifKey = '';

  function buildUI() {
    ui = {
      model: LAB.segmented('modelSeg_over', 'model', { onChange: onModelChange }),
      r: LAB.slider('r_over', { valueId: 'rVal_over', format: v => v.toFixed(2), onChange: markDirty }),
      K: LAB.slider('K_over', { valueId: 'KVal_over', format: v => String(v), onChange: markDirty }),
      n0: LAB.slider('n0_over', { valueId: 'n0Val_over', format: v => String(v), onChange: markDirty }),
      gens: LAB.slider('gens_over', { valueId: 'gensVal_over', format: v => String(v), onChange: markDirty }),
      sens: LAB.segmented('sensSeg_over', 'sens', { onChange: markDirty }),
      status: LAB.$('status_over'),
      reading: LAB.$('reading_over'),
      note: LAB.$('note_over'),
      chartStat: LAB.$('chartStat_over'),
      verdict: LAB.$('verdict_over'),
      eqText: LAB.$('eqText_over'),
      eqGloss: LAB.$('eqGloss_over'),
      eqKey: LAB.$('eqKey_over')
    };
    plots = {
      series: createPlot(LAB.$('chart_over'), { height: 290 }),
      cobweb: createPlot(LAB.$('cobweb_over'), { height: 290, padL: 52, padR: 14 }),
      bifur: createPlot(LAB.$('bifur_over'), { height: 260, padL: 52 })
    };
  }

  function markDirty() { dirty = true; }

  function onModelChange() {
    const M = MODELS[ui.model.value];
    ui.eqText.innerHTML = M.eq;
    ui.eqGloss.innerHTML = M.gloss;
    ui.eqKey.innerHTML = M.key;
    markDirty();
    bif = null;
    render(player.frame);
  }

  // ------------------------------------------------------------- simulation

  function iterate(N0, r, K, gens, step) {
    const out = new Float64Array(gens + 1);
    let N = N0;
    out[0] = N;
    for (let g = 1; g <= gens; g++) {
      N = step(N, r, K);
      if (!isFinite(N) || N < 0) { for (let k = g; k <= gens; k++) out[k] = 0; return { series: out, crashed: true }; }
      out[g] = N;
    }
    return { series: out, crashed: false };
  }

  function simulate() {
    const M = MODELS[ui.model.value];
    const r = ui.r.value, K = ui.K.value, gens = ui.gens.value;
    const main = iterate(ui.n0.value, r, K, gens, M.step);
    // The twin differs by a thousandth of an individual — undetectable in any
    // real census, and irrelevant unless the dynamics amplify it.
    const twin = ui.sens.value === 'on' ? iterate(ui.n0.value + 0.001, r, K, gens, M.step) : null;

    let peak = K;
    main.series.forEach(v => { if (v > peak) peak = v; });
    if (twin) twin.series.forEach(v => { if (v > peak) peak = v; });

    sim = { M, r, K, gens, series: main.series, crashed: main.crashed,
            twin: twin ? twin.series : null, peak };
    dirty = false;
    player.load(gens);
  }

  // Iterate the map to its attractor for many growth rates at once. Cheap
  // enough (roughly 170 000 map evaluations) to recompute whenever the model or
  // the canvas width changes.
  function buildBifurcation() {
    const M = MODELS[ui.model.value];
    const rMin = parseFloat(LAB.$('r_over').min), rMax = parseFloat(LAB.$('r_over').max);
    const cols = [];
    for (let c = 0; c < BIF_COLS; c++) {
      const r = rMin + (rMax - rMin) * (c / (BIF_COLS - 1));
      let x = 0.4;                       // relative density N/K
      let dead = false;
      for (let i = 0; i < BIF_TRANSIENT; i++) {
        x = M.step(x, r, 1);
        if (!isFinite(x) || x < 0) { dead = true; break; }
      }
      const vals = [];
      if (!dead) {
        for (let i = 0; i < BIF_PLOT; i++) {
          x = M.step(x, r, 1);
          if (!isFinite(x) || x < 0) break;
          vals.push(x);
        }
      }
      cols.push({ r, vals });
    }
    bif = { cols, rMin, rMax };
    bifKey = ui.model.value;
  }

  // Classify the tail of the series: a period-p cycle repeats every p
  // generations to within a tolerance scaled by K.
  function classify(series, K) {
    const start = Math.floor(series.length * 0.66);
    const tail = Array.from(series.slice(start));
    if (tail.some(v => v === 0)) return { kind: 'extinct' };
    const tol = K * 0.002;
    for (let p = 1; p <= 8; p++) {
      let ok = true;
      for (let i = p; i < tail.length; i++) {
        if (Math.abs(tail[i] - tail[i - p]) > tol) { ok = false; break; }
      }
      if (ok) {
        const lo = Math.min(...tail), hi = Math.max(...tail);
        return { kind: p === 1 ? 'stable' : 'cycle', period: p, lo, hi };
      }
    }
    return { kind: 'chaos', lo: Math.min(...tail), hi: Math.max(...tail) };
  }

  // ---------------------------------------------------------------- drawing

  function drawSeries(frame) {
    const p = plots.series;
    const K = sim ? sim.K : ui.K.value;
    const gens = sim ? sim.gens : ui.gens.value;
    const yMax = Math.max(sim ? sim.peak : K, K) * 1.15;
    p.begin({ height: 290, xMin: 0, xMax: gens, yMin: 0, yMax,
              xLabel: 'Generation', yLabel: 'Population size N' });
    p.grid();
    p.hline(K, { color: LAB.C.cap, label: 'K = ' + LAB.fmtInt(K) });
    if (!sim) { p.frame(); return; }

    const pts = [], twinPts = [];
    for (let i = 0; i <= frame; i++) {
      pts.push([i, sim.series[i]]);
      if (sim.twin) twinPts.push([i, sim.twin[i]]);
    }
    if (sim.twin) p.line(twinPts, { color: LAB.C.res1, width: 1.6, alpha: 0.85 });
    p.line(pts, { color: LAB.C.spB, width: 1.8 });
    // Individual generations only stay legible below a few dozen points.
    if (gens <= 120) {
      const step = gens <= 60 ? 1 : 2;
      for (let i = 0; i <= frame; i += step) p.dot(i, sim.series[i], { color: LAB.C.spB, r: 2.4 });
    }
    p.dot(frame, sim.series[frame], { color: LAB.C.ink, r: 4.5, ring: LAB.C.paper });
    if (sim.twin) {
      p.legend([{ color: LAB.C.spB, label: 'N₀ = ' + LAB.fmt(ui.n0.value, 3) },
                { color: LAB.C.res1, label: 'N₀ = ' + LAB.fmt(ui.n0.value + 0.001, 3) }], { right: false });
    }
    p.frame();
  }

  // The map itself, plus the diagonal, plus the staircase the run walks.
  function drawCobweb(frame) {
    const p = plots.cobweb;
    const M = sim ? sim.M : MODELS[ui.model.value];
    const r = sim ? sim.r : ui.r.value;
    const K = sim ? sim.K : ui.K.value;
    const hi = Math.max(sim ? sim.peak : K * 1.4, K * 1.4);

    p.begin({ height: 290, padL: 52, padR: 14, xMin: 0, xMax: hi, yMin: 0, yMax: hi,
              xLabel: 'N this generation', yLabel: 'N next generation' });
    p.grid({ xTicks: 4, yTicks: 4 });
    p.line([[0, 0], [hi, hi]], { color: LAB.C.inkSoft, width: 1, dash: [4, 4], alpha: 0.7 });

    const curve = [];
    for (let i = 0; i <= 220; i++) {
      const x = (i / 220) * hi;
      const y = M.step(x, r, K);
      curve.push([x, isFinite(y) ? Math.max(0, y) : 0]);
    }
    p.line(curve, { color: LAB.C.spB, width: 2 });
    p.vline(K, { color: LAB.C.cap, dash: [3, 3], alpha: 0.7 });
    p.hline(K, { color: LAB.C.cap, dash: [3, 3], alpha: 0.7 });

    if (sim && frame > 0) {
      const stair = [[sim.series[0], 0]];
      for (let i = 0; i < frame; i++) {
        stair.push([sim.series[i], sim.series[i + 1]]);
        stair.push([sim.series[i + 1], sim.series[i + 1]]);
      }
      p.line(stair, { color: LAB.C.ink, width: 1, alpha: 0.75 });
      p.dot(sim.series[frame], frame < sim.gens ? sim.series[frame + 1] : sim.series[frame],
            { color: LAB.C.ink, r: 4, ring: LAB.C.paper });
    }
    p.frame();
  }

  function drawBifurcation() {
    if (!bif || bifKey !== ui.model.value) buildBifurcation();
    const p = plots.bifur;
    const yMax = 2.6;
    p.begin({ height: 260, padL: 52, xMin: bif.rMin, xMax: bif.rMax, yMin: 0, yMax,
              xLabel: 'Growth parameter r', yLabel: 'Long-run N / K' });
    p.grid({ xTicks: 7, yTicks: 5 });

    const ctx = p.ctx;
    ctx.save();
    ctx.fillStyle = LAB.C.ink;
    ctx.globalAlpha = 0.42;
    bif.cols.forEach(col => {
      const x = p.px(col.r);
      col.vals.forEach(v => {
        if (v > yMax) return;
        ctx.fillRect(x, p.py(v), 1, 1);
      });
    });
    ctx.restore();

    p.hline(1, { color: LAB.C.cap, dash: [3, 3], alpha: 0.5, label: 'N = K' });
    p.vline(ui.r.value, { color: LAB.C.stamp, dash: [], width: 1.5, alpha: 0.95, label: 'r = ' + ui.r.value.toFixed(2) });
    p.frame();
  }

  function render(frame) {
    drawSeries(frame);
    drawCobweb(frame);
    drawBifurcation();
    if (sim) {
      ui.chartStat.textContent = `gen ${frame} · N = ${LAB.fmt(sim.series[frame], 1)} · N/K = ${(sim.series[frame] / sim.K).toFixed(2)}`;
    }
  }

  const player = LAB.createPlayer({
    scrubberId: 'scrub_over',
    scrubValueId: 'scrubVal_over',
    playBtnId: 'playBtn_over',
    playLabel: '▶ Run', pauseLabel: '⏸ Pause',
    fps: 14,
    render,
    onEnd: finish
  });

  function finish() {
    if (!sim) return;
    const c = classify(sim.series, sim.K);
    ui.status.textContent = `done · ${sim.gens} generations`;

    let title, body;
    if (sim.crashed) {
      title = 'Crashed to extinction';
      body = `The discrete logistic sent the population below zero — an artefact of that particular equation, not of density dependence in general, and the reason ecologists usually prefer the Ricker map for scramble competition. Lower r, or switch model.`;
    } else if (c.kind === 'extinct') {
      title = 'Extinct';
      body = `The population reached zero and, with no immigration, stayed there.`;
    } else if (c.kind === 'stable') {
      title = 'Settles at a single value';
      body = `The population converges on ${LAB.fmt(c.lo, 1)} and stays there — a stable equilibrium. `
           + (sim.M === MODELS.ricker
              ? `With r below 2 the Ricker map's overshoot is not violent enough to be self-sustaining, so the wobbles die away.`
              : `Contest competition never overshoots, so this is the only behaviour Beverton–Holt can produce, whatever r you choose.`);
    } else if (c.kind === 'cycle') {
      title = `A ${c.period}-generation cycle`;
      body = `The population never settles: it repeats a ${c.period}-point cycle, alternating between ${LAB.fmt(c.lo, 0)} and ${LAB.fmt(c.hi, 0)}. `
           + `Nothing external is driving this rhythm — no predator, no weather. The cycle is generated by the population overshooting K, crashing, and overshooting again.`;
    } else {
      title = 'Chaotic';
      body = `The series never repeats, ranging between ${LAB.fmt(c.lo, 0)} and ${LAB.fmt(c.hi, 0)} with no discernible period. `
           + `It is nevertheless completely deterministic: the same N₀ always gives the same series, to the last digit.`;
    }
    ui.verdict.innerHTML = `<h4>${title}</h4><p>${body}</p>`;

    if (sim.twin) {
      const gap = Math.abs(sim.series[sim.gens] - sim.twin[sim.gens]);
      const rel = gap / sim.K;
      ui.verdict.innerHTML += `<p><strong>Sensitivity test.</strong> Two populations that began 0.001 individuals apart ended `
        + (rel > 0.05
            ? `<strong>${LAB.fmt(gap, 0)}</strong> individuals apart — a difference of ${LAB.fmt(rel * 100, 0)}% of K, from a starting difference no census could ever detect. Long-range prediction is impossible here, and not for want of a better model.`
            : `just ${LAB.fmt(gap, 3)} individuals apart. The dynamics absorbed the difference rather than amplifying it, so this population is predictable indefinitely.`)
        + `</p>`;
    }

    ui.reading.innerHTML = c.kind === 'chaos'
      ? `This is what makes chaos worth teaching: the population is <em>entirely rule-governed</em> and <em>entirely unpredictable</em> at the same time. Both statements are true, and neither one is about measurement error. Try the same r under Beverton–Holt to see that the ingredient responsible is overcompensation, not complexity.`
      : `Raise the growth parameter a little and run again. Under Ricker the approach to K first wobbles, then splits into a two-generation cycle near r = 2, then doubles again, and by about r = 2.7 stops repeating altogether. Under Beverton–Holt none of this ever happens.`;

    ui.note.textContent = `Model: ${sim.M.label} · r = ${sim.r.toFixed(2)} · K = ${LAB.fmtInt(sim.K)} · final N = ${LAB.fmt(sim.series[sim.gens], 1)}`;
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
    ui.verdict.innerHTML = '<h4>Not yet run</h4><p>Press Run and the population\'s eventual behaviour will be diagnosed here from the last third of the series.</p>';
    ui.reading.innerHTML = 'Press <strong>Run</strong>, then raise the growth parameter a little at a time and run again after each change. Nothing random is ever added: every wobble you see is produced by the density dependence itself.';
    render(0);
  }

  LAB.ready(() => {
    buildUI();
    LAB.onClick('playBtn_over', onRun);
    LAB.onClick('endBtn_over', onSkip);
    LAB.onClick('resetBtn_over', onReset);
    LAB.bindSteps('over', player, ensureSim);
    onModelChange();
    render(0);
    LAB.onResize(() => player.redraw());
  });
})();
