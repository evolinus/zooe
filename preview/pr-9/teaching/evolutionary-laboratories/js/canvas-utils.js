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
