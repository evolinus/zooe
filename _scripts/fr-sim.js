/*
  Background branching simulation for the homepage.

  Same model as the Branching room of the Evolutionary Laboratories, laid out
  horizontally: generations run left to right, the five lineages spread top to
  bottom. It reuses that room's shapes engine (teaching/evolutionary-laboratories/
  js/shapes-engine.js) rather than reimplementing it, so the shapes mutate by
  exactly the same rules.

  Settings match the room's controls: 20 ms per generation, the default split
  generations (40%, 70% and 90% of the run) and mutation size 2.

  It is decoration: no controls, no text, and it stops when off screen or when
  the visitor asks for reduced motion.
*/

const frSim = () => {
  const canvas = document.querySelector("[data-fr-sim]");
  if (!canvas) return;

  // the shapes engine ships with the simulations; without it, draw nothing
  if (typeof SHAPES === "undefined" || typeof freshAncestor !== "function") return;

  const SHAPE = "polygon";
  const N = 500;                                  // generations per run
  const SPEED_MS = 20;                            // the room's speed control
  const MUT = 2;                                  // the room's mutation size
  const SIGMA = 0.005 + (MUT / 50) * 0.12;        // as the room maps that dial
  const SPLIT = { s2: Math.round(N * 0.4), s3: Math.round(N * 0.7), s4: Math.round(N * 0.9) };
  // generations a split takes to fan out — capped so the last split (s4) still
  // completes before the run ends; otherwise its two leaves (H, I) stop partway
  // to their lanes and end up closer together than the rest
  const TRANS = Math.min(Math.round(N * 0.16), N - SPLIT.s4);
  const HOLD_MS = 1600;                           // pause on the finished tree before restarting

  // the room's topology: five leaves (C, D, G, H, I) off four internal branches
  const laneD = 0, laneH = 1, laneI = 2, laneG = 3, laneC = 4;
  const laneF = (laneH + laneI) / 2;
  const laneE = (laneF + laneG) / 2;
  const laneB = (laneD + laneE) / 2;
  const laneA = (laneB + laneC) / 2;
  const LANES = 4;

  const DEFS = [
    { id: "A", parent: null, start: 0,         end: 0,         lane: laneA },
    { id: "B", parent: "A",  start: 0,         end: SPLIT.s2,  lane: laneB },
    { id: "C", parent: "A",  start: 0,         end: N,         lane: laneC },
    { id: "D", parent: "B",  start: SPLIT.s2,  end: N,         lane: laneD },
    { id: "E", parent: "B",  start: SPLIT.s2,  end: SPLIT.s3,  lane: laneE },
    { id: "F", parent: "E",  start: SPLIT.s3,  end: SPLIT.s4,  lane: laneF },
    { id: "G", parent: "E",  start: SPLIT.s3,  end: N,         lane: laneG },
    { id: "H", parent: "F",  start: SPLIT.s4,  end: N,         lane: laneH },
    { id: "I", parent: "F",  start: SPLIT.s4,  end: N,         lane: laneI },
  ];
  const byId = Object.fromEntries(DEFS.map((d) => [d.id, d]));

  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  let genomes = {};       // id -> current genome
  let birth = {};         // id -> the genome it started from, kept for the tree
  let g = 0;              // generation reached
  let timer = null, holdUntil = 0, running = false;

  const css = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  const size = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // geometry: generations across, lineages down. the lanes use only the middle
  // band of the canvas — the tree stays a quiet texture rather than a diagram
  // the right inset is wider: the last generation's shape is drawn there and
  // would otherwise hang over the edge
  const padX = 18, padRight = 44, SPREAD = 0.9;
  const x = (gen) => padX + (gen / N) * (W - padX - padRight);

  // the shape is drawn centred on its lane, so the first and last lanes have to
  // sit at least half a shape inside the canvas or their tops get cut off
  const glyphFor = () => Math.min(51, Math.max(30, (H * SPREAD) / 3.4));
  const yLane = (lane) => {
    const inset = glyphFor() / 2 + 4;
    return inset + (lane / LANES) * (H - inset * 2);
  };
  const ease = (t) => t * t * (3 - 2 * t);

  // a lineage leaves its parent's lane and eases into its own
  const y = (node, gen) => {
    if (!node.parent) return yLane(node.lane);
    const from = yLane(byId[node.parent].lane);
    const to = yLane(node.lane);
    const t = Math.min(1, Math.max(0, (gen - node.start) / TRANS));
    return from + (to - from) * ease(t);
  };

  const livingAt = (gen) =>
    DEFS.filter((d) => d.parent !== null && gen >= d.start && gen <= d.end);

  const reset = () => {
    g = 0;
    genomes = { A: freshAncestor(SHAPE) };
    birth = {};
  };

  const step = () => {
    g++;
    for (const d of livingAt(g)) {
      // a new lineage starts from its parent's genome, then goes its own way
      if (!genomes[d.id]) {
        genomes[d.id] = { ...genomes[d.parent] };
        birth[d.id] = genomes[d.id];
      }
      genomes[d.id] = mutate(genomes[d.id], SIGMA, SHAPE);
    }
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);

    // branches: light grey, curved where a lineage fans out from its parent
    ctx.strokeStyle = css("--gray", "#A2947C");
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.25;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // a branch stops short of the shapes at either end, so the line meets the
    // shape rather than running through it
    const glyph = glyphFor();
    const perGen = (W - padX - padRight) / N;
    const gapBirth = Math.ceil((glyph * 0.6) / perGen);
    const gapTip = Math.ceil((glyph * 0.6) / perGen);

    for (const d of DEFS) {
      if (d.parent === null || g < d.start) continue;
      const reached = Math.min(g, d.end);
      const first = d.start + gapBirth;
      // living lineages end at their own shape; ended ones at their children's
      const last = reached - (g <= d.end ? gapTip : gapBirth);
      if (last <= first) continue;
      ctx.beginPath();
      ctx.moveTo(x(first), y(d, first));
      for (let gen = first + 1; gen <= last; gen++) ctx.lineTo(x(gen), y(d, gen));
      ctx.stroke();
    }

    // a fainter shape where each lineage split away from its parent, so the
    // tree carries its history rather than only its leading edge. same size as
    // the living ones — only the opacity sets them back
    ctx.globalAlpha = 0.28;
    for (const d of DEFS) {
      const born = birth[d.id];
      if (!born || g < d.start) continue;
      ctx.save();
      ctx.translate(x(d.start), y(d, d.start));
      const s = glyph / (SHAPES[SHAPE].extent || 210);
      ctx.scale(s, s);
      SHAPES[SHAPE].draw(ctx, born);
      ctx.restore();
    }

    // and the shapes themselves, at the leading tip of each living lineage
    ctx.globalAlpha = 0.5;
    for (const d of livingAt(g)) {
      const genome = genomes[d.id];
      if (!genome) continue;
      ctx.save();
      ctx.translate(x(Math.min(g, d.end)), y(d, Math.min(g, d.end)));
      const s = glyph / (SHAPES[SHAPE].extent || 210);
      ctx.scale(s, s);
      SHAPES[SHAPE].draw(ctx, genome);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  const tick = () => {
    const now = performance.now();
    if (holdUntil) {
      if (now < holdUntil) return;
      holdUntil = 0;
      reset();
    }
    step();
    draw();
    if (g >= N) holdUntil = now + HOLD_MS;
  };

  const start = () => {
    if (running) return;
    running = true;
    timer = setInterval(tick, SPEED_MS);
  };
  const stop = () => {
    running = false;
    clearInterval(timer);
  };

  size();
  reset();
  draw();

  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  const staticTree = () => {
    // no animation: run the whole thing once, quietly, and leave it there
    stop();
    reset();
    while (g < N) step();
    draw();
  };

  if (still.matches) {
    staticTree();
  } else if ("IntersectionObserver" in window) {
    // a background animation should not burn cycles once it is scrolled past
    new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
      { rootMargin: "120px" }
    ).observe(canvas);
  } else {
    start();
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      size();
      draw();
    }, 150);
  });
};

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", frSim);
else frSim();
