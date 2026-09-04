// THE KEYSTONE ROOM — two Lotka–Volterra competitors sharing one predator.
//
//   dN_A/dt = r_A·N_A·(1 − (N_A + α_AB·N_B)/K_A) − a_A·N_A·P
//   dN_B/dt = r_B·N_B·(1 − (N_B + α_BA·N_A)/K_B) − a_B·N_B·P
//   dP/dt   = P·(e·(a_A·N_A + a_B·N_B) − m)
//
// The Neighbours Room's model with a third species bolted on top, and the
// question is a single one: does adding something that eats both competitors
// change which of them survives? It does, and in both directions.
//
// Everything is decided by invasion criteria, exactly as in the Neighbours
// Room, but now they are asked against a resident state that may itself contain
// the predator. With competitor j and the predator resident, competitor i can
// invade when
//
//   r_i·(1 − α_ij·N_j*/K_i) − a_i·P_j* > 0
//
// where (N_j*, P_j*) is what the world looks like with only j and the predator
// in it. The predator enters that criterion twice — once by depressing the
// resident competitor (which helps the invader) and once by eating the invader
// (which hurts it). Which effect wins is the whole room:
//
//   predator prefers the DOMINANT competitor  → it is knocked down, the
//     subordinate gets in, and a competitive exclusion becomes a coexistence.
//     This is keystone predation, and it is why Paine's starfish matter.
//   predator prefers the SUBORDINATE          → exclusion proceeds, faster.
//   no direct competition at all (α = 0)      → the two species can still
//     exclude one another through the predator alone. Apparent competition.
//
// The comparison that makes all of this legible is drawn on every run: the
// pale lines on the time series are the same community simulated without the
// predator, so the counterfactual is always on screen beside the fact.

