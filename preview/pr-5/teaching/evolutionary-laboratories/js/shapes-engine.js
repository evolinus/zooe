    function gauss(){
      let u = 1 - Math.random(), v = Math.random();
      return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
    }

    function isConvex(v1x,v1y,v2x,v2y,v3x,v3y,v4x,v4y){
      const cp = (x1,y1,x2,y2,x3,y3)=> (x2-x1)*(y3-y2) - (y2-y1)*(x3-x2);
      const c1=cp(v1x,v1y,v2x,v2y,v3x,v3y), c2=cp(v2x,v2y,v3x,v3y,v4x,v4y);
      const c3=cp(v3x,v3y,v4x,v4y,v1x,v1y), c4=cp(v4x,v4y,v1x,v1y,v2x,v2y);
      return (c1>0&&c2>0&&c3>0&&c4>0) || (c1<0&&c2<0&&c3<0&&c4<0);
    }
    function dotsOverlap(d1x,d1y,d1r,d2x,d2y,d2r){
      const dx=d1x-d2x, dy=d1y-d2y; return (dx*dx+dy*dy) < Math.pow(d1r+d2r,2);
    }

    const SHAPES = {
      polygon: {
        label: 'polygon',
        // Side of the square drawing box drawGenome fits into the canvas.
        // Must cover the furthest a polygon can reach from the origin:
        // vertices go to ±100 and are stroked (up to ±3 more), and a dot can
        // reach 80 + 18 = 98 — so ±103, i.e. a 206-unit box. 210 adds margin.
        extent: 210,
        params: {
          hue:    {min:0,   max:360, circular:true},
          v1x:    {min:-100,max:0,   circular:false}, v1y:    {min:-100,max:0,   circular:false},
          v2x:    {min:0,   max:100, circular:false}, v2y:    {min:-100,max:0,   circular:false},
          v3x:    {min:0,   max:100, circular:false}, v3y:    {min:0,   max:100, circular:false},
          v4x:    {min:-100,max:0,   circular:false}, v4y:    {min:0,   max:100, circular:false},
          d1x:    {min:-80, max:80,  circular:false}, d1y:    {min:-80, max:80,  circular:false}, d1r: {min:3, max:18, circular:false},
          d2x:    {min:-80, max:80,  circular:false}, d2y:    {min:-80, max:80,  circular:false}, d2r: {min:3, max:18, circular:false},
          d1Hue:  {min:0,   max:360, circular:true}, d2Hue:  {min:0,   max:360, circular:true},
          strokeW:{min:1.5, max:6,   circular:false},
        },
        ancestor(){
          return {
            hue: 214, v1x: -35, v1y: -35, v2x: 35, v2y: -35, v3x: 35, v3y: 35, v4x: -35, v4y: 35,
            d1x: -15, d1y: -15, d1r: 9, d2x: 15, d2y: 15, d2r: 9, d1Hue: 40, d2Hue: 320, strokeW: 3
          };
        },
        draw(ctx, genome){
          const bodyColor = `hsl(${genome.hue.toFixed(1)}, 58%, 27%)`;
          ctx.lineWidth = genome.strokeW; ctx.strokeStyle = bodyColor; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(genome.v1x, genome.v1y); ctx.lineTo(genome.v2x, genome.v2y);
          ctx.lineTo(genome.v3x, genome.v3y); ctx.lineTo(genome.v4x, genome.v4y);
          ctx.closePath(); ctx.stroke();
          ctx.fillStyle = `hsl(${genome.d1Hue.toFixed(1)}, 65%, 45%)`;
          ctx.beginPath(); ctx.arc(genome.d1x, genome.d1y, genome.d1r, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = `hsl(${genome.d2Hue.toFixed(1)}, 65%, 45%)`;
          ctx.beginPath(); ctx.arc(genome.d2x, genome.d2y, genome.d2r, 0, Math.PI*2); ctx.fill();
        }
      },
      fish: {
        label: 'fish',
        // The fish is re-centred on its own nose-to-tail extent when drawn, and
        // its widest reach (body + fins + tail spread) stays inside ±95.
        extent: 190,
        params: {
          bodyHue:   {min:0,   max:360, circular:true},
          bodyLightness: {min:15, max:70, circular:false},
          finHue:    {min:0,   max:360, circular:true},
          finLightness: {min:20, max:65, circular:false},
          tailHue:   {min:0,   max:360, circular:true},
          strokeW:   {min:1.5, max:6,   circular:false},
          bRxFront:  {min:22,  max:50,  circular:false},
          bRxBack:   {min:30,  max:62,  circular:false},
          bRy:       {min:15,  max:38,  circular:false},
          gillPosFrac: {min:0.16, max:0.42, circular:false},
          gillBulge:   {min:0.04, max:0.30, circular:false},
          eyeGillFrac: {min:0.15, max:0.85, circular:false},
          eyeYFrac:    {min:-0.75,max:0.10, circular:false},
          eyeR:        {min:2.5, max:7.5,  circular:false},
          mouthGap:    {min:0.15,max:1.0,  circular:false},
          dorsAttachFrac: {min:0.30, max:0.68, circular:false},
          dorsLen:        {min:14,  max:38,   circular:false},
          dorsAngle:      {min:0.05,max:1.15, circular:false},
          dorsBase:       {min:0.05,max:0.16, circular:false},
          analAttachFrac: {min:0.55, max:0.86, circular:false},
          analLen:        {min:10,  max:30,   circular:false},
          analAngle:      {min:0.05,max:1.15, circular:false},
          analBase:       {min:0.04,max:0.13, circular:false},
          tailLen:    {min:20, max:52, circular:false},
          tailSpread: {min:14, max:48, circular:false},
          tailNotch:  {min:4,  max:24, circular:false},
        },
        ancestor(){
          return {
            bodyHue: 200, bodyLightness: 27, finHue: 24, finLightness: 45, tailHue: 24, strokeW: 3,
            bRxFront: 34, bRxBack: 46, bRy: 26,
            gillPosFrac: 0.28, gillBulge: 0.14,
            eyeGillFrac: 0.5, eyeYFrac: -0.35, eyeR: 4.5,
            mouthGap: 0.4,
            dorsAttachFrac: 0.48, dorsLen: 26, dorsAngle: 0.35, dorsBase: 0.1,
            analAttachFrac: 0.7,  analLen: 18, analAngle: 0.3, analBase: 0.08,
            tailLen: 36, tailSpread: 30, tailNotch: 12
          };
        },
        draw(ctx, genome){
          const g = genome;
          const bodyColor = `hsl(${g.bodyHue.toFixed(1)}, 55%, ${g.bodyLightness.toFixed(1)}%)`;
          const finColor  = `hsl(${g.finHue.toFixed(1)}, 60%, ${g.finLightness.toFixed(1)}%)`;
          const tailColor = `hsl(${g.tailHue.toFixed(1)}, 60%, 45%)`;

          function bodyPt(frac, side){
            const f = Math.min(1, Math.max(0, frac));
            const x = -g.bRxFront + f * (g.bRxFront + g.bRxBack);
            const y = side * g.bRy * Math.sin(f * Math.PI);
            return {x, y};
          }

          // Centered on the true nose-to-tail-tip extent (not just the body
          // ellipse) so a long tail doesn't run off the edge of the canvas —
          // tailLen and the body radii mutate independently, so the tail tip
          // can reach well past the body's own rightmost point.
          const noseX = -g.bRxFront;
          const tailAttach = bodyPt(1, 0);
          const tipX = tailAttach.x + g.tailLen * 0.9;
          const centerX = (noseX + tipX) / 2;
          ctx.save(); ctx.translate(-centerX, 0);
          ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = g.strokeW;

          const effNotch = Math.min(g.tailNotch, g.tailLen * 0.7);
          const upperTip = {x: tipX, y: -g.tailSpread/2};
          const lowerTip = {x: tipX, y: g.tailSpread/2};
          const notchPt = {x: tailAttach.x + effNotch, y: 0};
          ctx.beginPath(); ctx.moveTo(tailAttach.x, tailAttach.y);
          ctx.lineTo(upperTip.x, upperTip.y); ctx.lineTo(notchPt.x, notchPt.y);
          ctx.lineTo(lowerTip.x, lowerTip.y); ctx.closePath();
          ctx.fillStyle = tailColor; ctx.strokeStyle = tailColor;
          ctx.fill(); ctx.stroke();

          function drawFin(attachFrac, len, angle, base, side){
            const minFrac = g.gillPosFrac + base + 0.03;
            const eff = Math.min(Math.max(attachFrac, minFrac), 1 - base - 0.01);
            const baseA = bodyPt(eff - base, side); const baseB = bodyPt(eff + base, side);
            const mid = {x:(baseA.x+baseB.x)/2, y:(baseA.y+baseB.y)/2};
            const dir = {x: Math.sin(angle)*0.55, y: side * Math.cos(angle)};
            const apex = {x: mid.x + dir.x*len, y: mid.y + dir.y*len};
            ctx.beginPath(); ctx.moveTo(baseA.x, baseA.y);
            ctx.lineTo(apex.x, apex.y); ctx.lineTo(baseB.x, baseB.y); ctx.closePath();
            ctx.fillStyle = finColor; ctx.strokeStyle = finColor;
            ctx.fill(); ctx.stroke();
          }
          drawFin(g.dorsAttachFrac, g.dorsLen, g.dorsAngle, g.dorsBase, -1);
          drawFin(g.analAttachFrac, g.analLen, g.analAngle, g.analBase, 1);

          ctx.beginPath(); ctx.moveTo(-g.bRxFront, 0);
          ctx.quadraticCurveTo(-g.bRxFront*0.3, -g.bRy, 0, -g.bRy);
          ctx.quadraticCurveTo(g.bRxBack*0.6, -g.bRy, g.bRxBack, 0);
          ctx.quadraticCurveTo(g.bRxBack*0.6, g.bRy, 0, g.bRy);
          ctx.quadraticCurveTo(-g.bRxFront*0.3, g.bRy, -g.bRxFront, 0); ctx.closePath();
          ctx.strokeStyle = bodyColor; ctx.stroke();

          const gillTop = bodyPt(g.gillPosFrac, -1); const gillBot = bodyPt(g.gillPosFrac, 1);
          const gillCtrl = {x: (gillTop.x+gillBot.x)/2 + g.gillBulge*g.bRxBack, y: 0};
          ctx.beginPath(); ctx.moveTo(gillTop.x, gillTop.y);
          ctx.quadraticCurveTo(gillCtrl.x, gillCtrl.y, gillBot.x, gillBot.y);
          ctx.strokeStyle = bodyColor; ctx.stroke();

          const nose = bodyPt(0, 0);
          ctx.beginPath(); ctx.moveTo(nose.x, nose.y);
          ctx.lineTo(nose.x + g.mouthGap*g.bRxFront*0.4, nose.y + g.mouthGap*g.bRy*0.25);
          ctx.strokeStyle = bodyColor; ctx.stroke();

          const eyeFrac = g.eyeGillFrac * g.gillPosFrac; const eyeBase = bodyPt(eyeFrac, 0);
          const eyeY = g.eyeYFrac * g.bRy * Math.sin(Math.min(1,Math.max(0,eyeFrac)) * Math.PI + 0.15);
          ctx.beginPath(); ctx.arc(eyeBase.x, eyeY, g.eyeR, 0, Math.PI*2);
          ctx.fillStyle = bodyColor; ctx.fill();
          ctx.restore();
        }
      }
    };

    function freshAncestor(shapeKey){ return SHAPES[shapeKey].ancestor(); }

    function mutate(genome, sigmaFrac, shapeKey){
      const params = SHAPES[shapeKey].params;
      let out = {}; let valid = false; let attempts = 0;
      while(!valid && attempts < 50){
        out = {};
        for(const k of Object.keys(params)){
          const p = params[k]; const range = p.max - p.min;
          if(p.circular){
            let nv = genome[k] + gauss()*sigmaFrac*range*0.5;
            nv = ((nv - p.min) % range + range) % range + p.min; out[k] = nv;
          } else {
            let nv = genome[k] + gauss()*sigmaFrac*range; out[k] = Math.min(p.max, Math.max(p.min, nv));
          }
        }
        valid = true;
        if(shapeKey === 'polygon'){
          if(!isConvex(out.v1x,out.v1y,out.v2x,out.v2y,out.v3x,out.v3y,out.v4x,out.v4y)) valid = false;
          if(dotsOverlap(out.d1x,out.d1y,out.d1r,out.d2x,out.d2y,out.d2r)) valid = false;
        }
        attempts++;
      }
      if(!valid && shapeKey === 'polygon'){
        out.v1x=genome.v1x; out.v1y=genome.v1y; out.v2x=genome.v2x; out.v2y=genome.v2y;
        out.v3x=genome.v3x; out.v3y=genome.v3y; out.v4x=genome.v4x; out.v4y=genome.v4y;
        out.d1x=genome.d1x; out.d1y=genome.d1y; out.d1r=genome.d1r;
        out.d2x=genome.d2x; out.d2y=genome.d2y; out.d2r=genome.d2r;
      }
      return out;
    }

    function averageGenome(g1, g2, shapeKey) {
      const params = SHAPES[shapeKey].params; let out = {};
      for(let k of Object.keys(params)) {
        let p = params[k];
        if(p.circular) {
          let a1 = g1[k] * Math.PI / 180; let a2 = g2[k] * Math.PI / 180;
          let x = Math.cos(a1) + Math.cos(a2); let y = Math.sin(a1) + Math.sin(a2);
          let avg = Math.atan2(y, x) * 180 / Math.PI; if(avg < 0) avg += 360; out[k] = avg;
        } else { out[k] = (g1[k] + g2[k]) / 2; }
      }
      return out;
    }

    function normDist(g1, g2, shapeKey){
      const params = SHAPES[shapeKey].params; const keys = Object.keys(params);
      let sum = 0;
      for(const k of keys){
        const p = params[k]; const range = p.max - p.min; let d;
        if(p.circular){
          let raw = Math.abs(g1[k]-g2[k]) % range; d = Math.min(raw, range-raw) / (range/2);
        } else { d = Math.abs(g1[k]-g2[k]) / range; }
        sum += d*d;
      }
      return Math.sqrt(sum / keys.length);
    }

    function drawGenome(ctx, w, h, genome, shapeKey){
      ctx.clearRect(0,0,w,h); ctx.save(); ctx.translate(w/2, h/2);
      const scale = Math.min(w,h) / (SHAPES[shapeKey].extent || 190); ctx.scale(scale, scale);
      SHAPES[shapeKey].draw(ctx, genome); ctx.restore();
    }
