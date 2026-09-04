// THE PREDATOR ROOM — Lotka–Volterra predator–prey, and the two repairs the
// original model needs before it behaves like anything that could exist.
//
//   dN/dt = N·g(N) − f(N)·P        prey
//   dP/dt = e·f(N)·P − m·P         predator
//
//   g(N) = r(1 − N/K)              prey growth; K = ∞ recovers the classic model
//   f(N) = a·N/(1 + a·h·N)         functional response; h = 0 recovers the linear one
//
// Three models are offered, and they are the same two equations with pieces
// switched on:
//
//   classic    K = ∞, h = 0   neutral cycles — closed orbits whose amplitude is
//                             set by the starting point and by nothing else
//   ceiling    K finite, h=0  the interior equilibrium becomes a stable spiral
//   satiation  K finite, h>0  a saturating predator: enriching the prey's
//                             environment destabilises the equilibrium
//
// Two facts drive the whole room and both are visible in the equilibrium,
// which can be read off the parameters without simulating anything:
//
//   N* = m/(a(e − m·h))     prey abundance is fixed by the PREDATOR's traits
//   P* = N*·g(N*)/f(N*)     predator abundance is fixed by the PREY's growth
//
// Nothing on the right-hand side of N* belongs to the prey. Feeding the prey
// more (raising K) therefore cannot make the prey commoner at equilibrium — it
// only adds predators, and in the saturating model it eventually adds enough of
// them to break the equilibrium altogether.

