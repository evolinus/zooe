// Shared help system for every room.
//
// One registry of topics + one modal, driven entirely by markup: put a
//   <button class="help-btn" data-help="topicId"></button>
// anywhere (static HTML or JS-generated), and it becomes a red "?" that opens
// that topic. The "?" glyph comes from CSS, and a MutationObserver labels any
// button that appears later, so dynamically-rendered panels need no extra
// wiring — they just include the same markup.
//
// To add a topic: add an entry to HELP_TOPICS and reference its key from a
// data-help attribute. Bodies are trusted static HTML authored here.
(function () {
  const HELP_TOPICS = {

    // ---------- Tier 1: core parameters ----------

    popN: {
      title: 'Population size (N)',
      body: `
        <p><strong>N is the number of individuals</strong> in the population. Under
        <em>haploid</em> settings that means N gene copies; under <em>diploid</em>
        settings each individual carries two, so the pool sampled each generation
        is 2N gene copies.</p>
        <p>N controls <strong>how strong random drift is</strong>. Each generation is a
        random sample of the previous one, and small samples are noisy: the
        variance in allele frequency per generation is <code>f(1−f)/N</code>
        (haploid) or <code>f(1−f)/2N</code> (diploid).</p>
        <p><strong>Try this:</strong> run the same starting frequency at N=10 and at
        N=200. The small population lurches around and fixes quickly; the large
        one barely moves. Nothing changed but sample size.</p>`
    },

    freqF: {
      title: 'Initial frequency (f)',
      body: `
        <p><strong>f is the starting proportion of allele A</strong> in the population,
        from 0 (absent) to 1 (already fixed). f = 0.5 means an even split between
        A and B.</p>
        <p>The starting population is built to hit f as closely as rounding allows,
        then shuffled — so the actual starting value may differ very slightly from
        the slider, and the readout shows the true value.</p>
        <p><strong>Why it matters:</strong> with pure drift, an allele's probability of
        eventually fixing is simply its current frequency. An allele at f = 0.1 has
        a 10% chance of taking over the population and a 90% chance of being lost.</p>`
    },

    genG: {
      title: 'Generations (G)',
      body: `
        <p><strong>How many generations the simulation runs.</strong> Each generation is
        one complete round of reproduction — the whole population is replaced by a
        new sample drawn from it.</p>
        <p>A run stops early if the allele <em>fixes</em> (reaches f = 1) or is
        <em>lost</em> (f = 0), because from that point nothing can change: with no
        variation left, there is nothing for drift or selection to act on.</p>
        <p><strong>Rule of thumb:</strong> under pure drift, a neutral allele takes on the
        order of a few × N generations to fix or be lost. If your runs keep ending
        while still polymorphic, raise G or lower N.</p>`
    },

    ploidy: {
      title: 'Ploidy (haploid vs diploid)',
      body: `
        <p><strong>Haploid:</strong> each individual carries one gene copy (A or B). N
        individuals = N gene copies.</p>
        <p><strong>Diploid:</strong> each individual carries two copies, so there are three
        genotypes — AA, AB (heterozygote), BB — and N individuals = 2N gene copies.
        Copies are paired at random each generation, i.e. Hardy–Weinberg
        proportions.</p>
        <p>This is not just bookkeeping. Doubling the gene pool <strong>halves the drift
        variance</strong>, so diploid populations wander more slowly and take longer to
        fix. And in the Selection Room, fitness now belongs to <em>genotypes</em>
        rather than lone alleles, which is what makes dominance (h) meaningful.</p>`
    },

    mutSize: {
      title: 'Mutation size',
      body: `
        <p><strong>How much each copy can differ from its parent.</strong> Every time a
        shape is copied, each of its numeric traits is nudged by a random amount;
        this slider sets the typical size of that nudge.</p>
        <p>Crucially, the nudges are <strong>unbiased</strong> — equally likely to go up or
        down, with no target. Nothing here is steering the shape anywhere.</p>
        <p><strong>What to notice:</strong> even at the smallest setting, the shape still
        drifts away from the original given enough generations. No single copy is a
        big change; the changes simply never stop accumulating.</p>`
    },

    mutSizeAdapt: {
      title: 'Mutation size',
      body: `
        <p><strong>How large a change a new variant makes</strong> when it first appears
        at a trait locus. A mutation takes the trait's current fixed value and
        offsets it by a random amount of roughly this magnitude.</p>
        <p>This is separate from the <em>mutation rate</em> (μ), which controls how
        <em>often</em> new variants arise. Size = how big a jump; rate = how frequent.</p>
        <p>Large mutations move the phenotype faster but are a blunter instrument:
        a big jump in the habitat's preferred direction is strongly favoured, but a
        big jump the wrong way is strongly selected against.</p>`
    },

    divergence: {
      title: 'Divergence (Δ)',
      body: `
        <p><strong>Δ measures how different two shapes are</strong>, as a single number.
        Each trait's difference is scaled by that trait's possible range, and the
        scaled differences are combined into a normalized distance.</p>
        <p><strong>Δ = 0.00</strong> means identical. Larger values mean more different;
        because it is normalized, Δ is comparable across traits and across runs.</p>
        <p>It is a measure of <em>phenotypic</em> distance only — how different two shapes
        <em>look</em>, not how closely related they are. Two lineages can reach a similar Δ
        by entirely different routes, and a lineage that happens to drift very little can
        stay looking close to a distant relative.</p>
        <p>The Branching and Adaptation Rooms build on exactly this point: there, a family
        tree reconstructed from divergence alone is shown side by side with the true
        history, so you can see where appearance misleads.</p>`
    },

    binomDist: {
      title: 'Binomial distribution panel',
      body: `
        <p>This panel shows <strong>the probability of every possible outcome</strong> for
        the next generation, before it is drawn. If the pool is <code>n</code> gene
        copies and each is drawn as A with probability <code>p</code>, the number of
        A copies follows a binomial distribution.</p>
        <p><strong>E[k]</strong> is the expected count (n·p) — the single most likely
        outcome, highlighted in dark blue. <strong>O[k]</strong> is the count actually
        drawn, highlighted in gold.</p>
        <p><strong>The key insight:</strong> O[k] usually lands <em>near</em> E[k] but rarely
        exactly on it, and that gap is drift. Notice the distribution gets relatively
        narrower as N grows — larger populations deviate proportionally less.</p>`
    },

    binomVar: {
      title: 'Binomial variance panel',
      body: `
        <p>Plots <strong>V = f(1−f)/N</strong> — how much the allele frequency is expected
        to jump in a single generation, purely from sampling noise. (Diploid uses 2N,
        since the gene pool is twice as large.)</p>
        <p>Two things follow from the formula. <strong>Variance is largest at f = 0.5</strong>
        and shrinks toward 0 as the allele approaches fixation or loss — drift is
        fastest when both alleles are common. And <strong>variance shrinks as N grows</strong>,
        which is why big populations drift slowly.</p>
        <p>This curve is the engine behind everything you see on the frequency chart.</p>`
    },

    selS: {
      title: 'Selection coefficient (s)',
      body: `
        <p><strong>s is allele A's fitness advantage.</strong> A carriers have relative
        fitness 1+s against 1 for B. At s = 0.10, A is 10% more likely to be
        reproduced; at s = 0, the room behaves exactly like the Drift Room.</p>
        <p>Each generation the raw frequency f is reweighted by fitness into
        <strong>f′</strong>, and it is f′ — not f — that the wheel spins on and the
        binomial samples from. Selection biases the sampling; drift still does the
        drawing.</p>
        <p><strong>What matters is N·s, not s alone.</strong> When N·s is large, selection
        reliably wins and A fixes. When N·s is small, drift can overwhelm a genuine
        advantage and lose it — advantageous alleles are lost all the time in small
        populations.</p>`
    },

    domH: {
      title: 'Dominance (h)',
      body: `
        <p>In diploids, fitness belongs to genotypes. <strong>h sets the heterozygote's
        fitness</strong>: AA = 1+s, AB = 1+h·s, BB = 1.</p>
        <ul>
          <li><strong>h = 1</strong> — A fully dominant; one copy gives the full advantage.</li>
          <li><strong>h = 0.5</strong> — additive; the heterozygote is exactly intermediate.</li>
          <li><strong>h = 0</strong> — A fully recessive; only AA benefits.</li>
        </ul>
        <p><strong>The recessive trap:</strong> a rare allele sits almost entirely inside
        heterozygotes. If it is recessive, selection barely "sees" it while it is
        rare, so it can be lost to drift almost as easily as a neutral allele — even
        with a real fitness advantage. Try s = 0.2 with h = 0 versus h = 1.</p>`
    },

    traitS: {
      title: 'Selection coefficient per trait',
      body: `
        <p>Sets <strong>how strongly each trait is selected</strong>. This slider gives the
        <em>magnitude</em> only — the habitat decides the <em>direction</em>.</p>
        <p>When a new variant appears, it is compared against the current form: if it
        moves the trait toward what the habitat favours it gets +s, if it moves away
        it gets −s. Traits the habitat has no preference about get 0 and simply
        drift, no matter what this slider says.</p>
        <p>Set every trait to 0 and the Habitat lineage becomes a second Neutral
        lineage — a useful control to confirm that any difference you normally see
        really is selection.</p>`
    },

    traitMu: {
      title: 'Mutation rate per trait (μ)',
      body: `
        <p><strong>The chance per generation that a new variant appears</strong> at that
        trait's locus, when the locus is currently uniform.</p>
        <p>Mutation supplies the raw material. Selection cannot act on a trait until a
        variant exists, so a trait with μ = 0 stays frozen at its founder value
        forever, however strongly it is selected.</p>
        <p>Only one variant segregates per locus at a time here: once a variant
        appears it runs to fixation or loss before the next can arise. Higher μ means
        less waiting between those episodes.</p>`
    },

    traitTable: {
      title: 'Mutations and substitutions table',
      body: `
        <p><strong>Mut.</strong> counts how many new variants have <em>arisen</em> at that
        trait. <strong>Subs.</strong> counts how many actually <em>fixed</em> — became the
        new form for the whole lineage. Most mutations are lost; Subs. is always the
        much smaller number.</p>
        <p>Row shading shows the selective regime: <span style="background:rgba(46,90,140,0.15);padding:0 4px;">blue</span>
        traits are under selection in this habitat,
        <span style="background:var(--paper-dim);padding:0 4px;">grey</span> traits are not
        (they drift), and the
        <span style="background:rgba(168,52,42,0.15);padding:0 4px;">Neutral</span> row totals
        the changes that were selectively neutral even so.</p>
        <p><strong>What to compare:</strong> a Neutral and a Habitat lineage see similar
        <em>Mut.</em> counts — mutation does not care about habitat. The difference
        appears in <em>Subs.</em>: selection converts far more of those mutations into
        fixed changes.</p>`
    },

    // ---------- Tier 2: reading the panels ----------

    wheel: {
      title: 'Sampling wheel',
      body: `
        <p>The wheel makes one draw concrete. Its teal slice is the current frequency
        of A, the red slice is B, and one spin picks <strong>one gene copy</strong> for the
        next generation.</p>
        <p>A whole generation means spinning it once per gene copy in the pool, always
        <em>with replacement</em> — the wheel never changes during a generation, so any
        individual can be drawn many times or not at all.</p>
        <p>The first three generations are spun one at a time so you can watch the
        sampling happen; after that the same draws are computed instantly.</p>`
    },

    wheelSelection: {
      title: 'Sampling wheel and f′',
      body: `
        <p>The wheel works as in the Drift Room — one spin draws one gene copy — but
        here it does <strong>not</strong> spin on the raw frequency f.</p>
        <p>Fitness reweights f into <strong>f′</strong> first:
        <code>f′ = f(1+s) / (f(1+s) + (1−f))</code>. The wheel spins on f′, and the
        binomial panel draws from f′. This is the whole mechanism of selection —
        it <em>tilts the odds</em>, then ordinary random sampling does the rest.</p>
        <p>The <strong>gold band</strong> on the rim shows how far selection moved the split
        from where drift alone would have left it, and the <strong>Δf</strong> readout gives
        that shift as a number. Notice Δf is largest at intermediate frequencies and
        vanishes as the allele nears fixation.</p>`
    },

    popGrid: {
      title: 'Current population',
      body: `
        <p>Every dot is one individual in the present generation. Under haploid
        settings, <span style="color:#3D6E6E;">teal</span> = allele A and
        <span style="color:#A8442A;">red</span> = allele B.</p>
        <p>Under diploid settings each dot is a genotype: solid teal = AA, solid red =
        BB, and a split teal/red dot = the heterozygote AB, which carries one of each.</p>
        <p>During the first three generations the grid fills in one draw at a time as
        the wheel spins; once the generation is complete the copies are paired at
        random into individuals.</p>`
    },

    freqChart: {
      title: 'Allele frequency chart',
      body: `
        <p>Tracks the frequency of allele A over time. The <strong>solid black line</strong>
        is the actual, realized trajectory; the stacked teal/red bars behind it show
        the A/B split of the population at each generation.</p>
        <p>The line is jagged because every generation is a fresh random sample. It
        stops when it hits 0 or 1 — fixation or loss, from which there is no return.</p>
        <p><strong>Run the same settings several times.</strong> No two trajectories are
        alike: the parameters set the <em>tendencies</em>, never the outcome of any one
        run. That is the whole point of a stochastic process.</p>`
    },

    deterministic: {
      title: 'Deterministic reference line',
      body: `
        <p>The <strong>dashed line</strong> is the trajectory selection would produce on its
        own in an infinitely large population — pure fitness, zero sampling noise.</p>
        <p>The solid line is what actually happened. <strong>The gap between them is
        drift.</strong></p>
        <p>Raise N and the two lines converge, because sampling noise shrinks. Lower N
        and the real trajectory wanders far from the dashed one — and can even fix
        the <em>disadvantageous</em> allele while the dashed line climbs confidently
        toward 1.</p>`
    },

    run10: {
      title: 'Run 10 simulations',
      body: `
        <p>Runs ten <strong>independent</strong> populations with identical settings and
        overlays their trajectories.</p>
        <p>A single run tells you almost nothing about a random process — it is one
        draw from a distribution of possible histories. Ten runs show you the
        distribution itself.</p>
        <p>The summary reports how many fixed A, how many fixed B, and how many were
        still polymorphic at the end, with average fixation times. <strong>Try it with a
        real advantage (s &gt; 0) at small N</strong> and count how often the "better"
        allele still loses.</p>`
    },

    fixation: {
      title: 'Fixation and loss',
      body: `
        <p>An allele is <strong>fixed</strong> when it reaches frequency 1 (everyone carries
        it) and <strong>lost</strong> at frequency 0 (nobody does). The banner announces
        which happened, and when.</p>
        <p>Both are <strong>absorbing states</strong>: with only one allele left there is no
        variation for drift or selection to act on, so the population can never
        change again by these processes alone. The run stops there.</p>
        <p>This is why drift is ultimately a <em>destroyer of variation</em> — left long
        enough and with no new mutation, every population ends up uniform.</p>`
    },

    tanglegram: {
      title: 'Tanglegram: true vs inferred tree',
      body: `
        <p>A side-by-side comparison of <strong>what actually happened</strong> against
        <strong>what the data suggest happened</strong>.</p>
        <p><strong>Left</strong> is the true history — the real branching order you just
        watched, with solid-bordered ancestors. <strong>Right</strong> is a tree inferred by
        UPGMA clustering using <em>only</em> the final shapes, with dashed-bordered
        ancestors that are mathematical reconstructions, not observed organisms.</p>
        <p><strong>They often disagree.</strong> Clustering groups lineages that <em>look</em>
        alike, but lineages that drifted little can resemble each other while being
        distant relatives, and a fast-evolving lineage can look isolated. This is the
        central difficulty of real phylogenetics: similarity is not ancestry.</p>`
    },

    treeMethod: {
      title: 'UPGMA vs neighbour-joining',
      body: `
        <p>Both build a tree from the same distance matrix, but they assume
        different things — and the assumption is where trees go wrong.</p>
        <p><strong>UPGMA</strong> repeatedly joins the closest pair and assumes a
        <em>constant rate</em> of change. The result is <em>ultrametric</em>: every
        leaf ends up exactly the same distance from the root, as if all lineages had
        been ticking along at one shared clock.</p>
        <p><strong>Neighbour-joining</strong> assumes only that distances add up along
        the tree — not that rates are equal. Each lineage gets its own branch length,
        so a fast-evolving lineage appears on a long branch and a slow one on a short
        branch. (Its tree is unrooted; here it is rooted at the midpoint of the
        longest path, since the algorithm has no way to know the real root.)</p>
        <p><strong>When it matters:</strong> if every lineage really does change at the
        same rate, the two broadly agree. But as soon as rates differ, UPGMA is
        actively misled — it reads "these two look similar" as "these two are close
        relatives", so lineages that merely evolved <em>slowly</em> get grouped
        together even when they are not each other's nearest kin. Switch between the
        two here and check each against the true history on the left.</p>`
    },

    splitGens: {
      title: 'Split generations',
      body: `
        <p>Sets <strong>when each lineage splits in two</strong>. Drag the coloured marks to
        move the branch points; the tree preview updates as you drag.</p>
        <p>The first split (A into B and C) is fixed at generation 0. The other three
        must stay in order and at least a few generations apart, since a lineage
        cannot split before it exists.</p>
        <p><strong>What to explore:</strong> splits bunched close together create lineages
        that separated at nearly the same time and are hard to tell apart — exactly
        the situation where inferred trees go wrong. Compare that against splits
        spread far apart.</p>`
    },

    legend: {
      title: 'Lineage legend',
      body: `
        <p>Each surviving lineage has its own colour, used consistently for its card
        border, its vertical track down the page, and its branch in the trees at the
        bottom.</p>
        <p><strong>Black</strong> marks the ancestors (A, B, E, F) — lineages that existed
        for a while and then split. The five coloured lineages (C, D, G, H, I) are the
        ones that survive to the final generation and get compared at the end.</p>`
    },

    frozenCard: {
      title: 'Cards and split snapshots',
      body: `
        <p>Each card is one lineage's shape at that moment, drawn at its position down
        the page — vertical distance is time, so the further down, the later.</p>
        <p>When a lineage splits, its card is <strong>frozen</strong> and gains a coloured
        ring. It is a permanent snapshot of the ancestor at the instant of the split;
        the two daughter lineages start as identical copies of it and drift apart from
        there.</p>
        <p>Those frozen ancestors are the ground truth the inferred tree is trying to
        reconstruct — and, in real biology, are almost never available.</p>`
    },

    branchDivMatrix: {
      title: 'Final divergence matrix',
      body: `
        <p>Pairwise <strong>Δ divergence</strong> between the five final lineages: 0.00 means
        identical, larger means more different.</p>
        <p>This matrix is the <em>only</em> information the UPGMA tree on the right is
        built from — no ancestry, no timing, just final appearances.</p>
        <p><strong>Look for the mismatch:</strong> find two lineages that split long ago but
        show a small Δ, or a recent pair with a large one. Every such cell is a place
        where appearance misleads about relatedness.</p>`
    },

    consensusFish: {
      title: 'The consensus fish',
      body: `
        <p>Each card shows the <strong>typical individual</strong> of that lineage right now,
        not any one fish. For every trait it draws the form carried by the majority
        of the population.</p>
        <p>Because a derived variant is treated as fully dominant, a variant shows up
        in the consensus once more than half the individuals carry at least one copy
        — which happens well before it is fixed.</p>
        <p>So a trait can appear to "flip" in the picture while still segregating, and
        it can flip back if the variant is subsequently lost. The table beside it
        reports what has actually fixed.</p>`
    },

    adaptDivMatrix: {
      title: 'Divergence matrix and averages',
      body: `
        <p>Each row is a founder's generation-0 fish; each column is a final lineage.
        The cell is the <strong>Δ divergence</strong> between them — how far that lineage
        travelled from its starting point.</p>
        <p>The summary underneath averages each founder's distance from its own
        origin, split by regime. <strong>The Habitat average is normally well above the
        Neutral one</strong>, and that difference is the contribution of selection on top
        of drift.</p>
        <p>Also compare the off-diagonal cells: lineages in the <em>same</em> habitat tend
        to converge on a similar look even though they started from different
        founders and are not related — convergent evolution.</p>`
    }
  };

  // --- modal ---
  let lastTrigger = null;

  const overlay = document.createElement('div');
  overlay.className = 'help-overlay';
  overlay.innerHTML = `
    <div class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="helpDialogTitle">
      <div class="help-dialog-head">
        <h2 id="helpDialogTitle"></h2>
        <button type="button" class="help-close" aria-label="Close help">&times;</button>
      </div>
      <div class="help-dialog-body"></div>
    </div>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay));

  const titleEl = () => overlay.querySelector('#helpDialogTitle');
  const bodyEl = () => overlay.querySelector('.help-dialog-body');
  const closeBtn = () => overlay.querySelector('.help-close');

  function openHelp(id, trigger) {
    const topic = HELP_TOPICS[id];
    if (!topic) return;
    lastTrigger = trigger || null;
    titleEl().textContent = topic.title;
    bodyEl().innerHTML = topic.body;
    overlay.classList.add('open');
    closeBtn().focus();
  }

  function closeHelp() {
    if (!overlay.classList.contains('open')) return;
    overlay.classList.remove('open');
    if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus();
    lastTrigger = null;
  }

  // Delegated so buttons rendered later work with no extra wiring.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.help-btn');
    if (btn) {
      e.preventDefault();
      openHelp(btn.dataset.help, btn);
      return;
    }
    if (e.target.closest('.help-close') || e.target === overlay) closeHelp();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHelp();
    // Keep tabbing inside the dialog while it's open.
    if (e.key === 'Tab' && overlay.classList.contains('open')) {
      const focusable = overlay.querySelectorAll('button, a[href]');
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Give every help button an accessible name from its topic title. Runs for
  // buttons present at load and for any added later by a room's render code.
  function labelButtons(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.help-btn:not([aria-label])').forEach(btn => {
      const topic = HELP_TOPICS[btn.dataset.help];
      btn.setAttribute('type', 'button');
      btn.setAttribute('aria-label', topic ? `Help: ${topic.title}` : 'Help');
      if (topic) btn.setAttribute('title', topic.title);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    labelButtons(document);
    new MutationObserver(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.classList && node.classList.contains('help-btn')) labelButtons(node.parentNode);
          else labelButtons(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
