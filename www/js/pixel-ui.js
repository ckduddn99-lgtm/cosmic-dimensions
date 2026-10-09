/* 코드로 찍는 UI 도트 아트. 같은 그림은 한 번만 그려 캐시한다. */
(function(root){
 'use strict';
 const CD=root.CD=root.CD||{}, cache=new Map();
 const palettes=['#73e6dc','#89b5ff','#bb98ff','#efadf7','#ffcd78','#ff966e','#9be3a1','#eee0a2'];
 function random(seed){let n=seed||1;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
 function render(path){
  const name=path.split('/').pop().split('.')[0], n=+(name.match(/\d+/)||[1])[0], wide=/thumb|scene/.test(path), w=wide?192:48,h=wide?108:48;
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const c=canvas.getContext('2d'),r=random([...name].reduce((a,ch)=>a*31+ch.charCodeAt(0),7)),col=palettes[(n-1)%8];
  const px=(x,y,a,b,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(a),Math.round(b));};
  const line=(x0,y0,x1,y1,color)=>{let dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx+dy;for(;;){px(x0,y0,1,1,color);if(x0===x1&&y0===y1)break;let e=2*err;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;}}};
  const star=(x,y,color)=>{px(x-2,y,5,1,color);px(x,y-2,1,5,color);px(x,y,1,1,'#fff3d2');};
  const diamond=(x,y,size,color)=>{for(let yy=-size;yy<=size;yy++){const half=Math.floor((size-Math.abs(yy))*.65);px(x-half,y+yy,half*2+1,1,color);}line(x,y-size,x-size*.65|0,y,'#f1f8ff');};
  px(0,0,w,h,'#090e24');
  for(let y=0;y<h;y+=4)px(0,y,w,4,y<h/2?'#10162e':'#0c1025');
  for(let k=0;k<(wide?90:16);k++)px(r()*w,r()*h,1,1,k%3?'#3f5475':'#9aafc8');
  const cx=w/2|0,cy=h/2|0;
  if(name==='gem-ip'){
   for(let k=0;k<8;k++){const t=k*Math.PI/4;line(cx,cy,Math.round(cx+Math.cos(t)*17),Math.round(cy+Math.sin(t)*17),'#dfad59');}
   diamond(cx,cy,10,'#ffe4a1');star(cx,cy,'#fff7d6');
  }else if(name==='gem-am'){
   diamond(cx,cy,17,'#9365d7');diamond(cx-1,cy-3,10,'#c7a0fa');line(cx,cy-17,cx+7,cy,'#f3ddff');line(cx+7,cy,cx,cy+17,'#e9c4ff');line(cx-9,cy,cx+9,cy,'#583898');
  }else if(/^cel/.test(name)){
   const points=[[10,34],[18,18],[30,25],[39,10]];
   for(let k=0;k<3;k++)line(...points[k],...points[k+1],'#698cab');
   for(const [x,y] of points)star(x,y,col);
  }else if(/gx|hero|core|infinity/.test(name)){
   const radius=wide?44:17;
   for(let k=0;k<900;k++){
    const arm=k%3,rad=r()*radius,t=rad*.16+arm*2.094+r()*.45;
    const x=cx+Math.cos(t)*rad,y=cy+Math.sin(t)*rad*.43;
    px(x,y,1,1,k%5?col:'#e9e3ff');
   }
   if(/hero|core|infinity/.test(name)){
    for(let y=-10;y<=10;y++){let half=Math.floor(Math.sqrt(Math.max(0,100-y*y)));px(cx-half,cy+y,half*2+1,1,'#030512');}
    for(let k=0;k<200;k++){let t=k/200*Math.PI*2;px(cx+Math.cos(t)*15,cy+Math.sin(t)*7,2,1,k%4?'#f5b970':'#fff3b4');}
    if(wide){line(0,cy+8,w-1,cy-8,'#ad7b54');line(cx-38,cy+3,cx+39,cy-3,'#ffe4ac');}
   }else star(cx,cy,'#fff3d2');
  }else if(/^dim/.test(name)){
   const size=wide?32:14, x=cx,y=cy;
   for(let k=0;k<3;k++){
    const a=size-k*5;
    const points=[[x,y-a],[x+a,y-a/2|0],[x+a,y+a/2|0],[x,y+a],[x-a,y+a/2|0],[x-a,y-a/2|0]];
    for(let j=0;j<6;j++)line(...points[j],...points[(j+1)%6],k?col:'#e5d8ff');
    line(x,y-a,x,y+a,col);line(x-a,y-a/2|0,x+a,y+a/2|0,col);line(x+a,y-a/2|0,x-a,y+a/2|0,col);
   }
   diamond(x,y,wide?8:4,'#f1f8ff');
   if(wide){for(let x=0;x<w;x+=12)line(x,h-1,cx,cy+20,'#26304b');for(let yy=80;yy<h;yy+=8)line(0,yy,w-1,yy,'#26304b');}
  }else if(/gift/.test(name)){
   px(11,19,26,21,'#6e427c');px(9,17,30,7,'#bda0dd');px(22,17,4,23,'#ffdd8e');
   line(24,17,15,9,'#ffdd8e');line(15,9,11,13,'#ffdd8e');line(11,13,24,17,'#ffdd8e');line(24,17,33,9,'#ffdd8e');line(33,9,37,13,'#ffdd8e');line(37,13,24,17,'#ffdd8e');
  }else if(/burst/.test(name)){
   for(let k=0;k<12;k++){let t=k/12*Math.PI*2;line(cx,cy,Math.round(cx+Math.cos(t)*18),Math.round(cy+Math.sin(t)*18),k%2?col:'#ffe4a0');}
   diamond(cx,cy,8,'#fff1ab');
  }else if(/ach|badge/.test(name)){
   px(15,10,18,3,'#fff0a6');px(16,13,16,12,'#dfae52');px(18,25,12,4,'#a66b30');px(22,28,4,8,'#f6ce7b');px(16,36,16,3,'#c4944c');
   line(15,14,10,14,'#ffd47e');line(10,14,10,23,'#ffd47e');line(10,23,17,25,'#ffd47e');line(33,14,38,14,'#ffd47e');line(38,14,38,23,'#ffd47e');line(38,23,31,25,'#ffd47e');
   star(24,19,col);
  }else if(/^rs/.test(name)){
   if(n%4===0){px(10,12,28,25,'#473754');px(12,14,11,21,'#d1c4a0');px(25,14,11,21,'#ead9ae');line(24,14,24,36,'#6e527d');for(let y=18;y<32;y+=4){line(14,y,20,y,'#947d68');line(28,y,33,y,'#947d68');}}
   else if(n%4===1){line(20,9,28,9,'#dfe6ff');px(22,10,4,13,'#7186b8');for(let y=23;y<37;y++){let half=Math.min(10,4+Math.floor((y-23)/2));px(24-half,y,half*2,1,y<29?'#728cae':col);}px(17,37,14,2,'#dae9ff');px(20,30,2,2,'#f5fcff');}
   else if(n%4===2){for(let k=0;k<3;k++)for(let t=0;t<100;t++){const a=t/100*Math.PI*2,theta=k*Math.PI/3,x=Math.cos(a)*17,y=Math.sin(a)*5;px(cx+x*Math.cos(theta)-y*Math.sin(theta),cy+x*Math.sin(theta)+y*Math.cos(theta),1,1,col);}diamond(cx,cy,4,'#fff3bd');}
   else{for(let x=10;x<39;x+=5)px(x,12+(x%3)*3,3,22-(x%3)*3,col);line(8,38,39,38,'#e2d7ff');star(24,8,'#ffeab0');}
  }else{diamond(cx,cy,16,col);star(cx,cy,'#fff3cc');}
  if(!wide){line(2,2,w-3,2,'#596180');line(2,h-3,w-3,h-3,'#363e59');line(2,2,2,h-3,'#596180');line(w-3,2,w-3,h-3,'#363e59');}
  return canvas.toDataURL();
 }
 function url(path){if(!cache.has(path))cache.set(path,render(path));return cache.get(path);}
 function paint(node){
  const icons=node.querySelectorAll?node.querySelectorAll('svg.ico'):[];
  const navArt={home:'core',dims:'dim1',galaxy:'gx3',research:'rs2',infinity:'badge-inf',stars:'cel1',records:'ach1',settings:'rs3'};
  for(const icon of icons){
   const img=document.createElement('img'), button=icon.closest('[data-tab]');
   img.className='ico pixel-art';img.alt='';img.setAttribute('aria-hidden','true');
   img.src=url('img/ui/'+(button?navArt[button.dataset.tab]||'rs3':'rs2')+'.webp');icon.replaceWith(img);
  }
  const imgs=node.matches&&node.matches('img')?[node]:node.querySelectorAll?node.querySelectorAll('img'):[];
  for(const img of imgs){const path=img.getAttribute('data-pixel-art')||img.getAttribute('src')||'';
   if(!/^img\/(ui|thumb)\//.test(path))continue;
   img.removeAttribute('data-pixel-art');img.dataset.pixelSource=path;img.classList.add('pixel-art');img.src=url(path);
  }
  const decor=node.querySelectorAll?node.querySelectorAll('.core-img, .q-btn i'):[];
  for(const el of decor){el.style.backgroundImage='url("'+url('img/thumb/core.webp')+'")';el.style.imageRendering='pixelated';}
 }
 const observer=new MutationObserver(list=>{for(const m of list){if(m.type==='attributes')paint(m.target);else for(const node of m.addedNodes)paint(node);}});
 observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
 paint(document);
 for(const [cls,path] of [['gem-am','gem-am'],['gem-ip','gem-ip'],['gem-sp','dim1'],['gem-cup','ach1']]) {
  const style=document.createElement('style');style.textContent='.'+cls+'{background-image:url("'+url('img/ui/'+path+'.webp')+'");image-rendering:pixelated}';document.head.appendChild(style);
 }
 CD.pixelUI={url,paint,render};
})(globalThis);
