  // The Fate Room — what happens to ONE new mutation.
  //
  // The room runs an ordinary haploid Wright-Fisher model, but it is deliberately
  // arranged the other way round from the Drift Room: instead of starting at
  // p = 0.5 and asking where the frequency wanders, it starts at p = 1/N — a
  // single mutant individual — and asks whether that mutant ever becomes the
  // whole population.
  //
  // Two populations are shown side by side, one where the mutation is lost and
  // one where it survives. Those two are NOT a fair sample, and the room says so
  // out loud: a whole batch of independent populations is simulated first, the
  // true loss/survival tally is reported, and only then are one loser and one
  // winner pulled out of the batch to display. Without that counter, two equal
  // panels would teach a 50/50 outcome when the real answer is 1/N.
  (function () {
    // Fills {placeholders} in an English template string.

    const C = {
      ink: '#262220', inkSoft: '#6b6258', rule: '#cabfa8', paper: '#EDE6D6',
      stamp: '#C08A2E', accent: '#6E7B3F',
      pop: ['#3D6E6E', '#A8442A']   // Population 1, Population 2 — identity, not outcome
    };

    let currentShape = 'polygon';
    let N = 20;
    // Fixed, not dials: this room is about the fate of one mutation, so the size
    // of that mutation and the pace of the run are the same in every visit.
    const mutSigmaFrac = 0.005 + (3 / 10) * 0.12;
    const speedMs = 100;

    let ancestor = freshAncestor(currentShape);
    let mutant = null;
    let batch = null;            // { total, losses, fixations, runs:[runA, runB] }
    let gen = 0, maxG = 0, playing = false, timer = null;
    let runToken = 0;            // invalidates a start still waiting on a scroll

    const el = (id) => document.getElementById(id + '_fate');
    const shapeSeg = el('shapeSeg'), nSeg = el('nSeg');
    const mutateBtn = el('mutateBtn'), simBtn = el('simBtn'), resetBtn = el('resetBtn');
    const statusLine = el('statusLine');
    const ancCvs = el('ancCanvas'), mutCvs = el('mutCanvas'), ovlCvs = el('ovlCanvas');
    const mutSummary = el('mutSummary');
    const oddsBox = el('odds');
    const chartCvs = el('chart');
    const readingText = el('readingText');
    const panels = [
      { wrap: el('pop0Wrap'), cvs: el('pop0Canvas'), stat: el('pop0Stat') },
      { wrap: el('pop1Wrap'), cvs: el('pop1Canvas'), stat: el('pop1Stat') }
    ];

    // ---------------------------------------------------------------- model

    // One population, followed from a single mutant until the mutation is gone
    // or is all that is left. Both are absorbing, so the loop always ends.
    function runOnePopulation(n) {
      const hist = [1 / n];
      let k = 1;
      while (k > 0 && k < n) {
        let next = 0;
        for (let i = 0; i < n; i++) if (Math.random() < k / n) next++;
        k = next;
        hist.push(k / n);
      }
      return { hist, fixed: k === n, gens: hist.length - 1 };
    }

    // A batch big enough that the survival tally is worth quoting: 20N runs gives
    // roughly twenty survivors whatever N is, since each one survives with
    // probability 1/N. If the batch happened to produce none, keep going — the
    // room needs one survivor to show, and the honest total goes up with it.
    //
    // Twenty rather than a handful because the room reports the ratio
    // total/survivors, and that ratio is biased upwards when the denominator is
    // both small and random: averaged over batches it overstates the rarity by
    // roughly one part in (number of survivors). At five survivors that is a 20%
    // exaggeration, in the one room that cannot afford to exaggerate this. Twenty
    // brings it to a few per cent, and a batch still costs a couple of
    // milliseconds at the largest N on offer.
    function runBatch(n) {
      const target = Math.max(200, 20 * n);
      let losses = 0, fixations = 0, total = 0;
      let aLoss = null, aFix = null;
      while (total < target || !aFix) {
        const r = runOnePopulation(n);
        total++;
        if (r.fixed) { fixations++; if (!aFix) aFix = r; }
        else { losses++; if (!aLoss) aLoss = r; }
        if (total > 200000) break;      // guard; unreachable for the offered N
      }
      // Which panel gets the survivor is a coin flip, so a reader cannot learn
      // "the left one always wins" and stop watching the shapes.
      const runs = Math.random() < 0.5 ? [aLoss, aFix] : [aFix, aLoss];
      return { total, losses, fixations, runs };
    }

    // ------------------------------------------------------------- drawing

    // Both the population grid and the chart's axis icons need the same two
    // shapes at whatever pixel size the layout ended up giving them, so each is
    // rendered once into an offscreen canvas and then blitted.
    //
    // Keyed by size, because two different sizes are live at once — the grid's
    // cell and the chart's 34-odd-pixel axis icon — and a single-slot cache would
    // just be re-rendered by whichever asked last, every tick.
    let spriteCache = {};
    function sprites(size) {
      if (!spriteCache[size]) {
        spriteCache[size] = {
          anc: renderSprite(ancestor, size),
          mut: mutant ? renderSprite(mutant, size) : null
        };
      }
      return spriteCache[size];
    }
    function renderSprite(genome, size) {
      const c = document.createElement('canvas');
      const x = c.getContext('2d');
      scaleCanvas(c, x, size, size);
      drawGenome(x, size, size, genome, currentShape);
      return c;
    }
    function clearSprites() { spriteCache = {}; }

    function gridShape(n) {
      const cols = n <= 12 ? 4 : n <= 20 ? 5 : 10;
      return { cols, rows: Math.ceil(n / cols) };
    }

    // The three step-1 canvases: the shape before, the shape after, and the two
    // superimposed so the change cannot be missed.
    function drawStep1(attempt) {
      const box = ancCvs.parentElement.getBoundingClientRect();
      if (Math.round(box.width) <= 8) {
        if ((attempt || 0) < 12) requestAnimationFrame(() => drawStep1((attempt || 0) + 1));
        return;
      }
      [[ancCvs, (ctx, s) => drawGenome(ctx, s, s, ancestor, currentShape)],
       [mutCvs, (ctx, s) => { if (mutant) drawGenome(ctx, s, s, mutant, currentShape); }],
       [ovlCvs, (ctx, s) => {
         ctx.clearRect(0, 0, s, s);
         ctx.save(); ctx.globalAlpha = 0.28;
         drawGenomeNoClear(ctx, s, ancestor);
         ctx.restore();
         if (mutant) drawGenomeNoClear(ctx, s, mutant);
       }]
      ].forEach(([cvs, draw]) => {
        cvs.style.width = ''; cvs.style.height = '';
        const s = Math.round(cvs.getBoundingClientRect().width);
        if (s <= 8) return;
        const ctx = cvs.getContext('2d');
        scaleCanvas(cvs, ctx, s, s);
        ctx.clearRect(0, 0, s, s);
        draw(ctx, s);
      });
    }

    // drawGenome() clears first, which the overlay cannot afford — it has to put
    // two shapes in the same box.
    function drawGenomeNoClear(ctx, size, genome) {
      ctx.save();
      ctx.translate(size / 2, size / 2);
      const scale = size / (SHAPES[currentShape].extent || 190);
      ctx.scale(scale, scale);
      SHAPES[currentShape].draw(ctx, genome);
      ctx.restore();
    }

    // One population: N individuals, the mutants ringed in gold. Which cells hold
    // the mutants is redrawn at random every generation, which is what the model
    // actually says — the next generation is a fresh sample, not the same
    // individuals moved around.
    function drawPopulation(panel, freq, outcome) {
      const cvs = panel.cvs;
      const w = Math.round(panel.wrap.getBoundingClientRect().width);
      const h = Math.round(panel.wrap.getBoundingClientRect().height);
      if (w <= 8 || h <= 8) return;
      const ctx = cvs.getContext('2d');
      scaleCanvas(cvs, ctx, w, h);
      ctx.clearRect(0, 0, w, h);

      const { cols, rows } = gridShape(N);
      const pad = 8;
      // The outcome stamp always gets its own band at the bottom, whether or not
      // one is showing yet, so the grid never jumps when the run ends and the
      // stamp never lands on top of an individual.
      const stampBand = 30;
      const cell = Math.floor(Math.min((w - pad * 2) / cols, (h - pad * 2 - stampBand) / rows));
      const gridW = cell * cols, gridH = cell * rows;
      const x0 = (w - gridW) / 2, y0 = pad + (h - pad * 2 - stampBand - gridH) / 2;
      const spriteSize = Math.max(12, cell - 6);
      const sp = sprites(spriteSize);

      const k = Math.round(freq * N);
      const isMut = new Array(N).fill(false);
      const idx = [];
      for (let i = 0; i < N; i++) idx.push(i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      for (let i = 0; i < k; i++) isMut[idx[i]] = true;

      for (let i = 0; i < N; i++) {
        const cx = x0 + (i % cols) * cell, cy = y0 + Math.floor(i / cols) * cell;
        const img = isMut[i] && sp.mut ? sp.mut : sp.anc;
        if (isMut[i]) {
          ctx.save();
          ctx.strokeStyle = C.stamp;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx + cell / 2, cy + cell / 2, cell / 2 - 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        ctx.drawImage(img, cx + (cell - spriteSize) / 2, cy + (cell - spriteSize) / 2, spriteSize, spriteSize);
      }

      if (outcome) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold 15px ui-monospace, monospace';
        const label = outcome === 'fixed'
          ? T('fate.stampFixed', 'MUTATION SURVIVED')
          : T('fate.stampLost', 'MUTATION LOST');
        const tw = ctx.measureText(label).width;
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = C.paper;
        ctx.fillRect(w / 2 - tw / 2 - 12, h - 34, tw + 24, 24);
        ctx.strokeStyle = outcome === 'fixed' ? C.stamp : C.inkSoft;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(w / 2 - tw / 2 - 12, h - 34, tw + 24, 24);
        ctx.globalAlpha = 1;
        ctx.fillStyle = outcome === 'fixed' ? C.stamp : C.inkSoft;
        ctx.fillText(label, w / 2, h - 17);
        ctx.restore();
      }
    }

    // The frequency chart. The y axis is the whole point of the room, so it is
    // labelled with the two shapes themselves: the ancestral form sits at 0, the
    // mutant at 1, and everything in between is a population that carries both.
    function drawChart() {
      const H = 300;
      const box = chartCvs.parentElement.getBoundingClientRect();
      const W = Math.round(box.width);
      if (W <= 8) return;
      const ctx = chartCvs.getContext('2d');
      scaleCanvas(chartCvs, ctx, W, H);
      ctx.clearRect(0, 0, W, H);

      // Left gutter, in three lanes so nothing overlaps: the rotated axis title,
      // then the two shapes that label what frequency 0 and frequency 1 mean,
      // then the numeric ticks right-aligned against the plot.
      const icon = 36, iconX = 26, tickRight = 26 + icon + 34;
      const padL = tickRight + 8, padR = 22, padT = 24, padB = 44;
      const graphW = W - padL - padR, graphH = H - padT - padB;
      const X = (g) => padL + (maxG ? (g / maxG) * graphW : 0);
      const Y = (f) => padT + graphH * (1 - f);

      ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      [0, 0.25, 0.5, 0.75, 1].forEach(v => {
        ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(W - padR, Y(v)); ctx.stroke();
        ctx.fillStyle = C.inkSoft;
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(v.toFixed(2), tickRight, Y(v) + 4);
      });
      ctx.setLineDash([]);

      // Where every mutation starts: 1/N, one individual out of N. The label goes
      // hard right, because at small N this line sits almost on top of the axis
      // and the losing trajectory is doing its business at the left-hand end.
      ctx.save();
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.25;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(padL, Y(1 / N)); ctx.lineTo(W - padR, Y(1 / N)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.accent;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      fillSci(ctx, T('fate.startLine', '1/<var>N</var> — where every new mutation starts'), W - padR, Y(1 / N) - 6);
      ctx.restore();

      // Axis icons: the ancestral shape at 0, the mutant at 1 — the room's whole
      // claim, that a frequency is a statement about which shape you would meet.
      const sp = sprites(icon);
      ctx.drawImage(sp.anc, iconX, Y(0) - icon / 2, icon, icon);
      if (sp.mut) ctx.drawImage(sp.mut, iconX, Y(1) - icon / 2, icon, icon);

      // x axis
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(W - padR, Y(0)); ctx.stroke();
      ctx.fillStyle = C.inkSoft;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      const ticks = Math.min(maxG, 8);
      for (let i = 0; i <= ticks; i++) {
        const g = Math.round((i / ticks) * maxG);
        ctx.fillText(String(g), X(g), Y(0) + 16);
      }
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = C.ink;
      ctx.fillText(T('fate.axisGen', 'Generation'), padL + graphW / 2, H - 10);

      ctx.save();
      ctx.translate(13, padT + graphH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = C.ink;
      ctx.font = '11px ui-monospace, monospace';
      fillSci(ctx, T('fate.axisFreq', 'Frequency of the mutation'), 0, 0);
      ctx.restore();

      if (!batch) return;

      batch.runs.forEach((run, i) => {
        const upto = Math.min(gen, run.gens);
        ctx.beginPath();
        for (let g = 0; g <= upto; g++) {
          const x = X(g), y = Y(run.hist[g]);
          if (g === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = C.pop[i];
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(X(upto), Y(run.hist[upto]), 4, 0, Math.PI * 2);
        ctx.fillStyle = C.pop[i];
        ctx.fill();

      });

      // A key rather than labels floating at the ends of the curves: a losing run
      // finishes within a generation or two, so its end sits in the same few
      // pixels as the axis, the 1/N line and the first x tick. The key also names
      // which panel above each colour belongs to, which the curves alone do not.
      ctx.save();
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'left';
      batch.runs.forEach((run, i) => {
        const y = padT + 12 + i * 16;
        ctx.fillStyle = C.pop[i];
        ctx.beginPath(); ctx.arc(padL + 14, y - 4, 4, 0, Math.PI * 2); ctx.fill();
        const done = gen >= run.gens;
        const lbl = !done
          ? T('fate.keyRunning', 'Population {p} — running', { p: i + 1 })
          : run.fixed
            ? T('fate.keyFixed', 'Population {p} — mutation survived, generation {g}', { p: i + 1, g: run.gens })
            : T('fate.keyLost', 'Population {p} — mutation lost, generation {g}', { p: i + 1, g: run.gens });
        ctx.fillText(lbl, padL + 24, y);
      });
      ctx.restore();
    }

    // ---------------------------------------------------------------- flow

    function redrawAll() {
      drawStep1();
      redrawSimulation();
    }

    // Steps 2 and 3 only. Step 1 does not change while a simulation runs, and
    // re-measuring those three canvases every generation would force a layout
    // reflow per tick for nothing.
    function redrawSimulation() {
      panels.forEach((p, i) => {
        if (!batch) { const ctx = p.cvs.getContext('2d'); ctx.clearRect(0, 0, p.cvs.width, p.cvs.height); return; }
        const run = batch.runs[i];
        const g = Math.min(gen, run.gens);
        drawPopulation(p, run.hist[g], g >= run.gens ? (run.fixed ? 'fixed' : 'lost') : null);
      });
      drawChart();
    }

    function setPanelStats() {
      panels.forEach((p, i) => {
        if (!batch) { p.stat.textContent = T('fate.awaiting', 'waiting'); return; }
        const run = batch.runs[i];
        const g = Math.min(gen, run.gens);
        const k = Math.round(run.hist[g] * N);
        p.stat.innerHTML = T('fate.popStat', 'gen {g} · {k} of {n} carry the mutation', { g, k, n: N });
      });
    }

    function stopPlaying() {
      playing = false;
      runToken++;
      clearInterval(timer);
      simBtn.textContent = T('fate.sim', '▶ Simulate evolution through time');
      simBtn.disabled = !mutant;
    }

    function tick() {
      if (gen >= maxG) { stopPlaying(); finishReading(); return; }
      gen++;
      setPanelStats();
      redrawSimulation();
      statusLine.textContent = T('fate.status', 'generation {g} / {max}', { g: gen, max: maxG });
      if (gen >= maxG) { stopPlaying(); finishReading(); }
    }

    // A run starts well below the fold: the deck is at the top of the room and
    // step 2 is three screens down. Bring it into view on the press, or the
    // first generations — the ones that decide most runs — go past unseen.
    // Prefer framing the tally as well; on a short window settle for the two
    // populations and the chart, which are the parts that have to be watched.
    function revealRun() {
      // The sticky tab bar covers the top of the window, so the usable band is
      // shorter than the viewport and everything has to be pushed down past it.
      const navH = (typeof labNavHeight === 'function') ? labNavHeight() : 0;
      const room = window.innerHeight - navH;
      const chartWrap = chartCvs.parentElement;
      const bottom = chartWrap.getBoundingClientRect().bottom + window.scrollY;
      const margin = 12;
      const tops = [oddsBox, panels[0].wrap.closest('.stage-area')]
        .map(node => node.getBoundingClientRect().top + window.scrollY);
      const top = tops.find(t => bottom - t + 2 * margin <= room);
      const target = top !== undefined
        ? top - navH - (room - (bottom - top)) / 2   // it fits: centre it
        : tops[1] - navH - margin;                   // it does not: start at the graphs
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const dest = Math.max(0, Math.min(target, maxScroll));
      if (Math.abs(dest - window.scrollY) < 4) return false;   // already framed
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: dest, behavior: reduced ? 'auto' : 'smooth' });
      return true;
    }

    // Waits for a smooth scroll to come to rest. The cap is there because
    // scrollend is not in every browser; missing it only costs the framing of
    // the first generation or two, which is what the wait was buying anyway.
    function whenScrollSettles(cb) {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('scrollend', finish);
        clearTimeout(cap);
        cb();
      };
      const cap = setTimeout(finish, 1400);
      window.addEventListener('scrollend', finish);
    }

    function startSimulation() {
      if (!mutant) return;
      stopPlaying();
      batch = runBatch(N);
      maxG = Math.max(batch.runs[0].gens, batch.runs[1].gens);
      gen = 0;
      showOdds();
      setPanelStats();
      redrawAll();
      readingText.innerHTML = T('fate.reading.run',
        'Both populations start the same way: <strong>one</strong> mutant among <strong>{n}</strong>. Nothing here favours it and nothing works against it — every individual has exactly the same chance of leaving offspring.',
        { n: N });
      playing = true;
      simBtn.textContent = T('fate.pause', '⏸ Pause');
      // The view first, the clock second: a long scroll can eat the opening
      // generations, and those are the ones in which most runs are decided.
      // Deferred a frame so the tally showOdds() just wrote is laid out and its
      // height counts towards the framing.
      const token = runToken;
      requestAnimationFrame(() => {
        const start = () => {
          if (!playing || token !== runToken) return;   // paused or restarted meanwhile
          timer = setInterval(tick, speedMs);
        };
        if (revealRun()) whenScrollSettles(start); else start();
      });
    }

    function showOdds() {
      if (!batch) { oddsBox.innerHTML = ''; return; }
      const oneIn = Math.round(batch.total / batch.fixations);
      oddsBox.innerHTML = T('fate.odds',
        '<p><strong>These two are not a fair sample.</strong><button class="help-btn" data-help="fateOdds"></button> To find one population where the mutation survived, we simulated <strong>{total}</strong> of them. It was lost in <strong>{losses}</strong> and survived in <strong>{fix}</strong> — roughly one in {oneIn}.</p>' +
        '<p class="fate-odds-theory">That is not luck of the draw: a brand-new mutation with no advantage survives with probability <var>1/N</var> = 1/{n} = {pct}%. The two populations below are one loser and one winner pulled out of that batch, shown side by side because the winner is otherwise so rarely seen.</p>',
        { total: batch.total, losses: batch.losses, fix: batch.fixations, oneIn, n: N, pct: (100 / N).toFixed(0) });
    }

    function finishReading() {
      if (!batch) return;
      const fixRun = batch.runs.find(r => r.fixed), lossRun = batch.runs.find(r => !r.fixed);
      const gens = (n) => n === 1 ? T('fate.gen1', '1 generation') : T('fate.genN', '{n} generations', { n });
      readingText.innerHTML = T('fate.reading.done',
        'The mutation was gone from one population after <strong>{lost}</strong>, and had taken over the other after <strong>{fix}</strong>. That gap is typical: a mutation that is going to be lost usually goes almost at once, while one that is going to take over needs roughly <strong>2<var>N</var></strong> generations to get there. Same mutation, same population size, same rules — only chance separated them.',
        { lost: gens(lossRun.gens), fix: gens(fixRun.gens) });
      statusLine.textContent = T('fate.statusDone', 'finished — generation {g}', { g: maxG });
    }

    function newMutation() {
      stopPlaying();
      mutant = mutate(ancestor, mutSigmaFrac, currentShape);
      batch = null; gen = 0; maxG = 0;
      clearSprites();
      oddsBox.innerHTML = '';
      simBtn.disabled = false;
      const d = normDist(ancestor, mutant, currentShape);
      mutSummary.innerHTML = T('fate.mutSummary',
        'One copying error, and the shape has moved <strong>Δ {d}</strong> normalised units from its parent. Nothing chose this change and nothing checked whether it was any good — it is simply what the copy came out like. The third panel lays the two on top of each other, the parent faded behind.',
        { d: d.toFixed(2) });
      readingText.innerHTML = T('fate.reading.mut',
        'So far this mutation exists in exactly one individual. Press <strong>Simulate evolution through time</strong> to drop it into a population of <strong>{n}</strong> and find out what becomes of it.',
        { n: N });
      statusLine.textContent = T('fate.statusMut', 'mutation created — ready to simulate');
      setPanelStats();
      redrawAll();
    }

    function resetRoom() {
      stopPlaying();
      ancestor = mutate(freshAncestor(currentShape), 0.4, currentShape);
      mutant = null; batch = null; gen = 0; maxG = 0;
      clearSprites();
      simBtn.disabled = true;
      oddsBox.innerHTML = '';
      mutSummary.innerHTML = T('fate.mutPrompt',
        'Press <strong>Mutate</strong> to copy this shape once, with one random error. The copy appears in the middle panel, and the two are superimposed on the right.');
      readingText.innerHTML = T('fate.reading.idle',
        'Every allele in every population began as a single mutation in a single individual. This room follows one of them from the moment it appears.');
      statusLine.textContent = T('fate.statusIdle', 'no mutation yet');
      setPanelStats();
      redrawAll();
    }

    // --------------------------------------------------------------- wiring

    mutateBtn.addEventListener('click', newMutation);
    resetBtn.addEventListener('click', resetRoom);
    simBtn.addEventListener('click', () => {
      if (playing) { stopPlaying(); statusLine.textContent = T('fate.statusPaused', 'paused at generation {g}', { g: gen }); return; }
      if (batch && gen < maxG) {
        playing = true;
        simBtn.textContent = T('fate.pause', '⏸ Pause');
        timer = setInterval(tick, speedMs);
        return;
      }
      startSimulation();
    });

    shapeSeg.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-shape]'); if (!btn) return;
      [...shapeSeg.children].forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentShape = btn.dataset.shape;
      ancestor = freshAncestor(currentShape);
      resetRoom();
    });

    nSeg.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-n]'); if (!btn) return;
      [...nSeg.children].forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      N = Number(btn.dataset.n);
      stopPlaying();
      batch = null; gen = 0; maxG = 0;
      oddsBox.innerHTML = '';
      if (mutant) {
        readingText.innerHTML = T('fate.reading.mut',
          'So far this mutation exists in exactly one individual. Press <strong>Simulate evolution through time</strong> to drop it into a population of <strong>{n}</strong> and find out what becomes of it.',
          { n: N });
        statusLine.textContent = T('fate.statusMut', 'mutation created — ready to simulate');
      }
      setPanelStats();
      redrawAll();
    });

    window.addEventListener('resize', () => { clearSprites(); redrawAll(); });
    document.addEventListener('lab:tabchange', (e) => {
      if (e.detail.tabId !== 'fate') stopPlaying();
      else { clearSprites(); requestAnimationFrame(redrawAll); }
    });

    resetRoom();
  })();
