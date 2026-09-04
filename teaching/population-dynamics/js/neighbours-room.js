// THE NEIGHBOURS ROOM — Lotka–Volterra interspecific competition.
//
//   dN_A/dt = r_A·N_A·(1 − (N_A + α_AB·N_B)/K_A)
//   dN_B/dt = r_B·N_B·(1 − (N_B + α_BA·N_A)/K_B)
//
// The outcome is decided entirely by the two invasion criteria, which can be
// read off the parameters before anything is simulated:
//
//   A can invade a world full of B   ⟺  K_A > α_AB·K_B
//   B can invade a world full of A   ⟺  K_B > α_BA·K_A
//
// both true → stable coexistence; both false → founder control (whoever
// establishes first excludes the other); one of each → that species excludes
// the other from any starting point. The growth rates appear nowhere in these
// conditions, which is the room's main surprise: r decides how fast the
// outcome arrives, never what it is.

(function () {
  const FRAMES = 400;
  const EXTINCT = 0.5;

  const PRESETS = {
    a:       { rA: 0.5, rB: 0.5, KA: 700, KB: 400, aAB: 0.5, aBA: 1.8, NA0: 30, NB0: 30 },
    b:       { rA: 0.5, rB: 0.5, KA: 400, KB: 700, aAB: 1.8, aBA: 0.5, NA0: 30, NB0: 30 },
    co:      { rA: 0.5, rB: 0.5, KA: 500, KB: 500, aAB: 0.6, aBA: 0.6, NA0: 50, NB0: 50 },
    founder: { rA: 0.5, rB: 0.5, KA: 500, KB: 500, aAB: 1.6, aBA: 1.6, NA0: 60, NB0: 50 }
  };

  let ui, plots, sim = null, dirty = true;

  function buildUI() {
    ui = {
      preset: LAB.segmented('presetSeg_nb', 'preset', { onChange: applyPreset }),
      rA:  LAB.slider('rA_nb',  { valueId: 'rAVal_nb',  format: v => v.toFixed(2), onChange: markDirty }),
      KA:  LAB.slider('KA_nb',  { valueId: 'KAVal_nb',  format: v => String(v), onChange: onStructural }),
      aAB: LAB.slider('aAB_nb', { valueId: 'aABVal_nb', format: v => v.toFixed(2), onChange: onStructural }),
      NA0: LAB.slider('NA0_nb', { valueId: 'NA0Val_nb', format: v => String(v), onChange: markDirty }),
      rB:  LAB.slider('rB_nb',  { valueId: 'rBVal_nb',  format: v => v.toFixed(2), onChange: markDirty }),
      KB:  LAB.slider('KB_nb',  { valueId: 'KBVal_nb',  format: v => String(v), onChange: onStructural }),
      aBA: LAB.slider('aBA_nb', { valueId: 'aBAVal_nb', format: v => v.toFixed(2), onChange: onStructural }),
      NB0: LAB.slider('NB0_nb', { valueId: 'NB0Val_nb', format: v => String(v), onChange: markDirty }),
      T:   LAB.slider('T_nb',   { valueId: 'TVal_nb',   format: v => String(v), onChange: markDirty }),
      status: LAB.$('status_nb'),
      reading: LAB.$('reading_nb'),
      note: LAB.$('note_nb'),
      chartStat: LAB.$('chartStat_nb'),
      verdict: LAB.$('verdict_nb'),
      invasion: LAB.$('invasion_nb')
    };
    plots = {
      series: createPlot(LAB.$('chart_nb'), { height: 290 }),
      phase: createPlot(LAB.$('phase_nb'), { height: 400, padL: 58 })
    };
  }

  function markDirty() { dirty = true; }

  // Changing a K or an α can flip the outcome, so the verdict is refreshed
  // immediately — before the run, to make the point that it was predictable.
  function onStructural() {
    markDirty();
    showVerdict(analyse(), false);
    render(player.frame);
  }

  function applyPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    ui.rA.set(p.rA); ui.rB.set(p.rB);
    ui.KA.set(p.KA); ui.KB.set(p.KB);
    ui.aAB.set(p.aAB); ui.aBA.set(p.aBA);
    ui.NA0.set(p.NA0); ui.NB0.set(p.NB0);
    dirty = true;
    showVerdict(analyse(), false);
    render(0);
  }

  // ------------------------------------------------------------- the theory

  function analyse() {
    const KA = ui.KA.value, KB = ui.KB.value, aAB = ui.aAB.value, aBA = ui.aBA.value;
    const aInvades = KA > aAB * KB;      // A increases when rare and B is at K_B
    const bInvades = KB > aBA * KA;      // B increases when rare and A is at K_A
    const denom = 1 - aAB * aBA;
    const eq = Math.abs(denom) > 1e-9
      ? { NA: (KA - aAB * KB) / denom, NB: (KB - aBA * KA) / denom }
      : null;
    const feasible = eq && eq.NA > 0 && eq.NB > 0;

    let kind;
    if (aInvades && bInvades) kind = 'coexist';
    else if (aInvades && !bInvades) kind = 'aWins';
    else if (!aInvades && bInvades) kind = 'bWins';
    else kind = 'founder';

    return { KA, KB, aAB, aBA, aInvades, bInvades, eq, feasible, kind };
  }

  const VERDICTS = {
    coexist: {
      cls: 'is-both', title: 'Stable coexistence',
      text: 'Each species suppresses itself more than it suppresses the other, so whichever one becomes common holds itself back and leaves room for its rival. Both invasion criteria are satisfied, so the two settle at the interior equilibrium from <em>any</em> starting pair of abundances — the coexistence is stable, not a coincidence of where the run began.'
    },
    aWins: {
      cls: 'is-a', title: 'Species A excludes species B',
      text: 'A can invade a world already full of B, but B cannot invade a world full of A. There is no arrangement of starting abundances that saves B: it loses from every initial condition, though a large head start will make it take longer.'
    },
    bWins: {
      cls: 'is-b', title: 'Species B excludes species A',
      text: 'B can invade a world already full of A, but A cannot invade a world full of B. A loses from every starting point — its own growth rate is irrelevant to that, and only changes how long the process takes.'
    },
    founder: {
      cls: 'is-either', title: 'Founder control — whoever gets there first wins',
      text: 'Each species suppresses the <em>other</em> more than it suppresses itself, so neither can break into a site the other already holds. Both single-species states are stable and the interior equilibrium is a saddle: it exists, but the smallest nudge sends the system to one species or the other. The outcome is decided by history rather than by the parameters — try clicking different starting points on the phase plane.'
    }
  };

  function showVerdict(A, ran) {
    const V = VERDICTS[A.kind];
    ui.verdict.className = 'verdict ' + V.cls;
    let html = `<h4>${V.title}</h4><p>${V.text}</p>`;
    if (A.feasible) {
      html += `<p class="mono" style="font-size:12px;">Interior equilibrium: N<sub>A</sub> = ${LAB.fmt(A.eq.NA, 0)}, N<sub>B</sub> = ${LAB.fmt(A.eq.NB, 0)} `
            + `(${A.kind === 'coexist' ? 'stable' : 'a saddle — unstable'}).</p>`;
    }
    if (!ran) html += `<p style="font-size:13px;color:var(--ink-soft);">Read off the parameters before running. Press Run to watch it happen.</p>`;
    ui.verdict.innerHTML = html;

    ui.invasion.innerHTML =
      `<p style="font-size:13.5px;">Can a species increase from vanishing rarity while its competitor sits at its own carrying capacity?</p>`
      + LAB.condRow(`A invades B: K<sub>A</sub> (${LAB.fmtInt(A.KA)}) &gt; α<sub>AB</sub>K<sub>B</sub> (${LAB.fmt(A.aAB * A.KB, 0)})`, A.aInvades)
      + LAB.condRow(`B invades A: K<sub>B</sub> (${LAB.fmtInt(A.KB)}) &gt; α<sub>BA</sub>K<sub>A</sub> (${LAB.fmt(A.aBA * A.KA, 0)})`, A.bInvades)
      + `<p style="font-size:13px;color:var(--ink-soft);margin-top:10px;">Neither condition contains r. Growth rates set the pace of the outcome, never the outcome itself.</p>`;
  }

  // ------------------------------------------------------------- simulation

  function simulate() {
    const rA = ui.rA.value, rB = ui.rB.value;
    const KA = ui.KA.value, KB = ui.KB.value;
    const aAB = ui.aAB.value, aBA = ui.aBA.value;
    const T = ui.T.value;
    const sub = 8, dt = T / FRAMES / sub;

    let NA = ui.NA0.value, NB = ui.NB0.value;
    const As = new Float64Array(FRAMES + 1), Bs = new Float64Array(FRAMES + 1);
    As[0] = NA; Bs[0] = NB;

    for (let f = 1; f <= FRAMES; f++) {
      for (let s = 0; s < sub; s++) {
        const y = LAB.rk4([NA, NB], dt, ([na, nb]) => [
          rA * na * (1 - (na + aAB * nb) / KA),
          rB * nb * (1 - (nb + aBA * na) / KB)
        ]);
        NA = y[0] < EXTINCT ? 0 : y[0];
        NB = y[1] < EXTINCT ? 0 : y[1];
      }
      As[f] = NA; Bs[f] = NB;
    }

    let peak = Math.max(KA, KB);
    for (let f = 0; f <= FRAMES; f++) peak = Math.max(peak, As[f], Bs[f]);

    sim = { As, Bs, T, KA, KB, aAB, aBA, rA, rB, peak, A: analyse() };
    dirty = false;
    player.load(FRAMES);
  }

  // ---------------------------------------------------------------- drawing

  function drawSeries(frame) {
    const p = plots.series;
    const T = sim ? sim.T : ui.T.value;
    const KA = ui.KA.value, KB = ui.KB.value;
    const yMax = (sim ? sim.peak : Math.max(KA, KB)) * 1.15;
    p.begin({ height: 290, xMin: 0, xMax: T, yMin: 0, yMax,
              xLabel: 'Time', yLabel: 'Population size' });
    p.grid();
    p.hline(KA, { color: LAB.C.spA, dash: [3, 4], alpha: 0.5, label: 'K_A' });
    p.hline(KB, { color: LAB.C.spB, dash: [3, 4], alpha: 0.5, label: 'K_B' });
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

  function phaseBounds() {
    const KA = ui.KA.value, KB = ui.KB.value, aAB = ui.aAB.value, aBA = ui.aBA.value;
    const cap = Math.max(KA, KB) * 2.2;
    const xInt = aBA > 1e-6 ? KB / aBA : cap;         // where B's isocline meets the x-axis
    const yInt = aAB > 1e-6 ? KA / aAB : cap;         // where A's isocline meets the y-axis
    const xMax = Math.min(cap, Math.max(KA, xInt, ui.NA0.value)) * 1.12;
    const yMax = Math.min(cap, Math.max(KB, yInt, ui.NB0.value)) * 1.12;
    return { xMax, yMax };
  }

  function drawPhase(frame) {
    const p = plots.phase;
    const KA = ui.KA.value, KB = ui.KB.value, aAB = ui.aAB.value, aBA = ui.aBA.value;
    const rA = ui.rA.value, rB = ui.rB.value;
    const { xMax, yMax } = phaseBounds();

    p.begin({ height: 400, padL: 58, xMin: 0, xMax, yMin: 0, yMax,
              xLabel: 'Species A', yLabel: 'Species B' });
    p.grid({ xTicks: 5, yTicks: 5 });

    // Which way the pair is pushed at each point in the plane.
    p.field((na, nb) => [
      rA * na * (1 - (na + aAB * nb) / KA),
      rB * nb * (1 - (nb + aBA * na) / KB)
    ], { alpha: 0.35 });

    // Isoclines.
    p.line([[KA, 0], [0, aAB > 1e-6 ? KA / aAB : yMax * 10]], { color: LAB.C.spA, width: 2.2 });
    p.line([[0, KB], [aBA > 1e-6 ? KB / aBA : xMax * 10, 0]], { color: LAB.C.spB, width: 2.2 });

    // Equilibria: the two single-species ones plus, if it exists, the interior one.
    const A = analyse();
    p.dot(KA, 0, { color: LAB.C.spA, r: 5, ring: LAB.C.paper });
    p.dot(0, KB, { color: LAB.C.spB, r: 5, ring: LAB.C.paper });
    if (A.feasible) p.dot(A.eq.NA, A.eq.NB, { color: LAB.C.cap, r: 6.5, ring: LAB.C.paper });

    if (sim) {
      const traj = [];
      for (let i = 0; i <= frame; i++) traj.push([sim.As[i], sim.Bs[i]]);
      p.line(traj, { color: LAB.C.ink, width: 2 });
      p.dot(sim.As[0], sim.Bs[0], { color: LAB.C.inkSoft, r: 4 });
      p.dot(sim.As[frame], sim.Bs[frame], { color: LAB.C.ink, r: 5.5, ring: LAB.C.paper });
    } else {
      p.dot(ui.NA0.value, ui.NB0.value, { color: LAB.C.inkSoft, r: 4.5 });
    }
    p.frame();
  }

  function render(frame) {
    drawSeries(frame);
    drawPhase(frame);
    if (sim) {
      ui.chartStat.textContent = `t = ${LAB.fmt((frame / FRAMES) * sim.T, 0)} · A = ${LAB.fmt(sim.As[frame], 0)} · B = ${LAB.fmt(sim.Bs[frame], 0)}`;
    }
  }

  const player = LAB.createPlayer({
    scrubberId: 'scrub_nb',
    scrubValueId: 'scrubVal_nb',
    playBtnId: 'playBtn_nb',
    playLabel: '▶ Run', pauseLabel: '⏸ Pause',
    fps: 70,
    scrubFormat: i => sim ? LAB.fmt((i / FRAMES) * sim.T, 0) : '0',
    render,
    onEnd: finish
  });

  function finish() {
    if (!sim) return;
    const A = sim.As[FRAMES], B = sim.Bs[FRAMES];
    showVerdict(sim.A, true);
    ui.status.textContent = `done · A = ${LAB.fmt(A, 0)} · B = ${LAB.fmt(B, 0)}`;

    let txt;
    if (A > 0 && B > 0) {
      txt = `Both species persisted: A at <strong>${LAB.fmt(A, 0)}</strong> (alone it would hold ${LAB.fmtInt(sim.KA)}) and B at <strong>${LAB.fmt(B, 0)}</strong> (alone, ${LAB.fmtInt(sim.KB)}). `
          + `Coexistence is not peaceful — each species is well below what it could manage on its own — but neither can eliminate the other, `
          + `because each is held back more by its own kind than by its competitor.`;
      if (sim.A.kind === 'founder') {
        txt += ` Note that this pair of parameters is a founder-control case: the interior equilibrium exists but is unstable, so the run has simply not yet fallen off it. Nudge the starting point and one species will disappear.`;
      }
    } else if (A > 0) {
      txt = `Species B was eliminated and A settled at <strong>${LAB.fmt(A, 0)}</strong>, essentially its own carrying capacity of ${LAB.fmtInt(sim.KA)}. `
          + `Competitive exclusion, and note what did <em>not</em> cause it: A does not grow faster than B here in any way that matters. `
          + `What mattered is that B's effect on A was weaker than A's effect on B.`;
    } else if (B > 0) {
      txt = `Species A was eliminated and B settled at <strong>${LAB.fmt(B, 0)}</strong>, close to its own carrying capacity of ${LAB.fmtInt(sim.KB)}. `
          + `Exclusion, decided by the balance of the two α values rather than by either species' growth rate.`;
    } else {
      txt = `Both species reached zero — check that the carrying capacities and starting sizes are not vanishingly small.`;
    }
    ui.reading.innerHTML = txt;
    ui.note.textContent = sim.A.kind === 'founder'
      ? 'Try clicking a different starting point on the phase plane: in this regime the winner is whoever starts on the favourable side of the saddle.'
      : 'Now change only rA and rB and run again. The winner will not change — only the time it takes.';
  }

  // Clicking the phase plane restarts the run from that pair of abundances,
  // which is the fastest way to feel what founder control means.
  function bindPhaseClick() {
    const cvs = LAB.$('phase_nb');
    cvs.style.cursor = 'crosshair';
    cvs.addEventListener('click', e => {
      const rect = cvs.getBoundingClientRect();
      const na = plots.phase.ix(e.clientX - rect.left);
      const nb = plots.phase.iy(e.clientY - rect.top);
      const lo = parseFloat(LAB.$('NA0_nb').min), hi = parseFloat(LAB.$('NA0_nb').max);
      ui.NA0.set(Math.round(LAB.clamp(na, lo, hi)));
      ui.NB0.set(Math.round(LAB.clamp(nb, lo, hi)));
      dirty = true;
      simulate();
      ui.status.textContent = `restarted from A = ${ui.NA0.value}, B = ${ui.NB0.value}`;
      player.play();
    });
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
    ui.status.textContent = 'Pick a preset or set the sliders, then press Run.';
    ui.note.textContent = '';
    ui.chartStat.textContent = '—';
    showVerdict(analyse(), false);
    ui.reading.innerHTML = 'Press <strong>Run</strong>. Then change only the growth rates and run again: the winner will not change, only how long it takes to win.';
    render(0);
  }

  LAB.ready(() => {
    buildUI();
    LAB.onClick('playBtn_nb', onRun);
    LAB.onClick('endBtn_nb', onSkip);
    LAB.onClick('resetBtn_nb', onReset);
    LAB.bindSteps('nb', player, ensureSim);
    bindPhaseClick();
    showVerdict(analyse(), false);
    render(0);
    LAB.onResize(() => player.redraw());
  });
})();
