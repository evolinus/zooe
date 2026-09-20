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

    // ---------- shared parameters ----------

    n0: {
      title: 'Starting population (N₀)',
      body: `
        <p><strong>How many individuals the population begins with.</strong></p>
        <p>In a deterministic model N₀ usually changes only <em>when</em> things happen, not <em>what</em>
        happens: the curve reaches the same destination from almost any start. There are two important
        exceptions, and both appear in this lab.</p>
        <ul>
          <li>With <strong>demographic noise</strong>, small populations can go extinct by chance before
          growth ever gets going.</li>
          <li>Under <strong>founder control</strong> (Neighbours Room) or an <strong>Allee effect</strong>
          (Crowding Room), the starting value decides the outcome outright.</li>
        </ul>`
    },

    birthDeath: {
      title: 'Birth rate (b) and death rate (d)',
      body: `
        <p><strong>Per-capita rates.</strong> b is the expected number of offspring one individual produces
        per unit of time; d is its probability per unit time of dying. Both are <em>per individual</em>, which
        is why the population's total change is proportional to N.</p>
        <p>Only their difference matters for the average trajectory: <code>r = b − d</code>. But b and d
        individually still matter for the <em>variability</em> — a population with b = 1.0 and d = 0.8 has the
        same r as one with b = 0.3 and d = 0.1, yet far more turnover and far noisier dynamics.</p>
        <p><strong>Try this:</strong> hold r fixed at 0.2 and raise both b and d together. The average curve
        does not move; the replicates scatter much more widely.</p>`
    },

    rIntrinsic: {
      title: 'Intrinsic rate of increase (r)',
      body: `
        <p><strong>The per-capita growth rate of a population that is not being held back by anything</strong> —
        no crowding, no shortage, no competitors. It is the maximum a species can manage, set by its own
        biology: how early it breeds, how many offspring it has, how long it lives.</p>
        <p>Large-bodied, slow-breeding species have small r (an elephant's is around 0.02 per year); bacteria
        and insects have large ones. In every model here, r is the value the per-capita growth rate takes when
        N is close to zero.</p>
        <p><strong>Watch for:</strong> in the Neighbours Room, r does <em>not</em> appear in any of the
        conditions that decide who wins. It sets the pace, not the destination.</p>`
    },

    carryingK: {
      title: 'Carrying capacity (K)',
      body: `
        <p><strong>The population size at which births exactly balance deaths</strong>, so the population
        neither grows nor shrinks. It is the level a self-limiting population settles at — approached from
        below if it starts small, and from above if it starts large.</p>
        <p>K is not a wall. Nothing prevents a population from exceeding it; a population above K simply
        shrinks, because at that density deaths outnumber births.</p>
        <p><strong>An important caution.</strong> Treating K as a fixed property of a species is a convenient
        fiction, and the Resource Room takes it apart: the same species has a different K in every
        environment, because K is really a statement about how much resource the environment supplies.</p>`
    },

    timeSpan: {
      title: 'Time span',
      body: `
        <p><strong>How long the simulation runs.</strong> Time here has no fixed units — read it as
        generations, days or years to taste, as long as you read the rates in the same units.</p>
        <p>If a run ends while things are still visibly changing, the answer you are looking at is a snapshot
        of a transient, not an outcome. Competitive exclusion in particular can take a very long time when the
        two species are closely matched: extend the time span and run again before concluding that two species
        coexist.</p>`
    },

    replicates: {
      title: 'Replicate populations',
      body: `
        <p><strong>How many independent populations to run at once, with identical parameters.</strong></p>
        <p>This matters only where births and deaths are random. Because they are drawn independently for each
        population, replicates that started identical end up at different sizes — and the spread between them
        is the honest answer to "what will happen", where a single run is only one draw from it.</p>
        <p><strong>Try this:</strong> with a small starting population and a modest positive r, run 20
        replicates. Some go extinct. The average is not the outcome, and no individual population experiences
        the average.</p>`
    },

    compare: {
      title: 'Compare two populations',
      body: `
        <p><strong>Runs a second, completely separate population alongside the first, with its own
        parameters.</strong> They share only the clock, the noise setting and the number of replicates. They do
        not interact, compete or exchange individuals — this is two runs of the same model on one chart, not a
        two-species model.</p>
        <p>The point is <em>controlled comparison</em>. A single run tells you what a set of parameters does;
        two runs that differ in exactly one parameter tell you what <em>that parameter</em> does, with
        everything else held fixed and both curves on the same axes.</p>
        <p><strong>Try this:</strong> make the two populations identical, then move one slider on population 2
        alone. Change two sliders at once and the comparison stops meaning anything — which is the whole reason
        experiments have controls.</p>
        <p>Population 1 keeps the room's own colour; population 2 is drawn in plum throughout, including in the
        diagnostic panels underneath.</p>`
    },

    noise: {
      title: 'Demographic noise',
      body: `
        <p><strong>Off:</strong> the equation is integrated exactly and gives one smooth curve. Same settings,
        same curve, every time.</p>
        <p><strong>On:</strong> every birth and every death is drawn as an independent random event, with rates
        that depend on density exactly as the equation says. The average behaviour is the same curve, but any
        one population wanders around it.</p>
        <p>This is <em>demographic</em> stochasticity — the coin-flip nature of individual lives — not
        environmental variation. Its importance scales with 1/√N, so it dominates small populations and all but
        disappears in large ones. It is one of the main reasons small populations are at risk even when
        conditions are good.</p>`
    },

    logAxis: {
      title: 'Linear vs. logarithmic axis',
      body: `
        <p>On a <strong>linear</strong> axis, equal distances mean equal <em>differences</em>: the gap from 10
        to 20 looks the same as the gap from 1000 to 1010.</p>
        <p>On a <strong>logarithmic</strong> axis, equal distances mean equal <em>ratios</em>: 10 to 20 looks
        the same as 1000 to 2000, because both are a doubling.</p>
        <p><strong>Why it matters here:</strong> exponential growth is constant proportional growth, so on a
        log axis it becomes a perfectly straight line whose slope is r. This is the standard test — if plotting
        the logarithm of a population's size against time gives a straight line, growth is exponential.</p>`
    },

    // ---------- Growth Room ----------

    popField: {
      title: 'The population field',
      body: `
        <p>One dot per individual, so you can feel the size of the number rather than just read it.</p>
        <p>In the Growth Room the count outgrows the panel quickly; above about 1500 individuals each dot
        stands for several, and the caption says how many. In the Crowding Room the grid is instead laid out
        for K places, and the pale dots are the ones still unoccupied — so the panel fills up as the population
        approaches its carrying capacity.</p>`
    },

    growthChart: {
      title: 'Population size over time',
      body: `
        <p>The solid coloured lines are simulated populations in which each birth and death was an independent
        random event. The dashed grey line is the textbook prediction, <code>N(t) = N₀e^(rt)</code>, which
        assumes no chance at all.</p>
        <p><strong>What to look for:</strong> the simulated lines scatter around the prediction rather than
        following it, and the scatter is proportionally largest when the population is small. Switch the axis
        to logarithmic and the prediction becomes a straight line of slope r.</p>
        <p>On the linear axis the panel is only drawn to 200 000 individuals. A curve that reaches the top does
        not stop there — it leaves through the top edge as a dotted line, and the readouts carry on counting. The
        logarithmic axis is stretched to fit the whole run instead, however many powers of ten it takes, which is
        the only way to see all of it at once.</p>`
    },

    perCapita: {
      title: 'Per-capita growth rate vs. density',
      body: `
        <p>This panel answers: <em>how well does one individual do, when the population is this crowded?</em>
        It plots (dN/dt)/N against N.</p>
        <p>In the Growth Room the answer is a <strong>flat line</strong> at height r — an individual's
        prospects are the same at any density. That is exactly what "density-independent" means.</p>
        <p>In the Crowding Room the same line <strong>slopes down</strong>, hitting zero precisely at K.
        That falling line <em>is</em> intraspecific competition; everything else in the room follows from it.
        Compare the two panels directly — they are the same plot of the same quantity.</p>`
    },

    totalGrowth: {
      title: 'Total growth rate vs. density',
      body: `
        <p>How fast the <em>whole population</em> adds individuals, dN/dt, plotted against how big it currently
        is.</p>
        <p>Without crowding this is a straight line through the origin: more individuals, faster growth,
        without end. With crowding it is a <strong>hump</strong> that peaks at K/2 and returns to zero at K —
        a nearly empty population grows slowly because there are few parents, and a full one grows slowly
        because there is no room.</p>
        <p><strong>Why K/2 matters:</strong> that peak is the maximum sustainable yield. A harvested population
        held near half its carrying capacity produces its largest possible surplus — which is why fisheries
        management targets it, and why a stock fished far below it recovers so slowly.</p>`
    },

    // ---------- Crowding Room ----------

    logisticChart: {
      title: 'The logistic curve',
      body: `
        <p>Three things are drawn together. The coloured line is the population with crowding. The pale dashed
        line is what the <em>same</em> population, with the same r and N₀, would have done with no crowding at
        all — the Growth Room's exponential. With demographic noise on, a third dashed line shows the
        deterministic logistic, which is the average the noisy runs scatter around.</p>
        <p><strong>What to look for:</strong> the two curves are indistinguishable at first. Crowding is
        invisible while a population is far below K, which is exactly why an early growth curve tells you
        almost nothing about where a population will stop. Then they part: the pale one leaves through the top
        of the panel and keeps going — the panel is scaled to a population that settles, and that curve never
        does — while the coloured one bends over towards K.</p>`
    },

    birthDeathLines: {
      title: 'Birth and death rates vs. density',
      body: `
        <p>The mechanism underneath the logistic curve. As the population grows, the per-capita birth rate
        falls (less food per individual, fewer nest sites, more interference) and the per-capita death rate
        rises (starvation, disease, aggression).</p>
        <p><strong>K is simply where the two lines cross.</strong> Below the crossing, births exceed deaths and
        the population grows; above it, deaths win and it shrinks. Nothing decides K except the shapes of these
        two lines.</p>
        <p>This is also why K can change without the species changing at all: anything that shifts either line —
        a better year, a new predator, an enriched habitat — moves the crossing point.</p>`
    },

    allee: {
      title: 'The Allee effect',
      body: `
        <p><strong>Being rare can be bad for you too.</strong> The ordinary logistic assumes an individual does
        best when the population is smallest. For many species that is false: below some density, mates become
        hard to find, group defence fails, cooperative hunting stops working, and social species lose the
        behaviours that need a crowd.</p>
        <p>With the effect switched on, the model becomes
        <code>dN/dt = rN(N/A − 1)(1 − N/K)</code>. Below the threshold A the per-capita growth rate is
        <em>negative</em>: the population declines however much empty habitat is available.</p>
        <p><strong>Why it matters:</strong> A is a second equilibrium, but an unstable one — an extinction
        threshold. It explains why some endangered populations keep falling after the original threat has been
        removed, and why passenger pigeons, which nested in enormous colonies, could not persist as scattered
        pairs.</p>`
    },

    // ---------- Resource Room ----------

    supply: {
      title: 'Resource supply rate (S)',
      body: `
        <p><strong>How much new resource the environment delivers per unit time</strong> — sunlight arriving,
        nutrients washing in, detritus falling. It is a rate, not a stock: S is the tap, not the tank.</p>
        <p>S is the one parameter that sets how <em>rich</em> the environment is, and it does something very
        specific: it raises the number of consumers the environment supports (N*) while leaving the resource
        level they leave behind (R*) completely unchanged.</p>
        <p><strong>Try this:</strong> double S and run again. N* roughly doubles. R* does not move at all.</p>`
    },

    resLoss: {
      title: 'Resource loss rate (l)',
      body: `
        <p><strong>How fast the resource disappears on its own</strong>, with no consumers present — washed
        downstream, decayed, buried, gone stale.</p>
        <p>Together with the supply it fixes the resource level of an <em>empty</em> environment: R would sit
        at S/l with nobody eating it. That ratio is the ceiling on what any consumer can find, so a species
        whose R* is above S/l cannot live there at all.</p>`
    },

    attack: {
      title: 'Attack rate (a)',
      body: `
        <p><strong>How efficiently one consumer finds and captures resource.</strong> The consumption rate per
        consumer is a·R, so a is the slope of that relationship — a "type I", or linear, functional response.
        Doubling a means each consumer eats twice as fast at any given resource level.</p>
        <p>A higher attack rate lowers R*, because a species that gathers food faster can break even on less of
        it. This is one of only three things R* depends on: <code>R* = m/(e·a)</code>.</p>
        <p><strong>A counterintuitive consequence:</strong> in the Coexistence Room, eating <em>faster</em>
        does not by itself win a competition. What wins is surviving on less — and a fast eater with high
        mortality can easily be beaten by a slow, frugal one.</p>`
    },

    efficiency: {
      title: 'Conversion efficiency (e)',
      body: `
        <p><strong>How much of what is eaten becomes new consumer.</strong> If e = 0.4, then four tenths of
        each unit of resource consumed is turned into offspring and the rest is lost to respiration, waste and
        the ordinary costs of being alive.</p>
        <p>Efficiency enters R* in exactly the same way the attack rate does: <code>R* = m/(e·a)</code>. A more
        efficient consumer needs less food present to break even.</p>`
    },

    mortality: {
      title: 'Mortality rate (m)',
      body: `
        <p><strong>The per-capita death rate in the absence of starvation</strong> — predation, disease,
        accident, old age. It is what the consumer must earn back through feeding just to stay level.</p>
        <p>Mortality is the numerator of R*: <code>R* = m/(e·a)</code>. A species that dies more slowly needs
        less food to break even, and in a one-resource competition that alone can decide the winner.</p>
        <p><strong>Try this</strong> in the Coexistence Room: make the two species identical except for
        mortality. The longer-lived one wins, however fast the other one eats or breeds.</p>`
    },

    envShift: {
      title: 'Environment shift',
      body: `
        <p>Halfway through the run, the supply rate S is multiplied by the factor you choose, and the
        simulation carries on. The consumers are given no warning and no new traits — only their world changes.</p>
        <p><strong>What to look for:</strong> the population moves to a new equilibrium that matches the new
        supply, while R* stays exactly where it was. This is the cleanest demonstration in the lab that
        carrying capacity is a property of the <em>species-in-its-environment</em>, not of the species.</p>
        <p>Set the multiplier below about 0.15 with a high mortality and the shift becomes an extinction: a
        population perfectly viable in one environment need not be viable in a poorer one.</p>`
    },

    resourceChart: {
      title: 'Resource over time',
      body: `
        <p>How much resource is actually present at each moment. It starts high, is drawn down as the consumers
        build up, usually undershoots, and then settles.</p>
        <p>The dashed purple line is <strong>R*</strong>, the level at which a consumer exactly breaks even.
        Whenever the resource is above that line the consumer population grows; whenever it is below, the
        population shrinks. Watch the two panels together and you can see each turning point in the consumer
        curve occur exactly as the resource crosses its R*.</p>`
    },

    consumerChart: {
      title: 'Consumers over time',
      body: `
        <p>The consumer population. The dashed purple line is N*, the equilibrium the model predicts:
        <code>N* = (S − l·R*)/(a·R*)</code>.</p>
        <p><strong>What to look for:</strong> at the settings this room opens with, the population
        <em>overshoots</em> N* by about 45% and then oscillates in to it. The cause is a lag — consumers keep
        breeding for as long as the resource sits above R*, and by the time the resource has been drawn down
        there are already more consumers than the environment can hold.</p>
        <p><strong>But it does not always overshoot,</strong> and it is worth finding out when it does not.
        From the default settings, put the supply <em>S</em> to 40 and the resource loss <em>l</em> to 0.35,
        then run again: the curve now slides into N* without ever exceeding it. Linearising the model about
        its equilibrium gives an oscillation only when <code>S² &lt; 4·m·R*·(S − l·R*)</code>, and that
        inequality can only be satisfied when m &gt; l. A resource that disappears quickly on its own never
        accumulates the surplus a consumer population needs in order to overshoot.</p>
        <p>Raise <em>l</em> on its own and you will get a different result — extinction. A faster-decaying
        resource also settles at a lower level in an empty environment (S/l), and once that falls below R*
        there is nothing for the consumer to live on. That is why the recipe above raises the supply at the
        same time.</p>`
    },

    phaseRN: {
      title: 'The resource–consumer phase plane',
      body: `
        <p>Time is not on either axis here. Each point plots how much resource there was against how many
        consumers there were <em>at the same moment</em>, and the trajectory is the path the system traced.</p>
        <p>The two dashed lines are the <strong>nullclines</strong>: on the vertical one the consumers stop
        changing (it sits at R = R*), and on the curved one the resource stops changing. Where they cross,
        both stop — that is the equilibrium.</p>
        <p><strong>What to look for:</strong> at the default settings the trajectory spirals inward rather
        than heading straight in. A spiral here is exactly the same fact as a damped oscillation in the time
        series: overshoot, correction, smaller overshoot. Each time the trajectory crosses the vertical
        nullcline, the consumer curve in the panel above is at a peak or a trough.</p>
        <p>Put the supply <em>S</em> to 40 and the resource loss <em>l</em> to 0.35 and the spiral disappears
        — the trajectory then curves straight into the equilibrium and the time series never overshoots. Both
        behaviours are in the same two equations; which one you get is a matter of parameters, not of which
        model you chose. (Raise <em>l</em> without raising <em>S</em> and you get neither, because the
        resource can no longer reach R* and the consumer dies out.)</p>`
    },

    rStar: {
      title: 'R* and the emergent carrying capacity',
      body: `
        <p>Set dN/dt = 0 and the consumer's break-even resource level drops out:
        <code>R* = m/(e·a)</code>. Substituting that into the resource equation gives the abundance the
        environment supports, <code>N* = (S − l·R*)/(a·R*)</code>.</p>
        <p>Look at what is in each expression. <strong>R* contains only the consumer's own traits</strong> —
        how fast it dies, how efficiently it feeds. <strong>N* contains the environment</strong> — the supply
        rate. So the same species has a different carrying capacity in every environment, but leaves behind the
        same resource level in all of them.</p>
        <p>This asymmetry is the foundation of the Coexistence Room: because R* belongs to the species, two
        species' R* values can be compared directly, and the comparison predicts who wins.</p>`
    },

    // ---------- Overshoot Room ----------

    discreteModels: {
      title: 'Scramble vs. contest competition',
      body: `
        <p>Both models describe a population that breeds once per season, so this year's density sets next
        year's numbers. They differ in how the shortage is shared out.</p>
        <p><strong>Ricker — scramble.</strong> Everyone gets an equal share of whatever there is. A cohort that
        badly overshoots K leaves too little for anyone, and almost nobody survives to breed: the crash is
        severe, and can be severe enough to overshoot again on the way back. This is the model that cycles and
        goes chaotic.</p>
        <p><strong>Beverton–Holt — contest.</strong> There are a fixed number of territories. Whoever holds one
        breeds fully; the rest get nothing. Recruitment saturates rather than collapsing, so the population can
        never overshoot. This map is monotone at <em>every</em> parameter value — it has no cycles and no chaos,
        ever.</p>
        <p><strong>Discrete logistic.</strong> The logistic equation with time chopped into generations,
        included because it is where chaos was first noticed in ecology. It has one unbiological flaw: a large
        enough overshoot sends N below zero.</p>`
    },

    rDiscrete: {
      title: 'The growth parameter in discrete time',
      body: `
        <p>Same meaning as before — the per-capita growth rate of an uncrowded population — but in discrete
        time it does something extra: it also controls <strong>how violently the population reacts to being
        crowded.</strong></p>
        <p>The two roles cannot be separated, and that is the whole story of this room. For the Ricker map:</p>
        <ul>
          <li><strong>r &lt; 1:</strong> smooth approach to K.</li>
          <li><strong>1 &lt; r &lt; 2:</strong> damped oscillation — overshoot, undershoot, settle.</li>
          <li><strong>r ≈ 2:</strong> the first bifurcation; a permanent two-generation cycle appears.</li>
          <li><strong>r ≈ 2.5:</strong> four-generation cycle, then eight, faster and faster.</li>
          <li><strong>r &gt; 2.7:</strong> chaos.</li>
        </ul>
        <p>Under Beverton–Holt none of this happens at any r.</p>`
    },

    sensitivity: {
      title: 'The sensitivity test',
      body: `
        <p>Runs a second population identical in every way except that it starts with <strong>0.001 more
        individuals</strong> — a difference no census could ever measure.</p>
        <p>When the dynamics are stable or cyclic, the two lines stay on top of each other indefinitely: the
        difference is absorbed. Under chaos they track each other for a while and then separate completely.</p>
        <p><strong>This is what "chaos" actually means.</strong> Not randomness — the equation is perfectly
        deterministic and contains no chance at all — but sensitive dependence on initial conditions. Since
        real measurements always carry some error, a chaotic population cannot be predicted far ahead however
        good the model is.</p>`
    },

    discreteSeries: {
      title: 'The generation-by-generation series',
      body: `
        <p>Dots are generations, and there is nothing in between because nothing happens in between: the
        population is censused once a year, breeds, and is censused again.</p>
        <p><strong>What to look for:</strong> at moderate r the population converges on K. Raise r and it
        begins to overshoot and undershoot, with the wobbles taking longer to die away. Past a threshold they
        stop dying away at all.</p>`
    },

    cobweb: {
      title: 'The cobweb diagram',
      body: `
        <p>A way of seeing a whole run in one picture. The curve is the model itself: read this year's
        population off the horizontal axis, and the curve's height is next year's. The diagonal is the
        "no change" line.</p>
        <p>The staircase is the run: go up to the curve (that is next year's number), across to the diagonal
        (now it is this year's number), up to the curve again, and so on.</p>
        <p><strong>What to look for:</strong> where the curve crosses the diagonal is the equilibrium. If the
        curve is shallow there, the staircase spirals inward and the population settles. If it is steeply
        falling — which is what a strong overshoot looks like — the staircase spirals outward into a permanent
        box or a tangle. The steepness of that crossing is the whole difference between stability and chaos.</p>`
    },

    bifurcation: {
      title: 'The bifurcation diagram',
      body: `
        <p>One vertical slice per growth rate. For each r, the model is run long enough for the transient to
        die away, and then the values it actually visits are plotted.</p>
        <ul>
          <li><strong>A single dot</strong> — the population settles at one value.</li>
          <li><strong>Two dots</strong> — it alternates between two values forever.</li>
          <li><strong>Four, eight, sixteen…</strong> — the period doubles, faster and faster.</li>
          <li><strong>A vertical smear</strong> — chaos: it never repeats.</li>
        </ul>
        <p>The gold line marks your current setting, so you can see where on this map your run is sitting.
        Look inside the chaotic region for pale vertical gaps: these are <em>windows</em> where order returns
        abruptly. The widest one is a three-generation cycle.</p>
        <p><strong>Now switch to Beverton–Holt.</strong> The diagram is a single flat line at N = K. Contest
        competition never bifurcates, and the difference between the two pictures is the difference between
        overcompensating and compensating density dependence.</p>`
    },

    regime: {
      title: 'Diagnosing the long-run behaviour',
      body: `
        <p>The last third of the series is examined for repetition. If it repeats every p generations to
        within a small tolerance, the population is on a p-generation cycle; p = 1 means a stable equilibrium.
        If no period up to 8 fits, it is reported as chaotic.</p>
        <p>Two cautions worth carrying into real data. First, "no short period found" is not proof of chaos —
        a very long cycle looks the same in a short series. Second, real populations are also buffeted by
        weather and predators, so distinguishing genuine chaos from a stable population in a noisy world is
        one of the genuinely hard problems in ecology.</p>`
    },

    // ---------- Neighbours Room ----------

    presets: {
      title: 'The four presets',
      body: `
        <p>Four parameter sets, one for each qualitative outcome of Lotka–Volterra competition.</p>
        <ul>
          <li><strong>A excludes B</strong> — A can invade B's world, B cannot invade A's.</li>
          <li><strong>B excludes A</strong> — the mirror image.</li>
          <li><strong>Stable coexistence</strong> — both α values below 1: each species limits itself more
          than it limits the other, so both persist from any starting point.</li>
          <li><strong>Founder control</strong> — both α values above 1: each limits the other more than
          itself, neither can invade, and whoever establishes first keeps the site.</li>
        </ul>
        <p>After loading a preset, look at the <em>phase plane</em> rather than the time series — the four
        cases are four different arrangements of the same two straight lines, and once you can recognise the
        arrangement you no longer need to run anything.</p>`
    },

    alpha: {
      title: 'The competition coefficient (α)',
      body: `
        <p><strong>A conversion rate between species.</strong> α<sub>AB</sub> says how much one individual of
        species B crowds species A, measured in units of A's own individuals.</p>
        <ul>
          <li><strong>α = 1</strong> — a competitor is exactly as suppressive as one of your own kind. The two
          species are ecologically interchangeable.</li>
          <li><strong>α &lt; 1</strong> — a competitor matters less than a member of your own species, which
          happens when the two use partly different resources. This is the ingredient coexistence needs.</li>
          <li><strong>α &gt; 1</strong> — a competitor matters more, for instance when it is aggressive or
          pre-empts space.</li>
          <li><strong>α = 0</strong> — no competition at all; the two logistic equations are independent.</li>
        </ul>
        <p>Note that α<sub>AB</sub> and α<sub>BA</sub> are separate numbers and need not be similar.
        Competition is very often lopsided.</p>`
    },

    twoSpeciesChart: {
      title: 'Both populations over time',
      body: `
        <p>The two species drawn on the same axes, with each one's own carrying capacity marked as a dashed
        line of the matching colour.</p>
        <p><strong>What to look for:</strong> the gap between a species' curve and its own dashed line is what
        having a neighbour costs it. In a coexistence run both species sit well below their own K and stay
        there — coexistence is not comfort, only survival.</p>
        <p>Watch the early part of a run too. Both species usually rise together at first, because while both
        are rare neither is limiting the other; competition only bites once someone becomes common.</p>`
    },

    fourOutcomes: {
      title: 'The four outcomes',
      body: `
        <p>Everything Lotka–Volterra competition can do, decided by two comparisons:</p>
        <ul>
          <li><strong>K<sub>A</sub> &gt; α<sub>AB</sub>K<sub>B</sub></strong> — A can invade when rare.</li>
          <li><strong>K<sub>B</sub> &gt; α<sub>BA</sub>K<sub>A</sub></strong> — B can invade when rare.</li>
        </ul>
        <p><strong>Both true → stable coexistence.</strong> Whichever species becomes common limits itself
        first, leaving room for the other. The system returns to the same interior equilibrium after any
        disturbance.</p>
        <p><strong>Both false → founder control.</strong> Neither can break into a site the other holds. Two
        stable outcomes exist and history picks between them.</p>
        <p><strong>One of each → competitive exclusion.</strong> The species that can invade always wins, from
        every starting point.</p>
        <p>Notice what is absent from all of this: r. Growth rates change how long the outcome takes to
        arrive and nothing else.</p>`
    },

    isoclines: {
      title: 'The phase plane and its isoclines',
      body: `
        <p>Species A's abundance on one axis, B's on the other. Time does not appear — a whole run is one
        curve, showing which pairs of abundances the community passed through.</p>
        <p>Each straight line is a <strong>zero-growth isocline</strong>: the set of points where that species
        stops changing. A's line runs from (K<sub>A</sub>, 0) to (0, K<sub>A</sub>/α<sub>AB</sub>). A grows
        below its own line and shrinks above it; the same applies to B with its line.</p>
        <p>The small arrows show the direction the community is pushed at each point, and the coloured dots are
        equilibria. <strong>The arrangement of the two lines is the entire theory:</strong> if they do not
        cross, the species whose line lies outside wins everywhere. If they cross, coexistence is stable when
        each species' line is the outer one along its own axis, and a saddle otherwise.</p>
        <p><strong>Click anywhere on the plane</strong> to restart the run from that pair of abundances. Under
        founder control, clicking on opposite sides of the diagonal gives opposite winners.</p>`
    },

    invasion: {
      title: 'The invasion criterion',
      body: `
        <p>The most useful question in competition theory, and the one that makes the four outcomes easy to
        remember: <em>if this species were vanishingly rare, and its competitor were sitting at its own
        carrying capacity, could it increase?</em></p>
        <p>Ask it of both species and you have the answer. Both yes is coexistence; both no is founder control;
        one of each is exclusion.</p>
        <p>The criterion also matters practically: it is the reason "can this invader establish here?" is
        answered by looking at conditions when the invader is rare, which is exactly when it is hardest to
        detect and cheapest to stop.</p>`
    },

    // ---------- Coexistence Room ----------

    modeResources: {
      title: 'One resource or two',
      body: `
        <p><strong>One resource</strong> is the classic exclusion experiment: two consumers, one food, and
        nothing to divide. One species always wins — the one with the lower R*.</p>
        <p><strong>Two resources</strong> opens the possibility of a trade-off. If each species is better at
        exploiting a different resource, each ends up limited mainly by its own preferred food, which means it
        suppresses itself more than it suppresses its rival. That is the mechanistic version of what the
        Neighbours Room described as α &lt; 1.</p>
        <p>Two resources are not by themselves sufficient. Make both species prefer the same one and exclusion
        returns — what coexistence needs is the trade-off, not the second dish.</p>`
    },

    exclusion: {
      title: 'The competitive exclusion principle',
      body: `
        <p>Gause's principle: two species making their living in exactly the same way cannot persist together
        indefinitely. One of them will always be slightly better and will slowly displace the other.</p>
        <p>This room shows <em>why</em>. Competition here is not an assumption — the two species never
        interact directly at all. Each simply eats, and eating lowers the resource for everyone. The winner is
        whichever species can still break even at a resource level the other cannot survive on.</p>
        <p>The principle is often stated as "complete competitors cannot coexist", and the interesting part of
        ecology is everything that stops competitors from being complete: different foods, different times,
        different microhabitats, predators that crop the winner, environments that change before exclusion
        finishes.</p>`
    },

    rStarRule: {
      title: "The R* rule",
      body: `
        <p><code>R*<sub>ij</sub> = m<sub>i</sub>/(e·a<sub>ij</sub>)</code> is the concentration of resource j
        at which species i exactly breaks even.</p>
        <p><strong>With a single resource, the species with the lowest R* wins.</strong> Always. Not usually,
        not other things being equal — always, and regardless of starting abundance, growth rate or how much
        each species eats.</p>
        <p>The mechanism is worth spelling out because it is so simple. The winner drives the resource down
        towards its own R*. That level is below what the loser needs to replace itself, so the loser declines.
        Every individual the loser loses leaves a little more resource for the winner. There is no way back.</p>
        <p><strong>The counterintuitive part:</strong> being a fast, aggressive consumer is worth nothing by
        itself. What matters is the ratio — surviving on little (low m) and converting it well (high e·a).
        A slow, frugal species beats a fast, wasteful one.</p>`
    },

    zngi: {
      title: 'Break-even lines in resource space',
      body: `
        <p>With two resources, a species' requirement is no longer a single number but a <strong>line</strong>:
        every combination of R₁ and R₂ satisfying <code>a<sub>i1</sub>R₁ + a<sub>i2</sub>R₂ = m<sub>i</sub>/e</code>
        leaves it exactly replacing itself. It grows above and to the right of its own line and shrinks below
        it. (Ecologists call this line a zero net growth isocline.)</p>
        <p>The gold point is the <strong>supply point</strong> — where the resources would sit with no
        consumers at all. The dark curve is the path the resources actually took as the consumers drew them
        down.</p>
        <p><strong>What to look for.</strong> If one species' line lies entirely inside the other's, that
        species breaks even at lower levels of both resources and wins outright — a second resource has not
        helped. If the lines <em>cross</em>, there is a resource pair at which both break even, and coexistence
        becomes possible. Whether it actually happens depends on the supply point too: the environment must
        deliver the two resources in roughly the proportion the two species consume them.</p>`
    },

    // ---------- Predator Room ----------

    predModels: {
      title: 'The three predator–prey models',
      body: `
        <p>All three are the same two equations. What changes is the shape of two functions inside them, and
        each change repairs something the previous model got wrong.</p>
        <ul>
          <li><strong>Classic Lotka–Volterra</strong> — prey grow exponentially when unpursued, and each
          predator's catch is proportional to prey density with no upper limit. Published independently by
          Alfred Lotka (1925) and Vito Volterra (1926), it produces perpetual cycles.</li>
          <li><strong>Prey with a ceiling</strong> — the prey are also limited by their own crowding, exactly as
          in the Crowding Room. This single addition converts the perpetual cycles into damped ones that settle
          at an equilibrium.</li>
          <li><strong>Predator that gets full</strong> — each prey caught costs the predator a handling time
          <em>h</em>, so its intake saturates. This is the one that can destabilise a perfectly stable
          community, and it is the more realistic assumption of the two.</li>
        </ul>
        <p><strong>Run all three from the same starting point</strong> and watch the phase plane. The
        trajectory is a closed loop, then an inward spiral, then an outward spiral onto a fixed cycle.</p>`
    },

    predPresets: {
      title: 'The four presets',
      body: `
        <p>Four parameter sets, one for each thing this room has to say.</p>
        <ul>
          <li><strong>Neutral cycles</strong> — the classic model. Perpetual oscillation whose size is set by
          where you started.</li>
          <li><strong>Damped to equilibrium</strong> — the same species, with a carrying capacity added to the
          prey. The cycles die away.</li>
          <li><strong>Paradox of enrichment</strong> — a saturating predator in a rich environment. The
          equilibrium exists, is easy to calculate, and repels: the community settles onto a large cycle
          instead.</li>
          <li><strong>Cycles that crash</strong> — the classic model started far from equilibrium. The orbit is
          so wide that the prey trough falls below one individual, and both species are lost.</li>
        </ul>`
    },

    functionalResponse: {
      title: 'The functional response, and the attack rate (a)',
      body: `
        <p><strong>The functional response is how many prey one predator eats per unit time, as a function of
        how many prey are available.</strong> The attack rate <em>a</em> is how efficiently a predator finds and
        catches prey: the higher it is, the steeper the response near the origin.</p>
        <p><strong>Type I (linear), f(N) = aN.</strong> A predator facing a thousand prey eats a hundred times
        as many as one facing ten. It never fills up and never runs out of hours in the day. Each prey faces
        the same <em>risk</em> of being eaten at any density.</p>
        <p><strong>Type II (saturating), f(N) = aN/(1 + a·h·N).</strong> Every prey caught must be chased,
        killed, eaten and digested, and that takes time <em>h</em> during which the predator is not hunting. As
        prey get commoner the predator spends nearly all its time handling, so its intake flattens off at
        1/<em>h</em>. This is the shape almost every measured functional response has.</p>
        <p><strong>Why the shape matters so much:</strong> under type II, a prey population that gets ahead
        faces a <em>falling</em> per-capita risk — the predators are already busy. The brake weakens exactly
        when it is most needed, which is what turns a stable equilibrium into a cycle.</p>`
    },

    handlingTime: {
      title: 'Handling time (h)',
      body: `
        <p><strong>The time a predator spends dealing with one prey item</strong> — pursuing, subduing, eating,
        digesting — during which it cannot hunt for another.</p>
        <p>It sets the ceiling on how fast a predator can possibly eat: at most 1/<em>h</em> prey per unit time,
        however many prey surround it. Set h = 0 and the predator can eat without limit, which is the classic
        model's assumption.</p>
        <p>Handling time also enters the predator's break-even prey density,
        <code>N* = m/(a(e − m·h))</code>. Notice the denominator: if <code>m·h ≥ e</code>, a predator dies faster
        than handling time lets it feed, and no prey density whatever can sustain it.</p>
        <p><strong>Try this:</strong> in the third model, slide h from 0 upwards with everything else fixed.
        At h = 0 the equilibrium is stable; past a threshold the same species break into a permanent cycle.</p>`
    },

    predSeries: {
      title: 'Prey and predators over time',
      body: `
        <p>Both populations on the same axes, with each one's predicted equilibrium as a dashed line of the
        matching colour. Small dots mark the peaks.</p>
        <p><strong>What to look for: the quarter-cycle lag.</strong> The predator's peaks are consistently to
        the right of the prey's, by about a quarter of a full cycle. The reason is causal, not coincidental —
        predators can only build up <em>after</em> their food does, and prey can only recover <em>after</em> the
        predators have starved. Each population is chasing where the other one was.</p>
        <p>The four quarters of a cycle read as a story: prey abundant and predators still scarce (prey rising),
        predators rising on the surplus (prey falling), predators abundant and prey scarce (predators falling),
        prey recovering in the gap (both low). Then it repeats.</p>
        <p>Switch the axis to <strong>logarithmic</strong> when a cycle swings very wide: on a linear axis the
        troughs are flattened against zero and you cannot see how close to extinction the population came.</p>`
    },

    predOutcomes: {
      title: 'What predator–prey models can do',
      body: `
        <p>The interior equilibrium is always easy to compute. Everything interesting is about whether it
        <em>attracts</em>.</p>
        <ul>
          <li><strong>Neutral cycles</strong> (classic model) — the equilibrium neither attracts nor repels.
          Every starting point sits on its own closed orbit forever.</li>
          <li><strong>Damped oscillation</strong> — the equilibrium attracts. Cycles shrink and the populations
          settle. Prey self-limitation is what supplies the damping.</li>
          <li><strong>Limit cycle</strong> — the equilibrium repels, but the populations cannot escape to
          infinity either, so they settle onto a fixed loop whose size belongs to the parameters rather than to
          the starting point.</li>
          <li><strong>Extinction</strong> — the predator cannot break even at any prey density, or a cycle
          swings so low that a population passes through zero.</li>
        </ul>
        <p>A useful rule of thumb covers all of them: look at the prey nullcline where the predator's vertical
        nullcline crosses it. Crossing on a <em>falling</em> stretch is stabilising; crossing on a
        <em>rising</em> stretch is destabilising; crossing a flat one is the classic model's knife-edge.</p>`
    },

    predPhase: {
      title: 'The predator–prey phase plane',
      body: `
        <p>Prey on the horizontal axis, predators on the vertical; time does not appear. A whole run is one
        curve, and it always turns <strong>anticlockwise</strong> — that rotation <em>is</em> the quarter-cycle
        lag seen from above.</p>
        <p>The two coloured lines are the <strong>nullclines</strong>. On the teal one the prey stop changing;
        on the rust one the predators stop changing. The rust line is vertical because the predator's fate
        depends only on how much prey there is, never on how many predators there are — a peculiarity of these
        equations worth noticing.</p>
        <p>The faint grey loops are runs from <em>other</em> starting points with identical parameters, and they
        are the fastest way to tell the three models apart:</p>
        <ul>
          <li><strong>Nested loops that never meet</strong> — neutral stability. History decides everything.</li>
          <li><strong>All spiralling to the same dot</strong> — a stable equilibrium. History decides
          nothing.</li>
          <li><strong>All converging onto the same loop</strong> — a limit cycle. History decides nothing, but
          the community never stops moving.</li>
        </ul>
        <p><strong>Click anywhere on the plane</strong> to restart the run from that pair of abundances.</p>`
    },

    predEquilibria: {
      title: 'The strange arithmetic of N* and P*',
      body: `
        <p>Set each equation to zero and the equilibrium falls out:</p>
        <ul>
          <li><code>N* = m/(a(e − m·h))</code> — every symbol is a <strong>predator</strong> trait.</li>
          <li><code>P* = N*·g(N*)/f(N*)</code> — dominated by <strong>prey</strong> traits, especially r.</li>
        </ul>
        <p>So the number of prey is set by the predator's biology, and the number of predators by the prey's.
        This has real consequences. Improve the prey's food supply — raise K — and the extra production does not
        become prey: it becomes predators. Anything that makes the predator less effective (higher m, lower a)
        <em>raises</em> the standing prey population.</p>
        <p><strong>On the two columns.</strong> "Predicted" comes from the equations, "measured" from the run
        that just finished, averaged over a whole number of cycles. Where they disagree, the disagreement is
        usually real rather than sloppy:</p>
        <ul>
          <li>The period <code>2π/√(r·m)</code> and the quarter-cycle lag are derived for <em>small</em>
          oscillations. A wide orbit runs slower and lags by less.</li>
          <li>In the classic model the time-averaged abundances land on N* and P* exactly, however violent the
          cycle. This is a special property of that model — on a limit cycle the mean and the equilibrium are
          genuinely different numbers.</li>
        </ul>`
    },

    preyRisk: {
      title: 'Prey growth vs. predation risk',
      body: `
        <p>Both curves are <em>per-capita</em> rates for the prey, plotted against prey density: what one prey
        individual gains, and what it risks, at the current number of predators. Where they cross, the prey
        population is momentarily stationary.</p>
        <p>The teal line is the prey's own growth — flat at r in the classic model, falling to zero at K when
        the prey have a ceiling.</p>
        <p>The rust line is the per-capita death rate from predation, <code>f(N)·P/N</code>. With a linear
        response this is <code>a·P</code>: <strong>flat</strong>, so predators always take the same
        <em>proportion</em> of prey. With a saturating response it is <code>a·P/(1 + a·h·N)</code>:
        <strong>falling</strong>, so each prey individual is safer in a crowd.</p>
        <p><strong>This one panel explains the paradox of enrichment.</strong> A falling risk line means
        predation is weakest exactly where prey are most abundant — the check on prey growth loosens as the
        prey population runs away, so it overshoots, and the correction arrives late and hard.</p>`
    },

    predNeutral: {
      title: 'Neutral stability, and why it is a problem',
      body: `
        <p>The classic model conserves a quantity — <code>V = e·a·N − m·ln N + a·P − r·ln P</code> stays exactly
        constant along every trajectory, in the same way a frictionless pendulum conserves energy. That is why
        the orbits close.</p>
        <p>It sounds like a strong result and is actually a fatal weakness. <strong>Neutral</strong> stability
        means the equilibrium neither attracts nor repels, so:</p>
        <ul>
          <li>the amplitude of the cycle carries no information about the species — only about their
          history;</li>
          <li>every disturbance moves the pair permanently onto a new orbit, and nothing brings it back;</li>
          <li>the tiniest change to the model's structure destroys the result entirely, in one direction or the
          other.</li>
        </ul>
        <p>Real cycling populations — the lynx and hare of the Hudson's Bay Company records are the famous
        example — keep a fairly consistent amplitude for decades. That is the signature of a limit cycle, not of
        neutral cycles, so whatever those populations are doing, they are not doing this.</p>
        <p><strong>One more warning.</strong> Deterministic equations are content to carry a prey population
        through 0.01 of an individual and out the other side. This lab pins any population below half an
        individual to zero — try the "Cycles that crash" preset to see what that changes.</p>`
    },

    paradoxEnrichment: {
      title: 'The paradox of enrichment',
      body: `
        <p><strong>Making the environment richer can make the community less stable.</strong> Raise the prey's
        carrying capacity K, change nothing else, and a settled predator–prey pair begins to oscillate — with
        swings deep enough that a real population would go extinct in a trough.</p>
        <p>The threshold is exact: the equilibrium is stable while
        <code>K &lt; 2N* + 1/(a·h)</code>, and unstable above it. The panel beside the phase plane evaluates
        that comparison for your current settings.</p>
        <p><strong>The mechanism</strong> is in the prey nullcline, which is a hump once the predator saturates.
        Enrichment moves the hump's peak to the right while N* — a predator property — stays exactly where it
        was. Eventually the predator's vertical nullcline crosses the hump on its <em>rising</em> side, and a
        crossing on a rising stretch is destabilising.</p>
        <p>Rosenzweig named this in 1971, and it remains a real warning for management: fertilising a lake or
        feeding a prey population to help a threatened predator can push the pair into oscillations that kill
        both. It is also why the result is called a paradox — more food, less persistence.</p>`
    },

    // ---------- Keystone Room ----------

    keystonePresets: {
      title: 'The four presets',
      body: `
        <p>The first two are the same community twice, and are meant to be run one after the other.</p>
        <ul>
          <li><strong>Keystone predation</strong> — A would exclude B, but the predator eats A hardest and all
          three species persist.</li>
          <li><strong>Remove the keystone</strong> — identical parameters, predator switched off. B disappears.
          This pair is Paine's removal experiment.</li>
          <li><strong>Apparent competition</strong> — both competition coefficients set to <em>zero</em>, so the
          two species do not compete for anything. One still eliminates the other, entirely through the shared
          predator.</li>
          <li><strong>Eating the wrong one</strong> — the predator prefers the species that was already losing.
          Nothing is rescued; the loser simply goes sooner.</li>
        </ul>
        <p>The useful habit is to look at the <em>Outcome</em> panel before pressing Run. Both outcomes — with
        the predator and without it — are computable from the parameters, and the panel shows them side by
        side.</p>`
    },

    predatorToggle: {
      title: 'Switching the predator on and off',
      body: `
        <p>With the predator <strong>absent</strong>, this room is exactly the Neighbours Room: two competitors
        and nothing else. With it <strong>present</strong>, the same two competitors also get eaten.</p>
        <p>The predator's sliders stay live either way, so the natural workflow is to set the predator up while
        it is switched off, note what competition alone would do, then let it in and run again.</p>
        <p>You do not have to toggle it to see the comparison, though: every run with a predator also simulates
        the same community without one and draws it as pale dashed lines. The removal experiment is always on
        screen.</p>`
    },

    preference: {
      title: 'The two attack rates — which competitor the predator prefers',
      body: `
        <p><strong>a<sub>A</sub> and a<sub>B</sub> are how hard the predator presses on each competitor.</strong>
        They are the only genuinely new parameters in this room, and almost everything it demonstrates is
        controlled by which of the two is larger.</p>
        <p>A predator that eats the <strong>dominant</strong> competitor hardest holds that species down and
        leaves room for its rival: a competitive exclusion becomes a coexistence. A predator that eats the
        <strong>subordinate</strong> competitor hardest just finishes off a species that was losing anyway.</p>
        <p>Setting one attack rate to <strong>zero</strong> makes the predator a specialist that ignores the
        other competitor entirely — worth trying, because a specialist on the dominant competitor is the purest
        keystone there is.</p>
        <p><strong>An important asymmetry:</strong> being the preferred prey is bad for an individual and can be
        good for a species. The species the predator concentrates on is often the one that would have
        monopolised the habitat, and holding it back is what keeps everything else present.</p>`
    },

    keystoneOutcomes: {
      title: 'What a predator can do to a competition',
      body: `
        <p>The panel compares two outcomes — the competition with the predator, and the same competition without
        it — and names the difference.</p>
        <ul>
          <li><strong>Keystone predation</strong> — exclusion becomes coexistence. The predator is holding the
          dominant competitor below the level at which it would take everything.</li>
          <li><strong>Apparent competition</strong> — species that do not compete at all still exclude one
          another, because each feeds predators that eat the other.</li>
          <li><strong>Reversal</strong> — the winner changes sides. Competitive ability and resistance to
          predation are separate traits, and nothing obliges one species to have both.</li>
          <li><strong>No change</strong> — a predator is not automatically a keystone. If it presses hardest on
          the species that was already losing, it reduces the community without reorganising it.</li>
        </ul>
        <p><strong>Why the term "keystone" is worth taking literally.</strong> Robert Paine removed
        <em>Pisaster</em> starfish from a patch of Washington shoreline in 1966 and returned to find mussels had
        taken the whole rock: the species count fell from fifteen to eight. The starfish was not a large part of
        that community by biomass. It was the part holding the arch up.</p>`
    },

    shiftingIsoclines: {
      title: 'Isoclines that move as the predator builds up',
      body: `
        <p>This is the Neighbours Room's phase plane with one addition: predation. Competitor A's zero-growth
        isocline still runs from (K<sub>A</sub>, 0) to (0, K<sub>A</sub>/α<sub>AB</sub>) — but K<sub>A</sub> is
        replaced by an <em>effective</em> carrying capacity,
        <code>K<sub>A</sub>(1 − a<sub>A</sub>P/r<sub>A</sub>)</code>, which shrinks as predators accumulate.</p>
        <p>So each species' isocline slides toward the origin, and — this is the whole point — <strong>they
        slide at different speeds</strong>, in proportion to a/r. The pale dashed lines show where the isoclines
        sat with no predator; the solid ones show where they sit at the predator density of the moment you are
        looking at.</p>
        <p><strong>Drag the History Scrubber slowly through the start of a keystone run.</strong> At first A's
        isocline lies entirely outside B's, which is what "A excludes B" looks like. As the predator builds up,
        A's line sweeps inward faster than B's, the two cross, and a stable interior equilibrium appears where
        there was none. You are watching coexistence being created.</p>
        <p>The arrows show which way the competitors are pushed <em>at this predator density</em>. They are a
        snapshot, not the whole story — the real system is three-dimensional, and this plane is a shadow of
        it.</p>`
    },

    keystoneInvasion: {
      title: 'Invasion criteria, with a predator in the room',
      body: `
        <p>The same question as in the Neighbours Room — <em>can this species increase when it is rare?</em> —
        asked twice, because the world it has to invade may or may not contain a predator.</p>
        <p><strong>Without the predator</strong> the criterion is the familiar
        <code>K<sub>A</sub> &gt; α<sub>AB</sub>K<sub>B</sub></code>.</p>
        <p><strong>With the predator</strong> the resident competitor is no longer sitting at its own K: it has
        been pushed down to N* = m/(e·a), the density at which it just feeds the predator, and there are P*
        predators waiting. So the invader's growth rate when rare is
        <code>r<sub>i</sub>(1 − α<sub>ij</sub>N<sub>j</sub>*/K<sub>i</sub>) − a<sub>i</sub>P<sub>j</sub>*</code>.</p>
        <p>The predator appears twice in that expression and pulls in opposite directions: it <em>helps</em> the
        invader by suppressing the resident, and it <em>hurts</em> the invader by eating it. Keystone predation
        is simply the case where the first effect is the larger — which happens when the predator prefers the
        resident.</p>
        <p><strong>The table</strong> shows what a world containing only one competitor and the predator looks
        like. When the two species do not compete directly, the one that supports the higher predator density
        wins: the mirror image of the R* rule from the Coexistence Room. There, the winner depresses the
        resource below what its rival needs; here, it raises the predator above what its rival can survive.</p>`
    },

    tolerance: {
      title: 'How much predation each competitor can stand',
      body: `
        <p>Each line is one competitor's per-capita growth rate when it is <em>rare</em> — no crowding, no
        competitor — plotted against how many predators there are. It starts at r and falls with slope a.</p>
        <p>Where a line crosses zero is that species' limit: <code>P = r/a</code> predators, beyond which it
        cannot grow even in an empty habitat. A species with a high growth rate and a low attack rate tolerates a
        great deal of predation; one with the reverse tolerates very little.</p>
        <p>The vertical marks show the predator density each competitor supports <em>on its own</em>. Read them
        together with the crossing points and the outcome falls out: if the predator density species A supports
        lies beyond species B's zero crossing, then a world containing A and the predator is a world B cannot
        break into — regardless of whether A and B compete for anything at all.</p>`
    },

    dietShare: {
      title: "The predator's plate",
      body: `
        <p>What fraction of the predator's intake comes from each competitor, moment by moment. The predator
        takes <code>a<sub>A</sub>N<sub>A</sub></code> from A and <code>a<sub>B</sub>N<sub>B</sub></code> from B,
        so the share depends both on its preferences and on how abundant each species currently is.</p>
        <p><strong>What to look for.</strong> In a keystone run the plate is heavily weighted towards the
        dominant competitor and stays that way: that lopsidedness <em>is</em> the mechanism, and the moment it
        evens out the keystone effect disappears.</p>
        <p>Watch the early part of a run too. The share shifts as the two competitors' abundances change, so a
        predator's realised diet is not the same thing as its preference — a point that matters whenever diet
        data from the field is used to infer what a predator is doing to a community.</p>`
    },

    counterfactual: {
      title: 'The pale dashed lines',
      body: `
        <p>Every run in this room is simulated twice: once as you set it up, and once with the predator deleted
        from the community. The pale dashed lines are that second run — <strong>the same competitors, the same
        starting sizes, the same everything, with nothing eating them.</strong></p>
        <p>This is a removal experiment done properly, and it is something ecology can almost never have: the
        identical community, with and without the predator, observed side by side. In the field you can remove a
        predator, but you cannot also keep it and compare.</p>
        <p><strong>The gap between a solid line and its dashed twin is the predator's entire effect on that
        species</strong> — and in a keystone run the two gaps point in opposite directions. The preferred
        competitor ends up far below its dashed line; the other ends up far above it, existing where the
        counterfactual has it extinct.</p>`
    },

    // ---------- Glossary ----------
    // Short definitions for the words a first-time reader needs. These are
    // reached from the dotted-underlined terms in the room briefs and from the
    // list on the README page, and they deliberately stay short — the fuller
    // treatment of each idea lives in the room that demonstrates it.

    glosPopulation: {
      title: 'Population',
      body: `
        <p><strong>A group of individuals of the same species, in the same place, that could breed with one
        another.</strong> It is the unit this whole lab works in: not the individual, not the species, but the
        interbreeding group in a particular place.</p>
        <p>The choice matters more than it looks. Births, deaths and crowding are all things that happen to
        individuals, but "growth rate", "carrying capacity" and "extinction" are all properties of the
        population — and the two levels can disagree. In the Growth room a population with a healthy positive
        growth rate still goes extinct sometimes, because the average is not what any individual experiences.</p>`
    },

    glosPerCapita: {
      title: 'Per-capita rate',
      body: `
        <p><strong>Per individual, per unit of time.</strong> A per-capita birth rate of 0.5 means each
        individual produces half an offspring per time unit on average — so the whole population's growth is
        that rate multiplied by however many individuals there are.</p>
        <p>Nearly every disagreement in population biology becomes clearer when you ask whether a quantity is
        per-capita or total. A population of 10 000 growing by 100 individuals a year is growing much more
        slowly, per capita, than a population of 10 growing by 1 — and it is the per-capita rate that tells you
        what an individual's prospects are.</p>
        <p><strong>Where to see it:</strong> the "per-capita growth rate vs. density" panel appears in both the
        Growth and Crowding rooms, plotting exactly this quantity. Flat in one, falling in the other — and that
        difference is the entire subject of the lab's first half.</p>`
    },

    glosDensityDependence: {
      title: 'Density dependence',
      body: `
        <p><strong>A rate that changes with how crowded the population is.</strong> If the per-capita birth rate
        falls, or the per-capita death rate rises, as numbers go up, the population is density-dependent —
        it is being held back by its own abundance.</p>
        <p><strong>Density-independent</strong> means the opposite: an individual does equally well at any
        density. Weather is the classic example — a frost kills the same <em>proportion</em> of a population
        whether it is crowded or sparse.</p>
        <p>Only density dependence can regulate a population, because only it can push back harder when numbers
        rise. It is what turns exponential growth into a curve that levels off, and it is the mechanism the
        Crowding room installs and the Overshoot room delays. Delaying it is the important twist: density
        dependence that arrives one generation late can destabilise the very population it would otherwise
        hold steady.</p>`
    },

    glosEquilibrium: {
      title: 'Equilibrium',
      body: `
        <p><strong>A state in which nothing is changing</strong> — every population in the system has births
        exactly balancing deaths, so if left alone it stays put. Equilibria are found by setting the rate of
        change to zero and solving, which is why they can usually be written down without simulating anything.</p>
        <p>The useful question is never whether an equilibrium exists but whether it <strong>attracts</strong>:</p>
        <ul>
          <li><strong>Stable</strong> — nudge the system and it comes back. Carrying capacity in the Crowding
          room is stable, approached from above and below alike.</li>
          <li><strong>Unstable</strong> — nudge it and it leaves for good. The Allee threshold is unstable, and
          so is the interior equilibrium under founder control.</li>
          <li><strong>Neutral</strong> — nudge it and it neither returns nor departs, but stays wherever the
          nudge left it. The classic predator–prey model is like this, and it is the reason that model cannot
          be taken literally.</li>
        </ul>
        <p>An equilibrium that repels is still worth computing: in the Predator room it is what the populations
        cycle <em>around</em>.</p>`
    },

    glosCompetitionKinds: {
      title: 'Intraspecific vs. interspecific competition',
      body: `
        <p><strong>Intraspecific</strong> competition is between members of the <em>same</em> species —
        individuals of one population getting in each other's way. It is what the Crowding room is about, and it
        is the only thing that can produce a carrying capacity for a species on its own.</p>
        <p><strong>Interspecific</strong> competition is between members of <em>different</em> species, for
        something both of them need. The Neighbours room measures it with a coefficient; the Coexistence room
        makes it happen for a reason, by giving the two species the same food.</p>
        <p><strong>Why the distinction carries the whole theory of coexistence.</strong> Two species can live
        together indefinitely when each limits <em>itself</em> more than it limits the other — that is,
        when intraspecific competition is stronger than interspecific. When the reverse is true, whichever
        species is commoner suppresses its rival harder than it suppresses itself, and the outcome is
        exclusion. Every coexistence result in this lab is a version of that one sentence.</p>`
    },

    glosPhasePlane: {
      title: 'Phase plane',
      body: `
        <p><strong>A graph with one species' abundance on each axis and no time axis at all.</strong> A whole
        run becomes a single curve, showing which combinations of abundances the community passed through,
        with an arrow of time implied by the direction of travel.</p>
        <p>It takes some getting used to, and it is worth the effort: questions that are hard to see in a time
        series are obvious here. Whether two species coexist becomes a question about where two lines cross;
        whether a cycle is permanent becomes a question about whether the curve closes on itself.</p>
        <p><strong>Where to see it:</strong> the Neighbours, Predator and Keystone rooms all draw one, and in
        each you can click anywhere on it to restart the run from that pair of abundances. Doing that a few
        times teaches more about the model than any single run.</p>`
    },

    glosNullcline: {
      title: 'Isocline (nullcline)',
      body: `
        <p><strong>The set of points on a phase plane at which one species stops changing.</strong> The two
        words mean the same thing here; "zero-growth isocline" is the fuller name, and ecologists use both.</p>
        <p>A species grows on one side of its own isocline and shrinks on the other, so the isoclines cut the
        plane into regions with different behaviour. Where two isoclines <strong>cross</strong>, both species
        are stationary at once — that is an equilibrium, and the way the lines are arranged around it decides
        whether it attracts.</p>
        <p>This is the payoff of the phase plane: once you can read the arrangement of two straight lines, you
        can predict the outcome of a competition without running anything. In the Keystone room the isoclines
        also <em>move</em> as the predator builds up, and watching them slide past each other is the clearest
        view in the lab of a community being reorganised.</p>`
    },

    glosLimitCycle: {
      title: 'Limit cycle',
      body: `
        <p><strong>A closed loop that the system settles onto</strong> — a permanent oscillation whose size is
        a property of the parameters rather than of where the run began. Start anywhere nearby and you end up
        on the same loop.</p>
        <p>Contrast it with the <em>neutral</em> cycles of the classic predator–prey model, where every
        starting point has its own orbit and nothing ever converges. The difference is the difference between a
        population that oscillates because that is what those species do, and one that oscillates because of
        something that happened to it once — and only the first is a proper explanation of a real cycling
        population.</p>
        <p><strong>Where to see it:</strong> the Predator room's third model, where enriching the prey's
        environment destabilises the equilibrium and the community settles onto a large cycle instead.</p>`
    },

    glosTrophicCascade: {
      title: 'Trophic cascade',
      body: `
        <p><strong>An effect that travels down a food chain and changes a level the predator never touches.</strong>
        Wolves suppress deer, the deer stop over-browsing, and the willows recover. The wolves and the willows
        never interact; the effect is real, and often large.</p>
        <p>The general form is an alternation of signs. A predator's effect on its prey is direct and negative;
        its effect on whatever the prey eats is indirect and <em>positive</em>; the level below that is negative
        again. Adding or removing one level therefore flips the sign of everything under it, which is why
        removing a top predator so seldom leaves the rest of the community where it was. The idea that the
        world is green <em>because</em> predators hold herbivores down — Hairston, Smith and Slobodkin's
        argument of 1960 — is this pattern read from the top.</p>
        <p><strong>Where to see the ingredients here.</strong> No single room runs a full three-level chain, but
        the parts are in two of them. In the Predator room's second model, enriching the level below the prey —
        raising K — adds predators and leaves prey abundance exactly where it was: the extra production passes
        straight through to the top rather than accumulating where it was added. In the Keystone room a predator
        decides which competitor survives without competing with either of them, which is the same logic of an
        effect travelling through a community along a path nobody walks directly.</p>
        <p><strong>Not the same thing:</strong> <em>apparent competition</em>, also in the Keystone room, is an
        indirect effect <em>within</em> one trophic level, transmitted through a predator above it. A cascade
        runs between levels; apparent competition runs sideways.</p>`
    },

    glosNiche: {
      title: 'Niche',
      body: `
        <p><strong>The set of conditions and resources under which a population can persist</strong> — where its
        growth rate is not negative. Hutchinson's version is the one to carry: a niche is a volume in a space
        with an axis for every relevant variable, so it is not a place but a <em>requirement</em>. A species'
        niche is a list of what it needs and what it can tolerate.</p>
        <p>Two versions matter and are easily confused:</p>
        <ul>
          <li>The <strong>fundamental</strong> niche is what a species could occupy with no enemies and no
          rivals — physiology alone.</li>
          <li>The <strong>realised</strong> niche is what is left once competitors and predators have had their
          say. It is usually smaller, and it is what you actually observe in the field, which is why a species
          found only in one place is not evidence that it needs that place.</li>
        </ul>
        <p><strong>Why the lab keeps arriving at it.</strong> Two species with identical niches cannot coexist —
        that is competitive exclusion restated, and the whole of the Coexistence room's one-resource mode. What
        makes coexistence possible is a <em>niche difference</em>: each species being held back mainly by
        something the other is less affected by, so whichever becomes common limits itself first. That is the
        mechanistic content of the Neighbours room's α &lt; 1, and in the Coexistence room's two-resource mode
        you can watch it work — each species limited by the resource it is better at using, the two break-even
        lines crossing rather than nesting.</p>
        <p><strong>An axis worth remembering:</strong> the Keystone room shows that a niche is not only about
        food. Two competitors that eat exactly the same thing can still differ in how well they withstand a
        predator, and that difference alone is enough to keep both present. Enemies are a niche axis too.</p>`
    }
  };

  // ------------------------------------------------------------------ modal

  const overlay = document.createElement('div');
  overlay.className = 'help-overlay';
  overlay.innerHTML = `
    <div class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
      <div class="help-dialog-head">
        <h2 id="helpTitle"></h2>
        <button class="help-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="help-dialog-body"></div>
    </div>`;

  function mount() {
    if (!overlay.parentNode) document.body.appendChild(overlay);
  }

  let lastTrigger = null;
  const titleEl = () => overlay.querySelector('#helpTitle');
  const bodyEl = () => overlay.querySelector('.help-dialog-body');
  const closeBtn = () => overlay.querySelector('.help-close');

  function openHelp(id, trigger) {
    const topic = HELP_TOPICS[id];
    if (!topic) return;
    mount();
    titleEl().textContent = topic.title;
    bodyEl().innerHTML = topic.body;
    overlay.classList.add('open');
    lastTrigger = trigger || null;
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
    // Glossary terms are spans, so they need their own keyboard activation.
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList
        && e.target.classList.contains('gloss')) {
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

  // Give every help button and glossary term an accessible name from its topic
  // title. Runs for elements present at load and for any added later by a room's
  // render code. Glossary terms are plain spans, so they also need to be made
  // focusable and announced as buttons.
  function labelButtons(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.gloss').forEach(el => {
      const topic = HELP_TOPICS[el.dataset.help];
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      if (topic) el.setAttribute('title', topic.title);
    });
    scope.querySelectorAll('.help-btn:not([aria-label])').forEach(btn => {
      const topic = HELP_TOPICS[btn.dataset.help];
      btn.setAttribute('type', 'button');
      btn.setAttribute('aria-label', topic ? `Help: ${topic.title}` : 'Help');
      if (topic) btn.setAttribute('title', topic.title);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    mount();
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
