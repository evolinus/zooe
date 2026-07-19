  (function(){
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
    let currentShape = 'polygon'; let mutSigmaFrac = 0.005 + (5/50)*0.12; let speedMs = 50; let N = 500;
    let playing = false; let timer = null; let g = 0;

    const MIN_SPLIT_GAP = 5;
    function defaultSplits(forN){ return { s2: Math.round(forN*0.4), s3: Math.round(forN*0.7), s4: Math.round(forN*0.9) }; }
    let { s2: splitS2, s3: splitS3, s4: splitS4 } = defaultSplits(N);

    let topo = buildTopology(N, splitS2, splitS3, splitS4); let nodesById = {}; let activeNodes = []; let rootAncestorGenome = null;
    let historyCache = [];

    const LANE_WIDTH = 220, MARGIN_X = 100, MARGIN_TOP = 80, MARGIN_BOTTOM = 120, ROW_HEIGHT = 2, CARD = 128;
    const MIN_CANVAS_H = 480; // comfortable minimum height even at generation 0

    const shapeSeg = document.getElementById('shapeSeg_branch');
    const mutRate = document.getElementById('mutRate_branch');
    const mutVal = document.getElementById('mutVal_branch');
    const speedInput = document.getElementById('speed_branch');
    const speedVal = document.getElementById('speedVal_branch');
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
    const scrubVal = document.getElementById('scrubVal_branch');

    function xPix(lane){ return MARGIN_X + lane*LANE_WIDTH; }
    function yPix(gen){ return MARGIN_TOP + gen*ROW_HEIGHT; }

    // Grow the tree panel as generations progress instead of reserving the full
    // final height up front — keeps the page compact early on.
    function sizeCanvas(genIndex){
      const totalW = MARGIN_X*2 + (topo.numLanes-1)*LANE_WIDTH;
      const fullH = MARGIN_TOP + N*ROW_HEIGHT + MARGIN_BOTTOM;
      const growH = MARGIN_TOP + Math.max(genIndex, 0)*ROW_HEIGHT + MARGIN_BOTTOM;
      const totalH = Math.min(fullH, Math.max(MIN_CANVAS_H, growH));
      treeCanvas.style.width = totalW + 'px'; treeCanvas.style.height = totalH + 'px';
      linesSvg.setAttribute('width', totalW); linesSvg.setAttribute('height', totalH);
      linesSvg.style.width = totalW+'px'; linesSvg.style.height = totalH+'px';
    }

    // Keep the current generation's row visible so the latest shapes don't
    // require manual scrolling to find, whether stepping/playing or scrubbing.
    function keepGenInView(genIndex){
      const rect = treeCanvas.getBoundingClientRect();
      const rowViewportY = rect.top + yPix(genIndex);
      const margin = window.innerHeight * 0.15;
      if (rowViewportY < margin || rowViewportY > window.innerHeight - margin) {
        const target = window.scrollY + rowViewportY - window.innerHeight * 0.45;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: Math.max(0, Math.min(target, maxScroll)), behavior: 'auto' });
      }
    }

    function clampSplits(){
      splitS2 = Math.max(MIN_SPLIT_GAP, Math.min(splitS2, N - 3*MIN_SPLIT_GAP));
      splitS3 = Math.max(splitS2 + MIN_SPLIT_GAP, Math.min(splitS3, N - 2*MIN_SPLIT_GAP));
      splitS4 = Math.max(splitS3 + MIN_SPLIT_GAP, Math.min(splitS4, N - MIN_SPLIT_GAP));
    }

    function syncSplitInputs(){
      splitValsLabel.textContent = `B→D,E: ${splitS2} · E→F,G: ${splitS3} · F→H,I: ${splitS4}`; updateSelector();
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

    function clearSvg(){ while(linesSvg.firstChild) linesSvg.removeChild(linesSvg.firstChild); }

    function svgLine(x1,y1,x2,y2,color,dashed){
      const el = document.createElementNS('http://www.w3.org/2000/svg','line');
      el.setAttribute('x1',x1); el.setAttribute('y1',y1); el.setAttribute('x2',x2); el.setAttribute('y2',y2);
      el.setAttribute('stroke', color); el.setAttribute('stroke-width', 2);
      if(dashed) el.setAttribute('stroke-dasharray','4,4'); linesSvg.appendChild(el); return el;
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
      treeCanvas.querySelectorAll('.node-card').forEach(el=>el.remove()); g = 0;
      
      historyCache = [];
      timeScrubber.min = 0; timeScrubber.max = 0; timeScrubber.value = 0;
      scrubVal.textContent = 0; timeScrubber.disabled = true;

      topo = buildTopology(N, splitS2, splitS3, splitS4); nodesById = {};
      for(const def of topo.defs){
        nodesById[def.id] = Object.assign({}, def, { genome: null, cardEl: null, ctx: null, lineEl: null, frozen: false });
      }
      sizeCanvas(0);

      const A = nodesById.A; A.genome = rootAncestorGenome;
      A.lineEl = svgLine(xPix(A.lane), yPix(0), xPix(A.lane), yPix(0), 'var(--ink)', false);
      ensureCard(A); positionCard(A, 0); finalStats.innerHTML = ''; activeNodes = [A];

      saveBranchingState(0);
      statusLine.textContent = `gen 0 / ${N} — idle`;
    }

    function ensureCard(node){
      if(node.cardEl) return;
      const card = document.createElement('div'); card.className = 'node-card'; card.style.color = node.color; card.style.borderColor = node.color;
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256; card.appendChild(canvas);
      const tag = document.createElement('div'); tag.className = 'tag mono'; card.appendChild(tag);
      treeCanvas.appendChild(card); node.cardEl = card; node.ctx = canvas.getContext('2d'); node.tagEl = tag;
    }

    function positionCard(node, atGen){
      const x = xPix(node.lane), y = yPix(atGen);
      node.cardEl.style.left = (x - CARD/2) + 'px'; node.cardEl.style.top  = (y - CARD/2) + 'px'; node.cardEl.style.display = 'block';
      node.tagEl.textContent = `${node.id} · gen ${atGen}`; drawGenome(node.ctx, 256, 256, node.genome, currentShape);
    }

    function finalizeNode(node){
      node.frozen = true; if (node.cardEl) node.cardEl.classList.add('frozen'); node.lineEl.setAttribute('y2', yPix(node.end));
      if(node.children.length === 0) return;

      const kids = node.children.map(id=>nodesById[id]); const lanes = kids.map(k=>k.lane); const y = yPix(node.end);
      svgLine(xPix(Math.min(...lanes)), y, xPix(Math.max(...lanes)), y, 'var(--ink)', false);
      for(const child of kids){
        child.genome = Object.assign({}, node.genome);
        child.lineEl = svgLine(xPix(child.lane), y, xPix(child.lane), y, child.color.startsWith('var')? 'var(--ink)': child.color, false);
        ensureCard(child); positionCard(child, node.end); activeNodes.push(child);
      }
    }

    function tick(){
      if(g >= N){ stopPlaying(); return; }
      if(g === 0 && activeNodes.includes(nodesById.A) && !nodesById.A.frozen) { finalizeNode(nodesById.A); activeNodes = activeNodes.filter(n => n !== nodesById.A); }

      g++; const stillActive = [];
      for(const node of activeNodes){
        node.genome = mutate(node.genome, mutSigmaFrac, currentShape); positionCard(node, g); node.lineEl.setAttribute('y2', yPix(g));
        if(g >= node.end){ finalizeNode(node); } else { stillActive.push(node); }
      }
      activeNodes = stillActive; statusLine.textContent = `gen ${g} / ${N} — ${playing ? 'copying…' : 'stepped'}`;
      sizeCanvas(g);
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
      clearSvg();
      treeCanvas.querySelectorAll('.node-card').forEach(el => el.remove());

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
        const lineY2 = yPix(Math.min(genIndex, node.end));
        const lineColor = (genIndex >= node.end && node.children.length > 0) ? 'var(--ink)' : def.color;
        node.lineEl = svgLine(xPix(node.lane), yPix(node.start), xPix(node.lane), lineY2, lineColor, false);

        if (genIndex >= node.end && node.children.length > 0) {
          const kids = node.children.map(id => nodesById[id]);
          const lanes = kids.map(k => k.lane);
          svgLine(xPix(Math.min(...lanes)), yPix(node.end), xPix(Math.max(...lanes)), yPix(node.end), 'var(--ink)', false);
        }

        ensureCard(node);
        const cardGen = Math.min(genIndex, node.end);
        node.cardEl.style.left = (xPix(node.lane) - CARD/2) + 'px';
        node.cardEl.style.top  = (yPix(cardGen) - CARD/2) + 'px';
        node.cardEl.style.display = 'block';
        node.tagEl.textContent = `${node.id} · gen ${cardGen}`;
        
        if (node.frozen) {
          node.cardEl.classList.add('frozen');
        } else {
          node.cardEl.classList.remove('frozen');
          activeNodes.push(node);
        }
        drawGenome(node.ctx, 256, 256, node.genome, currentShape);
      }

      statusLine.textContent = `gen ${genIndex} / ${N} — stopped`;
      sizeCanvas(genIndex);
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
      const ty = { C: 70, D: 170, G: 270, H: 370, I: 470 };
      ty.F = (ty.H + ty.I) / 2; ty.E = (ty.F + ty.G) / 2; ty.B = (ty.D + ty.E) / 2; ty.A = (ty.C + ty.B) / 2;

      const OUTER_MARGIN = 20; const TREE_SPAN = 400; const LEFT_START = OUTER_MARGIN; const LEFT_END = LEFT_START + TREE_SPAN;    
      const GAP_START = LEFT_END; const GAP_END = 1000 - OUTER_MARGIN - TREE_SPAN; const RIGHT_LEAF_X = GAP_END;                          
      // Branch lengths are proportional to divergence: a node sits at its own
      // cluster height, measured from the leaf column (height 0). No constant
      // offset is added, so the horizontal run from a leaf to an ancestor is
      // that ancestor's height, and a leaf-to-leaf path is twice it — exactly
      // the Δ between them. See the axis drawn under the tree.
      const RIGHT_SPAN = TREE_SPAN - 20; const RIGHT_MERGE_END = RIGHT_LEAF_X + RIGHT_SPAN; const RIGHT_STUB_END = RIGHT_MERGE_END + 20;
      const RIGHT_AXIS_Y = 545;

      const trueX = (t) => LEFT_START + (t / N) * TREE_SPAN;
      const s1x = trueX(topo.milestones.s1); const s2x = trueX(topo.milestones.s2); const s3x = trueX(topo.milestones.s3); const s4x = trueX(topo.milestones.s4);

      svgLines += `<line x1="${trueX(0)}" y1="${ty.A}" x2="${s1x}" y2="${ty.A}" stroke="var(--ink)" stroke-width="2"/>`;
      svgLines += `<line x1="${s1x}" y1="${ty.C}" x2="${s1x}" y2="${ty.B}" stroke="var(--ink)" stroke-width="2"/>`;
      svgLines += `<line x1="${s1x}" y1="${ty.C}" x2="${LEFT_END}" y2="${ty.C}" stroke="${LEAF_COLOR.C}" stroke-width="2"/>`;
      svgLines += `<line x1="${s1x}" y1="${ty.B}" x2="${s2x}" y2="${ty.B}" stroke="var(--ink)" stroke-width="2"/>`;
      svgLines += `<line x1="${s2x}" y1="${ty.D}" x2="${s2x}" y2="${ty.E}" stroke="var(--ink)" stroke-width="2"/>`;
      svgLines += `<line x1="${s2x}" y1="${ty.D}" x2="${LEFT_END}" y2="${ty.D}" stroke="${LEAF_COLOR.D}" stroke-width="2"/>`;
      svgLines += `<line x1="${s2x}" y1="${ty.E}" x2="${s3x}" y2="${ty.E}" stroke="var(--ink)" stroke-width="2"/>`;
      svgLines += `<line x1="${s3x}" y1="${ty.F}" x2="${s3x}" y2="${ty.G}" stroke="var(--ink)" stroke-width="2"/>`;
      svgLines += `<line x1="${s3x}" y1="${ty.G}" x2="${LEFT_END}" y2="${ty.G}" stroke="${LEAF_COLOR.G}" stroke-width="2"/>`;
      svgLines += `<line x1="${s3x}" y1="${ty.F}" x2="${s4x}" y2="${ty.F}" stroke="var(--ink)" stroke-width="2"/>`;
      svgLines += `<line x1="${s4x}" y1="${ty.H}" x2="${s4x}" y2="${ty.I}" stroke="var(--ink)" stroke-width="2"/>`;
      svgLines += `<line x1="${s4x}" y1="${ty.H}" x2="${LEFT_END}" y2="${ty.H}" stroke="${LEAF_COLOR.H}" stroke-width="2"/>`;
      svgLines += `<line x1="${s4x}" y1="${ty.I}" x2="${LEFT_END}" y2="${ty.I}" stroke="${LEAF_COLOR.I}" stroke-width="2"/>`;

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

      const ICON_W = 80; const iconX = GAP_START + (GAP_END - GAP_START - ICON_W) / 2;
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

      if (inferMethod === 'upgma') {
        function traverseUpgma(node) {
          if (!node.left && !node.right) { node.y = ty[node.id]; node.genome = nodesById[node.id].genome; node.isLeaf = true; node.x = RIGHT_LEAF_X; return; }
          traverseUpgma(node.left); traverseUpgma(node.right);
          node.y = (node.left.y + node.right.y) / 2; node.genome = averageGenome(node.left.genome, node.right.genome, currentShape);
          node.isLeaf = false; node.x = RIGHT_LEAF_X + (node.height / maxH) * RIGHT_SPAN; inferredNodes.push(node);

          svgLines += `<line x1="${node.x}" y1="${node.left.y}" x2="${node.x}" y2="${node.right.y}" stroke="var(--ink)" stroke-width="2"/>`;
          svgLines += `<line x1="${node.x}" y1="${node.left.y}" x2="${node.left.x}" y2="${node.left.y}" stroke="${node.left.isLeaf ? LEAF_COLOR[node.left.id] : 'var(--ink)'}" stroke-width="2"/>`;
          svgLines += `<line x1="${node.x}" y1="${node.right.y}" x2="${node.right.x}" y2="${node.right.y}" stroke="${node.right.isLeaf ? LEAF_COLOR[node.right.id] : 'var(--ink)'}" stroke-width="2"/>`;
        }
        traverseUpgma(rootCluster);
        svgLines += `<line x1="${RIGHT_MERGE_END}" y1="${rootCluster.y}" x2="${RIGHT_STUB_END}" y2="${rootCluster.y}" stroke="var(--ink)" stroke-width="2"/>`;
        svgLines += upgmaAxisSvg(RIGHT_LEAF_X, RIGHT_SPAN, rootCluster.height, RIGHT_AXIS_Y, 'var(--ink-soft)');
      } else {
        // Neighbour-joining: branch lengths differ per lineage, so leaves are
        // NOT aligned — that is the whole point of showing it.
        const njRoot = neighborJoining(leafOrder, (a, b) => a === b ? 0 : distMatrix[a < b ? `${a},${b}` : `${b},${a}`]);
        const { scale } = layoutPhylogram(njRoot, ty, RIGHT_MERGE_END, RIGHT_SPAN);
        (function genomes(n) {
          if (n.isLeaf) { n.genome = nodesById[n.id].genome; return; }
          n.children.forEach(genomes);
          n.genome = n.children.map(c => c.genome).reduce((acc, g) => acc ? averageGenome(acc, g, currentShape) : g, null);
          inferredNodes.push(n);
        })(njRoot);
        svgLines += phylogramSvg(njRoot, {
          leafColumnX: RIGHT_LEAF_X,
          leafColor: (id) => LEAF_COLOR[id],
          inkColor: 'var(--ink)'
        });
        svgLines += `<line x1="${njRoot.x}" y1="${njRoot.y}" x2="${RIGHT_STUB_END}" y2="${njRoot.y}" stroke="var(--ink)" stroke-width="2"/>`;
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
      svgLines += `<text x="${(GAP_START+GAP_END)/2}" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="var(--ink-soft)">Final Shapes</text>`;
      svgLines += `<text x="${(RIGHT_LEAF_X+RIGHT_STUB_END)/2}" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="var(--ink-soft)">Inferred (${inferMethod === 'upgma' ? 'UPGMA' : 'Neighbour-joining'})</text>`;

      finalStats.innerHTML = `
        <p style="margin-top:14px;"><strong>Final divergence matrix (Δ, 0.00 = identical):</strong><button class="help-btn" data-help="branchDivMatrix"></button></p>
        ${html}
        <p style="margin-top:24px; margin-bottom: 0; width: 100%; max-width: 1000px;"><strong>Tanglegram Comparison:</strong><button class="help-btn" data-help="tanglegram"></button><br>
        <span style="font-size: 13px; color: var(--ink-soft);">Left: The actual evolutionary timeline you just watched (solid borders mark the true divergence shape). Right: The phylogenetic tree inferred by an algorithm using only the final observable shapes (dashed borders show mathematically inferred ancestral states). Notice any discrepancies?</span></p>
        <div class="infer-toggle">
          <span class="infer-toggle-label">Reconstruction method</span>
          <div class="segmented" id="inferSeg_branch">
            <button data-method="upgma" class="${inferMethod === 'upgma' ? 'active' : ''}">UPGMA</button>
            <button data-method="nj" class="${inferMethod === 'nj' ? 'active' : ''}">Neighbour-joining</button>
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
      playing = true; playBtn.textContent = '⏸ Pause'; stepBtn.disabled = true; maxGenInput.disabled = true;
      timeScrubber.disabled = true;
      treeSelector.style.pointerEvents = 'none'; treeSelector.style.opacity = '0.5';
      timer = setInterval(tick, speedMs);
    }
    function stopPlaying(){
      playing = false; playBtn.textContent = '▶ Start copying'; stepBtn.disabled = false; maxGenInput.disabled = false;
      if (historyCache.length > 1) timeScrubber.disabled = false;
      treeSelector.style.pointerEvents = 'auto'; treeSelector.style.opacity = '1';
      clearInterval(timer); statusLine.textContent = `gen ${g} / ${N} — stopped`;
    }

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
    speedInput.addEventListener('input', ()=>{
      speedMs = Number(speedInput.value); speedVal.textContent = `${speedMs} ms/gen`;
      if(playing){ clearInterval(timer); timer = setInterval(tick, speedMs); }
    });
    maxGenInput.addEventListener('input', ()=>{ maxGenVal.textContent = maxGenInput.value; });
    maxGenInput.addEventListener('change', ()=>{
      N = Math.max(100, Math.min(2000, Number(maxGenInput.value)||500)); maxGenInput.value = N; maxGenVal.textContent = N; buildStage();
    });

    shapeSeg.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-shape]'); if(!btn) return;
      [...shapeSeg.children].forEach(b=>b.classList.remove('active')); btn.classList.add('active');
      currentShape = btn.dataset.shape; rootAncestorGenome = freshAncestor(currentShape); buildStage();
    });

    window.addEventListener('resize', () => { 
      if(!playing) {
        updateSelector(); 
        const curGen = parseInt(timeScrubber.value) || 0;
        if (curGen > 0 && historyCache[curGen]) scrubTo(curGen);
      }
    });

    buildLegend(); rootAncestorGenome = freshAncestor(currentShape); buildStage();
  })();
