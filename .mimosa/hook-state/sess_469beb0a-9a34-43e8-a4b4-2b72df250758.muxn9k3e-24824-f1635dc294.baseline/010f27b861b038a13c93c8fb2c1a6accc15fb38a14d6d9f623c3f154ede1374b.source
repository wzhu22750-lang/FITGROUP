// Capture computed layout as portable SVG primitives; preserve source Lucide/Recharts SVG.
() => {
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 let serial=0; const overlays=[]; let capturingOverlay=false;
 const rect=(r,fill,extra='')=>`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${esc(fill)}" ${extra}/>`;
 function visit(el){
 const s=getComputedStyle(el),r=el.getBoundingClientRect();
 if(s.display==='none'||s.visibility==='hidden'||+s.opacity===0||r.bottom<0||r.top>844||r.right<0||r.left>390||['SCRIPT','STYLE','CANVAS'].includes(el.tagName))return '';
 if(s.position==='fixed'&&parseInt(s.zIndex)>=50&&!capturingOverlay){overlays.push(el);return '';}
 let out='';const radius=parseFloat(s.borderTopLeftRadius)||0;
 if(s.boxShadow!=='none'){const m=s.boxShadow.match(/(rgba?\([^)]+\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+(-?[\d.]+)px/);if(m&&+m[4]===0)out+=rect({...r.toJSON(),x:r.x+(+m[2])-(+m[5]),y:r.y+(+m[3])-(+m[5]),width:r.width+2*m[5],height:r.height+2*m[5]},m[1],`rx="${radius}"`);}
 if(s.backgroundColor!=='rgba(0, 0, 0, 0)')out+=rect(r,s.backgroundColor,`rx="${radius}"`);
 for(const side of ['Top','Right','Bottom','Left']){const w=parseFloat(s[`border${side}Width`]);if(w&&s[`border${side}Style`]!=='none'){const a={x:r.x,y:r.y,width:r.width,height:r.height};if(side==='Top')a.height=w;if(side==='Bottom'){a.y=r.bottom-w;a.height=w;}if(side==='Left')a.width=w;if(side==='Right'){a.x=r.right-w;a.width=w;}out+=rect(a,s[`border${side}Color`]);}}
 if(el instanceof SVGSVGElement){const c=el.cloneNode(true);const orig=[el,...el.querySelectorAll('*')],copy=[c,...c.querySelectorAll('*')];orig.forEach((n,i)=>{const cs=getComputedStyle(n);for(const k of ['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','opacity','font-family','font-size','font-weight','text-anchor'])copy[i].setAttribute(k,cs.getPropertyValue(k));copy[i].removeAttribute('class');copy[i].removeAttribute('style');});c.setAttribute('x',r.x);c.setAttribute('y',r.y);c.setAttribute('width',r.width);c.setAttribute('height',r.height);return out+c.outerHTML;}
 const text=(str,x,y,width)=>`<text x="${x}" y="${y}" font-family="Arial, 'PingFang SC', sans-serif" font-size="${s.fontSize}" font-weight="${s.fontWeight}" font-style="${s.fontStyle}" fill="${esc(s.color)}" ${width?`textLength="${width}" lengthAdjust="spacingAndGlyphs"`:''}>${esc(str)}</text>`;
 if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement){out+=text(el.value||el.placeholder,r.x+parseFloat(s.paddingLeft)+parseFloat(s.borderLeftWidth),r.y+parseFloat(s.paddingTop)+parseFloat(s.fontSize)*.95);}
 else {
 const children=[...el.childNodes];children.sort((a,b)=>{const z=n=>n.nodeType===1?(parseInt(getComputedStyle(n).zIndex)||0):0;return z(a)-z(b);});
 for(const n of children){if(n.nodeType===1)out+=visit(n);else if(n.nodeType===3&&n.textContent.trim()){for(let i=0;i<n.length;i++){const range=document.createRange();range.setStart(n,i);range.setEnd(n,i+1);const b=range.getBoundingClientRect();if(!b.width||b.bottom<0||b.y>844)continue;let ch=n.textContent[i];if(s.textTransform==='uppercase')ch=ch.toUpperCase();out+=text(ch,b.x,b.y+b.height*.79,b.width);}}}
 }
 if(['hidden','auto','scroll'].includes(s.overflowY)&&r.height){const id=`clip-dom-${serial++}`;out=`<defs><clipPath id="${id}">${rect(r,'white',`rx="${radius}"`)}</clipPath></defs><g clip-path="url(#${id})">${out}</g>`;}
 return `<g opacity="${s.opacity}">${out}</g>`;
 }
 const base=visit(document.body);capturingOverlay=true;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844"><rect width="390" height="844" fill="#f4f4f4"/>${base}${overlays.map(visit).join('')}</svg>`;
}
