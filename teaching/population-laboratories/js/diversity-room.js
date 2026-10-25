// THE DIVERSITY ROOM — measuring a community.
//
// Every other room follows one, two or three species through time. This one
// stands back and asks how a community of many is described: by its richness,
// by how evenly its individuals are shared out, and by the two indices that
// fold those together,
//
//   H′ = −Σ pᵢ ln pᵢ        D = Σ pᵢ²
//
// read here, as Jost (2006) argues they should be, as effective numbers of
// species — ¹D = e^H′ and ²D = 1/D — so that both sit on the same scale as
// richness and the three can be compared by eye.
//
// The room is in three steps, and they share one piece of state, the community
// the reader builds in step 1. Step 2 samples it, because no ecologist ever
// sees a whole community, and the room's most practical lesson is how
// differently the three numbers survive being estimated from a catch. Step 3
// lets it drift as a neutral Moran community, which is the Drift Room of the
// companion lab with species in place of alleles: diversity drains away with
// no species better than any other, unless immigrants keep bringing it back.
//
// The editor and the indices are arithmetic; the sample and the drift are
// random draws, and only the drift goes through the room's player and scrubber.

(function () {
  const MAX_S = 12;
  const LETTERS = 'ABCDEFGHIJKL';
  const FRAMES = 300;          // drift playback resolution, as in the other rooms
  const MAX_W = 100;           // the editor's abundance scale
  const SAMPLES = 100;

  // Twelve species need twelve colours. The first nine are the lab's own
  // series colours, in an order that keeps neighbouring bars apart; the last
  // three are lighter relatives, for the rare species a reader adds at the end.
  const COLORS = ['#2E5C8A', '#A8442A', '#388047', '#B8862E', '#7A5C99', '#3D6E6E',
                  '#8C3F5D', '#5E6B21', '#454B96', '#C0703A', '#6B8FB3', '#9C8A5A'];

  // The three effective numbers keep one colour each everywhere they appear:
  // richness in ink, Shannon's in the lab's blue, Simpson's in terracotta —
  // the same pairing the chips beneath the panels carry.
  const C_D0 = () => LAB.C.ink;
  const C_D1 = () => LAB.C.res1;
  const C_D2 = () => LAB.C.spB;

  let ui, plots;
  const w = new Array(MAX_S).fill(0);   // abundance of each species, 0–100
  let S = 8;                            // species in the pool (bars shown)
  let sel = 0;                          // the bar the keyboard is on
  let drag = false;

  let one = null;      // the last single sample
  let batch = null;    // the last hundred
  let sim = null, dirty = true;

  // ------------------------------------------------------------- the indices

  // From any list of non-negative amounts — the editor's abundances, a
  // sample's counts, the drift's census — since every index here depends on
  // the shares alone.
  function indices(xs) {
    let tot = 0, s = 0;
    for (const x of xs) { tot += x; if (x > 0) s++; }
    if (!(tot > 0)) return { S: 0, H: 0, D: 1, d0: 0, d1: 0, d2: 0, J: NaN };
    let H = 0, D = 0;
    for (const x of xs) {
      if (!(x > 0)) continue;
      const p = x / tot;
      H -= p * Math.log(p);
      D += p * p;
    }
    return { S: s, H, D, d0: s, d1: Math.exp(H), d2: 1 / D, J: s > 1 ? H / Math.log(s) : NaN };
  }

  const pool = () => w.slice(0, S);
  function shares() {
    const xs = pool(), tot = xs.reduce((a, b) => a + b, 0);
    return xs.map(x => (tot > 0 ? x / tot : 0));
  }

  // ----------------------------------------------------------------- presets

  // Shapes of community a reader should meet, not a menu of realistic ones.
  // Geometric is the default because it is the commonest textbook shape and
  // already uneven, so the three effective numbers start visibly apart.
  const PRESETS = {
    even:      i => 50,
    geometric: i => Math.max(1, Math.round(100 * Math.pow(0.55, i))),
    dominant:  i => (i === 0 ? 100 : 5),
    tworare:   i => (i === 0 ? 100 : i === 1 ? 80 : 3)
  };

  function applyPreset(key) {
    const f = PRESETS[key];
    if (!f) return;
    for (let i = 0; i < MAX_S; i++) w[i] = i < S ? f(i) : 0;
    onCommunityChange();
  }

  // A preset is a starting point, not a state the community stays in: once a
  // bar is dragged, no button should go on claiming the community is "Even".
  function clearPreset() { ui.preset.btns.forEach(b => b.classList.remove('active')); }

  function setPoolSize(v) {
    const next = LAB.clamp(Math.round(v), 2, MAX_S);
    // Species joining the pool arrive moderately common unless something has
    // already given them an abundance — Add a rare species sets theirs first.
    for (let i = S; i < next; i++) if (!(w[i] > 0)) w[i] = 20;
    for (let i = next; i < MAX_S; i++) w[i] = 0;
    S = next;
    sel = Math.min(sel, S - 1);
    ui.addRare.disabled = S >= MAX_S;
    onCommunityChange();
  }

  // The community changed, so everything computed from it is out of date: the
  // samples were drawn from another community, and the next Run must start
  // from this one. The finished drift stays on screen until then.
  function onCommunityChange() {
    if (w.slice(0, S).every(x => !(x > 0))) w[0] = 1;   // never an empty community
    one = null; batch = null; dirty = true;
    ui.status2.textContent = 'No sample taken yet.';
    drawEditor(); drawHill(); drawSample(); drawAcc(); drawHist();
    writeCommunity();
    player.redraw();
  }

  // ------------------------------------------------------------------ editor

  function drawEditor() {
    const p = plots.editor;
    const sh = shares();
    p.begin({ height: 250, padL: 46, xMin: 0, xMax: S, yMin: 0, yMax: MAX_W * 1.12,
              xLabel: 'Species', yLabel: 'Individuals' });
    p.grid({ yTicks: 5, xGrid: false, xStep: 1000, xFmt: () => '' });
    const ctx = p.ctx;
    const slot = p.plotW / S, bw = Math.min(slot * 0.68, 46);
    // On a phone a slot is under 40px, and "2.3%" beside "1.4%" runs into one
    // word; there the small shares are rounded to whole percentages.
    const narrow = slot < 40;
    ctx.save();
    ctx.font = (narrow ? '9px' : '10px') + ' ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < S; i++) {
      const cx = p.left + slot * (i + 0.5);
      const top = p.py(w[i]);
      if (w[i] > 0) {
        ctx.fillStyle = COLORS[i];
        ctx.fillRect(cx - bw / 2, top, bw, p.bottom - top);
        ctx.fillStyle = LAB.C.ink;
        ctx.textBaseline = 'bottom';
        ctx.fillText(narrow ? fmtPctShort(sh[i]) : fmtPct(sh[i]), cx, top - 3);
      } else {
        // An absent species keeps its place, so the reader can drag it back.
        ctx.strokeStyle = LAB.C.rule;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(cx - bw / 2 + 0.5, p.bottom - 14, bw - 1, 13);
        ctx.setLineDash([]);
      }
      ctx.fillStyle = w[i] > 0 ? LAB.C.ink : LAB.C.inkSoft;
      ctx.textBaseline = 'top';
      ctx.fillText(LETTERS[i], cx, p.bottom + 6);
      if (i === sel && document.activeElement === plots.editorCvs) {
        ctx.strokeStyle = LAB.C.ink;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - slot / 2 + 2, p.top + 1, slot - 4, p.bottom - p.top - 2);
      }
    }
    ctx.restore();
    const ix = indices(pool());
    p.describe(`The community: ${ix.S} species. `
      + pool().map((x, i) => `${LETTERS[i]} ${x > 0 ? fmtPct(sh[i]) : 'absent'}`).join(', ')
      + '. Drag a bar, or use the arrow keys.');
    p.frame();
  }

  const fmtPct = p => (p >= 0.995 ? '100%' : p >= 0.1 ? Math.round(p * 100) + '%'
                      : p > 0 ? (p * 100).toFixed(1) + '%' : '0');
  const fmtPctShort = p => (p >= 0.995 ? '100%' : p >= 0.01 ? Math.round(p * 100) + '%'
                           : p > 0 ? '<1%' : '0');

  // Which bar a pointer is over, and the abundance its height stands for.
  function pointerTo(e) {
    const r = plots.editorCvs.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const i = Math.floor(plots.editor.ix(x));
    const v = Math.round(LAB.clamp(plots.editor.iy(y), 0, MAX_W));
    return { i: LAB.clamp(i, 0, S - 1), v };
  }

  function setBar(i, v) {
    if (w[i] === v) return;
    w[i] = v;
    clearPreset();
    onCommunityChange();
  }

  function bindEditor() {
    const cvs = plots.editorCvs;
    cvs.addEventListener('pointerdown', e => {
      drag = true;
      cvs.setPointerCapture(e.pointerId);
      const { i, v } = pointerTo(e);
      sel = i; setBar(i, v);
    });
    cvs.addEventListener('pointermove', e => {
      if (!drag) return;
      const { v } = pointerTo(e);
      setBar(sel, v);
    });
    const end = e => { if (drag) { drag = false; try { cvs.releasePointerCapture(e.pointerId); } catch (_) {} } };
    cvs.addEventListener('pointerup', end);
    cvs.addEventListener('pointercancel', end);
    cvs.addEventListener('keydown', e => {
      const step = e.shiftKey ? 1 : 5;
      if (e.key === 'ArrowLeft') { sel = Math.max(0, sel - 1); drawEditor(); }
      else if (e.key === 'ArrowRight') { sel = Math.min(S - 1, sel + 1); drawEditor(); }
      else if (e.key === 'ArrowUp') setBar(sel, Math.min(MAX_W, w[sel] + step));
      else if (e.key === 'ArrowDown') setBar(sel, Math.max(0, w[sel] - step));
      else return;
      e.preventDefault();
    });
    cvs.addEventListener('focus', drawEditor);
    cvs.addEventListener('blur', drawEditor);
  }

  // The three effective numbers as bars on one axis of species. The axis runs
  // to the pool's maximum rather than to the current S, so adding a species
  // visibly lengthens one bar instead of rescaling the whole panel.
  function drawHill() {
    const p = plots.hill;
    const ix = indices(pool());
    p.begin({ height: 250, padL: 86, padB: 40, xMin: 0, xMax: MAX_S, yMin: 0, yMax: 3,
              xLabel: 'Effective number of species' });
    p.grid({ xStep: 2, yStep: 10, yFmt: () => '' });
    const ctx = p.ctx;
    const rows = [
      { label: 'Richness', sub: '⁰D = S', v: ix.d0, color: C_D0() },
      { label: 'Shannon', sub: '¹D = e^H′', v: ix.d1, color: C_D1() },
      { label: 'Simpson', sub: '²D = 1/D', v: ix.d2, color: C_D2() }
    ];
    const band = p.plotH / 3;
    ctx.save();
    rows.forEach((r, k) => {
      const yc = p.top + band * (k + 0.5), h = Math.min(band * 0.5, 30);
      const x1 = p.px(r.v);
      ctx.fillStyle = r.color;
      ctx.globalAlpha = 0.88;
      ctx.fillRect(p.left, yc - h / 2, x1 - p.left, h);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = x1 > p.right - 40 ? 'right' : 'left';
      ctx.fillStyle = x1 > p.right - 40 ? LAB.C.paper : LAB.C.ink;
      ctx.fillText(r.v.toFixed(r.v === Math.round(r.v) ? 0 : 2), x1 > p.right - 40 ? x1 - 5 : x1 + 5, yc);
      ctx.textAlign = 'right';
      ctx.fillStyle = LAB.C.ink;
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(r.label, p.left - 8, yc - 7);
      ctx.fillStyle = LAB.C.inkSoft;
      ctx.font = '9.5px ui-monospace, monospace';
      ctx.fillText(r.sub, p.left - 8, yc + 7);
    });
    ctx.restore();
    p.describe(`Effective number of species: richness ${ix.d0}, Shannon ${ix.d1.toFixed(2)}, `
             + `Simpson ${ix.d2.toFixed(2)}.`);
    p.frame();
  }

  function writeCommunity() {
    const ix = indices(pool());
    ui.SDisp.textContent = ix.S;
    ui.HDisp.textContent = ix.H.toFixed(3);
    ui.DDisp.textContent = ix.D.toFixed(3);
    ui.JDisp.textContent = isFinite(ix.J) ? ix.J.toFixed(3) : '—';
    ui.commStat.textContent = `¹D ${ix.d1.toFixed(2)} · ²D ${ix.d2.toFixed(2)}`;
    const sh = shares();
    const top = Math.max(...sh);
    let txt = `<strong>${ix.S} species</strong>, but the community is as diverse as about `
            + `<strong>${ix.d1.toFixed(1)}</strong> equally common species by Shannon's measure and `
            + `<strong>${ix.d2.toFixed(1)}</strong> by Simpson's. `;
    if (ix.S <= 1) {
      txt = `One species holds every individual: richness, Shannon's number and Simpson's number are all 1, `
          + `and there is no evenness to speak of.`;
    } else if (ix.d0 - ix.d2 < 0.05) {
      txt += `All three agree because every species is equally common — the only community in which they do.`;
    } else {
      txt += `The gap between those and ${ix.S} is unevenness: the commonest species holds `
           + `${fmtPct(top)} of the individuals, and Simpson's number, which is set mostly by the `
           + `commonest species, falls furthest.`;
    }
    ui.reading.innerHTML = txt;
    ui.note.textContent = '';
  }

  // ---------------------------------------------------------------- sampling

  // One catch of n individuals, each landing in species i with probability pᵢ,
  // recorded individual by individual so the accumulation curve can be drawn.
  function catchSample(n, sh) {
    const cum = [];
    let acc = 0;
    for (const p of sh) { acc += p; cum.push(acc); }
    const counts = new Array(sh.length).fill(0);
    const seen = new Uint16Array(n + 1);
    let found = 0;
    for (let k = 0; k < n; k++) {
      const r = Math.random() * acc;
      let i = 0;
      while (i < cum.length - 1 && r >= cum[i]) i++;
      if (counts[i] === 0) found++;
      counts[i]++;
      seen[k + 1] = found;
    }
    return { counts, seen, ix: indices(counts) };
  }

  function takeOne() {
    const n = Math.round(ui.n.value);
    one = catchSample(n, shares());
    one.n = n;
    if (batch && batch.n !== n) batch = null;
    drawSample(); drawAcc(); drawHist();
    const truth = indices(pool());
    ui.status2.textContent = `sample of ${n} · ${one.ix.S} of ${truth.S} species seen`;
    const missed = truth.S - one.ix.S;
    ui.reading.innerHTML = `This sample of <strong>${n}</strong> individuals found `
      + `<strong>${one.ix.S}</strong> of the ${truth.S} species`
      + (missed > 0 ? ` — the ${missed} it missed are there, just too rare to turn up in ${n} catches. ` : '. ')
      + `From it, Shannon's effective number comes out at <strong>${one.ix.d1.toFixed(2)}</strong> `
      + `(truth ${truth.d1.toFixed(2)}) and Simpson's at <strong>${one.ix.d2.toFixed(2)}</strong> `
      + `(truth ${truth.d2.toFixed(2)}). One sample cannot say whether that is luck or a habit — `
      + `take a hundred to find out.`;
    ui.note.textContent = '';
  }

  function takeHundred() {
    const n = Math.round(ui.n.value);
    const sh = shares();
    const runs = [];
    for (let k = 0; k < SAMPLES; k++) runs.push(catchSample(n, sh));
    batch = { n, runs };
    one = Object.assign(runs[SAMPLES - 1], { n });
    drawSample(); drawAcc(); drawHist();
    const truth = indices(pool());
    const mean = key => runs.reduce((a, r) => a + r.ix[key], 0) / SAMPLES;
    const m0 = mean('d0'), m1 = mean('d1'), m2 = mean('d2');
    const pc = (m, t) => Math.round(100 * (m - t) / t);
    const full = runs.filter(r => r.ix.S === truth.S).length;
    ui.status2.textContent = `100 samples of ${n} · all species seen in ${full}`;
    ui.reading.innerHTML = `Across <strong>100 samples of ${n}</strong>: richness averaged `
      + `<strong>${m0.toFixed(1)}</strong> against a true ${truth.S} (${signed(pc(m0, truth.d0))}%), `
      + `Shannon's number <strong>${m1.toFixed(2)}</strong> against ${truth.d1.toFixed(2)} (${signed(pc(m1, truth.d1))}%), `
      + `and Simpson's <strong>${m2.toFixed(2)}</strong> against ${truth.d2.toFixed(2)} (${signed(pc(m2, truth.d2))}%). `
      + (full === SAMPLES
          ? `Every sample found every species, so richness was exact this time — try a smaller sample, or add a rare species.`
          : `${full === 0 ? 'None' : `Only ${full}`} of the hundred samples found every species: richness can be `
            + `missed but never overshot, so its estimates can only fall short.`);
    ui.note.textContent = `Change the sample size and take another hundred: richness moves most, Simpson's least. `
      + `Comparing richness between two samples of different size mostly compares how hard each one looked.`;
  }

  const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v);

  function drawSample() {
    const p = plots.sample;
    const counts = one ? one.counts : null;
    const yMax = counts ? Math.max(4, ...counts) * 1.15 : 10;
    p.begin({ height: 200, padL: 40, xMin: 0, xMax: S, yMin: 0, yMax,
              xLabel: 'Species', yLabel: 'Caught' });
    p.grid({ yTicks: 4, xGrid: false, xStep: 1000, xFmt: () => '' });
    const ctx = p.ctx, slot = p.plotW / S, bw = Math.min(slot * 0.68, 34);
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < S; i++) {
      const cx = p.left + slot * (i + 0.5);
      if (counts && counts[i] > 0) {
        const top = p.py(counts[i]);
        ctx.fillStyle = COLORS[i];
        ctx.fillRect(cx - bw / 2, top, bw, p.bottom - top);
      }
      // A species the sample missed is named in grey: it exists, it was not seen.
      ctx.fillStyle = counts && counts[i] > 0 ? LAB.C.ink : LAB.C.inkSoft;
      ctx.globalAlpha = counts && counts[i] > 0 ? 1 : 0.55;
      ctx.textBaseline = 'top';
      ctx.fillText(w[i] > 0 ? LETTERS[i] : '', cx, p.bottom + 6);
      ctx.globalAlpha = 1;
    }
    if (!counts) {
      ctx.fillStyle = LAB.C.inkSoft;
      ctx.textBaseline = 'middle';
      ctx.fillText('take a sample', p.left + p.plotW / 2, p.top + p.plotH / 2);
    }
    ctx.restore();
    p.frame();
    ui.sSeen.textContent = one ? `${one.ix.S} / ${indices(pool()).S}` : '—';
    ui.d1Samp.textContent = one ? one.ix.d1.toFixed(2) : '—';
    ui.d2Samp.textContent = one ? one.ix.d2.toFixed(2) : '—';
  }

  // Species found against individuals counted, for the last sample and, after
  // a hundred, for every one of them — with the expected curve dashed.
  function drawAcc() {
    const p = plots.acc;
    const n = one ? one.n : Math.round(ui.n.value);
    const sh = shares().filter(x => x > 0);
    const truth = sh.length;
    p.begin({ height: 240, xMin: 0, xMax: n, yMin: 0, yMax: truth + 1,
              xLabel: 'Individuals counted', yLabel: 'Species found' });
    p.grid({ yStep: truth > 8 ? 2 : 1 });
    p.hline(truth, { color: LAB.C.cap, dash: [], width: 1.5, label: `true richness ${truth}` });
    const expected = [];
    for (let k = 0; k <= n; k += Math.max(1, Math.floor(n / 150))) {
      expected.push([k, sh.reduce((a, q) => a + 1 - Math.pow(1 - q, k), 0)]);
    }
    expected.push([n, sh.reduce((a, q) => a + 1 - Math.pow(1 - q, n), 0)]);
    const curve = seen => { const pts = []; for (let k = 0; k <= n; k++) pts.push([k, seen[k]]); return pts; };
    if (batch) batch.runs.forEach(r => p.line(curve(r.seen), { color: LAB.C.res1, width: 1, alpha: 0.12 }));
    p.line(expected, { color: LAB.C.inkSoft, width: 1.5, dash: [6, 4] });
    if (one) p.line(curve(one.seen), { color: LAB.C.res1, width: 2.2 });
    p.frame();
    const expN = expected[expected.length - 1][1];
    ui.accStat.textContent = one ? `${one.ix.S} found · ${expN.toFixed(1)} expected · ${truth} present`
                                 : `${expN.toFixed(1)} expected in ${n} · ${truth} present`;
    p.describe(one ? `Species found against individuals counted: this sample found ${one.ix.S} of ${truth} `
                     + `in ${n} individuals; on average a sample this size finds ${expN.toFixed(1)}.`
                   : `Species found against individuals counted. On average a sample of ${n} finds `
                     + `${expN.toFixed(1)} of the ${truth} species.`);
  }

  // The hundred estimates of each effective number, as three rows of
  // histogram on one shared axis, each with its true value and its mean.
  function drawHist() {
    const p = plots.hist;
    const truth = indices(pool());
    const xMax = Math.max(2, truth.S) + 0.5;
    p.begin({ height: 250, padL: 86, xMin: 0, xMax, yMin: 0, yMax: 3,
              xLabel: 'Estimated effective number of species' });
    p.grid({ xStep: xMax > 10 ? 2 : 1, yStep: 10, yFmt: () => '' });
    const ctx = p.ctx;
    const rows = [
      { label: 'Richness', key: 'd0', t: truth.d0, color: C_D0() },
      { label: 'Shannon ¹D', key: 'd1', t: truth.d1, color: C_D1() },
      { label: 'Simpson ²D', key: 'd2', t: truth.d2, color: C_D2() }
    ];
    const band = p.plotH / 3;
    // Richness is a whole number, so it gets one bin per species; the other two
    // are continuous and get bins a fifth of a species wide.
    ctx.save();
    rows.forEach((r, k) => {
      const yb = p.top + band * (k + 1) - 4, hMax = band - 14;
      ctx.strokeStyle = LAB.C.rule;
      ctx.beginPath(); ctx.moveTo(p.left, yb + 0.5); ctx.lineTo(p.right, yb + 0.5); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = LAB.C.ink; ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(r.label, p.left - 8, yb - hMax / 2);
      if (batch) {
        const width = r.key === 'd0' ? 1 : 0.2;
        const bins = new Map();
        let mean = 0;
        batch.runs.forEach(run => {
          const v = run.ix[r.key];
          mean += v / SAMPLES;
          const b = r.key === 'd0' ? Math.round(v) : Math.floor(v / width);
          bins.set(b, (bins.get(b) || 0) + 1);
        });
        const top = Math.max(...bins.values());
        bins.forEach((c, b) => {
          const x0 = r.key === 'd0' ? b - 0.4 : b * width, x1 = r.key === 'd0' ? b + 0.4 : (b + 1) * width;
          const h = (c / top) * hMax;
          ctx.fillStyle = r.color; ctx.globalAlpha = 0.8;
          ctx.fillRect(p.px(x0) + 0.5, yb - h, Math.max(1, p.px(x1) - p.px(x0) - 1), h);
          ctx.globalAlpha = 1;
        });
        // the average of the hundred, as a small black triangle under the row
        const mx = p.px(mean);
        ctx.fillStyle = LAB.C.ink;
        ctx.beginPath(); ctx.moveTo(mx, yb - 1); ctx.lineTo(mx - 5, yb + 7); ctx.lineTo(mx + 5, yb + 7); ctx.closePath(); ctx.fill();
        r.mean = mean;
      }
      // the true value, a purple tick through the row
      const tx = p.px(r.t);
      ctx.strokeStyle = LAB.C.cap; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx, yb - hMax - 2); ctx.lineTo(tx, yb + 2); ctx.stroke();
      ctx.lineWidth = 1;
    });
    if (!batch) {
      ctx.fillStyle = LAB.C.inkSoft; ctx.textAlign = 'center';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('take 100 samples to fill this panel — the purple ticks are the true values',
                   p.left + p.plotW / 2, p.top + 8);
    }
    ctx.restore();
    p.frame();
    ui.histStat.textContent = batch
      ? `n = ${batch.n} · averages ${rows.map(r => r.mean.toFixed(r.key === 'd0' ? 1 : 2)).join(' · ')}`
      : '—';
    p.describe(batch
      ? `Estimates from 100 samples of ${batch.n}. ` + rows.map(r => `${r.label}: average ${r.mean.toFixed(2)}, `
          + `true ${r.t.toFixed(2)}`).join('; ') + '.'
      : 'No samples yet. The true values are richness ' + truth.d0 + ', Shannon ' + truth.d1.toFixed(2)
          + ', Simpson ' + truth.d2.toFixed(2) + '.');
  }

  // ------------------------------------------------------------------- drift

  function driftParams() {
    return { J: Math.round(ui.J.value), m: ui.m.value, T: Math.round(ui.T.value),
             w: pool(), S, sh: shares() };
  }

  // The community scaled to J individuals, rounded by largest remainder so
  // the counts add up to exactly J and no species present in the pool is
  // rounded away to nothing unless J is too small to hold it.
  function startCounts(J, sh) {
    const raw = sh.map(p => p * J);
    const counts = raw.map(Math.floor);
    let left = J - counts.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; left > 0; k = (k + 1) % order.length, left--) counts[order[k][1]]++;
    return counts;
  }

  // A Moran community. Each step one individual dies at random and its place
  // goes to an immigrant from the pool (probability m) or to the offspring of
  // another individual of the community; a generation is J steps. Nothing in
  // it distinguishes one species from another.
  function simulate() {
    const P = driftParams();
    const { J, m, T, sh } = P;
    const s = sh.length;
    const counts = startCounts(J, sh);
    const who = new Uint8Array(J);
    for (let i = 0, k = 0; i < s; i++) for (let c = 0; c < counts[i]; c++) who[k++] = i;
    const cum = [];
    let acc = 0;
    for (const p of sh) { acc += p; cum.push(acc); }

    const snaps = [counts.slice()];
    const total = T * J;
    let next = 1, at = Math.round(total / FRAMES);
    for (let step = 1; step <= total; step++) {
      const k = Math.floor(Math.random() * J);
      const dead = who[k];
      let born;
      if (Math.random() < m) {
        const r = Math.random() * acc;
        born = 0;
        while (born < s - 1 && r >= cum[born]) born++;
      } else {
        let j = Math.floor(Math.random() * (J - 1));
        if (j >= k) j++;              // any individual but the one that died
        born = who[j];
      }
      counts[dead]--; counts[born]++; who[k] = born;
      if (step === at) {
        snaps.push(counts.slice());
        next++;
        at = Math.round(total * next / FRAMES);
      }
    }
    while (snaps.length < FRAMES + 1) snaps.push(counts.slice());
    const series = snaps.map(indices);
    sim = { P, snaps, series, poolIx: indices(P.w) };
    dirty = false;
    player.load(FRAMES);
  }

  function drawComp(frame) {
    const p = plots.comp;
    const T = sim ? sim.P.T : Math.round(ui.T.value);
    p.begin({ height: 260, xMin: 0, xMax: T, yMin: 0, yMax: 1,
              xLabel: 'Generation', yLabel: 'Share of the community' });
    p.grid({ yTicks: 4 });
    if (!sim) {
      p.text(T / 2, 0.5, 'press Run', { align: 'center', color: LAB.C.inkSoft });
      p.frame();
      return;
    }
    const ctx = p.ctx, J = sim.P.J, s = sim.P.S;
    const xs = f => (f / FRAMES) * T;
    p.clipped(() => {
      // Stacked from the first species up, each band drawn as the area between
      // the running totals below and above it.
      const below = new Float64Array(frame + 1);
      for (let i = 0; i < s; i++) {
        ctx.beginPath();
        for (let f = 0; f <= frame; f++) {
          const y = (below[f] + sim.snaps[f][i]) / J;
          f ? ctx.lineTo(p.px(xs(f)), p.py(y)) : ctx.moveTo(p.px(xs(f)), p.py(y));
        }
        for (let f = frame; f >= 0; f--) ctx.lineTo(p.px(xs(f)), p.py(below[f] / J));
        ctx.closePath();
        ctx.fillStyle = COLORS[i];
        ctx.globalAlpha = 0.9;
        ctx.fill();
        for (let f = 0; f <= frame; f++) below[f] += sim.snaps[f][i];
      }
      ctx.globalAlpha = 1;
    });
    p.cursor(xs(frame));
    const now = sim.snaps[frame];
    const lead = now.indexOf(Math.max(...now));
    p.describe(`Share of the community held by each species. At generation ${Math.round(xs(frame))}, `
      + `${sim.series[frame].S} species remain and ${LETTERS[lead]} is commonest, with `
      + `${fmtPct(now[lead] / J)} of the individuals.`);
    p.frame();
  }

  function drawDiv(frame) {
    const p = plots.div;
    const T = sim ? sim.P.T : Math.round(ui.T.value);
    const poolIx = sim ? sim.poolIx : indices(pool());
    const yMax = Math.max(2, poolIx.S) + 1;
    p.begin({ height: 260, xMin: 0, xMax: T, yMin: 0, yMax,
              xLabel: 'Generation', yLabel: 'Effective number of species' });
    p.grid({ yStep: yMax > 9 ? 2 : 1 });
    p.hline(poolIx.d0, { color: C_D0(), dash: [4, 4], alpha: 0.45 });
    p.hline(poolIx.d1, { color: C_D1(), dash: [4, 4], alpha: 0.55 });
    p.hline(poolIx.d2, { color: C_D2(), dash: [4, 4], alpha: 0.55 });
    if (!sim) { p.frame(); return; }
    const xs = f => (f / FRAMES) * T;
    const line = key => { const pts = []; for (let f = 0; f <= frame; f++) pts.push([xs(f), sim.series[f][key]]); return pts; };
    p.line(line('d0'), { color: C_D0(), width: 2 });
    p.line(line('d1'), { color: C_D1(), width: 2 });
    p.line(line('d2'), { color: C_D2(), width: 2 });
    p.cursor(xs(frame));
    p.legend([
      { color: C_D0(), label: 'richness S' },
      { color: C_D1(), label: "Shannon ¹D" },
      { color: C_D2(), label: 'Simpson ²D' }
    ], { bottom: false });
    const ix = sim.series[frame];
    p.describe(`Effective numbers of species over time. At generation ${Math.round(xs(frame))}: `
      + `richness ${ix.S}, Shannon ${ix.d1.toFixed(2)}, Simpson ${ix.d2.toFixed(2)}; the pool's are `
      + `${poolIx.S}, ${poolIx.d1.toFixed(2)} and ${poolIx.d2.toFixed(2)}.`);
    p.frame();
  }

  function renderDrift(frame) {
    drawComp(frame);
    drawDiv(frame);
    if (!sim) return;
    const ix = sim.series[frame];
    ui.genDisp.textContent = Math.round((frame / FRAMES) * sim.P.T);
    ui.SNow.textContent = ix.S;
    ui.d1Now.textContent = ix.d1.toFixed(2);
    ui.d2Now.textContent = ix.d2.toFixed(2);
    ui.divStat.textContent = `S ${ix.S} · ¹D ${ix.d1.toFixed(2)} · ²D ${ix.d2.toFixed(2)}`;
  }

  const player = LAB.createPlayer({
    playBtnId: 'playBtn_div',
    scrubberId: 'scrub_div',
    scrubValueId: 'scrubVal_div',
    scrubFormat: i => String(Math.round((i / FRAMES) * (sim ? sim.P.T : ui.T.value))),
    playLabel: '▶ Run', pauseLabel: '⏸ Pause',
    fps: 45,
    render: renderDrift,
    onEnd: finishDrift
  });

  function finishDrift() {
    if (!sim) return;
    const { P, series, snaps, poolIx } = sim;
    const end = series[FRAMES], last = snaps[FRAMES];
    const lost = poolIx.S - end.S;
    const lead = last.indexOf(Math.max(...last));
    ui.status3.textContent = `done · ${P.T} generations · ${end.S} of ${poolIx.S} species left`;
    let txt;
    if (P.m === 0) {
      if (end.S === 1) {
        txt = `In ${P.T} generations drift took the community from ${poolIx.S} species to <strong>one</strong>: `
            + `species ${LETTERS[lead]}, which started with ${fmtPct(P.sh[lead])} of the individuals, now holds them all. `
            + `No species was better than another — which one won was luck, and with no immigration the losses can never be undone.`;
      } else {
        txt = `With no immigration, <strong>${lost}</strong> of the ${poolIx.S} species were lost in ${P.T} generations, `
            + `and Shannon's effective number fell from ${poolIx.d1.toFixed(2)} to <strong>${end.d1.toFixed(2)}</strong>. `
            + `Nothing selected against them: they were rare, and in a community of ${P.J} a rare species `
            + `is a few runs of bad luck from none. Every loss is permanent, so given time one species will hold the lot.`;
      }
    } else {
      txt = `With immigration at m = ${P.m.toFixed(3)}, the community ended with <strong>${end.S}</strong> of the `
          + `${poolIx.S} species and a Shannon effective number of <strong>${end.d1.toFixed(2)}</strong>, `
          + `against ${poolIx.d1.toFixed(2)} in the pool. Drift still removes species, but immigrants keep `
          + `bringing them back, and the community hovers below the pool's diversity — how far below `
          + `depends on J and m, not on anything about the species.`;
    }
    ui.reading.innerHTML = txt;
    ui.note.textContent = P.m === 0
      ? `Run it again with m = 0.010: a trickle of one immigrant in a hundred replacements is enough to stop the slide.`
      : `Halve J, or halve m, and run again: a smaller or more isolated community settles lower.`;
  }

  function onRun() {
    if (player.running) { player.pause(); return; }
    if (dirty || !sim) { simulate(); ui.status3.textContent = 'running…'; }
    player.play();
  }
  function ensureSim() { if (dirty || !sim) simulate(); }
  function onSkip() { ensureSim(); player.showAll(); }
  function onReset() {
    player.reset();
    sim = null; dirty = true;
    ui.status3.textContent = 'Set the parameters and press Run.';
    ui.genDisp.textContent = '0';
    ui.SNow.textContent = '—'; ui.d1Now.textContent = '—'; ui.d2Now.textContent = '—';
    ui.divStat.textContent = '—';
    renderDrift(0);
  }

  // ---------------------------------------------------------------- wiring

  function buildUI() {
    ui = {
      preset: LAB.segmented('presetSeg_div', 'preset', { onChange: applyPreset }),
      S: LAB.slider('S_div', { valueId: 'SVal_div', format: v => String(v), onChange: setPoolSize }),
      n: LAB.slider('n_div', { valueId: 'nVal_div', format: v => String(v), onChange: () => {
        one = null; batch = null;
        ui.status2.textContent = 'No sample taken yet.';
        drawSample(); drawAcc(); drawHist();
      } }),
      J: LAB.slider('J_div', { valueId: 'JVal_div', format: v => String(v), onChange: () => { dirty = true; } }),
      m: LAB.slider('m_div', { valueId: 'mVal_div', format: v => v.toFixed(3), onChange: () => { dirty = true; } }),
      T: LAB.slider('T_div', { valueId: 'TVal_div', format: v => String(v), onChange: () => { dirty = true; if (!sim) player.redraw(); } }),
      addRare: LAB.$('addRareBtn_div'),
      status2: LAB.$('status2_div'), status3: LAB.$('status3_div'),
      reading: LAB.$('reading_div'), note: LAB.$('note_div'),
      commStat: LAB.$('commStat_div'),
      SDisp: LAB.$('SDisp_div'), HDisp: LAB.$('HDisp_div'), DDisp: LAB.$('DDisp_div'), JDisp: LAB.$('JDisp_div'),
      sSeen: LAB.$('sSeenDisp_div'), d1Samp: LAB.$('d1SampDisp_div'), d2Samp: LAB.$('d2SampDisp_div'),
      accStat: LAB.$('accStat_div'), histStat: LAB.$('histStat_div'), divStat: LAB.$('divStat_div'),
      genDisp: LAB.$('genDisp_div'), SNow: LAB.$('SNowDisp_div'), d1Now: LAB.$('d1NowDisp_div'), d2Now: LAB.$('d2NowDisp_div')
    };
    plots = {
      editorCvs: LAB.$('editorCanvas_div'),
      editor: createPlot(LAB.$('editorCanvas_div'), { height: 250 }),
      hill: createPlot(LAB.$('hillCanvas_div'), { height: 250 }),
      sample: createPlot(LAB.$('sampleCanvas_div'), { height: 200 }),
      acc: createPlot(LAB.$('accCanvas_div'), { height: 240 }),
      hist: createPlot(LAB.$('histCanvas_div'), { height: 250 }),
      comp: createPlot(LAB.$('compCanvas_div'), { height: 260 }),
      div: createPlot(LAB.$('divCanvas_div'), { height: 260 })
    };
  }

  // Adds one more species to the pool at an abundance of 2 — about 1% of a
  // geometric community — which is the experiment that tells the three
  // effective numbers apart most plainly.
  function addRare() {
    if (S >= MAX_S) return;
    w[S] = 2;
    clearPreset();
    ui.S.set(S + 1);
  }

  function redrawAll() {
    drawEditor(); drawHill(); drawSample(); drawAcc(); drawHist();
    player.redraw();
  }

  LAB.ready(() => {
    buildUI();
    bindEditor();
    LAB.onClick('addRareBtn_div', addRare);
    LAB.onClick('sampleBtn_div', takeOne);
    LAB.onClick('sample100Btn_div', takeHundred);
    LAB.onClick('playBtn_div', onRun);
    LAB.onClick('endBtn_div', onSkip);
    LAB.onClick('resetBtn_div', onReset);
    LAB.bindSteps('div', player, ensureSim);
    applyPreset('geometric');
    onReset();
    LAB.onResize(redrawAll);
  });
})();
