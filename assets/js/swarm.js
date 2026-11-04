/* ---------- Cursor Swarm: agents fly in flocks and annotate [data-agent] elements ---------- */
(() => {
  const cv = document.getElementById('swarm'), cx = cv.getContext('2d');
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const PAL = ['--agent-1','--agent-2','--agent-3','--agent-4','--agent-5','--agent-6','--agent-7','--agent-8'].map(css);
  const SELECT = css('--select'), GUIDE = css('--guide'), BLOCK = css('--block'), BG = css('--bg'), FG = css('--fg');
  const MONO = '500 10px "Geist Mono", ui-monospace, monospace';
  const NAMES = ['atlas','brio','cove','dune','echo','fern','gale','halo','iris','juno','kilo','lumen','moss','nyx','orca','pike'];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Markdown content can't carry attributes, so tag post content here
  document.querySelectorAll('.prose > h2, .prose > h3, .prose > p, .prose > pre, .prose > blockquote, .prose > div.highlighter-rouge, .prose > ul, .prose img')
    .forEach(el => { if (!el.hasAttribute('data-agent')) el.setAttribute('data-agent', el.tagName === 'IMG' ? 'panel' : ''); });
  const targets = [...document.querySelectorAll('[data-agent]')];
  const rand = (a,b) => a + Math.random()*(b-a);
  const ease = t => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
  let W, H, DPR, flocks = [], agents = [], notes = [], drawn = 0, paused = reduce, ruler = 0, last = performance.now();
  const mouse = { x:-1e4, y:-1e4, t:0 };
  let level = 2;
  const LEVELS = [
    { name:'Off' },
    { name:'Calm', n:() => 4, max:4, speed:55, ruler:false },
    { name:'Full', n:() => 8, max:22, speed:95, ruler:true },
    { name:'Busy', n:() => 96, max:40, speed:115, ruler:true }
  ];
  const LV = () => LEVELS[level];

  function resize(){ DPR = Math.min(2, devicePixelRatio||1); W = innerWidth; H = innerHeight;
    cv.width = W*DPR; cv.height = H*DPR; cx.setTransform(DPR,0,0,DPR,0,0); }
  addEventListener('resize', resize); resize();

  function build(n){
    flocks = []; agents = [];
    for (let i=0; i<n;){
      const size = Math.min(n-i, 3 + (Math.random()*5|0)), color = PAL[flocks.length % PAL.length];
      const f = { color, name: NAMES[flocks.length % NAMES.length], members: [], state:'roam', timer: rand(.3,2.5), h: rand(0,6.28), el:null, note:null, t:0, dur:1 };
      const x = rand(40, W-40), y = rand(80, H-80);
      for (let k=0; k<size; k++, i++){ const a = { x:x+rand(-30,30), y:y+rand(-30,30), vx:0, vy:0, rot:0, color, f, k }; f.members.push(a); agents.push(a); }
      flocks.push(f);
    }
    document.getElementById('dots').innerHTML = PAL.slice(0, Math.min(flocks.length, 6)).map(c=>`<i style="background:${c}"></i>`).join('');
  }

  const onScreen = el => { const r = el.getBoundingClientRect(); return r.width > 6 && r.height > 6 && r.top > 64 && r.bottom < H-70 && r.left > -4 && r.right < W+4; };
  function pickType(el){
    if (level === 1) return Math.random() < .6 ? 'select' : 'outline';
    const panel = el.dataset.agent === 'panel', r = Math.random();
    if (panel) return r < .45 ? 'block' : r < .8 ? 'select' : 'guide';
    return r < .48 ? 'select' : r < .72 ? 'outline' : r < .86 ? 'guide' : 'mark';
  }
  function label(el){ return el.dataset.agentLabel || (el.tagName.toLowerCase() + (el.classList[0] ? '.'+el.classList[0] : '')); }

  function assign(f, el){ f.el = el; f.state = 'travel'; }
  function startWork(f){
    const active = notes.filter(n => n.phase !== 'fade');
    if (active.length > LV().max) active[0].phase = 'fade';
    f.note = { el:f.el, type:pickType(f.el), color:f.color, p:0, phase:'grow', hold:rand(1.6,4), a:1, vertical: Math.random() < .6, guideColor: Math.random()<.5 ? SELECT : GUIDE, label:label(f.el), who:f.name };
    notes.push(f.note); drawn++;
    f.state = 'work'; f.t = 0; f.dur = rand(.6,1.3);
  }

  function steer(a, tx, ty, k, damp, dt){
    const s = dt*60; a.vx += (tx-a.x)*k*s; a.vy += (ty-a.y)*k*s;
    const d = Math.pow(damp, s); a.vx *= d; a.vy *= d; a.x += a.vx*s; a.y += a.vy*s;
  }

  function update(dt){
    for (const f of flocks){
      const L = f.members[0];
      if (f.state === 'roam'){
        f.h += rand(-.9,.9)*dt*3;
        // keep inside, drift toward centre near edges
        const cxp = W/2 - L.x, cyp = H/2 - L.y;
        if (L.x < 60 || L.x > W-60 || L.y < 90 || L.y > H-90) f.h += (Math.atan2(cyp,cxp) - f.h) * .08;
        // curiosity toward a recently moved mouse
        if (performance.now() - mouse.t < 1500){ const dx = mouse.x-L.x, dy = mouse.y-L.y, d = Math.hypot(dx,dy);
          if (d < 260 && d > 40) f.h += (Math.atan2(dy,dx) - f.h) * .05; }
        const sp = LV().speed;
        L.vx += (Math.cos(f.h)*sp*dt - L.vx)*.1; L.vy += (Math.sin(f.h)*sp*dt - L.vy)*.1; L.x += L.vx; L.y += L.vy;
        f.timer -= dt;
        if (f.timer < 0){ const vis = targets.filter(onScreen); if (vis.length) assign(f, vis[Math.random()*vis.length|0]); else f.timer = 1; }
      } else if (f.state === 'travel'){
        if (!onScreen(f.el)){ f.state = 'roam'; f.timer = rand(.5,1.5); }
        else { const r = f.el.getBoundingClientRect(); const tx = r.left-3, ty = r.top-3;
          steer(L, tx, ty, .012, .86, dt); f.h = Math.atan2(L.vy, L.vx);
          if (Math.hypot(tx-L.x, ty-L.y) < 6) startWork(f); }
      } else if (f.state === 'work'){
        f.t += dt; const p = Math.min(1, f.t/f.dur); f.note.p = p;
        const r = f.el.getBoundingClientRect(), e = ease(p);
        L.x = r.left-3 + (r.width+6)*e; L.y = r.top-3 + (r.height+6)*e; L.vx = L.vy = 0;
        if (p >= 1){ f.note.phase = 'hold'; f.note = null; f.state = 'roam'; f.timer = rand(.8,3); f.h = rand(0,6.28); }
      }
      // followers
      const n = f.members.length;
      for (let i=1; i<n; i++){
        const a = f.members[i]; let tx, ty;
        if (f.state === 'work' && f.el){
          const r = f.el.getBoundingClientRect(), per = 2*(r.width+r.height), s = (i/n)*per;
          if (s < r.width){ tx = r.left+s; ty = r.top-6; } else if (s < r.width+r.height){ tx = r.right+6; ty = r.top+(s-r.width); }
          else if (s < 2*r.width+r.height){ tx = r.right-(s-r.width-r.height); ty = r.bottom+6; } else { tx = r.left-6; ty = r.bottom-(s-2*r.width-r.height); }
          steer(a, tx, ty, .02, .8, dt);
        } else {
          const hx = Math.cos(f.h), hy = Math.sin(f.h);
          tx = L.x - hx*14*i - hy*(i%2?7:-7); ty = L.y - hy*14*i + hx*(i%2?7:-7);
          steer(a, tx, ty, .045, .72, dt);
        }
      }
    }
    for (const a of agents){ const sp = Math.hypot(a.vx, a.vy);
      const want = sp > .6 ? Math.atan2(a.vy, a.vx) + 1.98 : 0; let d = want - a.rot; d = Math.atan2(Math.sin(d), Math.cos(d)); a.rot += d * Math.min(1, dt*8); }
    for (const n of notes){
      if (n.phase === 'hold'){ n.hold -= dt; if (n.hold < 0) n.phase = 'fade'; }
      if (n.phase === 'fade'){ n.a -= dt*2.2; }
    }
    notes = notes.filter(n => n.a > 0 && n.el.isConnected);
  }

  /* ---------- drawing ---------- */
  function pill(x, y, text, bg, fg){
    cx.font = MONO; const w = cx.measureText(text).width + 10;
    x = Math.max(4, Math.min(W - w - 4, x));
    cx.fillStyle = bg; cx.fillRect(x, y, w, 15); cx.fillStyle = fg; cx.fillText(text, x+5, y+11);
  }
  function handles(x, y, w, h, c){
    cx.fillStyle = FG; cx.strokeStyle = c; cx.lineWidth = 1.2;
    for (const [hx,hy] of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]){ cx.fillRect(hx-3,hy-3,6,6); cx.strokeRect(hx-3,hy-3,6,6); }
  }
  function drawNote(n){
    const r = n.el.getBoundingClientRect(); if (r.bottom < -40 || r.top > H+40) return;
    const e = ease(n.p), x = r.left-3, y = r.top-3, w = (r.width+6)*e, h = (r.height+6)*e;
    cx.globalAlpha = Math.max(0, n.a);
    if (n.type === 'select' || n.type === 'mark'){
      cx.fillStyle = SELECT; cx.globalAlpha *= n.type === 'mark' ? .32 : .08; cx.fillRect(x, y, w, h); cx.globalAlpha = Math.max(0,n.a);
      cx.strokeStyle = SELECT; cx.lineWidth = 1.5; cx.strokeRect(x, y, w, h);
      if (n.type === 'select'){ handles(x, y, w, h, SELECT); if (n.p > .95) pill(x + w/2 - 30, y + h + 6, `${Math.round(r.width)} × ${Math.round(r.height)}`, SELECT, FG); }
    } else if (n.type === 'outline'){
      cx.strokeStyle = GUIDE; cx.lineWidth = 1.5; cx.strokeRect(x, y, w, h);
      pill(x, y - 16, n.label, GUIDE, BG);
    } else if (n.type === 'block'){
      cx.fillStyle = BLOCK; cx.globalAlpha *= .88; cx.fillRect(x, y, w, h); cx.globalAlpha = Math.max(0,n.a);
      cx.strokeStyle = SELECT; cx.lineWidth = 2; cx.strokeRect(x, y, w, h); handles(x, y, w, h, SELECT);
      if (n.p > .95) pill(x + 6, y + h - 21, `frame · ${Math.round(r.width)}×${Math.round(r.height)}`, SELECT, FG);
    } else if (n.type === 'guide'){
      cx.strokeStyle = n.guideColor; cx.lineWidth = 1.5; cx.beginPath();
      if (n.vertical){ cx.moveTo(r.left+.5, 0); cx.lineTo(r.left+.5, H*e); } else { cx.moveTo(0, r.bottom+.5); cx.lineTo(W*e, r.bottom+.5); }
      cx.stroke(); cx.strokeStyle = SELECT; cx.lineWidth = 1; cx.strokeRect(r.left, r.top, r.width*e, r.height*e);
      if (n.p > .95) pill(n.vertical ? r.left + 4 : r.left, n.vertical ? r.top - 18 : r.bottom + 4, n.vertical ? `x ${Math.round(r.left)}` : `y ${Math.round(r.bottom + scrollY)}`, n.guideColor, n.guideColor === GUIDE ? BG : FG);
    }
    cx.globalAlpha = 1;
  }
  function drawRuler(){
    if (ruler < .01) return;
    const sel = [...notes].reverse().find(n => n.type === 'select' || n.type === 'block');
    cx.globalAlpha = ruler; cx.fillStyle = BG; cx.globalAlpha = ruler*.92; cx.fillRect(0, 0, W, 16); cx.globalAlpha = ruler;
    if (sel){ const r = sel.el.getBoundingClientRect(); cx.fillStyle = SELECT; cx.globalAlpha = ruler*.75; cx.fillRect(r.left, 0, r.width, 16); cx.globalAlpha = ruler; }
    cx.strokeStyle = '#5d626b'; cx.lineWidth = 1; cx.beginPath();
    for (let x=0; x<W; x+=10){ const big = x%100===0; cx.moveTo(x+.5, 16); cx.lineTo(x+.5, big ? 4 : x%50===0 ? 9 : 12); }
    cx.stroke(); cx.fillStyle = '#8a909a'; cx.font = '500 8.5px "Geist Mono", monospace';
    for (let x=100; x<W; x+=100) cx.fillText(x, x+3, 10);
    cx.globalAlpha = 1;
  }
  const ARROW = new Path2D('M0 0 L0 15.5 L4.2 11.6 L7.1 18 L9.6 16.9 L6.8 10.6 L12 10.6 Z');
  function drawAgent(a){
    cx.save(); cx.translate(a.x, a.y); cx.rotate(a.rot);
    cx.fillStyle = a.color; cx.strokeStyle = BG; cx.lineWidth = 1.3; cx.lineJoin = 'round';
    cx.fill(ARROW); cx.stroke(ARROW); cx.restore();
  }
  function draw(){
    cx.clearRect(0, 0, W, H);
    for (const n of notes) drawNote(n);
    drawRuler();
    for (const a of agents) drawAgent(a);
    for (const f of flocks) if (f.state === 'work'){ const L = f.members[0]; pill(L.x + 12, L.y + 18, f.name, f.color, BG); }
  }

  function frame(now){
    const dt = Math.min(.05, (now-last)/1000); last = now;
    if (!paused) update(dt);
    const want = LV().ruler && notes.some(n => n.type === 'select' || n.type === 'block') ? 1 : 0; ruler += (want - ruler) * Math.min(1, dt*4);
    draw(); requestAnimationFrame(frame);
  }

  /* ---------- interaction ---------- */
  addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = performance.now(); }, { passive:true });
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-agent]'); if (!el || paused) return;
    const r = el.getBoundingClientRect();
    flocks.filter(f => f.state !== 'work').sort((a,b) => Math.hypot(a.members[0].x-r.left, a.members[0].y-r.top) - Math.hypot(b.members[0].x-r.left, b.members[0].y-r.top)).slice(0,3).forEach(f => assign(f, el));
  });
  const pauseBtn = document.getElementById('pause');
  const setPaused = v => { paused = v; pauseBtn.textContent = v ? 'Play' : 'Pause'; pauseBtn.classList.toggle('primary', !v); };
  pauseBtn.onclick = () => setPaused(!paused);
  document.getElementById('clear').onclick = () => notes.forEach(n => n.phase = 'fade');
  function setLevel(v){
    level = v; const L = LV(), r = document.getElementById('complexity');
    r.value = v; r.setAttribute('aria-valuetext', L.name); document.getElementById('lvl').textContent = L.name;
    notes = []; cv.hidden = v === 0; build(v ? L.n() : 0);
    try { localStorage.setItem('nw-complexity', v); } catch {}
  }
  document.getElementById('complexity').oninput = e => setLevel(+e.target.value);
  setInterval(() => {
    document.getElementById('nAgents').textContent = agents.length;
    document.getElementById('nLayers').textContent = notes.length;
    document.getElementById('nDrawn').textContent = drawn;
  }, 250);

  let saved = null; try { saved = localStorage.getItem('nw-complexity'); } catch {}
  const pageDefault = document.body.dataset.swarm ? +document.body.dataset.swarm : 2;
  setLevel(saved !== null && LEVELS[+saved] ? +saved : (reduce ? 1 : pageDefault)); setPaused(paused);
  if (reduce && flocks.length){ // still frame: a few finished annotations
    targets.filter(onScreen).slice(0,4).forEach((el,i) => { const f = flocks[i % flocks.length]; f.el = el; startWork(f); f.note.p = 1; f.note.phase='hold'; f.note.hold = 1e9; f.state='roam'; f.note = null; });
  }
  requestAnimationFrame(frame);

  const copyBtn = document.getElementById('copy');
  if (copyBtn) copyBtn.onclick = async () => {
    const t = document.getElementById('mail').textContent, b = document.getElementById('copy');
    try { await navigator.clipboard.writeText(t); b.textContent = 'Copied'; }
    catch { const s = getSelection(), rg = document.createRange(); rg.selectNodeContents(document.getElementById('mail')); s.removeAllRanges(); s.addRange(rg); b.textContent = 'Selected'; }
    setTimeout(() => b.textContent = 'Copy', 1600);
  };
})();

