// Shared 2-D plotting for every room.
//
// All eight rooms draw the same handful of things — a framed panel with a linear
// (or log) y-axis, some line series, a horizontal reference line, a moving
// marker, a small legend. Rather than repeat ~80 lines of canvas boilerplate in
// each room, a room asks for a plot object once and then speaks in data
// coordinates:
//
//   const p = createPlot(canvas, { height: 200 });
//   p.begin({ xMin: 0, xMax: T, yMin: 0, yMax: 500, xLabel: 'Time', yLabel: 'N' });
//   p.grid();
//   p.line(points, { color: LAB.C.spA, width: 2 });
//   p.frame();
//
// `begin` re-measures the parent element every call, so plots resize correctly
// when the window changes or a hidden tab becomes visible. Call `frame()` last:
// it redraws the axis lines on top so series can't paint over them.

const PLOT_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

function niceStep(range, targetTicks) {
  if (!(range > 0)) return 1;
  const raw = range / Math.max(1, targetTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let mult;
  if (norm <= 1) mult = 1;
  else if (norm <= 2) mult = 2;
  else if (norm <= 2.5) mult = 2.5;
  else if (norm <= 5) mult = 5;
  else mult = 10;
  return mult * mag;
}

// Compact axis labels: 1200 -> "1.2k", 0.035 -> "0.035", 12 -> "12".
function fmtTick(v, step) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a % 1e6 === 0 ? 0 : 1) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(a % 1e3 === 0 ? 0 : 1) + 'k';
  if (step >= 1) return String(Math.round(v));
  const dec = Math.min(4, Math.max(0, Math.ceil(-Math.log10(step))));
  return v.toFixed(dec);
}

