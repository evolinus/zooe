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
  // Fills {placeholders} in an English template string.

  const DOMg = (name) => document.getElementById(`${name}_adapt`);
  const FOUNDERS = ['gigi', 'mario', 'nani'];
  const CONDITIONS = ['neutral', 'habitat'];

  // The three founders are NOT independent draws. Before the adaptation run
  // begins, one ancestor is copied and mutated through three splits — the same
  // process as the Branching Room — producing an OUTGROUP plus three ingroup
  // tips whose true topology is (Out,(a,(b,c))). Gigi, Mario and Nani are then
  // assigned to a, b and c at random, so the branching order is real but not
  // guessable from the names. Without this the true history was a root
  // polytomy: there was no branching order for UPGMA/NJ to recover or miss.
  const OUTGROUP = 'outgroup';
  const PRE = {
    gens: 1000,        // generations from the root to each INGROUP tip
    split2: 300,       // one ingroup tip separates here
    split3: 700,       // the remaining two separate here
    outgroupGens: 4000, // the outgroup's own branch — deliberately much longer
    mutSize: 3         // on the Branching Room's 0..50 mutation-size scale
  };
  // The same slider-to-sigma mapping the Branching Room uses. Kept LOW on
  // purpose: the fish parameters are bounded, and above ~sigma 0.015 a
  // 1000-generation walk saturates against those bounds, which makes every tip
  // equidistant from every other and erases the branching order entirely. A
  // bigger mutation size looks like it should separate the lineages more; it
  // actually destroys the only signal the reconstruction has to work with.
  const PRE_SIGMA = 0.005 + (PRE.mutSize / 50) * 0.12;
  const TRAITS = ['shape', 'colour', 'eyeSize', 'finSize', 'tailSize'];
  const TRAIT_LABEL = { shape: 'Shape', colour: 'Colour', eyeSize: 'Eye size', finSize: 'Fin size', tailSize: 'Tail size' };
  const traitLabel = (t) => T('ad.trait.' + t, TRAIT_LABEL[t]);
  const TRAIT_PARAMS = {
    shape: ['bRxFront', 'bRxBack', 'bRy'],
    colour: ['bodyHue', 'bodyLightness', 'finLightness'],
    eyeSize: ['eyeR'],
    finSize: ['dorsLen', 'analLen'],
    tailSize: ['tailLen', 'tailSpread', 'tailNotch']
  };
  const HABITAT_LABEL = { stream: 'Stream', pond: 'Pond', river: 'River' };
  const habitatLabel = (h) => T('ad.hab.' + h, HABITAT_LABEL[h]);
  const HABITAT_DESCRIPTION = {
    stream: 'Favours: slender shape, blue colour, long tail, short fins',
    pond: 'Favours: round shape, red colour, short & less-forked tail, long fins',
    river: 'Favours: green colour, dark fins, big eyes'
  };
  const habitatDescription = (h) => T('ad.habDesc.' + h, HABITAT_DESCRIPTION[h]);

  const setStatus = (fn) => { DOM.statusBar.textContent = fn(); };

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
  // ancestral ones for this trait in this habitat. null = not under selection
  // here (effective s stays 0 regardless of direction). Only the SIGN of the
  // score is used (see stepLocus: sEff = sign(score) · sMag), so a single-
  // preference scorer needs no normalization — its raw difference already has
  // the right sign. Normalization matters only where a trait bundles two
  // sub-preferences (Pond's tail, River's colour): there each half is scaled
  // to a comparable ~0-1 range first, so the SIGN of their sum reflects both
  // preferences fairly rather than being dominated by whichever sub-parameter
  // happens to have the bigger natural units.
  const HABITAT_SCORERS = {
    stream: {
      shape: (a, d) => roundnessOf(a) - roundnessOf(d),          // favors slender (lower roundness)
      colour: (a, d) => hueDist(a.bodyHue, 210) - hueDist(d.bodyHue, 210), // favors blue
      eyeSize: null,
      finSize: (a, d) => finSizeOf(a) - finSizeOf(d),            // favors shorter fins
      tailSize: (a, d) => tailSizeOf(d) - tailSizeOf(a),         // favors longer tail
    },
    pond: {
      shape: (a, d) => roundnessOf(d) - roundnessOf(a),          // favors round
      colour: (a, d) => hueDist(a.bodyHue, 15) - hueDist(d.bodyHue, 15),  // favors red
      eyeSize: null,
      finSize: (a, d) => finSizeOf(d) - finSizeOf(a),            // favors longer fins
      // favors a shorter AND less-bifurcated (less forked) tail, averaged
      tailSize: (a, d) => 0.5 * ((tailSizeOf(a) - tailSizeOf(d)) / 32) + 0.5 * (bifurcationOf(a) - bifurcationOf(d)),
    },
    river: {
      shape: null,                                               // no shape preference
      // favors greenish body AND dark fins, averaged
      colour: (a, d) => 0.5 * ((hueDist(a.bodyHue, 120) - hueDist(d.bodyHue, 120)) / 180) + 0.5 * ((a.finLightness - d.finLightness) / 45),
      eyeSize: (a, d) => d.eyeR - a.eyeR,                        // favors bigger eye
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
    presets: DOMg('presets'),
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
  const habitatSegs = {}, founderRows = {}, founderNLabels = {};
  FOUNDERS.forEach(f => {
    habitatSegs[f] = DOMg(`habitatSeg_${f}`);
    founderRows[f] = DOMg(`founderRow_${f}`);
    founderNLabels[f] = DOMg(`founderN_${f}`);
  });
  // The population size, repeated beside the founder's name. It is set up in
  // the deck, a long way above these rows, and the small-vs-large comparison is
  // the one place where you have to know which row is which while looking at
  // the fish.
  function renderFounderNLabels() {
    FOUNDERS.forEach(f => {
      if (!founderNLabels[f]) return;
      founderNLabels[f].innerHTML = T('ad.founderN', '{n} individuals per lineage',
        { n: `<span class="adapt-n-value"><var>N</var> = ${params.N[`${f}_neutral`]}</span>` });
    });
  }
  // Drives both the habitat fish card's border and its Gen-0 connector line
  // (via the --habitat-color custom property, read by the CSS in main.html).
  function applyHabitatColor(f) {
    founderRows[f].style.setProperty('--habitat-color', `var(--habitat-${params.habitat[f]})`);
  }
  // One G0 canvas per founder, shared by its Neutral and Habitat lineages —
  // both start from the same generation-0 genome, so it's drawn once in the
  // center "Gen 0" slot of the founder's row.
  const g0Canvases = {};
  FOUNDERS.forEach(f => { g0Canvases[f] = DOMg(`g0Canvas_${f}`); });
  const connectorSvgs = {};
  FOUNDERS.forEach(f => { connectorSvgs[f] = DOMg(`connectorSvg_${f}`); });
  const consensusCanvases = {}, traitTableWraps = {}, habitatCaptions = {};
  FOUNDERS.forEach(f => CONDITIONS.forEach(c => {
    consensusCanvases[`${f}_${c}`] = DOMg(`consensusCanvas_${f}_${c}`);
    traitTableWraps[`${f}_${c}`] = DOMg(`traitTableWrap_${f}_${c}`);
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
    applyHabitatColor(f);
  });

  let inferMethod = 'upgma'; // which reconstruction the tanglegram draws
  // Normally the three founders are the tips of a small prehistory, so they are
  // related but not alike. One preset needs them IDENTICAL instead: comparing
  // three population sizes only works if population size is the only thing that
  // differs, and three founders that already look different put a head start
  // into the comparison that has nothing to do with N. It is a deliberate
  // exception, announced on the page whenever it is in force, because it takes
  // away the branching order the tanglegram exists to recover.
  let founderMode = 'phylogeny';   // 'phylogeny' | 'identical'
  let founders = {}; // f -> full ancestor genome (all fish params)
  let outgroupFounder = null; // the outgroup's genome at the end of the prehistory
  let founderOrder = [];      // founders in prehistory topology order: a, b, c
  let checkpoints = null; // array of { gen, lineages: { key -> { loci: {trait -> snapshot} } } }

  function evolveLine(genome, gens) {
    let g = genome;
    for (let i = 0; i < gens; i++) g = mutate(g, PRE_SIGMA, 'fish');
    return g;
  }

  // Runs the prehistory and hands back the four tips. The three ingroup tips are
  // each PRE.gens from the root; the outgroup's branch is several times longer,
  // so the tree is deliberately NOT ultrametric. That length is what keeps the
  // outgroup at the root once the adaptation run adds its own divergence on top
  // — with equal branches the habitat lineages, which move furthest of all, end
  // up on longer branches than the outgroup and displace it.
  function buildFounders() {
    const root = freshAncestor('fish');
    if (founderMode === 'identical') {
      // One prehistory, walked once, and every founder gets that same fish. The
      // outgroup keeps its own long branch so the tanglegram still has a root.
      outgroupFounder = evolveLine(root, PRE.outgroupGens);
      const tip = evolveLine(root, PRE.gens);
      founderOrder = FOUNDERS.slice();
      founders = {};
      FOUNDERS.forEach(f => { founders[f] = tip; });
      rebuildLineageOrder();
      syncOutgroupN();
      return;
    }
    // G0 — the root splits into the outgroup and the ingroup ancestor.
    outgroupFounder = evolveLine(root, PRE.outgroupGens);
    const ingroup = evolveLine(root, PRE.split2);
    // G300 — the first ingroup tip goes its own way.
    const tipA = evolveLine(ingroup, PRE.gens - PRE.split2);
    const pair = evolveLine(ingroup, PRE.split3 - PRE.split2);
    // G700 — the remaining pair separates. These two are the close relatives.
    const tipB = evolveLine(pair, PRE.gens - PRE.split3);
    const tipC = evolveLine(pair, PRE.gens - PRE.split3);

    founderOrder = FOUNDERS.slice();
    for (let i = founderOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [founderOrder[i], founderOrder[j]] = [founderOrder[j], founderOrder[i]];
    }
    founders = {};
    [tipA, tipB, tipC].forEach((g, i) => { founders[founderOrder[i]] = g; });
    rebuildLineageOrder();
    syncOutgroupN();
  }

  // The outgroup has no slider of its own; it drifts at a rate comparable to
  // the named lineages, so it takes the mean of their population sizes.
  function syncOutgroupN() {
    const ns = FOUNDERS.map(f => params.N[`${f}_neutral`]);
    params.N[OUTGROUP] = Math.round(ns.reduce((x, y) => x + y, 0) / ns.length);
  }

  const founderGenomeFor = (key) =>
    (key === OUTGROUP ? outgroupFounder : founders[key.split('_')[0]]);

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
    FOUNDERS.forEach(renderFounderG0);
    lineageKeys.forEach(key => {
      if (key === OUTGROUP) return; // evolved behind the scenes; it has no card
      const snapLineage = {};
      TRAITS.forEach(t => { snapLineage[t] = snapshotLocus(loci[key][t]); });
      renderLineageCard(key, snapLineage, founderGenomeFor(key));
    });
  }

  // --- full run ---
  // `closing` lets a caller supply the line left in the status bar when the run
  // ends. A preset uses it to keep its question on screen at the moment the
  // reader has the finished run in front of them, which is when the question is
  // worth reading; an ordinary Run reports the checkpoint count as before.
  async function runSimulation(closing) {
    DOM.btnRun.disabled = true; DOM.btnReset.disabled = true;
    DOM.timeScrubber.disabled = true;
    setControlsDisabled(true);
    setStatus(() => T('ad.simulating', 'Simulating…'));
    await new Promise(r => setTimeout(r, 20)); // let the UI paint before the heavy loop

    const G = params.G;
    const interval = 10; // one checkpoint every 10 generations
    // Panels update live every G/100 generations as the run computes, paced
    // so the whole run — live plotting included — takes a fixed 8s total,
    // independent of G (the same total duration the old replay-after-the-
    // fact used).
    const RENDER_TICKS = 100;
    const TOTAL_DURATION_MS = 8000;
    const renderInterval = Math.max(1, Math.round(G / RENDER_TICKS));
    const msPerTick = TOTAL_DURATION_MS / RENDER_TICKS;

    const lineageKeys = LINEAGE_ORDER.slice();

    const loci = {}; // key -> trait -> locus state
    lineageKeys.forEach(key => {
      const base = founderGenomeFor(key);
      loci[key] = {};
      TRAITS.forEach(t => { loci[key][t] = newLocusState(base, t); });
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

    for (let gen = 1; gen <= G; gen++) {
      for (const key of lineageKeys) {
        const f = key.split('_')[0], c = key.split('_')[1];
        const N = params.N[key];
        // The outgroup has no habitat, so it evolves exactly like a Neutral lineage.
        const habitat = c === 'habitat' ? params.habitat[f] : null;
        for (const t of TRAITS) {
          stepLocus(loci[key][t], t, N, params.mu[t], params.s[t], habitat, params.mutSize);
        }
      }
      if (gen % interval === 0 || gen === G) pushCheckpoint(gen);
      if (gen % renderInterval === 0 || gen === G) {
        setStatus(() => T('ad.simulatingGen', 'Simulating… generation {g} / {max}', { g: gen, max: G }));
        renderLiveGen(gen, loci, lineageKeys);
        await new Promise(r => setTimeout(r, msPerTick)); // paced to a fixed 8s total, not just "yield"
      }
    }

    setStatus(closing || (() => T('ad.done', 'Done — {n} checkpoints across {g} generations.', { n: checkpoints.length, g: G })));
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
    if (DOM.presets) DOM.presets.querySelectorAll('button').forEach(b => { b.disabled = disabled; });
  }

  // --- rendering ---
  function fullGenome(founderGenome, traitValues) {
    // Merges the founder's fixed anatomy with the given per-trait overrides.
    return { ...founderGenome, ...traitValues };
  }

  // habitat is null for a Neutral lineage. A trait row is shaded "neutral"
  // whenever this habitat has no scorer for that trait at all — i.e. it was
  // never actually under selection here, regardless of how many mutations it
  // had. Otherwise it's shaded "selected". Both trait shades are deliberately
  // pale: the two summary rows below repeat the same two colours at full
  // strength, so the eye runs down a colour and lands on its total.
  //
  // The split the reader is meant to see is Mut. against Subs. within each
  // colour: mutations arrive at much the same rate whether or not a change
  // matters, but only the selected ones are converted into substitutions at
  // any speed. The two summary rows are therefore counted change by change,
  // from the per-mutation sEff, rather than by adding up rows — so a scored
  // mutation that happens to come out at s = 0 lands in Tot. neu. even though
  // its row is blue. That is why Tot. sel. is Total minus Tot. neu.
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
      const rowClass = underSelection ? 'adapt-row-selected' : 'adapt-row-neutral';
      rows += `<tr class="${rowClass}"><td>${traitLabel(t)}</td><td class="adapt-num">${locus.mutationCount}</td><td class="adapt-num">${locus.fixCount}</td></tr>`;
    });
    rows += `<tr class="adapt-tot-sel"><td>${T('ad.tbl.totsel', 'Tot. sel.')}</td><td class="adapt-num">${totalMuts - neutralMuts}</td><td class="adapt-num">${totalSubs - neutralSubs}</td></tr>`;
    rows += `<tr class="adapt-tot-neu"><td>${T('ad.tbl.totneu', 'Tot. neu.')}</td><td class="adapt-num">${neutralMuts}</td><td class="adapt-num">${neutralSubs}</td></tr>`;
    rows += `<tr class="adapt-total"><td>${T('ad.tbl.total', 'Total')}</td><td class="adapt-num">${totalMuts}</td><td class="adapt-num">${totalSubs}</td></tr>`;
    // The abbreviations have to be short enough to fit a narrow column, so the
    // words they stand for are spelled out once beneath every table.
    const key = habitat
      ? T('ad.tbl.key',
          '<strong>Tot. sel.</strong> = total selected: changes that altered the fit to this habitat (<var>s</var> not 0). ' +
          '<strong>Tot. neu.</strong> = total neutral: changes that made no difference to it (<var>s</var> = 0).')
      : T('ad.tbl.keyNeutral',
          '<strong>Tot. sel.</strong> = total selected, <strong>Tot. neu.</strong> = total neutral. ' +
          'Nothing is under selection in this lineage, so every change is neutral and Tot. sel. stays at 0.');
    return `<table class="adapt-trait-table"><tr><th>${T('ad.tbl.trait', 'Trait')}<button class="help-btn" data-help="traitTable"></button></th><th>${T('ad.tbl.mut', 'Mut.')}</th><th>${T('ad.tbl.subs', 'Subs.')}</th></tr>${rows}</table>` +
      `<p class="adapt-tbl-key">${key}</p>`;
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

  // Sizes a canvas to its real rendered width and draws into it — but only if
  // it's actually visible. If the tab is hidden, getBoundingClientRect()
  // returns 0, and setting that (or any guessed fallback) as the canvas's
  // width would stick as an inline style that every later "measure current
  // size" call would just read back, permanently wrong. Skipping instead
  // leaves it for the resize handler to render correctly once visible.
  // Measures the parent card, not the canvas itself: scaleCanvas() sets an
  // inline pixel width on the canvas, so measuring the canvas's own rect
  // would be self-referential and could never grow back after the card's
  // fluid (100%-width) size changes, e.g. across the mobile breakpoint.
  function sizeAndDraw(canvas, genome) {
    const size = Math.round((canvas.parentElement || canvas).getBoundingClientRect().width);
    if (size <= 0) return;
    const ctx = canvas.getContext('2d');
    scaleCanvas(canvas, ctx, size, size);
    drawGenome(ctx, size, size, genome, 'fish');
  }

  // The Gen-0 fish is shared by a founder's Neutral and Habitat row (it's
  // the same genome either way), so it's drawn once per founder rather than
  // once per lineage.
  function renderFounderG0(f) {
    sizeAndDraw(g0Canvases[f], founders[f]);
  }

  // Length of the connector's stem: the gap between the bottom of the
  // ancestor's caption and the bar. Long enough to read as a stem — a couple
  // of pixels would just look like the bar had grown a nub.
  const BRANCH_STEM = 28;

  // Lays the founder's row out as a branching rather than as three fish in a
  // line: the Gen-0 ancestor keeps the top tier, its Neutral and Habitat
  // descendants are dropped below it, and a single ⊥ connector — one stem
  // down from the ancestor, one bar across into each descendant — says that
  // the two lineages are one population split in two. Two separate arrows
  // out of a fish in the middle read as two independent journeys, which is
  // the thing the room is trying not to say.
  //
  // Both the tier gap and the lines come from the cards' real rendered
  // geometry, because the cards are a percentage of a fluid column and change
  // size with the viewport. The gap in particular cannot be a fixed number:
  // the bar sits at the descendants' mid-height, so the drop has to clear the
  // whole ancestor slot — fish plus its caption — or the stem would end up
  // pointing upwards and striking through the caption text.
  //
  // Called once both descendants of a founder's Gen-0 card are sized and drawn.
  function drawFounderConnectors(f) {
    const svg = connectorSvgs[f];
    const grid = svg.parentElement;
    const neutralCanvas = consensusCanvases[`${f}_neutral`];
    const g0Canvas = g0Canvases[f];
    const habitatCanvas = consensusCanvases[`${f}_habitat`];
    // Below the 900px breakpoint the grid collapses to one column and the
    // stylesheet hides this SVG — that display is the signal that there is no
    // tier and no connector here. The inline drop has to be removed rather
    // than set to 0, or it would outrank the media query's own value.
    if (getComputedStyle(svg).display === 'none') {
      grid.style.removeProperty('--adapt-drop');
      svg.innerHTML = '';
      return;
    }
    const g0Slot = g0Canvas.closest('.adapt-fish-slot');
    if (g0Canvas.getBoundingClientRect().width === 0) { svg.innerHTML = ''; return; }

    // Tier first, lines second: setting the drop moves both descendants, so
    // every coordinate below has to be measured after it has been applied.
    // It changes no width, so one pass settles it. Only written when it has
    // actually changed — this runs on every checkpoint the scrubber draws,
    // and an unconditional style write would invalidate the layout each time
    // just for the next line to force it back.
    const drop = `${Math.round(
      g0Slot.getBoundingClientRect().height
      - g0Canvas.getBoundingClientRect().height / 2
      + BRANCH_STEM
    )}px`;
    if (grid.style.getPropertyValue('--adapt-drop') !== drop) {
      grid.style.setProperty('--adapt-drop', drop);
    }

    const gridRect = grid.getBoundingClientRect();
    const nRect = neutralCanvas.getBoundingClientRect();
    const gRect = g0Canvas.getBoundingClientRect();
    const hRect = habitatCanvas.getBoundingClientRect();
    if (nRect.width === 0 || gRect.width === 0 || hRect.width === 0) { svg.innerHTML = ''; return; }
    const toLocal = (r) => ({
      left: r.left - gridRect.left,
      right: r.right - gridRect.left,
      cx: r.left - gridRect.left + r.width / 2,
      cy: r.top - gridRect.top + r.height / 2,
      bottom: r.bottom - gridRect.top
    });
    const n = toLocal(nRect), g = toLocal(gRect), h = toLocal(hRect);
    // The bar runs at the descendants' mid-height so it meets the near edge of
    // each card; the stem leaves from under the ancestor's caption, not from
    // the card, so it does not cross the words.
    const barY = n.cy;
    const stemTop = toLocal(g0Slot.getBoundingClientRect()).bottom;
    const habitatColor = `var(--habitat-${params.habitat[f]})`;
    svg.innerHTML =
      `<line x1="${g.cx}" y1="${stemTop}" x2="${g.cx}" y2="${barY}" stroke="var(--ink)" stroke-width="2"/>` +
      `<line x1="${n.right}" y1="${barY}" x2="${g.cx}" y2="${barY}" stroke="var(--ink)" stroke-width="2"/>` +
      `<line x1="${g.cx}" y1="${barY}" x2="${h.left}" y2="${barY}" stroke="${habitatColor}" stroke-width="2"/>`;
  }

  function renderLineageCard(key, snapLineage, founderGenome) {
    const [f, c] = key.split('_');
    const habitat = c === 'habitat' ? params.habitat[f] : null;

    traitTableWraps[key].innerHTML = traitTableHTML(snapLineage, habitat);

    habitatCaptions[key].textContent = habitat
      ? T('ad.habCaption', '{h} habitat - {d}',
          { h: habitatLabel(habitat), d: habitatDescription(habitat) })
      : T('ad.noSelection', 'No selection - drift only');

    const consensusGenome = consensusGenomeFor(snapLineage, founderGenome);
    sizeAndDraw(consensusCanvases[key], consensusGenome);

    // Both of this founder's cards (Neutral, then Habitat) are sized and
    // drawn by this point in every call site's per-founder loop, so it's
    // safe to (re)draw the Gen-0 connector lines once the Habitat lineage
    // is reached.
    if (c === 'habitat') drawFounderConnectors(f);
  }

  function renderCheckpoint(idx) {
    if (!checkpoints || !checkpoints[idx]) return;
    const snap = checkpoints[idx];
    DOM.scrubVal.textContent = snap.gen;
    FOUNDERS.forEach(renderFounderG0);
    FOUNDERS.forEach(f => CONDITIONS.forEach(c => {
      const key = `${f}_${c}`;
      renderLineageCard(key, snap.lineages[key], founders[f]);
    }));
  }

  // Ordered by the prehistory topology, outgroup first, so the true tree draws
  // without crossing branches whichever founder ended up on which tip.
  let LINEAGE_ORDER = [];
  function rebuildLineageOrder() {
    LINEAGE_ORDER = [OUTGROUP];
    founderOrder.forEach(f => CONDITIONS.forEach(c => LINEAGE_ORDER.push(`${f}_${c}`)));
  }
  const LINEAGE_COL_LABEL = (key) => {
    if (key === OUTGROUP) return T('ad.outgroupShort', 'Out');
    const [f, c] = key.split('_');
    const cap = f.charAt(0).toUpperCase() + f.slice(1);
    return c === 'neutral' ? `${cap}-N` : `${cap}-H`;
  };
  // Colour for a lineage's tip branch (and label) in the inferred tree: a
  // Habitat lineage takes its habitat's colour (Stream/Pond/River), a Neutral
  // lineage the muted "no selection" ink — the same convention as the founder
  // rows above, so two same-habitat tips that cluster together read at a glance.
  const LINEAGE_COLOR = (key) => {
    if (key === OUTGROUP) return 'var(--ink-soft)';
    const [f, c] = key.split('_');
    return c === 'habitat' ? `var(--habitat-${params.habitat[f]})` : 'var(--ink-soft)';
  };

  function renderDivergenceMatrix() {
    if (!checkpoints) { DOM.divMatrixWrap.innerHTML = ''; DOM.avgDeltaSummary.textContent = ''; return; }
    const last = checkpoints[checkpoints.length - 1];

    // Precompute each lineage's final consensus genome once.
    const finalGenomes = {};
    LINEAGE_ORDER.forEach(key => {
      finalGenomes[key] = consensusGenomeFor(last.lineages[key], founderGenomeFor(key));
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
      T('ad.avgDelta', 'Neutral: {n} · Habitat: {h}',
        { n: avg(ownDelta.neutral).toFixed(3), h: avg(ownDelta.habitat).toFixed(3) });
  }

  // True history vs. inferred tree, built from the seven lineages' final
  // consensus shapes — the same tanglegram idea as the Branching Room. The true
  // topology is the prehistory's (Out,(a,(b,c))) with each founder then
  // splitting into its Neutral and Habitat lineage, so there is a real
  // branching order for the reconstruction to recover or get wrong. The
  // outgroup is one of the seven tips and takes part in the clustering.
  function renderTanglegram() {
    if (!checkpoints) { DOM.tanglegramWrap.innerHTML = ''; return; }
    const last = checkpoints[checkpoints.length - 1];
    const finalGenomes = {};
    LINEAGE_ORDER.forEach(key => {
      finalGenomes[key] = consensusGenomeFor(last.lineages[key], founderGenomeFor(key));
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
    // The prehistory's internal nodes, read off the topology (Out,(a,(b,c))).
    const [fA, fB, fC] = founderOrder;
    const y700 = (ty[fB] + ty[fC]) / 2;
    const y300 = (ty[fA] + y700) / 2;
    const rootY = (ty[OUTGROUP] + y300) / 2;

    const OUTER_MARGIN = 20, TREE_SPAN = 400;
    const LEFT_START = OUTER_MARGIN, LEFT_END = LEFT_START + TREE_SPAN;
    const GAP_START = LEFT_END, GAP_END = 1000 - OUTER_MARGIN - TREE_SPAN, RIGHT_LEAF_X = GAP_END;
    // Branch lengths are proportional to divergence: a node sits at its own
    // cluster height, measured from the leaf column (height 0). No constant
    // offset is added, so the horizontal run from a leaf to an ancestor is that
    // ancestor's height, and a leaf-to-leaf path is twice it — exactly the Δ
    // between them. See the axis drawn under the tree.
    const RIGHT_SPAN = TREE_SPAN - 20;
    const RIGHT_MERGE_END = RIGHT_LEAF_X + RIGHT_SPAN, RIGHT_STUB_END = RIGHT_MERGE_END + 20;
    // The prehistory's three splits occupy the first half of the true-history
    // panel; the adaptation run — the founders and their Neutral/Habitat split —
    // the second. Positions are schematic, as they always were on this side.
    const ROOT_X = LEFT_START;
    const X300 = LEFT_START + TREE_SPAN * 0.16;
    const X700 = LEFT_START + TREE_SPAN * 0.34;
    const FOUNDER_X = LEFT_START + TREE_SPAN * 0.56, SPLIT_X = LEFT_START + TREE_SPAN * 0.78;

    let svgLines = '';

    // True history. The prehistory first: three nested splits from one root,
    // giving the outgroup and the three founders. Then the adaptation run, in
    // which each founder divides into its Neutral and Habitat lineage.
    const ink = (x1, y1, x2, y2) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--ink)" stroke-width="4"${y1 === y2 ? '' : ' stroke-linecap="square"'}/>`;
    const splitTick = (x, y) => `<circle cx="${x}" cy="${y}" r="4" fill="var(--ink)"/>`;

    // G0 — root splits into the outgroup and the ingroup ancestor.
    svgLines += ink(ROOT_X, rootY, ROOT_X, rootY);
    svgLines += ink(ROOT_X, ty[OUTGROUP], ROOT_X, y300);
    svgLines += ink(ROOT_X, ty[OUTGROUP], LEFT_END, ty[OUTGROUP]);   // the outgroup runs the whole way
    svgLines += ink(ROOT_X, y300, X300, y300);
    svgLines += splitTick(ROOT_X, rootY);
    // G300 — the first founder's lineage separates.
    svgLines += ink(X300, ty[fA], X300, y700);
    svgLines += ink(X300, ty[fA], FOUNDER_X, ty[fA]);
    svgLines += ink(X300, y700, X700, y700);
    svgLines += splitTick(X300, y300);
    // G700 — the remaining two separate; these are the close relatives.
    svgLines += ink(X700, ty[fB], X700, ty[fC]);
    svgLines += ink(X700, ty[fB], FOUNDER_X, ty[fB]);
    svgLines += ink(X700, ty[fC], FOUNDER_X, ty[fC]);
    svgLines += splitTick(X700, y700);

    // The adaptation run: each founder splits into Neutral and Habitat.
    FOUNDERS.forEach(f => {
      svgLines += ink(FOUNDER_X, ty[f], SPLIT_X, ty[f]);
      svgLines += ink(SPLIT_X, ty[`${f}_neutral`], SPLIT_X, ty[`${f}_habitat`]);
      CONDITIONS.forEach(c => {
        const key = `${f}_${c}`;
        svgLines += ink(SPLIT_X, ty[key], LEFT_END, ty[key]);
      });
    });

    // The shape each lineage started the adaptation run with — the tips of the
    // prehistory. The outgroup has one too: it is where its neutral drift begins.
    [...FOUNDERS, OUTGROUP].forEach(f => {
      const label = f === OUTGROUP
        ? T('ad.outgroup', 'Outgroup')
        : f.charAt(0).toUpperCase() + f.slice(1);
      svgLines += `
        <foreignObject x="${FOUNDER_X - 25}" y="${ty[f] - 25}" width="50" height="50">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; border-radius:50%; background:var(--paper); border: 2px solid var(--ink); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <canvas id="adapt_true_${f}" width="100" height="100" style="width:50px; height:50px;"></canvas>
          </div>
        </foreignObject>`;
      svgLines += `<text x="${FOUNDER_X}" y="${ty[f] + 40}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" fill="var(--ink-soft)">${label}</text>`;
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
      svgLines += `<text x="${iconX + ICON_W / 2}" y="${ty[key] + 52}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" font-weight="bold" fill="${LINEAGE_COLOR(key)}">${LINEAGE_COL_LABEL(key)}</text>`;
    });

    let inferredNodes = [];
    let njScale = 0;

    if (inferMethod === 'upgma') {
      function traverseUpgma(node) {
        if (!node.left && !node.right) {
          node.y = ty[node.id]; node.genome = finalGenomes[node.id]; node.isLeaf = true; node.x = RIGHT_LEAF_X;
          return;
        }
        traverseUpgma(node.left); traverseUpgma(node.right);
        node.y = (node.left.y + node.right.y) / 2;
        node.genome = averageGenome(node.left.genome, node.right.genome, 'fish');
        node.isLeaf = false;
        node.x = RIGHT_LEAF_X + (node.height / maxH) * RIGHT_SPAN;
        inferredNodes.push(node);

        const leftStroke = node.left.isLeaf ? LINEAGE_COLOR(node.left.id) : 'var(--ink)';
        const rightStroke = node.right.isLeaf ? LINEAGE_COLOR(node.right.id) : 'var(--ink)';
        svgLines += `<line x1="${node.x}" y1="${node.left.y}" x2="${node.x}" y2="${node.right.y}" stroke="var(--ink)" stroke-width="4" stroke-linecap="square"/>`;
        svgLines += `<line x1="${node.x}" y1="${node.left.y}" x2="${node.left.x}" y2="${node.left.y}" stroke="${leftStroke}" stroke-width="4"/>`;
        svgLines += `<line x1="${node.x}" y1="${node.right.y}" x2="${node.right.x}" y2="${node.right.y}" stroke="${rightStroke}" stroke-width="4"/>`;
      }
      traverseUpgma(rootCluster);
      svgLines += `<line x1="${RIGHT_MERGE_END}" y1="${rootCluster.y}" x2="${RIGHT_STUB_END}" y2="${rootCluster.y}" stroke="var(--ink)" stroke-width="4"/>`;
    } else {
      // Neighbour-joining: each lineage gets its own branch length, so a
      // lineage that evolved faster sticks out further from the root.
      const njRoot = neighborJoining(LINEAGE_ORDER, (a, b) => a === b ? 0 : distMatrix[a < b ? `${a},${b}` : `${b},${a}`]);
      njScale = layoutPhylogram(njRoot, ty, RIGHT_MERGE_END, RIGHT_SPAN).scale;
      (function genomes(n) {
        if (n.isLeaf) { n.genome = finalGenomes[n.id]; return; }
        n.children.forEach(genomes);
        n.genome = n.children.map(c => c.genome).reduce((acc, g) => acc ? averageGenome(acc, g, 'fish') : g, null);
        inferredNodes.push(n);
      })(njRoot);
      svgLines += phylogramSvg(njRoot, { leafColumnX: RIGHT_LEAF_X, leafColor: LINEAGE_COLOR, inkColor: 'var(--ink)' });
      svgLines += `<line x1="${njRoot.x}" y1="${njRoot.y}" x2="${RIGHT_STUB_END}" y2="${njRoot.y}" stroke="var(--ink)" stroke-width="4"/>`;
    }

    inferredNodes.forEach((node, i) => {
      svgLines += `
        <foreignObject x="${node.x - 25}" y="${node.y - 25}" width="50" height="50">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; border-radius:50%; background:var(--paper); border: 2px dashed var(--ink); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <canvas id="adapt_upgma_${i}" width="100" height="100" style="width:50px; height:50px;"></canvas>
          </div>
        </foreignObject>`;
    });

    svgLines += `<text x="${(LEFT_START + LEFT_END) / 2}" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="var(--ink-soft)">True History</text>`;
    svgLines += `<text x="${(GAP_START + GAP_END) / 2}" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="var(--ink-soft)">Final Shapes</text>`;
    svgLines += `<text x="${(RIGHT_LEAF_X + RIGHT_STUB_END) / 2}" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="var(--ink-soft)">Inferred (${inferMethod === 'upgma' ? 'UPGMA' : 'Neighbour-joining'})</text>`;

    // Leave room below the lowest lineage (and its caption) for the Δ axis.
    const lowestLeafY = Math.max(...LINEAGE_ORDER.map(k => ty[k]));
    const axisY = lowestLeafY + 80;
    svgLines += inferMethod === 'upgma'
      ? upgmaAxisSvg(RIGHT_LEAF_X, RIGHT_SPAN, rootCluster.height, axisY, 'var(--ink-soft)')
      : scaleBarSvg(RIGHT_LEAF_X, axisY, njScale, 'var(--ink-soft)');
    const totalHeight = axisY + 45;

    DOM.tanglegramWrap.innerHTML = `
      <div class="infer-toggle">
        <span class="infer-toggle-label">${T('ad.method', 'Reconstruction method')}</span>
        <div class="segmented" id="inferSeg_adapt">
          <button data-method="upgma" class="${inferMethod === 'upgma' ? 'active' : ''}">UPGMA</button>
          <button data-method="nj" class="${inferMethod === 'nj' ? 'active' : ''}">${T('ad.nj', 'Neighbour-joining')}</button>
        </div>
        <button class="help-btn" data-help="treeMethod"></button>
      </div>
      <svg width="1000" height="${totalHeight}" style="background:var(--paper); border:1px solid var(--rule); border-radius:6px; display:block; min-width: 1000px;">
        ${svgLines}
      </svg>`;

    setTimeout(() => {
      [...FOUNDERS, OUTGROUP].forEach(f => {
        const ctx = document.getElementById(`adapt_true_${f}`)?.getContext('2d');
        if (ctx) drawGenome(ctx, 100, 100, f === OUTGROUP ? outgroupFounder : founders[f], 'fish');
      });
      LINEAGE_ORDER.forEach(key => {
        const ctx = document.getElementById(`adapt_final_${key}`)?.getContext('2d');
        if (ctx) drawGenome(ctx, 160, 160, finalGenomes[key], 'fish');
      });
      inferredNodes.forEach((node, i) => {
        const ctx = document.getElementById(`adapt_upgma_${i}`)?.getContext('2d');
        if (ctx) drawGenome(ctx, 100, 100, node.genome, 'fish');
      });
    }, 50);
  }

  // The toggle sits inside the generated tanglegram, so bind by delegation
  // and re-render from the same final checkpoint.
  DOM.tanglegramWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('#inferSeg_adapt button[data-method]');
    if (!btn || btn.dataset.method === inferMethod) return;
    inferMethod = btn.dataset.method;
    renderTanglegram();
  });

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
      renderFounderNLabels();
      syncOutgroupN();
    });
    habitatSegs[f].querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        params.habitat[f] = btn.dataset.habitat;
        habitatSegs[f].querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
        applyHabitatColor(f);
        // Re-render (not just the caption text) since the trait table's row
        // shading depends on which traits this habitat selects on, and the
        // habitat card's caption restates the new habitat's favoured traits.
        renderCurrentView();
      });
    });
  });

  // --- preset tasks ---
  // The room has eighteen controls, and three of the questions it exists to
  // answer each need several of them moved at once — two of those three the
  // brief already asks for in prose, one of them by dragging five sliders that
  // live inside a collapsed panel. A button apiece turns each into a task the
  // reader can actually take up.
  //
  // Setting a control is done by writing its value and firing the same 'input'
  // event a drag would, and a habitat by clicking its button, so there is one
  // path into `params` rather than two that can drift apart.
  const setSlider = (el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const setHabitat = (f, habitat) => {
    habitatSegs[f].querySelector(`button[data-habitat="${habitat}"]`).click();
  };
  // Every preset states its whole configuration rather than adjusting whatever
  // is currently set. A task that depended on what the reader had left behind
  // would not be the same task twice.
  const DEFAULTS = { G: 5000, mutSize: 0.10, s: 0.20, mu: 0.010, N: 50,
                     founders: 'phylogeny',
                     habitat: { gigi: 'stream', mario: 'pond', nani: 'river' } };

  function applyBaseline(over) {
    const cfg = { ...DEFAULTS, ...over };
    setSlider(DOM.sliderG, cfg.G);
    setSlider(DOM.sliderMutSize, cfg.mutSize);
    TRAITS.forEach(t => { setSlider(sSliders[t], cfg.s); setSlider(muSliders[t], cfg.mu); });
    FOUNDERS.forEach(f => {
      setSlider(nSliders[f], (cfg.perFounderN && cfg.perFounderN[f]) || cfg.N);
      setHabitat(f, cfg.habitat[f]);
    });
    // Founders are drawn, not set, so switching kind means drawing three new
    // ones — and only when the kind actually changes, so that pressing the same
    // preset twice does not silently swap the fish underneath the reader.
    if (cfg.founders !== founderMode) {
      founderMode = cfg.founders;
      checkpoints = null;
      buildFounders();
      renderFounderModeNote();
    }
  }

  const PRESETS = {
    // Convergence. Three founders that already differ, one habitat between
    // them: what the habitat lineages have in common at the end is what
    // selection put there, since nothing else about them agrees.
    sameHabitat: {
      config: { habitat: { gigi: 'stream', mario: 'stream', nani: 'stream' } },
      status: () => T('ad.preset.sameHabitat.status',
        'All three founders in the Stream. Watch how much more alike the three Habitat lineages end up than the three Neutral ones — that is convergence.')
    },
    // The control experiment. Not the same thing as the Neutral lineage that is
    // always on screen: this asks whether a HABITAT lineage, told to prefer
    // nothing, becomes statistically indistinguishable from its own twin.
    noSelection: {
      config: { s: 0 },
      status: () => T('ad.preset.noSelection.status',
        'Every selection coefficient is 0. Each Habitat lineage is now a second Neutral one — the two divergence figures should come out the same, and any gap you see is what one run of drift looks like.')
    },
    // N·s, made visible. One habitat for all three so that population size is
    // the only thing that differs; 10 against 200 is a twentyfold range.
    smallVsLarge: {
      config: {
        habitat: { gigi: 'stream', mario: 'stream', nani: 'stream' },
        perFounderN: { gigi: 10, mario: 50, nani: 200 },
        // The one task that needs the founders to be the same fish: three
        // populations of different sizes, and nothing else different about them.
        founders: 'identical'
      },
      status: () => T('ad.preset.smallVsLarge.status',
        'Three identical founders, same habitat, N = 10, 50 and 200. The small population fixes mutations fastest but sorts them worst; the large one is slower and truer, because selection is more effective relative to drift in it.')
    },
    defaults: {
      config: {},
      status: () => T('ad.preset.defaults.status', 'Back to the room’s default settings.')
    }
  };

  DOM.presets.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-preset]');
    if (!btn || btn.disabled) return;
    const preset = PRESETS[btn.dataset.preset];
    if (!preset) return;
    applyBaseline(preset.config);
    renderFounderNLabels();
    // Restoring the defaults is housekeeping rather than a question, so it
    // leaves whatever is on screen alone; the other three are tasks, and a task
    // that made you press Run afterwards would not have saved you anything.
    if (btn.dataset.preset === 'defaults') { setStatus(preset.status); return; }
    // The question goes in as the run's closing line rather than now: it is the
    // finished run it asks about, and "Simulating…" would overwrite it anyway.
    runSimulation(preset.status);
  });

  DOM.btnRun.addEventListener('click', () => { runSimulation(); });

  DOM.btnReset.addEventListener('click', () => {
    checkpoints = null;
    DOM.timeScrubber.min = 0; DOM.timeScrubber.max = 0; DOM.timeScrubber.value = 0;
    DOM.timeScrubber.disabled = true;
    DOM.scrubVal.textContent = 0; DOM.scrubMaxLabel.textContent = 0;
    setStatus(() => T('ad.newFounders', 'New founders generated. Configure parameters and press Run.'));
    DOM.divMatrixWrap.innerHTML = '';
    DOM.avgDeltaSummary.textContent = '';
    DOM.tanglegramWrap.innerHTML = '';
    // Whichever kind of founder is in force stays in force: a reader partway
    // through the small-vs-large task wants three fresh identical founders, not
    // to be dropped back into the related three without asking.
    init();
  });

  window.addEventListener('resize', () => {
    renderCurrentView();
  });

  function renderFounderModeNote() {
    const el = DOMg('founderModeNote');
    if (!el) return;
    el.hidden = founderMode !== 'identical';
    // The tanglegram's caption promises a branching order to recover. With
    // identical founders there is none among them, and saying so beside the
    // figure matters more than saying it forty lines above.
    const claim = DOMg('tanglegramClaim');
    if (claim) {
      claim.innerHTML = founderMode === 'identical'
        ? T('ad.tangleClaim.identical', 'These three founders are the <em>same fish</em>, so there is no branching order among them to recover — the only true history here is that each Neutral lineage is the sister of its own Habitat lineage. Watch whether the reconstruction finds even that, once three lineages in the same habitat have converged.')
        : T('ad.tangleClaim.phylogeny', 'The true branching order is there to be recovered — does the reconstruction find it?');
    }
    if (!el.hidden) {
      el.innerHTML = T('ad.identicalFounders',
        'For this task the three founders are the <strong>same fish</strong>, not the usual three related ones — so population size is the only thing that differs between the rows. It also means there is no branching order among them for the tanglegram to recover; only the pairing of each Neutral lineage with its own Habitat twin is real history here. <em>New Founders</em> draws three fresh identical founders; any other preset, or <em>Restore defaults</em>, brings the related three back.');
    }
  }

  function renderCurrentView() {
    if (checkpoints) {
      renderCheckpoint(parseInt(DOM.timeScrubber.value) || checkpoints.length - 1);
    } else {
      // No run yet — show each lineage as an unmutated copy of its founder.
      FOUNDERS.forEach(renderFounderG0);
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
    renderFounderNLabels();
    renderFounderModeNote();
    renderCurrentView();
    setStatus(() => T('ad.ready', 'Configure parameters and press Run.'));
  }

  init();
})();