/* ---------- Hero knot: a (2,3) torus knot drawn as depth-sorted ribbon with glowing nodes ---------- */
(() => {
  const cv = document.getElementById('knot'); if (!cv) return;
  const cx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let S = 0;
  function size(){ const d = Math.min(2, devicePixelRatio||1); S = cv.clientWidth; cv.width = S*d; cv.height = S*d; cx.setTransform(d,0,0,d,0,0); }
  addEventListener('resize', size); size();
  const N = 260, pts = [];
  for (let i=0; i<N; i++){ const t = i/N*Math.PI*2, r = Math.cos(3*t) + 2.4; pts.push([r*Math.cos(2*t), r*Math.sin(2*t), -Math.sin(3*t)*1.3]); }
  const nodes = [0, 43, 87, 130, 173, 217];
  function draw(time){
    const a = time*.00035, b = Math.sin(time*.0002)*.5 + .6, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const sc = S/8.6, c = S/2;
    const P = pts.map(([x,y,z]) => { let X = x*ca + z*sa, Z = -x*sa + z*ca; let Y = y*cb - Z*sb; Z = y*sb + Z*cb; const k = 6/(6 - Z*.6); return [c + X*sc*k, c + Y*sc*k, Z, k]; });
    const items = [];
    for (let i=0; i<N; i++){ const p = P[i], q = P[(i+1)%N]; items.push({ z:(p[2]+q[2])/2, seg:[p,q] }); }
    for (const i of nodes) items.push({ z:P[i][2] + .05, node:P[i] });
    items.sort((m,n) => m.z - n.z);
    cx.clearRect(0,0,S,S); cx.lineCap = 'round';
    for (const it of items){
      const l = (it.z + 2) / 4;
      if (it.seg){ const [p,q] = it.seg; cx.strokeStyle = `hsl(219 ${80+l*15}% ${30+l*34}%)`; cx.lineWidth = S*.05*p[3]; cx.beginPath(); cx.moveTo(p[0],p[1]); cx.lineTo(q[0],q[1]); cx.stroke(); }
      else { const [x,y,,k] = it.node, r = S*.034*k; const g = cx.createRadialGradient(x,y,0,x,y,r*2.6);
        g.addColorStop(0,'rgba(255,214,90,.55)'); g.addColorStop(1,'rgba(255,160,40,0)'); cx.fillStyle = g; cx.beginPath(); cx.arc(x,y,r*2.6,0,7); cx.fill();
        const h = cx.createRadialGradient(x-r*.3,y-r*.3,r*.1,x,y,r); h.addColorStop(0,'#fff6c8'); h.addColorStop(.5,'#ffd23f'); h.addColorStop(1,'#e8a011');
        cx.fillStyle = h; cx.beginPath(); cx.arc(x,y,r,0,7); cx.fill(); }
    }
    if (!reduce) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