(function () {
  const FRAMES = 500;
  const SUB = 16;          // the neutral orbits have to close: RK4 at this step
                           // size holds the classic invariant to ~1e-9 over a
                           // run, so a drifting spiral on screen is real, not
                           // integration error
  const EXTINCT = 0.5;     // below half an individual a population is gone
  const NCAP = 1e7;        // a prey population released from predation grows
                           // exponentially; cap the integration rather than
                           // overflow. Nothing on screen is scaled to this: the
                           // panel is scaled to the cycles and a released prey
                           // population is drawn leaving it

  const PRESETS = {
    neutral: { mode: 'classic',   r: 0.6, K: 400, a: 0.02, e: 0.4, m: 0.3, h: 0.2, N0: 60,  P0: 20, T: 150 },
    damped:  { mode: 'ceiling',   r: 0.6, K: 300, a: 0.02, e: 0.4, m: 0.3, h: 0.2, N0: 60,  P0: 20, T: 150 },
    enrich:  { mode: 'satiation', r: 0.6, K: 400, a: 0.02, e: 0.4, m: 0.3, h: 0.2, N0: 60,  P0: 20, T: 400 },
    crash:   { mode: 'classic',   r: 0.6, K: 400, a: 0.02, e: 0.4, m: 0.3, h: 0.2, N0: 250, P0: 8,  T: 200 }
  };

  let ui, plots, sim = null, dirty = true;

  function buildUI() {
    ui = {
      preset: LAB.segmented('presetSeg_pd', 'preset', { onChange: applyPreset }),
      mode:   LAB.segmented('modeSeg_pd', 'mode', { onChange: onModeChange }),
      scale:  LAB.segmented('scaleSeg_pd', 'scale', { onChange: () => render(player.frame) }),
      r:  LAB.slider('r_pd',  { valueId: 'rVal_pd',  format: v => v.toFixed(2), onChange: onParam }),
      K:  LAB.slider('K_pd',  { valueId: 'KVal_pd',  format: v => String(v), onChange: onParam }),
      a:  LAB.slider('a_pd',  { valueId: 'aVal_pd',  format: v => v.toFixed(3), onChange: onParam }),
      e:  LAB.slider('e_pd',  { valueId: 'eVal_pd',  format: v => v.toFixed(2), onChange: onParam }),
      m:  LAB.slider('m_pd',  { valueId: 'mVal_pd',  format: v => v.toFixed(2), onChange: onParam }),
      h:  LAB.slider('h_pd',  { valueId: 'hVal_pd',  format: v => v.toFixed(2), onChange: onParam }),
      N0: LAB.slider('N0_pd', { valueId: 'N0Val_pd', format: v => String(v), onChange: onStart }),
      P0: LAB.slider('P0_pd', { valueId: 'P0Val_pd', format: v => String(v), onChange: onStart }),
      T:  LAB.slider('T_pd',  { valueId: 'TVal_pd',  format: v => String(v), onChange: markDirty }),
      status: LAB.$('status_pd'),
      reading: LAB.$('reading_pd'),
      note: LAB.$('note_pd'),
      chartStat: LAB.$('chartStat_pd'),
      verdict: LAB.$('verdict_pd'),
      numbers: LAB.$('numbers_pd'),
      frespNote: LAB.$('frespNote_pd'),
      riskNote: LAB.$('riskNote_pd'),
      tDisp: LAB.$('tDisp_pd'),
      nDisp: LAB.$('nDisp_pd'),
      pDisp: LAB.$('pDisp_pd'),
      nStarDisp: LAB.$('nStarDisp_pd'),
      pStarDisp: LAB.$('pStarDisp_pd')
    };
    plots = {
      series: createPlot(LAB.$('chart_pd'), { height: 300 }),
      phase:  createPlot(LAB.$('phase_pd'), { height: 400, padL: 58 }),
      fresp:  createPlot(LAB.$('fresp_pd'), { height: 210 }),
      risk:   createPlot(LAB.$('risk_pd'), { height: 210 })
    };
  }

  function markDirty() { dirty = true; }

  // Every parameter in this room can move the equilibrium, and the equilibrium
  // is the thing worth predicting before pressing Run — so the numbers panel and
  // the nullclines refresh on every slider move.
  function onParam() {
    markDirty();
    refreshTheory();
    render(player.frame);
  }
  // Starting abundances change nothing about the equilibrium, but in the classic
  // model they change the entire orbit, which is the point of that model.
  function onStart() {
    markDirty();
    render(player.frame);
  }

  function onModeChange() {
    const mode = ui.mode.value;
    document.querySelectorAll('#tab-predator .kOnly').forEach(el => {
      el.style.display = mode === 'classic' ? 'none' : '';
    });
    document.querySelectorAll('#tab-predator .hOnly').forEach(el => {
      el.style.display = mode === 'satiation' ? '' : 'none';
    });
    // The two lower panels say different things in each model, so their captions
    // are part of the model choice rather than fixed text.
    ui.frespNote.innerHTML = mode === 'satiation'
      ? 'A predator that must spend <em>h</em> time units handling each prey it catches cannot eat faster than 1/h, however many prey there are. The pale line is the linear response it replaces: the two agree only while prey are scarce.'
      : 'A linear (type I) response: each predator eats a fixed <em>fraction</em> of the prey population per unit time, without limit. A predator facing a thousand prey eats a hundred times as many as one facing ten — it never gets full, never runs out of hours in the day.';
    ui.riskNote.innerHTML = mode === 'satiation'
      ? 'Now the risk line <em>falls</em>: the commoner the prey, the safer each individual prey is, because the predators are already busy. Prey growth is being opposed by a weakening force, and that is what lets the population run away from its equilibrium.'
      : 'The risk line is flat — predation removes the same <em>proportion</em> of prey at every density. Where the two lines cross, births exactly balance predation and the prey population stops changing.';
    markDirty();
    refreshTheory();
    render(0);
  }

  function applyPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    ui.mode.set(p.mode, true);
    ui.r.set(p.r); ui.K.set(p.K); ui.a.set(p.a); ui.e.set(p.e);
    ui.m.set(p.m); ui.h.set(p.h);
    ui.N0.set(p.N0); ui.P0.set(p.P0); ui.T.set(p.T);
    onModeChange();
    dirty = true;
    ui.status.textContent = 'preset loaded · press Run';
  }

  // ------------------------------------------------------------- the theory

  function params() {
    const mode = ui.mode.value;
    return {
      mode,
      r: ui.r.value,
      K: mode === 'classic' ? Infinity : ui.K.value,
      a: ui.a.value,
      e: ui.e.value,
      m: ui.m.value,
      h: mode === 'satiation' ? ui.h.value : 0,
      N0: ui.N0.value,
      P0: ui.P0.value,
      T: ui.T.value
    };
  }

  // The model itself, as three small functions. Everything else in the room —
  // the integrator, the nullclines, the Jacobian, both lower panels — is written
  // in terms of these, so there is exactly one place where the biology lives.
  const growth   = P => N => P.r * (1 - N / P.K);            // per-capita prey growth
  const response = P => N => P.a * N / (1 + P.a * P.h * N);  // prey eaten per predator
  const slope    = P => N => P.a / Math.pow(1 + P.a * P.h * N, 2);

  function theory(P) {
    const f = response(P), fp = slope(P), g = growth(P);
    const gp = isFinite(P.K) ? -P.r / P.K : 0;

    // Predator break-even: e·f(N) = m. With handling time this has no solution
    // at all once m·h ≥ e — a predator that dies faster than it can process food.
    const denom = P.a * (P.e - P.m * P.h);
    const Nstar = denom > 1e-12 ? P.m / denom : Infinity;
    const viable = isFinite(Nstar) && Nstar > 0 && Nstar < P.K;
    const Pstar = viable ? (Nstar * g(Nstar)) / f(Nstar) : NaN;

    // Jacobian at the interior equilibrium. J22 is exactly zero there (the
    // predator's per-capita growth depends only on N), so the trace is the prey
    // row alone: whether the equilibrium attracts or repels is decided entirely
    // by how prey growth responds to prey density.
    const tr = viable ? g(Nstar) + Nstar * gp - fp(Nstar) * Pstar : NaN;
    const det = viable ? f(Nstar) * P.e * fp(Nstar) * Pstar : NaN;
    const disc = tr * tr - 4 * det;
    const omega = viable && disc < 0 ? Math.sqrt(-disc) / 2 : 0;
    const period = omega > 1e-12 ? (2 * Math.PI) / omega : Infinity;

    // With a saturating response the prey nullcline is a hump peaking at
    // (K − 1/(ah))/2, and the equilibrium is stable exactly when the predator's
    // vertical nullcline cuts it to the right of that peak.
    const Kcrit = P.h > 1e-12 && viable ? 2 * Nstar + 1 / (P.a * P.h) : Infinity;

    let kind;
    if (!viable) kind = 'noPredator';
    else if (P.mode === 'classic') kind = 'neutral';
    else if (tr < -1e-9) kind = omega > 0 ? 'damped' : 'settle';
    else if (tr > 1e-9) kind = 'limitCycle';
    else kind = 'marginal';

    return { P, Nstar, Pstar, viable, tr, det, omega, period, Kcrit, kind };
  }

  const VERDICTS = {
    neutral: {
      cls: 'is-either', title: 'Neutral cycles — every orbit is closed',
      text: `Prey and predator chase each other round the equilibrium forever, never spiralling in and never
             spiralling out. The model has a conserved quantity, exactly like a frictionless pendulum, and the
             consequence is severe: <strong>the size of the cycle is set by where you started and by nothing
             else.</strong> Two populations with identical parameters can cycle gently or violently depending
             only on their history, and any disturbance moves them permanently onto a new orbit. This is
             <em>neutral</em> stability, and it is why the classic model is a starting point rather than an
             explanation — no real pair of species could be this delicately balanced.`
    },
    damped: {
      cls: 'is-both', title: 'Damped oscillations to a stable equilibrium',
      text: `Give the prey a ceiling of its own and the closed orbits become an inward spiral: the cycles shrink
             and the two populations settle. The prey is now limited by two things at once — its predator and
             its own crowding — and it is the crowding that supplies the missing friction. Notice that the
             prey's equilibrium <em>N*</em> did not move when you added K: enriching the prey's world raises the
             number of predators, not the number of prey.`
    },
    settle: {
      cls: 'is-both', title: 'Non-oscillatory approach',
      text: `The equilibrium is stable and is approached without overshooting — the damping is strong enough
             that the two populations slide into place rather than circling in. This happens when the predator
             is inefficient relative to the prey's self-limitation, so the feedback loop is too weak to
             generate a cycle at all.`
    },
    limitCycle: {
      cls: 'is-a', title: 'Unstable equilibrium — a limit cycle',
      text: `The equilibrium still exists and can still be computed, but it now <em>repels</em>: the populations
             spiral away from it and settle onto a large, self-sustaining cycle whose size is a property of the
             parameters, not of the starting point. The cause is the saturating predator. Because a busy
             predator takes a smaller <em>fraction</em> of a large prey population, prey that get ahead keep
             getting further ahead, and the correction arrives too late and too hard.`
    },
    marginal: {
      cls: 'is-either', title: 'Exactly on the boundary',
      text: `The trace of the Jacobian is zero: the equilibrium is on the knife-edge between attracting and
             repelling. Nudge any parameter and it will fall to one side or the other.`
    },
    // The three below are outcomes of a run rather than properties of the
    // parameters: they are reached through the extinction floor, which is the one
    // piece of this room that is not in the equations.
    collapsed: {
      cls: 'is-b', title: 'Both populations lost',
      text: `The cycle these parameters predict is real, but it swings so far that the prey trough passed below
             half an individual — and a population of half an individual is a population of none. The predator
             starved shortly after. Nothing in the equations required this: on paper the prey would have
             recovered from a hundredth of an individual and gone round again. A cycle whose troughs are that
             deep is a cycle no real pair of species would survive, and the model cannot tell you so by itself.`
    },
    preyLost: {
      cls: 'is-b', title: 'The prey went extinct',
      text: `The prey population fell below the extinction floor of half an individual during a trough and was
             pinned to zero. In these equations that is the only way to lose the prey — the deterministic
             trajectory never reaches zero, it only gets arbitrarily close. Whether you find that reassuring or
             absurd is exactly the point of the floor.`
    },
    predLost: {
      cls: 'is-b', title: 'The predator went extinct',
      text: `The predators dropped below the extinction floor in a trough and did not come back; the prey were
             then released from predation entirely. Predators fare worse than their prey in a wide cycle because
             they are scarcer to begin with and their troughs are deeper — a general point about the vulnerability
             of species at the top.`
    },
    noPredator: {
      cls: 'is-b', title: 'The predator cannot persist here',
      text: `There is no prey density at which this predator breaks even — either the prey's ceiling K is below
             the density the predator needs, or the predator's mortality is so high relative to what handling
             time lets it eat (m·h ≥ e) that no amount of prey would feed it. It declines to extinction whatever
             it starts at, and the prey is then left to its own devices.`
    }
  };

  // `kind` overrides the parameters' own verdict once a run has actually ended in
  // an extinction — "every orbit is closed" is no longer the useful thing to say
  // when both species are lying at zero.
  function showVerdict(t, ran, kind) {
    const V = VERDICTS[kind || t.kind];
    ui.verdict.className = 'verdict ' + V.cls;
    let html = `<h4>${V.title}</h4><p>${V.text}</p>`;
    if (t.viable) {
      html += `<p class="mono" style="font-size:12px;">Equilibrium: N* = ${LAB.fmt(t.Nstar, 1)} prey, `
            + `P* = ${LAB.fmt(t.Pstar, 1)} predators.</p>`;
    }
    if (!ran) {
      html += `<p style="font-size:13px;color:var(--ink-soft);">Read off the parameters before running. Press Run to watch it happen.</p>`;
    }
    ui.verdict.innerHTML = html;
  }

  // The numbers panel: what the equations predict, beside what the run actually
  // did. The two columns agreeing is the point — and where they disagree (the
  // period of a large classic orbit) that disagreement is itself a lesson.
  function refreshTheory(meas) {
    const t = theory(params()), P = t.P;
    const cell = v => (isFinite(v) && !isNaN(v) ? LAB.fmt(v, 1) : '—');

    let html = '<table class="datatable"><thead><tr><th>Quantity</th><th>predicted</th><th>measured</th></tr></thead><tbody>';
    html += `<tr><td style="color:var(--sp-a)">Prey N*</td><td>${cell(t.Nstar)}</td>`
          + `<td>${meas && meas.meanN != null ? LAB.fmt(meas.meanN, 1) : '—'}</td></tr>`;
    html += `<tr><td style="color:var(--sp-b)">Predator P*</td><td>${cell(t.Pstar)}</td>`
          + `<td>${meas && meas.meanP != null ? LAB.fmt(meas.meanP, 1) : '—'}</td></tr>`;
    html += `<tr><td>Cycle period</td><td>${isFinite(t.period) ? LAB.fmt(t.period, 1) : '—'}</td>`
          + `<td>${meas && meas.period ? LAB.fmt(meas.period, 1) : '—'}</td></tr>`;
    html += `<tr><td>Predator lag</td><td>0.25 cycle</td>`
          + `<td>${meas && meas.lag ? LAB.fmt(meas.lag, 2) + ' cycle' : '—'}</td></tr>`;
    html += '</tbody></table>';

    if (P.mode === 'classic') {
      html += `<p style="font-size:12.5px;color:var(--ink-soft);margin:10px 0 0;">The predicted period
               <span class="mono">2π/√(r·m)</span> and the quarter-cycle lag are exact only for very small
               cycles. A wide orbit genuinely runs slower than predicted and lags by less than a quarter — that
               is the model, not an error. The measured <em>averages</em>, though, sit on N* and P* at any
               amplitude.</p>`;
    } else if (P.mode === 'satiation' && t.viable) {
      html += `<p style="font-size:13px;margin:10px 0 6px;">Stability with a saturating predator has a
               threshold, and it is a threshold in the <em>prey's</em> food supply:</p>`;
      html += LAB.condRow(`K (${LAB.fmtInt(P.K)}) &lt; 2N* + 1/(a·h) (${LAB.fmt(t.Kcrit, 0)})`, P.K < t.Kcrit);
      html += `<p style="font-size:12.5px;color:var(--ink-soft);margin:8px 0 0;">Below the threshold the
               equilibrium attracts; above it the community breaks into a cycle. Enriching the environment
               destabilises it — the paradox of enrichment.</p>`;
    }
    ui.numbers.innerHTML = html;

    ui.nStarDisp.textContent = cell(t.Nstar);
    ui.pStarDisp.textContent = cell(t.Pstar);
    if (!sim) showVerdict(t, false);
    return t;
  }

  // ------------------------------------------------------------- simulation

  // One trajectory, returned as a pair of arrays. The reference orbits drawn
  // faintly on the phase plane come through here too, which is why it takes its
  // starting point as an argument rather than reading the sliders.
  function trajectory(P, N0, P0) {
    const f = response(P), g = growth(P);
    const deriv = ([N, Pp]) => [N * g(N) - f(N) * Pp, P.e * f(N) * Pp - P.m * Pp];
    const dt = P.T / FRAMES / SUB;
    let y = [Math.max(N0, 0), Math.max(P0, 0)];
    const Ns = new Float64Array(FRAMES + 1), Ps = new Float64Array(FRAMES + 1);
    Ns[0] = y[0]; Ps[0] = y[1];
    for (let i = 1; i <= FRAMES; i++) {
      for (let s = 0; s < SUB; s++) {
        y = LAB.rk4(y, dt, deriv);
        if (!isFinite(y[0]) || y[0] > NCAP) y[0] = NCAP;
        if (!isFinite(y[1]) || y[1] > NCAP) y[1] = NCAP;
        if (y[0] < EXTINCT) y[0] = 0;
        if (y[1] < EXTINCT) y[1] = 0;
      }
      Ns[i] = y[0]; Ps[i] = y[1];
    }
    return { Ns, Ps };
  }

  // Local maxima, ignoring anything at or below the equilibrium so that numerical
  // ripple on a settled population is not reported as a cycle.
  function peaksOf(arr, floor) {
    const out = [];
    for (let i = 1; i < arr.length - 1; i++) {
      if (arr[i] > arr[i - 1] && arr[i] >= arr[i + 1] && arr[i] > floor) out.push(i);
    }
    return out;
  }

  // What the run actually did: how long a cycle took, how far the predator's
  // peaks trail the prey's, whether the swings are growing or dying away.
  function measure(Ns, Ps, T, t) {
    const dt = T / FRAMES;
    const nFloor = t.viable ? t.Nstar * 1.002 : 0;
    const pFloor = t.viable ? t.Pstar * 1.002 : 0;
    const nPk = peaksOf(Ns, nFloor), pPk = peaksOf(Ps, pFloor);

    const out = { nPk, pPk, period: null, lag: null, trend: null, meanN: null, meanP: null };
    if (nPk.length >= 2) {
      out.period = ((nPk[nPk.length - 1] - nPk[0]) / (nPk.length - 1)) * dt;
      // Average each prey peak against the predator peak that follows it.
      let sum = 0, n = 0;
      for (const i of nPk) {
        const j = pPk.find(k => k > i);
        if (j == null) continue;
        const lag = (j - i) * dt;
        if (lag < out.period * 0.95) { sum += lag; n++; }
      }
      if (n) out.lag = sum / n / out.period;
      // Is the oscillation growing, shrinking or holding? Compare the first and
      // last complete cycles by their prey amplitude.
      const amp = (from, to) => {
        let lo = Infinity, hi = -Infinity;
        for (let i = from; i <= to; i++) { lo = Math.min(lo, Ns[i]); hi = Math.max(hi, Ns[i]); }
        return hi - lo;
      };
      if (nPk.length >= 3) {
        const first = amp(nPk[0], nPk[1]);
        const last = amp(nPk[nPk.length - 2], nPk[nPk.length - 1]);
        out.trend = first > 1e-9 ? last / first : null;
      }
    }
    // Time-averages over the later part of the run. In the classic model these
    // land on N* and P* exactly — the cycle's mean is the equilibrium, however
    // wild the cycle — but only if a whole number of cycles is averaged, so the
    // window runs from one prey peak to another wherever the run has peaks.
    let from = Math.floor(FRAMES * 0.35), to = FRAMES;
    const late = nPk.filter(i => i >= FRAMES * 0.3);
    if (late.length >= 2) { from = late[0]; to = late[late.length - 1]; }
    let sN = 0, sP = 0, n = 0;
    for (let i = from; i <= to; i++) { sN += Ns[i]; sP += Ps[i]; n++; }
    if (n) { out.meanN = sN / n; out.meanP = sP / n; }
    return out;
  }

  function simulate() {
    const P = params();
    const t = theory(P);
    const main = trajectory(P, P.N0, P.P0);

    // Two more orbits started nearer to and further from the equilibrium than
    // the real one. In the classic model they are nested closed loops that never
    // meet; in every other model they converge on the same place. That contrast
    // is the fastest way to see what neutral stability costs.
    const refs = [];
    if (t.viable) {
      for (const s of [0.45, 1.6]) {
        const n0 = t.Nstar + (P.N0 - t.Nstar) * s;
        const p0 = t.Pstar + (P.P0 - t.Pstar) * s;
        if (n0 > EXTINCT && p0 > EXTINCT) refs.push(trajectory(P, n0, p0));
      }
    }

    // The time series is scaled to the run itself; the phase plane is scaled to
    // fit the reference orbits too, since a family of nested orbits only makes
    // its point when the whole family is inside the frame.
    let peakN = 0, peakP = 0, refPeakN = 0, refPeakP = 0;
    for (let i = 0; i <= FRAMES; i++) {
      peakN = Math.max(peakN, main.Ns[i]);
      peakP = Math.max(peakP, main.Ps[i]);
    }
    for (const ref of refs) {
      for (let i = 0; i <= FRAMES; i++) {
        refPeakN = Math.max(refPeakN, ref.Ns[i]);
        refPeakP = Math.max(refPeakP, ref.Ps[i]);
      }
    }

    // Where the prey is released: the frame at which the predator reaches zero
    // in a model that gives the prey no ceiling of its own. Everything after
    // that is unbounded exponential growth, and the time series is scaled
    // without it — scaled to the escape, the cycles that preceded it would be a
    // flat line along the bottom and the escape a flat line along the top.
    let released = null;
    if (!isFinite(P.K)) {
      for (let i = 0; i <= FRAMES; i++) if (main.Ps[i] <= 0) { released = i; break; }
    }
    let cycleN = 0;
    for (let i = 0; i <= (released == null ? FRAMES : released); i++) cycleN = Math.max(cycleN, main.Ns[i]);

    sim = { P, t, Ns: main.Ns, Ps: main.Ps, refs, peakN, peakP, released, cycleN,
            phaseN: Math.max(peakN, refPeakN), phaseP: Math.max(peakP, refPeakP),
            meas: measure(main.Ns, main.Ps, P.T, t) };
    dirty = false;
    player.load(FRAMES);
  }

  // ---------------------------------------------------------------- drawing

  function current() { return sim ? sim.P : params(); }
  function currentTheory() { return sim ? sim.t : theory(params()); }

  function drawSeries(frame) {
    const p = plots.series;
    const P = current(), t = currentTheory();
    const log = ui.scale.value === 'log';
    const peak = sim ? Math.max(sim.cycleN, sim.peakP)
                     : Math.max(t.viable ? t.Nstar : P.N0, t.viable ? t.Pstar : P.P0, P.N0, P.P0);
    const yMax = Math.max(peak * 1.15, 1);
    const ceiling = Math.max(peak * 1.06, 0.9);   // below the top, to leave the tail room

    p.begin({ height: 300, xMin: 0, xMax: P.T,
              yMin: log ? 0.5 : 0, yMax, yLog: log,
              xLabel: 'Time', yLabel: 'Population size' });
    p.grid();
    if (t.viable) {
      p.hline(t.Nstar, { color: LAB.C.spA, dash: [3, 4], alpha: 0.55, label: 'N*' });
      p.hline(t.Pstar, { color: LAB.C.pred, dash: [3, 4], alpha: 0.55, label: 'P*' });
    }
    if (!sim) { p.frame(); return; }

    const prey = [], pred = [];
    for (let i = 0; i <= frame; i++) {
      const x = (i / FRAMES) * P.T;
      prey.push([x, sim.Ns[i]]);
      pred.push([x, sim.Ps[i]]);
    }
    // A prey population released by its predator's extinction has nothing left
    // to stop it. It leaves through the top of the panel as a dotted tail rather
    // than lying flat along the edge, which would say it had found a limit.
    const exit = p.lineOut(prey, ceiling, { color: LAB.C.spA, width: 2.4 });
    p.lineOut(pred, ceiling, { color: LAB.C.pred, width: 2.4 });

    // Peak markers. Seeing the rust dots sit consistently to the right of the
    // teal ones is the quarter-cycle lag, without needing to read a number.
    // Only where the series is still on the panel: pinned to the top edge, a
    // marker would sit at a peak the population never had.
    for (const i of sim.meas.nPk) {
      if (i > frame) break;
      if (sim.Ns[i] <= ceiling) p.dot((i / FRAMES) * P.T, sim.Ns[i], { color: LAB.C.spA, r: 3, ring: LAB.C.paper });
    }
    for (const i of sim.meas.pPk) {
      if (i > frame) break;
      if (sim.Ps[i] <= ceiling) p.dot((i / FRAMES) * P.T, sim.Ps[i], { color: LAB.C.pred, r: 3, ring: LAB.C.paper });
    }

    const now = (frame / FRAMES) * P.T;
    p.cursor(now);
    if (sim.Ns[frame] <= ceiling) p.dot(now, sim.Ns[frame], { color: LAB.C.spA, r: 4, ring: LAB.C.paper });
    if (sim.Ps[frame] <= ceiling) p.dot(now, sim.Ps[frame], { color: LAB.C.pred, r: 4, ring: LAB.C.paper });
    if (exit != null) {
      const wide = p.right - exit > 86;
      p.text(exit + (wide ? 5 : -5), p.top + 9, 'still growing',
             { screen: true, align: wide ? 'left' : 'right', alpha: 0.75 });
    }
    p.legend([{ color: LAB.C.spA, label: 'prey' }, { color: LAB.C.pred, label: 'predators' }],
             { right: exit != null && exit < p.left + p.plotW / 3 });
    p.frame();
  }

  function phaseBounds() {
    const P = current(), t = currentTheory();
    const Ns = t.viable ? t.Nstar : P.N0;
    const Ps = t.viable ? t.Pstar : P.P0;
    // A prey population released from its predator runs to the cap, so the view
    // is bounded independently of the trajectory and the excursion is clipped.
    const capX = Math.max(Ns * 10, isFinite(P.K) ? P.K * 1.05 : 0);
    const capY = Math.max(Ps * 10, 1);
    const xMax = Math.min(capX, Math.max(Ns * 1.6, P.N0, sim ? sim.phaseN : 0, isFinite(P.K) ? P.K : 0)) * 1.12;
    const yMax = Math.min(capY, Math.max(Ps * 1.6, P.P0, sim ? sim.phaseP : 0)) * 1.12;
    return { xMax: Math.max(xMax, 1), yMax: Math.max(yMax, 1) };
  }

  function drawPhase(frame) {
    const p = plots.phase;
    const P = current(), t = currentTheory();
    const f = response(P), g = growth(P);
    const { xMax, yMax } = phaseBounds();

    p.begin({ height: 400, padL: 58, xMin: 0, xMax, yMin: 0, yMax,
              xLabel: 'Prey N', yLabel: 'Predators P' });
    p.grid({ xTicks: 5, yTicks: 5 });

    // Which way the pair is pushed at each point in the plane.
    p.field((N, Pp) => [N * g(N) - f(N) * Pp, P.e * f(N) * Pp - P.m * Pp]);

    // Prey nullcline: P = N·g(N)/f(N), a horizontal line in the classic model,
    // a falling line with a ceiling, a hump once the predator saturates.
    const preyNull = [];
    for (let i = 0; i <= 240; i++) {
      const N = Math.max(xMax * (i / 240), 1e-6);
      const Pn = (N * g(N)) / f(N);
      if (Pn < -1e-9) break;
      preyNull.push([N, Math.max(Pn, 0)]);
    }
    p.line(preyNull, { color: LAB.C.spA, width: 2.2 });
    // Predator nullcline: the prey density at which the predator breaks even.
    if (t.viable) p.line([[t.Nstar, 0], [t.Nstar, yMax]], { color: LAB.C.pred, width: 2.2 });

    // Everything from here on is a trajectory, and trajectories can leave the
    // frame — clip so an escaping prey population cannot draw over the axes.
    p.clipped(() => {
      if (sim) {
        for (const ref of sim.refs) {
          const pts = [];
          for (let i = 0; i <= FRAMES; i++) pts.push([ref.Ns[i], ref.Ps[i]]);
          p.line(pts, { color: LAB.C.inkSoft, width: 1.2, alpha: 0.38 });
        }
        const traj = [];
        for (let i = 0; i <= frame; i++) traj.push([sim.Ns[i], sim.Ps[i]]);
        p.line(traj, { color: LAB.C.ink, width: 2 });
        p.dot(sim.Ns[0], sim.Ps[0], { color: LAB.C.inkSoft, r: 4 });
        p.dot(sim.Ns[frame], sim.Ps[frame], { color: LAB.C.ink, r: 5.5, ring: LAB.C.paper });
      } else {
        p.dot(P.N0, P.P0, { color: LAB.C.inkSoft, r: 4.5 });
      }
    });

    if (t.viable) p.dot(t.Nstar, t.Pstar, { color: LAB.C.cap, r: 6.5, ring: LAB.C.paper });
    if (isFinite(P.K) && P.K <= xMax) p.dot(P.K, 0, { color: LAB.C.spA, r: 4.5, ring: LAB.C.paper });
    p.frame();
  }

  // Prey eaten per predator per unit time, against prey density. The whole
  // difference between the second and third models is the shape of this line.
  function drawFunctional(frame) {
    const p = plots.fresp;
    const P = current();
    const f = response(P);
    const { xMax } = phaseBounds();
    const ceiling = P.h > 1e-9 ? 1 / P.h : Infinity;
    const yMax = Math.max(f(xMax) * 1.25, isFinite(ceiling) ? ceiling * 1.15 : 0, 1e-3);

    p.begin({ height: 210, xMin: 0, xMax, yMin: 0, yMax,
              xLabel: 'Prey density N', yLabel: 'prey eaten / predator' });
    p.grid({ xTicks: 4, yTicks: 4 });

    if (P.h > 1e-9) {
      const linear = [[0, 0], [xMax, P.a * xMax]];
      p.line(linear, { color: LAB.C.inkSoft, width: 1.4, dash: [4, 4], alpha: 0.7 });
      if (isFinite(ceiling) && ceiling <= yMax) {
        p.hline(ceiling, { color: LAB.C.stamp, dash: [5, 4], label: '1/h' });
      }
    }
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const N = xMax * (i / 120);
      pts.push([N, f(N)]);
    }
    p.line(pts, { color: LAB.C.pred, width: 2.4 });

    const N = sim ? sim.Ns[frame] : P.N0;
    if (N > 0 && N <= xMax) {
      p.vline(N, { color: LAB.C.ink, dash: [2, 3], alpha: 0.5 });
      p.dot(N, f(N), { color: LAB.C.ink, r: 4, ring: LAB.C.paper });
    }
    p.frame();
  }

  // The same predation seen from the prey's side: a per-capita death rate, drawn
  // against the prey's own per-capita growth rate. Where they cross, the prey
  // population is stationary — and whether they cross from above or below is the
  // whole of the stability question.
  function drawRisk(frame) {
    const p = plots.risk;
    const P = current();
    const f = response(P), g = growth(P);
    const Pnow = sim ? sim.Ps[frame] : P.P0;
    const { xMax } = phaseBounds();
    const risk = N => (N > 1e-9 ? (f(N) / N) * Pnow : P.a * Pnow);
    const yMax = Math.max(P.r * 1.3, risk(0) * 1.15, 1e-3);

    p.begin({ height: 210, xMin: 0, xMax, yMin: 0, yMax,
              xLabel: 'Prey density N', yLabel: 'per-capita rate' });
    p.grid({ xTicks: 4, yTicks: 4 });

    const born = [], died = [];
    for (let i = 0; i <= 120; i++) {
      const N = Math.max(xMax * (i / 120), 1e-6);
      born.push([N, Math.max(g(N), 0)]);
      died.push([N, risk(N)]);
    }
    p.line(born, { color: LAB.C.spA, width: 2.2 });
    p.line(died, { color: LAB.C.pred, width: 2.2 });

    const N = sim ? sim.Ns[frame] : P.N0;
    if (N > 0 && N <= xMax) p.vline(N, { color: LAB.C.ink, dash: [2, 3], alpha: 0.5 });
    p.legend([{ color: LAB.C.spA, label: 'prey growth' },
              { color: LAB.C.pred, label: 'predation risk' }], { right: true });
    p.frame();
  }

  // The guard is not a population size: once the prey is pressed against it the
  // only honest thing to report is that it has no bound.
  const nText = v => (v >= NCAP ? 'unbounded' : LAB.fmtBig(v));

  function render(frame) {
    drawSeries(frame);
    drawPhase(frame);
    drawFunctional(frame);
    drawRisk(frame);
    const P = current();
    if (sim) {
      const tNow = (frame / FRAMES) * P.T;
      ui.chartStat.textContent = `t = ${LAB.fmt(tNow, 0)} · N = ${nText(sim.Ns[frame])} · P = ${nText(sim.Ps[frame])}`;
      ui.tDisp.textContent = LAB.fmt(tNow, 0);
      ui.nDisp.textContent = nText(sim.Ns[frame]);
      ui.pDisp.textContent = nText(sim.Ps[frame]);
    } else {
      ui.tDisp.textContent = '0';
      ui.nDisp.textContent = LAB.fmtInt(P.N0);
      ui.pDisp.textContent = LAB.fmtInt(P.P0);
    }
  }

  const player = LAB.createPlayer({
    scrubberId: 'scrub_pd',
    scrubValueId: 'scrubVal_pd',
    playBtnId: 'playBtn_pd',
    playLabel: '▶ Run', pauseLabel: '⏸ Pause',
    fps: 70,
    scrubFormat: i => (sim ? LAB.fmt((i / FRAMES) * sim.P.T, 0) : '0'),
    render,
    onEnd: finish
  });

  function finish() {
    if (!sim) return;
    const { P, t, meas } = sim;
    const N = sim.Ns[FRAMES], Pp = sim.Ps[FRAMES];
    refreshTheory(meas);
    const lost = t.viable
      ? (N <= 0 && Pp <= 0 ? 'collapsed' : N <= 0 ? 'preyLost' : Pp <= 0 ? 'predLost' : null)
      : null;
    showVerdict(t, true, lost);
    ui.status.textContent = `done · N = ${nText(N)} · P = ${nText(Pp)}`;

    let txt, note;
    if (Pp <= 0 && N <= 0) {
      // Both gone: the predator ate the prey down past the extinction floor and
      // then starved. Worth naming, because the equations themselves never say so.
      txt = `Both populations reached zero. The prey trough fell below the extinction floor of half an
             individual, and once the prey was gone the predator followed. This is the honest ending the
             equations refuse to give you: as written, they would have let the prey recover from a hundredth
             of an individual and cycle forever. A model that has to be rescued by rounding is telling you
             that its cycles are too large to be believed.`;
      note = 'Start closer to the equilibrium — the small orbits are the ones a real pair of species could survive.';
    } else if (Pp <= 0) {
      txt = `The predator went extinct at some point in the run, and the prey — now limited by nothing at
             all${isFinite(P.K) ? ' except its own carrying capacity' : ''} — ${isFinite(P.K)
               ? `climbed to its ceiling of ${LAB.fmtInt(P.K)}`
               : `resumed the unlimited exponential growth of the Growth Room`}.
             ${t.viable
               ? 'The equilibrium existed; the cycle simply swung too far below it for the predator to survive the trough.'
               : 'The equilibrium did not exist: there was no prey density at which this predator could break even.'}`;
      note = t.viable
        ? 'The deeper the trough, the less the deterministic model can be trusted near it.'
        : 'Lower the predator\'s mortality, or raise its attack rate, until N* falls below the prey\'s ceiling.';
    } else if (N <= 0) {
      txt = `The prey was driven to extinction and the predator is living on borrowed time. In these
             equations that outcome requires the prey trough to cross the extinction floor — the model has no
             other way to lose a species.`;
      note = 'Try a smaller starting displacement from the equilibrium.';
    } else if (t.kind === 'neutral') {
      const amp = meas.trend;
      txt = `The two populations cycled${meas.period ? ` with a period of about <strong>${LAB.fmt(meas.period, 1)}</strong> time units` : ''},
             the predator's peaks trailing the prey's by ${meas.lag ? `<strong>${LAB.fmt(meas.lag, 2)}</strong> of a cycle` : 'about a quarter of a cycle'} —
             prey rise, predators follow, prey collapse, predators starve, and the cycle begins again.
             The time-averaged abundances over the run were ${LAB.fmt(meas.meanN, 1)} prey and ${LAB.fmt(meas.meanP, 1)} predators,
             against predicted equilibria of ${LAB.fmt(t.Nstar, 1)} and ${LAB.fmt(t.Pstar, 1)}: the mean of the cycle
             <em>is</em> the equilibrium, however wide the swings.
             ${amp ? `The last cycle came out at ${LAB.fmt(amp * 100, 2)}% of the first — whatever that misses by is integration
             error, not biology. The true orbits are exactly closed.` : ''}`;
      note = 'Now click somewhere else on the phase plane. Same parameters, different orbit — nothing in the model prefers one over another.';
    } else if (t.kind === 'limitCycle') {
      txt = `The equilibrium at (${LAB.fmt(t.Nstar, 1)}, ${LAB.fmt(t.Pstar, 1)}) repelled the populations rather than attracting them,
             and they settled onto a cycle${meas.period ? ` of period ${LAB.fmt(meas.period, 1)}` : ''} whose size belongs to the parameters:
             start anywhere and you end up on the same loop. The faint orbits on the phase plane started
             elsewhere and joined it too.
             The prey's carrying capacity is ${LAB.fmtInt(P.K)} and the stability threshold is ${LAB.fmt(t.Kcrit, 0)} —
             the environment is too rich for this predator to hold steady.`;
      note = 'Drag K down below the threshold and run again: the same species, in a poorer world, stop cycling.';
    } else if (t.kind === 'damped' || t.kind === 'settle') {
      txt = `The oscillations died away and both populations settled at
             <strong>${LAB.fmt(N, 1)}</strong> prey and <strong>${LAB.fmt(Pp, 1)}</strong> predators, against a predicted
             equilibrium of ${LAB.fmt(t.Nstar, 1)} and ${LAB.fmt(t.Pstar, 1)}.
             ${meas.trend ? `The last cycle was ${LAB.fmt(meas.trend * 100, 1)}% the size of the first — the spiral is genuinely closing.` : ''}
             The faint orbits started somewhere else and arrived at the same place, which is exactly what the
             classic model could not do.`;
      note = `Prey equilibrium N* = ${LAB.fmt(t.Nstar, 1)} contains no prey parameters at all. Raise K and run again: the predators multiply, the prey do not.`;
    } else {
      txt = `The predator could not persist: with these parameters there is no prey density at which it breaks
             even, so it declined from the start.`;
      note = 'Lower the predator mortality m, or raise the attack rate a, until N* drops below the prey ceiling.';
    }
    ui.reading.innerHTML = txt;
    ui.note.textContent = note;
  }

  // Clicking the phase plane restarts from that pair of abundances. In the
  // classic model this is the demonstration: every click gives a different orbit
  // and none of them is the "right" one.
  function bindPhaseClick() {
    const cvs = LAB.$('phase_pd');
    cvs.style.cursor = 'crosshair';
    cvs.addEventListener('click', e => {
      const rect = cvs.getBoundingClientRect();
      const n = plots.phase.ix(e.clientX - rect.left);
      const pp = plots.phase.iy(e.clientY - rect.top);
      const nEl = LAB.$('N0_pd'), pEl = LAB.$('P0_pd');
      ui.N0.set(Math.round(LAB.clamp(n, parseFloat(nEl.min), parseFloat(nEl.max))));
      ui.P0.set(Math.round(LAB.clamp(pp, parseFloat(pEl.min), parseFloat(pEl.max))));
      dirty = true;
      simulate();
      ui.status.textContent = `restarted from N = ${ui.N0.value}, P = ${ui.P0.value}`;
      player.play();
    });
  }

  function onRun() {
    if (player.running) { player.pause(); return; }
    if (dirty || !sim) { simulate(); ui.status.textContent = 'running…'; ui.note.textContent = ''; }
    player.play();
  }
  function ensureSim() {
    if (dirty || !sim) { simulate(); ui.note.textContent = ''; }
  }
  function onSkip() { ensureSim(); player.showAll(); }

  function onReset() {
    player.reset();
    sim = null; dirty = true;
    ui.status.textContent = 'Pick a model, set the sliders, then press Run.';
    ui.note.textContent = '';
    ui.chartStat.textContent = '—';
    refreshTheory();
    ui.reading.innerHTML = 'Press <strong>Run</strong>. Then press it again from a different starting point: in the classic model the cycle you get is the cycle you started with.';
    render(0);
  }

  LAB.ready(() => {
    buildUI();
    LAB.onClick('playBtn_pd', onRun);
    LAB.onClick('endBtn_pd', onSkip);
    LAB.onClick('resetBtn_pd', onReset);
    LAB.bindSteps('pd', player, ensureSim);
    bindPhaseClick();
    onModeChange();
    render(0);
    LAB.onResize(() => player.redraw());
  });
})();
