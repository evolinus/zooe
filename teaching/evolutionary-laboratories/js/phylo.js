// Tree reconstruction and drawing helpers shared by the Branching and
// Adaptation rooms.
//
// Two inference methods are offered so they can be compared against the true
// history the simulation actually produced:
//
//   UPGMA  — clusters by average distance and assumes a constant rate, so the
//            tree is ultrametric: every leaf ends up equidistant from the root.
//            Node depth is half the pairwise distance.
//   NJ     — neighbour-joining. Assumes only that distances are additive, not
//            that rates are equal, so each lineage gets its own branch length
//            and a fast-evolving lineage shows up as a long branch.
//
// NJ produces an unrooted tree; it is midpoint-rooted here (the root is placed
// halfway along the longest leaf-to-leaf path) because the panel draws a
// rooted tree and inference has no access to the simulation's real root.

// --- neighbour-joining -----------------------------------------------------

// labels: array of taxon ids. dist(a, b): symmetric distance.
// Returns a rooted tree: { id, isLeaf, branch, children: [...] }.
function neighborJoining(labels, dist) {
  const created = [];
  const mk = (id, isLeaf) => { const n = { id, isLeaf, adj: [] }; created.push(n); return n; };
  const link = (a, b, len) => { a.adj.push({ node: b, len }); b.adj.push({ node: a, len }); };

  let active = labels.map(l => mk(l, true));
  let D = labels.map((a, i) => labels.map((b, j) => (i === j ? 0 : dist(a, b))));

  while (active.length > 2) {
    const n = active.length;
    const r = D.map(row => row.reduce((s, v) => s + v, 0));

    // Join the pair minimising Q = (n-2)·d(i,j) − r(i) − r(j). Unlike UPGMA's
    // "smallest raw distance", this correction is what stops NJ from being
    // fooled into pairing two lineages merely because both evolved slowly.
    let best = Infinity, bi = 0, bj = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const q = (n - 2) * D[i][j] - r[i] - r[j];
        if (q < best) { best = q; bi = i; bj = j; }
      }
    }

    const dij = D[bi][bj];
    // Real (non-additive) data can push a branch length negative; clamp into
    // [0, dij] so the drawing stays sane, which is standard practice.
    let li = 0.5 * dij + (r[bi] - r[bj]) / (2 * (n - 2));
    li = Math.min(Math.max(li, 0), dij);
    const lj = dij - li;

    const u = mk(null, false);
    link(u, active[bi], li);
    link(u, active[bj], lj);

    const keep = [];
    for (let k = 0; k < n; k++) if (k !== bi && k !== bj) keep.push(k);
    const uRow = keep.map(k => Math.max(0, 0.5 * (D[bi][k] + D[bj][k] - dij)));

    const nd = keep.map((_, a) => keep.map(k => D[keep[a]][k]));
    for (let a = 0; a < keep.length; a++) nd[a].push(uRow[a]);
    nd.push(uRow.concat([0]));

    active = keep.map(k => active[k]).concat([u]);
    D = nd;
  }

  if (active.length === 2) link(active[0], active[1], Math.max(0, D[0][1]));
  return midpointRoot(created);
}

// Places the root halfway along the longest leaf-to-leaf path.
function midpointRoot(allNodes) {
  const leaves = allNodes.filter(n => n.isLeaf);

  function walkFrom(src) {
    const dist = new Map([[src, 0]]);
    const prev = new Map();
    const stack = [src];
    while (stack.length) {
      const cur = stack.pop();
      for (const e of cur.adj) {
        if (!dist.has(e.node)) {
          dist.set(e.node, dist.get(cur) + e.len);
          prev.set(e.node, cur);
          stack.push(e.node);
        }
      }
    }
    return { dist, prev };
  }

  let endA = leaves[0], endB = leaves[0], span = -1;
  for (const l of leaves) {
    const { dist } = walkFrom(l);
    for (const m of leaves) {
      const d = dist.get(m);
      if (d !== undefined && d > span) { span = d; endA = l; endB = m; }
    }
  }

  const { prev } = walkFrom(endA);
  const path = [];
  for (let cur = endB; cur !== endA; cur = prev.get(cur)) path.push(cur);
  path.push(endA);
  path.reverse();

  const half = span / 2;
  let acc = 0, split = null;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const e = a.adj.find(x => x.node === b);
    if (acc + e.len >= half) { split = { a, b, len: e.len, before: half - acc }; break; }
    acc += e.len;
  }
  if (!split) return buildRooted(leaves[0], null, 0); // degenerate (zero-length tree)

  const join = (p, q, l) => { p.adj.push({ node: q, len: l }); q.adj.push({ node: p, len: l }); };
  const { a, b, len, before } = split;
  a.adj = a.adj.filter(x => x.node !== b);
  b.adj = b.adj.filter(x => x.node !== a);
  const root = { id: null, isLeaf: false, adj: [] };
  join(root, a, before);
  join(root, b, len - before);

  return buildRooted(root, null, 0);
}

