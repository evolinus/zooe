// The Adaptation Room: three founder fish, each split into a Neutral lineage
// and a Habitat lineage. Five morphological traits (shape, colour, eye size,
// fin size, tail size) are each modeled as an independent diploid locus:
// while monomorphic, it has a per-generation chance (its mutation rate) of
// producing a new variant, which then runs a real diploid Wright-Fisher
// trajectory — the same selection+drift math as the Selection Room, with
// dominance fixed at h=1 — until it fixes (becomes the new baseline, ready
// to mutate again) or is lost. A mutation's effective selection coefficient
// is signed at the moment it arises: positive if it happens to nudge the
// trait in its lineage's habitat-preferred direction, negative otherwise.
// Neutral lineages run identical machinery with every coefficient at zero.
(function () {
  const DOMg = (name) => document.getElementById(`${name}_adapt`);
  const FOUNDERS = ['gigi', 'mario', 'nani'];
  const CONDITIONS = ['neutral', 'habitat'];
  const TRAITS = ['shape', 'colour', 'eyeSize', 'finSize', 'tailSize'];
  const TRAIT_LABEL = { shape: 'Shape', colour: 'Colour', eyeSize: 'Eye size', finSize: 'Fin size', tailSize: 'Tail size' };
  const TRAIT_PARAMS = {
    shape: ['bRxFront', 'bRxBack', 'bRy'],
    colour: ['bodyHue', 'bodyLightness', 'finLightness'],
    eyeSize: ['eyeR'],
    finSize: ['dorsLen', 'analLen'],
    tailSize: ['tailLen', 'tailSpread', 'tailNotch']
  };
  const HABITAT_LABEL = { stream: 'Stream', pond: 'Pond', river: 'River' };
  const HABITAT_DESCRIPTION = {
    stream: 'Favors: slender shape, blue colour, long tail, short fins',
    pond: 'Favors: round shape, red colour, long & less-forked tail, long fins',
    river: 'Favors: green colour, dark fins, big eyes'
  };

  function roundnessOf(v) { return v.bRy / ((v.bRxFront + v.bRxBack) / 2); }
  function finSizeOf(v) { return (v.dorsLen + v.analLen) / 2; }
  function tailSizeOf(v) { return (v.tailLen + v.tailSpread) / 2; }
  // Fraction of tail length the notch reaches toward the tips — a small
  // notch cuts deep back toward the body (a pronounced fork/swallowtail); a
  // large notch barely cuts in near the tips (a solid, triangular paddle).
  // So HIGHER tailNotch means LESS forked, not more.
  function bifurcationOf(v) { return -v.tailNotch / v.tailLen; }
  function hueDist(hue, target) {
    const d = Math.abs(hue - target) % 360;
    return d > 180 ? 360 - d : d;
  }

  // Signed score: positive means the derived values are favored over the
  // ancestral ones for this trait in this habitat. null = not under
  // selection here (effective s stays 0 regardless of direction). Where a
  // trait bundles more than one sub-preference (e.g. Pond's tail wants both
  // longer AND less forked), each sub-score is normalized to a comparable
  // ~0-1 scale before being averaged, so no single sub-parameter dominates
  // just because its natural units happen to be bigger.
  const HABITAT_SCORERS = {
    stream: {
      shape: (a, d) => roundnessOf(a) - roundnessOf(d),        // favors slender (lower roundness)
      colour: (a, d) => (hueDist(a.bodyHue, 210) - hueDist(d.bodyHue, 210)) / 180, // favors blue
      eyeSize: null,
      finSize: (a, d) => finSizeOf(a) - finSizeOf(d),           // favors shorter fins
      tailSize: (a, d) => tailSizeOf(d) - tailSizeOf(a),        // favors longer tail
    },
    pond: {
      shape: (a, d) => roundnessOf(d) - roundnessOf(a),         // favors round
      colour: (a, d) => (hueDist(a.bodyHue, 15) - hueDist(d.bodyHue, 15)) / 180,  // favors red
      eyeSize: null,
      finSize: (a, d) => finSizeOf(d) - finSizeOf(a),           // favors longer fins
      // favors a longer AND less-bifurcated (less forked) tail, averaged
      tailSize: (a, d) => 0.5 * ((tailSizeOf(d) - tailSizeOf(a)) / 32) + 0.5 * (bifurcationOf(a) - bifurcationOf(d)),
    },
    river: {
      shape: null,                                              // no shape preference
      // favors greenish body AND dark fins, averaged
      colour: (a, d) => 0.5 * ((hueDist(a.bodyHue, 120) - hueDist(d.bodyHue, 120)) / 180) + 0.5 * ((a.finLightness - d.finLightness) / 45),
      eyeSize: (a, d) => d.eyeR - a.eyeR,                       // favors bigger eye
      finSize: null,
      tailSize: null,
    }
  };

  const COLORS = { stamp: '#C08A2E', ink: '#262220', inkSoft: '#6b6258' };

  function rand() { return Math.random(); }
  function gauss() {
    const u = 1 - rand(), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // --- DOM ---
  const DOM = {
    sliderG: DOMg('sliderG'), gVal: DOMg('gVal'),
    sliderMutSize: DOMg('sliderMutSize'), mutSizeVal: DOMg('mutSizeVal'),
    btnRun: DOMg('btnRun'), btnReset: DOMg('btnReset'),
    statusBar: DOMg('statusBar'),
    timeScrubber: DOMg('timeScrubber'), scrubVal: DOMg('scrubVal'), scrubMaxLabel: DOMg('scrubMaxLabel'),
    divMatrixWrap: DOMg('divMatrixWrap'),
    avgDeltaSummary: DOMg('avgDeltaSummary'),
    tanglegramWrap: DOMg('tanglegramWrap'),
  };
  const sSliders = {}, muSliders = {}, sVals = {}, muVals = {};
  const TRAIT_ID_SUFFIX = { shape: 'Shape', colour: 'Colour', eyeSize: 'Eye', finSize: 'Fin', tailSize: 'Tail' };
  TRAITS.forEach(t => {
    const cap = TRAIT_ID_SUFFIX[t];
    sSliders[t] = DOMg(`sliderS${cap}`); sVals[t] = DOMg(`s${cap}Val`);
    muSliders[t] = DOMg(`sliderMu${cap}`); muVals[t] = DOMg(`mu${cap}Val`);
  });
  // One N slider per founder — shared by that founder's Neutral and Habitat
  // lineage, which stay separate populations but always the same size.
  const nSliders = {}, nVals = {};
  FOUNDERS.forEach(f => {
    nSliders[f] = DOMg(`sliderN_${f}`);
    nVals[f] = DOMg(`nVal_${f}`);
  });
  const habitatSegs = {}, habitatNames = {};
  FOUNDERS.forEach(f => { habitatSegs[f] = DOMg(`habitatSeg_${f}`); habitatNames[f] = DOMg(`habitatName_${f}`); });
  const g0Canvases = {}, consensusCanvases = {}, traitTableWraps = {}, samplesRows = {}, habitatCaptions = {};
  FOUNDERS.forEach(f => CONDITIONS.forEach(c => {
    g0Canvases[`${f}_${c}`] = DOMg(`g0Canvas_${f}_${c}`);
    consensusCanvases[`${f}_${c}`] = DOMg(`consensusCanvas_${f}_${c}`);
    traitTableWraps[`${f}_${c}`] = DOMg(`traitTableWrap_${f}_${c}`);
    samplesRows[`${f}_${c}`] = DOMg(`samplesRow_${f}_${c}`);
    habitatCaptions[`${f}_${c}`] = DOMg(`habitatCaption_${f}_${c}`);
  }));

  // --- state ---
  let params = {
    G: +DOM.sliderG.value,
    mutSize: +DOM.sliderMutSize.value,
    s: {}, mu: {}, N: {}, habitat: {}
  };
  TRAITS.forEach(t => { params.s[t] = +sSliders[t].value; params.mu[t] = +muSliders[t].value; });
  FOUNDERS.forEach(f => {
    const n = +nSliders[f].value;
    CONDITIONS.forEach(c => { params.N[`${f}_${c}`] = n; });
    params.habitat[f] = habitatSegs[f].querySelector('button.active').dataset.habitat;
  });

  let founders = {}; // f -> full ancestor genome (all fish params)
  let checkpoints = null; // array of { gen, lineages: { key -> { loci: {trait -> snapshot} } } }
  let decileHistory = null; // { gens: [10 generation marks], genomes: { key -> [consensus genome per mark] } }

  function freshFounder() {
    // A moderate one-time perturbation of the default fish ancestor so Gigi,
    // Mario, and Nani start out visibly different from each other.
    return mutate(freshAncestor('fish'), 0.35, 'fish');
  }

  function buildFounders() {
    founders = { gigi: freshFounder(), mario: freshFounder(), nani: freshFounder() };
  }

  // --- per-locus simulation ---
  function newLocusState(founderGenome, trait) {
    const fixedValues = {};
    TRAIT_PARAMS[trait].forEach(p => fixedValues[p] = founderGenome[p]);
    return { fixedValues, segregating: null, fixCount: 0, mutationCount: 0, neutralFixCount: 0, neutralMutationCount: 0 };
  }

  function mutateTraitValues(fixedValues, trait, sigmaFrac) {
    const out = {};
    for (const p of TRAIT_PARAMS[trait]) {
      const def = SHAPES.fish.params[p];
      const range = def.max - def.min;
      if (def.circular) {
        let nv = fixedValues[p] + gauss() * sigmaFrac * range * 0.5;
        nv = ((nv - def.min) % range + range) % range + def.min;
        out[p] = nv;
      } else {
        let nv = fixedValues[p] + gauss() * sigmaFrac * range;
        out[p] = Math.min(def.max, Math.max(def.min, nv));
      }
    }
    return out;
  }

  // Diploid Wright-Fisher step with dominance fixed at h=1 (derived is fully
  // dominant): one generation's binomial resampling of the 2N gene pool.
  function diploidStep(freq, sEff, N) {
    const wAA = 1 + sEff, wAa = 1 + sEff, wbb = 1;
    const wBar = freq * freq * wAA + 2 * freq * (1 - freq) * wAa + (1 - freq) * (1 - freq) * wbb;
    const fPost = wBar > 0 ? (freq * freq * wAA + freq * (1 - freq) * wAa) / wBar : freq;
    const genes = 2 * N;
    let countA = 0;
    for (let i = 0; i < genes; i++) if (rand() < fPost) countA++;
    return countA / genes;
  }

  function stepLocus(locus, trait, N, mu, sMag, habitat, sigmaFrac) {
    if (locus.segregating) {
      const seg = locus.segregating;
      const nf = diploidStep(seg.freq, seg.s, N);
      if (nf <= 0) {
        locus.segregating = null; // lost — ancestral baseline unchanged
      } else if (nf >= 1) {
        locus.fixedValues = seg.derivedValues; // fixed — new baseline
        locus.segregating = null;
        locus.fixCount++;
        if (seg.s === 0) locus.neutralFixCount++;
      } else {
        seg.freq = nf;
      }
    } else if (rand() < mu) {
      const derivedValues = mutateTraitValues(locus.fixedValues, trait, sigmaFrac);
      // sEff stays 0 (selectively neutral) whenever this trait has no scorer
      // for the lineage's habitat (or the lineage is Neutral, habitat=null) —
      // and, rarely, when a scored mutation's derived value lands close
      // enough to ancestral that its signed score rounds to zero anyway.
      let sEff = 0;
      const scorer = habitat ? HABITAT_SCORERS[habitat][trait] : null;
      if (scorer) {
        const score = scorer(locus.fixedValues, derivedValues);
        sEff = Math.abs(score) > 1e-9 ? Math.sign(score) * sMag : 0;
      }
      locus.segregating = { derivedValues, freq: 1 / (2 * N), s: sEff };
      locus.mutationCount++;
      if (sEff === 0) locus.neutralMutationCount++;
    }
  }

  function snapshotLocus(locus) {
    return {
      fixedValues: { ...locus.fixedValues },
      segregating: locus.segregating ? { derivedValues: { ...locus.segregating.derivedValues }, freq: locus.segregating.freq } : null,
      fixCount: locus.fixCount,
      mutationCount: locus.mutationCount,
      neutralFixCount: locus.neutralFixCount,
      neutralMutationCount: locus.neutralMutationCount
    };
  }

  // Renders the panels directly from the live, in-progress `loci` state
  // (not from the `checkpoints` array), so the run can be watched as it
  // computes instead of only being replayable afterward.
  function renderLiveGen(gen, loci, lineageKeys) {
    DOM.scrubVal.textContent = gen;
    lineageKeys.forEach(key => {
      const f = key.split('_')[0];
      const snapLineage = {};
      TRAITS.forEach(t => { snapLineage[t] = snapshotLocus(loci[key][t]); });
      renderLineageCard(key, snapLineage, founders[f], gen);
    });
  }

  // --- full run ---
  async function runSimulation() {
    DOM.btnRun.disabled = true; DOM.btnReset.disabled = true;
    DOM.timeScrubber.disabled = true;
    setControlsDisabled(true);
    DOM.statusBar.textContent = 'Simulating…';
    await new Promise(r => setTimeout(r, 20)); // let the UI paint before the heavy loop

    const G = params.G;
    const CHECKPOINT_COUNT = 200;
    const interval = Math.max(1, Math.round(G / CHECKPOINT_COUNT));
    // Panels update live every G/100 generations as the run computes, paced
    // so the whole run — live plotting included — takes a fixed 8s total,
    // independent of G (the same total duration the old replay-after-the-
    // fact used). The filmstrip still only gains a new shape every G/8
    // generations (decileGens below), since renderLineageCard only draws
    // whichever deciles have data so far — coarser than the render cadence,
    // so a new shape lands within one tick of its decile being reached.
    const RENDER_TICKS = 100;
    const TOTAL_DURATION_MS = 8000;
    const renderInterval = Math.max(1, Math.round(G / RENDER_TICKS));
    const msPerTick = TOTAL_DURATION_MS / RENDER_TICKS;

    const lineageKeys = [];
    FOUNDERS.forEach(f => CONDITIONS.forEach(c => lineageKeys.push(`${f}_${c}`)));

    const loci = {}; // key -> trait -> locus state
    lineageKeys.forEach(key => {
      const f = key.split('_')[0];
      loci[key] = {};
      TRAITS.forEach(t => { loci[key][t] = newLocusState(founders[f], t); });
    });

    checkpoints = [];
    const pushCheckpoint = (gen) => {
      const snap = { gen, lineages: {} };
      lineageKeys.forEach(key => {
        snap.lineages[key] = {};
        TRAITS.forEach(t => { snap.lineages[key][t] = snapshotLocus(loci[key][t]); });
      });
      checkpoints.push(snap);
    };

    pushCheckpoint(0);

    // Consensus-shape snapshots at every G/8 generations, captured (and
    // rendered, via the live render tick below) as the run happens — lets
    // the samples row show accumulated substitutions building up over time,
    // instead of re-deriving genotype diversity from a single checkpoint.
    const decileGens = Array.from({ length: DECILE_COUNT }, (_, i) => Math.round((i + 1) * G / DECILE_COUNT));
    const decileGenomes = {};
    lineageKeys.forEach(key => { decileGenomes[key] = new Array(decileGens.length).fill(null); });
    decileHistory = { gens: decileGens, genomes: decileGenomes };

    for (let gen = 1; gen <= G; gen++) {
      for (const key of lineageKeys) {
        const f = key.split('_')[0], c = key.split('_')[1];
        const N = params.N[key];
        const habitat = c === 'habitat' ? params.habitat[f] : null;
        for (const t of TRAITS) {
          stepLocus(loci[key][t], t, N, params.mu[t], params.s[t], habitat, params.mutSize);
        }
      }
      decileGens.forEach((dg, i) => {
        if (dg !== gen) return;
        lineageKeys.forEach(key => {
          const f = key.split('_')[0];
          const snapLineage = {};
          TRAITS.forEach(t => { snapLineage[t] = snapshotLocus(loci[key][t]); });
          decileGenomes[key][i] = consensusGenomeFor(snapLineage, founders[f]);
        });
      });
      if (gen % interval === 0 || gen === G) pushCheckpoint(gen);
      if (gen % renderInterval === 0 || gen === G) {
        DOM.statusBar.textContent = `Simulating… generation ${gen} / ${G}`;
        renderLiveGen(gen, loci, lineageKeys);
        await new Promise(r => setTimeout(r, msPerTick)); // paced to a fixed 8s total, not just "yield"
      }
    }

    DOM.statusBar.textContent = `Done — ${checkpoints.length} checkpoints across ${G} generations.`;
    DOM.timeScrubber.min = 0;
    DOM.timeScrubber.max = checkpoints.length - 1;
    DOM.timeScrubber.value = checkpoints.length - 1;
    DOM.timeScrubber.disabled = false;
    DOM.scrubMaxLabel.textContent = G;
    DOM.btnRun.disabled = false; DOM.btnReset.disabled = false;
    setControlsDisabled(false);

    renderCheckpoint(checkpoints.length - 1);
    renderDivergenceMatrix();
    renderTanglegram();
  }

  function setControlsDisabled(disabled) {
    DOM.sliderG.disabled = disabled;
    DOM.sliderMutSize.disabled = disabled;
    TRAITS.forEach(t => { sSliders[t].disabled = disabled; muSliders[t].disabled = disabled; });
    FOUNDERS.forEach(f => {
      nSliders[f].disabled = disabled;
      habitatSegs[f].querySelectorAll('button').forEach(b => b.disabled = disabled);
    });
  }

  // --- rendering ---
  function fullGenome(founderGenome, traitValues) {
    // Merges the founder's fixed anatomy with the given per-trait overrides.
    return { ...founderGenome, ...traitValues };
  }

  // habitat is null for a Neutral lineage. A trait row is shaded as "other"
  // whenever this habitat has no scorer for that trait at all — i.e. it was
  // never actually under selection here, regardless of how many mutations it
  // had. Otherwise it's shaded "selected". The aggregate Neutral row (drift
  // that happened even on selected traits) gets its own distinct shade.
  function traitTableHTML(snapLineage, habitat) {
    let totalMuts = 0, totalSubs = 0, neutralMuts = 0, neutralSubs = 0;
    let rows = '';
    TRAITS.forEach(t => {
      const locus = snapLineage[t];
      totalMuts += locus.mutationCount;
      totalSubs += locus.fixCount;
      neutralMuts += locus.neutralMutationCount;
      neutralSubs += locus.neutralFixCount;
      const underSelection = habitat && HABITAT_SCORERS[habitat][t];
      const rowClass = underSelection ? 'adapt-row-selected' : 'adapt-row-other';
      rows += `<tr class="${rowClass}"><td>${TRAIT_LABEL[t]}</td><td class="adapt-num">${locus.mutationCount}</td><td class="adapt-num">${locus.fixCount}</td></tr>`;
    });
    rows += `<tr class="adapt-row-neutralsum"><td>Neutral</td><td class="adapt-num">${neutralMuts}</td><td class="adapt-num">${neutralSubs}</td></tr>`;
    rows += `<tr class="adapt-total"><td>Total</td><td class="adapt-num">${totalMuts}</td><td class="adapt-num">${totalSubs}</td></tr>`;
    return `<table class="adapt-trait-table"><tr><th>Trait</th><th>Mut.</th><th>Subs.</th></tr>${rows}</table>`;
  }

  // Consensus: for each trait, majority phenotype (>50% of individuals),
  // accounting for full dominance — a fraction 1-(1-f)^2 of individuals
  // carry at least one derived copy.
  function consensusGenomeFor(snapLineage, founderGenome) {
    const overrides = {};
    TRAITS.forEach(t => {
      const locus = snapLineage[t];
      let showDerived = false;
      if (locus.segregating) {
        const fracDerived = 1 - (1 - locus.segregating.freq) * (1 - locus.segregating.freq);
        showDerived = fracDerived > 0.5;
      }
      const values = showDerived ? locus.segregating.derivedValues : locus.fixedValues;
      TRAIT_PARAMS[t].forEach(p => overrides[p] = values[p]);
    });
    return fullGenome(founderGenome, overrides);
  }

  const DECILE_COUNT = 8; // 8 is the most that fits on one filmstrip row without wrapping

  // Sizes a canvas to its real rendered width and draws into it — but only if
  // it's actually visible. If the tab is hidden, getBoundingClientRect()
  // returns 0, and setting that (or any guessed fallback) as the canvas's
  // width would stick as an inline style that every later "measure current
  // size" call would just read back, permanently wrong. Skipping instead
  // leaves it for the resize handler to render correctly once visible.
  function sizeAndDraw(canvas, genome) {
    const size = Math.round(canvas.getBoundingClientRect().width);
    if (size <= 0) return;
    const ctx = canvas.getContext('2d');
    scaleCanvas(canvas, ctx, size, size);
    drawGenome(ctx, size, size, genome, 'fish');
  }

  function renderLineageCard(key, snapLineage, founderGenome, currentGen) {
    const [f, c] = key.split('_');
    const habitat = c === 'habitat' ? params.habitat[f] : null;

    traitTableWraps[key].innerHTML = traitTableHTML(snapLineage, habitat);

    habitatCaptions[key].textContent = habitat
      ? HABITAT_DESCRIPTION[habitat]
      : 'No selection — drift only';

    sizeAndDraw(g0Canvases[key], founderGenome);

    const consensusGenome = consensusGenomeFor(snapLineage, founderGenome);
    sizeAndDraw(consensusCanvases[key], consensusGenome);

    // Consensus shape at every G/8 generations reached so far — a filmstrip
    // of accumulating substitutions over time, rather than a snapshot of the
    // current checkpoint's genotype diversity. Only deciles at or before
    // currentGen are shown, so scrubbing/playing forward visibly grows it.
    const row = samplesRows[key];
    row.innerHTML = '';
    if (decileHistory && currentGen !== undefined) {
      decileHistory.gens.forEach((g, i) => {
        if (g > currentGen) return;
        const genome = decileHistory.genomes[key][i];
        if (!genome) return;
        const slot = document.createElement('div');
        slot.className = 'adapt-fish-slot';
        const cvs = document.createElement('canvas');
        slot.appendChild(cvs);
        const label = document.createElement('div');
        label.className = 'adapt-fish-label';
        label.textContent = `G${g}`;
        slot.appendChild(label);
        row.appendChild(slot);
        const size = 55;
        const ctx = cvs.getContext('2d');
        scaleCanvas(cvs, ctx, size, size);
        drawGenome(ctx, size, size, genome, 'fish');
      });
    }
  }

  function renderCheckpoint(idx) {
    if (!checkpoints || !checkpoints[idx]) return;
    const snap = checkpoints[idx];
    DOM.scrubVal.textContent = snap.gen;
    FOUNDERS.forEach(f => CONDITIONS.forEach(c => {
      const key = `${f}_${c}`;
      renderLineageCard(key, snap.lineages[key], founders[f], snap.gen);
    }));
  }

  const LINEAGE_ORDER = [];
  FOUNDERS.forEach(f => CONDITIONS.forEach(c => LINEAGE_ORDER.push(`${f}_${c}`)));
  const LINEAGE_COL_LABEL = (key) => {
    const [f, c] = key.split('_');
    const cap = f.charAt(0).toUpperCase() + f.slice(1);
    return c === 'neutral' ? `${cap}-N` : `${cap}-H`;
  };

  function renderDivergenceMatrix() {
    if (!checkpoints) { DOM.divMatrixWrap.innerHTML = ''; DOM.avgDeltaSummary.textContent = ''; return; }
    const last = checkpoints[checkpoints.length - 1];

    // Precompute each lineage's final consensus genome once.
    const finalGenomes = {};
    LINEAGE_ORDER.forEach(key => {
      finalGenomes[key] = consensusGenomeFor(last.lineages[key], founders[key.split('_')[0]]);
    });

    let html = '<table class="divtable adapt-divmatrix"><tr><th></th>' +
      LINEAGE_ORDER.map(key => `<th>${LINEAGE_COL_LABEL(key)}</th>`).join('') + '</tr>';
    const ownDelta = { neutral: [], habitat: [] };
    FOUNDERS.forEach(f => {
      const cap = f.charAt(0).toUpperCase() + f.slice(1);
      html += `<tr><th>${cap} G0</th>`;
      LINEAGE_ORDER.forEach(key => {
        const d = normDist(founders[f], finalGenomes[key], 'fish');
        html += `<td>${d.toFixed(3)}</td>`;
        if (key === `${f}_neutral`) ownDelta.neutral.push(d);
        if (key === `${f}_habitat`) ownDelta.habitat.push(d);
      });
      html += '</tr>';
    });
    html += '</table>';
    DOM.divMatrixWrap.innerHTML = html;

    const avg = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
    DOM.avgDeltaSummary.textContent =
      `Neutral: ${avg(ownDelta.neutral).toFixed(3)} · Habitat: ${avg(ownDelta.habitat).toFixed(3)}`;
  }

  // True history vs. UPGMA-inferred tree, built from the six lineages' final
  // consensus shapes — same tanglegram idea as the Branching Room, but the
  // true topology here is a root polytomy (Gigi/Mario/Nani arise
  // independently, not by nested splitting from one another), each then
  // splitting into its Neutral and Habitat lineage.
  function renderTanglegram() {
    if (!checkpoints) { DOM.tanglegramWrap.innerHTML = ''; return; }
    const last = checkpoints[checkpoints.length - 1];
    const finalGenomes = {};
    LINEAGE_ORDER.forEach(key => {
      finalGenomes[key] = consensusGenomeFor(last.lineages[key], founders[key.split('_')[0]]);
    });

    // --- UPGMA clustering on the final genomes' pairwise distances ---
    // Keyed by alphabetically-sorted pair (not LINEAGE_ORDER's index order,
    // which isn't alphabetical — e.g. "gigi_neutral" precedes "gigi_habitat"
    // there) so this matches the lookup convention in getClusterDist below.
    const distMatrix = {};
    for (let i = 0; i < LINEAGE_ORDER.length; i++) {
      for (let j = i + 1; j < LINEAGE_ORDER.length; j++) {
        const a = LINEAGE_ORDER[i], b = LINEAGE_ORDER[j];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        distMatrix[key] = normDist(finalGenomes[a], finalGenomes[b], 'fish');
      }
    }
    let clusters = LINEAGE_ORDER.map(key => ({ id: key, count: 1, height: 0 }));
    function getClusterDist(c1, c2) {
      if (c1 === c2) return 0;
      const n1 = c1.split(','), n2 = c2.split(','); let sum = 0;
      for (const a of n1) for (const b of n2) {
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        sum += distMatrix[k];
      }
      return sum / (n1.length * n2.length);
    }
    while (clusters.length > 1) {
      let minDist = Infinity, mergePair = [-1, -1];
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const d = getClusterDist(clusters[i].id, clusters[j].id);
          if (d < minDist) { minDist = d; mergePair = [i, j]; }
        }
      }
      const c1 = clusters[mergePair[0]], c2 = clusters[mergePair[1]];
      const merged = { id: c1.id + ',' + c2.id, count: c1.count + c2.count, height: minDist / 2, left: c1, right: c2 };
      clusters.splice(mergePair[1], 1);
      clusters.splice(mergePair[0], 1, merged);
    }
    const rootCluster = clusters[0];
    const maxH = rootCluster.height || 1;

    // --- layout ---
    const ty = {};
    LINEAGE_ORDER.forEach((key, i) => { ty[key] = 70 + i * 100; });
    FOUNDERS.forEach(f => { ty[f] = (ty[`${f}_neutral`] + ty[`${f}_habitat`]) / 2; });
    const rootY = (ty.gigi + ty.mario + ty.nani) / 3;

    const OUTER_MARGIN = 20, TREE_SPAN = 400;
    const LEFT_START = OUTER_MARGIN, LEFT_END = LEFT_START + TREE_SPAN;
    const GAP_START = LEFT_END, GAP_END = 1000 - OUTER_MARGIN - TREE_SPAN, RIGHT_LEAF_X = GAP_END;
    const RIGHT_MERGE_START = RIGHT_LEAF_X + 40, RIGHT_MERGE_SPAN = TREE_SPAN - 40 - 20;
    const RIGHT_MERGE_END = RIGHT_MERGE_START + RIGHT_MERGE_SPAN, RIGHT_STUB_END = RIGHT_MERGE_END + 20;
    const ROOT_X = LEFT_START, FOUNDER_X = LEFT_START + TREE_SPAN * 0.32, SPLIT_X = LEFT_START + TREE_SPAN * 0.64;

    let svgLines = '';

    // True history: root polytomy (one vertical connector spanning all 3
    // founder branches, no nested pairwise split) then a 2-way split per founder.
    svgLines += `<line x1="${ROOT_X}" y1="${rootY}" x2="${FOUNDER_X}" y2="${rootY}" stroke="var(--ink)" stroke-width="2"/>`;
    svgLines += `<line x1="${FOUNDER_X}" y1="${ty.gigi}" x2="${FOUNDER_X}" y2="${ty.nani}" stroke="var(--ink)" stroke-width="2"/>`;
    FOUNDERS.forEach(f => {
      svgLines += `<line x1="${FOUNDER_X}" y1="${ty[f]}" x2="${SPLIT_X}" y2="${ty[f]}" stroke="var(--ink)" stroke-width="2"/>`;
      svgLines += `<line x1="${SPLIT_X}" y1="${ty[`${f}_neutral`]}" x2="${SPLIT_X}" y2="${ty[`${f}_habitat`]}" stroke="var(--ink)" stroke-width="2"/>`;
      CONDITIONS.forEach(c => {
        const key = `${f}_${c}`;
        svgLines += `<line x1="${SPLIT_X}" y1="${ty[key]}" x2="${LEFT_END}" y2="${ty[key]}" stroke="var(--ink)" stroke-width="2"/>`;
      });
    });

    FOUNDERS.forEach(f => {
      const cap = f.charAt(0).toUpperCase() + f.slice(1);
      svgLines += `
        <foreignObject x="${FOUNDER_X - 25}" y="${ty[f] - 25}" width="50" height="50">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; border-radius:50%; background:var(--paper); border: 2px solid var(--ink); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <canvas id="adapt_true_${f}" width="100" height="100" style="width:50px; height:50px;"></canvas>
          </div>
        </foreignObject>`;
      svgLines += `<text x="${FOUNDER_X}" y="${ty[f] + 40}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" fill="var(--ink-soft)">${cap}</text>`;
    });

    const ICON_W = 80;
    const iconX = GAP_START + (GAP_END - GAP_START - ICON_W) / 2;
    LINEAGE_ORDER.forEach(key => {
      svgLines += `
        <foreignObject x="${iconX}" y="${ty[key] - 40}" width="${ICON_W}" height="80">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; border-radius:4px; background:var(--paper-dim);">
            <canvas id="adapt_final_${key}" width="160" height="160" style="width:80px; height:80px;"></canvas>
          </div>
        </foreignObject>`;
      svgLines += `<text x="${iconX + ICON_W / 2}" y="${ty[key] + 52}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" fill="var(--ink-soft)">${LINEAGE_COL_LABEL(key)}</text>`;
    });

    let upgmaNodes = [];
    function traverseUpgma(node) {
      if (!node.left && !node.right) {
        node.y = ty[node.id]; node.genome = finalGenomes[node.id]; node.isLeaf = true; node.x = RIGHT_LEAF_X;
        return;
      }
      traverseUpgma(node.left); traverseUpgma(node.right);
      node.y = (node.left.y + node.right.y) / 2;
      node.genome = averageGenome(node.left.genome, node.right.genome, 'fish');
      node.isLeaf = false;
      node.x = RIGHT_MERGE_START + (node.height / maxH) * RIGHT_MERGE_SPAN;
      upgmaNodes.push(node);

      svgLines += `<line x1="${node.x}" y1="${node.left.y}" x2="${node.x}" y2="${node.right.y}" stroke="var(--ink)" stroke-width="2"/>`;
      svgLines += `<line x1="${node.x}" y1="${node.left.y}" x2="${node.left.x}" y2="${node.left.y}" stroke="var(--ink)" stroke-width="2"/>`;
      svgLines += `<line x1="${node.x}" y1="${node.right.y}" x2="${node.right.x}" y2="${node.right.y}" stroke="var(--ink)" stroke-width="2"/>`;
    }
    traverseUpgma(rootCluster);
    svgLines += `<line x1="${RIGHT_MERGE_END}" y1="${rootCluster.y}" x2="${RIGHT_STUB_END}" y2="${rootCluster.y}" stroke="var(--ink)" stroke-width="2"/>`;

    upgmaNodes.forEach((node, i) => {
      svgLines += `
        <foreignObject x="${node.x - 25}" y="${node.y - 25}" width="50" height="50">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; border-radius:50%; background:var(--paper); border: 2px dashed var(--ink); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <canvas id="adapt_upgma_${i}" width="100" height="100" style="width:50px; height:50px;"></canvas>
          </div>
        </foreignObject>`;
    });

    svgLines += `<text x="${(LEFT_START + LEFT_END) / 2}" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="var(--ink-soft)">True History</text>`;
    svgLines += `<text x="${(GAP_START + GAP_END) / 2}" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="var(--ink-soft)">Final Shapes</text>`;
    svgLines += `<text x="${(RIGHT_LEAF_X + RIGHT_STUB_END) / 2}" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="var(--ink-soft)">Inferred (UPGMA)</text>`;

    const totalHeight = Math.max(...LINEAGE_ORDER.map(k => ty[k])) + 60;

    DOM.tanglegramWrap.innerHTML = `
      <svg width="1000" height="${totalHeight}" style="background:var(--paper); border:1px solid var(--rule); border-radius:6px; display:block; min-width: 1000px;">
        ${svgLines}
      </svg>`;

    setTimeout(() => {
      FOUNDERS.forEach(f => {
        const ctx = document.getElementById(`adapt_true_${f}`)?.getContext('2d');
        if (ctx) drawGenome(ctx, 100, 100, founders[f], 'fish');
      });
      LINEAGE_ORDER.forEach(key => {
        const ctx = document.getElementById(`adapt_final_${key}`)?.getContext('2d');
        if (ctx) drawGenome(ctx, 160, 160, finalGenomes[key], 'fish');
      });
      upgmaNodes.forEach((node, i) => {
        const ctx = document.getElementById(`adapt_upgma_${i}`)?.getContext('2d');
        if (ctx) drawGenome(ctx, 100, 100, node.genome, 'fish');
      });
    }, 50);
  }

  DOM.timeScrubber.addEventListener('input', (e) => {
    renderCheckpoint(parseInt(e.target.value));
  });

  // --- control wiring ---
  DOM.sliderG.addEventListener('input', () => { params.G = +DOM.sliderG.value; DOM.gVal.textContent = params.G; });
  DOM.sliderMutSize.addEventListener('input', () => { params.mutSize = +DOM.sliderMutSize.value; DOM.mutSizeVal.textContent = params.mutSize.toFixed(2); });

  TRAITS.forEach(t => {
    sSliders[t].addEventListener('input', () => { params.s[t] = +sSliders[t].value; sVals[t].textContent = params.s[t].toFixed(2); });
    muSliders[t].addEventListener('input', () => { params.mu[t] = +muSliders[t].value; muVals[t].textContent = params.mu[t].toFixed(3); });
  });

  FOUNDERS.forEach(f => {
    nSliders[f].addEventListener('input', () => {
      const n = +nSliders[f].value;
      CONDITIONS.forEach(c => { params.N[`${f}_${c}`] = n; });
      nVals[f].textContent = n;
    });
    habitatSegs[f].querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        params.habitat[f] = btn.dataset.habitat;
        habitatSegs[f].querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
        habitatNames[f].textContent = `${f.charAt(0).toUpperCase() + f.slice(1)} — ${HABITAT_LABEL[params.habitat[f]]}`;
        // Re-render (not just the caption text) since the trait table's row
        // shading depends on which traits this habitat selects on.
        renderCurrentView();
      });
    });
  });

  DOM.btnRun.addEventListener('click', () => { runSimulation(); });

  DOM.btnReset.addEventListener('click', () => {
    checkpoints = null;
    decileHistory = null;
    DOM.timeScrubber.min = 0; DOM.timeScrubber.max = 0; DOM.timeScrubber.value = 0;
    DOM.timeScrubber.disabled = true;
    DOM.scrubVal.textContent = 0; DOM.scrubMaxLabel.textContent = 0;
    DOM.statusBar.textContent = 'New founders generated. Configure parameters and press Run.';
    DOM.divMatrixWrap.innerHTML = '';
    DOM.avgDeltaSummary.textContent = '';
    DOM.tanglegramWrap.innerHTML = '';
    init();
  });

  window.addEventListener('resize', () => {
    renderCurrentView();
  });

  function renderCurrentView() {
    if (checkpoints) {
      renderCheckpoint(parseInt(DOM.timeScrubber.value) || checkpoints.length - 1);
    } else {
      // No run yet — show each lineage as an unmutated copy of its founder.
      FOUNDERS.forEach(f => CONDITIONS.forEach(c => {
        const key = `${f}_${c}`;
        const zeroSnap = {};
        TRAITS.forEach(t => { zeroSnap[t] = newLocusState(founders[f], t); });
        renderLineageCard(key, zeroSnap, founders[f]);
      }));
    }
  }

  function init() {
    buildFounders();
    renderCurrentView();
  }

  init();
})();
