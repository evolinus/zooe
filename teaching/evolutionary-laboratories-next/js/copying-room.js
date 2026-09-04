  (function(){
    // Fills {placeholders} in an English template string.

    const LINEAGE_COLORS = ['#3D6E6E', '#A8442A', '#7A5C99'];
    const LINEAGE_NAMES = ['Lineage A', 'Lineage B', 'Lineage C'];

    let currentShape = 'polygon'; let lineageCount = 1;
    let mutSigmaFrac = 0.005 + (3/10)*0.12; let speedMs = 50; let maxGen = 100;
    let playing = false; let timer = null; let ancestor = freshAncestor(currentShape); let lineages = []; 

    const stageArea = document.getElementById('stageArea_copy');
    const statusLine = document.getElementById('statusLine_copy');
    const readingText = document.getElementById('readingText_copy');
    const divergenceLine = document.getElementById('divergenceLine_copy');
    const playBtn = document.getElementById('playBtn_copy');
    const stepBtn = document.getElementById('stepBtn_copy');
    const resetBtn = document.getElementById('resetBtn_copy');
    const mutRate = document.getElementById('mutRate_copy');
    const mutVal = document.getElementById('mutVal_copy');
    const speedInput = document.getElementById('speed_copy');
    const speedVal = document.getElementById('speedVal_copy');
    const maxGenInput = document.getElementById('maxGen_copy');
    const maxGenVal = document.getElementById('maxGenVal_copy');
    const seg = document.getElementById('lineageCountSeg_copy');
    const shapeSeg = document.getElementById('shapeSeg_copy');
    const timeScrubber = document.getElementById('timeScrubber_copy');
    const scrubVal = document.getElementById('scrubVal_copy');

    function buildStage(){
      // Cards are always laid out on a 3-wide grid (even with 1 or 2 lineages showing)
      // so a card's physical size never changes as you switch between 1/2/3 lineages.
      let cols = lineageCount === 100 ? 10 : 3;
      stageArea.style.setProperty('--cols', cols); stageArea.innerHTML = ''; lineages = [];
      timeScrubber.min = 0; timeScrubber.max = 0; timeScrubber.value = 0;
      scrubVal.textContent = 0; timeScrubber.disabled = true;

      for(let i=0;i<lineageCount;i++){
        const color = LINEAGE_COLORS[i % LINEAGE_COLORS.length];
        const name = lineageCount === 100 ? `Lineage ${i+1}` : LINEAGE_NAMES[i];
        const card = document.createElement('div');
        
        if (lineageCount === 100) {
          card.innerHTML = `<canvas class="stage-canvas" style="background:transparent; border:none;"></canvas>`;
        } else {
          card.className = 'lineage-card'; card.style.setProperty('--accent', color);
          card.innerHTML = `
            <div class="lineage-head">
              <span class="name" style="color:${color}">${name}</span>
              <span class="stat mono" data-role="stat">gen 0 · Δ 0.00</span>
            </div>
            <canvas class="stage-canvas"></canvas>
          `;
        }

        stageArea.appendChild(card); const canvas = card.querySelector('canvas'); const ctx = canvas.getContext('2d');
        const genome = {...ancestor};
        const lineage = {
          genome, history:[genome], color, name: name, canvas, ctx,
          statEl: card.querySelector('[data-role="stat"]')
        };
        lineages.push(lineage); renderLineage(lineage);
      }
      updateReading(0);
    }

    // Size the canvas's backing bitmap to match its real rendered box (times the
    // device pixel ratio) right before every draw, so shapes stay crisp no matter
    // how big the card ends up being or how many lineages are on screen.
    //
    // scaleCanvas writes an inline width, so that has to be cleared before
    // measuring — otherwise every measurement just reads back whatever was
    // written last and the canvas can never change size again. A hidden tab
    // measures 0, and a canvas laid out in a collapsed viewport measures only
    // its 2px of border; both mean "not laid out yet", so retry on the next
    // frame rather than baking a useless size in permanently.
    function renderLineage(lineage, attempt){
      lineage.canvas.style.width = '';
      lineage.canvas.style.height = '';
      const size = Math.round(lineage.canvas.getBoundingClientRect().width);
      if (size <= 8) {
        if ((attempt || 0) < 12) requestAnimationFrame(() => renderLineage(lineage, (attempt || 0) + 1));
        return;
      }
      scaleCanvas(lineage.canvas, lineage.ctx, size, size);
      drawGenome(lineage.ctx, size, size, lineage.genome, currentShape);
    }

    // Re-render at the correct resolution when the window (or the tab becoming
    // visible again) changes the cards' actual size.
    window.addEventListener('resize', () => lineages.forEach(l => renderLineage(l)));

    function stepAll(){
      const genIndex = lineages[0].history.length; if(genIndex >= maxGen){ stopPlaying(); return; }
      lineages.forEach(lineage=>{
        const next = mutate(lineage.genome, mutSigmaFrac, currentShape);
        lineage.genome = next; lineage.history.push(next); renderLineage(lineage);
        if (lineage.statEl) {
          const dAncestor = normDist(ancestor, next, currentShape);
          lineage.statEl.textContent = T('cp.stat', 'gen {g} · Δ {d} from origin', { g: genIndex, d: dAncestor.toFixed(2) });
        }
      });
      timeScrubber.max = genIndex; timeScrubber.value = genIndex; scrubVal.textContent = genIndex;
      statusLine.textContent = T('cp.status', 'gen {g} / {max} — {state}',
        { g: genIndex, max: maxGen, state: playing ? T('cp.state.copying', 'copying…') : T('cp.state.stepped', 'stepped') });
      updateReading(genIndex); if(genIndex + 1 > maxGen) stopPlaying();
    }

    function scrubTo(genIndex) {
      scrubVal.textContent = genIndex;
      lineages.forEach(lineage => {
        const historicalGenome = lineage.history[genIndex]; lineage.genome = historicalGenome; renderLineage(lineage);
        if (lineage.statEl) {
          const dAncestor = normDist(ancestor, historicalGenome, currentShape);
          lineage.statEl.textContent = T('cp.stat', 'gen {g} · Δ {d} from origin', { g: genIndex, d: dAncestor.toFixed(2) });
        }
      });
      updateReading(genIndex);
    }

    timeScrubber.addEventListener('input', (e) => { if(!playing) scrubTo(parseInt(e.target.value)); });

    function updateReading(genIndex){
      if(lineages.length > 1 && lineages.length <= 10){
        let pairs = [];
        for(let i=0;i<lineages.length;i++){
          for(let j=i+1;j<lineages.length;j++){
            const d = normDist(lineages[i].history[genIndex], lineages[j].history[genIndex], currentShape);
            pairs.push(`${lineages[i].name.split(' ')[1]}↔${lineages[j].name.split(' ')[1]}: Δ ${d.toFixed(2)}`);
          }
        }
        divergenceLine.textContent = pairs.join('   ·   ');
      } else { divergenceLine.textContent = ''; }

      const shapeWord = T('shape.' + currentShape, SHAPES[currentShape].label);
      if(genIndex <= 0){
        readingText.innerHTML = lineages.length > 1
          ? T('cp.gen0.many', 'Generation 0. Every lineage is still an identical copy of the same {shape}.', { shape: shapeWord })
          : T('cp.gen0.one', 'Generation 0. This is the original — nothing has been copied yet.');
        return;
      }
      if(lineages.length === 1){
        const d = normDist(ancestor, lineages[0].history[genIndex], currentShape);
        readingText.innerHTML = T('cp.read.one',
          'At generation <strong>{g}</strong>, this lineage has drifted <strong>{d}</strong> normalized units from the original — no single copy was a big change, but the small ones never stopped adding up.',
          { g: genIndex, d: d.toFixed(2) });
      } else if (lineages.length === 100) {
        readingText.innerHTML = T('cp.read.many',
          'At generation <strong>{g}</strong>, 100 distinct lineages are copying and drifting in parallel.', { g: genIndex });
      } else {
        let dMax = 0;
        for (let i = 0; i < lineages.length; i++)
          for (let j = i + 1; j < lineages.length; j++)
            dMax = Math.max(dMax, normDist(lineages[i].history[genIndex], lineages[j].history[genIndex], currentShape));
        readingText.innerHTML = T('cp.read.pair',
          'At generation <strong>{g}</strong>, lineages that began as the <em>exact same {shape}</em> have drifted up to <strong>{d}</strong> normalized units apart — and each has gone its own way.',
          { g: genIndex, shape: shapeWord, d: dMax.toFixed(2) });
      }
    }

    function startPlaying(){
      if(playing) return;
      const currentMax = lineages[0].history.length - 1; if(currentMax >= maxGen) return;
      if (parseInt(timeScrubber.value) < currentMax) { scrubTo(currentMax); timeScrubber.value = currentMax; }
      playing = true; playBtn.textContent = T('cp.pause', '⏸ Pause'); stepBtn.disabled = true; timeScrubber.disabled = true;
      timer = setInterval(stepAll, speedMs);
    }

    function stopPlaying(){
      playing = false; playBtn.textContent = T('cp.play', '▶ Start copying'); stepBtn.disabled = false;
      if (lineages[0].history.length > 1) timeScrubber.disabled = false;
      clearInterval(timer); const genIndex = lineages[0].history.length - 1;
      statusLine.textContent = T('cp.status', 'gen {g} / {max} — {state}', { g: genIndex, max: maxGen, state: T('cp.state.stopped', 'stopped') });
    }

    // A run is for watching. Leaving the room stops it rather than letting it
    // play on, unwatched, in a hidden tab — the reader comes back to the
    // generation they left, not to a finished run.
    document.addEventListener('lab:tabchange', (e)=>{ if(e.detail.tabId !== 'copying') stopPlaying(); });

    playBtn.addEventListener('click', ()=>{ if(playing) stopPlaying(); else startPlaying(); });
    stepBtn.addEventListener('click', ()=>{
      if(!playing) {
        const currentMax = lineages[0].history.length - 1;
        if (parseInt(timeScrubber.value) < currentMax) { scrubTo(currentMax); timeScrubber.value = currentMax; }
        stepAll(); timeScrubber.disabled = false;
      }
    });

    resetBtn.addEventListener('click', ()=>{
      stopPlaying(); ancestor = mutate(freshAncestor(currentShape), 0.4, currentShape);
      buildStage(); statusLine.textContent = T('cp.status', 'gen {g} / {max} — {state}', { g: 0, max: maxGen, state: T('cp.state.idle', 'idle') });
    });

    shapeSeg.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-shape]'); if(!btn) return; stopPlaying();
      [...shapeSeg.children].forEach(b=>b.classList.remove('active')); btn.classList.add('active');
      currentShape = btn.dataset.shape; ancestor = freshAncestor(currentShape);
      buildStage(); statusLine.textContent = T('cp.status', 'gen {g} / {max} — {state}', { g: 0, max: maxGen, state: T('cp.state.idle', 'idle') });
    });

    mutRate.addEventListener('input', ()=>{ 
      mutVal.textContent = mutRate.value; mutSigmaFrac = 0.005 + (mutRate.value/10)*0.12; 
    });
    speedInput.addEventListener('input', ()=>{ 
      speedMs = Number(speedInput.value); speedVal.textContent = `${speedMs} ms/gen`; 
      if(playing){ clearInterval(timer); timer = setInterval(stepAll, speedMs); } 
    });
    maxGenInput.addEventListener('input', ()=>{ 
      maxGen = Math.max(2, Math.min(400, Number(maxGenInput.value)||40)); maxGenVal.textContent = maxGen; 
      const genIndex = lineages[0].history.length - 1; statusLine.textContent = T('cp.status', 'gen {g} / {max} — {state}', { g: genIndex, max: maxGen, state: playing ? T('cp.state.copying', 'copying…') : T('cp.state.idle', 'idle') }); 
    });
    seg.addEventListener('click', (e)=>{ 
      const btn = e.target.closest('button[data-n]'); if(!btn) return; stopPlaying(); 
      [...seg.children].forEach(b=>b.classList.remove('active')); btn.classList.add('active'); 
      lineageCount = Number(btn.dataset.n); buildStage(); statusLine.textContent = T('cp.status', 'gen {g} / {max} — {state}', { g: 0, max: maxGen, state: T('cp.state.idle', 'idle') }); 
    });

    buildStage();
  })();