function buildRooted(node, parent, branch) {
  const out = { id: node.id, isLeaf: false, branch: branch || 0, children: [] };
  for (const e of node.adj) {
    if (e.node === parent) continue;
    out.children.push(buildRooted(e.node, node, e.len));
  }
  out.isLeaf = out.children.length === 0;
  return out;
}

// --- drawing ---------------------------------------------------------------

// Positions a rooted tree as a phylogram: x is the cumulative branch length
// from the root, with the root at rootX and the tree growing leftwards so the
// deepest leaf lands spanPx away. Leaf y positions are supplied by leafY.
// Sets .x/.y on every node and returns the pixels-per-unit-distance scale.
function layoutPhylogram(root, leafY, rootX, spanPx) {
  let maxDepth = 0;
  (function depth(n, d) {
    n._depth = d;
    if (n.isLeaf) maxDepth = Math.max(maxDepth, d);
    else n.children.forEach(c => depth(c, d + c.branch));
  })(root, 0);

  const scale = maxDepth > 0 ? spanPx / maxDepth : 0;
  (function place(n) {
    n.x = rootX - n._depth * scale;
    if (n.isLeaf) { n.y = leafY[n.id]; return; }
    n.children.forEach(place);
    n.y = n.children.reduce((s, c) => s + c.y, 0) / n.children.length;
  })(root);

  return { maxDepth, scale };
}

// Renders a laid-out phylogram. Leaves sit at their true depth, so a dotted
// leader line runs from each tip out to the aligned leaf column — the usual
// convention, and it keeps every tip visually attached to its shape icon.
function phylogramSvg(root, opts) {
  const leafColumnX = opts.leafColumnX;
  const leafColor = opts.leafColor || (() => opts.inkColor);
  const ink = opts.inkColor;
  let out = '';
  (function draw(n) {
    if (n.isLeaf) {
      if (Math.abs(n.x - leafColumnX) > 0.5) {
        out += `<line x1="${n.x}" y1="${n.y}" x2="${leafColumnX}" y2="${n.y}" stroke="${leafColor(n.id)}" stroke-width="1" stroke-dasharray="2,3" opacity="0.55"/>`;
      }
      return;
    }
    const ys = n.children.map(c => c.y);
    out += `<line x1="${n.x}" y1="${Math.min(...ys)}" x2="${n.x}" y2="${Math.max(...ys)}" stroke="${ink}" stroke-width="2"/>`;
    for (const c of n.children) {
      out += `<line x1="${n.x}" y1="${c.y}" x2="${c.x}" y2="${c.y}" stroke="${c.isLeaf ? leafColor(c.id) : ink}" stroke-width="2"/>`;
      draw(c);
    }
  })(root);
  return out;
}

// A phylogram's leaves are not aligned, so it gets a scale bar rather than an
// axis: a segment of stated length in Δ units.
function scaleBarSvg(x, y, pxPerUnit, color) {
  if (!(pxPerUnit > 0)) return '';
  const raw = 80 / pxPerUnit;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const val = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || mag * 10;
  const w = val * pxPerUnit;
  const dec = val < 0.01 ? 3 : 2;
  return `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${color}" stroke-width="2"/>` +
    `<line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" stroke="${color}" stroke-width="1"/>` +
    `<line x1="${x + w}" y1="${y - 4}" x2="${x + w}" y2="${y + 4}" stroke="${color}" stroke-width="1"/>` +
    `<text x="${x + w / 2}" y="${y + 16}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" fill="${color}">Δ ${val.toFixed(dec)} (branch length)</text>`;
}

// The scale axis under an ultrametric (UPGMA) tree, whose node x positions are
// proportional to cluster height. Ticks are labelled with pairwise divergence
// Δ (= 2 × height), since that is what a join at a given x means for the
// leaves below it. Empty when the tree is degenerate.
function upgmaAxisSvg(leafX, spanPx, rootHeight, axisY, color) {
  const maxDelta = 2 * rootHeight;
  if (!(maxDelta > 0) || !(spanPx > 0)) return '';
  const pxPerDelta = spanPx / maxDelta;

  const raw = maxDelta / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || mag * 10;
  const decimals = step < 0.01 ? 3 : 2;

  let out = `<line x1="${leafX}" y1="${axisY}" x2="${leafX + spanPx}" y2="${axisY}" stroke="${color}" stroke-width="1"/>`;
  for (let v = 0; v <= maxDelta + 1e-9; v += step) {
    const x = leafX + v * pxPerDelta;
    if (x > leafX + spanPx + 0.5) break;
    out += `<line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 5}" stroke="${color}" stroke-width="1"/>`;
    out += `<text x="${x}" y="${axisY + 16}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="${color}">${v.toFixed(decimals)}</text>`;
  }
  out += `<text x="${leafX + spanPx / 2}" y="${axisY + 30}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" fill="${color}">Divergence Δ between lineages</text>`;
  return out;
}
