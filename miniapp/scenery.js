'use strict';
// Perspective-projected 3D geometry, drawn locally. No assets, network or user data.
(() => {
  const intro=document.getElementById('appIntro'), toggle=document.getElementById('ambientToggle');
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const canvases=['ambientCanvas','heroDna','introDna'].map(id=>document.getElementById(id));
  const surfaces=canvases.map(canvas=>{
    try{return {canvas,ctx:canvas?.getContext('2d'),w:0,h:0};}catch{return {canvas,ctx:null};}
  });
  if(surfaces.some(s=>!s.ctx)){toggle.hidden=true;return;}
  let enabled=true;
  try{enabled=localStorage.getItem('bio:ambient-motion')!=='off';}catch{}
  let frame=0,last=0,elapsed=0,heroVisible=true,introTimer=0;
  const focused=()=>['exam','review','analysis'].includes(document.body.dataset.page);
  const allowed=()=>enabled&&!reduce?.matches&&!document.hidden&&!focused();
  const closeIntro=()=>{intro.hidden=true;clearTimeout(introTimer);document.body.classList.remove('intro-playing');};
  const colors={lime:['#f3ffd5','#b6eb80','#315c37'],cyan:['#e0fff9','#6bdec1','#18594d']};

  function sphere(ctx,p,r,color,alpha=1){
    const c=colors[color],g=ctx.createRadialGradient(p.x-r*.32,p.y-r*.38,r*.08,p.x,p.y,r);
    g.addColorStop(0,c[0]);g.addColorStop(.38,c[1]);g.addColorStop(1,c[2]);
    ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=alpha*.65;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p.x-r*.3,p.y-r*.34,r*.15,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;
  }
  function helix(ctx,cx,cy,height,radius,time,roll=0,alpha=1){
    const count=18,points=[[],[]],primitives=[],focal=height*2.8;
    const project=(x,y,z)=>{
      const yy=y*Math.cos(.16)-z*Math.sin(.16),zz=y*Math.sin(.16)+z*Math.cos(.16);
      const depth=focal/(focal+zz);
      return {x:cx+(x*Math.cos(roll)-yy*Math.sin(roll))*depth,y:cy+(x*Math.sin(roll)+yy*Math.cos(roll))*depth,z:zz,depth};
    };
    for(let i=0;i<count;i++){
      for(let side=0;side<2;side++){
        const a=i*.55+time+side*Math.PI,p=project(Math.cos(a)*radius,(i/(count-1)-.5)*height,Math.sin(a)*radius);
        points[side].push(p);primitives.push({kind:'sphere',p,z:p.z,color:side?'cyan':'lime'});
        if(i){const prev=points[side][i-1];primitives.push({kind:'strand',a:prev,b:p,z:(prev.z+p.z)/2,color:side?'#73d6be':'#c0ec9a'});}
      }
      primitives.push({kind:'rung',a:points[0][i],b:points[1][i],z:(points[0][i].z+points[1][i].z)/2});
    }
    // Back-to-front sorting makes the two strands pass in front of each other.
    primitives.sort((a,b)=>b.z-a.z);
    for(const item of primitives){
      if(item.kind==='sphere'){
        sphere(ctx,item.p,Math.max(2.2,height*.03)*item.p.depth,item.color,alpha*(.58+.42*item.p.depth));
      }else{
        const depth=(item.a.depth+item.b.depth)/2;
        ctx.globalAlpha=alpha*(item.kind==='strand'?.76:.5);ctx.lineCap='round';
        ctx.lineWidth=(item.kind==='strand'?height*.012:height*.009)*depth;
        if(item.kind==='rung'){
          const g=ctx.createLinearGradient(item.a.x,item.a.y,item.b.x,item.b.y);g.addColorStop(0,'#b6eb80');g.addColorStop(1,'#65d9c1');ctx.strokeStyle=g;
        }else ctx.strokeStyle=item.color;
        ctx.beginPath();ctx.moveTo(item.a.x,item.a.y);ctx.lineTo(item.b.x,item.b.y);ctx.stroke();
      }
    }
    ctx.globalAlpha=1;
  }
  function halo(ctx,x,y,r,color){
    const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  function orbit(ctx,x,y,rx,ry,angle,alpha){
    ctx.strokeStyle=`rgba(164,224,159,${alpha})`;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y,rx,ry,angle,0,Math.PI*2);ctx.stroke();
  }
  function background(surface,t){
    const {ctx,w,h}=surface;ctx.clearRect(0,0,w,h);
    halo(ctx,w*.9,h*.28,Math.min(w,600),'#4cbb5020');halo(ctx,w*.07,h*.85,Math.min(w,450),'#25bca51c');
    helix(ctx,w*.94,h*.36,Math.min(h*.6,470),Math.min(w*.15,68),t*.22,-.32,.32);
    orbit(ctx,w*.08,h*.78,110,54,t*.08,.2);
    orbit(ctx,w*.08,h*.78,110,54,-t*.08+1,.14);
    for(let i=0;i<26;i++){
      const x=((i*.618033%1)*w+Math.sin(t*.16+i)*18+w)%w,y=((i*.414214%1)*h-t*(3+i%3)+h*100)%h;
      const r=1.2+(i%3)*.7;ctx.globalAlpha=.2+Math.sin(t*.55+i)*.12;ctx.fillStyle=i%2?'#b6eb80':'#6bdec1';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
    // A small floating molecule balances the helix on the opposite side.
    const mx=w*.1+Math.sin(t*.16)*12,my=h*.77+Math.cos(t*.13)*15,atoms=[];
    for(let i=0;i<4;i++){const a=i*Math.PI/2+t*.28;atoms.push({x:mx+Math.cos(a)*36,y:my+Math.sin(a)*26,z:Math.sin(a)});}
    ctx.strokeStyle='#a8dbc540';ctx.lineWidth=2;
    for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(atoms[i].x,atoms[i].y);ctx.lineTo(atoms[(i+1)%4].x,atoms[(i+1)%4].y);ctx.stroke();}
    atoms.sort((a,b)=>a.z-b.z).forEach((p,i)=>sphere(ctx,p,5+p.z*1.5,i%2?'cyan':'lime',.5));
  }
  function showcase(surface,t,isIntro=false){
    const {ctx,w,h}=surface;ctx.clearRect(0,0,w,h);
    halo(ctx,w*.5,h*.52,Math.min(w,h)*.6,isIntro?'#83db4538':'#73c94a25');
    const size=Math.min(h*.79,w*1.12),radius=size*.21;
    orbit(ctx,w*.5,h*.52,w*.39,h*.24,-.32+Math.sin(t*.22)*.18,.24);
    orbit(ctx,w*.5,h*.52,w*.4,h*.22,1.05+Math.sin(t*.16)*.15,.12);
    helix(ctx,w*.5,h*.5,size,radius,t*(isIntro?1.45:.58),-.2+Math.sin(t*.25)*.08);
  }
  function draw(){
    background(surfaces[0],elapsed);
    if(heroVisible)showcase(surfaces[1],elapsed);
    if(!intro.hidden)showcase(surfaces[2],elapsed,true);
  }
  function tick(now){
    frame=0;if(!allowed()){last=0;return;}
    if(!last||now-last>=1000/30){elapsed+=last?Math.min((now-last)/1000,.08):0;last=now;draw();}
    frame=requestAnimationFrame(tick);
  }
  function resize(){
    const ratio=Math.min(window.devicePixelRatio||1,window.innerWidth<700?1.25:1.5);
    for(const surface of surfaces){const rect=surface.canvas.getBoundingClientRect();surface.w=Math.max(1,rect.width);surface.h=Math.max(1,rect.height);
      surface.canvas.width=Math.round(surface.w*ratio);surface.canvas.height=Math.round(surface.h*ratio);surface.ctx.setTransform(ratio,0,0,ratio,0,0);}
    draw();
  }
  function sync(){
    const moving=enabled&&!reduce?.matches;
    document.body.dataset.sceneMotion=moving?'on':'off';
    toggle.setAttribute('aria-pressed',String(moving&&!focused()));toggle.disabled=Boolean(reduce?.matches)||focused();
    toggle.title=focused()?'Test paytida fon tinch holatda':reduce?.matches?'Telefonda animatsiyalar kamaytirilgan':moving?'Fon animatsiyasini to‘xtatish':'Fon animatsiyasini yoqish';
    if(!allowed()){cancelAnimationFrame(frame);frame=0;last=0;closeIntro();draw();}
    else if(!frame)frame=requestAnimationFrame(tick);
  }
  toggle.addEventListener('click',()=>{enabled=!enabled;try{localStorage.setItem('bio:ambient-motion',enabled?'on':'off');}catch{}sync();});
  reduce?.addEventListener?.('change',sync);
  document.addEventListener('visibilitychange',sync);
  document.addEventListener('pointerdown',closeIntro,{once:true,capture:true});
  document.addEventListener('keydown',closeIntro,{once:true,capture:true});
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-page']});
  if(window.IntersectionObserver)new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;if(heroVisible&&!allowed())showcase(surfaces[1],elapsed);}).observe(canvases[1]);
  if(window.ResizeObserver){const observer=new ResizeObserver(resize);canvases.forEach(c=>observer.observe(c));}
  else window.addEventListener('resize',resize);
  if(allowed()){
    intro.hidden=false;document.body.classList.add('intro-playing');introTimer=setTimeout(closeIntro,2100);
  }
  resize();sync();
})();
