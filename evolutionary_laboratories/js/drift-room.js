  (function(){
    // Utility elements
    const DOM = {
      sliderN: document.getElementById('sliderN_drift'),
      sliderF: document.getElementById('sliderF_drift'),
      sliderG: document.getElementById('sliderG_drift'),
      nVal: document.getElementById('nVal_drift'),
      fVal: document.getElementById('fVal_drift'),
      gVal: document.getElementById('gVal_drift'),
      btnRun: document.getElementById('btnRun_drift'),
      btnRun10: document.getElementById('btnRun10_drift'),
      btnPause: document.getElementById('btnPause_drift'),
      btnReset: document.getElementById('btnReset_drift'),
      genDisp: document.getElementById('genDisplay_drift'),
      spinDisp: document.getElementById('spinDisplay_drift'),
      freqDisp: document.getElementById('freqDisplay_drift'),
      statusBar: document.getElementById('statusBar_drift'),
      fixBanner: document.getElementById('fixBanner_drift'),
      wheelCvs: document.getElementById('wheelCanvas_drift'),
      popCvs: document.getElementById('popCanvas_drift'),
      chartCvs: document.getElementById('chartCanvas_drift'),
      binomCvs: document.getElementById('binomCanvas_drift'),
      varCvs: document.getElementById('varCanvas_drift'),
      timeScrubber: document.getElementById('timeScrubber_drift'),
      scrubVal: document.getElementById('scrubVal_drift'),
      expectedK: document.getElementById('expectedK_drift'),
      realizedK: document.getElementById('realizedK_drift'),
      singleRunStage: document.getElementById('singleRunStage_drift'),
      binomCard: document.getElementById('binomCard_drift'),
      varCard: document.getElementById('varCard_drift'),
      readingRow: document.getElementById('readingRow_drift'),
      scrubberRow: document.getElementById('scrubberRow_drift')
    };

    const CTX = {
      w: DOM.wheelCvs.getContext('2d'),
      p: DOM.popCvs.getContext('2d'),
      c: DOM.chartCvs.getContext('2d'),
      b: DOM.binomCvs.getContext('2d'),
      v: DOM.varCvs.getContext('2d')
    };

    const COLORS = {
      paper: '#EDE6D6',
      paperDim: '#E2D9C4',
      ink: '#262220',
      inkSoft: '#6b6258',
      rule: '#cabfa8',
      alleleA: '#3D6E6E', 
      alleleB: '#A8442A',
      stamp: '#C08A2E', // canvas contexts can't resolve var(--stamp), so mirror it literally here
      expectedK: '#1F3A52' // darker blue for the binomial panel's expected-k bar
    };

    // Ten visually distinct colors for the "Run 10 Simulations" overlay chart.
    const MULTI_RUN_COLORS = [
      '#3D6E6E', '#A8442A', '#7A5C99', '#C08A2E', '#3C6E3F',
      '#8B3E62', '#3A5A8C', '#B5651D', '#4F7CAC', '#9B4F4F'
    ];

    let state = {
      N: 50, f: 0.5, G: 100,
      running: false, stopFlag: false,
      pauseRequested: false, paused: false,
      resumeResolve: null,
      wheelAngle: 0, wheelAnim: null,
      freqHistory: [], population: [],
      historyCache: [],
      multiRunMode: false, multiRuns: []
    };

    const _rBuf = new Uint32Array(1);
    function cryptoRand() {
      crypto.getRandomValues(_rBuf);
      return _rBuf[0] / 0x100000000;
    }

    function cryptoRandBatch(count) {
      const buf = new Uint32Array(count);
      crypto.getRandomValues(buf);
      const out = new Float64Array(count);
      for (let i = 0; i < count; i++) out[i] = buf[i] / 0x100000000;
      return out;
    }

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(cryptoRand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    function logFactorial(n) {
      let sum = 0;
      for (let i = 1; i <= n; i++) sum += Math.log(i);
      return sum;
    }

    function binomPmf(k, n, p) {
      if (p <= 0) return k === 0 ? 1 : 0;
      if (p >= 1) return k === n ? 1 : 0;
      if (k < 0 || k > n) return 0;
      const logCoeff = logFactorial(n) - logFactorial(k) - logFactorial(n - k);
      return Math.exp(logCoeff + k * Math.log(p) + (n - k) * Math.log(1 - p));
    }

    function applyGCap() {
      const maxG = Math.floor(4.5 * state.N);
      DOM.sliderG.max = maxG;
      if (state.G > maxG) { 
        state.G = maxG; DOM.sliderG.value = state.G; DOM.gVal.textContent = state.G; 
      }
    }

    DOM.sliderN.addEventListener('input', () => {
      state.N = +DOM.sliderN.value; DOM.nVal.textContent = state.N;
      applyGCap(); if (!state.running) init();
    });

    DOM.sliderF.addEventListener('input', () => { 
      state.f = +DOM.sliderF.value; DOM.fVal.textContent = state.f.toFixed(2); 
      if (!state.running) init(); 
    });

    DOM.sliderG.addEventListener('input', () => { 
      state.G = +DOM.sliderG.value; DOM.gVal.textContent = state.G; 
      if (!state.running) { drawChart(state.freqHistory, state.G); drawVariance(state.freqHistory, state.G); } 
    });

    DOM.btnPause.addEventListener('click', () => {
      if (!state.running) return;
      if (!state.pauseRequested && !state.paused) {
        state.pauseRequested = true;
        DOM.btnPause.textContent = '⏸ Pause requested…';
      } else if (state.paused) {
        state.paused = false; state.pauseRequested = false;
        DOM.btnPause.textContent = '⏸ Pause after gen';
        DOM.btnPause.classList.remove('secondary');
        DOM.btnPause.classList.add('secondary');
        if (state.resumeResolve) { state.resumeResolve(); state.resumeResolve = null; }
      } else {
        state.pauseRequested = false; DOM.btnPause.textContent = '⏸ Pause after gen';
      }
    });

    function waitForResume() {
      return new Promise(res => { state.resumeResolve = res; });
    }

    function init() {
      setMultiRunMode(false);

      state.population = [];
      const countA = Math.round(state.f * state.N);
      for (let i = 0; i < state.N; i++) state.population.push(i < countA ? 'A' : 'B');
      shuffle(state.population);
      
      state.freqHistory = [countA / state.N];
      state.wheelAngle = 0;

      state.historyCache = [{
        population: [...state.population],
        freq: countA / state.N
      }];

      DOM.timeScrubber.min = 0;
      DOM.timeScrubber.max = 0;
      DOM.timeScrubber.value = 0;
      DOM.scrubVal.textContent = 0;
      DOM.timeScrubber.disabled = true;
      
      drawWheel(state.f, 0);
      drawPopSettled(state.population);
      drawChart(state.freqHistory, state.G);
      drawBinom(state.f, state.N);
      drawVariance(state.freqHistory, state.G);
      
      DOM.genDisp.textContent = '0';
      DOM.spinDisp.textContent = '—';
      DOM.freqDisp.textContent = state.f.toFixed(3);
      
      const initF = countA / state.N;
      if (initF === 0 || initF === 1) {
        DOM.fixBanner.textContent = `Already fixed at N=${state.N}, f=${state.f.toFixed(2)}. Adjust parameters to see drift.`;
        DOM.statusBar.textContent = 'Population already fixed — adjust parameters.';
      } else {
        DOM.statusBar.textContent = 'Ready. Press Run Simulation.';
        DOM.fixBanner.textContent = '';
      }
    }

    function drawWheel(freq, angle) {
      scaleCanvas(DOM.wheelCvs, CTX.w, 150, 150);
      const cx = 75, cy = 75, r = 70;
      const ctx = CTX.w;
      ctx.clearRect(0, 0, 150, 150);
      
      const angleA = freq * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.arc(cx, cy, r, angle, angle + angleA); ctx.closePath();
      ctx.fillStyle = COLORS.alleleA; ctx.fill();
      
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.arc(cx, cy, r, angle + angleA, angle + Math.PI*2); ctx.closePath();
      ctx.fillStyle = COLORS.alleleB; ctx.fill();
      
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 3; ctx.stroke();
      
      ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI*2);
      ctx.fillStyle = COLORS.paper; ctx.fill();
      ctx.lineWidth = 2; ctx.stroke();
    }

    function getSpinTiming(spinIdx, genIdx) {
      const TARGET_TOTAL = 50, SLOW_TOTAL = 1000;
      const RAMP_START = 4, RAMP_LEN = 5;
      if (genIdx >= 3) return { dur: Math.round(TARGET_TOTAL * 0.82), gap: Math.round(TARGET_TOTAL * 0.18) };
      if (spinIdx < RAMP_START) return { dur: Math.round(SLOW_TOTAL * 0.82), gap: Math.round(SLOW_TOTAL * 0.18) };
      const t = Math.min((spinIdx - RAMP_START) / RAMP_LEN, 1);
      const total = SLOW_TOTAL + (TARGET_TOTAL - SLOW_TOTAL) * t * t;
      return { dur: Math.round(total * 0.82), gap: Math.round(total * 0.18) };
    }

    function spinWheel(freq, dur) {
      return new Promise(resolve => {
        const X_deg = cryptoRand() * 360;
        const X_rad = X_deg * Math.PI / 180;
        const outcome = X_deg < freq * 360 ? 'A' : 'B';
        
        const fullSpins = 3 + Math.floor(cryptoRand() * 3);
        const totalRot  = -Math.PI/2 - X_rad + fullSpins * Math.PI * 2;
        const start     = performance.now();
        state.wheelAngle = 0;

        function frame(ts) {
          const raw = Math.min((ts - start) / dur, 1);
          const t   = 1 - Math.pow(1 - raw, 3);
          state.wheelAngle = totalRot * t;
          drawWheel(freq, state.wheelAngle);
          
          if (raw < 1) {
            state.wheelAnim = requestAnimationFrame(frame);
          } else {
            state.wheelAngle = ((totalRot % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
            state.wheelAnim  = null;
            resolve(outcome);
          }
        }
        if (state.wheelAnim) cancelAnimationFrame(state.wheelAnim);
        state.wheelAnim = requestAnimationFrame(frame);
      });
    }

    function popGeom() {
      const W = DOM.popCvs.parentElement.offsetWidth || 700;
      const cols = Math.ceil(Math.sqrt(state.N * W / 200));
      const rows = Math.ceil(state.N / cols);
      return { W, cols, cellW: W / cols, cellH: 200 / rows, r: Math.min(W/cols, 200/rows) * 0.28 };
    }

    function drawAlleleMarker(ctx, type, cx, cy, r) {
      ctx.beginPath();
      if (type === 'A') {
        ctx.arc(cx, cy, r, 0, Math.PI*2);
      } else {
        ctx.moveTo(cx, cy-r); ctx.lineTo(cx+r, cy); ctx.lineTo(cx, cy+r); ctx.lineTo(cx-r, cy); ctx.closePath();
      }
    }

    function drawPopSettled(pop) {
      const { W, cols, cellW, cellH, r } = popGeom();
      scaleCanvas(DOM.popCvs, CTX.p, W, 200);
      const ctx = CTX.p;
      ctx.clearRect(0,0,W,200);
      pop.forEach((type, i) => {
        const cx = cellW * ((i%cols) + 0.5), cy = cellH * (Math.floor(i/cols) + 0.5);
        drawAlleleMarker(ctx, type, cx, cy, r);
        ctx.fillStyle = type === 'A' ? COLORS.alleleA : COLORS.alleleB;
        ctx.fill();
      });
    }

    function drawPopInProgress(newPop, highlightIdx) {
      const { W, cols, cellW, cellH, r } = popGeom();
      scaleCanvas(DOM.popCvs, CTX.p, W, 200);
      const ctx = CTX.p;
      ctx.clearRect(0,0,W,200);
      for (let i = 0; i < state.N; i++) {
        const cx = cellW * ((i%cols) + 0.5), cy = cellH * (Math.floor(i/cols) + 0.5);
        if (i === highlightIdx) {
          ctx.beginPath(); ctx.arc(cx, cy, r*1.2, 0, Math.PI*2);
          ctx.fillStyle = COLORS.paperDim; ctx.fill();
          ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 2; ctx.stroke();
        } else if (i < newPop.length) {
          const type = newPop[i];
          drawAlleleMarker(ctx, type, cx, cy, r);
          ctx.fillStyle = type === 'A' ? COLORS.alleleA : COLORS.alleleB;
          ctx.fill();
        }
      }
    }

    function genAxisStep(maxG) {
      if (maxG <= 20) return 5;
      if (maxG <= 60) return 10;
      if (maxG <= 150) return 20;
      if (maxG <= 400) return 50;
      return Math.ceil(maxG / 12 / 100) * 100;
    }

    function drawGenXAxis(ctx, W, H, padL, padR, padB, maxG) {
      const graphW = W - padL - padR;
      const axisY = H - padB;
      const step = genAxisStep(maxG);

      ctx.setLineDash([]);
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, axisY); ctx.lineTo(W - padR, axisY); ctx.stroke();

      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center';

      for (let g = 0; g <= maxG; g += step) {
        const x = padL + (g / maxG) * graphW;
        ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 5); ctx.stroke();
        ctx.fillText(String(g), x, axisY + 16);
      }
      if (maxG % step !== 0) {
        const x = padL + graphW;
        ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 5); ctx.stroke();
        ctx.fillText(String(maxG), x, axisY + 16);
      }

      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('Generation', padL + graphW / 2, H - 2);
      ctx.textAlign = 'left';
    }

    function drawYAxisTitle(ctx, text, x, padT, graphH) {
      ctx.save();
      ctx.translate(x, padT + graphH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    function drawChart(freqHistory, maxG, currentG = freqHistory.length - 1) {
      const W = DOM.chartCvs.parentElement.offsetWidth || 700;
      const H = 180;
      scaleCanvas(DOM.chartCvs, CTX.c, W, H);
      const ctx = CTX.c;
      ctx.clearRect(0, 0, W, H);
      
      const padL = 46, padR = 20, padT = 15, padB = 34;
      const graphW = W - padL - padR;
      const graphH = H - padT - padB;

      const visibleLen = Math.min(currentG + 1, freqHistory.length);

      // Stacked bars: for each generation, the fraction of the population carrying
      // allele A (teal, bottom) vs allele B (red, top), split at that generation's f.
      // Drawn first so gridlines, axes, and the frequency line stay crisp on top.
      if (visibleLen > 0) {
        const barW = Math.max(1, graphW / maxG);
        ctx.save();
        ctx.globalAlpha = 0.45;
        for (let i = 0; i < visibleLen; i++) {
          const x = padL + (i / maxG) * graphW;
          const splitY = padT + graphH * (1 - freqHistory[i]);
          ctx.fillStyle = COLORS.alleleA;
          ctx.fillRect(x, splitY, barW, (padT + graphH) - splitY);
          ctx.fillStyle = COLORS.alleleB;
          ctx.fillRect(x, padT, barW, splitY - padT);
        }
        ctx.restore();
      }

      ctx.strokeStyle = COLORS.rule;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      [0, 0.25, 0.5, 0.75, 1.0].forEach(v => {
        const y = padT + graphH * (1 - v);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.fillStyle = COLORS.inkSoft;
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(v.toFixed(2), padL - 6, y + 4);
      });
      ctx.setLineDash([]);
      ctx.textAlign = 'left';

      drawGenXAxis(ctx, W, H, padL, padR, padB, maxG);
      drawYAxisTitle(ctx, 'Frequency f(A)', 12, padT, graphH);

      if (visibleLen > 0) {
        ctx.beginPath();
        for (let i = 0; i < visibleLen; i++) {
          const x = padL + (i / maxG) * graphW;
          const y = padT + graphH * (1 - freqHistory[i]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (currentG !== undefined && currentG < visibleLen) {
        const x = padL + (currentG / maxG) * graphW;
        ctx.save();
        ctx.strokeStyle = COLORS.stamp;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
        ctx.restore();

        const y = padT + graphH * (1 - freqHistory[currentG]);
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.stamp; ctx.fill();
      }
    }

    // Draws several independent frequency trajectories overlaid on one chart —
    // used by "Run 10 Simulations". Once a run hits fixation (0 or 1) it's an
    // absorbing state, so its line continues flat to maxG rather than stopping
    // abruptly, making it easy to compare outcomes across runs at a glance.
    function drawMultiChart(runs, maxG) {
      const W = DOM.chartCvs.parentElement.offsetWidth || 700;
      const H = 180;
      scaleCanvas(DOM.chartCvs, CTX.c, W, H);
      const ctx = CTX.c;
      ctx.clearRect(0, 0, W, H);

      const padL = 46, padR = 20, padT = 15, padB = 34;
      const graphW = W - padL - padR;
      const graphH = H - padT - padB;

      ctx.strokeStyle = COLORS.rule;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      [0, 0.25, 0.5, 0.75, 1.0].forEach(v => {
        const y = padT + graphH * (1 - v);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.fillStyle = COLORS.inkSoft;
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(v.toFixed(2), padL - 6, y + 4);
      });
      ctx.setLineDash([]);
      ctx.textAlign = 'left';

      drawGenXAxis(ctx, W, H, padL, padR, padB, maxG);
      drawYAxisTitle(ctx, 'Frequency f(A)', 12, padT, graphH);

      runs.forEach((history, i) => {
        if (!history.length) return;
        ctx.beginPath();
        for (let g = 0; g <= maxG; g++) {
          const freq = g < history.length ? history[g] : history[history.length - 1];
          const x = padL + (g / maxG) * graphW;
          const y = padT + graphH * (1 - freq);
          if (g === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = MULTI_RUN_COLORS[i % MULTI_RUN_COLORS.length];
        ctx.lineWidth = 1.75;
        ctx.stroke();
      });
    }

    // Runs one full Wright-Fisher trajectory to completion (or until fixation)
    // synchronously — no per-individual animation, since "Run 10 Simulations"
    // is meant as a quick comparison of outcomes, not a step-by-step demo.
    function simulateOneRun(N, f0, G) {
      const history = [f0];
      let freq = f0;
      for (let g = 1; g <= G; g++) {
        if (freq === 0 || freq === 1) break;
        const rands = cryptoRandBatch(N);
        let countA = 0;
        for (let i = 0; i < N; i++) if (rands[i] < freq) countA++;
        freq = countA / N;
        history.push(freq);
      }
      return history;
    }

    // Shows/hides the panels that only make sense for a single, generation-by-
    // generation run (wheel, population grid, binomial panels, scrubber),
    // leaving just the frequency chart when comparing 10 runs at once.
    function setMultiRunMode(active) {
      state.multiRunMode = active;
      const display = active ? 'none' : '';
      DOM.singleRunStage.style.display = display;
      DOM.binomCard.style.display = display;
      DOM.varCard.style.display = display;
      DOM.readingRow.style.display = display;
      DOM.scrubberRow.style.display = display;
    }

    function drawBinom(p, n, kOutcome = null) {
      const W = DOM.binomCvs.parentElement.offsetWidth || 340;
      const H = 160;
      scaleCanvas(DOM.binomCvs, CTX.b, W, H);
      const ctx = CTX.b;
      ctx.clearRect(0, 0, W, H);

      const expectedKVal = Math.round(n * p);
      DOM.expectedK.textContent = expectedKVal;
      DOM.realizedK.textContent = kOutcome !== null ? Math.round(kOutcome) : '—';
      
      const padL = 46, padR = 15, padT = 15, padB = 34;
      const graphW = W - padL - padR;
      const graphH = H - padT - padB;
      const axisY = H - padB;
      
      let maxP = 0.05;
      for (let k = 0; k <= n; k++) {
        const pmf = binomPmf(k, n, p);
        if (pmf > maxP) maxP = pmf;
      }

      // y-axis: gridlines + probability labels + title
      ctx.strokeStyle = COLORS.rule;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      [0, 0.5, 1.0].forEach(v => {
        const y = padT + graphH * (1 - v);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.fillStyle = COLORS.inkSoft;
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText((v * maxP).toFixed(3), padL - 6, y + 3);
      });
      ctx.setLineDash([]);
      ctx.textAlign = 'left';
      drawYAxisTitle(ctx, 'Probability', 12, padT, graphH);

      // x-axis: solid baseline + tick marks + k labels + title
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, axisY); ctx.lineTo(W - padR, axisY); ctx.stroke();

      const kStep = genAxisStep(n);
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (let k = 0; k <= n; k += kStep) {
        const x = padL + (k / n) * graphW;
        ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 5); ctx.stroke();
        ctx.fillText(String(k), x, axisY + 16);
      }
      if (n % kStep !== 0) {
        const x = padL + graphW;
        ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x, axisY + 5); ctx.stroke();
        ctx.fillText(String(n), x, axisY + 16);
      }
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('k (count of allele A next gen)', padL + graphW / 2, H - 2);
      ctx.textAlign = 'left';

      // bars
      const barW = Math.max(1, graphW / (n + 1));
      for (let k = 0; k <= n; k++) {
        const pmf = binomPmf(k, n, p);
        const x = padL + (k / n) * graphW;
        const h = (pmf / maxP) * graphH;
        const y = axisY - h;
        
        let barColor = COLORS.alleleA;
        if (k === expectedKVal) barColor = COLORS.expectedK;
        if (kOutcome !== null && Math.round(kOutcome) === k) barColor = COLORS.stamp;
        ctx.fillStyle = barColor;
        ctx.fillRect(x - barW/2, y, Math.max(1, barW - 1), h);
      }
    }

    function drawVariance(freqHistory, maxG, currentG = freqHistory.length - 1) {
      const W = DOM.varCvs.parentElement.offsetWidth || 340;
      const H = 160;
      scaleCanvas(DOM.varCvs, CTX.v, W, H);
      const ctx = CTX.v;
      ctx.clearRect(0, 0, W, H);
      
      const padL = 52, padR = 15, padT = 15, padB = 34;
      const graphW = W - padL - padR;
      const graphH = H - padT - padB;
      const maxV = 0.25 / state.N;
      
      ctx.strokeStyle = COLORS.rule;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      [0, 0.5, 1.0].forEach(v => {
        const val = v * maxV;
        const y = padT + graphH * (1 - v);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.fillStyle = COLORS.inkSoft;
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(val.toFixed(4), padL - 6, y + 3);
      });
      ctx.setLineDash([]);
      ctx.textAlign = 'left';

      drawGenXAxis(ctx, W, H, padL, padR, padB, maxG);
      drawYAxisTitle(ctx, 'Variance', 12, padT, graphH);
      
      const visibleLen = Math.min(currentG + 1, freqHistory.length);
      if (visibleLen > 0) {
        ctx.beginPath();
        for (let i = 0; i < visibleLen; i++) {
          const f = freqHistory[i];
          const v = (f * (1 - f)) / state.N;
          const x = padL + (i / maxG) * graphW;
          const y = padT + graphH * (1 - (v / maxV));
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = COLORS.alleleB;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      if (currentG !== undefined && currentG < visibleLen) {
        const x = padL + (currentG / maxG) * graphW;
        ctx.save();
        ctx.strokeStyle = COLORS.stamp;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
        ctx.restore();
      }
    }

    function scrubToDrift(genIndex) {
      DOM.scrubVal.textContent = genIndex;
      const cache = state.historyCache[genIndex];
      if (!cache) return;
      
      DOM.genDisp.textContent = genIndex;
      DOM.freqDisp.textContent = cache.freq.toFixed(3);
      DOM.spinDisp.textContent = '—';
      
      const pFreq = genIndex === 0 ? state.f : state.historyCache[genIndex - 1].freq;
      state.wheelAngle = 0;
      drawWheel(pFreq, 0);
      drawPopSettled(cache.population);
      drawChart(state.freqHistory, state.G, genIndex);
      drawVariance(state.freqHistory, state.G, genIndex);
      drawBinom(pFreq, state.N, genIndex === 0 ? null : cache.freq * state.N);
    }

    DOM.timeScrubber.addEventListener('input', (e) => {
      if (!state.running || state.paused) {
        scrubToDrift(parseInt(e.target.value));
      }
    });

    DOM.btnRun.addEventListener('click', async () => {
      if (state.running) return;

      if (state.multiRunMode) {
        setMultiRunMode(false);
        scrubToDrift(state.historyCache.length - 1);
      }
      
      const currentMax = state.historyCache.length - 1;
      if (parseInt(DOM.timeScrubber.value) < currentMax) {
        scrubToDrift(currentMax);
        DOM.timeScrubber.value = currentMax;
      }
      
      state.running = true; state.stopFlag = false; state.paused = false; state.pauseRequested = false;
      
      DOM.btnRun.disabled = true; DOM.btnRun10.disabled = true; DOM.btnReset.disabled = true;
      DOM.sliderN.disabled = true; DOM.sliderF.disabled = true; DOM.sliderG.disabled = true;
      DOM.timeScrubber.disabled = true;
      
      DOM.btnPause.style.display = 'inline-block';
      DOM.btnPause.textContent = '⏸ Pause after gen';
      
      let gStart = state.freqHistory.length - 1;
      if (gStart >= state.G) { init(); gStart = 0; }
      
      for (let gen = gStart + 1; gen <= state.G; gen++) {
        if (state.stopFlag) break;
        if (state.pauseRequested) {
          state.paused = true;
          state.pauseRequested = false;
          DOM.btnPause.textContent = '▶ Resume simulation';
          DOM.statusBar.textContent = `Simulation paused at generation ${gen - 1}. Scrub history or resume.`;
          if (state.historyCache.length > 1) DOM.timeScrubber.disabled = false;
          await waitForResume();
          const liveMax = state.historyCache.length - 1;
          if (parseInt(DOM.timeScrubber.value) < liveMax) {
            scrubToDrift(liveMax);
            DOM.timeScrubber.value = liveMax;
          }
          state.paused = false;
          DOM.btnPause.textContent = '⏸ Pause after gen';
          DOM.timeScrubber.disabled = true;
        }
        
        DOM.genDisp.textContent = gen;
        const currentF = state.freqHistory[gen - 1];
        let nextPop = [];
        
        if (gen <= 3) {
          DOM.statusBar.textContent = `Generation ${gen}: sampling individuals one-by-one…`;
          for (let i = 0; i < state.N; i++) {
            if (state.stopFlag) break;
            DOM.spinDisp.textContent = `${i + 1} / ${state.N}`;
            const outcome = await spinWheel(currentF, getSpinTiming(i, gen).dur);
            nextPop.push(outcome);
            drawPopInProgress(nextPop, i + 1 < state.N ? i + 1 : -1);
            await delay(getSpinTiming(i, gen).gap);
          }
        } else {
          DOM.statusBar.textContent = `Simulating generation ${gen}…`;
          DOM.spinDisp.textContent = 'instant';
          drawWheel(currentF, state.wheelAngle);
          const rands = cryptoRandBatch(state.N);
          for (let i = 0; i < state.N; i++) nextPop.push(rands[i] < currentF ? 'A' : 'B');
        }
        
        if (state.stopFlag) break;

        const countA = nextPop.filter(x => x === 'A').length;
        const nextFreq = countA / state.N;
        state.population = nextPop;
        state.freqHistory.push(nextFreq);
        
        state.historyCache.push({
          population: [...nextPop],
          freq: nextFreq
        });
        
        DOM.timeScrubber.max = gen;
        DOM.timeScrubber.value = gen;
        DOM.scrubVal.textContent = gen;
        
        DOM.freqDisp.textContent = nextFreq.toFixed(3);
        drawPopSettled(nextPop);
        drawChart(state.freqHistory, state.G);
        drawVariance(state.freqHistory, state.G);
        drawBinom(currentF, state.N, countA);

        if (gen > 3) await delay(200); // ~5 generations/sec once past the animated intro

        if (nextFreq === 0 || nextFreq === 1) {
          DOM.fixBanner.textContent = `Allele ${nextFreq === 1 ? 'A' : 'B'} reached FIXATION at generation ${gen}!`;
          DOM.statusBar.textContent = `Simulation complete. Fixation reached at generation ${gen}.`;
          break;
        }
      }
      
      state.running = false;
      DOM.btnRun.disabled = false; DOM.btnRun10.disabled = false; DOM.btnReset.disabled = false;
      DOM.sliderN.disabled = false; DOM.sliderF.disabled = false; DOM.sliderG.disabled = false;
      if (state.historyCache.length > 1) DOM.timeScrubber.disabled = false;
      DOM.btnPause.style.display = 'none';
      if (!DOM.statusBar.textContent.includes('complete') && !DOM.statusBar.textContent.includes('paused')) {
        DOM.statusBar.textContent = 'Simulation finished.';
      }
    });

    DOM.btnRun10.addEventListener('click', () => {
      if (state.running) return;

      state.stopFlag = true; // in case a single run is paused mid-way
      if (state.resumeResolve) { state.resumeResolve(); state.resumeResolve = null; }

      setMultiRunMode(true);
      DOM.statusBar.textContent = `Ran 10 independent simulations (N=${state.N}, f=${state.f}, G=${state.G}).`;

      state.multiRuns = [];
      for (let i = 0; i < 10; i++) state.multiRuns.push(simulateOneRun(state.N, state.f, state.G));
      drawMultiChart(state.multiRuns, state.G);
    });

    DOM.btnReset.addEventListener('click', () => {
      state.stopFlag = true;
      if (state.resumeResolve) { state.resumeResolve(); state.resumeResolve = null; }
      init();
    });

    window.addEventListener('resize', () => {
      if (state.multiRunMode) {
        drawMultiChart(state.multiRuns, state.G);
      } else if (!state.running || state.paused) {
        const curGen = parseInt(DOM.timeScrubber.value) || 0;
        if (state.historyCache && state.historyCache[curGen]) scrubToDrift(curGen);
      }
    });

    init();
  })();
