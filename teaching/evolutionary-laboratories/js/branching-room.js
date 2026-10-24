  (function(){
    // Fills {placeholders} in an English template string.

    const LEAF_COLOR = { C: 'var(--leaf-c)', D: 'var(--leaf-d)', G: 'var(--leaf-g)', H: 'var(--leaf-h)', I: 'var(--leaf-i)' };

    function buildTopology(N, s2, s3, s4){
      const s1 = 0; const end = N;
      const laneD=0, laneH=1, laneI=2, laneG=3, laneC=4;
      const laneF = (laneH+laneI)/2; const laneE = (laneF+laneG)/2; const laneB = (laneD+laneE)/2; const laneA = (laneB+laneC)/2;
      
      const defs = [
        {id:'A', parent:null, start:0,  end:s1,  lane:laneA, children:['B','C'], color:'var(--ink)'},
        {id:'B', parent:'A',  start:s1, end:s2,  lane:laneB, children:['D','E'], color:'var(--ink)'},
        {id:'C', parent:'A',  start:s1, end:end, lane:laneC, children:[],        color:LEAF_COLOR.C},
        {id:'D', parent:'B',  start:s2, end:end, lane:laneD, children:[],        color:LEAF_COLOR.D},
        {id:'E', parent:'B',  start:s2, end:s3,  lane:laneE, children:['F','G'], color:'var(--ink)'},
        {id:'F', parent:'E',  start:s3, end:s4,  lane:laneF, children:['H','I'], color:'var(--ink)'},
        {id:'G', parent:'E',  start:s3, end:end, lane:laneG, children:[],        color:LEAF_COLOR.G},
        {id:'H', parent:'F',  start:s4, end:end, lane:laneH, children:[],        color:LEAF_COLOR.H},
        {id:'I', parent:'F',  start:s4, end:end, lane:laneI, children:[],        color:LEAF_COLOR.I},
      ];
      return {defs, milestones:{s1,s2,s3,s4,end}, numLanes:5};
    }

    let inferMethod = 'upgma'; // which reconstruction the right-hand panel draws
    // Fixed pace: 40 generations a second. Faster than the Copying Room's 20,
    // because a run here is 500 generations by default rather than 100, and at
    // 20 a second the default run took 25 s to reach the tanglegram; 50 a
    // second was tried and found too quick to follow.
    let currentShape = 'polygon'; let mutSigmaFrac = 0.005 + (3/50)*0.12; const speedMs = 25; let N = 500;
    let playing = false; let timer = null; let g = 0;

    const MIN_SPLIT_GAP = 5;
    function defaultSplits(forN){ return { s2: Math.round(forN*0.4), s3: Math.round(forN*0.7), s4: Math.round(forN*0.9) }; }
    let { s2: splitS2, s3: splitS3, s4: splitS4 } = defaultSplits(N);

    let topo = buildTopology(N, splitS2, splitS3, splitS4); let nodesById = {}; let activeNodes = []; let rootAncestorGenome = null;
    let historyCache = [];

    // Time runs left to right and the whole run is fitted to the panel's width,
    // so generation N always lands at the right-hand edge whatever N is — the
    // tree is read the same way as the split selector above it, which is drawn
    // with the same lanes in the same order (D at the top, C at the bottom).
    // The margins are half a card each so the first and last shapes, which sit
    // centred on their generation, stay inside the panel. Below MIN_CANVAS_W the
    // generations would be too crowded to read, so a phone scrolls sideways
    // instead.
    // Each shape sits on a plain darker square, the same size as the tiles under
    // the tanglegram's final shapes, with no border or label and its edges faded
    // out. Every tile sits on a layer behind every shape, so where two nodes
    // overlap a tile can only cover another tile, never a neighbouring shape.
    // The branches lie between the two layers, over every tile and under every
    // shape, and each fades out towards every shape's centre — fully drawn
    // FADE_TO from it, gone by GAP. Ending them at the tile's edge instead, under
    // the tiles, left a late split only a few faint pixels of branch: its
    // daughters' tiles still overlap their parent's, and a line can only show
    // where no tile covers it.
    const LANE_GAP = 100, CARD = 80, TILE = 80, GAP = 18, FADE_TO = 38, MARGIN_X = CARD/2 + 12, MARGIN_TOP = CARD/2 + 8, MARGIN_BOTTOM = CARD/2 + 48;
    const MIN_CANVAS_W = 520;
    // One weight for every branch the room draws: the growing tree and both
    // halves of the tanglegram.
    const LINE_W = 3;
    let canvasW = MIN_CANVAS_W;

    const shapeSeg = document.getElementById('shapeSeg_branch');
    const mutRate = document.getElementById('mutRate_branch');
    const mutVal = document.getElementById('mutVal_branch');
    const maxGenInput = document.getElementById('maxGen_branch');
    const maxGenVal = document.getElementById('maxGenVal_branch');
    const treeSelector = document.getElementById('treeSelector_branch');
    const selSvg = document.getElementById('selSvg_branch');
    const splitValsLabel = document.getElementById('splitVals_branch');
    const playBtn = document.getElementById('playBtn_branch');
    const stepBtn = document.getElementById('stepBtn_branch');
    const resetBtn = document.getElementById('resetBtn_branch');
    const statusLine = document.getElementById('statusLine_branch');
    const finalStats = document.getElementById('finalStats_branch');
    const treeCanvas = document.getElementById('treeCanvas_branch');
    const linesSvg = document.getElementById('linesSvg_branch');
    const legend = document.getElementById('legend_branch');
    const timeScrubber = document.getElementById('timeScrubber_branch');
    const treeWrap = treeCanvas.parentElement;
    const scrubVal = document.getElementById('scrubVal_branch');

    function genX(gen){ return MARGIN_X + (gen / N) * (canvasW - 2*MARGIN_X); }
    function laneY(lane){ return MARGIN_TOP + lane*LANE_GAP; }
    const axisY = () => laneY(topo.numLanes-1) + CARD/2 + 12;
    function genAt(x){ return (x - MARGIN_X) / (canvasW - 2*MARGIN_X) * N; }

    // A new lineage leaves its parent's shape and eases into its own lane, as
    // the homepage's tree does (_scripts/fr-sim.js), rather than jumping there at
    // a right angle: the same smoothstep over the same 16% of the run. The ease
    // is cut short for a lineage born nearer the end than that, so every leaf is
    // level on its own lane by generation N however late its split was dragged.
    // It is measured from where the parent actually stopped, which is still on
    // its way down if its own split came less than a transition ago.
    const ease = t => t*t*(3 - 2*t);
    const transGens = node => Math.max(1, Math.min(Math.round(N*0.16), N - node.start));
    function nodeY(node, gen){
      if(!node.parent) return laneY(node.lane);
      const from = nodeY(nodesById[node.parent], node.start), to = laneY(node.lane);
      const t = Math.min(1, Math.max(0, (gen - node.start) / transGens(node)));
      return from + (to - from)*ease(t);
    }

    // A lineage's branch while its shape is at atGen: sampled every 2px along
    // the ease and straight once level, and kept out of the squares of both the
    // shape it split from and the shape it has reached, where the fade has
    // already hidden it.
    function branchD(node, atGen){
      const g0 = node.start, g1 = Math.max(g0, atGen);
      const x0 = genX(g0), y0 = nodeY(node, g0), xt = genX(g1), yt = nodeY(node, g1);
      const out = (x, y, cx, cy) => Math.abs(x - cx) >= GAP - 0.5 || Math.abs(y - cy) >= GAP - 0.5;
      const level = Math.min(g1, g0 + transGens(node));
      const step = genAt(MARGIN_X + 2);
      const gens = [];
      for(let gen = g0; gen < level; gen += step) gens.push(gen);
      gens.push(level, genAt(x0 + GAP), genAt(xt - GAP), g1);
      const pts = gens.filter(gen => gen >= g0 && gen <= g1).sort((a, b) => a - b)
        .map(gen => [genX(gen), nodeY(node, gen)])
        .filter(([x, y]) => out(x, y, x0, y0) && out(x, y, xt, yt));
      if(pts.length < 2) return '';
      return pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join('');
    }

    // The panel is the same size from generation 0 to N: the scale is set by the
    // total, not by how far the run has got. Its width is read from the page each
    // time, which is 0 while the room's tab is hidden — hence the floor.
    function sizeCanvas(){
      canvasW = Math.max(MIN_CANVAS_W, treeWrap.clientWidth);
      const totalH = laneY(topo.numLanes-1) + MARGIN_BOTTOM;
      treeCanvas.style.width = canvasW + 'px'; treeCanvas.style.height = totalH + 'px';
      linesSvg.setAttribute('width', canvasW); linesSvg.setAttribute('height', totalH);
      linesSvg.style.width = canvasW+'px'; linesSvg.style.height = totalH+'px';
    }

    // The generation axis, with a faint gridline at each tick. Drawn first after
    // every clear so the branches sit on top of it. Ticks fall on a round step
    // giving at most ten intervals, so the labels never collide at N = 2000.
    function drawAxis(){
      const step = [10, 20, 25, 50, 100, 200, 250, 500].find(s => N / s <= 10) || 500;
      const y = axisY();
      for(let t = 0; t <= N; t += step){
        const x = genX(t);
        const grid = svgLine(x, MARGIN_TOP - CARD/2, x, y, 'var(--paper-dim)', false); grid.setAttribute('stroke-width', 1);
        const tick = svgLine(x, y, x, y + 5, 'var(--ink-soft)', false); tick.setAttribute('stroke-width', 1);
        svgText(x, y + 18, t, 'middle');
      }
      const axis = svgLine(genX(0), y, genX(N), y, 'var(--ink-soft)', false); axis.setAttribute('stroke-width', 1);
      svgText(genX(N), y + 36, T('br.axis', 'generation →'), 'end');
    }

    function svgText(x, y, str, anchor){
      const el = document.createElementNS('http://www.w3.org/2000/svg','text');
      el.setAttribute('x', x); el.setAttribute('y', y); el.setAttribute('text-anchor', anchor);
      el.setAttribute('font-family', 'ui-monospace, monospace'); el.setAttribute('font-size', 11);
      el.setAttribute('fill', 'var(--ink-soft)'); el.textContent = str; linesSvg.insertBefore(el, branchG);
    }

    // Only a phone, where the panel is wider than the screen, has anywhere to
    // scroll: keep the growing tips in sight there.
    function keepGenInView(genIndex){
      const x = genX(genIndex), view = treeWrap.clientWidth, left = treeWrap.scrollLeft;
      if (x < left + CARD || x > left + view - CARD) treeWrap.scrollLeft = x - view*0.6;
    }

    function clampSplits(){
      splitS2 = Math.max(MIN_SPLIT_GAP, Math.min(splitS2, N - 3*MIN_SPLIT_GAP));
      splitS3 = Math.max(splitS2 + MIN_SPLIT_GAP, Math.min(splitS3, N - 2*MIN_SPLIT_GAP));
      splitS4 = Math.max(splitS3 + MIN_SPLIT_GAP, Math.min(splitS4, N - MIN_SPLIT_GAP));
    }

    // "B→D,E: 200 · E→F,G: 350 · F→H,I: 450" named each split by the lineages it
    // makes, and needed 304px of the 293 this field has on a phone — so the label
    // it sits in ran to two lines there. The letters are carried by colour
    // instead: each number takes the colour of the mark you drag to move it, the
    // same three leaf colours drawNode() uses in the selector below, in the same
    // left-to-right order. Colour is not the only cue — the order is the other —
    // and the selector itself is the real control; this is its readout.
    function syncSplitInputs(){
      const at = (gen, leaf) => `<span style="color:var(--leaf-${leaf})">${gen}</span>`;
      splitValsLabel.innerHTML =
        `${at(splitS2, 'd')} · ${at(splitS3, 'g')} · ${at(splitS4, 'h')}`;
      updateSelector();
    }

    function updateSelector() {
      const w = treeSelector.clientWidth; const h = treeSelector.clientHeight; selSvg.innerHTML = ''; 
      const padX = 20; const padY = 15; const effW = w - padX * 2; const effH = h - padY * 2;

      function getX(gen) { return padX + (gen / N) * effW; }
      function getY(lane) { return padY + (lane / 4) * effH; }

      const laneD = 0, laneH = 1, laneI = 2, laneG = 3, laneC = 4;
      const laneF = (laneH + laneI) / 2; const laneE = (laneF + laneG) / 2; const laneB = (laneD + laneE) / 2; const laneA = (laneB + laneC) / 2;

      const s1 = 0; const s1x = getX(s1); const s2x = getX(splitS2); const s3x = getX(splitS3); const s4x = getX(splitS4); const endx = getX(N);

      function drawLine(x1, y1, x2, y2, color, width=2) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', color); line.setAttribute('stroke-width', width); selSvg.appendChild(line);
      }

      function drawNode(x, y, color, id) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', 8);
        circle.setAttribute('fill', color); circle.setAttribute('stroke', 'var(--paper)'); circle.setAttribute('stroke-width', 2);
        circle.style.cursor = 'ew-resize'; circle.dataset.node = id; selSvg.appendChild(circle);
      }

      const cInk = 'var(--ink)';
      drawLine(s1x, getY(laneA), s1x, getY(laneB), cInk); drawLine(s1x, getY(laneA), s1x, getY(laneC), cInk);
      drawLine(s1x, getY(laneC), endx, getY(laneC), 'var(--leaf-c)'); drawLine(s1x, getY(laneB), s2x, getY(laneB), cInk);
      drawLine(s2x, getY(laneB), s2x, getY(laneD), cInk); drawLine(s2x, getY(laneB), s2x, getY(laneE), cInk);
      drawLine(s2x, getY(laneD), endx, getY(laneD), 'var(--leaf-d)'); drawLine(s2x, getY(laneE), s3x, getY(laneE), cInk);
      drawLine(s3x, getY(laneE), s3x, getY(laneG), cInk); drawLine(s3x, getY(laneE), s3x, getY(laneF), cInk);
      drawLine(s3x, getY(laneG), endx, getY(laneG), 'var(--leaf-g)'); drawLine(s3x, getY(laneF), s4x, getY(laneF), cInk);
      drawLine(s4x, getY(laneF), s4x, getY(laneH), cInk); drawLine(s4x, getY(laneF), s4x, getY(laneI), cInk);
      drawLine(s4x, getY(laneH), endx, getY(laneH), 'var(--leaf-h)'); drawLine(s4x, getY(laneI), endx, getY(laneI), 'var(--leaf-i)');

      // A, the ancestor, splits at generation 0 and cannot be moved, so it gets a
      // square rather than a draggable circle — black, as its lineage is drawn.
      const aMark = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      aMark.setAttribute('x', s1x - 7); aMark.setAttribute('y', getY(laneA) - 7);
      aMark.setAttribute('width', 14); aMark.setAttribute('height', 14);
      aMark.setAttribute('fill', cInk); aMark.setAttribute('stroke', 'var(--paper)'); aMark.setAttribute('stroke-width', 2);
      selSvg.appendChild(aMark);

      drawNode(s2x, getY(laneB), 'var(--leaf-d)', 's2'); drawNode(s3x, getY(laneE), 'var(--leaf-g)', 's3'); drawNode(s4x, getY(laneF), 'var(--leaf-h)', 's4');
    }

    let dragNode = null;
    treeSelector.addEventListener('pointerdown', (e) => {
      if (playing) return; const target = e.target;
      if (target.tagName === 'circle' && target.dataset.node) { dragNode = target.dataset.node; treeSelector.setPointerCapture(e.pointerId); }
    });
    treeSelector.addEventListener('pointermove', (e) => {
      if (!dragNode) return; const rect = treeSelector.getBoundingClientRect(); const padX = 20; const effW = rect.width - padX * 2;
      let x = e.clientX - rect.left - padX; let gen = Math.round((x / effW) * N);
      if (dragNode === 's2') splitS2 = gen; if (dragNode === 's3') splitS3 = gen; if (dragNode === 's4') splitS4 = gen;
      clampSplits(); buildStage(); 
    });
    treeSelector.addEventListener('pointerup', (e) => { if (dragNode) { treeSelector.releasePointerCapture(e.pointerId); dragNode = null; } });

    function buildLegend(){
      legend.innerHTML = '';
      const items = [
        ['A–B–E–F', 'var(--ink)', 'Ancestors'], ['C', LEAF_COLOR.C, 'split from A'], ['D', LEAF_COLOR.D, 'split from B'],
        ['G', LEAF_COLOR.G, 'split from E'], ['H', LEAF_COLOR.H, 'split from F'], ['I', LEAF_COLOR.I, 'split from F'],
      ];
      for(const [label,color,title] of items){
        const div = document.createElement('div'); div.className = 'item'; div.title = title;
        div.innerHTML = `<span class="swatch" style="background:${color}"></span><span class="mono" style="font-size:12px;">${label}</span>`;
        legend.appendChild(div);
      }
    }

    // The SVG is rebuilt from nothing on every reset and scrub, so the fade is
    // too: a white mask over the branches with one soft dark disc per shape,
    // moved with its card in placeCard().
    const SVG_NS = 'http://www.w3.org/2000/svg';
    let branchG = null, fadeG = null;
    function clearSvg(){
      while(linesSvg.firstChild) linesSvg.removeChild(linesSvg.firstChild);
      const el = (tag, attrs, parent) => {
        const e = document.createElementNS(SVG_NS, tag);
        for(const k in attrs) e.setAttribute(k, attrs[k]);
        parent.appendChild(e); return e;
      };
      const defs = el('defs', {}, linesSvg);
      const grad = el('radialGradient', { id: 'branchFadeDisc' }, defs);
      el('stop', { offset: GAP/FADE_TO, 'stop-color': '#000', 'stop-opacity': 1 }, grad);
      el('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0 }, grad);
      const mask = el('mask', { id: 'branchFade', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: '100%', height: '100%' }, defs);
      el('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: '#fff' }, mask);
      fadeG = el('g', {}, mask);
      branchG = el('g', { mask: 'url(#branchFade)' }, linesSvg);
    }

    // The axis goes in before the branches so they are drawn over its grid.
    function svgLine(x1,y1,x2,y2,color,dashed){
      const el = document.createElementNS('http://www.w3.org/2000/svg','line');
      el.setAttribute('x1',x1); el.setAttribute('y1',y1); el.setAttribute('x2',x2); el.setAttribute('y2',y2);
      el.setAttribute('stroke', color); el.setAttribute('stroke-width', LINE_W);
      if(dashed) el.setAttribute('stroke-dasharray','4,4'); linesSvg.insertBefore(el, branchG); return el;
    }

    // A lineage's branch, from its birth to where its shape is at atGen. The
    // fork is no longer drawn on its own: it is the two daughters' branches
    // easing out of their parent's square, one up and one down.
    function svgBranch(node, atGen, color){
      const el = document.createElementNS('http://www.w3.org/2000/svg','path');
      el.setAttribute('d', branchD(node, atGen)); el.setAttribute('fill', 'none');
      el.setAttribute('stroke', color); el.setAttribute('stroke-width', LINE_W);
      branchG.appendChild(el); return el;
    }

    function saveBranchingState(currentG) {
      const snapshot = { g: currentG, nodes: {} };
      for (const def of topo.defs) {
        const liveNode = nodesById[def.id];
        if (liveNode && liveNode.genome) {
          snapshot.nodes[def.id] = {
            genome: Object.assign({}, liveNode.genome),
            frozen: liveNode.frozen
          };
        }
      }
      historyCache[currentG] = snapshot;
      timeScrubber.max = currentG;
      timeScrubber.value = currentG;
      scrubVal.textContent = currentG;
    }

    function buildStage(){
      stopPlaying(); clampSplits(); syncSplitInputs(); clearSvg();
      clearCards(); g = 0;
      
      historyCache = [];
      timeScrubber.min = 0; timeScrubber.max = 0; timeScrubber.value = 0;
      scrubVal.textContent = 0; timeScrubber.disabled = true;

      topo = buildTopology(N, splitS2, splitS3, splitS4); nodesById = {};
      for(const def of topo.defs){
        nodesById[def.id] = Object.assign({}, def, { genome: null, cardEl: null, ctx: null, lineEl: null, frozen: false });
      }
      sizeCanvas(); drawAxis();

      const A = nodesById.A; A.genome = rootAncestorGenome;
      A.lineEl = svgBranch(A, 0, 'var(--ink)');
      ensureCard(A); positionCard(A, 0); finalStats.innerHTML = ''; activeNodes = [A];

      saveBranchingState(0);
      statusLine.textContent = T('br.status', 'gen {g} / {max} — {state}', { g: 0, max: N, state: T('br.state.idle', 'idle') });
    }

    function clearCards(){ treeCanvas.querySelectorAll('.node-card, .node-tile').forEach(el => el.remove()); }

    // A lineage's shape and its tile are two separate elements on two layers
    // (z-index in the stylesheet), moved together.
    function ensureCard(node){
      if(node.cardEl) return;
      const tile = document.createElement('div'); tile.className = 'node-tile';
      treeCanvas.appendChild(tile); node.tileEl = tile;
      const card = document.createElement('div'); card.className = 'node-card';
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
      // One shape per lineage on the tree. Nothing on screen names it — the
      // colour of its branch does that — so the canvas names itself.
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Lineage ${node.id}, current shape`);
      card.appendChild(canvas);
      treeCanvas.appendChild(card); node.cardEl = card; node.ctx = canvas.getContext('2d');
      const disc = document.createElementNS(SVG_NS, 'circle');
      disc.setAttribute('r', FADE_TO); disc.setAttribute('fill', 'url(#branchFadeDisc)');
      fadeG.appendChild(disc); node.fadeEl = disc;
    }

    function placeCard(node, atGen){
      const x = genX(atGen), y = nodeY(node, atGen);
      node.fadeEl.setAttribute('cx', x); node.fadeEl.setAttribute('cy', y);
      node.cardEl.style.left = (x - CARD/2) + 'px'; node.cardEl.style.top  = (y - CARD/2) + 'px'; node.cardEl.style.display = 'block';
      node.tileEl.style.left = (x - TILE/2) + 'px'; node.tileEl.style.top  = (y - TILE/2) + 'px'; node.tileEl.style.display = 'block';
    }

    function positionCard(node, atGen){
      placeCard(node, atGen);
      drawGenome(node.ctx, 256, 256, node.genome, currentShape);
    }

    function finalizeNode(node){
      node.frozen = true; node.lineEl.setAttribute('d', branchD(node, node.end));
      if(node.children.length === 0) return;

      const kids = node.children.map(id=>nodesById[id]);
      // With the coloured card borders gone, a surviving lineage is told apart by
      // its branch alone, so it is drawn in its own colour from the start rather
      // than only once the history is scrubbed.
      for(const child of kids){
        child.genome = Object.assign({}, node.genome);
        child.lineEl = svgBranch(child, node.end, child.color);
        ensureCard(child); positionCard(child, node.end); activeNodes.push(child);
      }
    }

    function tick(){
      if(g >= N){ stopPlaying(); return; }
      if(g === 0 && activeNodes.includes(nodesById.A) && !nodesById.A.frozen) { finalizeNode(nodesById.A); activeNodes = activeNodes.filter(n => n !== nodesById.A); }

      g++; const stillActive = [];
      for(const node of activeNodes){
        node.genome = mutate(node.genome, mutSigmaFrac, currentShape); positionCard(node, g); node.lineEl.setAttribute('d', branchD(node, g));
        if(g >= node.end){ finalizeNode(node); } else { stillActive.push(node); }
      }
      activeNodes = stillActive; statusLine.textContent = `gen ${g} / ${N} — ${playing ? 'copying…' : 'stepped'}`;
      keepGenInView(g);

      saveBranchingState(g);
      if(g >= N){ stopPlaying(); showFinalStats(); }
    }

    function scrubTo(genIndex) {
      g = genIndex;
      scrubVal.textContent = genIndex;
      const cache = historyCache[genIndex];
      if (!cache) return;

      activeNodes = [];
      clearSvg(); sizeCanvas(); drawAxis();
      clearCards();

      for (const def of topo.defs) {
        const nodeData = cache.nodes[def.id];
        if (!nodeData) {
          if (nodesById[def.id]) {
            nodesById[def.id].genome = null;
            nodesById[def.id].frozen = false;
            nodesById[def.id].cardEl = null;
          }
          continue;
        }

        nodesById[def.id].genome = Object.assign({}, nodeData.genome);
        nodesById[def.id].frozen = nodeData.frozen;
        nodesById[def.id].cardEl = null; 

        const node = nodesById[def.id];
        node.lineEl = svgBranch(node, Math.min(genIndex, node.end), def.color);

        ensureCard(node);
        placeCard(node, Math.min(genIndex, node.end));

        if (!node.frozen) activeNodes.push(node);
        drawGenome(node.ctx, 256, 256, node.genome, currentShape);
      }

      statusLine.textContent = T('br.status', 'gen {g} / {max} — {state}', { g: genIndex, max: N, state: T('br.state.stopped', 'stopped') });
      keepGenInView(genIndex);
      if (genIndex >= N) { showFinalStats(); } else { finalStats.innerHTML = ''; }
    }

    timeScrubber.addEventListener('input', (e) => { if(!playing) scrubTo(parseInt(e.target.value)); });

    function showFinalStats(){
      const leafOrder = ['C','D','G','H','I']; const leaves = leafOrder.map(id=>nodesById[id]);
      let html = '<table class="divtable"><tr><th></th>' + leaves.map(l=>`<th>${l.id}</th>`).join('') + '</tr>';
      let distMatrix = {};
      
      for(let i=0; i<leaves.length; i++){
        html += `<tr><th>${leaves[i].id}</th>`;
        for(let j=0; j<leaves.length; j++){
          const d = i===j ? 0 : normDist(leaves[i].genome, leaves[j].genome, currentShape);
          html += `<td>${d.toFixed(3)}</td>`; if (i < j) { distMatrix[`${leaves[i].id},${leaves[j].id}`] = d; }
        }
        html += '</tr>';
      }
      html += '</table>';

      let clusters = leafOrder.map(id => ({id: id, count: 1, height: 0}));
      function getClusterDist(c1, c2) {
        if(c1 === c2) return 0;
        let n1 = c1.split(','), n2 = c2.split(','); let sum = 0;
        for(let a of n1) {
          for(let b of n2) {
            let key = a < b ? `${a},${b}` : `${b},${a}`; sum += distMatrix[key];
          }
        }
        return sum / (n1.length * n2.length);
      }
      while(clusters.length > 1) {
        let minDist = Infinity; let mergePair = [-1, -1];
        for(let i=0; i<clusters.length; i++){
          for(let j=i+1; j<clusters.length; j++){
            let d = getClusterDist(clusters[i].id, clusters[j].id); if(d < minDist) { minDist = d; mergePair = [i, j]; }
          }
        }
        let c1 = clusters[mergePair[0]], c2 = clusters[mergePair[1]];
        let newCluster = { id: c1.id + ',' + c2.id, count: c1.count + c2.count, height: minDist / 2, left: c1, right: c2 };
        clusters.splice(mergePair[1], 1); clusters.splice(mergePair[0], 1, newCluster);
      }
      let rootCluster = clusters[0]; let maxH = rootCluster.height || 1;

      let svgLines = '';
      // Rows come straight from the lanes of the tree above, so the tanglegram
      // reads top to bottom in the same order as the tree the run drew (D, H, I,
      // G, C) — it once had its own order, which ended up upside down against
      // the horizontal tree. Each ancestor's lane is already the midpoint of
      // its daughters', so the internal nodes fall into place too.
      const ty = {};
      for (const def of topo.defs) ty[def.id] = 70 + def.lane * 100;

      // Left to right: the true tree, the final shapes in the true tree's order,
      // the lines that carry each shape across to its leaf on the inferred tree,
      // and the inferred tree in an order of its own.
      // The margin is half the root's 50px snapshot plus a little, so it is not
      // cut off at the panel's edge.
      const OUTER_MARGIN = 30; const TREE_SPAN = 340; const LEFT_START = OUTER_MARGIN; const LEFT_END = LEFT_START + TREE_SPAN;
      const ICON_W = 80; const iconX = LEFT_END + 10; const LINKS_START = iconX + ICON_W + 6;
      const RIGHT_LEAF_X = 1000 - OUTER_MARGIN - 40 - TREE_SPAN;
      // Branch lengths are proportional to divergence: a node sits at its own
      // cluster height, measured from the leaf column (height 0). No constant
      // offset is added, so the horizontal run from a leaf to an ancestor is
      // that ancestor's height, and a leaf-to-leaf path is twice it — exactly
      // the Δ between them. See the axis drawn under the tree.
      const RIGHT_SPAN = TREE_SPAN; const RIGHT_MERGE_END = RIGHT_LEAF_X + RIGHT_SPAN; const RIGHT_STUB_END = RIGHT_MERGE_END + 20;
      const RIGHT_AXIS_Y = 545;

      const trueX = (t) => LEFT_START + (t / N) * TREE_SPAN;
      const s1x = trueX(topo.milestones.s1); const s2x = trueX(topo.milestones.s2); const s3x = trueX(topo.milestones.s3); const s4x = trueX(topo.milestones.s4);

      svgLines += `<line x1="${trueX(0)}" y1="${ty.A}" x2="${s1x}" y2="${ty.A}" stroke="var(--ink)" stroke-width="${LINE_W}"/>`;
      svgLines += `<line x1="${s1x}" y1="${ty.C}" x2="${s1x}" y2="${ty.B}" stroke="var(--ink)" stroke-width="${LINE_W}" stroke-linecap="square"/>`;
      svgLines += `<line x1="${s1x}" y1="${ty.C}" x2="${LEFT_END}" y2="${ty.C}" stroke="${LEAF_COLOR.C}" stroke-width="${LINE_W}"/>`;
      svgLines += `<line x1="${s1x}" y1="${ty.B}" x2="${s2x}" y2="${ty.B}" stroke="var(--ink)" stroke-width="${LINE_W}"/>`;
      svgLines += `<line x1="${s2x}" y1="${ty.D}" x2="${s2x}" y2="${ty.E}" stroke="var(--ink)" stroke-width="${LINE_W}" stroke-linecap="square"/>`;
      svgLines += `<line x1="${s2x}" y1="${ty.D}" x2="${LEFT_END}" y2="${ty.D}" stroke="${LEAF_COLOR.D}" stroke-width="${LINE_W}"/>`;
      svgLines += `<line x1="${s2x}" y1="${ty.E}" x2="${s3x}" y2="${ty.E}" stroke="var(--ink)" stroke-width="${LINE_W}"/>`;
      svgLines += `<line x1="${s3x}" y1="${ty.F}" x2="${s3x}" y2="${ty.G}" stroke="var(--ink)" stroke-width="${LINE_W}" stroke-linecap="square"/>`;
      svgLines += `<line x1="${s3x}" y1="${ty.G}" x2="${LEFT_END}" y2="${ty.G}" stroke="${LEAF_COLOR.G}" stroke-width="${LINE_W}"/>`;
      svgLines += `<line x1="${s3x}" y1="${ty.F}" x2="${s4x}" y2="${ty.F}" stroke="var(--ink)" stroke-width="${LINE_W}"/>`;
      svgLines += `<line x1="${s4x}" y1="${ty.H}" x2="${s4x}" y2="${ty.I}" stroke="var(--ink)" stroke-width="${LINE_W}" stroke-linecap="square"/>`;
      svgLines += `<line x1="${s4x}" y1="${ty.H}" x2="${LEFT_END}" y2="${ty.H}" stroke="${LEAF_COLOR.H}" stroke-width="${LINE_W}"/>`;
      svgLines += `<line x1="${s4x}" y1="${ty.I}" x2="${LEFT_END}" y2="${ty.I}" stroke="${LEAF_COLOR.I}" stroke-width="${LINE_W}"/>`;

      const trueInternals = ['A', 'B', 'E', 'F'];
      trueInternals.forEach(id => {
        const nx = trueX(nodesById[id].end); const ny = ty[id];
        svgLines += `
          <foreignObject x="${nx - 25}" y="${ny - 25}" width="50" height="50">
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; border-radius:50%; background:var(--paper); border: 2px solid var(--ink); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <canvas id="true_canvas_${id}" width="100" height="100" style="width:50px; height:50px;"></canvas>
            </div>
          </foreignObject>`;
      });

      leafOrder.forEach(id => {
        svgLines += `
          <foreignObject x="${iconX}" y="${ty[id] - 40}" width="${ICON_W}" height="80">
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; border-radius:4px; background:var(--paper-dim);">
              <canvas id="final_canvas_${id}" width="160" height="160" style="width:80px; height:80px;"></canvas>
            </div>
          </foreignObject>`;
      });

      // Inferred ancestors get a canvas each, whichever method drew the tree.
      let inferredNodes = [];

      // The inferred tree takes the same five rows, but in the order of its own
      // that crosses the true tree least (see untangledLeafOrder in phylo.js).
      // It used to be pinned to the true tree's order, so a wrong grouping was
      // drawn as branches reaching over one another; now the tree is always
      // drawn cleanly and the disagreement shows in the lines between the two.
      const trueRank = {}; leafOrder.forEach(id => { trueRank[id] = ty[id]; });
      const rows = leafOrder.map(id => ty[id]).sort((a, b) => a - b);
      const tyInf = {};
      const placeLeaves = (order) => {
        order.forEach((id, i) => { tyInf[id] = rows[i]; });
        svgLines += tanglegramLinksSvg(leafOrder, LINKS_START, ty, RIGHT_LEAF_X, tyInf, (id) => LEAF_COLOR[id], 2);
      };

      if (inferMethod === 'upgma') {
        placeLeaves(untangledLeafOrder(rootCluster, (n) => n.left ? [n.left, n.right] : [], trueRank));
        function traverseUpgma(node) {
          if (!node.left && !node.right) { node.y = tyInf[node.id]; node.genome = nodesById[node.id].genome; node.isLeaf = true; node.x = RIGHT_LEAF_X; return; }
          traverseUpgma(node.left); traverseUpgma(node.right);
          node.y = (node.left.y + node.right.y) / 2; node.genome = averageGenome(node.left.genome, node.right.genome, currentShape);
          node.isLeaf = false; node.x = RIGHT_LEAF_X + (node.height / maxH) * RIGHT_SPAN; inferredNodes.push(node);

          svgLines += `<line x1="${node.x}" y1="${node.left.y}" x2="${node.x}" y2="${node.right.y}" stroke="var(--ink)" stroke-width="${LINE_W}" stroke-linecap="square"/>`;
          svgLines += `<line x1="${node.x}" y1="${node.left.y}" x2="${node.left.x}" y2="${node.left.y}" stroke="${node.left.isLeaf ? LEAF_COLOR[node.left.id] : 'var(--ink)'}" stroke-width="${LINE_W}"/>`;
          svgLines += `<line x1="${node.x}" y1="${node.right.y}" x2="${node.right.x}" y2="${node.right.y}" stroke="${node.right.isLeaf ? LEAF_COLOR[node.right.id] : 'var(--ink)'}" stroke-width="${LINE_W}"/>`;
        }
        traverseUpgma(rootCluster);
        svgLines += `<line x1="${RIGHT_MERGE_END}" y1="${rootCluster.y}" x2="${RIGHT_STUB_END}" y2="${rootCluster.y}" stroke="var(--ink)" stroke-width="${LINE_W}"/>`;
        svgLines += upgmaAxisSvg(RIGHT_LEAF_X, RIGHT_SPAN, rootCluster.height, RIGHT_AXIS_Y, 'var(--ink-soft)');
      } else {
        // Neighbour-joining: branch lengths differ per lineage, so leaves are
        // NOT aligned — that is the whole point of showing it.
        const njRoot = neighbourJoining(leafOrder, (a, b) => a === b ? 0 : distMatrix[a < b ? `${a},${b}` : `${b},${a}`]);
        placeLeaves(untangledLeafOrder(njRoot, (n) => n.isLeaf ? [] : n.children, trueRank));
        const { scale } = layoutPhylogram(njRoot, tyInf, RIGHT_MERGE_END, RIGHT_SPAN);
        (function genomes(n) {
          if (n.isLeaf) { n.genome = nodesById[n.id].genome; return; }
          n.children.forEach(genomes);
          n.genome = n.children.map(c => c.genome).reduce((acc, g) => acc ? averageGenome(acc, g, currentShape) : g, null);
          inferredNodes.push(n);
        })(njRoot);
        svgLines += phylogramSvg(njRoot, {
          leafColumnX: RIGHT_LEAF_X,
          leafColor: (id) => LEAF_COLOR[id],
          inkColor: 'var(--ink)',
          strokeWidth: LINE_W
        });
        svgLines += `<line x1="${njRoot.x}" y1="${njRoot.y}" x2="${RIGHT_STUB_END}" y2="${njRoot.y}" stroke="var(--ink)" stroke-width="${LINE_W}"/>`;
        svgLines += scaleBarSvg(RIGHT_LEAF_X, RIGHT_AXIS_Y, scale, 'var(--ink-soft)');
      }

      inferredNodes.forEach((node, i) => {
        svgLines += `
          <foreignObject x="${node.x - 25}" y="${node.y - 25}" width="50" height="50">
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; border-radius:50%; background:var(--paper); border: 2px dashed var(--ink); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <canvas id="upgma_canvas_${i}" width="100" height="100" style="width:50px; height:50px;"></canvas>
            </div>
          </foreignObject>`;
      });

      svgLines += `<text x="${(LEFT_START+LEFT_END)/2}" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="var(--ink-soft)">True History</text>`;
      svgLines += `<text x="${iconX + ICON_W/2}" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="var(--ink-soft)">${T('br.finalShapes', 'Final Shapes')}</text>`;
      svgLines += `<text x="${(RIGHT_LEAF_X+RIGHT_STUB_END)/2}" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="var(--ink-soft)">${T('br.inferred', 'Inferred ({m})', { m: inferMethod === 'upgma' ? 'UPGMA' : T('br.nj', 'Neighbour-joining') })}</text>`;

      finalStats.innerHTML = `
        <p style="margin-top:14px;"><strong>${T('br.divMatrix', 'Final divergence matrix (Δ, 0.00 = identical):')}</strong><button class="help-btn" data-help="branchDivMatrix"></button></p>
        ${html}
        <p style="margin-top:24px; margin-bottom: 0; width: 100%; max-width: 1000px;"><strong>${T('br.tanglegram', 'Tanglegram Comparison:')}</strong><button class="help-btn" data-help="tanglegram"></button><br>
        <span style="font-size: 13px; color: var(--ink-soft);">${T('br.tanglegramNote', 'Left: the actual evolutionary timeline you just watched (solid borders mark the true ancestral shapes), with the final shapes beside it. Right: the tree an algorithm infers from those final shapes alone (dashed borders show inferred ancestral states). A dotted line joins each shape to its place in the inferred tree. Where lines cross, the inferred tree cannot be drawn in the true order at all — the reconstruction has moved those lineages. Straight lines mean only that the order agrees, so compare the branch points too: the grouping can still differ.')}</span></p>
        <div class="infer-toggle">
          <span class="infer-toggle-label">${T('br.method', 'Reconstruction method')}</span>
          <div class="segmented" id="inferSeg_branch">
            <button data-method="upgma" class="${inferMethod === 'upgma' ? 'active' : ''}">UPGMA</button>
            <button data-method="nj" class="${inferMethod === 'nj' ? 'active' : ''}">${T('br.nj', 'Neighbour-joining')}</button>
          </div>
          <button class="help-btn" data-help="treeMethod"></button>
        </div>
        <div style="overflow-x: auto; margin-top: 14px;">
          <svg width="1000" height="600" style="background:var(--paper); border:1px solid var(--rule); border-radius:6px; display:block; min-width: 1000px;">
            ${svgLines}
          </svg>
        </div>
      `;
      
      setTimeout(() => {
        leafOrder.forEach(id => {
          const ctx = document.getElementById(`final_canvas_${id}`)?.getContext('2d');
          if(ctx) drawGenome(ctx, 160, 160, nodesById[id].genome, currentShape);
        });
        trueInternals.forEach(id => {
          const ctx = document.getElementById(`true_canvas_${id}`)?.getContext('2d');
          if(ctx) drawGenome(ctx, 100, 100, nodesById[id].genome, currentShape);
        });
        inferredNodes.forEach((node, i) => {
          const ctx = document.getElementById(`upgma_canvas_${i}`)?.getContext('2d');
          if(ctx) drawGenome(ctx, 100, 100, node.genome, currentShape);
        });
      }, 50);
    }

    function startPlaying(){
      if(playing) return; if(g >= N) return;
      const currentMax = historyCache.length - 1;
      if (parseInt(timeScrubber.value) < currentMax) { scrubTo(currentMax); timeScrubber.value = currentMax; }
      playing = true; playBtn.textContent = T('br.pause', '⏸ Pause'); stepBtn.disabled = true; maxGenInput.disabled = true;
      timeScrubber.disabled = true;
      treeSelector.style.pointerEvents = 'none'; treeSelector.style.opacity = '0.5';
      timer = setInterval(tick, speedMs);
    }
    function stopPlaying(){
      playing = false; playBtn.textContent = T('br.play', '▶ Start copying'); stepBtn.disabled = false; maxGenInput.disabled = false;
      if (historyCache.length > 1) timeScrubber.disabled = false;
      treeSelector.style.pointerEvents = 'auto'; treeSelector.style.opacity = '1';
      clearInterval(timer); statusLine.textContent = T('br.status', 'gen {g} / {max} — {state}', { g: g, max: N, state: T('br.state.stopped', 'stopped') });
    }

    // Same as the other rooms that animate: walking away stops the run instead
    // of leaving it to play on in a hidden tab.
    document.addEventListener('lab:tabchange', (e)=>{ if(e.detail.tabId !== 'branching') stopPlaying(); });

    playBtn.addEventListener('click', ()=>{ if(playing) stopPlaying(); else startPlaying(); });
    stepBtn.addEventListener('click', ()=>{ 
      if(!playing) {
        const currentMax = historyCache.length - 1;
        if (parseInt(timeScrubber.value) < currentMax) { scrubTo(currentMax); timeScrubber.value = currentMax; }
        tick(); 
        if (historyCache.length > 1) timeScrubber.disabled = false;
      }
    });
    resetBtn.addEventListener('click', ()=>{ rootAncestorGenome = mutate(freshAncestor(currentShape), 0.4, currentShape); buildStage(); });

    // The toggle lives inside the generated results panel, so it is bound by
    // delegation and simply re-renders that panel from the same final genomes.
    finalStats.addEventListener('click', (e)=>{
      const btn = e.target.closest('#inferSeg_branch button[data-method]');
      if(!btn || btn.dataset.method === inferMethod) return;
      inferMethod = btn.dataset.method;
      showFinalStats();
    });

    mutRate.addEventListener('input', ()=>{ mutVal.textContent = mutRate.value; mutSigmaFrac = 0.005 + (mutRate.value/50)*0.12; });
    maxGenInput.addEventListener('input', ()=>{ maxGenVal.textContent = maxGenInput.value; });
    maxGenInput.addEventListener('change', ()=>{
      N = Math.max(100, Math.min(2000, Number(maxGenInput.value)||500)); maxGenInput.value = N; maxGenVal.textContent = N; buildStage();
    });

    shapeSeg.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-shape]'); if(!btn) return;
      [...shapeSeg.children].forEach(b=>b.classList.remove('active')); btn.classList.add('active');
      currentShape = btn.dataset.shape; rootAncestorGenome = freshAncestor(currentShape); buildStage();
    });

    // The tree's scale now depends on the panel's width, so a new width means
    // redrawing it — at generation 0 too, and mid-run, since the room is also
    // laid out once while its tab is still hidden and has no width at all.
    // Opening the tab fires this (nav.js dispatches a resize on every switch).
    // scrubTo() rebuilds the picture from the history at the current generation;
    // a running timer carries on from there.
    window.addEventListener('resize', () => {
      if(!playing) updateSelector();
      const w = Math.max(MIN_CANVAS_W, treeWrap.clientWidth);
      if (treeWrap.clientWidth === 0 || w === canvasW || !historyCache[g]) return;
      const wasPlaying = playing;
      scrubTo(g);
      if (wasPlaying) statusLine.textContent = `gen ${g} / ${N} — copying…`;
    });

    buildLegend(); rootAncestorGenome = freshAncestor(currentShape); buildStage();
  })();
