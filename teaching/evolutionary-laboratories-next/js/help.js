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

    // ---------- Glossary ----------
    // The handful of words a first-time reader needs. Linked inline from the
    // first place each appears in a room, via <span class="gloss" data-help="…">,
    // and listed together on the README tab.

    glosChromosome: {
      title: 'Chromosome',
      body: `
        <p>A single long molecule of DNA, carrying many genes in a fixed order along its
        length. Think of it as a very long shelf; the genes are the books on it, each
        always in the same place.</p>
        <p>Most animals and plants are <strong>diploid</strong>: they carry two copies of
        every chromosome, one inherited from each parent. The two copies carry the same
        genes in the same order — but not necessarily the same versions of them.</p>
        <p>Because genes sit on shelves rather than floating free, genes that are close
        together tend to be inherited together. That is what the Linkage Room is about.</p>`
    },

    glosGene: {
      title: 'Gene',
      body: `
        <p>A stretch of DNA that does a job — typically the instructions for building one
        protein. A gene is the <em>unit</em>; where it sits on the chromosome is its
        <strong>locus</strong>, and the alternative versions it comes in are its
        <strong>alleles</strong>.</p>
        <p>These three words are easy to confuse, so it is worth fixing them now:</p>
        <ul>
          <li><strong>gene</strong> — the thing itself, e.g. the gene for eye colour.</li>
          <li><strong>locus</strong> — its address on the chromosome.</li>
          <li><strong>allele</strong> — one particular version of it.</li>
        </ul>
        <p>In these rooms we usually say <em>locus</em>, because what is being followed is a
        position that different alleles can occupy.</p>`
    },

    glosLocus: {
      title: 'Locus (plural: loci)',
      body: `
        <p>A <strong>position</strong> on a chromosome — the address of a gene, not the gene
        itself. Latin for "place"; the plural is <em>loci</em>.</p>
        <p>The distinction matters as soon as you start counting. A population does not have
        "more or fewer genes" at a locus; it has different <strong>alleles</strong> present at
        that one locus, in some proportion. So a locus can be <em>polymorphic</em> (more than
        one allele around) or <em>fixed</em> (only one left).</p>
        <p>Every room from Hardy–Weinberg onward follows one locus at a time, except the
        Linkage Room, which follows two at once and asks whether they are inherited
        independently.</p>`
    },

    glosAllele: {
      title: 'Allele',
      body: `
        <p>One of the alternative versions of a gene that can sit at a locus. If the locus is
        the address, the allele is who lives there.</p>
        <p>Throughout these rooms the two alleles at a locus are written <strong><var>A</var>₁</strong>
        and <strong><var>A</var>₂</strong>. A diploid individual carries two copies, so it is one of three
        <strong>genotypes</strong>: <var>A</var>₁<var>A</var>₁, <var>A</var>₁<var>A</var>₂ (the heterozygote) or <var>A</var>₂<var>A</var>₂.</p>
        <p>What the simulations actually track is the <strong>allele frequency</strong> —
        the proportion of all copies in the population that are <var>A</var>₁, written <var>p</var>. Almost
        everything else follows from it: the Hardy–Weinberg Room shows that under random
        mating <var>p</var> alone fixes all three genotype frequencies.</p>`
    },

    glosSelection: {
      title: 'Natural selection',
      body: `
        <p>Some alleles are more likely to be passed on to the next generation than others,
        because they affect the survival and reproductive success of the individuals carrying
        them. That difference is <strong>selection</strong>, and its strength is the
        <strong>selection coefficient <var>s</var></strong>.</p>
        <p>Selection is a <em>bias</em>, not a guarantee. In these rooms it reweights the odds
        before the next generation is drawn at random — so an advantageous allele is more
        likely to spread, never certain to. In a small population a genuinely better allele
        is lost by chance all the time.</p>
        <p>What matters is not <var>s</var> by itself but <strong><var>N</var>·<var>s</var></strong>, the product of population
        size and advantage. That is the quantity deciding whether selection or
        <strong>drift</strong> is in charge.</p>`
    },

    glosDrift: {
      title: 'Genetic drift',
      body: `
        <p>Change in allele frequency from one generation to the next caused purely by
        <strong>chance</strong> — by which individuals happen to reproduce, not by any of them
        being better.</p>
        <p>Every generation is a finite sample of the one before, and small samples are noisy.
        With <var>N</var> individuals, the frequency wobbles by about √(<var>p</var>(1−<var>p</var>)/<var>N</var>) each generation, so
        <strong>drift is strong in small populations and weak in large ones</strong>.</p>
        <p>Drift has no direction, but it has a destination: left alone it always ends with one
        allele <em>fixed</em> and the rest <em>lost</em>. It is therefore a destroyer of
        variation — which is why mutation, supplying new variants, matters so much.</p>`
    },

    glosMutation: {
      title: 'Mutation',
      body: `
        <p>A <strong>copying error</strong> in DNA — the only source of genuinely new
        <span class="gloss" data-help="glosAllele">alleles</span>. Per site per generation it is rare, on the order of
        10⁻⁸ in real genomes, but a genome is large and a population is many genomes.</p>
        <p>Everything the other rooms do is a sorting process. <span class="gloss" data-help="glosSelection">Selection</span>
        and <span class="gloss" data-help="glosDrift">drift</span> decide the fate of variants that already exist; only
        mutation can supply a new one.</p>
        <p><strong>It is random with respect to fitness.</strong> The chance that a particular mutation occurs does not
        depend on whether it would be useful — which is the whole point of the Mutation Room.</p>`
    },

    glosPopulation: {
      title: 'Population',
      body: `
        <p>A group of individuals that interbreed — and the level at which evolution actually happens. An individual does
        not evolve; its genotype is fixed at conception. What evolves is the <em>frequency</em> of each allele across the
        group.</p>
        <p><var>N</var> is the number of individuals, and it governs how strong <span class="gloss" data-help="glosDrift">drift</span>
        is: the sampling noise per generation goes as 1/<var>N</var>, so small populations wander and large ones barely
        move.</p>
        <p>It is also one of the two terms in <var>N</var>·<var>s</var> — population size times selective advantage —
        which is the quantity that decides whether selection or drift is in charge. Neither number settles that on its
        own.</p>
        <p><strong>Effective population size.</strong> The <var>N</var> in these rooms is an idealised one: every
        individual equally likely to be a parent, generations that do not overlap, mating at random. A real population
        of a thousand rarely drifts like an idealised thousand — unequal families, skewed sex ratios and past crashes
        all make it behave like a smaller one. That smaller equivalent is its <strong>effective population size</strong>,
        written <var>N</var><sub>e</sub>, and it is the number that actually governs drift. Wherever these rooms say
        <var>N</var>, read <var>N</var><sub>e</sub>.</p>`
    },

    glosGeneration: {
      title: 'Generation',
      body: `
        <p><strong>One complete round of reproduction</strong>: the population is replaced by a sample drawn from it.
        Every chart in these rooms has generations along the bottom.</p>
        <p>Evolutionary time is measured in generations, not years. Rates of drift and of substitution are per generation,
        which is why organisms with short generation times evolve faster in absolute time while obeying the same
        equations.</p>
        <p>As a rule of thumb, a neutral allele takes on the order of a few × <var>N</var> generations to fix or be
        lost.</p>`
    },

    glosNeutral: {
      title: 'Neutral',
      body: `
        <p>A variant is <strong>neutral</strong> when it has no effect on fitness: its selection coefficient
        <var>s</var> is 0, so <span class="gloss" data-help="glosSelection">selection</span> is blind to it and its fate is
        settled by <span class="gloss" data-help="glosDrift">drift</span> alone.</p>
        <p>A neutral allele's chance of eventually fixing is simply its current frequency — a new one, present as a single
        copy, has probability 1/2<var>N</var>.</p>
        <p>In the Adaptation Room the <strong>Neutral</strong> lineages are the control: whatever a Habitat lineage does
        beyond them is what selection contributed on top of drift.</p>`
    },

    glosHabitat: {
      title: 'Habitat',
      body: `
        <p>The environment an organism lives in, and everything in it that bears on survival and reproduction.</p>
        <p>The habitat is what gives a variant its sign. A long tail may be advantageous in a fast stream and
        disadvantageous in a still pond, so the same mutation can carry <var>s</var> &gt; 0 in one place and
        <var>s</var> &lt; 0 in another.</p>
        <p>No allele is beneficial in the abstract; fitness is always fitness <em>in a place</em>. That is why two
        unrelated lineages in the same habitat converge, and why the Adaptation Room assigns habitats at all.</p>`
    },

    glosGamete: {
      title: 'Gamete',
      body: `
        <p>A reproductive cell — an egg or a sperm — carrying <strong>one</strong> copy of each
        <span class="gloss" data-help="glosChromosome">chromosome</span> instead of the usual two.</p>
        <p>Meiosis halves the count, so that when two gametes meet the offspring is back to two copies: one from each
        parent. Which of a parent's two copies goes into any given gamete is decided at random, and
        <span class="gloss" data-help="glosRecombination">recombination</span> shuffles the two together first.</p>
        <p>Gametes are the unit these rooms actually sample. A diploid population of <var>N</var> individuals holds
        2<var>N</var> gene copies, and a generation is built by drawing 2<var>N</var> gametes from that pool.</p>`
    },

    glosGenotype: {
      title: 'Genotype',
      body: `
        <p>The pair of <span class="gloss" data-help="glosAllele">alleles</span> an individual carries at a
        <span class="gloss" data-help="glosLocus">locus</span>. With two alleles there are three genotypes:
        <var>A</var>₁<var>A</var>₁ and <var>A</var>₂<var>A</var>₂, the <em>homozygotes</em>, and
        <var>A</var>₁<var>A</var>₂, the <em>heterozygote</em>.</p>
        <p>Genotype is what an individual <em>is</em>; allele frequency is what the
        <span class="gloss" data-help="glosPopulation">population</span> is. The Hardy–Weinberg Room is about the link
        between the two: under random mating the allele frequency fixes all three genotype frequencies, which is why the
        simulations can track alleles and read the genotypes off.</p>
        <p>It matters because selection acts on individuals, and so on genotypes — which is what makes dominance
        meaningful.</p>`
    },

    glosFitness: {
      title: 'Fitness',
      body: `
        <p>How well a variant does at getting itself into the next generation, counting both survival and
        reproduction. It is <em>relative</em>: what matters is how a variant compares with the alternatives, not any
        absolute number.</p>
        <p>Here <var>A</var>₁ is given fitness 1 + <var>s</var> against <var>A</var>₂'s 1, so <var>s</var> is the
        <em>advantage</em>. At <var>s</var> = 0 the two are equally fit — the variant is
        <span class="gloss" data-help="glosNeutral">neutral</span>.</p>
        <p>Fitness is not a property of an allele on its own but of an allele <em>in a place</em>: the same variant can
        have <var>s</var> &gt; 0 in one <span class="gloss" data-help="glosHabitat">habitat</span> and <var>s</var> &lt; 0
        in another. And a fitness advantage is never a guarantee — with a small <var>N</var>·<var>s</var>,
        <span class="gloss" data-help="glosDrift">drift</span> loses good alleles routinely.</p>`
    },

    glosSpeciation: {
      title: 'Speciation',
      body: `
        <p>The process by which one interbreeding <span class="gloss" data-help="glosPopulation">population</span>
        becomes two that no longer exchange genes — permanently, even if they meet again.</p>
        <p>What makes it permanent is <strong>reproductive isolation</strong>, and it comes in two
        kinds. <strong>Pre-zygotic</strong> barriers act before a zygote is ever made: the two forms
        breed at different times, in different places, or simply do not recognise each other as
        possible mates. <strong>Post-zygotic</strong> barriers act afterwards: hybrids form but are
        inviable or sterile, because alleles that each worked perfectly well in their own
        population do not work together in the same individual.</p>
        <p>Neither kind is <em>selected for</em>. Both are side effects of two isolated populations
        going their own way — which is exactly what the Speciation Room runs.</p>`
    },

    // ---------- Tier 1: core parameters ----------

    popN: {
      title: 'Population size (<var>N</var>)',
      body: `
        <p><strong><var>N</var> is the number of individuals</strong> in the population. Under
        <em>haploid</em> settings that means <var>N</var> gene copies; under <em>diploid</em>
        settings each individual carries two, so the pool sampled each generation
        is 2<var>N</var> gene copies.</p>
        <p><var>N</var> controls <strong>how strong random drift is</strong>. Each generation is a
        random sample of the previous one, and small samples are noisy: the
        variance in allele frequency per generation is <code><var>p</var>(1−<var>p</var>)/<var>N</var></code>
        (haploid) or <code><var>p</var>(1−<var>p</var>)/2<var>N</var></code> (diploid).</p>
        <p><strong>Try this:</strong> run the same starting frequency at <var>N</var>=10 and at
        <var>N</var>=200. The small population lurches around and fixes quickly; the large
        one barely moves. Nothing changed but sample size.</p>`
    },

    freqF: {
      title: 'Initial frequency (<var>p</var>)',
      body: `
        <p><strong><var>p</var> is the starting proportion of allele <var>A</var>₁</strong> in the population,
        from 0 (absent) to 1 (already fixed). <var>p</var> = 0.5 means an even split between
        <var>A</var>₁ and <var>A</var>₂.</p>
        <p>The starting population is built to hit <var>p</var> as closely as rounding allows,
        then shuffled — so the actual starting value may differ very slightly from
        the slider, and the readout shows the true value.</p>
        <p><strong>Why it matters:</strong> with pure drift, an allele's probability of
        eventually fixing is simply its current frequency. An allele at <var>p</var> = 0.1 has
        a 10% chance of taking over the population and a 90% chance of being lost.</p>`
    },

    genG: {
      title: 'Generations (<var>G</var>)',
      body: `
        <p><strong>How many generations the simulation runs.</strong> Each generation is
        one complete round of reproduction — the whole population is replaced by a
        new sample drawn from it.</p>
        <p>A run stops early if the allele <em>fixes</em> (reaches <var>p</var> = 1) or is
        <em>lost</em> (<var>p</var> = 0), because from that point nothing can change: with no
        variation left, there is nothing for drift or selection to act on.</p>
        <p><strong>Rule of thumb:</strong> under pure drift, a neutral allele takes on the
        order of a few × <var>N</var> generations to fix or be lost. If your runs keep ending
        while still polymorphic, raise <var>G</var> or lower <var>N</var>.</p>`
    },

    ploidy: {
      title: 'Ploidy (haploid vs diploid)',
      body: `
        <p><strong>Haploid:</strong> each individual carries one gene copy (<var>A</var>₁ or <var>A</var>₂). <var>N</var>
        individuals = <var>N</var> gene copies.</p>
        <p><strong>Diploid:</strong> each individual carries two copies, so there are three
        genotypes — <var>A</var>₁<var>A</var>₁, <var>A</var>₁<var>A</var>₂ (heterozygote), <var>A</var>₂<var>A</var>₂ — and <var>N</var> individuals = 2<var>N</var> gene copies.
        Copies are paired at random each generation, giving Hardy–Weinberg genotype
        proportions <var>p</var>², 2<var>pq</var>, <var>q</var>² — the <strong>Hardy–Weinberg Room</strong>, in Part IV,
        explains why that lets us sample alleles and simply read off the genotypes.
        The haploid setting needs none of that, which is why it is the default here:
        take the diploid option once you have been through that room.</p>
        <p>This is not just bookkeeping. Doubling the gene pool <strong>halves the drift
        variance</strong>, so diploid populations wander more slowly and take longer to
        fix. And in the Selection Room, fitness now belongs to <em>genotypes</em>
        rather than lone alleles, which is what makes dominance (<var>h</var>) meaningful.</p>`
    },

    mutSize: {
      title: 'Mutation size',
      body: `
        <p><strong>How much each copy can differ from its parent.</strong> Every time a
        shape is copied, each of its numeric traits is nudged by a random amount;
        this slider sets the typical size of that nudge.</p>
        <p>Crucially, the nudges are <strong>unbiased</strong> — equally likely to go up or
        down, with no target. Nothing here is steering the shape anywhere.</p>
        <p>The slider is a <em>relative</em> dial, not an absolute step size. Because the
        Branching Room runs over far more generations, it applies a gentler nudge per
        copy at the same setting — otherwise its shapes would become unrecognizable
        almost at once — so the same number can mean a slightly different jump from one
        room to another.</p>
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
        the next generation, before it is drawn. If the pool is <code><var>n</var></code> gene
        copies and each is drawn as <var>A</var>₁ with probability <code><var>p</var></code>, the number of
        <var>A</var>₁ copies follows a binomial distribution.</p>
        <p><strong class="k-expected">E[<var>k</var>]</strong> is the expected count (n·<var>p</var>) — the single most likely
        outcome, highlighted in dark blue. <strong class="k-observed">O[<var>k</var>]</strong> is the count actually
        drawn, highlighted in gold.</p>
        <p><strong>The key insight:</strong> <span class="k-observed">O[<var>k</var>]</span> usually lands <em>near</em> <span class="k-expected">E[<var>k</var>]</span> but rarely
        exactly on it, and that gap is drift. Notice the distribution gets relatively
        narrower as <var>N</var> grows — larger populations deviate proportionally less.</p>`
    },

    binomVar: {
      title: 'Binomial variance panel',
      body: `
        <p>Plots <strong><var>V</var> = <var>p</var>(1−<var>p</var>)/<var>N</var></strong> — how much the allele frequency is expected
        to jump in a single generation, purely from sampling noise. (Diploid uses 2<var>N</var>,
        since the gene pool is twice as large.)</p>
        <p>Two things follow from the formula. <strong>Variance is largest at <var>p</var> = 0.5</strong>
        and shrinks toward 0 as the allele approaches fixation or loss — drift is
        fastest when both alleles are common. And <strong>variance shrinks as <var>N</var> grows</strong>,
        which is why big populations drift slowly.</p>
        <p>This curve is the engine behind everything you see on the frequency chart.</p>`
    },

    selS: {
      title: 'Selection coefficient (<var>s</var>)',
      body: `
        <p><strong><var>s</var> is allele <var>A</var>₁'s fitness advantage.</strong> <var>A</var>₁ carriers have relative
        fitness 1+<var>s</var> against 1 for <var>A</var>₂. At <var>s</var> = 0.10, <var>A</var>₁ is 10% more likely to be
        reproduced; at <var>s</var> = 0, the room behaves exactly like the Drift Room.</p>
        <p>Each generation the raw frequency <var>p</var> is reweighted by fitness into
        <strong><var>p′</var></strong>, and it is <var>p′</var> — not <var>p</var> — that the wheel spins on and the
        binomial samples from. Selection biases the sampling; drift still does the
        drawing.</p>
        <p><strong>What matters is <var>N</var>·<var>s</var>, not <var>s</var> alone.</strong> When <var>N</var>·<var>s</var> is large, selection is
        <em>more effective relative to drift</em>: it is in charge of the trajectory, and the
        deterministic dashed line is a good guide to where the allele is going. When <var>N</var>·<var>s</var> is
        small, drift can overwhelm a genuine advantage and lose it — advantageous alleles are lost
        all the time in small populations.</p>
        <p><strong>"In charge" is not the same as "certain".</strong> Whether <var>A</var>₁ actually fixes also
        depends on where it starts and on how dominant it is. This room opens it at
        <var>f</var> = 0.50, which is a comfortable place to start; drop the initial frequency to a few
        per cent, or make the allele recessive with <var>h</var> = 0, and the same <var>N</var>·<var>s</var> will lose it
        often. A new mutation is the extreme case — a single copy, and usually lost whatever its
        advantage, which is what the Fate Room is about.</p>`
    },

    domH: {
      title: 'Dominance (<var>h</var>)',
      body: `
        <p>In diploids, fitness belongs to genotypes. <strong><var>h</var> sets the heterozygote's
        fitness</strong>: <var>A</var>₁<var>A</var>₁ = 1+<var>s</var>, <var>A</var>₁<var>A</var>₂ = 1+<var>h</var>·<var>s</var>, <var>A</var>₂<var>A</var>₂ = 1.</p>
        <ul>
          <li><strong><var>h</var> = 1</strong> — <var>A</var>₁ fully dominant; one copy gives the full advantage.</li>
          <li><strong><var>h</var> = 0.5</strong> — additive; the heterozygote is exactly intermediate.</li>
          <li><strong><var>h</var> = 0</strong> — <var>A</var>₁ fully recessive; only <var>A</var>₁<var>A</var>₁ benefits.</li>
        </ul>
        <p><strong>The recessive trap:</strong> a rare allele sits almost entirely inside
        heterozygotes. If it is recessive, selection barely "sees" it while it is
        rare, so it can be lost to drift almost as easily as a neutral allele — even
        with a real fitness advantage. Try <var>s</var> = 0.2 with <var>h</var> = 0 versus <var>h</var> = 1.</p>`
    },

    traitS: {
      title: 'Selection coefficient per trait',
      body: `
        <p>Sets <strong>how strongly each trait is selected</strong>. This slider gives the
        <em>magnitude</em> only — the habitat decides the <em>direction</em>.</p>
        <p>When a new variant appears, it is compared against the current form: if it
        moves the trait toward what the habitat favours it gets +<var>s</var>, if it moves away
        it gets −<var>s</var>. Traits the habitat has no preference about get 0 and simply
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
        traits are under selection in this habitat and
        <span style="background:rgba(168,52,42,0.15);padding:0 4px;">red</span> traits are not
        (they only drift). The two solid rows underneath are the same two colours at
        full strength: <strong>Tot. sel.</strong> and <strong>Tot. neu.</strong>.</p>
        <p>The two totals are counted change by change rather than row by row, so they
        normally match the red and blue rows above but need not do so exactly: a
        mutation at a selected trait can occasionally land on a derived value that
        makes no difference at all to the fit (<var>s</var> = 0), and that one change
        is counted as neutral even though its row is blue.</p>
        <p><strong>What to compare:</strong> new variants arise in a Neutral and a Habitat
        lineage at much the same rate — mutation does not care about habitat. The
        difference shows up in <em>Subs.</em>: selection converts far more of those
        mutations into fixed changes. (A selected variant is resolved quickly — fixed
        or lost — which can free its locus to mutate again a little sooner, so the
        <em>Mut.</em> columns need not match exactly; it is the <em>Subs.</em> gap that
        tells the story.)</p>
        <p>The same story is inside a single Habitat table: read across
        <strong>Tot. sel.</strong> and then across <strong>Tot. neu.</strong>. Neutral
        changes lose most of their mutations on the way to <em>Subs.</em>, because only
        drift is carrying them; selected ones keep a far larger share.</p>`
    },

    // ---------- Tier 2: reading the panels ----------

    wheel: {
      title: 'Sampling wheel',
      body: `
        <p>The wheel makes one draw concrete. Its blue slice is the current frequency
        of <var>A</var>₁, the red slice is <var>A</var>₂, and one spin picks <strong>one gene copy</strong> for the
        next generation.</p>
        <p>A whole generation means spinning it once per gene copy in the pool, always
        <em>with replacement</em> — the wheel never changes during a generation, so any
        allele can be drawn many times or not at all.</p>
        <p>The first three generations are spun one at a time so you can watch the
        sampling happen; after that the same draws are computed instantly.</p>`
    },

    wheelSelection: {
      title: 'Sampling wheel and <var>p′</var>',
      body: `
        <p>The wheel works as in the Drift Room — one spin draws one gene copy — but
        here it does <strong>not</strong> spin on the raw frequency <var>p</var>.</p>
        <p>Fitness reweights <var>p</var> into <strong><var>p′</var></strong> first:
        <code><var>p′</var> = <var>p</var>(1+<var>s</var>) / (<var>p</var>(1+<var>s</var>) + (1−<var>p</var>))</code>. The wheel spins on <var>p′</var>, and the
        binomial panel draws from <var>p′</var>. This is the whole mechanism of selection —
        it <em>tilts the odds</em>, then ordinary random sampling does the rest.</p>
        <p>The <strong>gold band</strong> on the rim shows how far selection moved the split
        from where drift alone would have left it, and the <strong>Δ<var>p</var></strong> readout gives
        that shift as a number. Notice Δ<var>p</var> is largest at intermediate frequencies and
        vanishes as the allele nears fixation.</p>`
    },

    popGrid: {
      title: 'Current population',
      body: `
        <p>Every dot is one individual in the present generation. Under haploid
        settings, <span style="color:#2E5C8A;">blue</span> = allele <var>A</var>₁ and
        <span style="color:#A8442A;">red</span> = allele <var>A</var>₂.</p>
        <p>Under diploid settings each dot is one individual, drawn as a circle split
        into two halves — one per gamete. Two <var>A</var>₁ gametes make a solid
        <span style="color:#2E5C8A;">blue</span> disc (<var>A</var>₁<var>A</var>₁), two <var>A</var>₂ a solid
        <span style="color:#A8442A;">red</span> disc (<var>A</var>₂<var>A</var>₂), and one of each a blue/red
        split (the heterozygote <var>A</var>₁<var>A</var>₂).</p>
        <p>During the first three generations the grid fills in one gamete at a time as
        the wheel spins — each individual's first half, then its second — so you watch
        whole individuals being assembled from random gametes.</p>`
    },

    freqChart: {
      title: 'Allele frequency chart',
      body: `
        <p>Tracks the frequency of allele <var>A</var>₁ over time. The <strong>solid black line</strong>
        is the actual, realized trajectory; the stacked blue/red bars behind it show
        the <var>A</var>₁/<var>A</var>₂ split of the population at each generation.</p>
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
        <p>Raise <var>N</var> and the two lines converge, because sampling noise shrinks. Lower <var>N</var>
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
        <p>The summary reports how many fixed <var>A</var>₁, how many fixed <var>A</var>₂, and how many were
        still polymorphic at the end, with average fixation times. <strong>Try it with a
        real advantage (<var>s</var> &gt; 0) at small <var>N</var></strong> and count how often the "better"
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
        central difficulty of real phylogenetics: similarity is not ancestry.</p>
        <p>In the Adaptation Room the true tree has a real shape to recover: the three
        founders are themselves the tips of a short phylogeny, with two of them closer
        relatives than the third, plus an <strong>outgroup</strong> that branched off
        before any of them. The outgroup is the deepest split, so getting it right is
        the easiest test the reconstruction has to pass — and habitat selection, which
        pushes unrelated lineages toward the same look, is what can make it fail.</p>`
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
        for a while and then split. The five coloured lineages (C, <var>D</var>, <var>G</var>, H, I) are the
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
    },

    // ---------- The Speciation Room ----------

    specStandingVar: {
      title: 'Standing variation',
      body: `
        <p><strong>Standing variation</strong> is the variation a population already carries, as
        opposed to variation it has yet to receive by mutation. Here it is not stipulated: it is
        drawn from the frequency distribution a population at <strong>mutation–drift
        equilibrium</strong> actually has.</p>
        <p>For a two-allele locus with symmetric mutation, Wright showed that distribution to be
        <code>Beta(θ, θ)</code>. Frequencies are then rounded to a whole number of copies out of
        2<var>N</var>, because a frequency below half a copy is not one the population can hold. Two
        things follow, and both are what real data looks like:</p>
        <ul>
          <li><strong>Most loci are monomorphic.</strong> The ancestral card reports how many are
          not — typically around half at the default settings, and fewer still at a lower
          <var>μ</var>.</li>
          <li><strong>The polymorphic ones are mostly rare.</strong> The density piles up against
          both edges, so a variant sitting at 50% is unusual and one sitting at 2% is not.</li>
        </ul>
        <p>Neither number is set by hand: heterozygosity and the polymorphic count are
        <em>results</em>, and they follow from <strong>θ</strong>, which is its own control. See
        <strong>Ancestral diversity</strong> for why it is not simply 4<var>N</var><var>μ</var>.</p>
        <p>What makes it the raw material of divergence is that it is <em>shared</em>. At the instant
        of the split the two daughter populations hold the same alleles at the same frequencies, so
        nothing that follows is a difference in raw material. Divergence is <strong>the same variation
        being sorted two different ways</strong>.</p>
        <p>It is also the <em>fast</em> material. A standing variant is already present in many copies
        and can fix in dozens of generations; a new mutation starts at one copy in 2<var>N</var> and
        will almost always be lost. But most standing variation is rare too — which is why adaptation
        from it is far less certain than it sounds, and why the runs differ so much from one another.</p>`
    },

    specFixedDiff: {
      title: 'Fixed differences',
      body: `
        <p>A locus is a <strong>fixed difference</strong> when one population has gone entirely to
        one allele and the other entirely to the other — <var>p</var> = 1 here and <var>p</var> = 0
        there. Nothing less counts: a locus where the two merely differ <em>in frequency</em> is
        not a fixed difference, because either population could still go the other way.</p>
        <p>They are counted because they are the currency of <strong>post-zygotic</strong> isolation.
        Each allele was tested by selection only against the other alleles in its own population;
        it has never been tested alongside what the other population fixed. Put the two genomes
        together in a hybrid and some of those untested combinations do not work. That is the
        <strong>Dobzhansky–Muller</strong> model, and the more fixed differences there are, the more
        chances there are for one of those combinations to be lethal.</p>
        <p>Fixed differences are also what a systematist actually counts when asking whether two
        populations are distinct — which is why the same number does double duty here as both
        the mechanism and the measure.</p>
        <p><strong>Watch where they come from.</strong> The chart plots the total in black, in gold
        the part contributed by the 13 loci that affect morphology, and in grey the part contributed
        by the 40 that adapt physiology. Both lower lines respond to the habitat — around 8 of the 13
        become fixed differences in the stream against about 5 between two lakes, and about 28 of the
        40 against about 22 — but together they stay far below the black one, which sits around 150
        either way. Most fixed differences are at loci nothing here selects on, so the genome-wide
        count is driven mainly by population size and elapsed time rather than by where anyone is
        living. That is the ordinary situation: what makes two genomes different is mostly neither
        what makes the two animals look different nor what adapted them.</p>
        <p><strong>The count dips as well as climbs</strong>, and at this mutation rate it does so
        often. That is not a difference being undone: it is a locus that had already settled
        differently receiving a <em>new</em> mutation, so that for a while it is polymorphic again and
        no longer "fixed" on that side. When the sweep resolves the difference is back, and as often
        as not larger — the allele that fixed is a third one, further from its counterpart than the
        allele it replaced. It also means a threshold met at one generation can be unmet at the next,
        which is why the panel says so when that happens.</p>`
    },

    specAncestor: {
      title: 'A fish already adapted to its lake',
      body: `
        <p>The population the room opens on has been in this lake for a thousand generations, so it
        is not a generic fish — it is a <strong>lake</strong> fish. Deep-bodied, amber, big-eyed,
        long-finned: everything the lake favours, it already has. Only the tail is unshaped, because
        the lake has no preference about tails.</p>
        <p>It is not, however, the <em>most</em> lake-like fish the model can draw. The lake's
        preferences on body shape, eye and fins have no optimum in them — they simply say rounder,
        bigger, longer — so a walk left to run unchecked ends up jammed against the limits of the
        drawing parameters and stays there. Those limits are a property of the drawing, not a
        statement about fish, and a population sitting on them has nowhere left to go. The walk is
        therefore held back from the extremes, which leaves both populations room to move.</p>
        <p>What those thousand generations fix is the population's <strong>mean</strong>, not any one
        individual. The two are not the same thing, and the difference is the whole reason an adapted
        population can still be variable: the mean sits on the mark, and the standing variation is
        spread around it.</p>
        <p>That is why starting here changes what you see. An adapted population is not sitting on a
        store of improvements waiting to be made — most of what its habitat asks of it, it has already
        done. So population A, staying behind, <strong>keeps drifting in the same direction it was
        already going</strong>, a little rounder and a little more amber, while population B either
        does the same thing independently or is pulled the other way. Watch what that means when both
        are in lakes: they are under <em>identical</em> selection, moving the same way, and still
        diverging — because they are doing it with different mutations.</p>
        <p>The variation is not useless, though. In the lake most of it is neutral or slightly
        harmful, but in a <em>different</em> habitat some of those very same variants are suddenly the
        useful ones — which is how a population can adapt to a new place in a few dozen generations,
        long before mutation could supply anything new.</p>
        <p>Press <em>New Ancestral Population</em> and you get another lake fish: recognisably the
        same kind of animal, carrying a different set of variants.</p>`
    },

    specTheta: {
      title: 'Ancestral diversity (<var>θ</var>)',
      body: `
        <p>How much variation the ancestral population carries. Frequencies at all 1,013 loci are drawn
        from <code>Beta(θ, θ)</code>, the distribution a population at mutation–drift equilibrium
        actually sits at, so θ decides how many loci come out polymorphic and how heterozygous the
        population is. The ancestral card reports both.</p>
        <p>Low θ is what real marker data looks like: at 0.16 roughly two loci in three are
        monomorphic on any given draw, and the ones that vary mostly carry a <em>rare</em> second
        allele. Push θ up and the ancestor becomes implausibly variable — every locus segregating at
        middling frequency, which no real population does.</p>
        <p><strong>Why this is not simply 4<var>N</var><var>μ</var>.</strong> It would be, if the
        ancestral population had always been the size you set for the run. But θ describes its
        <em>history</em> — 4<var>N</var><sub>e</sub><var>μ</var> over however long it sat in that
        lake — and that <var>N</var><sub>e</sub> has no reason to match the <var>N</var> and
        <var>N</var>₂ the two daughters get for the few hundred generations ahead.</p>
        <p>Keeping them separate is what lets the room show both sources of divergence at once.
        Tied together they forced a choice: a believable ancestor meant a mutation rate so low that
        nothing new ever arose during a run, and a mutation rate high enough to matter meant an
        ancestor polymorphic at every locus. Now you can have a realistic starting population
        <em>and</em> watch new mutations fix.</p>`
    },

    specLoci: {
      title: 'The 1,013 loci',
      body: `
        <p>The fish is built by <strong>13 loci</strong>. Of the <strong>1,000 more</strong> that
        build no part of it, <strong>40</strong> still do something the two habitats care about, and
        <strong>960</strong> do not.</p>
        <p>The 13 are shared out among the five traits — shape 3, colour 4, eye size 1, fin size 2,
        tail size 3 — roughly one locus per drawing parameter that trait owns, with a fourth for
        colour because body hue does double duty as the mating signal and has to be able to move. The assignment is fixed: it
        is the same in every run, so a comparison between runs is a comparison of the same
        architecture. Each locus carries an <strong>effect</strong>, drawn once when the ancestral
        population is created, that its <var>A</var>₁ allele adds to the trait. Effects are
        <em>additive</em>: two copies shift the trait twice as far as one, so a population's mean
        fish is the ancestral fish plus each effect weighted by how common its allele is.</p>
        <p>The <strong>40 physiological loci</strong> are the ones that change nothing you can see.
        They set what the animal's body has to <em>do</em> to live where it lives: take up oxygen,
        hold its salt balance, pay the metabolic bill for swimming. Still water and fast water make
        different demands of all three, so these loci are under selection exactly as the trait loci
        are — an allele well suited to a lake is the wrong allele in a stream, and the same allele in
        two lakes is favoured in both.</p>
        <p>They carry no effect vector, because there is nothing to draw. What an allele carries
        instead is a position on a single <strong>axis of physiological demand</strong>, with the
        ancestral allele at its origin, still water at one end and fast water at the other. An allele
        is favoured when it brings the locus <em>closer</em> to what the habitat needs — a target
        rather than a direction, which is the honest shape for a physiological demand: there is a
        right amount of gill surface, and more is not better past it. One consequence is worth
        watching for: adaptation at these loci <em>finishes</em>. Once a population is sitting on the
        optimum, further mutations there are deleterious and are purged, and the locus goes quiet.</p>
        <p>Forty is 4% of the non-morphological genome. That is a deliberately modest reading of how
        much of a real genome is under selection, and it is held low on purpose — every locus added
        there is one more that a stream sorts and two lakes do not, so a larger fraction would make
        the stream speciate in nearly every run and leave nothing to find out.</p>
        <p>The remaining <strong>960 loci</strong> are inherited, and drift, fix and are lost exactly
        like the other two kinds — they simply do nothing either habitat has a use for. They are not
        inert: in a real animal loci like these are doing plenty. It is only that this simulation
        models what the two habitats prefer, and they have no preference here. So nothing selects on
        them, and they are left entirely to drift.</p>
        <p>They are in the model because in a real genome they are the overwhelming majority, and
        because they turn out to be where most of the fixed differences in this room end up.</p>`
    },

    specHabitats: {
      title: 'Lake and stream',
      body: `
        <p>The ancestral population lives in a <strong>lake</strong>, and population A never leaves
        it — A is the population that stayed. Population B <strong>moves away either way</strong>: to
        <strong>another lake</strong>, which is a different body of water but the same kind of place,
        or to a <strong>stream</strong>, which is not.</p>
        <p>That distinction matters. The two populations are separated geographically in both cases,
        so drift acts on them independently either way. What changes is only whether the two
        environments <em>disagree</em> about what a good fish is.</p>
        <p>The two habitats want different fish, exactly as in the Adaptation Room:</p>
        <ul>
          <li><strong>Lake</strong> — still, open water: a deep body, amber colour, big eyes, long
          fins. No preference about the tail.</li>
          <li><strong>Stream</strong> — fast, shallow water: a slender body, blue colour, short
          fins, a long tail. No preference about the eye. (This is the same Stream as the
          Adaptation Room's.)</li>
        </ul>
        <p>An allele is favoured wherever the fish carrying it is closer to what that habitat wants.
        Nothing pushes the two populations apart <em>by construction</em> — they come apart only
        because the two habitats disagree. Each trait in the strip below is tagged with what is
        happening to it: <strong>divergent</strong> (the habitats disagree), <strong>parallel</strong>
        (they agree, or both populations are in the same place), or selected in only one of the two.</p>
        <p><strong>Try this:</strong> send B to another lake. Now every morphological locus is under
        <em>identical</em> selection on both sides, both populations tend to fix the same allele, and
        selection is actively producing <em>fewer</em> fixed differences than drift alone would have.
        Selection separates populations only when it points in different directions.</p>`
    },

    specThresholds: {
      title: 'Two ways to become two species',
      body: `
        <p>The room applies two independent tests, and <strong>either one is enough</strong>.</p>
        <ul>
          <li><strong>Post-zygotic</strong> — at least <var>X</var> fixed differences have accumulated,
          so hybrids no longer work.</li>
          <li><strong>Pre-zygotic</strong> — the trait used to choose a mate has diverged by more than
          <var>Y</var>, so the two forms no longer breed with each other in the first place.</li>
        </ul>
        <p>Both thresholds are stipulations, not results: real isolation builds up gradually and
        nobody crosses a line. What the sliders let you ask is <em>how demanding</em> a definition
        of "species" you want to apply, and how much longer a stricter one takes to satisfy.</p>`
    },

    specX: {
      title: 'The threshold <var>X</var>',
      body: `
        <p>How many <strong>fixed differences</strong> the two populations must accumulate before the
        room calls them reproductively incompatible.</p>
        <p>It stands for the number of Dobzhansky–Muller incompatibilities needed to break a hybrid.
        A low <var>X</var> is a permissive species concept — a little divergence and they are already
        two. A high <var>X</var> is a demanding one, and takes far longer to reach.</p>
        <p><strong>There is a ceiling, and it is far below 1,013.</strong> A locus can only become
        a fixed difference if it was polymorphic to begin with, and at mutation–drift equilibrium most
        are not. Worse, a fixed difference needs the two populations to fix <em>opposite</em> alleles,
        which happens with probability 2<var>p</var>(1−<var>p</var>) — so what the standing variation
        alone can deliver is the number of loci times the ancestral heterozygosity, around 120 at the
        default settings. The chart's axis is scaled to what a run actually reaches rather than to
        1,013. Raise <var>θ</var> and the ceiling rises with it, because the ancestral population then
        carries more variation to sort; raise <var>μ</var> and the count climbs past it, because loci
        that had settled start supplying differences of their own — which is most of what the 53
        selected loci contribute, since a useful mutation there fixes often enough to matter, and each
        population fixes its own.</p>
        <p><strong>Watch what limits the pace:</strong> a fixed difference needs <em>both</em>
        populations to have fixed, so the large one is the bottleneck however fast the small one
        settles — which is why speciation by this route is slow in big populations. Once the standing
        variation is exhausted the count creeps on only as fast as new mutations fix.</p>`
    },

    specMating: {
      title: 'A trait used to choose a mate',
      body: `
        <p>Some traits are not just morphology — they are the signal by which individuals recognise
        an acceptable mate. Body colour is the textbook case: in Lake Victoria cichlids and in
        sticklebacks, males differ in nuptial colour and females prefer their own.</p>
        <p>When this is switched on, divergence in <strong>body hue</strong> alone can isolate the two
        populations, with no genome-wide divergence at all. That is why it is so much faster than
        the fixed-difference route: it needs <em>one</em> trait to move far enough, not forty loci
        to sort.</p>
        <p>Switch it off and body colour becomes ordinary morphology, mattering to survival but not
        to who mates with whom — and the only remaining road to speciation is the slow one.</p>`
    },

    specY: {
      title: 'The threshold <var>Y</var>',
      body: `
        <p>How far the two populations' <strong>mean body hue</strong> must diverge, in degrees around
        the colour wheel, before they stop recognising each other as mates. 0° is identical; 180° is
        opposite colours.</p>
        <p><strong>Only four loci build colour</strong>, so how far hue <em>can</em> move is decided
        by which colour alleles the ancestral population happens to be carrying. Some runs have
        the raw material for a large shift and some do not — which is a real constraint on magic
        traits, not an artefact: a trait can only become a signal of difference if the variation to
        move it is there in the first place. Press <em>New Ancestral Population</em> a few times and
        watch how much this varies.</p>
        <p>Colour drifts apart on its own, so a small <var>Y</var> will be crossed sooner or later in
        almost any run. Put <var>Y</var> high and hue divergence usually needs the two populations to
        be in <em>different</em> habitats — the lake favours amber, the stream favours blue. That is
        the interesting case: the same trait doing two jobs at once, adapting the fish to its
        surroundings and, as a side effect, deciding who it will breed with. A trait like that is
        sometimes called a <strong>magic trait</strong>, and it is the shortest known road to
        speciation.</p>`
    },

    specN: {
      title: 'Ancestral size and population A',
      body: `
        <p><var>N</var> is the size of the ancestral population, and population A keeps it: A is
        the lineage that stayed put. Its loci therefore fix slowly — a neutral locus takes on the
        order of 4<var>N</var> generations.</p>
        <p>Because a fixed difference requires both sides to have fixed, <strong><var>N</var> sets the
        pace of the whole room</strong>. If a run keeps ending with almost no fixed differences,
        either lower <var>N</var> or raise <var>G</var>.</p>
        <p>Moving this slider builds a new ancestral population rather than merely resizing the old
        one, because the frequencies it carries are whole numbers of copies out of 2<var>N</var>. How
        <em>much</em> variation it carries is set separately, by <strong>θ</strong>.</p>`
    },

    specN2: {
      title: 'Population B (<var>N</var>₂)',
      body: `
        <p><var>N</var>₂ is how many individuals founded the second population. Set it small and you
        have the classic <strong>founder event</strong>: a handful of fish reach a new lake and start
        a population there.</p>
        <p>Two things follow immediately. Its allele frequencies are a noisy sample of the
        ancestral ones, so it is <em>already</em> slightly different on the day it is founded. And
        <span class="gloss" data-help="glosDrift">drift</span> is strong in it, so it fixes its loci
        quickly — and then runs out of variation, after which the only thing that can happen there
        is a new mutation.</p>
        <p><strong>Try this:</strong> at <var>N</var>₂ = 5 watch its heterozygosity collapse in the
        first few dozen generations, then watch the fixed-difference count stall anyway — because
        population A has not caught up. After that B contributes only what mutation gives it, one
        allele at a time.</p>`
    },

    specS: {
      title: 'Selection strength (<var>s</var>)',
      body: `
        <p>One coefficient, shared by every locus any habitat has an opinion about. An allele
        carries the advantage <var>s</var> in a population whose habitat prefers the fish it makes,
        and the matching disadvantage in one that does not.</p>
        <p><strong>The beneficial allele is dominant</strong>, whichever of the two it happens to be:
        a heterozygote is as fit as the better homozygote. That is not a detail. A new mutation
        spends its whole early life in heterozygotes, and a recessive one is invisible to selection
        there — drift would take almost all of them before selection ever saw them. Making the good
        copy dominant exposes it from the very first individual, which roughly doubles its chance of
        fixing and is the difference between new mutations contributing to adaptation in this room
        and not.</p>
        <p>Only the <em>sign</em> of a locus's effect on its trait is used, not the size — so a locus
        with a tiny effect is pushed just as hard as one with a large effect. This is a
        simplification, and it is the same one the Adaptation Room makes.</p>
        <p>At <var>s</var> = 0 the habitats stop mattering and the whole room is pure drift. The 100
        non-morphological loci are at <var>s</var> = 0 whatever this slider says — not because they do
        nothing, but because what they do is outside what this room models.</p>`
    },

    specMutation: {
      title: 'Alleles and mutation',
      body: `
        <p>Every locus has an open-ended series of alleles, but carries <strong>at most two at a
        time</strong> in any one population: a resident, and possibly one new variant sweeping
        through it. A locus that has gone monomorphic — no variation left — can receive a
        <strong>mutation</strong>, which creates a <strong>genuinely new allele</strong>, one that has
        never existed before. It starts at a single copy in 2<var>N</var> and runs its own
        Wright–Fisher trajectory; if it fixes it becomes the new resident, and the locus is ready to
        mutate again.</p>
        <p>Two things follow, and they are the reason the model is built this way.</p>
        <ul>
          <li><strong>There is no back mutation.</strong> A new allele is never a return to one that
          has been seen before, so no locus can flicker between two states. A morphological allele's
          effect is its parent's plus a fresh random step — the trait wanders, it does not oscillate.</li>
          <li><strong>Mutations are local.</strong> An allele arising in population A can never
          appear in population B. So anything that fixes after the split is a difference between the
          two <em>permanently</em>, and mutation only ever adds to their divergence.</li>
        </ul>
        <p><strong>Two simplifications, and neither is a claim about real genomes.</strong> A real
        locus can carry many alleles at once, and mutation can strike one that is still polymorphic.
        Holding it to two at a time, and letting mutation fire only at a settled locus, is what keeps
        the strip below readable as two rows of cells.</p>
        <p>This rate governs only what arrives <em>during</em> the run. How much variation the
        ancestral population starts with is set separately, by <strong>θ</strong> — see
        <strong>Ancestral diversity</strong>. Keeping them apart is what lets the room hold a
        realistic ancestor while still supplying new mutations fast enough to watch.</p>
        <p>It is set far higher than any real locus's rate, deliberately: <var>N</var> here is a few
        hundred rather than a few hundred thousand, and a few hundred generations rather than a few
        hundred thousand. What that buys is the <em>mechanism</em> made visible on a timescale you can
        sit through. At the default, population B fixes around twenty alleles that did not exist at
        the split; at <var>μ</var> = 0 the room runs on standing variation alone, and every curve
        goes flat once that has been sorted.</p>`
    },

    specEffect: {
      title: 'Effect size per locus',
      body: `
        <p>How much one allele substitution moves the trait, as a fraction of that drawing
        parameter's full range. Each of the 13 morphological loci gets its own effect, drawn at
        random when the ancestral population is created — some large, some near zero, some in each
        direction. With only one to three loci per trait, each one has to carry a good deal for the
        fish to change visibly, which is why this sits higher here than in the Adaptation Room.</p>
        <p>It governs how <em>visible</em> a given amount of genetic divergence is. A large effect
        size makes the two fish look strikingly different after only a few fixations; a small one
        means the same 20 fixed differences barely change the picture. The genetics is identical
        either way — which is itself the point: how different two populations <em>look</em> is a poor
        guide to how far apart they have actually gone.</p>
        <p>Changing it builds a new ancestral population, since the effects are drawn once at setup.</p>`
    },

    specStrip: {
      title: 'The 1,013 loci, side by side',
      body: `
        <p>One column per locus; the upper row is population A, the one below it population B. The
        shading is <strong>how far that locus has moved from the ancestral allele</strong> — palest
        while the whole population still carries it, darkest when none of it does, and in between
        while the two are still segregating. A population that has left the ancestral allele behind
        can never get it back, so a cell only ever darkens: a later mutation does not reset it.</p>
        <p>On the left, the 13 loci that build the traits, grouped by trait and tagged with how the
        two habitats treat them — <strong>divergent</strong>, <strong>parallel</strong>, or selected in
        only one of the two. Next to them, a narrow barcode of the 40 <strong>physiological</strong>
        loci, which change nothing you can see but are under selection all the same, and carry a tag
        of their own. The wide barcode is the remaining 960, which neither habitat has any use for.
        The proportion between the selected loci and the rest is roughly the proportion in a real
        genome, and it is the first thing to take from this panel — though the two selected blocks
        are drawn far wider than their share, or there would be nothing in them to watch.</p>
        <p>Three things are worth watching as a run proceeds. Cells start mid-grey — that is the
        shared standing variation — and drift to one extreme or the other. <strong>The small
        population's row settles first.</strong> And a <strong>fixed difference</strong> appears wherever
        one row has gone fully pale and the other fully dark; the red marks underneath count them.</p>
        <p>Shade alone does not settle it: two cells can both be dark and still hold
        <em>different</em> alleles, which is exactly what a fixed difference is. The red marks
        underneath are the authority. A locus that fixed the <em>same</em> way on both sides is
        sorted but contributes nothing to isolation — and under parallel selection that is the
        <em>likely</em> outcome, which is why two populations in the same kind of habitat diverge
        more slowly at those loci than drift alone would manage.</p>`
    },

    specSubstitutions: {
      title: 'Mutations and substitutions',
      body: `
        <p>Two numbers for each kind of locus, in each population: how many <strong>new alleles
        arose</strong> there after the split, and how many of those went all the way to
        <strong>fixation</strong>. A mutation that fixes is a <strong>substitution</strong> — it has
        stopped being one fish's oddity and become what the population <em>is</em>.</p>
        <p>Only alleles that did not exist at the split are counted. A standing variant fixing is the
        ancestral population's variation being sorted, not something this run produced, and folding
        the two together would make the quotient of the two columns mean nothing.</p>
        <p><strong>Read the first column across, and then the last one.</strong> Mutations arrive in
        very nearly the ratio 13 : 40 : 960 — the ratio of the locus counts, and nothing else.
        Mutation is blind: it does not arrive more often where it would be useful, and no setting in
        this room can make it. What differs is the <em>fate</em> of a mutation once it has arrived.
        At a neutral locus a new allele has one chance in 2<var>N</var> of ever fixing, and most of
        that small chance is not even realised inside <var>G</var> generations, because a neutral
        allele that does fix takes about 4<var>N</var> generations to do it. At a locus selection can
        see, a useful allele is dominant from its first heterozygote and climbs. The last row is the
        two rates divided: at the default settings a useful mutation fixes tens to hundreds of times
        more often than a neutral one.</p>
        <p><strong>Compare the two populations while you are here.</strong> Population B is the small
        one, and it fixes far more of everything — neutral alleles included, since the neutral
        fixation probability is 1/2<var>N</var> and its 4<var>N</var> waiting time is short enough to
        finish inside the run. Drift is not weaker in a small population; it is stronger, and it
        carries neutral alleles to fixation that a large population would have lost.</p>
        <p><strong>Read the last row across several runs, not one.</strong> Population A fixes only a
        handful of neutral alleles in a default run — sometimes none at all — so a ratio computed
        against that handful swings wildly from run to run, and the panel shows a dash when there is
        nothing to divide by. The columns it is built from are steady; the quotient of two small
        numbers is not.</p>
        <p>This is the same lesson the Adaptation Room's trait tables carry, counted genome-wide:
        selection does not change how many mutations appear, only how many of them get anywhere.</p>`
    },

    specIndividuals: {
      title: 'The individuals and the mean',
      body: `
        <p>The large fish is the population's <strong>mean phenotype</strong>: the ancestral fish plus
        each locus's effect weighted by how common its allele is. No individual need actually look
        like it.</p>
        <p>The six small fish are real draws from the population — two alleles per locus, sampled at
        that locus's frequency. Early on they differ visibly from each other, because the population
        is polymorphic. As loci fix, they converge on the mean and on each other, which is what
        losing variation looks like from the outside.</p>`
    },

    specCharts: {
      title: 'The two criteria over time',
      body: `
        <p>The left chart counts <strong>fixed differences</strong> — in black the total over all 1,013
        loci, in gold the part contributed by the 13 that affect morphology, and in grey the part
        contributed by the 40 that adapt physiology. The right one measures
        divergence in <strong>body hue</strong>, the mating signal. The dashed red line in each is the
        threshold you set, and the vertical gold line marks the generation currently being shown.</p>
        <p>The curves have quite different shapes. Fixed differences climb in steps, one locus at a
        time, steeply while the shared standing variation is being sorted and then far more slowly,
        at the pace new mutations fix. Hue divergence moves continuously and can wander back down,
        until population B is in the stream, at which point it climbs and stays.</p>
        <p><strong>Compare the black line with the two beneath it.</strong> The gap is everything
        selection is not doing: whichever habitat B lives in, the total is set by drift at the 960
        loci nobody is selecting. And compare the grey line with the gold: three times as many loci
        adapt the fish's physiology as adapt its shape, they sort faster than the neutral ones do,
        and not one of them shows up in the drawing.</p>
        <p>When the hue criterion is switched off its threshold is still drawn, faintly, so you can
        see the barrier that would have been crossed.</p>`
    },

    specDivMatrix: {
      title: 'Divergence in shape',
      body: `
        <p>The normalised distance between the populations' mean fish — the same measure the
        Branching and Adaptation rooms use, so the numbers mean the same thing there and here.
        0.000 is identical.</p>
        <p>Read it against the fixed-difference count, because the two disagree badly and by
        construction. Only 13 of the 1,013 loci change how a fish looks — not even all the loci under
        selection, since the 40 physiological ones adapt the animal without touching its outline — so
        two populations can be far past the incompatibility threshold, and thoroughly adapted to
        different water, and still be near-identical to the eye; or look strikingly different on the
        strength of a handful of large-effect loci that isolate nothing.
        <strong>Appearance is evidence about divergence, not a measure of it</strong> — which is the
        same warning the Branching Room's tanglegram gives.</p>`
    },

    adaptPresets: {
      title: 'The preset tasks',
      body: `
        <p>This room has eighteen controls, and three of the questions it is built to answer need
        several of them moved at once. Each button sets every control it needs — not just the ones it
        changes, so the same button always sets up the same experiment — and then runs.</p>
        <ul>
          <li><strong>Same habitat, different founders.</strong> All three founders into the Stream.
          They start out as three different fish, so anything the three <em>Habitat</em> lineages come
          to share at the end was put there by selection. Compare how alike they finish against the
          three <em>Neutral</em> lineages, which had nothing pulling them anywhere. That is
          <strong>convergent evolution</strong>, and the tanglegram shows the trouble it causes: fish
          that look alike need not be relatives.</li>
          <li><strong>Turn selection off.</strong> Every selection coefficient to 0. This is not the
          same comparison as the Neutral lineage that is always on screen — it asks a sharper
          question. A Habitat lineage told to prefer nothing <em>is</em> a Neutral lineage, so the two
          divergence figures for each founder should now agree. Whatever gap you still see is the
          size of the difference one run of drift can produce on its own, which is the number worth
          holding in mind when you turn selection back on.</li>
          <li><strong>Small vs large population.</strong> One habitat for all three, and
          <var>N</var> = 10, 50 and 200 — and, uniquely among the tasks, <strong>three identical
          founders</strong> rather than the usual three related ones, so that population size really is
          the only thing that differs. The small population fixes mutations fastest and sorts them
          worst: at <var>N</var> = 10 a good mutation and a bad one have nearly the same fate, so its
          lineage wanders. The large one is slower and truer. This is <var>N</var>·<var>s</var> from the
          Selection Room, seen on a whole animal.
          <br>The exception has a cost worth knowing about: with the founders identical there is no
          branching order among them for the tanglegram to recover, so in this task that panel can only
          be asked whether it pairs each Neutral lineage with its own Habitat twin. Any other preset,
          or <em>Restore defaults</em>, brings the related founders back; <em>New Founders</em> keeps
          whichever kind is in force and simply draws three more.</li>
        </ul>
        <p><strong>Restore defaults</strong> puts every control back where the room opens, and is the
        way out of the second task — five selection coefficients are tedious to drag back by hand. It
        leaves the run on screen alone.</p>
        <p>The presets do not draw new founders. Press <em>New Founders</em> for that, and run a task
        again on a different set of three: whether a lineage can respond at all depends partly on
        which fish it started as.</p>`
    },

    mutRate: {
      title: 'The mutation rate',
      body: `
        <p>A mutation is a copying error: a character changes from its <strong>ancestral</strong>
        state to a new <strong>derived</strong> one. Per site, per generation, this is rare —
        in real genomes on the order of <code>10⁻⁸</code>, roughly one new error per hundred
        million bases copied.</p>
        <p>This room is not about <em>how often</em> a mutation happens. It assumes one has
        already occurred in each of four characters and asks a different question: given that a
        mutation occurs, <strong>which</strong> derived state does it produce, and with what
        probability?</p>`
    },

    mutWheel: {
      title: 'A character’s mutation wheel',
      body: `
        <p>Each wheel belongs to one character. Every slice is a possible <strong>derived
        state</strong>, and the slice's size is the probability that, when this character
        mutates, it lands on that state.</p>
        <p>The slices are deliberately <strong>unequal</strong>: some derived states are far more
        mutationally accessible than others (a small size change is a more likely error than a
        large one, for instance). So "random mutation" does <em>not</em> mean every outcome is
        equally likely.</p>
        <p>What it <strong>does</strong> mean is that a slice's size depends only on the mechanics
        of the copying error — never on whether the resulting fish would do well. That is the
        sense in which mutation is <em>random with respect to fitness</em>.</p>`
    },

    mutDrift: {
      title: 'The fate of four new alleles',
      body: `
        <p>Producing a mutation is only the first step. Each of the four traits is its own
        <strong>independent locus</strong>, so a spin creates <strong>four derived alleles</strong> — the
        panel plots all four at once, one coloured line per trait. Each enters a population of
        <strong><var>N</var></strong> individuals as a <strong>single copy</strong>, starting at frequency
        <code>1/<var>N</var></code>.</p>
        <p>Every run tracks at least <strong><var>G</var> = 2.5·<var>N</var></strong> generations. If a trait is still
        segregating (neither fixed nor lost) once that point is reached, its line simply keeps
        going — the run automatically extends until every allele has settled one way or the other.
        The four lines always share one axis, so a trait that settles quickly just flatlines while
        the others keep moving; the axis label shows the real length of that run, which can be
        longer than 2.5·<var>N</var>.</p>
        <p>With natural selection <em>off</em>, every line is pure <strong>drift</strong> — the
        Wright–Fisher sampling of the Drift Room, no fitness weighting — so each wanders by chance
        and usually drifts to loss (fixation probability <code>1/<var>N</var></code>). With selection
        <em>on</em>, each line is first reweighted by its allele's fitness before sampling: a
        habitat-favoured allele (<strong>★</strong>) is pushed up, any other is pushed down.</p>
        <p>Try small versus large <var>N</var>, and selection on versus off. The last panel builds the
        population's typical fish once every trait has settled — locus by locus, it wears each
        derived state only where that allele reached the majority.</p>`
    },

    mutSelection: {
      title: 'Selection: fate, not origin',
      body: `
        <p>The stream favours a slender body, blue colour, a long tail and short fins. Those
        favoured states are marked <strong>★</strong>. A single <strong>selection coefficient <var>s</var></strong>
        (as in the Selection Room), shared by all four characters, sets the magnitude; the habitat
        sets the sign — favoured is advantageous, anything else deleterious.</p>
        <p>Raising <var>s</var> does <strong>two</strong> things — and one non-thing. It bends the trajectories
        in the <em>Derived alleles</em> panel (favoured alleles climb, the rest fall), and it decides
        which fish survive. What it can <strong>never</strong> do is resize a wheel slice: the ★ slices
        stay exactly as big as they were.</p>
        <p>That is the whole point. Mutation proposes — blindly, with fixed odds — and selection
        disposes, acting only on the variants that already exist. Selection shapes a mutation's
        <em>fate</em>, never its <em>origin</em>.</p>`
    },

    // ---------- The Fate Room ----------

    fatePopSize: {
      title: 'Population size (<var>N</var>) in this room',
      body: `
        <p>Everywhere else <var>N</var> is a dial for how strong drift is. Here it does something
        more specific, because a new mutation always starts in <strong>exactly one
        individual</strong>: <var>N</var> sets the frequency the mutation begins at, which is
        <code>1/<var>N</var></code>.</p>
        <p>And that same number is the mutation's chance of ever taking over. A neutral
        mutation is fixed with probability <code>1/<var>N</var></code> — no calculation needed to
        see why: every one of the <var>N</var> gene copies present today is equally likely to
        be the one whose descendants eventually replace all the others, and the mutant
        is one of them.</p>
        <p><strong>Try this:</strong> run the room at <var>N</var>=12 and then at <var>N</var>=50, and watch
        the tally above the populations. Bigger populations do not protect a new
        mutation — they bury it. What large <var>N</var> does protect is a mutation that has
        already become common, which is what the Drift Room shows.</p>`
    },

    fateOdds: {
      title: 'Why two populations are misleading',
      body: `
        <p>Showing one population where the mutation is lost next to one where it survives
        is useful — the same mutation, the same rules, opposite endings — but taken at
        face value it suggests the two outcomes are equally likely. They are not, and
        the gap is enormous.</p>
        <p>So the room does not simply run two populations. It runs a whole batch of them
        independently, reports the real tally, and only then pulls one loser and one
        winner out of that batch to display. The winner shown is genuine — a real run of
        the model, not a scripted path — but it is a <em>rare</em> one, and the panel says
        by how much.</p>
        <p>Roughly <code>1/<var>N</var></code> of the batch will have survived. The rest went extinct,
        most of them within a generation or two. That is the normal fate of a mutation,
        and it is the reason evolution needs mutation to keep happening rather than to
        happen once.</p>`
    },

    // ---------- The Reproduction Room ----------

    twofold: {
      title: 'The two-fold cost of sex',
      body: `
        <p>Watch the two panels and the gap is not subtle: after three rounds of reproduction
        the asexual side holds <strong>16</strong> individuals and the sexual side <strong>2</strong>.
        The reason is simple arithmetic. Every asexual individual reproduces on its own, so the
        population doubles. It takes <em>two</em> sexual individuals to produce the same two
        offspring, so the population merely replaces itself.</p>
        <p>Put per individual: a sexual parent leaves <strong>half</strong> the descendants an asexual
        one does, every generation. Halving compounds — 2×, 4×, 8× — which is why the gap widens
        so fast on screen.</p>
        <p>In species with separate sexes the cost has a sharper name: <strong>the cost of males</strong>.
        An asexual female produces only daughters, all of whom bear young. A sexual female spends
        half her reproductive output on sons, who bear none. John Maynard Smith made this the central
        puzzle of the field in 1978: sex is so expensive that its persistence demands an explanation
        — which is what the right-hand panel's growing variety is meant to supply.</p>`
    },

    glosRecombination: {
      title: 'Recombination (crossover)',
      body: `
        <p>When a cell makes gametes by <strong>meiosis</strong>, the two copies of each chromosome
        pair up and physically swap matching pieces. The copy that ends up in the gamete is therefore
        a <strong>mosaic</strong> of both — part grandmother's chromosome, part grandfather's. On screen,
        that is the point where a half changes shade partway down.</p>
        <p>Recombination is what makes sex more than just averaging two parents. Without it, whole
        chromosomes would be passed on intact and the number of possible offspring genotypes would be
        small. With it, the number of distinct combinations is effectively unlimited — each gamete is a
        new cut-and-paste of the two copies.</p>
        <p>It also does something no amount of mutation can: it <strong>separates alleles that happen to
        sit near each other</strong>. A useful allele stuck beside a harmful one can be freed from it, and
        useful alleles that arose in two different individuals can be brought into the same genome.
        Cloning can never do either — an asexual lineage inherits its combinations exactly as they are,
        which is why the left-hand halves stay solid.</p>
        <p>How often that swap happens between two particular loci is the <strong>recombination rate <var>r</var></strong>,
        and it is the slider the Linkage Room is built around.</p>`
    },

    ratchet: {
      title: "Muller's ratchet",
      body: `
        <p>Harmful mutations keep arriving, in every lineage, unavoidably. The question is whether a
        lineage can ever get rid of them.</p>
        <p>In an asexual line, every offspring inherits <strong>all</strong> of its parent's mutations plus
        whatever is new. Suppose the least-mutated individuals — those carrying, say, zero harmful
        mutations — happen to leave no offspring one generation, through simple bad luck. That class is
        then gone <em>forever</em>: no one left can produce a descendant with fewer mutations than they
        themselves carry. The ratchet has clicked one notch, and it cannot turn back.</p>
        <p>Sex undoes exactly this. Two parents each carrying different mutations can, by recombination,
        produce an offspring carrying <strong>neither</strong> — the clean genome is reassembled from parts.
        Hermann Muller pointed this out in 1964; the effect bites hardest in small populations and at high
        mutation rates, and it is one of the leading explanations for why asexual lineages, though they
        arise often, rarely persist for long on an evolutionary timescale.</p>`
    },

    genotypes: {
      title: 'Distinct genotypes',
      body: `
        <p>The population count tells you how many <em>bodies</em> there are. This number tells you how many
        genetically <strong>different</strong> ones — individuals with identical chromosomes count once.</p>
        <p>It is the interesting figure of the two, because <strong>selection can only act on differences</strong>.
        Sixteen identical individuals give natural selection exactly as much to work with as one: whatever
        kills one of them kills all of them. Two different individuals give it a choice.</p>
        <p>Run all four generations and compare. The asexual panel ends with 16 individuals sharing just
        2 genotypes — the two founders, copied. The sexual panel ends with 2 individuals and 2 genotypes,
        but both are new combinations that did not exist in the founders and will not exist again. That
        contrast, not the population size, is what sex is buying.</p>`
    },

    homologues: {
      title: 'Two copies of each chromosome (homologues)',
      body: `
        <p>Most animals and plants are <strong>diploid</strong>: they carry two copies of every chromosome,
        one inherited from each parent. The two copies are called <strong>homologues</strong>. They carry the
        same loci in the same order, but not necessarily the same <em>versions</em> of those loci (alleles).</p>
        <p>Here, each individual is drawn as a single circle split down the middle: the left half is one
        homologue, the right half the other.</p>
        <p>This is what makes the phrase "each parent contributes half" precise. A gamete receives
        <strong>exactly one copy of every gene</strong> — one homologue of each chromosome, not a random half
        of the genes. Fertilization restores the pair, one homologue from each parent. So an offspring has a
        complete set of genes; what it does <em>not</em> have is both of either parent's versions.</p>`
    },

    sibMating: {
      title: 'Why the sexual pair are siblings',
      body: `
        <p>The two panels start from the same two founders so the comparison is fair. But that leaves the
        sexual side with a population of exactly two — so from Generation 2 onward, the only mating available
        is between <strong>siblings</strong>.</p>
        <p>This is the most inbred a sexual population can possibly be. Full sibs share, on average, half their
        genome, so their offspring have fewer genuinely new combinations available than offspring of unrelated
        parents would, and stretches of chromosome become identical (homozygous) faster.</p>
        <p>Which means the demo is <strong>conservative</strong>: it shows the least variety sex can generate.
        A real sexual population of a few hundred individuals, mating more or less at random, produces far more
        distinct combinations per generation than you see here — while paying exactly the same two-fold cost.</p>`
    },

    redQueen: {
      title: 'Why variety pays in a changing world',
      body: `
        <p>A well-adapted clone is only well adapted to <em>today</em>. Change the world and the same genotype,
        copied a million times, is uniformly wrong. Variety is not useful in itself — it is a stock of
        alternatives held against a future that cannot be predicted.</p>
        <p>The most relentless source of change is not climate but <strong>other living things</strong>, above all
        parasites and pathogens. They evolve fast and they specialise on whatever host genotype is most common;
        being common is therefore dangerous, and being rare is an advantage. Sex constantly produces rare new
        combinations, so hosts can keep changing the lock while parasites keep picking it.</p>
        <p>This is the <strong>Red Queen hypothesis</strong>, after the character in Lewis Carroll who must keep
        running to stay in the same place: no lasting gain in fitness, just the cost of not falling behind. It is
        currently the strongest explanation we have for why sex is so widespread despite being so expensive.</p>`
    },

    facultative: {
      title: 'Species that do both',
      body: `
        <p>Sex and cloning are not a permanent choice for every species. Many organisms switch between them
        depending on conditions, which is the closest thing to a natural experiment on this whole question.</p>
        <ul>
          <li><strong>Aphids</strong> reproduce asexually all summer — females bearing live, pregnant daughters,
          numbers exploding on a plant that suits them — then produce males and mate in autumn.</li>
          <li><strong>Water fleas (<em>Daphnia</em>)</strong> do the same in a pond, and turn to sex when it gets
          crowded, cold, or the water starts drying up. The sexual eggs are tough resting eggs that survive the winter.</li>
          <li><strong>Rotifers, many fungi, and a great many plants</strong> follow the same pattern of clonal
          growth in good times and sex when conditions deteriorate.</li>
        </ul>
        <p>Notice how neatly this matches the trade-off in the two panels: <strong>numbers</strong> while the
        environment is stable and generous, <strong>variety</strong> exactly when it stops being either.</p>`
    },

    // ---------- The Linkage Room ----------

    ldWhat: {
      title: 'Following two loci at once',
      body: `
        <p>Everything up to here has watched <strong>one</strong> locus. Real genomes carry thousands, sitting in a
        row along the chromosomes, and they are not inherited independently just because we would like them to be.</p>
        <p>Two loci are said to be in <strong>linkage equilibrium</strong> when knowing which allele an individual
        carries at the first tells you nothing about the second. Any departure from that is <strong>linkage
        disequilibrium</strong>, and it is measured by <var>D</var>.</p>
        <p>The contrast with the room next door is the point of this one. A single locus reaches Hardy–Weinberg in
        <strong>one</strong> generation of random mating, exactly. A <em>pair</em> of loci only ever approaches its
        equilibrium, one geometric step per generation, and the closer together the two loci sit, the longer the
        journey takes. "Traits are inherited independently" is not an assumption you get for free — it is a result,
        and it comes with a rate.</p>`
    },

    ldRate: {
      title: 'The recombination rate r',
      body: `
        <p><strong><var>r</var> is the chance that a crossover falls between your two loci</strong> during one meiosis — the
        very event drawn partway down each half-circle in the Reproduction Room. It is the probability that a gamete
        comes out <em>recombinant</em>, carrying a combination its parent did not have.</p>
        <p><var>r</var> runs from 0 to 0.5, and the two ends mean quite different things:</p>
        <ul>
          <li><strong><var>r</var> = 0.5</strong> — the two loci are on <em>different chromosomes</em>, or so far apart on the
          same one that a crossover between them is a coin flip. This is Mendel's independent assortment.</li>
          <li><strong>small <var>r</var></strong> — the loci are <em>close neighbours</em>. They are usually passed on as a
          block, and any association between them lasts a very long time.</li>
          <li><strong><var>r</var> = 0</strong> — no recombination ever. The two loci are effectively one. An asexual lineage
          is in this state across its whole genome, permanently.</li>
        </ul>
        <p><var>r</var> is not distance in DNA letters, but it grows with it, which is why it can be used to <em>map</em> genes:
        the further apart two loci are, the more often they are separated.</p>`
    },

    ldD: {
      title: 'Linkage disequilibrium D',
      body: `
        <p>With two loci there are four kinds of gamete: <var>A</var>₁<var>B</var>₁, <var>A</var>₁<var>B</var>₂, <var>A</var>₂<var>B</var>₁ and <var>A</var>₂<var>B</var>₂. If the two loci were independent, each
        frequency would be the simple product of its two allele frequencies — f(<var>A</var>₁<var>B</var>₁) would be f(<var>A</var>₁)·f(<var>B</var>₁). <var>D</var> is the
        amount by which reality departs from that:</p>
        <p><code><var>D</var> = <var>f</var>(<var>A</var>₁<var>B</var>₁)·<var>f</var>(<var>A</var>₂<var>B</var>₂) − <var>f</var>(<var>A</var>₁<var>B</var>₂)·<var>f</var>(<var>A</var>₂<var>B</var>₁)</code></p>
        <p><strong><var>D</var> = 0</strong> means independent. <strong><var>D</var> &gt; 0</strong> means <var>A</var>₁ tends to travel with <var>B</var>₁ (they are
        in <em>coupling</em>). <strong><var>D</var> &lt; 0</strong> means <var>A</var>₁ tends to travel with <var>B</var>₂ (<em>repulsion</em>). The slider
        sets <var>D</var> as a fraction of the largest value the allele frequencies physically allow.</p>
        <p>Where does disequilibrium come from in the first place? A new mutation is one answer — it arises on one
        particular chromosome, so it starts life perfectly associated with everything around it. Migration between
        populations with different allele frequencies is another, and so is selection favouring one combination.</p>`
    },

    ldAlleleFreq: {
      title: 'Allele frequency at both loci',
      body: `
        <p>For simplicity this panel gives both loci the same allele frequency <var>p</var>, so the square stays easy to read.</p>
        <p>Move it toward either extreme and watch the <strong><var>D</var></strong> chip: the association you can build gets
        weaker and weaker, even with the starting slider still at 1. That is not a bug. <var>D</var> is a covariance between two
        yes/no variables, so it is boxed in by their frequencies — a very rare allele simply cannot be strongly
        associated with anything, because there are not enough copies of it to go round.</p>
        <p>That awkwardness is why population geneticists rarely quote raw <var>D</var>. They use <strong><var>D</var>′</strong>, which
        divides <var>D</var> by the largest value the allele frequencies allow, and <strong><var>r</var>²</strong>, which is the squared
        correlation between the two loci. Both are 0 at independence and 1 at complete association, whatever the
        allele frequencies happen to be.</p>`
    },

    ldSquare: {
      title: 'The gamete square',
      body: `
        <p>A unit square holding all four gamete types by area. The <strong>horizontal cut</strong> is the allele
        frequency at the first locus: everything above it carries <var>A</var>₁, everything below carries <var>A</var>₂. Inside each band, a
        <strong>vertical cut</strong> separates the gametes that also carry <var>B</var>₁ from those that carry <var>B</var>₂.</p>
        <p>Now the trick. If the two loci were independent, the same fraction of <var>A</var>₁ gametes and of <var>A</var>₂ gametes would
        carry <var>B</var>₁ — so both vertical cuts would land in the same place and the line would run straight down. The
        <strong>step between the two cuts is the disequilibrium</strong>. The dashed line marks where independence
        would put them both.</p>
        <p>Step the generations forward and watch the step close. Neither the horizontal cut nor the dashed line
        moves: recombination shuffles alleles between chromosomes without creating or destroying any of them, so the
        allele frequencies are untouched. Only the associations dissolve.</p>`
    },

    ldDecay: {
      title: 'Why it takes so long',
      body: `
        <p>Each generation, recombination breaks up a fraction <var>r</var> of the associations and leaves the rest. So the
        disequilibrium is multiplied by (1 − <var>r</var>) every generation:</p>
        <p><code><var>D</var>(<var>t</var>) = <var>D</var>₀ (1 − <var>r</var>)^<var>t</var></code></p>
        <p>Geometric decay never quite reaches zero, and its speed is set entirely by <var>r</var>. At <var>r</var> = 0.5 the association
        halves every generation and is essentially gone in ten. At <var>r</var> = 0.005 — two loci sitting close together — it
        takes about <strong>138</strong> generations just to lose <em>half</em> of it, and thousands to disappear.</p>
        <p>The dashed vertical line marks the first generation, because that is the whole of the Hardy–Weinberg
        story: one round of random mating and a single locus is at its equilibrium, permanently. Put two loci side by
        side and one generation buys you a fraction <var>r</var> of the way there.</p>
        <p>This is why linkage disequilibrium is so useful in practice. Because it decays at a known rate, the
        associations still standing in a population today are a record of how long ago something happened — which is
        how geneticists date selective sweeps, detect recent admixture, and locate disease genes by the stretch of
        chromosome still travelling with them.</p>`
    },

    ldN: {
      title: 'Population size <var>N</var> in Part 2',
      body: `
        <p>Part 1 assumed an infinitely large population, so its curves are exact. Part 2 is a real, finite one of <var>N</var>
        individuals, and everything the Drift Room taught applies again — only now to two loci at once.</p>
        <p><var>N</var> matters here in two opposite ways, which is worth pulling apart.</p>
        <p><strong>Small <var>N</var> means more drift</strong>, so a beneficial mutation is more easily lost by chance — the
        Drift and Selection Rooms' lesson, unchanged.</p>
        <p>But small <var>N</var> <em>also</em> means fewer chromosomes, and therefore fewer recombination events in absolute
        terms. The number of <var>A</var>₁<var>B</var>₁ chromosomes built per generation is roughly 2<var>N</var> · <var>r</var> · |<var>D</var>|, so halving the population
        halves the supply of the very chromosome that resolves the conflict. <strong>Interference is worse in small
        populations</strong>, not just drift. Run the replicates at <var>N</var> = 50 and again at <var>N</var> = 500 with everything else
        held fixed, and watch the gap between the two sets of bars close.</p>
        <p>That is the same reasoning applied to whole genomes: selection is least effective where the product of
        population size and recombination rate is smallest.</p>`
    },

    ldS: {
      title: 'The advantage <var>s</var> of each mutation',
      body: `
        <p>Both mutations carry the same advantage <var>s</var>, and their effects multiply: a chromosome carrying <strong>both</strong>
        has fitness (1 + <var>s</var>)², one carrying a single mutation has (1 + <var>s</var>), and the original <var>A</var>₂<var>B</var>₂ chromosome has 1.</p>
        <p>So <var>A</var>₁<var>B</var>₁ is the best chromosome available — and to begin with it does not exist. It can only be assembled by a
        recombination event between an <var>A</var>₁<var>B</var>₂ gamete and an <var>A</var>₂<var>B</var>₁ gamete.</p>
        <p>Raising <var>s</var> sharpens the conflict rather than resolving it. Stronger selection makes each mutation sweep
        faster, which gives recombination <em>less</em> time to build the double mutant before one of the two single
        mutants has driven the other out. Interference is at its worst when selection is strong and recombination is
        weak.</p>`
    },

    ldF0: {
      title: 'Where each mutation starts',
      body: `
        <p>Both mutations start at this frequency, on <strong>opposite</strong> backgrounds — some chromosomes carry <var>A</var>₁<var>B</var>₂,
        an equal number carry <var>A</var>₂<var>B</var>₁, and the rest are still <var>A</var>₂<var>B</var>₂. No chromosome carries both.</p>
        <p>Why not start each from a single copy, as a real mutation does? Because at that point the dominant fact is
        plain bad luck: a new beneficial allele survives with probability roughly 2<var>s</var>, so with <var>s</var> = 0.1 about four out of
        five are lost no matter what the recombination rate is. That is a real and important effect — it is the Selection
        Room's lesson — but it swamps the one this panel is about. Starting the two mutations at a frequency where they
        have already <em>established</em> isolates the interference between them.</p>
        <p>Slide it down toward its minimum to see the two effects combine: loss by drift <em>plus</em> interference,
        which is what actually happens in nature.</p>`
    },

    ldReplicates: {
      title: 'Why run many populations',
      body: `
        <p>A single population tells you what happened once, not what tends to happen — the same warning the Drift
        Room's <em>Run 10 Simulations</em> button makes. Whether both mutations survive is a matter of chance, so the
        question only has an answer as a <strong>proportion over many independent runs</strong>.</p>
        <p>Each replicate starts from the identical situation — a population of <var>A</var>₂<var>B</var>₂, one new <var>A</var>₁<var>B</var>₂, one new <var>A</var>₂<var>B</var>₁ — and is
        run until both loci have settled. The bars report what fraction ended each way.</p>
        <p>More replicates give a steadier estimate and take longer. Two hundred is enough to see the effect clearly;
        differences of a few percent between two settings are noise, not signal.</p>`
    },

    ldTrajectory: {
      title: 'Reading one population',
      body: `
        <p>The four lines are the frequencies of the four gamete types. Watch the <strong>gold <var>A</var>₁<var>B</var>₁ line</strong>: it
        starts at zero, because no chromosome carries both mutations yet, and it can only lift off once recombination
        has put one together.</p>
        <p>With a decent recombination rate, you see <var>A</var>₁<var>B</var>₁ appear, then climb past both single mutants and take over —
        the population keeps both improvements. With <var>r</var> near zero, <var>A</var>₁<var>B</var>₁ never gets going: the blue and green lines race
        each other, one wins, and the other is driven to zero <em>even though it was beneficial</em>.</p>
        <p>Run it several times at the same settings. The outcome changes from run to run, which is exactly why the
        panel beside it counts up hundreds of populations instead of trusting one.</p>`
    },

    ldOutcome: {
      title: 'How often both mutations survive',
      body: `
        <p>Each replicate ends one of three ways: the population keeps <strong>both</strong> mutations, keeps
        <strong>one</strong>, or loses both. The left group uses the recombination rate you set in Part 1; the right
        group repeats the identical experiment with the two loci on different chromosomes (<var>r</var> = 0.5).</p>
        <p>The difference between the two "both kept" bars is <strong>Hill–Robertson interference</strong>, measured.
        It is the cost, in adaptations lost, of the two loci being linked.</p>
        <p>Notice also how large the "both lost" bar is even at <var>r</var> = 0.5. Beneficial mutations are lost by chance all
        the time; linkage adds a second way to lose them on top of that.</p>`
    },

    hillRobertson: {
      title: 'Hill–Robertson interference',
      body: `
        <p>Two useful mutations appear in a population — but in <em>different individuals</em>, so they sit on
        different chromosomes. One gamete is <var>A</var>₁<var>B</var>₂, the other <var>A</var>₂<var>B</var>₁. The chromosome that carries both, <var>A</var>₁<var>B</var>₁, does not exist.</p>
        <p>Without recombination it never will. And because selection is a competition, the two mutations are now
        <strong>rivals</strong>: every copy of <var>A</var>₁ that spreads is a copy of <var>A</var>₂ lost, and <var>B</var>₁ is sitting on an <var>A</var>₂
        chromosome. The population cannot accumulate both improvements; it can only choose. Whichever mutation is
        luckier or arrived first drives the other to extinction — a perfectly good adaptation thrown away.</p>
        <p>Recombination is what turns rivals into allies. A single crossover between the two loci creates the <var>A</var>₁<var>B</var>₁
        chromosome, which is fitter than either single mutant and sweeps. The rarer such crossovers are — the smaller
        <var>r</var> is — the longer the two mutations spend interfering, and the more often one is lost.</p>
        <p>Hill and Robertson showed in 1966 that this makes selection <strong>less effective overall</strong> in
        regions of low recombination, and the prediction holds up: in real genomes, regions with little recombination
        carry more mildly harmful mutations and show less evidence of adaptation.</p>
        <p>This is also the sharpest population-genetic argument for sex itself. An asexual lineage is permanently at
        <var>r</var> = 0 across its entire genome, so <em>every</em> pair of beneficial mutations in it interferes. Two clonal
        lines can never pool their advantages — which is exactly what the Reproduction Room means when it says the
        two lines never mix.</p>`
    },

    // ---------- The Hardy–Weinberg Room ----------

    hwP: {
      title: 'Allele frequency p',
      body: `
        <p><strong><var>p</var> is the frequency of allele <var>A</var>₁</strong> in the gamete pool, from 0 to 1;
        <strong><var>q</var> = 1 − <var>p</var></strong> is the frequency of <var>A</var>₂. Every gamete carries one allele — <var>A</var>₁
        with probability <var>p</var>, <var>A</var>₂ with probability <var>q</var>.</p>
        <p>Under random mating, <var>p</var> is all you need to know: it fixes the frequency of all three
        genotypes at once, <var>A</var>₁<var>A</var>₁ = <var>p</var>², <var>A</var>₁<var>A</var>₂ = 2<var>pq</var>, <var>A</var>₂<var>A</var>₂ = <var>q</var>². Drag it and watch the square and the
        curves respond.</p>
        <p><strong>Why it sometimes goes grey.</strong> While the <em>One generation of random mating</em>
        panel is open, the two handles on the genotype bar decide the population, and <var>p</var> is whatever mix
        they imply — so the slider follows them instead of leading. Collapse that panel to take the
        slider back; G0 then returns to Hardy–Weinberg proportions at the <var>p</var> you have reached.</p>
        <p><strong>Watch the rare allele.</strong> As <var>p</var> gets small, the ratio of <var>A</var>₁ copies sitting in
        homozygotes (<var>p</var>²) to <var>A</var>₁ copies in heterozygotes (2<var>pq</var>) is <var>p</var>/2<var>q</var> → nearly all copies of a rare
        allele are hidden inside heterozygotes. That is the reason a rare recessive allele is
        almost invisible to selection in the Selection Room.</p>`
    },

    hwMix: {
      title: "The parents' genotype bar",
      body: `
        <p>The bar is the whole G0 population, and the <strong>two handles cut it</strong> into the three
        genotypes: <var>A</var>₁<var>A</var>₁ on the left, <var>A</var>₁<var>A</var>₂ in the middle, <var>A</var>₂<var>A</var>₂ on the right. Drag them anywhere — the mix does
        not have to be in Hardy–Weinberg, and every position is a population the room will actually
        build and then mate.</p>
        <p>The allele frequency is <strong>read back out</strong> of whatever you build, <var>p</var> = <var>f</var>(<var>A</var>₁<var>A</var>₁) +
        ½·<var>f</var>(<var>A</var>₁<var>A</var>₂), and shown in the <em>f(<var>A</var>₁) = p</em> chip. That is why the allele-frequency slider goes
        inactive while this panel is open: here <var>p</var> is a consequence of the mix, not an input. Close the
        panel to hand control back to the slider — G0 then snaps to Hardy–Weinberg at that <var>p</var>.</p>
        <p>The <strong>dashed marks</strong> show where Hardy–Weinberg would cut the bar at the allele
        frequency you have made. The gap between a handle and its dashed mark is exactly how far the
        parents sit from equilibrium.</p>
        <p><strong>The move worth trying:</strong> shift both handles outward by the same amount — more
        <var>A</var>₁<var>A</var>₁ <em>and</em> more <var>A</var>₂<var>A</var>₂, fewer <var>A</var>₁<var>A</var>₂. <var>p</var> does not change. Now look at the three histograms: the
        observed bars swing a long way, the expected bars do not move at all, and one round of random
        mating puts the offspring back on the expected ones.</p>`
    },

    hwN: {
      title: 'Population size <var>N</var>',
      body: `
        <p><strong>How many individuals</strong> are in the population. Each individual carries two
        gene copies, so <var>N</var> individuals hold 2<var>N</var> gametes — exactly the diploid gene pool of the Drift
        and Selection rooms.</p>
        <p><var>N</var> does not change the Hardy–Weinberg expectations (those depend only on <var>p</var>); it changes
        how closely the <em>offspring</em> match them. The G0 parents are built to order, but G1 is
        drawn: at small <var>N</var> its bars scatter noticeably around <var>p</var>²:2<var>pq</var>:<var>q</var>², and at large <var>N</var> they sit
        right on it. That scatter is the seed of genetic drift.</p>`
    },

    hwSquare: {
      title: 'The Hardy–Weinberg square',
      body: `
        <p>A unit square split at <var>p</var> on both axes. One axis is the allele carried by the egg, the
        other the allele carried by the sperm; the four cells are the ways two gametes can meet.</p>
        <p>Their <strong>areas are the genotype frequencies</strong>: the <var>A</var>₁×<var>A</var>₁ corner is <var>p</var>² (<var>A</var>₁<var>A</var>₁), the
        <var>A</var>₂×<var>A</var>₂ corner is <var>q</var>² (<var>A</var>₂<var>A</var>₂), and the two mixed rectangles are pq each — together 2<var>pq</var> (<var>A</var>₁<var>A</var>₂). The
        factor of 2 on the heterozygote is simply those <em>two</em> cells: <var>A</var>₁-egg/<var>A</var>₂-sperm and
        <var>A</var>₂-egg/<var>A</var>₁-sperm.</p>
        <p>Each cell also gives the <strong>expected number of individuals</strong> in a population of
        <var>N</var> — frequency × <var>N</var>. Those are the same numbers as the middle histogram at the top of the room,
        and the line under the square adds the two heterozygote cells together.</p>
        <p>This picture <em>is</em> random union of gametes. Drawing two alleles at random and
        pairing them lands you in one of these cells with exactly these probabilities.</p>`
    },

    hwCurves: {
      title: 'Genotype-frequency curves',
      body: `
        <p>The same three frequencies — <var>A</var>₁<var>A</var>₁ = <var>p</var>², <var>A</var>₁<var>A</var>₂ = 2<var>pq</var>, <var>A</var>₂<var>A</var>₂ = <var>q</var>² — plotted across every possible
        allele frequency, with a marker at your current <var>p</var>.</p>
        <p><strong>Heterozygotes peak at <var>p</var> = 0.5</strong>, where 2<var>pq</var> = 0.5, and fall away toward
        either end. Each homozygote curve is a parabola: common when its allele is common, rare
        when its allele is rare.</p>
        <p>Because these are fixed functions of <var>p</var>, a population's genotype make-up is pinned down
        the moment you know its allele frequency — nothing else about the previous generation
        matters.</p>`
    },

    hwWheel: {
      title: 'The gamete wheel',
      body: `
        <p>The wheel is the gamete pool: a blue slice of size <var>p</var> (allele <var>A</var>₁) and a red slice of size
        <var>q</var> (allele <var>A</var>₂). One spin draws <strong>one gamete</strong>.</p>
        <p><strong>Form one individual</strong> spins it twice — one gamete from each parent — and
        combines them into a genotype. Two <var>A</var>₁ gametes make <var>A</var>₁<var>A</var>₁, two <var>A</var>₂ make <var>A</var>₂<var>A</var>₂, one of each makes the
        heterozygote <var>A</var>₁<var>A</var>₂.</p>
        <p>It is the same wheel as the Drift Room, used here to build a diploid individual instead
        of sampling a haploid one: an individual is just two draws.</p>`
    },

    hwPop: {
      title: 'How individuals are drawn',
      body: `
        <p>Every circle is one <em>individual</em>, split into two halves — one per gamete, because a
        diploid carries two gene copies. Two <var>A</var>₁ gametes give a solid
        <span style="color:#2E5C8A;">blue</span> disc (<var>A</var>₁<var>A</var>₁), two <var>A</var>₂ a solid
        <span style="color:#A8442A;">red</span> disc (<var>A</var>₂<var>A</var>₂), and one of each a blue/red split (<var>A</var>₁<var>A</var>₂).</p>
        <p>While G1 is being built you see this happen live: each individual gets its first half, then
        its second, as the wheel spins. Nothing is "paired up" afterwards — the individual <em>is</em>
        two gametes joined.</p>
        <p>The same convention is used in the Drift and Selection rooms, which is what makes their
        diploid mode the very process this room describes.</p>`
    },

    hwG0: {
      title: 'G0 — the parent generation',
      body: `
        <p>A population of <var>N</var> individuals built <strong>to order</strong>: either in Hardy–Weinberg
        proportions at the allele frequency you set, or — with the <em>One generation of random mating</em>
        panel open — in whatever mix the two handles cut out. It is not sampled, so what you asked for is
        what you get, and any gap between the observed and expected histograms is the mix you chose rather
        than noise.</p>
        <p>The readout shows the <strong>observed</strong> counts against the H-W expectations at G0's
        own allele frequency. With the handles on the dashed marks they coincide; move a handle and they
        part.</p>
        <p>It also reports G0's <strong>realized</strong> <var>f</var>(<var>A</var>₁), counted straight out of the genotypes as
        (2·#<var>A</var>₁<var>A</var>₁ + #<var>A</var>₁<var>A</var>₂) / 2<var>N</var>. That realized value is the gene pool G1 is drawn from.</p>`
    },

    hwG1: {
      title: 'G1 — the offspring generation',
      body: `
        <p>G1 is G0's <strong>actual offspring</strong>: 2<var>N</var> gametes drawn from G0's gene pool and paired
        at random, two per individual. The first few are drawn slowly so you can follow the sampling,
        then it speeds up — the same ramp the Drift Room uses.</p>
        <p>Compare the two generations. The genotype counts in each sit near their H-W expectations, so
        <strong>the genotypes always track the allele frequency</strong>, whatever it happens to be.</p>
        <p>But G1's <var>f</var>(<var>A</var>₁) is usually not <em>exactly</em> G0's: 2<var>N</var> draws are a finite sample, so the
        frequency wobbles a little each generation. That wobble is <strong>genetic drift</strong> — the
        Drift Room follows it over hundreds of generations.</p>`
    },

    hwEquilibrium: {
      title: 'One generation to equilibrium',
      body: `
        <p>The bar is the whole G0 population, cut by two draggable handles into the three genotypes —
        <strong>any</strong> mix you like, in Hardy–Weinberg or not. While this panel is open the handles
        are in charge and the allele-frequency slider above is inactive, because <var>p</var> is now read out of the
        mix rather than set. The dashed marks show where Hardy–Weinberg would have cut the bar, so any
        departure is visible in place.</p>
        <p>Below it, three histograms of the same thing in individuals:</p>
        <ul>
          <li><strong>Observed</strong> — what the G0 parents actually are.</li>
          <li><strong>Expected</strong> — <var>p</var>² : 2<var>pq</var> : <var>q</var>², computed from the parents' allele frequency.</li>
          <li><strong>After one random mating</strong> — the offspring G1 that random mating really
          produced, drawn by pairing 2<var>N</var> gametes from the parents' gene pool.</li>
        </ul>
        <p><strong>The key move:</strong> move both handles outward by the same amount — more homozygotes,
        fewer heterozygotes — so that the mix changes a great deal while <var>p</var> stays put. The observed bars
        swing a long way; the expected bars do not move, because <var>p</var> did not move; and the offspring land
        on the expected ones every time. How the alleles were packaged into the parents is forgotten in a
        single generation — only their frequency survives. That is precisely why the diploid sims can
        throw the parental genotypes away and re-pair alleles from the allele frequency each
        generation.</p>
        <p>The offspring bars will not sit <em>perfectly</em> on the expected ones: G1 is a finite
        sample of 2<var>N</var> gametes, and that residual wobble is genetic drift.</p>`
    }
  };

  function topic(id) {
    return HELP_TOPICS[id];
  }

  // A title may carry <var> markup so the dialog heading can italicise its
  // symbols. Tooltips and aria-labels are plain text, so strip it for those.
  const plainTitle = (s) => String(s).replace(/<[^>]*>/g, '');

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
    const t = topic(id);
    if (!t) return;
    lastTrigger = trigger || null;
    titleEl().innerHTML = t.title;
    bodyEl().innerHTML = t.body;
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
    // A red "?" button, or an inline glossary term — both carry data-help.
    const btn = e.target.closest('.help-btn, .gloss');
    if (btn) {
      e.preventDefault();
      openHelp(btn.dataset.help, btn);
      return;
    }
    if (e.target.closest('.help-close') || e.target === overlay) closeHelp();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('gloss')) {
      e.preventDefault();
      openHelp(e.target.dataset.help, e.target);
      return;
    }
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
    scope.querySelectorAll('.gloss').forEach(el => {
      const t = topic(el.dataset.help);
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      if (t) el.setAttribute('title', plainTitle(t.title));
    });
    scope.querySelectorAll('.help-btn').forEach(btn => {
      const t = topic(btn.dataset.help);
      btn.setAttribute('type', 'button');
      btn.setAttribute('aria-label', t ? `Help: ${plainTitle(t.title)}` : 'Help');
      if (t) btn.setAttribute('title', plainTitle(t.title));
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
