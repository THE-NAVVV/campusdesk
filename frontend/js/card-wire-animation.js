// ===== Background: PCB signal traces pulsing into the login/OTP card from all 4 sides =====
// Adapted from chip-animation.js: chip box + label removed, target is the card's own
// bounding box, and instead of a one-time build it repeats in a loop every ~5 seconds.
(function(){
  const canvas = document.getElementById('bgChip');
  const card = document.getElementById('otpCard'); // <-- give your login/OTP card this id
  if(!canvas || !card) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduceMotion) return;

  const ctx = canvas.getContext('2d');
  let cw, ch;
  let cardBox; // {x0,y0,x1,y1} of the card, in canvas coords
  let traces = [];
  let pins = [];
  const PINS_PER_SIDE = 5;
  const FADE_LEN = 90;
  const DIM_ALPHA = 0.10;
  const LINE_W = 1.4;
  const COLOR = '85,101,79'; // sage, matches site theme

  const CYCLE_MS = 5000;   // full loop duration: one pulse every 5s
  const BUILD_FRAMES = 90; // wires shooting in (longer travel now, so slower/smoother)
  const HOLD_FRAMES = 30;  // sit lit at the card edge
  const FADE_FRAMES = 30;  // fade back out before next cycle
  let frame = 0;
  let phase = 'building';

  function measureCard(){
    const r = card.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    cardBox = {
      x0: r.left - cr.left,
      y0: r.top - cr.top,
      x1: r.right - cr.left,
      y1: r.bottom - cr.top
    };
  }

  function buildPins(){
    pins = [];
    const { x0, y0, x1, y1 } = cardBox;
    const sides = [
      { side:'top',    x0, y0, x1, y1: y0 },
      { side:'bottom', x0, y0: y1, x1, y1 },
      { side:'left',   x0, y0, x1: x0, y1 },
      { side:'right',  x0: x1, y0, x1, y1 }
    ];
    sides.forEach(function(s){
      for(let i=0;i<PINS_PER_SIDE;i++){
        const f = (i+1)/(PINS_PER_SIDE+1);
        pins.push({ x: s.x0 + (s.x1-s.x0)*f, y: s.y0 + (s.y1-s.y0)*f, side: s.side });
      }
    });
  }

  function buildPath(sx, sy, pin){
    const approachGap = 24 + Math.random()*26;
    let ax = pin.x, ay = pin.y;
    if(pin.side === 'top') ay = pin.y - approachGap;
    else if(pin.side === 'bottom') ay = pin.y + approachGap;
    else if(pin.side === 'left') ax = pin.x - approachGap;
    else ax = pin.x + approachGap;

    const pts = [{x:sx,y:sy}];
    if(pin.side === 'top' || pin.side === 'bottom'){
      const midY = sy + (ay - sy) * (0.35 + Math.random()*0.3);
      pts.push({x:sx, y:midY});
      pts.push({x:ax, y:midY});
      pts.push({x:ax, y:ay});
    } else {
      const midX = sx + (ax - sx) * (0.35 + Math.random()*0.3);
      pts.push({x:midX, y:sy});
      pts.push({x:midX, y:ay});
      pts.push({x:ax, y:ay});
    }
    pts.push({x:pin.x, y:pin.y});
    return pts;
  }

  function pathLength(pts){
    let total = 0;
    const cum = [0];
    for(let i=1;i<pts.length;i++){
      total += Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y);
      cum.push(total);
    }
    return { total, cum };
  }

  function pointAtDistance(pts, cum, d){
    if(d <= 0) return pts[0];
    for(let i=1;i<pts.length;i++){
      if(d <= cum[i]){
        const segLen = cum[i]-cum[i-1];
        const f = segLen === 0 ? 0 : (d-cum[i-1])/segLen;
        return { x: pts[i-1].x + (pts[i].x-pts[i-1].x)*f, y: pts[i-1].y + (pts[i].y-pts[i-1].y)*f };
      }
    }
    return pts[pts.length-1];
  }

  function buildTraces(){
    traces = [];
    buildPins();
    const shuffled = pins.slice().sort(function(){ return Math.random()-0.5; });

    shuffled.forEach(function(pin){
      // spawn far out at the canvas edge on the same side as the pin, so the
      // trace travels a long visible distance in before reaching the card
      let sx, sy;
      if(pin.side === 'top'){ sx = Math.random()*cw; sy = 0; }
      else if(pin.side === 'bottom'){ sx = Math.random()*cw; sy = ch; }
      else if(pin.side === 'left'){ sx = 0; sy = Math.random()*ch; }
      else { sx = cw; sy = Math.random()*ch; }

      const pts = buildPath(sx, sy, pin);
      const { total, cum } = pathLength(pts);

      traces.push({
        pts, cum, total,
        speed: total / BUILD_FRAMES,
        startDelay: Math.random()*10
      });
    });
  }

  function resize(){
    const rect = canvas.getBoundingClientRect();
    cw = canvas.width = rect.width;
    ch = canvas.height = rect.height;
    measureCard();
    frame = 0;
    phase = 'building';
    buildTraces();
  }

  function drawSegment(tr, head, alphaMul){
    const headPt = pointAtDistance(tr.pts, tr.cum, head);
    ctx.save();
    ctx.strokeStyle = 'rgba(' + COLOR + ',' + (DIM_ALPHA*alphaMul).toFixed(3) + ')';
    ctx.lineWidth = LINE_W;
    ctx.beginPath();
    ctx.moveTo(tr.pts[0].x, tr.pts[0].y);
    for(let i=1;i<tr.pts.length;i++){
      if(tr.cum[i] <= head) ctx.lineTo(tr.pts[i].x, tr.pts[i].y);
      else { ctx.lineTo(headPt.x, headPt.y); break; }
    }
    ctx.stroke();
    ctx.restore();

    const tailStart = Math.max(0, head - FADE_LEN);
    const steps = 14;
    ctx.save();
    ctx.lineCap = 'round';
    for(let s=0; s<steps; s++){
      const d0 = tailStart + (head-tailStart) * (s/steps);
      const d1 = tailStart + (head-tailStart) * ((s+1)/steps);
      const p0 = pointAtDistance(tr.pts, tr.cum, d0);
      const p1 = pointAtDistance(tr.pts, tr.cum, d1);
      const f = (s+1)/steps;
      const alpha = (DIM_ALPHA + (0.55-DIM_ALPHA) * f) * alphaMul;
      ctx.strokeStyle = 'rgba(' + COLOR + ',' + alpha.toFixed(3) + ')';
      ctx.lineWidth = LINE_W + f*0.6;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(' + COLOR + ',' + (0.8*alphaMul).toFixed(3) + ')';
    ctx.shadowColor = 'rgba(' + COLOR + ',' + (0.65*alphaMul).toFixed(3) + ')';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(headPt.x, headPt.y, 2.6, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function draw(){
    ctx.clearRect(0,0,cw,ch);

    let localAlpha = 1;
    if(phase === 'fading'){
      const fadeProgress = (frame - (BUILD_FRAMES+HOLD_FRAMES)) / FADE_FRAMES;
      localAlpha = Math.max(0, 1 - fadeProgress);
    }

    traces.forEach(function(tr){
      let head;
      if(frame < tr.startDelay) return;
      const localFrame = frame - tr.startDelay;
      if(phase === 'building'){
        head = Math.min(localFrame * tr.speed, tr.total);
      } else {
        head = tr.total; // fully drawn during hold + fade
      }
      drawSegment(tr, head, localAlpha);
    });

    ctx.save();
    ctx.fillStyle = 'rgba(' + COLOR + ',' + (0.45*localAlpha).toFixed(3) + ')';
    const pinLen = 9, pinThick = 3;
    pins.forEach(function(p){
      ctx.save();
      ctx.translate(p.x, p.y);
      if(p.side === 'top') ctx.fillRect(-pinThick/2, 0, pinThick, pinLen);
      else if(p.side === 'bottom') ctx.fillRect(-pinThick/2, -pinLen, pinThick, pinLen);
      else if(p.side === 'left') ctx.fillRect(0, -pinThick/2, pinLen, pinThick);
      else ctx.fillRect(-pinLen, -pinThick/2, pinLen, pinThick);
      ctx.restore();
    });
    ctx.restore();
  }

  function tick(){
    frame += 1;

    if(phase === 'building' && frame >= BUILD_FRAMES){
      phase = 'hold';
    } else if(phase === 'hold' && frame >= BUILD_FRAMES + HOLD_FRAMES){
      phase = 'fading';
    } else if(phase === 'fading' && frame >= BUILD_FRAMES + HOLD_FRAMES + FADE_FRAMES){
      // restart the loop: re-measure in case card moved (e.g. resize/scroll) and rebuild
      measureCard();
      buildTraces();
      frame = 0;
      phase = 'building';
    }

    draw();
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('preloaderHidden', resize);
  resize();
  tick();
})();