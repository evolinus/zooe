// The Speciation Room: one ancestral population, split in two, no gene flow.
//
// The ancestral population lives in a LAKE. It carries 1,013
// independent diploid loci, and those loci fall into three very unequal groups:
//
//   - 13 morphological loci — fixed once and for all
//     (shape 3, colour 4, eye size 1, fin size 2, tail size 3). Each allele
//     carries an effect vector that it adds to that trait's drawing
//     parameters. Phenotype is additive in allele dosage, so a population's
//     MEAN fish is the ancestral fish plus the frequency-weighted effects.
//   - 40 physiological loci — 4% of the rest of the genome. They change nothing
//     about how the fish LOOKS, so they never appear in a drawing; what they
//     set is what its body has to do to live where it lives — oxygen uptake,
//     ion balance, the metabolic cost of holding station in moving water. Still
//     water and fast water make different demands of all three, so these loci
//     are under selection just as the morphological ones are: an allele that
//     suits a lake is the wrong allele in a stream, and the same allele in two
//     lakes is favoured in both. They carry no effect vector, only a position
//     on a single physiological axis with the ancestral allele at its origin,
//     still water asking for one end of it and fast water for the other; an
//     allele is favoured when it brings the locus CLOSER to what its habitat
//     needs. This is the point they exist to make: most adaptation is
//     invisible, and a fish can be as thoroughly rebuilt inside as out.
//   - 960 loci that neither habitat has any use for. They are not inert — in a
//     real fish they would be doing something too — but nothing this simulation
//     models depends on them, so nothing selects on them and they are free to
//     drift. They are still the great majority of the genome, which is the
//     point: most of what separates two genomes is neither what makes them look
//     different nor what adapted them.
//
// The split gives population A, which stays in the home lake, and population B,
// which moves away — either to ANOTHER LAKE, ecologically the same kind of
// place, or to a STREAM, which is not. Selection is habitat-based, exactly as
// in the Adaptation Room: an allele is favoured if it nudges its trait — or its
// physiology — in the direction its population's habitat prefers. There is no
// symmetric "push them apart" rule — if both populations are in lakes they are
// under the SAME selection, which at those 53 loci works against divergence
// wherever the two are sorting the same ancestral alleles. Only there: when
// each population instead adapts on new mutations of its own, parallel
// selection produces parallel PHENOTYPES by divergent genetics, and every one
// of those independent routes is a difference between the two genomes.
//
// ALLELES AND MUTATION. Every locus has an open-ended series of alleles, but
// carries at most two at a time in any one population: a resident, and possibly
// one new variant sweeping through. A locus that has gone monomorphic can
// receive a mutation, which creates a genuinely NEW allele — never a return to
// one that has been seen before, so there is no back mutation and no locus ever
// flickers between two states. The new allele starts at one copy in 2N and runs
// its own Wright-Fisher trajectory; if it fixes it becomes the resident, and the
// locus is then ready to mutate again. Mutations are local: an allele that
// arises in A can never appear in B, so anything that fixes after the split
// adds to the divergence between them permanently.
//
// Two deliberate simplifications live in that paragraph, and neither is a claim
// about real genomes: a real locus can carry many alleles at once, and mutation
// can strike it while it is still polymorphic. Holding it to two at a time is
// what keeps the picture readable.
//
// Divergence is counted the way a systematist counts it: a locus is a FIXED
// DIFFERENCE when population A is fixed for one allele and population B for a
// different one. Fixed differences are what Dobzhansky-Muller incompatibilities
// are built out of, so the room treats their number as a proxy for how much
// post-zygotic isolation has accumulated: cross the threshold X and hybrids no
// longer work. Separately, body hue can be declared a mating signal — if the
// two populations' mean hue diverges by more than Y degrees they no longer
// recognise each other as mates, which is pre-zygotic isolation and needs no
// genome-wide divergence at all. Body hue is the classic worked example here
// (nuptial colouration in cichlids and sticklebacks), and it is the one trait
// whose divergence has an obvious natural unit: degrees around the colour wheel.
(function () {
  const DOMg = (name) => document.getElementById(`${name}_spec`);

  const POPS = ['a', 'b'];
  const TRAITS = ['shape', 'colour', 'eyeSize', 'finSize', 'tailSize'];
  const TRAIT_LABEL = { shape: 'Shape', colour: 'Colour', eyeSize: 'Eye size', finSize: 'Fin size', tailSize: 'Tail size' };
  const traitLabel = (t) => T('sp.trait.' + t, TRAIT_LABEL[t]);
  // Same trait-to-parameter map as the Adaptation Room, so a "trait" means the
  // same thing in both rooms.
  const TRAIT_PARAMS = {
    shape: ['bRxFront', 'bRxBack', 'bRy'],
    colour: ['bodyHue', 'bodyLightness', 'finLightness'],
    eyeSize: ['eyeR'],
    finSize: ['dorsLen', 'analLen'],
    tailSize: ['tailLen', 'tailSpread', 'tailNotch']
  };
  // How many loci build each trait. Fixed, not drawn per run: roughly one locus
  // per drawing parameter the trait owns, with a fourth for colour because body
  // hue does double duty as the mating signal and has to be able to move.
  //
  // These counts are calibrated, not arbitrary. They set how far apart the two
  // habitats push their populations, and therefore how often a run ends in
  // speciation: at the default N, N₂ and G, a stream does it in about four runs
  // in five and another lake in about one in three. More trait loci and the
  // stream always speciates while the lake rarely does, which makes the outcome
  // a foregone conclusion; fewer and the two become indistinguishable. The
  // count of NON-morphological loci matters here too, for the opposite reason:
  // the more of them there are, the noisier the genome-wide count and the more
  // the two habitats' distributions overlap. That is what sets N_OTHER. The two
  // habitats differ by only about three morphological fixed differences (8 in a
  // stream against 5 between two lakes), so if the genome-wide count were quiet
  // the threshold X would separate them almost perfectly and the stream would
  // speciate in nearly every run. Nine hundred and sixty drifting loci put
  // enough spread on the total to leave the outcome genuinely uncertain — and a
  // genome that is 960 parts drift to 53 parts adaptation is the more honest
  // ratio anyway.
  const LOCI_PER_TRAIT = { shape: 3, colour: 4, eyeSize: 1, finSize: 2, tailSize: 3 };
  const N_MORPH = TRAITS.reduce((n, t) => n + LOCI_PER_TRAIT[t], 0);  // 13, of 1,013 in all
  // Of the 1,000 loci that build no part of the fish, this many are still
  // ADAPTIVE — they meet a physiological demand the two habitats make
  // differently. Four per cent is a deliberately modest reading of what a
  // genome scan finds under selection, and it is capped low on purpose. These
  // 40 loci collect about 28 fixed differences after a move to the stream and
  // about 22 between two lakes, against about 121 from the 960 neutral ones:
  // five times the neutral rate per locus. Raise the count and the genome-wide
  // total stops behaving like a clock and starts being a record of adaptation,
  // which is the opposite of the point the room is making with it.
  //
  // Note that the two habitats are much closer here than at the trait loci (28
  // against 22, where morphology gives 8 against 5), and the reason is worth
  // knowing: two lakes select in PARALLEL at these loci, but each population
  // gets there on new mutations of its own, and a mutation that arose in A can
  // never appear in B. Parallel adaptation, non-parallel genetics. Selection
  // suppresses divergence only where the two populations sort the SAME alleles.
  //
  // Adding them raised the genome-wide count by about 20 in both habitats,
  // which is why X's default moved with them, from 136 to 154.
  const N_PHYS = 40;
  const N_NEUTRAL = 960;
  const N_OTHER = N_PHYS + N_NEUTRAL;
  const N_LOCI = N_MORPH + N_OTHER;
  // The genome is laid out in that order, so a locus's index is its class:
  // morphological, then physiological, then neutral.
  const FIRST_PHYS = N_MORPH, FIRST_NEUTRAL = N_MORPH + N_PHYS;
  const kindOf = (i) => i < FIRST_PHYS ? 'morph' : i < FIRST_NEUTRAL ? 'phys' : 'neutral';
  const KIND_COUNT = { morph: N_MORPH, phys: N_PHYS, neutral: N_NEUTRAL };

  // Before the room opens, the ancestral population spends this long ADAPTING TO
  // THE LAKE — it has been living there, so it should look like it. See
  // adaptToLake().
  const PRE_GENS = 1000, PRE_SIGMA = 0.005;
  // …but the walk is confined to the middle of each drawing parameter's range,
  // leaving this fraction of it untouched at each end. Without that the walk
  // grinds straight into the clamps and stays there: the lake's preferences on
  // shape, eye size and fins are MONOTONE — rounder, bigger, longer, with no
  // optimum to settle at — so a thousand generations of hill-climbing pin every
  // one of those parameters against its wall, in every run. The result was a
  // caricature rather than a lake fish, and it cost the room twice over: the
  // ancestor had no headroom left to get rounder, so population A sat frozen in
  // its own habitat, and population B started three times further from a stream
  // shape than the Adaptation Room's founder does, so its transformation looked
  // far weaker than it is. The edges of these ranges are a limit of the drawing
  // model, not a claim that the perfect lake fish lives on them.
  const PRE_MARGIN = 0.20;

  // Standing variation is drawn from the frequency distribution a population at
  // mutation–drift equilibrium actually has: for a two-allele locus with
  // symmetric mutation, Wright's stationary density Beta(θ, θ). Most loci come
  // out monomorphic and the polymorphic ones are mostly RARE, because that
  // density piles up against both edges — which is what real data looks like.
  //
  // θ is its own control rather than 4Nμ computed from the run's settings, and
  // that is deliberate. θ describes the ancestral population's LONG-TERM
  // history — 4Nₑμ over however many generations it sat in that lake — and its
  // Nₑ has no reason to equal the N you give the two daughter populations for
  // the few hundred generations ahead. Tying them together forced a false
  // choice: a realistic ancestor meant a mutation rate so low that nothing new
  // ever arose, and a mutation rate high enough to matter meant an ancestor
  // polymorphic at every locus. Separating them lets the room show both
  // sources of divergence at once — the variation already there, and the
  // variation still to come.
  const theta = () => params.theta0;

  const COLORS = {
    ink: '#262220', inkSoft: '#6b6258', rule: '#cabfa8',
    lake: '#2F6E5E', stream: '#2E5C8A', stamp: '#C08A2E', threshold: '#B3141F'
  };

  function rand() { return Math.random(); }
  function gauss() {
    const u = 1 - rand(), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  // Deterministic stream, so the individuals sampled for display don't reshuffle
  // every time the same generation is redrawn (resize, scrubbing back and forth).
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // Marsaglia–Tsang, with the standard boost for shape < 1 — which is the case
  // that matters here, since a realistic θ is well below 1.
  function gammaRand(a) {
    if (a < 1) return gammaRand(a + 1) * Math.pow(rand(), 1 / a);
    const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = gauss(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = rand();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  const betaRand = (a, b) => { const x = gammaRand(a); return x / (x + gammaRand(b)); };

  // One locus's MINOR allele frequency, drawn from the stationary distribution
  // and then rounded to a whole number of copies out of 2N — which is what
  // makes most loci come out monomorphic, since a frequency below half a copy
  // is not a frequency the population can actually hold.
  //
  // The draw is folded about ½ because the labels are arbitrary: with symmetric
  // mutation the stationary density is symmetric, and calling the commoner
  // allele the ancestral one is the same convention real data uses when the
  // ancestral state is unknown. So the variant allele is always the minor one,
  // and a monomorphic locus is one where it is simply absent.
  function drawMinorFreq(th, twoN) {
    const x = betaRand(th, th);
    return Math.round(Math.min(x, 1 - x) * twoN) / twoN;
  }

  // Signed angular difference folded into (-180, 180]; hue is circular, so a
  // raw subtraction can report 350° for what is really a 10° shift.
  const wrap180 = (d) => ((d + 180) % 360 + 360) % 360 - 180;
  const hueDist = (h1, h2) => Math.abs(wrap180(h1 - h2));

  // --- habitats ---
  // The same scorer idea as the Adaptation Room: a signed score, positive when
  // the derived values are the ones this habitat favours. Only the SIGN is
  // used, so a single-preference scorer needs no normalisation. `null` means
  // this habitat has no preference about that trait, and its loci are then
  // neutral there.
  //
  // Stream is deliberately identical to the Adaptation Room's Stream — slender,
  // blue, short fins, long tail, no eye preference — so the same habitat means
  // the same thing in both rooms. Lake is its opposite on shape, colour and
  // fins, is the only one of the two that cares about eye size, and is the only
  // one that does not care about the tail.
  function roundnessOf(v) { return v.bRy / ((v.bRxFront + v.bRxBack) / 2); }
  function finSizeOf(v) { return (v.dorsLen + v.analLen) / 2; }
  function tailSizeOf(v) { return (v.tailLen + v.tailSpread) / 2; }

  // `physOptimum` is where on the physiological axis this habitat's demands are
  // best met. The 40 non-morphological adaptive loci all sit on that one axis,
  // with the ancestral allele at 0, still water asking for −1 and fast water for
  // +1. An allele is favoured when it brings the locus CLOSER to what the
  // habitat needs — a target, not a direction, which is the honest shape for a
  // physiological demand: there is a right amount of gill surface or ion pump,
  // and more is not better past it.
  //
  // Two consequences, both wanted. Adaptation at these loci FINISHES: once a
  // population is sitting on the optimum, further mutations there are
  // deleterious and get purged, so the locus goes quiet instead of sweeping
  // over and over for as long as the run lasts. And because the two optima sit
  // either side of the ancestral allele, two lakes are PARALLEL at these loci
  // and a lake and a stream DIVERGENT — the same contrast the traits draw,
  // with nothing to see.
  const HABITATS = {
    lake: {
      blurb: 'still, open water; favours a deep body, amber colour, big eyes and long fins',
      color: COLORS.lake,
      physOptimum: -1,
      scorers: {
        shape: (a, d) => roundnessOf(d) - roundnessOf(a),                        // favours a deep, round body
        colour: (a, d) => hueDist(a.bodyHue, 40) - hueDist(d.bodyHue, 40),       // favours amber
        eyeSize: (a, d) => d.eyeR - a.eyeR,                                      // favours a big eye
        finSize: (a, d) => finSizeOf(d) - finSizeOf(a),                          // favours long fins
        tailSize: null
      }
    },
    stream: {
      blurb: 'fast, shallow water; favours a slender body, blue colour, short fins and a long tail',
      color: COLORS.stream,
      physOptimum: +1,
      scorers: {
        shape: (a, d) => roundnessOf(a) - roundnessOf(d),                        // favours slender
        colour: (a, d) => hueDist(a.bodyHue, 210) - hueDist(d.bodyHue, 210),     // favours blue
        eyeSize: null,
        finSize: (a, d) => finSizeOf(a) - finSizeOf(d),                          // favours short fins
        tailSize: (a, d) => tailSizeOf(d) - tailSizeOf(a)                        // favours a long tail
      }
    }
  };
  // Both lakes are the same KIND of place — identical preferences — but they
  // are not the same lake, which is why B's is named separately.
  function habitatLabel(key, h) {
    if (h === 'stream') return T('sp.hab.stream', 'Stream');
    return key === 'a' ? T('sp.hab.homeLake', 'Home lake') : T('sp.hab.otherLake', 'Another lake');
  }
  const habitatBlurb = (h) => T('sp.habBlurb.' + h, HABITATS[h].blurb);

  // --- DOM ---
  const DOM = {
    sliderN: DOMg('sliderN'), nVal: DOMg('nVal'),
    sliderN2: DOMg('sliderN2'), n2Val: DOMg('n2Val'),
    sliderG: DOMg('sliderG'), gVal: DOMg('gVal'),
    sliderX: DOMg('sliderX'), xVal: DOMg('xVal'),
    sliderY: DOMg('sliderY'), yVal: DOMg('yVal'),
    habitatSeg: DOMg('habitatSeg'),
    matingSeg: DOMg('matingSeg'), matingField: DOMg('matingField'),
    sliderTheta: DOMg('sliderTheta'), thetaVal: DOMg('thetaVal'),
    sliderS: DOMg('sliderS'), sVal: DOMg('sVal'),
    sliderMu: DOMg('sliderMu'), muVal: DOMg('muVal'),
    sliderEff: DOMg('sliderEff'), effVal: DOMg('effVal'),
    btnRun: DOMg('btnRun'), btnReset: DOMg('btnReset'),
    statusBar: DOMg('statusBar'),
    timeScrubber: DOMg('timeScrubber'), scrubVal: DOMg('scrubVal'), scrubMaxLabel: DOMg('scrubMaxLabel'),
    ancMean: DOMg('ancMean'), ancIndividuals: DOMg('ancIndividuals'), ancStats: DOMg('ancStats'),
    ancSub: DOMg('ancSub'),
    verdict: DOMg('verdict'),
    strip: DOMg('strip'),
    chartD: DOMg('chartD'), chartHue: DOMg('chartHue'),
    divTableWrap: DOMg('divTableWrap'), subTableWrap: DOMg('subTableWrap')
  };
  const popMeans = {}, popIndividuals = {}, popStats = {}, popCards = {}, popSubs = {};
  POPS.forEach(k => {
    popMeans[k] = DOMg(`popMean_${k}`);
    popIndividuals[k] = DOMg(`popIndividuals_${k}`);
    popStats[k] = DOMg(`popStats_${k}`);
    popCards[k] = DOMg(`popCard_${k}`);
    popSubs[k] = DOMg(`popSub_${k}`);
  });

  const setStatus = (fn) => { DOM.statusBar.textContent = fn(); };

  // --- state ---
  let params = {
    N: +DOM.sliderN.value,
    N2: +DOM.sliderN2.value,
    G: +DOM.sliderG.value,
    X: +DOM.sliderX.value,
    Y: +DOM.sliderY.value,
    theta0: +DOM.sliderTheta.value,
    s: +DOM.sliderS.value,
    mu: +DOM.sliderMu.value,
    effect: +DOM.sliderEff.value,
    mating: true,
    habitatB: DOM.habitatSeg.querySelector('button.active').dataset.habitat
  };
  // Population A never leaves the home lake — that is what makes it the
  // population that stayed.
  const HABITAT_A = 'lake';

  let base = null;      // the ancestral baseline genome, i.e. the phenotype of a
                        // fish homozygous for the ancestral allele everywhere
  let loci = [];        // [{ trait, phys }] — trait is null for every locus past the 13th
  let p0 = [];          // frequency of the variant allele in the ancestral population
  // The allele registry. Ids 0..2·N_LOCI−1 are the two alleles each locus starts
  // with — even ids ancestral, odd ids the standing variant. Everything from
  // FIRST_MUTANT up arose by mutation after the split, in one population only.
  const ancestralAllele = (i) => 2 * i;
  const variantAllele = (i) => 2 * i + 1;
  const FIRST_MUTANT = 2 * N_LOCI;
  let alleleEffect = [];   // allele id -> effect object (morphological loci only)
  let physEffect = [];     // allele id -> position on the physiological axis (physiological loci only)
  let nextAlleleId = FIRST_MUTANT;

  let checkpoints = null;
  let crossings = null; // { fixedAt, hueAt } — first generation each threshold was met
  // The settings the stored run was actually made with. The panels read these
  // rather than the live controls, so moving something to set up the NEXT run
  // never relabels the run already on screen. X and Y are deliberately not in
  // here: they are a reading taken of a finished run, not an input to it, so
  // they stay live and the verdict updates as you drag them.
  let runConfig = null;
  const shownCfg = () => runConfig || { N: params.N, N2: params.N2, habitatB: params.habitatB };
  const habitatOf = (key) => key === 'a' ? HABITAT_A : shownCfg().habitatB;

  // --- the ancestral population ---
  function newEffect(parent, trait) {
    const out = {};
    TRAIT_PARAMS[trait].forEach(p => {
      const def = SHAPES.fish.params[p];
      const range = def.max - def.min;
      // Circular parameters take half the spread, matching the convention in
      // shapes-engine's mutate(): a hue's range is the whole wheel, so the same
      // fraction of it would be a far bigger visual jump.
      out[p] = (parent ? parent[p] : 0) + gauss() * params.effect * range * (def.circular ? 0.5 : 1);
    });
    return out;
  }

  // The ancestral population has lived in the lake for a long time, so the fish
  // the room opens on is a lake fish, not a generic one. A thousand generations
  // of an adaptive walk get it there: each generation proposes a mutation, and
  // it is kept trait by trait, accepted only where the lake prefers the fish it
  // makes. Traits the lake has no opinion about (the tail) and the parameters
  // that belong to no trait at all drift freely, so two ancestral populations
  // are recognisably the same kind of fish without being the same fish.
  // The walk stops short of the edges of the drawing parameters — see
  // PRE_MARGIN — so the fish it produces is a round lake fish with room left to
  // get rounder still, rather than the roundest fish the model can draw.
  //
  // What the walk produces is the population's MEAN phenotype, not the baseline.
  // Those are not the same thing: the baseline is an individual homozygous for
  // the ancestral allele everywhere, and the standing variation pulls the mean
  // off it by however much the variant alleles happen to add up to. It is the
  // mean that has to be the lake fish, so the baseline is then solved for
  // backwards — see fitBaselineToMean().
  const TRAIT_OF = {};
  TRAITS.forEach(t => TRAIT_PARAMS[t].forEach(p => { TRAIT_OF[p] = t; }));
  const FREE_PARAMS = Object.keys(SHAPES.fish.params).filter(p => !TRAIT_OF[p]);

  // Pull a proposed genome back inside the walk's box. Circular parameters have
  // no walls to hit — body hue runs right around the wheel — so they are left
  // alone, which matters: the lake's colour preference is the one that DOES
  // have an optimum (amber, hue 40), and the walk has to be free to reach it.
  function squeezeToBox(g) {
    const defs = SHAPES.fish.params;
    for (const p of Object.keys(defs)) {
      const def = defs[p];
      if (def.circular) continue;
      const inset = PRE_MARGIN * (def.max - def.min);
      g[p] = Math.min(def.max - inset, Math.max(def.min + inset, g[p]));
    }
    return g;
  }

  function adaptToLake(g) {
    const scorers = HABITATS.lake.scorers;
    g = squeezeToBox({ ...g });
    for (let i = 0; i < PRE_GENS; i++) {
      const cand = squeezeToBox(mutate(g, PRE_SIGMA, 'fish'));
      const next = { ...g };
      TRAITS.forEach(t => {
        const trial = { ...g };
        TRAIT_PARAMS[t].forEach(p => { trial[p] = cand[p]; });
        // No scorer means no preference, so the step is taken either way.
        if (!scorers[t] || scorers[t](g, trial) > 0) TRAIT_PARAMS[t].forEach(p => { next[p] = cand[p]; });
      });
      FREE_PARAMS.forEach(p => { next[p] = cand[p]; });
      g = next;
    }
    return g;
  }

  // Signed step from `from` to `to`, the short way round for a circular
  // parameter, so a correction of 10° is never mistaken for one of 350°.
  function paramDelta(p, from, to) {
    return SHAPES.fish.params[p].circular ? wrap180(to - from) : to - from;
  }

  // Choose the baseline that puts the population's MEAN phenotype on `target`.
  // mean = clamp(base + Σ pᵢ·effectᵢ), so this walks the baseline down the
  // residual a few times rather than solving it in one step: that way, when a
  // parameter is pinned at the edge of its range and the mean cannot reach the
  // target, it simply gets as close as the range allows instead of overshooting.
  function fitBaselineToMean(target) {
    base = clampGenome({ ...target });
    for (let pass = 0; pass < 6; pass++) {
      const mean = meanGenome(ancestralPop());
      let moved = 0;
      const next = { ...base };
      for (const p of Object.keys(SHAPES.fish.params)) {
        const d = paramDelta(p, mean[p], target[p]);
        next[p] = base[p] + d;
        moved = Math.max(moved, Math.abs(d));
      }
      base = clampGenome(next);
      if (moved < 1e-6) break;
    }
  }

  function buildAncestor() {
    base = freshAncestor('fish');   // provisional; replaced once the loci exist

    loci = [];
    TRAITS.forEach(trait => {
      for (let j = 0; j < LOCI_PER_TRAIT[trait]; j++) loci.push({ trait });
    });
    for (let j = 0; j < N_PHYS; j++) loci.push({ trait: null, phys: true });
    for (let j = 0; j < N_NEUTRAL; j++) loci.push({ trait: null, phys: false });

    alleleEffect = [];
    physEffect = [];
    loci.forEach((L, i) => {
      if (L.phys) {
        // The ancestral allele is the origin of the axis and the standing
        // variant a step off it, as likely one way as the other — so roughly
        // half of this ancestor's physiological variation is of use in a lake
        // and roughly half in a stream, which is what makes these loci sort the
        // two habitats apart. The step is drawn at the same scale as the
        // distance to either optimum, so a single allele can carry a locus most
        // of the way there. That the lake ancestor is not already sitting on its
        // own optimum is the same simplification the trait loci make: the
        // standing variation is drawn from a mutation–DRIFT equilibrium, so
        // nothing has filtered it by the selection the population lived under.
        physEffect[ancestralAllele(i)] = 0;
        physEffect[variantAllele(i)] = gauss();
        return;
      }
      if (!L.trait) return;
      alleleEffect[ancestralAllele(i)] = newEffect(null, L.trait); // all zeros: this IS the baseline
      TRAIT_PARAMS[L.trait].forEach(p => { alleleEffect[ancestralAllele(i)][p] = 0; });
      alleleEffect[variantAllele(i)] = newEffect(null, L.trait);
    });
    nextAlleleId = FIRST_MUTANT;

    // Frequencies are multiples of 1/2N because the ancestral population has N
    // individuals; θ decides the shape of the distribution they are drawn from.
    const th = theta();
    p0 = loci.map(() => drawMinorFreq(th, 2 * params.N));

    // Only now, with the standing variation drawn, can the baseline be set so
    // that what the room actually shows — the population mean — is the fish a
    // thousand generations in the lake would have produced.
    fitBaselineToMean(adaptToLake(freshAncestor('fish')));
  }

  // --- genotype → phenotype ---
  function clampGenome(g) {
    const defs = SHAPES.fish.params;
    for (const p of Object.keys(defs)) {
      const def = defs[p], range = def.max - def.min;
      if (def.circular) g[p] = ((g[p] - def.min) % range + range) % range + def.min;
      else g[p] = Math.min(def.max, Math.max(def.min, g[p]));
    }
    return g;
  }

  // The phenotype of a fish homozygous for one allele and ancestral everywhere
  // else — what a habitat scorer is shown when it decides whether that allele is
  // a good idea there.
  function alleleGenome(id) {
    const g = { ...base }, e = alleleEffect[id];
    for (const p in e) g[p] += e[p];
    return clampGenome(g);
  }

  // A population's state. Each locus carries at most two alleles: `id0` at
  // frequency 1−p and `id1` at frequency p. `s` is id1's selection coefficient
  // against id0, signed when the pair came into existence and constant after.
  // `mut` and `sub` are the running tallies of new alleles that AROSE and new
  // alleles that FIXED, kept apart by class of locus. Their ratio, class by
  // class, is what selection does to the fate of a mutation — see
  // renderSubTable().
  const zeroTally = () => ({ morph: 0, phys: 0, neutral: 0 });
  function makePop(N) { return { N, id0: [], id1: [], p: [], s: [], mut: zeroTally(), sub: zeroTally() }; }

  // The population's mean phenotype. Additive in allele dosage, so the mean over
  // individuals is exactly the baseline plus each locus's frequency-weighted
  // effect — no sampling needed. Only the first N_MORPH loci appear; the rest do
  // not touch morphology. Clamping is applied at the end, once, to the sum.
  function meanGenome(pop) {
    const g = { ...base };
    for (let i = 0; i < N_MORPH; i++) {
      const e0 = alleleEffect[pop.id0[i]], e1 = alleleEffect[pop.id1[i]], p = pop.p[i];
      for (const k in e0) g[k] += (1 - p) * e0[k] + p * e1[k];
    }
    return clampGenome(g);
  }

  // One individual drawn from the population: two independent alleles per
  // morphological locus, contributing half an effect each. It carries the other
  // 1,000 loci too — physiology included — but there is nothing there to draw,
  // which is the whole point of them.
  function individualGenome(pop, rng) {
    const g = { ...base };
    for (let i = 0; i < N_MORPH; i++) {
      const p = pop.p[i];
      const c = (rng() < p ? 1 : 0) + (rng() < p ? 1 : 0);
      const e0 = alleleEffect[pop.id0[i]], e1 = alleleEffect[pop.id1[i]];
      for (const k in e0) g[k] += ((2 - c) / 2) * e0[k] + (c / 2) * e1[k];
    }
    return clampGenome(g);
  }

  // Body hue is what the mating-signal criterion reads, and it has to be read
  // off the clamped, wrapped mean genome rather than the raw sum.
  const meanHue = (pop) => meanGenome(pop).bodyHue;

  // --- population genetics ---

  // Exact sampling of 2N gametes is a 2N-iteration loop, and this room runs 1,013
  // loci in two populations for up to a few thousand generations — tens of
  // millions of draws at the top of the sliders. Where the normal approximation
  // to the binomial is safe (many trials AND a frequency well away from the
  // boundaries) it stands in; everywhere else the exact loop runs. That split
  // puts the exact sampler exactly where it matters: near p = 0 and p = 1,
  // where the approximation is worst and where the outcome being decided is
  // loss or fixation.
  function binomial(n, p) {
    if (p <= 0) return 0;
    if (p >= 1) return n;
    // Mirror so the rare tail is always the one being counted; Binomial(n, p)
    // and n − Binomial(n, 1−p) are the same distribution.
    if (p > 0.5) return n - binomial(n, 1 - p);
    if (n <= 120) {                                  // small pool: just do it exactly
      let c = 0;
      for (let i = 0; i < n; i++) if (rand() < p) c++;
      return c;
    }
    const mean = n * p, variance = mean * (1 - p);
    if (variance >= 9) {
      const k = Math.round(mean + Math.sqrt(variance) * gauss());
      return Math.min(n, Math.max(0, k));
    }
    // Rare allele in a large pool. Knuth's Poisson(np), which costs about np
    // steps rather than n — and np is under 9 here by the branch above, against
    // an n of several hundred. The approximation errs by O(p), so at most about
    // 2% in the variance, and it keeps the quantity that actually matters:
    // P(0), the chance the allele is lost this generation, is (1−p)^n = 0.3675
    // against Poisson's 0.3679 at the boundary of this branch.
    const L = Math.exp(-mean);
    let k = 0, prod = rand();
    while (prod > L && k < n) { k++; prod *= rand(); }
    return k;
  }

  // Diploid selection with the BENEFICIAL allele dominant, whichever of the two
  // that is: h = 1 when the tracked allele is the favoured one, h = 0 when it is
  // the disfavoured one and its alternative is therefore the dominant good copy.
  //
  // Dominance is what lets a rare beneficial allele get anywhere. A new one
  // spends its whole early life in heterozygotes; if it were recessive there,
  // selection could not see it at all and drift would almost always take it. A
  // dominant one is exposed from the first copy, so it fixes roughly twice as
  // often as an additive one — which is the difference between new mutation
  // contributing to adaptation here and not.
  function stepFreq(freq, s, N) {
    let post = freq;
    if (s !== 0) {
      const h = s > 0 ? 1 : 0;
      const p = freq, q = 1 - freq;
      const w11 = 1 + s, w12 = 1 + h * s, w22 = 1;
      const wBar = p * p * w11 + 2 * p * q * w12 + q * q * w22;
      if (wBar > 0) post = (p * p * w11 + p * q * w12) / wBar;
      post = Math.min(1, Math.max(0, post));
    }
    return binomial(2 * N, post) / (2 * N);
  }

  // The selection coefficient of allele `to` against allele `from`, in this
  // habitat. Zero for a locus neither habitat has any use for, and for a trait
  // this habitat in particular has no opinion about.
  function coefficient(i, from, to, habitat) {
    if (loci[i].phys) {
      // Closer to what this habitat needs, or further from it. Only which of
      // the two it is matters — an allele that helps at all gets the full s,
      // exactly as a morphological allele does, whose effect vector is likewise
      // read for its direction and never for its size.
      const opt = HABITATS[habitat].physOptimum;
      const closer = Math.abs(physEffect[from] - opt) - Math.abs(physEffect[to] - opt);
      return Math.abs(closer) > 1e-9 ? Math.sign(closer) * params.s : 0;
    }
    const trait = loci[i].trait;
    if (!trait) return 0;
    const scorer = HABITATS[habitat].scorers[trait];
    if (!scorer) return 0;
    const score = scorer(alleleGenome(from), alleleGenome(to));
    return Math.abs(score) > 1e-9 ? Math.sign(score) * params.s : 0;
  }

  // A brand-new allele, descended from whichever one this locus is currently
  // fixed for. Its effect is the resident's plus a fresh random step, so the
  // trait wanders rather than jumping back to somewhere it has already been —
  // there is no way for this to reproduce an allele that already exists.
  function mutateLocus(pop, i, habitat) {
    const resident = pop.p[i] >= 1 ? pop.id1[i] : pop.id0[i];
    const id = nextAlleleId++;
    if (loci[i].trait) alleleEffect[id] = newEffect(alleleEffect[resident], loci[i].trait);
    else if (loci[i].phys) physEffect[id] = physEffect[resident] + gauss();
    pop.id0[i] = resident;
    pop.id1[i] = id;
    pop.p[i] = 1 / (2 * pop.N);
    pop.s[i] = coefficient(i, resident, id, habitat);
    pop.mut[kindOf(i)]++;
  }

  // One generation for one population. A monomorphic locus has nothing to
  // sample — the only thing that can happen to it is a new mutation.
  function stepPopulation(pop, habitat) {
    for (let i = 0; i < N_LOCI; i++) {
      const p = pop.p[i];
      if (p <= 0 || p >= 1) {
        if (rand() < params.mu) mutateLocus(pop, i, habitat);
        continue;
      }
      pop.p[i] = stepFreq(p, pop.s[i], pop.N);
      // A locus that has just reached frequency 1 for an allele that did not
      // exist at the split has recorded a SUBSTITUTION. Only post-split alleles
      // count: a standing variant fixing is the sorting of variation the
      // ancestor already had, not something mutation produced during the run,
      // and mixing the two would make the substitutions-per-mutation ratio
      // below mean nothing. The test fires exactly once per fixation, because a
      // fixed locus takes the branch above from the next generation on.
      if (pop.p[i] >= 1 && pop.id1[i] >= FIRST_MUTANT) pop.sub[kindOf(i)]++;
    }
  }

  // Which allele a locus is fixed for, or -1 while it is still segregating.
  const residentOf = (pop, i) => pop.p[i] <= 0 ? pop.id0[i] : (pop.p[i] >= 1 ? pop.id1[i] : -1);

  // The count that decides post-zygotic isolation: loci where the two
  // populations are each fixed, for different alleles. A locus that is merely
  // *different in frequency* does not count — that is the point of the word
  // "fixed" — so the count can dip briefly while a new mutation sweeps through
  // a locus that had already settled.
  function isFixedDiffAt(A, B, i) {
    const ra = residentOf(A, i), rb = residentOf(B, i);
    return ra >= 0 && rb >= 0 && ra !== rb;
  }
  function fixedDifferences(A, B, from, to) {
    let n = 0;
    for (let i = from; i < to; i++) if (isFixedDiffAt(A, B, i)) n++;
    return n;
  }
  // Expected heterozygosity, 2pq averaged over loci — how much variation the
  // population still has left to sort.
  const heterozygosity = (pop) => pop.p.reduce((s, p) => s + 2 * p * (1 - p), 0) / N_LOCI;
  const nFixed = (pop) => pop.p.reduce((n, p) => n + ((p <= 0 || p >= 1) ? 1 : 0), 0);
  // How many loci the ancestral population was actually variable at — the most
  // fixed differences the standing variation alone could ever produce.
  const ancestralPolymorphic = () => p0.reduce((n, p) => n + (p > 0 && p < 1 ? 1 : 0), 0);
  // Loci now fixed for an allele that did not exist at the split.
  function nNewFixed(pop) {
    let n = 0;
    for (let i = 0; i < N_LOCI; i++) if (residentOf(pop, i) >= FIRST_MUTANT) n++;
    return n;
  }
  // How far a locus has moved from the allele the baseline fish carries. Once a
  // population has left the ancestral allele behind it can never return to it,
  // so this only ever climbs — a later mutation darkens a cell, it never resets
  // one.
  const nonAncestralFrac = (pop, i) => pop.id0[i] === ancestralAllele(i) ? pop.p[i] : 1;

  // How the two populations' selection lines up at each trait, read off the
  // coefficients the standing variation actually carries rather than assumed
  // from the habitat names. 'divergent' is the engine of ecological speciation;
  // 'parallel' is its opposite, and the reason two populations in the same kind
  // of habitat diverge more slowly at these loci than drift alone would manage.
  function foundingCoefficients(habitat) {
    return loci.map((L, i) => coefficient(i, ancestralAllele(i), variantAllele(i), habitat));
  }
  function traitModes(sA, sB) {
    const modes = {};
    let i = 0;
    TRAITS.forEach(trait => {
      let opposed = 0, aligned = 0, aOnly = 0, bOnly = 0;
      for (let j = 0; j < LOCI_PER_TRAIT[trait]; j++, i++) {
        const a = sA[i], b = sB[i];
        if (a && b) (a * b < 0 ? opposed++ : aligned++);
        else if (a) aOnly++;
        else if (b) bOnly++;
      }
      modes[trait] = opposed ? 'divergent' : aligned ? 'parallel' : aOnly ? 'aOnly' : bOnly ? 'bOnly' : 'none';
    });
    return modes;
  }
  function modeLabel(mode, habB) {
    if (mode === 'divergent') return T('sp.mode.divergent', 'divergent');
    if (mode === 'parallel') return T('sp.mode.parallel', 'parallel');
    if (mode === 'aOnly') return T('sp.mode.aOnly', 'lake only');
    if (mode === 'bOnly') return T('sp.mode.only', '{h} only', { h: habitatLabel('b', habB).toLowerCase() });
    return T('sp.mode.none', 'neutral in both');
  }

  // When each threshold was first met. Derived from the stored run rather than
  // recorded as it happened, so dragging X or Y after a run moves the reported
  // generation with it instead of leaving a number from the old threshold.
  function recomputeCrossings() {
    crossings = { fixedAt: null, hueAt: null };
    if (!checkpoints) return;
    for (const c of checkpoints) {
      if (crossings.fixedAt === null && c.d >= params.X) crossings.fixedAt = c.gen;
      if (crossings.hueAt === null && c.dh >= params.Y) crossings.hueAt = c.gen;
      if (crossings.fixedAt !== null && crossings.hueAt !== null) break;
    }
  }

  // --- the run ---
  const snapshot = (pop) => ({
    N: pop.N, id0: pop.id0.slice(), id1: pop.id1.slice(), p: pop.p.slice(),
    mut: { ...pop.mut }, sub: { ...pop.sub }
  });

  async function runSimulation() {
    setControlsDisabled(true);
    setStatus(() => T('sp.simulating', 'Simulating…'));
    await new Promise(r => setTimeout(r, 20)); // let the UI paint before the heavy loop

    const G = params.G;
    runConfig = { N: params.N, N2: params.N2, habitatB: params.habitatB };
    const habA = HABITAT_A, habB = params.habitatB;
    nextAlleleId = FIRST_MUTANT;   // a fresh run gets a fresh series of mutations

    // Founding the two populations. Each draws its own gametes from the same
    // ancestral gene pool, so they start out with slightly different
    // frequencies — the founder effect, and the small population feels it more.
    const pops = { a: makePop(params.N), b: makePop(params.N2) };
    POPS.forEach(k => {
      const pop = pops[k], hab = k === 'a' ? habA : habB;
      for (let i = 0; i < N_LOCI; i++) {
        pop.id0[i] = ancestralAllele(i);
        pop.id1[i] = variantAllele(i);
        pop.p[i] = binomial(2 * pop.N, p0[i]) / (2 * pop.N);
        pop.s[i] = coefficient(i, pop.id0[i], pop.id1[i], hab);
      }
    });

    checkpoints = [];
    crossings = { fixedAt: null, hueAt: null };
    const interval = Math.max(1, Math.round(G / 200)); // ~200 stored frames whatever G is

    const pushCheckpoint = (gen) => {
      const A = snapshot(pops.a), B = snapshot(pops.b);
      const dm = fixedDifferences(A, B, 0, N_MORPH);               // at the 13 morphological loci
      const dp = fixedDifferences(A, B, FIRST_PHYS, FIRST_NEUTRAL); // at the 40 physiological ones
      checkpoints.push({
        gen, a: A, b: B, dm, dp,
        d: dm + dp + fixedDifferences(A, B, FIRST_NEUTRAL, N_LOCI), // over the whole genome
        dh: hueDist(meanHue(A), meanHue(B))
      });
      recomputeCrossings();
    };
    pushCheckpoint(0);

    // Paced so the whole run takes a fixed ~8s however many generations it is,
    // the same as the Adaptation Room — the point is watching it happen.
    //
    // Each tick waits until its DEADLINE rather than for a fixed interval, so
    // the time spent simulating and drawing comes out of the budget instead of
    // being added to it. Sleeping a flat 80ms per tick would make the run take
    // 8s plus however long the arithmetic happens to need — which at 1,013 loci
    // is another two seconds, and would grow again with the next change to the
    // genome. When a tick has already overrun, it yields without sleeping and
    // the run simply finishes late rather than skipping frames.
    const RENDER_TICKS = 100, TOTAL_DURATION_MS = 8000;
    const renderInterval = Math.max(1, Math.round(G / RENDER_TICKS));
    const msPerTick = TOTAL_DURATION_MS / RENDER_TICKS;
    const startedAt = performance.now();
    let tick = 0;

    for (let gen = 1; gen <= G; gen++) {
      stepPopulation(pops.a, habA);
      stepPopulation(pops.b, habB);
      if (gen % interval === 0 || gen === G) pushCheckpoint(gen);
      if (gen % renderInterval === 0 || gen === G) {
        setStatus(() => T('sp.simulatingGen', 'Simulating… generation {g} / {max}', { g: gen, max: G }));
        renderState(checkpoints[checkpoints.length - 1], checkpoints.length - 1);
        tick++;
        const due = startedAt + tick * msPerTick;
        await new Promise(r => setTimeout(r, Math.max(0, due - performance.now())));
      }
    }

    DOM.timeScrubber.min = 0;
    DOM.timeScrubber.max = checkpoints.length - 1;
    DOM.timeScrubber.value = checkpoints.length - 1;
    DOM.timeScrubber.disabled = false;
    DOM.scrubMaxLabel.textContent = G;
    setControlsDisabled(false);
    renderCheckpoint(checkpoints.length - 1);
    setStatus(() => T('sp.done', 'Done — {g} generations in isolation.', { g: G }));
  }

  function setControlsDisabled(disabled) {
    [DOM.sliderN, DOM.sliderN2, DOM.sliderG, DOM.sliderX, DOM.sliderY, DOM.sliderTheta,
     DOM.sliderS, DOM.sliderMu, DOM.sliderEff, DOM.btnRun, DOM.btnReset].forEach(el => { el.disabled = disabled; });
    DOM.habitatSeg.querySelectorAll('button').forEach(b => { b.disabled = disabled; });
    DOM.matingSeg.querySelectorAll('button').forEach(b => { b.disabled = disabled; });
    DOM.timeScrubber.disabled = disabled || !checkpoints;
  }

  // --- rendering ---
  function sizeAndDraw(canvas, genome) {
    const size = Math.round((canvas.parentElement || canvas).getBoundingClientRect().width);
    if (size <= 0) return;   // tab hidden — the resize handler redraws it when it isn't
    const ctx = canvas.getContext('2d');
    scaleCanvas(canvas, ctx, size, size);
    drawGenome(ctx, size, size, genome, 'fish');
  }

  const N_SHOWN = 6; // individuals drawn per population
  function renderIndividuals(host, pop, seed) {
    if (host.children.length !== N_SHOWN) {
      host.innerHTML = '';
      for (let i = 0; i < N_SHOWN; i++) {
        const d = document.createElement('div');
        d.className = 'spec-indiv';
        d.innerHTML = '<canvas role="img" aria-label="One individual sampled from this population"></canvas>';
        host.appendChild(d);
      }
    }
    for (let i = 0; i < N_SHOWN; i++) {
      const rng = mulberry32(seed * 7919 + i * 104729);
      sizeAndDraw(host.children[i].firstChild, individualGenome(pop, rng));
    }
  }

  const statChips = (rows) =>
    rows.map(([k, v]) => `<div class="spec-chip"><em>${k}</em><span>${v}</span></div>`).join('');

  const habitatName = (key, h) =>
    `<span class="spec-habitat-badge" style="color:${HABITATS[h].color}">${habitatLabel(key, h)}</span>`;

  // The ancestral population, as a population object the renderers can read.
  const ancestralPop = () => {
    const pop = makePop(shownCfg().N);
    for (let i = 0; i < N_LOCI; i++) {
      pop.id0[i] = ancestralAllele(i); pop.id1[i] = variantAllele(i); pop.p[i] = p0[i]; pop.s[i] = 0;
    }
    return pop;
  };

  function renderAncestral() {
    const anc = ancestralPop();
    const poly = N_LOCI - nFixed(anc);
    DOM.ancSub.innerHTML = T('sp.ancSub', '{h} — at mutation–drift equilibrium, θ = {t}',
      { h: habitatName('a', 'lake'), t: theta().toFixed(2) });
    sizeAndDraw(DOM.ancMean, meanGenome(anc));
    renderIndividuals(DOM.ancIndividuals, anc, 1);
    DOM.ancStats.innerHTML = statChips([
      [T('sp.stat.n', 'Individuals'), shownCfg().N],
      [T('sp.stat.poly', 'Polymorphic loci'), `${poly} / ${N_LOCI}`],
      [T('sp.stat.het', 'Heterozygosity'), heterozygosity(anc).toFixed(3)]
    ]);
  }

  function renderPopulation(key, pop, seed) {
    const h = habitatOf(key);
    popCards[key].style.setProperty('--accent', HABITATS[h].color);
    popSubs[key].innerHTML = `${habitatName(key, h)} — ${habitatBlurb(h)}`;
    sizeAndDraw(popMeans[key], meanGenome(pop));
    renderIndividuals(popIndividuals[key], pop, seed);
    popStats[key].innerHTML = statChips([
      [T('sp.stat.n', 'Individuals'), pop.N],
      [T('sp.stat.fixed', 'Loci fixed'), `${nFixed(pop)} / ${N_LOCI}`],
      [T('sp.stat.newFixed', 'New alleles fixed'), nNewFixed(pop)],
      [T('sp.stat.het', 'Heterozygosity'), heterozygosity(pop).toFixed(3)]
    ]);
  }

  const shade = (v) => `hsl(35, 22%, ${(92 - 70 * v).toFixed(1)}%)`;

  // The 1,000 non-morphological loci are drawn to canvases rather than built as
  // divs. At this many loci the strip is rebuilt on every one of the hundred
  // render ticks in a run, and the DOM version cost more than the whole
  // simulation did. Geometry matches the CSS the morphological block uses: two
  // 17px rows, 2px apart, then the fixed-difference marks.
  //
  // There are two bands, because the 40 physiological loci are under selection
  // and the 960 behind them are not. The physiological band is given far more
  // width per locus than its share — 40 loci in a fifth of the strip — for the
  // same reason the 13 trait loci get a 17px cell each: at true scale it would
  // be four pixels wide and there would be nothing to watch.
  const BARCODE_ROW = 17, BARCODE_GAP = 2, BARCODE_MARK = 6;
  const BARCODE_H = BARCODE_ROW * 2 + BARCODE_GAP * 2 + 1 + BARCODE_MARK;
  function drawBand(id, from, to, cp) {
    const canvas = DOMg(id);
    if (!canvas) return;
    const w = Math.round((canvas.parentElement || canvas).getBoundingClientRect().width);
    if (w <= 0) return;   // tab hidden; the resize handler redraws it later
    const ctx = canvas.getContext('2d');
    scaleCanvas(canvas, ctx, w, BARCODE_H);
    ctx.clearRect(0, 0, w, BARCODE_H);
    const n = to - from, bw = w / n, drawW = Math.max(1, bw);
    const markY = BARCODE_ROW * 2 + BARCODE_GAP * 2 + 1;
    for (let j = 0; j < n; j++) {
      const i = from + j, x = j * bw;
      ctx.fillStyle = shade(nonAncestralFrac(cp.a, i));
      ctx.fillRect(x, 0, drawW, BARCODE_ROW);
      ctx.fillStyle = shade(nonAncestralFrac(cp.b, i));
      ctx.fillRect(x, BARCODE_ROW + BARCODE_GAP, drawW, BARCODE_ROW);
      if (isFixedDiffAt(cp.a, cp.b, i)) {
        ctx.fillStyle = COLORS.threshold;
        ctx.fillRect(x, markY, drawW, BARCODE_MARK);
      }
    }
  }
  function drawBarcode(cp) {
    drawBand('barcodePhys', FIRST_PHYS, FIRST_NEUTRAL, cp);
    drawBand('barcode', FIRST_NEUTRAL, N_LOCI, cp);
  }
  // Two lakes make the same physiological demands, a stream makes the opposite
  // ones — read off the optima rather than assumed from the habitat names, the
  // same way the trait groups get their tags.
  const physMode = (habB) =>
    HABITATS[HABITAT_A].physOptimum === HABITATS[habB].physOptimum ? 'parallel' : 'divergent';

  // The genome strip: one column per locus, one row per population, shaded by
  // how far that locus has moved from the ancestral allele. A fixed difference
  // is a column where the two rows are settled on different alleles — the red
  // marks underneath count them. The 13 morphological loci are grouped by trait
  // on the left; the 40 physiological and the 960 neutral ones are the two
  // barcodes filling the rest of the width, and the proportion between what is
  // selected and what is not is the lesson.
  function renderStrip(cp) {
    const habB = shownCfg().habitatB;
    const modes = traitModes(foundingCoefficients(HABITAT_A), foundingCoefficients(habB));

    const cell = (i, row, title) =>
      `<div class="spec-cell${isFixedDiffAt(cp.a, cp.b, i) ? ' is-fixdiff' : ''}" ` +
      `style="background:${shade(nonAncestralFrac(cp[row], i))}" ` +
      `title="${title(i)} — non-ancestral alleles at ${(nonAncestralFrac(cp[row], i) * 100).toFixed(0)}%"></div>`;
    const mark = (i) => `<div class="spec-mark${isFixedDiffAt(cp.a, cp.b, i) ? ' is-fixdiff' : ''}"></div>`;

    let morph = '', at = 0;
    TRAITS.forEach(trait => {
      const n = LOCI_PER_TRAIT[trait];
      const idx = []; for (let j = 0; j < n; j++) idx.push(at + j);
      at += n;
      const title = (i) => `${traitLabel(trait)} locus ${i - idx[0] + 1} of ${n}`;
      const cols = `style="grid-template-columns: repeat(${n}, 17px)"`;
      const mode = modes[trait];
      morph += `<div class="spec-strip-group spec-mode-${mode}">
          <div class="spec-strip-title">${traitLabel(trait)}</div>
          <div class="spec-sel-tag">${modeLabel(mode, habB)}</div>
          <div class="spec-strip-cells" ${cols}>${idx.map(i => cell(i, 'a', title)).join('')}</div>
          <div class="spec-strip-cells" ${cols}>${idx.map(i => cell(i, 'b', title)).join('')}</div>
          <div class="spec-strip-cells spec-strip-marks" ${cols}>${idx.map(mark).join('')}</div>
        </div>`;
    });

    const pMode = physMode(habB);
    const other = `<div class="spec-strip-group spec-strip-phys spec-mode-${pMode}">
        <div class="spec-strip-title">${T('sp.physTitle', 'Physiology')}</div>
        <div class="spec-sel-tag">${T('sp.physTag', '{n} loci, {mode}', { n: N_PHYS, mode: modeLabel(pMode, habB) })}</div>
        <canvas class="spec-barcode" id="barcodePhys_spec" role="img"
                aria-label="The ${N_PHYS} loci that adapt physiology, shaded by allele frequency in each population"></canvas>
      </div>
      <div class="spec-strip-group spec-strip-rest">
        <div class="spec-strip-title">${T('sp.otherTitle', 'No effect on either')}</div>
        <div class="spec-sel-tag">${T('sp.otherTag', '{n} loci, neutral here', { n: N_NEUTRAL })}</div>
        <canvas class="spec-barcode" id="barcode_spec" role="img"
                aria-label="The ${N_NEUTRAL} loci that affect neither morphology nor physiology, shaded by allele frequency in each population"></canvas>
      </div>`;

    DOM.strip.innerHTML =
      `<div class="spec-strip-rowlabels">
         <div class="spec-strip-title">&nbsp;</div>
         <div class="spec-sel-tag">&nbsp;</div>
         <div class="spec-rowlabel" style="color:${HABITATS[HABITAT_A].color}">A · ${habitatLabel('a', HABITAT_A)}</div>
         <div class="spec-rowlabel" style="color:${HABITATS[habB].color}">B · ${habitatLabel('b', habB)}</div>
         <div class="spec-rowlabel spec-rowlabel-mark">${T('sp.fixdiff', 'fixed diff.')}</div>
       </div>
       <div class="spec-strip-morph">${morph}</div>
       <div class="spec-strip-neutral">${other}</div>`;
    drawBarcode(cp);
  }

  // --- charts ---
  function chartFrame(canvas, H) {
    const W = canvas.parentElement.offsetWidth || 460;
    const ctx = canvas.getContext('2d');
    scaleCanvas(canvas, ctx, W, H);
    ctx.clearRect(0, 0, W, H);
    return { ctx, W, H };
  }

  function genAxisStep(maxG) {
    const raw = maxG / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 5, 10].map(m => m * mag).find(v => v >= raw) || mag * 10;
  }

  // One time-series chart with a horizontal threshold line. `series` is a list
  // of { values, color, width, dash }; every series shares the same y-axis.
  function drawSeriesChart(canvas, series, opts) {
    const { ctx, W, H } = chartFrame(canvas, opts.height || 190);
    const padL = 44, padR = 14, padT = 26, padB = 38;
    const gw = W - padL - padR, gh = H - padT - padB;
    const maxG = Math.max(1, opts.maxG), yMax = opts.yMax;
    const X = (g) => padL + (g / maxG) * gw;
    const Y = (v) => padT + gh * (1 - Math.min(1, v / yMax));

    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'left';
    ctx.fillText(opts.title, padL - 4, 14);

    // gridlines
    ctx.strokeStyle = COLORS.rule; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.font = '9px ui-monospace, monospace';
    for (let k = 0; k <= 4; k++) {
      const v = (yMax / 4) * k, y = Y(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = COLORS.inkSoft; ctx.textAlign = 'right';
      ctx.fillText(opts.yFormat ? opts.yFormat(v) : String(Math.round(v)), padL - 6, y + 3);
    }
    ctx.setLineDash([]);

    // x axis
    ctx.strokeStyle = COLORS.ink;
    ctx.beginPath(); ctx.moveTo(padL, padT + gh); ctx.lineTo(W - padR, padT + gh); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = COLORS.inkSoft;
    const step = genAxisStep(maxG);
    for (let g = 0; g <= maxG; g += step) {
      const x = X(g);
      ctx.beginPath(); ctx.moveTo(x, padT + gh); ctx.lineTo(x, padT + gh + 4); ctx.stroke();
      ctx.fillText(String(g), x, padT + gh + 15);
    }
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(T('sp.axisGen', 'Generation'), padL + gw / 2, padT + gh + 30);

    // The threshold. Drawn faint when the criterion is switched off, so you can
    // still see where the bar would have been.
    if (opts.threshold !== null && opts.threshold !== undefined) {
      const y = Y(opts.threshold);
      ctx.save();
      ctx.globalAlpha = opts.thresholdActive ? 1 : 0.3;
      ctx.strokeStyle = COLORS.threshold; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.threshold; ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(opts.thresholdLabel, W - padR, y - 4);
      ctx.restore();
    }

    series.forEach(s => {
      if (!s.values.length) return;
      ctx.beginPath();
      s.values.forEach((pt, i) => {
        const x = X(pt[0]), y = Y(pt[1]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2;
      if (s.dash) ctx.setLineDash(s.dash);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    if (opts.markerG !== null && opts.markerG !== undefined) {
      const x = X(opts.markerG);
      ctx.save();
      ctx.strokeStyle = COLORS.stamp; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + gh); ctx.stroke();
      ctx.restore();
    }
  }

  // Round up to a readable axis maximum. The steps are close enough together
  // that 59 becomes 60 rather than 100, which matters here: the counts this
  // room produces are small, and a coarse scale would flatten them onto the
  // floor of the chart.
  function niceCeil(v, floor) {
    const n = Math.max(floor || 4, v);
    const mag = Math.pow(10, Math.floor(Math.log10(n)));
    return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(m => m * mag).find(x => x >= n) || mag * 10);
  }

  function renderCharts(upTo) {
    const sofar = checkpoints.slice(0, upTo + 1);
    const maxG = params.G;
    const cur = sofar[sofar.length - 1];
    // Scaled to the count actually reached, not to all 1,013 loci. Only a locus
    // that was polymorphic can become a fixed difference, and only a fraction
    // of those will fix opposite ways, so the counts here are of order ten —
    // an axis running to 1,013 would leave every run flat along the bottom. It
    // only ever grows, so the curve never leaves the frame.
    const ceiling = niceCeil(Math.max(params.X, ...sofar.map(c => c.d)) * 1.25, 8);
    // The two selected subsets are plotted on the same axis as the total: they
    // cannot rise above 13 and 40, and seeing both pinned near the floor while
    // the total climbs is the clearest statement of what the three are
    // measuring. The physiological line sits well above the morphological one,
    // which is the other half of it — three times as many loci, sorting for the
    // same reason, and not one of them visible in the fish.
    drawSeriesChart(DOM.chartD, [
      { values: sofar.map(c => [c.gen, c.d]), color: COLORS.ink },
      { values: sofar.map(c => [c.gen, c.dp || 0]), color: COLORS.inkSoft, width: 1.5, dash: [2, 3] },
      { values: sofar.map(c => [c.gen, c.dm]), color: COLORS.stamp, width: 1.5, dash: [5, 3] }
    ], {
      title: T('sp.chart.d', 'Fixed differences: {d} in all, {p} physiological, {m} morphological',
        { d: cur.d, p: cur.dp || 0, m: cur.dm }),
      maxG, yMax: ceiling, threshold: params.X, thresholdActive: true,
      thresholdLabel: T('sp.chart.x', 'X = {x}', { x: params.X }),
      markerG: cur.gen
    });
    drawSeriesChart(DOM.chartHue, [
      { values: sofar.map(c => [c.gen, c.dh]), color: COLORS.stamp }
    ], {
      title: T('sp.chart.hue', 'Mating-signal divergence, body hue (now {d}°)', { d: cur.dh.toFixed(0) }),
      // Floored at 60° so a run that moves only a little is still readable, and
      // capped at 180°, which is as far apart as two hues can be.
      maxG, yMax: Math.min(180, niceCeil(Math.max(params.Y, ...sofar.map(c => c.dh)) * 1.25, 60)),
      threshold: params.Y, thresholdActive: params.mating,
      thresholdLabel: T('sp.chart.y', 'Y = {y}°', { y: params.Y }),
      markerG: cur.gen, yFormat: (v) => Math.round(v) + '°'
    });
  }

  // --- the verdict ---
  function renderVerdict(cp) {
    const post = cp.d >= params.X;
    const pre = params.mating && cp.dh >= params.Y;
    const speciated = post || pre;

    const criterion = (met, label, value, threshold, note) =>
      `<div class="spec-criterion${met ? ' is-met' : ''}">
         <div class="spec-crit-icon">${met ? '✓' : '·'}</div>
         <div class="spec-crit-body">
           <strong>${label}</strong>
           <span class="mono">${value} ${met ? '≥' : '&lt;'} ${threshold}</span>
           <em>${note}</em>
         </div>
       </div>`;

    // A threshold crossed earlier is worth reporting, but neither count stays
    // crossed of its own accord. Hue wanders freely; and the fixed-difference
    // count dips whenever a new mutation lands on a locus that had already
    // settled differently, which at this mutation rate is often. So a barrier
    // raised at generation 35 may well be down by the end, and saying "first
    // met" beside a panel reading "90° < 100°" would contradict itself.
    const firstAt = (g, met) => (g === null || g === undefined)
      ? ''
      : ' ' + (met
        ? T('sp.crossedAt', 'First met at generation {g}.', { g })
        : T('sp.lapsed', 'It was met at generation {g}, and has since fallen back.', { g }));

    let rows = criterion(post,
      T('sp.crit.post', 'Post-zygotic — genetic incompatibility'),
      cp.d, params.X,
      T('sp.crit.postNote', '{m} of them at the {n} loci that build the fish and {p} at the {q} that adapt its physiology; the rest at loci nothing selects on.',
        { m: cp.dm, n: N_MORPH, p: cp.dp || 0, q: N_PHYS }) + firstAt(crossings && crossings.fixedAt, post));

    rows += params.mating
      ? criterion(pre,
          T('sp.crit.pre', 'Pre-zygotic — mate recognition'),
          cp.dh.toFixed(0) + '°', params.Y + '°',
          T('sp.crit.preNote', 'Divergence in the body hue used to choose a mate.') + firstAt(crossings && crossings.hueAt, pre))
      : `<div class="spec-criterion is-off">
           <div class="spec-crit-icon">–</div>
           <div class="spec-crit-body"><strong>${T('sp.crit.pre', 'Pre-zygotic — mate recognition')}</strong>
           <em>${T('sp.crit.preOff', 'Switched off: no trait is acting as a mating signal, so colour divergence has no effect on who mates with whom.')}</em></div>
         </div>`;

    const headline = speciated
      ? (post && pre ? T('sp.verdict.both', 'Two species — both barriers are up')
        : post ? T('sp.verdict.post', 'Two species — post-zygotic isolation')
        : T('sp.verdict.pre', 'Two species — pre-zygotic isolation'))
      : T('sp.verdict.one', 'Still one species — two diverging populations');

    DOM.verdict.className = 'spec-verdict ' + (speciated ? 'is-speciated' : 'is-one');
    DOM.verdict.innerHTML =
      `<div class="spec-verdict-head">${headline}</div>
       <div class="spec-criteria">${rows}</div>`;
  }

  // A compact reading of how far each population has travelled: from the
  // ancestral mean, and from each other. Same normalised shape distance the
  // Branching and Adaptation Rooms use, so the numbers are comparable across
  // rooms.
  function renderDivTable(cp) {
    const gA = meanGenome(cp.a), gB = meanGenome(cp.b), gAnc = meanGenome(ancestralPop());
    const dA = normDist(gAnc, gA, 'fish').toFixed(3);
    const dB = normDist(gAnc, gB, 'fish').toFixed(3);
    const dAB = normDist(gA, gB, 'fish').toFixed(3);
    DOM.divTableWrap.innerHTML =
      `<table class="divtable">
         <tr><th></th><th>${T('sp.anc', 'Ancestral')}</th><th>${T('sp.popA', 'Population A')}</th><th>${T('sp.popB', 'Population B')}</th></tr>
         <tr><th>${T('sp.anc', 'Ancestral')}</th><td>0.000</td><td>${dA}</td><td>${dB}</td></tr>
         <tr><th>${T('sp.popA', 'Population A')}</th><td>${dA}</td><td>0.000</td><td>${dAB}</td></tr>
         <tr><th>${T('sp.popB', 'Population B')}</th><td>${dB}</td><td>${dAB}</td><td>0.000</td></tr>
       </table>`;
  }

  // Mutation and substitution accounting, class of locus by class of locus.
  // Two numbers each: how many new alleles AROSE in that population, and how
  // many of them went all the way to fixation. Only alleles that did not exist
  // at the split are counted — a standing variant fixing is the ancestor's
  // variation sorting, not something this run produced, and counting it here
  // would make the quotient of the two columns meaningless.
  //
  // That quotient is the whole argument. Mutation is blind: new alleles arrive
  // in proportion to the number of loci, at the same rate whatever the locus
  // does, so the mutation column is very nearly 13 : 40 : 960. What selection
  // changes is not how many mutations appear but how many of them get anywhere
  // — which is why the substitution column looks nothing like that ratio.
  const KIND_LABEL = {
    morph: () => T('sp.kind.morph', 'Morphological'),
    phys: () => T('sp.kind.phys', 'Physiological'),
    neutral: () => T('sp.kind.neutral', 'Neither — neutral')
  };
  const pctOf = (num, den) => {
    if (!(den > 0)) return '–';
    if (num === 0) return '0%';
    const r = 100 * num / den;
    return (r < 1 ? r.toFixed(2) : r.toFixed(1)) + '%';
  };
  const timesOf = (a, b) => {
    if (!(a > 0) || !(b > 0)) return '–';
    const r = a / b;
    return (r < 1 ? r.toFixed(2) : r < 10 ? r.toFixed(1) : Math.round(r)) + '×';
  };

  function renderSubTable(cp) {
    if (!DOM.subTableWrap) return;
    const rate = (pop, kind) => pop.mut[kind] > 0 ? pop.sub[kind] / pop.mut[kind] : 0;
    const selMut = (pop) => pop.mut.morph + pop.mut.phys;
    const selSub = (pop) => pop.sub.morph + pop.sub.phys;

    const cells = (kind) => POPS.map(k => {
      const pop = cp[k];
      return `<td>${pop.mut[kind]}</td><td>${pop.sub[kind]}</td><td>${pctOf(pop.sub[kind], pop.mut[kind])}</td>`;
    }).join('');

    const row = (kind, cls) =>
      `<tr${cls ? ` class="${cls}"` : ''}><th>${KIND_LABEL[kind]()} <span class="dim">(${KIND_COUNT[kind]})</span></th>${cells(kind)}</tr>`;

    const selected = `<tr class="spec-subtotal"><th>${T('sp.kind.selected', 'Selected — both of the above')} <span class="dim">(${N_MORPH + N_PHYS})</span></th>` +
      POPS.map(k => {
        const pop = cp[k];
        return `<td>${selMut(pop)}</td><td>${selSub(pop)}</td><td>${pctOf(selSub(pop), selMut(pop))}</td>`;
      }).join('') + '</tr>';

    const ratios = `<tr class="spec-subratio"><th>${T('sp.kind.ratio', 'Selected ÷ neutral')}</th>` +
      POPS.map(k => {
        const pop = cp[k];
        const selRate = selMut(pop) > 0 ? selSub(pop) / selMut(pop) : 0;
        return `<td>${timesOf(selMut(pop), pop.mut.neutral)}</td>` +
               `<td>${timesOf(selSub(pop), pop.sub.neutral)}</td>` +
               `<td>${timesOf(selRate, rate(pop, 'neutral'))}</td>`;
      }).join('') + '</tr>';

    const head = POPS.map(k =>
      `<th colspan="3">${T('sp.subhead', 'Population {k} — {h}', { k: k.toUpperCase(), h: habitatLabel(k, habitatOf(k)) })}</th>`).join('');
    const sub2 = POPS.map(() =>
      `<th>${T('sp.col.mut', 'mutations')}</th><th>${T('sp.col.sub', 'substitutions')}</th><th>${T('sp.col.fix', 'fixed')}</th>`).join('');

    DOM.subTableWrap.innerHTML =
      `<table class="divtable spec-subtable">
         <tr><th rowspan="2">${T('sp.col.loci', 'Loci')}</th>${head}</tr>
         <tr>${sub2}</tr>
         ${row('morph')}${row('phys')}${selected}${row('neutral')}${ratios}
       </table>`;
  }

  function renderState(cp, idx) {
    DOM.scrubVal.textContent = cp.gen;
    renderAncestral();
    renderPopulation('a', cp.a, 11 + idx);
    renderPopulation('b', cp.b, 23 + idx);
    renderStrip(cp);
    renderVerdict(cp);
    renderSubTable(cp);
    renderDivTable(cp);
    renderCharts(idx);
  }

  function renderCheckpoint(idx) {
    if (!checkpoints || !checkpoints[idx]) return;
    renderState(checkpoints[idx], idx);
  }

  // Before any run: both populations are the ancestral population, because
  // that is exactly what they are at the instant of the split.
  function renderPreRun() {
    DOM.scrubVal.textContent = 0;
    const A = ancestralPop(), B = ancestralPop();
    B.N = shownCfg().N2;
    renderAncestral();
    renderPopulation('a', A, 11);
    renderPopulation('b', B, 23);
    const cp = { gen: 0, a: A, b: B, d: 0, dm: 0, dh: 0 };
    renderStrip(cp);
    renderVerdict(cp);
    renderSubTable(cp);
    renderDivTable(cp);
    DOM.chartD.getContext('2d').clearRect(0, 0, DOM.chartD.width, DOM.chartD.height);
    DOM.chartHue.getContext('2d').clearRect(0, 0, DOM.chartHue.width, DOM.chartHue.height);
  }

  function renderCurrentView() {
    if (checkpoints) renderCheckpoint(parseInt(DOM.timeScrubber.value) || checkpoints.length - 1);
    else renderPreRun();
  }

  // --- control wiring ---
  const bindSlider = (slider, out, key, fmt, after) => {
    slider.addEventListener('input', () => {
      params[key] = +slider.value;
      out.textContent = fmt ? fmt(params[key]) : params[key];
      if (after) after();
    });
  };
  // N and μ are not just run settings: together they are θ, which is what the
  // ancestral population's variation is drawn from. Moving either builds a new
  // ancestral population, the same way the effect-size slider does. N₂ is the
  // founder count and has no bearing on the ancestor, so it only re-renders.
  bindSlider(DOM.sliderN, DOM.nVal, 'N', null, () => { newAncestralPopulation(); });
  bindSlider(DOM.sliderN2, DOM.n2Val, 'N2', null, () => { if (!checkpoints) renderCurrentView(); });
  bindSlider(DOM.sliderG, DOM.gVal, 'G');
  const rethreshold = () => { recomputeCrossings(); renderCurrentView(); };
  bindSlider(DOM.sliderX, DOM.xVal, 'X', null, rethreshold);
  bindSlider(DOM.sliderY, DOM.yVal, 'Y', (v) => v + '°', rethreshold);
  bindSlider(DOM.sliderS, DOM.sVal, 's', (v) => v.toFixed(2));
  // θ is the ancestral population's own property, so changing it builds a new one.
  bindSlider(DOM.sliderTheta, DOM.thetaVal, 'theta0', (v) => v.toFixed(2), () => { newAncestralPopulation(); });
  bindSlider(DOM.sliderMu, DOM.muVal, 'mu', (v) => v.toFixed(4));
  // Effect sizes are drawn when the alleles are created, so changing this is
  // changing the genetic architecture — it can only take hold in a fresh
  // ancestral population, and any run made under the old one is discarded.
  bindSlider(DOM.sliderEff, DOM.effVal, 'effect', (v) => v.toFixed(2), () => { newAncestralPopulation(); });

  DOM.habitatSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-habitat]');
    if (!btn || btn.disabled) return;
    params.habitatB = btn.dataset.habitat;
    DOM.habitatSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    // Only meaningful before a run: afterwards the panels keep describing the
    // habitat the run on screen was actually made in.
    if (!checkpoints) renderCurrentView();
  });

  DOM.matingSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mating]');
    if (!btn || btn.disabled) return;
    params.mating = btn.dataset.mating === 'on';
    DOM.matingSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    DOM.matingField.style.display = params.mating ? '' : 'none';
    renderCurrentView();
  });

  DOM.timeScrubber.addEventListener('input', (e) => { renderCheckpoint(parseInt(e.target.value)); });

  DOM.btnRun.addEventListener('click', () => { runSimulation(); });

  function newAncestralPopulation() {
    checkpoints = null; crossings = null; runConfig = null;
    DOM.timeScrubber.min = 0; DOM.timeScrubber.max = 0; DOM.timeScrubber.value = 0;
    DOM.timeScrubber.disabled = true;
    DOM.scrubMaxLabel.textContent = 0;
    buildAncestor();
    renderCurrentView();
    setStatus(() => T('sp.newAncestor', 'A new ancestral population. Set the parameters and press Run.'));
  }

  DOM.btnReset.addEventListener('click', newAncestralPopulation);

  window.addEventListener('resize', renderCurrentView);

  function init() {
    DOM.matingField.style.display = params.mating ? '' : 'none';
    buildAncestor();
    renderCurrentView();
    setStatus(() => T('sp.ready', 'Set the parameters and press Run.'));
  }

  init();
})();
