  (function(){
    // Fills {placeholders} in an English template string.

    const SVGNS = 'http://www.w3.org/2000/svg';

    // A "random mutation" means: the probability that a given derived state
    // arises does NOT depend on how good or bad that state is for the fish.
    // Each character has its own wheel of possible derived states, and the
    // slice sizes (probabilities) are fixed properties of mutation — selection
    // never touches them. That invariance is the whole point of this room.

    // ---- The mutable characters and their derived-state wheels ----
    // pct values within each wheel sum to 100. `favoured` marks the state the
    // "stream" habitat selects for (revealed only once selection is simulated).
    function scaleTail(g, f){ g.tailLen *= f; g.tailSpread *= f; g.tailNotch *= f; }
    function scaleFins(g, f){ g.dorsLen *= f; g.analLen *= f; }
    function setColour(g, hue, light){ g.bodyHue = hue; g.finHue = hue; g.tailHue = hue; g.bodyLightness = light; }

    const WHEELS = [
      {
        key: 'shape', label: 'Body shape',
        sectors: [
          { id:'slender',   label:'Slender',     pct:20, favoured:true, apply:g=>{ g.bRy *= 0.66; } },
          { id:'rounder',   label:'Rounder',     pct:30,                apply:g=>{ g.bRy *= 1.40; } },
          { id:'elongated', label:'Elongated',   pct:35,                apply:g=>{ g.bRxFront *= 1.18; g.bRxBack *= 1.22; } },
          { id:'deep',      label:'Deep-bodied', pct:15,                apply:g=>{ g.bRy *= 1.45; g.bRxBack *= 0.85; } },
        ]
      },
      {
        key: 'colour', label: 'Body colour',
        sectors: [
          { id:'blue',   label:'Blue',   pct:15, favoured:true, fill:'hsl(205,55%,45%)', apply:g=>setColour(g,205,42) },
          { id:'green',  label:'Green',  pct:35,                fill:'hsl(135,50%,38%)', apply:g=>setColour(g,135,36) },
          { id:'red',    label:'Red',    pct:20,                fill:'hsl(6,60%,45%)',   apply:g=>setColour(g,6,42) },
          { id:'yellow', label:'Yellow', pct:30,                fill:'hsl(46,70%,50%)',  apply:g=>setColour(g,46,52) },
        ]
      },
      {
        key: 'tail', label: 'Tail size',
        sectors: [
          { id:'t20up', label:'20% longer',  pct:15, favoured:true, apply:g=>scaleTail(g,1.20) },
          { id:'t10up', label:'10% longer',  pct:25, favoured:true, apply:g=>scaleTail(g,1.10) },
          { id:'t10dn', label:'10% shorter', pct:40,                apply:g=>scaleTail(g,0.90) },
          { id:'t20dn', label:'20% shorter', pct:20,                apply:g=>scaleTail(g,0.80) },
        ]
      },
      {
        key: 'fin', label: 'Fin size',
        sectors: [
          { id:'f20up', label:'20% bigger',  pct:20,                apply:g=>scaleFins(g,1.20) },
          { id:'f10up', label:'10% bigger',  pct:30,                apply:g=>scaleFins(g,1.10) },
          { id:'f10dn', label:'10% smaller', pct:40, favoured:true, apply:g=>scaleFins(g,0.90) },
          { id:'f20dn', label:'20% smaller', pct:10, favoured:true, apply:g=>scaleFins(g,0.80) },
        ]
      },
    ];

    // Muted palette for shape / tail / fin sectors (the colour wheel colours
    // itself with the hue each slice represents).
    const SECTOR_PALETTE = ['#3D6E6E', '#A8442A', '#B8862E', '#7A5C99'];
    // Outline marking a slice the habitat favours, once selection is switched on.
    // Near-black rather than a hue: one of the sector fills is itself ochre, so
    // the old stamp colour all but vanished on the very slice it was marking,
    // and a red would have collided with the rust fill next to it. A dark
    // neutral is the one thing that reads clearly against all six fills.
    const FAVOURED_STROKE = '#262220';

    function originalGenome(){
      const g = freshAncestor('fish');
      // A neutral "wild-type" tan fish, deliberately in none of the derived
      // colour states so every colour mutation is visibly a change.
      setColour(g, 28, 44);
      return g;
    }

    // The wheel and slice names are data, not prose, so they need their own
    // lookup: 'Body shape' -> mu.wheel.shape, 'Slender' -> mu.sec.slender.
    const wheelLabel = (w) => T('mu.wheel.' + w.key, w.label);
    const wheelShort = (w) => T('mu.wheelShort.' + w.key, w.key === 'colour'
      ? 'Colour'
      : (s => s.charAt(0).toUpperCase() + s.slice(1))(w.label.replace('Body ', '').replace(' size', '')));
    const secLabel = (sec) => T('mu.sec.' + sec.id, sec.label);

    // ---- DOM handles ----
    const wheelGrid   = document.getElementById('wheelGrid_mut');
    const spinBtn     = document.getElementById('spinBtn_mut');
    const resetBtn    = document.getElementById('resetBtn_mut');
    const rerunBtn    = document.getElementById('rerunBtn_mut');
    const selBtn      = document.getElementById('selBtn_mut');
    const selPanel    = document.getElementById('selPanel_mut');
    const selSliders  = document.getElementById('selSliders_mut');
    const readingText = document.getElementById('readingText_mut');
    const mutStat     = document.getElementById('mutStat_mut');
    const origCanvas  = document.getElementById('fishOrig_mut');
    const mutCanvas   = document.getElementById('fishMut_mut');
    const origCtx     = origCanvas.getContext('2d');
    const mutCtx      = mutCanvas.getContext('2d');
    const freqCanvas  = document.getElementById('freqCanvas_mut');
    const freqCtx     = freqCanvas.getContext('2d');
    const freqStat    = document.getElementById('freqStat_mut');
    const popCanvas   = document.getElementById('fishPop_mut');
    const popCtx      = popCanvas.getContext('2d');
    const popStat     = document.getElementById('popStat_mut');
    const nSlider     = document.getElementById('nSlider_mut');
    const nVal        = document.getElementById('nVal_mut');

    let original = originalGenome();
    let mutant = null;
    let spinning = false;
    let selectionActive = false;        // natural-selection mode on/off
    let popN = Number(nSlider.value);   // population size (individuals = gene copies, haploid)
    // Generations to run defaults to 2.5·N, but is extended (see simulateAlleleAdaptive)
    // whenever an allele hasn't yet fixed or been lost by then — popG always reflects
    // the actual length of the last run's shared axis, not just the nominal default.
    let popG = defaultG();
    const wheelState = {}; // key -> { rot, group, paths, resultEl, legendEl, chosen }
    function defaultG(){ return Math.round(popN * 2.5); }

    // Each of the four traits is its own independent locus: the spun derived
    // state is one allele, with its own frequency trajectory and final value.
    const alleleState = {}; // key -> { chosen, trajectory, finalFreq }
    WHEELS.forEach(w => { alleleState[w.key] = { chosen: null, trajectory: null, finalFreq: null }; });
    // A single selection coefficient s (magnitude), shared by all four traits;
    // the stream sets the sign — a favoured derived allele is advantageous, any
    // other is deleterious.
    let sValue = 0.2;
    // Line colour for each trait in the frequency chart.
    const TRAIT_LINE = { shape: '#3D6E6E', colour: '#A8442A', tail: '#C08A2E', fin: '#7A5C99' };
    // The frequency chart plays out over ANIM_MS: animShownGen is how many
    // generations are revealed so far, and the "After G gens" fish is only
    // drawn once the run finishes.
    const ANIM_MS = 3000;
    let animShownGen = 0;   // generations currently drawn (== popG when idle)
    let animating = false;
    let animRAF = null;

    // ---- canvas sizing (shared engine) ----
    // Clear any inline size scaleCanvas left behind so the CSS width:100%
    // governs the measurement. Without this, a single measurement taken while
    // the card is momentarily tiny (e.g. mid tab-switch) pins the canvas to
    // that size — the inline width beats the stylesheet and every later
    // measurement just reads the stuck value back.
    function withSize(canvas, cb, attempt){
      canvas.style.width = '';
      canvas.style.height = '';
      const size = Math.round(canvas.getBoundingClientRect().width);
      if(size < 1) return; // genuinely hidden — nothing to draw yet
      if(size <= 8){
        // Bogus tiny width right as the tab un-hides: retry after layout+paint.
        if((attempt || 0) < 12) requestAnimationFrame(() => withSize(canvas, cb, (attempt || 0) + 1));
        return;
      }
      cb(size);
    }
    function renderFish(canvas, ctx, genome){
      withSize(canvas, size => {
        scaleCanvas(canvas, ctx, size, size);
        drawGenome(ctx, size, size, genome, 'fish');
      });
    }
    function renderAll(){
      renderFish(origCanvas, origCtx, original);
      if(mutant) renderFish(mutCanvas, mutCtx, mutant);
      drawFreqChart();
      // Only show the outcome fish once the run has finished playing out.
      if(mutant && hasTrajectories() && !animating) renderFish(popCanvas, popCtx, popGenomeFromAlleles());
    }
    function hasTrajectories(){ return WHEELS.some(w => alleleState[w.key].trajectory); }
    function favouredCount(){ return WHEELS.filter(w => { const c = alleleState[w.key].chosen; return c && c.favoured; }).length; }
    // The Mutant panel names how many of the four derived states the stream
    // favours — but only once natural selection is switched on.
    function updateMutStat(){
      if(!mutant){ mutStat.textContent = T('mu.spinPrompt', '— spin the wheels —'); return; }
      mutStat.textContent = selectionActive
        ? `4 mutations · ${favouredCount()} favoured ★`
        : 'four mutations applied';
    }
    // Observe the stable parent cards (never the canvases we resize) so every
    // panel is (re)drawn once the cards actually have a size — e.g. when the
    // hidden tab is first shown — without depending on a well-timed resize.
    const panelRO = new ResizeObserver(renderAll);
    [origCanvas, mutCanvas, freqCanvas, popCanvas].forEach(c => panelRO.observe(c.parentElement));
    window.addEventListener('resize', renderAll);

    // ---- derived-allele fate (Wright–Fisher, drift ± selection) ----
    // Each derived allele enters a population of N individuals as a single copy,
    // so it starts at frequency 1/N. Each generation the next N copies are drawn
    // at random from the current pool. Without selection (sEff = 0) that is pure
    // drift; with selection the current frequency is first reweighted by the
    // derived allele's relative fitness (1 + sEff) exactly as in the Selection
    // Room — sEff > 0 for a habitat-favoured state, sEff < 0 for any other.
    //
    // Runs at least minG generations. If the allele is still segregating (not
    // fixed at N, not lost at 0) once minG is reached, the SAME run just keeps
    // going — not a fresh restart — until it fixes or is lost, or the generous
    // safety-cap maxG is hit (which a finite absorbing chain will essentially
    // never reach in practice). Returns the full history, whatever length that
    // turns out to be.
    function simulateAlleleAdaptive(N, sEff, minG, maxG){
      const w = 1 + sEff;
      let count = 1;
      const hist = [count / N];
      let g = 0;
      while(true){
        g++;
        if(count > 0 && count < N){
          const f = count / N;
          const fp = (f * w) / (f * w + (1 - f)); // fitness-adjusted sampling frequency
          let next = 0;
          for(let k = 0; k < N; k++){ if(Math.random() < fp) next++; }
          count = next;
        }
        hist.push(count / N); // once lost (0) or fixed (N), it stays there
        const fixedOrLost = (count === 0 || count === N);
        if(g >= minG && fixedOrLost) break;
        if(g >= maxG) break; // safety net — should not normally be reached
      }
      return hist;
    }

    // Effective selection coefficient on a trait's derived allele: 0 when
    // natural selection is off; otherwise +s if the spun state is favoured, −s
    // if it is not (the stream sets the sign, the slider the magnitude).
    function effectiveS(key){
      if(!selectionActive) return 0;
      const chosen = alleleState[key].chosen;
      if(!chosen) return 0;
      return chosen.favoured ? sValue : -sValue;
    }

    const CHART = { ink:'#262220', inkSoft:'#6b6258', rule:'#cabfa8' };

    function drawFreqChart(){
      withSize(freqCanvas, size => {
        scaleCanvas(freqCanvas, freqCtx, size, size);
        const ctx = freqCtx, W = size, H = size;
        ctx.clearRect(0, 0, W, H);
        const padL = 26, padR = 8, padT = 26, padB = 18;
        const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
        ctx.font = '9px ui-monospace, Menlo, monospace';
        ctx.textBaseline = 'middle';

        // y grid + labels (frequency 0 … 1)
        ctx.strokeStyle = CHART.rule; ctx.fillStyle = CHART.inkSoft; ctx.lineWidth = 1;
        [0, 0.5, 1].forEach(v => {
          const y = y1 - v * (y1 - y0);
          ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
          ctx.textAlign = 'right'; ctx.fillText(v === 0.5 ? '.5' : String(v), x0 - 3, y);
        });
        // x baseline labels
        ctx.textAlign = 'left'; ctx.fillText('gen 0', x0, y1 + 9);
        ctx.textAlign = 'right'; ctx.fillText('gen ' + popG, x1, y1 + 9);

        // in-canvas legend across the top: one key per trait
        let lx = x0;
        WHEELS.forEach(wheel => {
          ctx.strokeStyle = TRAIT_LINE[wheel.key]; ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(lx, 12); ctx.lineTo(lx + 11, 12); ctx.stroke();
          ctx.fillStyle = CHART.inkSoft; ctx.textAlign = 'left';
          ctx.fillText(wheelShort(wheel), lx + 14, 12);
          lx += (x1 - x0) / 4;
        });

        if(!hasTrajectories()){
          ctx.fillStyle = CHART.inkSoft; ctx.textAlign = 'center';
          ctx.fillText(T('mu.spinToRun', 'spin to run'), (x0 + x1) / 2, (y0 + y1) / 2);
          return;
        }

        // one line per trait, revealed only up to animShownGen (the animation
        // plays the G generations out over ANIM_MS; when idle this is popG).
        WHEELS.forEach(wheel => {
          const hist = alleleState[wheel.key].trajectory;
          if(!hist) return;
          const G = hist.length - 1;
          const upto = Math.max(0, Math.min(animShownGen, G));
          const px = g => x0 + (G ? g / G : 0) * (x1 - x0);
          const py = f => y1 - f * (y1 - y0);
          ctx.strokeStyle = TRAIT_LINE[wheel.key]; ctx.lineWidth = 1.6;
          ctx.lineJoin = 'round'; ctx.globalAlpha = 0.9;
          ctx.beginPath();
          for(let g = 0; g <= upto; g++){ const X = px(g), Y = py(hist[g]); g ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
          ctx.stroke();
          // moving tip marker
          ctx.globalAlpha = 1; ctx.fillStyle = TRAIT_LINE[wheel.key];
          ctx.beginPath(); ctx.arc(px(upto), py(hist[upto]), 2.4, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
      });
    }

    // The population's typical fish after G generations: apply each trait's
    // derived state only where that allele reached the majority — a mosaic
    // built locus by locus from the four independent fates.
    function popGenomeFromAlleles(){
      const g = originalGenome();
      WHEELS.forEach(wheel => {
        const st = alleleState[wheel.key];
        if(st.chosen && st.finalFreq !== null && st.finalFreq >= 0.5) st.chosen.apply(g);
      });
      return g;
    }

    function stopAnimation(){
      if(animRAF){ cancelAnimationFrame(animRAF); animRAF = null; }
      animating = false;
    }

    // Draw the outcome fish and final captions once the run has fully played out.
    function finalizeRun(){
      animating = false;
      renderFish(popCanvas, popCtx, popGenomeFromAlleles());
      const derived = WHEELS.filter(w => alleleState[w.key].finalFreq >= 0.5).length;
      freqStat.textContent = selectionActive ? 'drift + selection' : 'neutral drift';
      popStat.textContent = derived === 0 ? 'all ancestral'
        : derived === 4 ? 'fully derived'
        : `${derived} / 4 derived`;
    }

    function runTrajectories(animate){
      stopAnimation();
      if(!mutant){
        WHEELS.forEach(w => { alleleState[w.key].trajectory = null; alleleState[w.key].finalFreq = null; });
        popG = defaultG(); // preview axis back to the nominal 2.5·N until the next run
        freqStat.textContent = '—'; popStat.textContent = '—';
        popCtx.clearRect(0, 0, popCanvas.width, popCanvas.height);
        animShownGen = 0;
        drawFreqChart();
        return;
      }
      // Each trait runs at least the nominal 2.5·N generations; any allele still
      // segregating at that point keeps going until it fixes or is lost. The four
      // traits can therefore finish at different generations — pad the shorter
      // ones (repeating their already-settled value) so all four lines share one
      // common axis, and use the longest as the displayed G.
      const minG = defaultG();
      const maxG = Math.max(minG * 8, 2000); // generous safety net, not a normal stopping point
      WHEELS.forEach(wheel => {
        const st = alleleState[wheel.key];
        st.trajectory = simulateAlleleAdaptive(popN, effectiveS(wheel.key), minG, maxG);
      });
      const maxLen = Math.max(...WHEELS.map(w => alleleState[w.key].trajectory.length));
      WHEELS.forEach(wheel => {
        const st = alleleState[wheel.key];
        while(st.trajectory.length < maxLen) st.trajectory.push(st.trajectory[st.trajectory.length - 1]);
        st.finalFreq = st.trajectory[st.trajectory.length - 1];
      });
      popG = maxLen - 1;

      if(!animate){
        animShownGen = popG;
        drawFreqChart();
        finalizeRun();
        return;
      }

      // Reveal the moving frequency over ANIM_MS, holding the outcome fish back.
      animating = true;
      animShownGen = 0;
      popCtx.clearRect(0, 0, popCanvas.width, popCanvas.height);
      freqStat.textContent = T('mu.running', 'running…');
      popStat.textContent = T('mu.running', 'running…');
      const start = performance.now();
      const step = now => {
        const t = Math.min(1, (now - start) / ANIM_MS);
        animShownGen = Math.round(t * popG);
        drawFreqChart();
        if(t < 1){ animRAF = requestAnimationFrame(step); }
        else { animRAF = null; animShownGen = popG; drawFreqChart(); finalizeRun(); }
      };
      animRAF = requestAnimationFrame(step);
    }

    // ---- wheel geometry ----
    function pt(cx, cy, r, angDeg){
      const a = angDeg * Math.PI / 180;
      return [cx + r*Math.sin(a), cy - r*Math.cos(a)];
    }
    function sectorPath(cx, cy, r, a1, a2){
      const [x1,y1] = pt(cx,cy,r,a1);
      const [x2,y2] = pt(cx,cy,r,a2);
      const large = (a2 - a1) > 180 ? 1 : 0;
      return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    }

    function buildWheel(wheel){
      const card = document.createElement('div');
      card.className = 'wheel-card';
      card.innerHTML = `
        <div class="wheel-head">
          <span class="name">${wheelLabel(wheel)}</span>
          <button class="help-btn" data-help="mutWheel"></button>
        </div>
        <div class="wheel-stage">
          <div class="wheel-pointer"></div>
          <svg class="wheel-svg" viewBox="0 0 200 200" aria-hidden="true">
            <g class="wheel-rot" style="transform-box: fill-box; transform-origin: center;"></g>
            <circle cx="100" cy="100" r="7" class="wheel-hub"></circle>
          </svg>
        </div>
        <div class="wheel-result mono" data-role="result">—</div>
        <ul class="wheel-legend"></ul>
      `;
      wheelGrid.appendChild(card);

      const group = card.querySelector('.wheel-rot');
      const legendEl = card.querySelector('.wheel-legend');
      const resultEl = card.querySelector('[data-role="result"]');
      const paths = {};

      let acc = 0;
      wheel.sectors.forEach((sec, i) => {
        const span = sec.pct / 100 * 360;
        const a1 = acc, a2 = acc + span; acc = a2;
        const fill = wheel.key === 'colour' ? sec.fill : SECTOR_PALETTE[i % SECTOR_PALETTE.length];

        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', sectorPath(100, 100, 90, a1, a2));
        path.setAttribute('fill', fill);
        path.setAttribute('stroke', 'var(--paper)');
        path.setAttribute('stroke-width', '1.5');
        path.dataset.sector = sec.id;
        group.appendChild(path);
        paths[sec.id] = path;

        // probability label (P) at the slice mid-angle — the sector's angular
        // size IS this probability, so P=0.2 reads more honestly than "20%".
        const mid = (a1 + a2) / 2;
        const [lx, ly] = pt(100, 100, 56, mid);
        const txt = document.createElementNS(SVGNS, 'text');
        txt.setAttribute('x', lx.toFixed(1));
        txt.setAttribute('y', ly.toFixed(1));
        txt.setAttribute('class', 'wheel-pct');
        txt.textContent = 'P=' + sec.pct / 100;
        group.appendChild(txt);

        sec._mid = mid; sec._span = span; sec._fill = fill;
      });

      // The favoured-slice outline lives on its own stroke-only path, drawn
      // after every fill and label in the group. Outlining the fill path itself
      // does not work: the wedges share edges and are painted in order, so the
      // next slice's paper stroke lands on top of the previous one's highlight
      // and rubs out the shared radius — the outline came out solid on one side
      // and faint on the other depending on which neighbour was drawn later.
      const outlines = {};
      wheel.sectors.forEach(sec => {
        const o = document.createElementNS(SVGNS, 'path');
        o.setAttribute('d', paths[sec.id].getAttribute('d'));
        o.setAttribute('fill', 'none');
        o.setAttribute('stroke', 'none');
        o.setAttribute('stroke-width', '4');
        o.setAttribute('stroke-linejoin', 'round');
        o.setAttribute('pointer-events', 'none');
        group.appendChild(o);
        outlines[sec.id] = o;
      });

      wheelState[wheel.key] = { rot: 0, group, paths, outlines, resultEl, legendEl, chosen: null };
      renderLegend(wheel);
    }

    function renderLegend(wheel){
      const st = wheelState[wheel.key];
      st.legendEl.innerHTML = '';
      wheel.sectors.forEach(sec => {
        const li = document.createElement('li');
        li.className = 'wheel-legend-item';
        if(st.chosen === sec.id) li.classList.add('is-landed');
        if(selectionActive && sec.favoured) li.classList.add('is-favoured');
        li.innerHTML = `
          <span class="wheel-sw" style="background:${sec._fill}"></span>
          <span class="wheel-lg-label">${secLabel(sec)}${selectionActive && sec.favoured ? ' <span class="fav-star">★</span>' : ''}</span>
        `;
        st.legendEl.appendChild(li);
      });
    }

    function refreshFavouredHighlight(){
      WHEELS.forEach(wheel => {
        const st = wheelState[wheel.key];
        wheel.sectors.forEach(sec => {
          st.outlines[sec.id].setAttribute(
            'stroke', selectionActive && sec.favoured ? FAVOURED_STROKE : 'none');
        });
        renderLegend(wheel);
      });
    }

    // ---- spinning ----
    function pickSector(wheel){
      let roll = Math.random() * 100, acc = 0;
      for(const sec of wheel.sectors){ acc += sec.pct; if(roll <= acc) return sec; }
      return wheel.sectors[wheel.sectors.length - 1];
    }

    function spin(){
      if(spinning) return;
      spinning = true;
      spinBtn.disabled = true;
      resetBtn.disabled = true;
      rerunBtn.disabled = true;
      mutStat.textContent = T('mu.spinning', 'spinning…');

      const chosen = {};
      WHEELS.forEach((wheel, i) => {
        const st = wheelState[wheel.key];
        const sec = pickSector(wheel);
        chosen[wheel.key] = sec;
        st.chosen = sec.id;

        // Rotate so the chosen slice's centre stops under the top pointer.
        const desiredMod = ((-sec._mid) % 360 + 360) % 360;
        const curMod = ((st.rot % 360) + 360) % 360;
        const delta = (desiredMod - curMod + 360) % 360;
        const jitter = (Math.random() - 0.5) * sec._span * 0.5;
        const spins = 5 + i; // stagger so they don't all stop at once
        st.rot += 360 * spins + delta + jitter;
        st.group.style.transition = 'transform 2.8s cubic-bezier(0.16, 0.9, 0.24, 1)';
        st.group.style.transform = `rotate(${st.rot}deg)`;
        st.resultEl.textContent = '…';
      });

      setTimeout(() => {
        mutant = originalGenome();
        WHEELS.forEach(wheel => {
          const sec = chosen[wheel.key];
          sec.apply(mutant);
          alleleState[wheel.key].chosen = sec;
          const st = wheelState[wheel.key];
          st.resultEl.textContent = secLabel(sec);
          st.resultEl.classList.add('has-result');
          renderLegend(wheel);
        });
        renderFish(mutCanvas, mutCtx, mutant);
        updateMutStat();
        runTrajectories(true);
        spinning = false;
        spinBtn.disabled = false;
        resetBtn.disabled = false;
        rerunBtn.disabled = false;   // there are mutations to re-run now
        updateReadingAfterSpin(chosen);
      }, 3100);
    }

    function updateReadingAfterSpin(chosen){
      const parts = WHEELS.map(w => T('mu.landedPart', '<strong>{sec}</strong> {trait}',
        { sec: secLabel(chosen[w.key]).toLowerCase(), trait: wheelLabel(w).toLowerCase() }));
      const tail = selectionActive
        ? T('mu.tail.sel',
            'Each derived state now enters the population as a <strong>single copy</strong> (frequency 1/N), and the four lines follow all four at once. ' +
            'With natural selection on, the <span class="fav-star">★</span> favoured alleles are pushed <em>up</em> and the rest <em>down</em> — yet the wheels that produced them never changed.')
        : T('mu.tail.drift',
            'Each derived state now enters the population as a <strong>single copy</strong> (frequency 1/N); the four lines follow all four at once, drifting by pure chance — usually to loss. ' +
            'Switch on <strong>natural selection</strong> to let fitness act on their <em>fate</em> (never on their origin).');
      readingText.innerHTML = T('mu.landed', 'The four wheels landed on {first} and {last}. ',
        { first: parts.slice(0, 3).join(', '), last: parts[3] }) + tail;
    }

    // ---- natural selection panel ----
    // A single selection coefficient, shared by all four characters: the stream
    // sets each trait's sign (favoured vs not), this one slider its magnitude.
    function buildSelectionSliders(){
      selSliders.innerHTML = '';
      const field = document.createElement('div');
      field.className = 'field';
      // The two wordy parts get their own spans so they can be relabelled
      // without replacing the whole <label> — doing that would detach the
      // value readout below and silently stop it updating.
      field.innerHTML = `
        <label><span class="mu-sel-label">${T('mu.selLabel', 'Selection coefficient')}</span> <span class="sym"><var>s</var></span> <span class="mu-sel-all">${T('mu.selAll', '(all four characters)')}</span> <span class="value" id="selVal_all">${sValue.toFixed(2)}</span></label>
        <input type="range" id="selInt_all" min="0" max="1" step="0.01" value="${sValue}">
      `;
      selSliders.appendChild(field);
      const slider = field.querySelector('input');
      const val = field.querySelector('.value');
      // Live feedback while dragging (value, pulse, reading); replay the
      // trajectories only on release so the 3-second animation isn't restarted
      // on every tick.
      slider.addEventListener('input', () => {
        sValue = Number(slider.value);
        val.textContent = sValue.toFixed(2);
        onSelectionSliderMove();
      });
      slider.addEventListener('change', () => runTrajectories(true));
    }

    function onSelectionSliderMove(){
      // Pulse every favoured slice across all four wheels so the reader looks —
      // and sees that none of them changes size.
      WHEELS.forEach(wheel => {
        const st = wheelState[wheel.key];
        wheel.sectors.filter(s => s.favoured).forEach(s => {
          [st.paths[s.id], st.outlines[s.id]].forEach(p => {
            p.classList.remove('pulse');
            void p.getBBox();
            p.classList.add('pulse');
          });
        });
      });
      // The trajectories are replayed on the slider's 'change' (release) event.
      readingText.innerHTML = T('mu.selReading',
        'The selection coefficient is now <strong><span class="sym"><var>s</var></span> = {s}</strong>, shared by all four characters. ' +
        'Two things happen at once. None of the four wheels moves — every favoured slice (<span class="fav-star">★</span>) stays exactly as big as it was — so selection still cannot bias which mutation appears. ' +
        'But in the <strong>Derived alleles</strong> panel the trajectories bend: each favoured allele is pushed up, the disfavoured ones down. ' +
        "Mutation stays random; only an allele's <em>fate</em> now feels fitness.", { s: sValue.toFixed(2) });
    }

    function toggleSelection(){
      selectionActive = !selectionActive;
      selPanel.classList.toggle('open', selectionActive);
      selBtn.textContent = selectionActive ? '▲ Turn off natural selection' : '▼ Simulate natural selection';
      refreshFavouredHighlight();
      updateMutStat(); // show/hide the favoured-allele count on the Mutant panel
      runTrajectories(true); // fate now follows selection (or reverts to pure drift)
      readingText.innerHTML = selectionActive
        ? `Natural selection is <strong>on</strong>. This fish lives in a fast-flowing stream that favours ` +
          `<strong>a slender body</strong>, <strong>blue colouring</strong>, <strong>a long tail</strong> and <strong>short fins</strong> — now marked ` +
          `<span class="fav-star">★</span>. The wheels are unchanged (mutation is still blind to fitness), but each derived allele's ` +
          `trajectory now bends with its fitness: favoured up, the rest down. Raise the shared <span class="sym"><var>s</var></span> and watch.`
        : `Natural selection is <strong>off</strong> — the four alleles are back to pure drift. Switch it on again to compare.`;
    }

    // ---- reset ----
    function reset(){
      if(spinning) return;
      stopAnimation();
      rerunBtn.disabled = true;
      mutant = null;
      animShownGen = 0;
      popG = defaultG(); // preview axis back to the nominal 2.5·N
      WHEELS.forEach(w => { alleleState[w.key].chosen = null; alleleState[w.key].trajectory = null; alleleState[w.key].finalFreq = null; });
      mutCtx.clearRect(0, 0, mutCanvas.width, mutCanvas.height);
      popCtx.clearRect(0, 0, popCanvas.width, popCanvas.height);
      updateMutStat();
      freqStat.textContent = '—'; popStat.textContent = '—';
      drawFreqChart();
      WHEELS.forEach(wheel => {
        const st = wheelState[wheel.key];
        st.chosen = null;
        st.resultEl.textContent = '—';
        st.resultEl.classList.remove('has-result');
        renderLegend(wheel);
      });
      readingText.innerHTML = startReadingHTML();
    }

    function startReadingHTML(){
      return T('mu.startReading',
        `Press <strong>Spin</strong> to introduce one mutation in each of the four characters. ` +
        `Watch where each wheel stops: the slices are different sizes, so some derived states turn up far more often than ` +
        `others — but a slice's size reflects only how <em>mutationally accessible</em> that state is, never how useful it would be.`);
    }

    // ---- wire up ----
    WHEELS.forEach(buildWheel);
    buildSelectionSliders();
    readingText.innerHTML = startReadingHTML();
    renderAll();

    spinBtn.addEventListener('click', spin);
    // Same four mutations, a fresh draw of their fates. The wheels are not spun
    // again — the point is that identical mutations, at identical frequencies
    // and selection, still go different ways from one run to the next.
    rerunBtn.addEventListener('click', () => {
      if (spinning || !mutant) return;
      runTrajectories(true);
    });
    resetBtn.addEventListener('click', reset);
    selBtn.addEventListener('click', toggleSelection);
    // Update the readout live (G is locked at 2.5·N); replay — and re-animate —
    // only when the slider is released.
    nSlider.addEventListener('input', () => { popN = Number(nSlider.value); popG = defaultG(); nVal.textContent = popN; });
    nSlider.addEventListener('change', () => runTrajectories(true));
  })();
