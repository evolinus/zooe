    // Sizes a canvas's backing bitmap to match its actual rendered CSS size times
    // the device pixel ratio, then scales the context so drawing code can keep
    // working in ordinary CSS-pixel coordinates. Safe to call on every redraw —
    // re-assigning canvas.width/height always clears the canvas and resets its
    // transform, so there's no accumulation risk from repeated calls.
    function scaleCanvas(canvas, ctx, width, height) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.scale(dpr, dpr);
    }

    // Draws label text with the scientific convention the DOM already follows:
    // variable letters slanted, digits and words upright. Canvas has one font
    // per fillText call, so the string is split into runs and each is drawn with
    // its own font, advancing by the measured width.
    //
    // Two ways to mark a symbol, and explicit wins:
    //   - <var>k</var>  an explicit marker, for a bare symbol like k, p, D
    //   - A₁            a letter followed by a subscript is marked automatically
    // Strings with no symbol at all take the plain fillText path unchanged.
    function fillSci(ctx, text, x, y) {
      let s = String(text);
      if (s.indexOf('<var>') < 0 && !/[A-Za-z][\u2080\u2081\u2082]/.test(s)) {
        ctx.fillText(s, x, y); return;                  // nothing to slant
      }
      s = markSymbols(s);

      const runs = [];
      const re = /<var>([\s\S]*?)<\/var>/g;
      let i = 0, m;
      while ((m = re.exec(s)) !== null) {
        if (m.index > i) runs.push([s.slice(i, m.index), false]);
        runs.push([m[1], true]);
        i = m.index + m[0].length;
      }
      if (i < s.length) runs.push([s.slice(i), false]);

      const base = ctx.font;
      const ital = /^italic\b/.test(base) ? base : 'italic ' + base;
      const setFont = (isVar) => { ctx.font = isVar ? ital : base; };

      // Alignment has to be resolved by hand: each run is drawn from the left,
      // so the whole string is measured first and the start point shifted.
      let total = 0;
      for (const [t, v] of runs) { setFont(v); total += ctx.measureText(t).width; }
      const align = ctx.textAlign;
      let cx = x;
      if (align === 'center') cx = x - total / 2;
      else if (align === 'right' || align === 'end') cx = x - total;

      ctx.textAlign = 'left';
      for (const [t, v] of runs) {
        setFont(v);
        ctx.fillText(t, cx, y);
        cx += ctx.measureText(t).width;
      }
      ctx.font = base;
      ctx.textAlign = align;
    }

    // Same convention for SVG <text>, where a tspan can carry the style.
    function sciTspan(text) {
      return markSymbols(String(text))
        .replace(/<var>([\s\S]*?)<\/var>/g, '<tspan font-style="italic">$1</tspan>');
    }

    // Adds the automatic letter+subscript marking WITHOUT disturbing spans that
    // were marked explicitly, so a string may mix the two: "<var>k</var> (count
    // of allele A₁ next gen)" ends up with both the k and the A slanted.
    function markSymbols(s) {
      return s.split(/(<var>[\s\S]*?<\/var>)/).map(function (seg) {
        return seg.slice(0, 5) === '<var>'
          ? seg
          : seg.replace(/([A-Za-z])([\u2080\u2081\u2082])/g, '<var>$1</var>$2');
      }).join('');
    }