(function () {
  const FRAMES = 500;
  const SUB = 10;
  const EXTINCT = 0.5;

  const PRESETS = {
    keystone: { pred: 'on',  rA: 0.5, rB: 0.5, KA: 700, KB: 400, aAB: 0.5, aBA: 1.5,
                atkA: 0.008, atkB: 0.002, e: 0.4, m: 0.6, NA0: 60, NB0: 60, P0: 10, T: 250 },
    removed:  { pred: 'off', rA: 0.5, rB: 0.5, KA: 700, KB: 400, aAB: 0.5, aBA: 1.5,
                atkA: 0.008, atkB: 0.002, e: 0.4, m: 0.6, NA0: 60, NB0: 60, P0: 10, T: 250 },
    apparent: { pred: 'on',  rA: 0.5, rB: 0.5, KA: 500, KB: 500, aAB: 0,   aBA: 0,
                atkA: 0.006, atkB: 0.020, e: 0.4, m: 0.6, NA0: 60, NB0: 60, P0: 10, T: 300 },
    wrongOne: { pred: 'on',  rA: 0.5, rB: 0.5, KA: 700, KB: 400, aAB: 0.5, aBA: 1.5,
                atkA: 0.002, atkB: 0.008, e: 0.4, m: 0.4, NA0: 60, NB0: 60, P0: 10, T: 250 }
  };

  let ui, plots, sim = null, dirty = true;

  function buildUI() {
    ui = {
      preset: LAB.segmented('presetSeg_ks', 'preset', { onChange: applyPreset }),
      pred:   LAB.segmented('predSeg_ks', 'pred', { onChange: onStructural }),
      scale:  LAB.segmented('scaleSeg_ks', 'scale', { onChange: () => render(player.frame) }),
      rA:   LAB.slider('rA_ks',   { valueId: 'rAVal_ks',   format: v => v.toFixed(2), onChange: onStructural }),
      KA:   LAB.slider('KA_ks',   { valueId: 'KAVal_ks',   format: v => String(v), onChange: onStructural }),
      aAB:  LAB.slider('aAB_ks',  { valueId: 'aABVal_ks',  format: v => v.toFixed(2), onChange: onStructural }),
      NA0:  LAB.slider('NA0_ks',  { valueId: 'NA0Val_ks',  format: v => String(v), onChange: onStart }),
      rB:   LAB.slider('rB_ks',   { valueId: 'rBVal_ks',   format: v => v.toFixed(2), onChange: onStructural }),
      KB:   LAB.slider('KB_ks',   { valueId: 'KBVal_ks',   format: v => String(v), onChange: onStructural }),
      aBA:  LAB.slider('aBA_ks',  { valueId: 'aBAVal_ks',  format: v => v.toFixed(2), onChange: onStructural }),
      NB0:  LAB.slider('NB0_ks',  { valueId: 'NB0Val_ks',  format: v => String(v), onChange: onStart }),
      atkA: LAB.slider('atkA_ks', { valueId: 'atkAVal_ks', format: v => v.toFixed(3), onChange: onStructural }),
      atkB: LAB.slider('atkB_ks', { valueId: 'atkBVal_ks', format: v => v.toFixed(3), onChange: onStructural }),
      e:    LAB.slider('e_ks',    { valueId: 'eVal_ks',    format: v => v.toFixed(2), onChange: onStructural }),
      m:    LAB.slider('m_ks',    { valueId: 'mVal_ks',    format: v => v.toFixed(2), onChange: onStructural }),
      P0:   LAB.slider('P0_ks',   { valueId: 'P0Val_ks',   format: v => String(v), onChange: onStart }),
      T:    LAB.slider('T_ks',    { valueId: 'TVal_ks',    format: v => String(v), onChange: markDirty }),
      status: LAB.$('status_ks'),
      reading: LAB.$('reading_ks'),
      note: LAB.$('note_ks'),
      chartStat: LAB.$('chartStat_ks'),
      verdict: LAB.$('verdict_ks'),
      invasion: LAB.$('invasion_ks'),
      tDisp: LAB.$('tDisp_ks'),
      aDisp: LAB.$('aDisp_ks'),
      bDisp: LAB.$('bDisp_ks'),
      pDisp: LAB.$('pDisp_ks')
    };
    plots = {
      series: createPlot(LAB.$('chart_ks'), { height: 300 }),
      phase:  createPlot(LAB.$('phase_ks'), { height: 400, padL: 58 }),
      tol:    createPlot(LAB.$('tol_ks'), { height: 210 }),
      diet:   createPlot(LAB.$('diet_ks'), { height: 210 })
    };
  }

  function markDirty() { dirty = true; }
  // Anything that moves an isocline or an invasion criterion refreshes the
  // theory panels immediately: the point of this room is that the outcome is
  // predictable before the run, including the outcome you would have got
  // without the predator.
  function onStructural() {
    markDirty();
    refreshTheory();
    render(player.frame);
  }
  function onStart() { markDirty(); render(player.frame); }

  function applyPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    ui.pred.set(p.pred, true);
    ui.rA.set(p.rA); ui.rB.set(p.rB);
    ui.KA.set(p.KA); ui.KB.set(p.KB);
    ui.aAB.set(p.aAB); ui.aBA.set(p.aBA);
    ui.atkA.set(p.atkA); ui.atkB.set(p.atkB);
    ui.e.set(p.e); ui.m.set(p.m);
    ui.NA0.set(p.NA0); ui.NB0.set(p.NB0); ui.P0.set(p.P0);
    ui.T.set(p.T);
    dirty = true;
    refreshTheory();
    render(0);
    ui.status.textContent = 'preset loaded · press Run';
  }

  // ------------------------------------------------------------- the theory

  function params() {
    return {
      rA: ui.rA.value, rB: ui.rB.value,
      KA: ui.KA.value, KB: ui.KB.value,
      aAB: ui.aAB.value, aBA: ui.aBA.value,
      atkA: ui.atkA.value, atkB: ui.atkB.value,
      e: ui.e.value, m: ui.m.value,
      NA0: ui.NA0.value, NB0: ui.NB0.value,
      P0: ui.P0.value, T: ui.T.value,
      hasPred: ui.pred.value === 'on'
    };
  }

  // What the world looks like with only this competitor and (if it can live
  // there) the predator. A predator that gets nothing from a species — or needs
  // more of it than the species' own carrying capacity allows — simply is not
  // present in that world, and the competitor sits at its own K.
  function resident(r, K, atk, e, m) {
    if (!(atk > 1e-9)) return { N: K, P: 0, predHere: false };
    const Nst = m / (e * atk);
    if (!(Nst < K)) return { N: K, P: 0, predHere: false };
    return { N: Nst, P: (r / atk) * (1 - Nst / K), predHere: true };
  }

  const OUTCOMES = { coexist: 'coexistence', aWins: 'A excludes B', bWins: 'B excludes A',
                     founder: 'founder control' };

  function theory(P) {
    // --- without the predator: the Neighbours Room, unchanged ---
    const aInv0 = P.KA > P.aAB * P.KB;
    const bInv0 = P.KB > P.aBA * P.KA;
    const kindNo = aInv0 && bInv0 ? 'coexist' : aInv0 ? 'aWins' : bInv0 ? 'bWins' : 'founder';
    const den = 1 - P.aAB * P.aBA;
    const eqNo = Math.abs(den) > 1e-9
      ? { NA: (P.KA - P.aAB * P.KB) / den, NB: (P.KB - P.aBA * P.KA) / den }
      : null;

    // --- with the predator ---
    const resA = resident(P.rA, P.KA, P.atkA, P.e, P.m);
    const resB = resident(P.rB, P.KB, P.atkB, P.e, P.m);
    const bInvP = P.rB * (1 - (P.aBA * resA.N) / P.KB) - P.atkB * resA.P;
    const aInvP = P.rA * (1 - (P.aAB * resB.N) / P.KA) - P.atkA * resB.P;
    const kindWith = aInvP > 0 && bInvP > 0 ? 'coexist'
                   : aInvP > 0 ? 'aWins' : bInvP > 0 ? 'bWins' : 'founder';

    // --- the three-species interior equilibrium ---
    // a_A·N_A + a_B·N_B = m/e fixes the predator's food supply; setting the two
    // competitors' per-capita growth rates equal (both equal a·P at equilibrium)
    // gives the second line. Two linear equations, two unknowns.
    let eq3 = null;
    if (P.atkA > 1e-9 && P.atkB > 1e-9) {
      const q1 = P.rA / P.atkA, q2 = P.rB / P.atkB;
      const c1 = [P.atkA, P.atkB, P.m / P.e];
      const c2 = [-q1 / P.KA + (q2 * P.aBA) / P.KB,
                  (-q1 * P.aAB) / P.KA + q2 / P.KB,
                  q2 - q1];
      const det = c1[0] * c2[1] - c1[1] * c2[0];
      if (Math.abs(det) > 1e-12) {
        const NA = (c1[2] * c2[1] - c1[1] * c2[2]) / det;
        const NB = (c1[0] * c2[2] - c1[2] * c2[0]) / det;
        const Pp = (P.rA * (1 - (NA + P.aAB * NB) / P.KA)) / P.atkA;
        if (NA > 0 && NB > 0 && Pp > 0) eq3 = { NA, NB, P: Pp };
      }
    }

    // How much predation each competitor could tolerate before it cannot grow
    // even when rare and alone: r/a. And how much predator each supports on its
    // own — the quantity that decides a pure apparent-competition contest.
    const tolA = P.atkA > 1e-9 ? P.rA / P.atkA : Infinity;
    const tolB = P.atkB > 1e-9 ? P.rB / P.atkB : Infinity;

    return { P, aInv0, bInv0, kindNo, eqNo, resA, resB, aInvP, bInvP, kindWith,
             eq3, tolA, tolB, PstarA: resA.P, PstarB: resB.P };
  }

  // Naming what the predator did. The headline is the *change* between the two
  // outcomes, because that is the room's subject — not what happens, but what
  // difference the predator makes.
  function phenomenon(t, predPersists) {
    const P = t.P;
    if (!P.hasPred) return 'noPredator';
    if (!predPersists) return 'predFails';
    const no = t.kindNo, wi = t.kindWith;
    if (no === wi) return 'noChange';
    if ((no === 'aWins' || no === 'bWins') && wi === 'coexist') return 'keystone';
    if (no === 'coexist' && (wi === 'aWins' || wi === 'bWins')) {
      return (P.aAB < 1e-9 && P.aBA < 1e-9) ? 'apparent' : 'predExcludes';
    }
    if ((no === 'aWins' && wi === 'bWins') || (no === 'bWins' && wi === 'aWins')) return 'reversal';
    if (no === 'founder' && wi === 'coexist') return 'keystone';
    if (wi === 'founder') return 'predFounder';
    return 'noChange';
  }

  const PHENOMENA = {
    keystone: {
      cls: 'is-both', title: 'Keystone predation',
      text: `Without the predator one competitor excludes the other. With it, both persist. The predator eats
             the <em>dominant</em> competitor hardest, holding it below the density at which it could sweep its
             rival away — so a species that cannot survive the competition survives the competition plus a
             predator. Note what this means: removing the predator would not merely cost you the predator. It
             would cost you a competitor too, and that is exactly what Robert Paine found when he removed
             <em>Pisaster</em> starfish from a stretch of Washington shoreline in 1966 and watched mussels take
             the entire rock.`
    },
    apparent: {
      cls: 'is-a', title: 'Apparent competition',
      text: `Look at the two competition coefficients: both are <strong>zero</strong>. These species do not
             compete for anything at all — and one still drives the other out. The only connection between them
             is the predator: the more abundant species feeds more predators, the extra predators eat the other
             species, and the effect is indistinguishable from competition without any competition being
             present. This matters in the field, because two species whose abundances move in opposite
             directions are routinely assumed to be competing for something. They need not be.`
    },
    predExcludes: {
      cls: 'is-a', title: 'The predator breaks a coexistence',
      text: `The two competitors could have shared this world — the competition criteria say so — but the
             predator falls harder on one of them than its rival can compensate for, and that species is lost.
             The predator has added a second axis on which the two must both succeed, and no species is best on
             every axis at once.`
    },
    reversal: {
      cls: 'is-either', title: 'The predator reverses the winner',
      text: `The species that wins the competition without a predator <em>loses</em> it with one. Neither
             coexistence nor the original exclusion: a straight swap. Which competitor is "superior" turns out
             not to be a property of the pair at all — it depends on who else is in the community.`
    },
    predFounder: {
      cls: 'is-either', title: 'The predator makes history decide',
      text: `With the predator present neither competitor can invade the other's established world, so both
             single-competitor states are stable and whichever species arrives first keeps the site. The
             predator has converted a predictable outcome into a historical accident.`
    },
    noChange: {
      cls: '', title: 'The predator changes nothing',
      text: `The same competitor wins with the predator as without it. A predator is not automatically a
             keystone — it only restructures a community when it presses hardest on the species that was
             winning. Here it either eats the wrong one, or does not eat hard enough to matter. Try swapping the
             two attack rates.`
    },
    predFails: {
      cls: 'is-b', title: 'The predator cannot persist',
      text: `The predator dies out: the competitors it can catch do not, between them, feed it fast enough to
             cover its mortality. The community reverts to pure competition and the answer is the Neighbours
             Room's answer. Lower the predator's mortality <em>m</em>, or raise an attack rate, until it can
             hold on.`
    },
    noPredator: {
      cls: '', title: 'Competition alone',
      text: `The predator is switched off, so this is the Neighbours Room: two competitors and nothing else.
             Note the outcome, then switch the predator on and run again without touching anything else.`
    }
  };

  function showVerdict(t, ran, predPersists) {
    const key = phenomenon(t, predPersists);
    const V = PHENOMENA[key];
    ui.verdict.className = 'verdict ' + V.cls;
    let html = `<h4>${V.title}</h4><p>${V.text}</p>`;
    html += `<p class="mono" style="font-size:12px;">`
          + `Without the predator: <strong>${OUTCOMES[t.kindNo]}</strong><br>`
          + `With the predator: <strong>${t.P.hasPred && predPersists ? OUTCOMES[t.kindWith] : '—'}</strong></p>`;
    if (t.P.hasPred && t.eq3) {
      html += `<p class="mono" style="font-size:12px;">Three-species equilibrium: `
            + `A = ${LAB.fmt(t.eq3.NA, 0)}, B = ${LAB.fmt(t.eq3.NB, 0)}, P = ${LAB.fmt(t.eq3.P, 0)}.</p>`;
    }
    if (!ran) html += `<p style="font-size:13px;color:var(--ink-soft);">Read off the parameters before running. Press Run to watch it happen.</p>`;
    ui.verdict.innerHTML = html;
    return key;
  }

  function refreshTheory() {
    const t = theory(params()), P = t.P;

    let html = `<p style="font-size:13px;margin:0 0 6px;"><strong>Without the predator</strong> — can each
                species increase when rare, against a rival sitting at its own K?</p>`;
    html += LAB.condRow(`A: K<sub>A</sub> (${LAB.fmtInt(P.KA)}) &gt; α<sub>AB</sub>K<sub>B</sub> (${LAB.fmt(P.aAB * P.KB, 0)})`, t.aInv0);
    html += LAB.condRow(`B: K<sub>B</sub> (${LAB.fmtInt(P.KB)}) &gt; α<sub>BA</sub>K<sub>A</sub> (${LAB.fmt(P.aBA * P.KA, 0)})`, t.bInv0);

    html += `<p style="font-size:13px;margin:12px 0 6px;"><strong>With the predator</strong> — same question,
             but the rival's world now contains a predator that eats the invader too.</p>`;
    html += LAB.condRow(`A invades B + predator (${t.aInvP > 0 ? '+' : ''}${LAB.fmt(t.aInvP, 3)})`, t.aInvP > 0);
    html += LAB.condRow(`B invades A + predator (${t.bInvP > 0 ? '+' : ''}${LAB.fmt(t.bInvP, 3)})`, t.bInvP > 0);

    const cell = v => (isFinite(v) ? LAB.fmt(v, 1) : '∞');
    html += `<table class="datatable" style="margin-top:12px;"><thead><tr><th>Alone with the predator</th>`
          + `<th>competitor</th><th>predators</th></tr></thead><tbody>`;
    html += `<tr><td style="color:var(--sp-a)">A</td><td>${cell(t.resA.N)}</td>`
          + `<td>${t.resA.predHere ? cell(t.resA.P) : 'none'}</td></tr>`;
    html += `<tr><td style="color:var(--sp-b)">B</td><td>${cell(t.resB.N)}</td>`
          + `<td>${t.resB.predHere ? cell(t.resB.P) : 'none'}</td></tr>`;
    html += `</tbody></table>`;
    html += `<p style="font-size:12.5px;color:var(--ink-soft);margin:8px 0 0;">When the two species do not
             compete directly at all, the one that supports the <em>higher</em> predator density excludes the
             other — the mirror image of the R* rule in the Coexistence Room, and just as unforgiving.</p>`;

    ui.invasion.innerHTML = html;
    if (!sim) showVerdict(t, false, true);
    return t;
  }

  // ------------------------------------------------------------- simulation

  function trajectory(P, withPred) {
    const deriv = ([NA, NB, Pp]) => [
      P.rA * NA * (1 - (NA + P.aAB * NB) / P.KA) - P.atkA * NA * Pp,
      P.rB * NB * (1 - (NB + P.aBA * NA) / P.KB) - P.atkB * NB * Pp,
      withPred ? Pp * (P.e * (P.atkA * NA + P.atkB * NB) - P.m) : 0
    ];
    const dt = P.T / FRAMES / SUB;
    let y = [P.NA0, P.NB0, withPred ? P.P0 : 0];
    const As = new Float64Array(FRAMES + 1), Bs = new Float64Array(FRAMES + 1),
          Ps = new Float64Array(FRAMES + 1);
    As[0] = y[0]; Bs[0] = y[1]; Ps[0] = y[2];
    for (let i = 1; i <= FRAMES; i++) {
      for (let s = 0; s < SUB; s++) {
        y = LAB.rk4(y, dt, deriv);
        for (let k = 0; k < 3; k++) if (!(y[k] > EXTINCT)) y[k] = 0;
      }
      As[i] = y[0]; Bs[i] = y[1]; Ps[i] = y[2];
    }
    return { As, Bs, Ps };
  }

  function simulate() {
    const P = params();
    const t = theory(P);
    const main = trajectory(P, P.hasPred);
    // The counterfactual is always computed, and drawn whenever it differs from
    // the run: "what this community would have done with no predator in it" is
    // the comparison the whole room is built on.
    const counter = P.hasPred ? trajectory(P, false) : null;

    let peak = 0;
    for (let i = 0; i <= FRAMES; i++) {
      peak = Math.max(peak, main.As[i], main.Bs[i], main.Ps[i]);
      if (counter) peak = Math.max(peak, counter.As[i], counter.Bs[i]);
    }
    const predPersists = !P.hasPred || main.Ps[FRAMES] > 0;

    sim = { P, t, ...main, counter, peak, predPersists };
    dirty = false;
    player.load(FRAMES);
  }

  // ---------------------------------------------------------------- drawing

  function current() { return sim ? sim.P : params(); }
  function currentTheory() { return sim ? sim.t : theory(params()); }

  function drawSeries(frame) {
    const p = plots.series;
    const P = current();
    const log = ui.scale.value === 'log';
    const peak = sim ? sim.peak : Math.max(P.KA, P.KB);
    p.begin({ height: 300, xMin: 0, xMax: P.T, yMin: log ? 0.5 : 0, yMax: Math.max(peak * 1.15, 1),
              yLog: log, xLabel: 'Time', yLabel: 'Population size' });
    p.grid();
    if (!sim) { p.frame(); return; }

    // Counterfactual first, underneath everything.
    if (sim.counter) {
      const ca = [], cb = [];
      for (let i = 0; i <= frame; i++) {
        const x = (i / FRAMES) * P.T;
        ca.push([x, sim.counter.As[i]]);
        cb.push([x, sim.counter.Bs[i]]);
      }
      p.line(ca, { color: LAB.C.spA, width: 1.4, dash: [5, 4], alpha: 0.45 });
      p.line(cb, { color: LAB.C.spB, width: 1.4, dash: [5, 4], alpha: 0.45 });
    }

    const pa = [], pb = [], pp = [];
    for (let i = 0; i <= frame; i++) {
      const x = (i / FRAMES) * P.T;
      pa.push([x, sim.As[i]]);
      pb.push([x, sim.Bs[i]]);
      pp.push([x, sim.Ps[i]]);
    }
    p.line(pa, { color: LAB.C.spA, width: 2.4 });
    p.line(pb, { color: LAB.C.spB, width: 2.4 });
    if (P.hasPred) p.line(pp, { color: LAB.C.pred, width: 2.4 });

    const now = (frame / FRAMES) * P.T;
    p.cursor(now);
    p.dot(now, sim.As[frame], { color: LAB.C.spA, r: 4, ring: LAB.C.paper });
    p.dot(now, sim.Bs[frame], { color: LAB.C.spB, r: 4, ring: LAB.C.paper });
    if (P.hasPred) p.dot(now, sim.Ps[frame], { color: LAB.C.pred, r: 4, ring: LAB.C.paper });

    const items = [{ color: LAB.C.spA, label: 'competitor A' },
                   { color: LAB.C.spB, label: 'competitor B' }];
    if (P.hasPred) {
      items.push({ color: LAB.C.pred, label: 'predator' });
      items.push({ color: LAB.C.inkSoft, label: 'without predator', dash: [5, 4] });
    }
    p.legend(items, { right: false });
    p.frame();
  }

  // Framed on the carrying capacities and on what the run actually visited. The
  // no-predator isoclines can reach K_A/α_AB, which with a small α is far above
  // anything that ever happens — letting that set the scale would squeeze the
  // whole community into one corner, so those lines are allowed to run off the
  // top and are clipped instead.
  function phaseBounds() {
    const P = current();
    let pa = P.NA0, pb = P.NB0;
    if (sim) {
      for (let i = 0; i <= FRAMES; i++) {
        pa = Math.max(pa, sim.As[i]);
        pb = Math.max(pb, sim.Bs[i]);
        if (sim.counter) {
          pa = Math.max(pa, sim.counter.As[i]);
          pb = Math.max(pb, sim.counter.Bs[i]);
        }
      }
    }
    const xMax = Math.min(P.KA * 1.6, Math.max(P.KA, pa)) * 1.14;
    const yMax = Math.min(P.KB * 1.6, Math.max(P.KB, pb)) * 1.14;
    return { xMax: Math.max(xMax, 1), yMax: Math.max(yMax, 1) };
  }

  // The competitors' phase plane, drawn at the predator density of the current
  // frame. Predation shrinks each isocline towards the origin — species i's
  // intercept falls from K_i to K_i(1 − a_i·P/r_i) — so as the predator builds
  // up you watch the two lines slide inward at different speeds, and the
  // geometry of the Neighbours Room rearranges itself into a different outcome.
  function isocline(K, alpha, r, atk, Pp) {
    const eff = K * (1 - (r > 1e-9 ? (atk * Pp) / r : 0));
    return eff > 0 ? eff : 0;         // effective carrying capacity under predation
  }

  function drawPhase(frame) {
    const p = plots.phase;
    const P = current(), t = currentTheory();
    const { xMax, yMax } = phaseBounds();
    const Pnow = sim ? sim.Ps[frame] : (P.hasPred ? P.P0 : 0);

    p.begin({ height: 400, padL: 58, xMin: 0, xMax, yMin: 0, yMax,
              xLabel: 'Competitor A', yLabel: 'Competitor B' });
    p.grid({ xTicks: 5, yTicks: 5 });

    // Which way the two competitors are pushed, at this predator density.
    p.field((na, nb) => [
      P.rA * na * (1 - (na + P.aAB * nb) / P.KA) - P.atkA * na * Pnow,
      P.rB * nb * (1 - (nb + P.aBA * na) / P.KB) - P.atkB * nb * Pnow
    ], { alpha: 0.3 });

    // Isoclines, trajectories and equilibria can all leave the frame — an
    // isocline reaching K/α, a counterfactual heading for a carrying capacity
    // off the top. Clip once, here, so nothing paints over the axes.
    p.clipped(() => {
      const drawIso = (style, Pp) => {
        const effA = isocline(P.KA, P.aAB, P.rA, P.atkA, Pp);
        const effB = isocline(P.KB, P.aBA, P.rB, P.atkB, Pp);
        if (effA > 0) {
          p.line([[effA, 0], [0, P.aAB > 1e-6 ? effA / P.aAB : yMax * 10]],
                 Object.assign({ color: LAB.C.spA }, style));
        }
        if (effB > 0) {
          p.line([[0, effB], [P.aBA > 1e-6 ? effB / P.aBA : xMax * 10, 0]],
                 Object.assign({ color: LAB.C.spB }, style));
        }
      };
      if (P.hasPred) drawIso({ width: 1.3, dash: [5, 4], alpha: 0.45 }, 0);
      drawIso({ width: 2.2 }, Pnow);

      // Equilibria: single-species, the competition-only interior one, and the
      // three-species one the community is actually heading for.
      p.dot(P.KA, 0, { color: LAB.C.spA, r: 4.5, ring: LAB.C.paper, alpha: 0.6 });
      p.dot(0, P.KB, { color: LAB.C.spB, r: 4.5, ring: LAB.C.paper, alpha: 0.6 });
      if (t.eqNo && t.eqNo.NA > 0 && t.eqNo.NB > 0 && P.hasPred) {
        p.dot(t.eqNo.NA, t.eqNo.NB, { color: LAB.C.inkSoft, r: 4.5, alpha: 0.5 });
      }

      if (sim) {
        if (sim.counter) {
          const ct = [];
          for (let i = 0; i <= frame; i++) ct.push([sim.counter.As[i], sim.counter.Bs[i]]);
          p.line(ct, { color: LAB.C.inkSoft, width: 1.3, dash: [5, 4], alpha: 0.5 });
        }
        const traj = [];
        for (let i = 0; i <= frame; i++) traj.push([sim.As[i], sim.Bs[i]]);
        p.line(traj, { color: LAB.C.ink, width: 2 });
        p.dot(sim.As[0], sim.Bs[0], { color: LAB.C.inkSoft, r: 4 });
        p.dot(sim.As[frame], sim.Bs[frame], { color: LAB.C.ink, r: 5.5, ring: LAB.C.paper });
      } else {
        p.dot(P.NA0, P.NB0, { color: LAB.C.inkSoft, r: 4.5 });
      }
      if (P.hasPred && t.eq3) p.dot(t.eq3.NA, t.eq3.NB, { color: LAB.C.cap, r: 6.5, ring: LAB.C.paper });
    });
    p.frame();
  }

  // Each competitor's per-capita growth rate when it is rare and alone, as a
  // function of how many predators there are. Where a line crosses zero is the
  // most predation that species can stand: r_i/a_i.
  function drawTolerance(frame) {
    const p = plots.tol;
    const P = current(), t = currentTheory();
    const Pnow = sim ? sim.Ps[frame] : (P.hasPred ? P.P0 : 0);
    const marks = [t.tolA, t.tolB, t.PstarA, t.PstarB, Pnow].filter(v => isFinite(v) && v > 0);
    const xMax = Math.max(...marks, 1) * 1.2;
    const yMax = Math.max(P.rA, P.rB) * 1.25;
    const yMin = -Math.max(P.rA, P.rB) * 0.5;

    p.begin({ height: 210, xMin: 0, xMax, yMin, yMax,
              xLabel: 'Predator density P', yLabel: 'growth when rare' });
    p.grid({ xTicks: 4, yTicks: 4 });
    p.line([[0, 0], [xMax, 0]], { color: LAB.C.ink, width: 1, alpha: 0.5 });
    p.line([[0, P.rA], [xMax, P.rA - P.atkA * xMax]], { color: LAB.C.spA, width: 2.2 });
    p.line([[0, P.rB], [xMax, P.rB - P.atkB * xMax]], { color: LAB.C.spB, width: 2.2 });

    // The predator density each competitor supports on its own. Under pure
    // apparent competition the winner is whichever of these is larger.
    if (t.resA.predHere) p.vline(t.PstarA, { color: LAB.C.spA, dash: [4, 3], alpha: 0.75, label: 'P* from A' });
    if (t.resB.predHere) p.vline(t.PstarB, { color: LAB.C.spB, dash: [4, 3], alpha: 0.75, label: 'P* from B' });
    if (P.hasPred && Pnow > 0) p.vline(Pnow, { color: LAB.C.ink, dash: [2, 3], alpha: 0.6 });
    p.frame();
  }

  // What the predator is actually eating: the share of its intake taken from
  // each competitor. In a keystone run this sits lopsidedly on the dominant
  // competitor, which is the mechanism in one picture.
  function drawDiet(frame) {
    const p = plots.diet;
    const P = current();
    p.begin({ height: 210, xMin: 0, xMax: P.T, yMin: 0, yMax: 1,
              xLabel: 'Time', yLabel: "share of predator's diet" });
    p.grid({ xTicks: 4, yTicks: 4, yFmt: v => Math.round(v * 100) + '%' });

    if (!sim || !P.hasPred) {
      p.text(P.T / 2, 0.5, P.hasPred ? 'press Run' : 'no predator in this community',
             { align: 'center', color: LAB.C.inkSoft });
      p.frame();
      return;
    }

    const shareA = [];
    for (let i = 0; i <= frame; i++) {
      const inA = P.atkA * sim.As[i], inB = P.atkB * sim.Bs[i];
      const tot = inA + inB;
      shareA.push([(i / FRAMES) * P.T, tot > 1e-12 ? inA / tot : 0]);
    }
    // B's share is whatever is left over, so fill the whole column in B's colour
    // and lay A's share on top of it. A's fill has to be nearly opaque or the two
    // translucent washes mix into a third colour that means nothing.
    p.area([[0, 1], [(frame / FRAMES) * P.T, 1]], { color: LAB.C.spB, alpha: 0.28 });
    p.area(shareA, { color: LAB.C.spA, alpha: 0.9 });
    p.line(shareA, { color: LAB.C.ink, width: 1.6 });
    p.cursor((frame / FRAMES) * P.T);
    p.legend([{ color: LAB.C.spA, label: 'from A' }, { color: LAB.C.spB, label: 'from B' }],
             { right: true, bottom: true });
    p.frame();
  }

  function render(frame) {
    drawSeries(frame);
    drawPhase(frame);
    drawTolerance(frame);
    drawDiet(frame);
    const P = current();
    if (sim) {
      const now = (frame / FRAMES) * P.T;
      ui.chartStat.textContent = `t = ${LAB.fmt(now, 0)} · A = ${LAB.fmt(sim.As[frame], 0)}`
        + ` · B = ${LAB.fmt(sim.Bs[frame], 0)}` + (P.hasPred ? ` · P = ${LAB.fmt(sim.Ps[frame], 0)}` : '');
      ui.tDisp.textContent = LAB.fmt(now, 0);
      ui.aDisp.textContent = LAB.fmt(sim.As[frame], 0);
      ui.bDisp.textContent = LAB.fmt(sim.Bs[frame], 0);
      ui.pDisp.textContent = P.hasPred ? LAB.fmt(sim.Ps[frame], 0) : '—';
    } else {
      ui.tDisp.textContent = '0';
      ui.aDisp.textContent = LAB.fmtInt(P.NA0);
      ui.bDisp.textContent = LAB.fmtInt(P.NB0);
      ui.pDisp.textContent = P.hasPred ? LAB.fmtInt(P.P0) : '—';
    }
  }

  const player = LAB.createPlayer({
    scrubberId: 'scrub_ks',
    scrubValueId: 'scrubVal_ks',
    playBtnId: 'playBtn_ks',
    playLabel: '▶ Run', pauseLabel: '⏸ Pause',
    fps: 70,
    scrubFormat: i => (sim ? LAB.fmt((i / FRAMES) * sim.P.T, 0) : '0'),
    render,
    onEnd: finish
  });

  function finish() {
    if (!sim) return;
    const { P, t } = sim;
    const A = sim.As[FRAMES], B = sim.Bs[FRAMES], Pp = sim.Ps[FRAMES];
    const key = showVerdict(t, true, sim.predPersists);
    ui.status.textContent = `done · A = ${LAB.fmt(A, 0)} · B = ${LAB.fmt(B, 0)}`
      + (P.hasPred ? ` · P = ${LAB.fmt(Pp, 0)}` : '');

    const cA = sim.counter ? sim.counter.As[FRAMES] : null;
    const cB = sim.counter ? sim.counter.Bs[FRAMES] : null;
    let txt, note;

    if (!P.hasPred) {
      txt = `Pure competition, no predator: A finished at <strong>${LAB.fmt(A, 0)}</strong> and B at
             <strong>${LAB.fmt(B, 0)}</strong> — the Neighbours Room's answer, and the baseline everything else
             in this room is measured against. Now switch the predator on and run again, changing nothing else.`;
      note = 'The predator sliders are still live while it is switched off — set it up first, then let it in.';
    } else if (!sim.predPersists) {
      txt = `The predator went extinct, so the community ended where competition alone would have taken it:
             A at <strong>${LAB.fmt(A, 0)}</strong>, B at <strong>${LAB.fmt(B, 0)}</strong>. A predator that
             cannot feed itself cannot restructure anything.`;
      note = 'Raise an attack rate or lower the predator mortality m until it can persist.';
    } else if (key === 'keystone') {
      txt = `Both competitors survived — A at <strong>${LAB.fmt(A, 0)}</strong>, B at
             <strong>${LAB.fmt(B, 0)}</strong>, with ${LAB.fmt(Pp, 0)} predators — and the pale dashed lines
             show what the very same community did without the predator: B fell to ${LAB.fmt(cB, 0)} while A
             climbed to ${LAB.fmt(cA, 0)}. The predator is taking
             ${LAB.fmt(100 * (P.atkA * A) / (P.atkA * A + P.atkB * B || 1), 0)}% of its diet from A, which is
             precisely why B is still here. <strong>Remove the predator and you lose two species, not one.</strong>`;
      note = 'Now raise the predator\'s mortality m slowly. There is a point where it can no longer persist — and B goes with it.';
    } else if (key === 'apparent') {
      txt = `One competitor was eliminated, and the two never competed for anything: both α values are zero.
             The loser was destroyed entirely by predators fed by its neighbour. A finished at
             <strong>${LAB.fmt(A, 0)}</strong> and B at <strong>${LAB.fmt(B, 0)}</strong>, whereas without the
             predator they sat at ${LAB.fmt(cA, 0)} and ${LAB.fmt(cB, 0)} — side by side, indefinitely,
             ignoring each other.`;
      note = 'The survivor is the one that supports the higher predator density, not the one that grows faster or eats better.';
    } else if (key === 'reversal') {
      txt = `The winner changed sides. Without the predator, ${t.kindNo === 'aWins' ? 'A excluded B' : 'B excluded A'};
             with it, ${t.kindWith === 'aWins' ? 'A won' : 'B won'} instead — A at <strong>${LAB.fmt(A, 0)}</strong>,
             B at <strong>${LAB.fmt(B, 0)}</strong>, against ${LAB.fmt(cA, 0)} and ${LAB.fmt(cB, 0)} in the
             predator-free counterfactual. "Superior competitor" is not a property you can measure once and
             carry to another community.`;
      note = 'Competitive ability and resistance to predation are different traits, and nothing requires one species to have both.';
    } else if (key === 'noChange') {
      txt = `The predator persisted but changed nothing about who won: A ended at <strong>${LAB.fmt(A, 0)}</strong>
             and B at <strong>${LAB.fmt(B, 0)}</strong>, the same outcome as the predator-free run
             (${LAB.fmt(cA, 0)} and ${LAB.fmt(cB, 0)}) — only at lower densities. Predation reduced the
             community without reorganising it.`;
      note = 'Swap the two attack rates and run again. The same predator, eating the other species, is a different ecological force.';
    } else {
      txt = `A finished at <strong>${LAB.fmt(A, 0)}</strong>, B at <strong>${LAB.fmt(B, 0)}</strong> and the
             predator at ${LAB.fmt(Pp, 0)}, against ${LAB.fmt(cA, 0)} and ${LAB.fmt(cB, 0)} without the
             predator. The predator has changed the outcome of the competition.`;
      note = 'Compare the solid lines with the pale dashed ones — that gap is the predator\'s whole effect.';
    }
    ui.reading.innerHTML = txt;
    ui.note.textContent = note;
  }

  function bindPhaseClick() {
    const cvs = LAB.$('phase_ks');
    cvs.style.cursor = 'crosshair';
    cvs.addEventListener('click', e => {
      const rect = cvs.getBoundingClientRect();
      const na = plots.phase.ix(e.clientX - rect.left);
      const nb = plots.phase.iy(e.clientY - rect.top);
      const el = LAB.$('NA0_ks');
      const lo = parseFloat(el.min), hi = parseFloat(el.max);
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
  function ensureSim() {
    if (dirty || !sim) { simulate(); ui.note.textContent = ''; }
  }
  function onSkip() { ensureSim(); player.showAll(); }

  function onReset() {
    player.reset();
    sim = null; dirty = true;
    ui.status.textContent = 'Pick a preset or set the sliders, then press Run.';
    ui.note.textContent = '';
    ui.chartStat.textContent = '—';
    refreshTheory();
    ui.reading.innerHTML = 'Press <strong>Run</strong>. Then switch the predator off and run again, changing nothing else — the question this room asks is what difference the predator makes.';
    render(0);
  }

  LAB.ready(() => {
    buildUI();
    LAB.onClick('playBtn_ks', onRun);
    LAB.onClick('endBtn_ks', onSkip);
    LAB.onClick('resetBtn_ks', onReset);
    LAB.bindSteps('ks', player, ensureSim);
    bindPhaseClick();
    refreshTheory();
    render(0);
    LAB.onResize(() => player.redraw());
  });
})();