function createPlot(canvas, cfg = {}) {
  const ctx = canvas.getContext('2d');
  const base = Object.assign(
    { height: 200, padL: 52, padR: 18, padT: 14, padB: 40, fallbackW: 700 },
    cfg
  );

  const S = { W: 0, H: 0, padL: 0, padR: 0, padT: 0, padB: 0,
              xMin: 0, xMax: 1, yMin: 0, yMax: 1, yLog: false };

  const C = () => (typeof LAB !== 'undefined' ? LAB.C : {});

  function px(x) {
    const w = S.W - S.padL - S.padR;
    return S.padL + ((x - S.xMin) / (S.xMax - S.xMin || 1)) * w;
  }
  function py(y) {
    const h = S.H - S.padT - S.padB;
    if (S.yLog) {
      const lo = Math.log10(Math.max(S.yMin, 1e-9));
      const hi = Math.log10(Math.max(S.yMax, S.yMin * 10));
      const v = Math.log10(Math.max(y, Math.max(S.yMin, 1e-9)));
      return S.padT + h * (1 - (v - lo) / (hi - lo || 1));
    }
    return S.padT + h * (1 - (y - S.yMin) / (S.yMax - S.yMin || 1));
  }

  const api = {
    ctx,
    get W() { return S.W; },
    get H() { return S.H; },
    get plotW() { return S.W - S.padL - S.padR; },
    get plotH() { return S.H - S.padT - S.padB; },
    get left() { return S.padL; },
    get right() { return S.W - S.padR; },
    get top() { return S.padT; },
    get bottom() { return S.H - S.padB; },
    px, py,
    // Inverse maps — used by the phase-plane rooms, where clicking the canvas
    // has to be turned back into a pair of population sizes.
    ix(sx) { return S.xMin + ((sx - S.padL) / (S.W - S.padL - S.padR || 1)) * (S.xMax - S.xMin); },
    iy(sy) { return S.yMin + (1 - (sy - S.padT) / (S.H - S.padT - S.padB || 1)) * (S.yMax - S.yMin); },

    begin(opts = {}) {
      const parent = canvas.parentElement;
      S.W = (parent && parent.clientWidth) || base.fallbackW;
      S.H = opts.height || base.height;
      S.padL = opts.padL != null ? opts.padL : base.padL;
      S.padR = opts.padR != null ? opts.padR : base.padR;
      S.padT = opts.padT != null ? opts.padT : base.padT;
      S.padB = opts.padB != null ? opts.padB : base.padB;
      S.xMin = opts.xMin != null ? opts.xMin : 0;
      S.xMax = opts.xMax != null ? opts.xMax : 1;
      S.yMin = opts.yMin != null ? opts.yMin : 0;
      S.yMax = opts.yMax != null ? opts.yMax : 1;
      S.yLog = !!opts.yLog;
      S.xLabel = opts.xLabel || '';
      S.yLabel = opts.yLabel || '';
      scaleCanvas(canvas, ctx, S.W, S.H);
      ctx.clearRect(0, 0, S.W, S.H);
      return api;
    },

    // Dashed gridlines plus the numeric tick labels on both axes, and the axis
    // titles. Log y-axes get decade lines instead of evenly spaced ones.
    grid(opts = {}) {
      const col = C();
      const xTicks = opts.xTicks || 6;
      const yTicks = opts.yTicks || 5;

      ctx.save();
      ctx.font = '9.5px ' + PLOT_FONT;
      ctx.strokeStyle = col.rule || '#cabfa8';
      ctx.fillStyle = col.inkSoft || '#6b6258';
      ctx.lineWidth = 1;

      // --- y ---
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      if (S.yLog) {
        const lo = Math.floor(Math.log10(Math.max(S.yMin, 1e-9)));
        const hi = Math.ceil(Math.log10(Math.max(S.yMax, 1e-8)));
        // A decade line every `yDecade` decades: an axis spanning twenty of them
        // wants one line in three, not a hatched panel.
        const every = Math.max(1, Math.round(opts.yDecade || 1));
        for (let e = lo; e <= hi; e++) {
          const v = Math.pow(10, e);
          if (v < S.yMin || v > S.yMax * 1.001) continue;
          if (every > 1 && e % every !== 0) continue;
          const y = py(v);
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(S.padL, y); ctx.lineTo(S.W - S.padR, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillText(opts.yFmt ? opts.yFmt(v) : v >= 1 ? fmtTick(v, 1) : String(v), S.padL - 7, y);
        }
      } else {
        const step = opts.yStep || niceStep(S.yMax - S.yMin, yTicks);
        const first = Math.ceil(S.yMin / step) * step;
        for (let v = first; v <= S.yMax + step * 1e-6; v += step) {
          const y = py(v);
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(S.padL, y); ctx.lineTo(S.W - S.padR, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillText(opts.yFmt ? opts.yFmt(v) : fmtTick(v, step), S.padL - 7, y);
        }
      }

      // --- x ---
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const xStep = opts.xStep || niceStep(S.xMax - S.xMin, xTicks);
      const xFirst = Math.ceil(S.xMin / xStep) * xStep;
      for (let v = xFirst; v <= S.xMax + xStep * 1e-6; v += xStep) {
        const x = px(v);
        if (opts.xGrid !== false) {
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(x, S.padT); ctx.lineTo(x, S.H - S.padB); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.beginPath(); ctx.moveTo(x, S.H - S.padB); ctx.lineTo(x, S.H - S.padB + 4); ctx.stroke();
        ctx.fillText(opts.xFmt ? opts.xFmt(v) : fmtTick(v, xStep), x, S.H - S.padB + 7);
      }

      // --- titles ---
      if (S.xLabel) {
        ctx.font = '10px ' + PLOT_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(S.xLabel, S.padL + (S.W - S.padL - S.padR) / 2, S.H - 6);
      }
      if (S.yLabel) {
        ctx.save();
        ctx.translate(12, S.padT + (S.H - S.padT - S.padB) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = '10px ' + PLOT_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(S.yLabel, 0, 0);
        ctx.restore();
      }
      ctx.restore();
      return api;
    },

    // The two axis lines. Called after the series so nothing paints over them.
    frame() {
      const col = C();
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = col.ink || '#262220';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(S.padL, S.padT);
      ctx.lineTo(S.padL, S.H - S.padB);
      ctx.lineTo(S.W - S.padR, S.H - S.padB);
      ctx.stroke();
      ctx.restore();
      return api;
    },

    // `pts` is an array of [x, y] pairs in data coordinates. Points outside the
    // y-range are clamped rather than dropped, so a series that runs off the top
    // still reads as "pinned to the ceiling" instead of vanishing.
    line(pts, style = {}) {
      if (!pts || pts.length < 1) return api;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = px(pts[i][0]);
        const y = Math.max(S.padT - 2, Math.min(S.H - S.padB + 2, py(pts[i][1])));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = style.color || (C().ink || '#262220');
      ctx.lineWidth = style.width || 2;
      ctx.globalAlpha = style.alpha != null ? style.alpha : 1;
      ctx.setLineDash(style.dash || []);
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
      return api;
    },

    // A series that outgrows the panel has to read as leaving it, not as
    // levelling off against the top edge — which is what `line`'s clamping would
    // otherwise say. This draws the part that fits, stopping exactly where the
    // series crosses `ceiling`, and then a dotted tail out through the top. The
    // tail is a fixed gentle slant rather than the true slope: for an exponential
    // that would be a two-pixel vertical stroke, the same plateau by another
    // route. `ceiling` has to sit below yMax to leave the tail room. Returns the
    // screen x at which the tail leaves the panel, or null if the series stayed.
    lineOut(pts, ceiling, style = {}) {
      const on = [];
      let cross = null;
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        if (y > ceiling) {
          // where the crossing falls inside the last step: along the exponential
          // joining its two samples where both are positive, linearly otherwise
          const [x0, y0] = i > 0 ? pts[i - 1] : pts[i];
          const f = y0 > 0 && y > y0 ? Math.log(ceiling / y0) / Math.log(y / y0)
                  : y > y0 ? (ceiling - y0) / (y - y0) : 0;
          cross = x0 + (x - x0) * f;
          on.push([cross, ceiling]);
          break;
        }
        on.push([x, y]);
      }
      api.line(on, style);
      if (cross == null) return null;

      const sx = px(cross), tail = (S.W - S.padL - S.padR) * (style.tail || 0.045);
      api.clipped(() => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sx, py(ceiling));
        ctx.lineTo(sx + tail, S.padT);
        ctx.strokeStyle = style.color || (C().ink || '#262220');
        ctx.lineWidth = style.width || 2;
        ctx.globalAlpha = style.alpha != null ? style.alpha : 1;
        ctx.setLineDash([1.5, 3]);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
      });
      return sx + tail;
    },

    // Same as `line`, but the area between the curve and the x-axis is filled.
    area(pts, style = {}) {
      if (!pts || pts.length < 2) return api;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(px(pts[0][0]), S.H - S.padB);
      for (let i = 0; i < pts.length; i++) {
        ctx.lineTo(px(pts[i][0]), Math.max(S.padT, Math.min(S.H - S.padB, py(pts[i][1]))));
      }
      ctx.lineTo(px(pts[pts.length - 1][0]), S.H - S.padB);
      ctx.closePath();
      ctx.fillStyle = style.color || '#000';
      ctx.globalAlpha = style.alpha != null ? style.alpha : 0.18;
      ctx.fill();
      ctx.restore();
      return api;
    },

    hline(y, style = {}) {
      ctx.save();
      const yy = py(y);
      ctx.beginPath(); ctx.moveTo(S.padL, yy); ctx.lineTo(S.W - S.padR, yy);
      ctx.strokeStyle = style.color || (C().stamp || '#C08A2E');
      ctx.lineWidth = style.width || 1.25;
      ctx.setLineDash(style.dash || [6, 4]);
      ctx.globalAlpha = style.alpha != null ? style.alpha : 0.9;
      ctx.stroke();
      if (style.label) {
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.font = '10px ' + PLOT_FONT;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = style.color || (C().stamp || '#C08A2E');
        ctx.fillText(style.label, S.W - S.padR - 3, yy - 3);
      }
      ctx.restore();
      return api;
    },

    vline(x, style = {}) {
      ctx.save();
      const xx = px(x);
      ctx.beginPath(); ctx.moveTo(xx, S.padT); ctx.lineTo(xx, S.H - S.padB);
      ctx.strokeStyle = style.color || (C().stamp || '#C08A2E');
      ctx.lineWidth = style.width || 1;
      ctx.setLineDash(style.dash || [3, 3]);
      ctx.globalAlpha = style.alpha != null ? style.alpha : 0.9;
      ctx.stroke();
      if (style.label) {
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.font = '10px ' + PLOT_FONT;
        ctx.textAlign = 'left';
        // `labelBottom` puts the caption at the foot of the line instead of its
        // head, for panels whose top edge is already spoken for by a key.
        ctx.textBaseline = style.labelBottom ? 'bottom' : 'top';
        ctx.fillStyle = style.color || (C().stamp || '#C08A2E');
        ctx.fillText(style.label, xx + 4, style.labelBottom ? S.H - S.padB - 3 : S.padT + 2);
      }
      ctx.restore();
      return api;
    },

    dot(x, y, style = {}) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(px(x), Math.max(S.padT, Math.min(S.H - S.padB, py(y))), style.r || 4.5, 0, Math.PI * 2);
      ctx.fillStyle = style.color || (C().stamp || '#C08A2E');
      ctx.globalAlpha = style.alpha != null ? style.alpha : 1;
      ctx.fill();
      if (style.ring) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = style.ring;
        ctx.stroke();
      }
      ctx.restore();
      return api;
    },

    // Runs `draw` with everything clipped to the plot area. Trajectories and
    // isoclines routinely leave the frame — a prey population released from its
    // predator, an isocline reaching K/α — and without this they paint over the
    // axes and out across the panel.
    clipped(draw) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(S.padL, S.padT, S.W - S.padL - S.padR, S.H - S.padT - S.padB);
      ctx.clip();
      draw();
      ctx.restore();
      return api;
    },

    // A grid of arrows showing which way the system is pushed at each point.
    // `deriv(x, y)` returns [dx, dy] in data units; every arrow is drawn the same
    // length on screen, so the picture shows *direction* and near-equilibrium
    // regions stay as readable as fast-moving ones.
    field(deriv, opts = {}) {
      const n = opts.n || 13;
      const stepX = (S.xMax - S.xMin) / (n + 1);
      const stepY = (S.yMax - S.yMin) / (n + 1);
      const w = S.W - S.padL - S.padR, h = S.H - S.padT - S.padB;
      const len = Math.min(w / (n + 1), h / (n + 1)) * (opts.scale || 0.55);
      for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= n; j++) {
          const x = S.xMin + i * stepX, y = S.yMin + j * stepY;
          const d = deriv(x, y);
          // Normalise in screen space, then convert the fixed-length screen
          // vector back into data units so the arrow can be drawn in data space.
          const sdx = (d[0] / (S.xMax - S.xMin)) * w;
          const sdy = -(d[1] / (S.yMax - S.yMin)) * h;
          const mag = Math.hypot(sdx, sdy);
          if (!(mag > 1e-9)) continue;
          const ex = (sdx / mag) * len, ey = (sdy / mag) * len;
          api.arrow(x, y, x + (ex * (S.xMax - S.xMin)) / w, y - (ey * (S.yMax - S.yMin)) / h,
                    { alpha: opts.alpha != null ? opts.alpha : 0.32 });
        }
      }
      return api;
    },

    // A short arrow in data space — the phase-plane rooms use a field of these
    // to show which way the population is being pushed at each point.
    arrow(x0, y0, x1, y1, style = {}) {
      const ax = px(x0), ay = py(y0), bx = px(x1), by = py(y1);
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (len < 0.6) return api;
      ctx.save();
      ctx.strokeStyle = style.color || (C().inkSoft || '#6b6258');
      ctx.fillStyle = style.color || (C().inkSoft || '#6b6258');
      ctx.globalAlpha = style.alpha != null ? style.alpha : 0.55;
      ctx.lineWidth = style.width || 1;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      const head = style.head || 3.4;
      const ux = dx / len, uy = dy / len;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - ux * head - uy * head * 0.55, by - uy * head + ux * head * 0.55);
      ctx.lineTo(bx - ux * head + uy * head * 0.55, by - uy * head - ux * head * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return api;
    },

    text(x, y, str, style = {}) {
      ctx.save();
      ctx.font = style.font || ('10px ' + PLOT_FONT);
      ctx.fillStyle = style.color || (C().inkSoft || '#6b6258');
      ctx.textAlign = style.align || 'left';
      ctx.textBaseline = style.baseline || 'alphabetic';
      ctx.globalAlpha = style.alpha != null ? style.alpha : 1;
      ctx.fillText(str, style.screen ? x : px(x), style.screen ? y : py(y));
      ctx.restore();
      return api;
    },

    // Small swatch-and-label key, pinned inside the plot area.
    legend(items, opts = {}) {
      if (!items || !items.length) return api;
      ctx.save();
      ctx.font = '10px ' + PLOT_FONT;
      ctx.textBaseline = 'middle';
      const pad = 6, lineH = 13, sw = 14;
      let boxW = 0;
      items.forEach(it => { boxW = Math.max(boxW, ctx.measureText(it.label).width); });
      boxW += sw + 10 + pad * 2;
      const boxH = items.length * lineH + pad * 2 - 2;
      const x = opts.right === false ? S.padL + 8 : S.W - S.padR - boxW - 6;
      const y = opts.bottom ? S.H - S.padB - boxH - 6 : S.padT + 6;
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = C().paper || '#EDE6D6';
      ctx.strokeStyle = C().rule || '#cabfa8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, boxW, boxH, 4) : ctx.rect(x, y, boxW, boxH);
      ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
      items.forEach((it, i) => {
        const cy = y + pad + i * lineH + lineH / 2 - 2;
        ctx.strokeStyle = it.color;
        ctx.lineWidth = it.width || 2.4;
        ctx.setLineDash(it.dash || []);
        ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + pad + sw, cy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C().ink || '#262220';
        ctx.textAlign = 'left';
        ctx.fillText(it.label, x + pad + sw + 6, cy);
      });
      ctx.restore();
      return api;
    },

    // Vertical "you are here" cursor used by the history scrubber.
    cursor(x, style = {}) {
      return api.vline(x, {
        color: style.color || (C().stamp || '#C08A2E'),
        dash: [2, 3], width: 1, alpha: 0.85
      });
    }
  };

  return api;
}
