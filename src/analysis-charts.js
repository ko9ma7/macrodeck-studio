const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
export function parseDate(v){const d=new Date(String(v).length===7?`${v}-01T00:00:00Z`:v);return Number.isNaN(d.getTime())?null:d;}
export function fmtDate(v){const d=parseDate(v);return d?`${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth()+1).padStart(2,'0')}`:String(v||'');}
export function fmtNumber(v,d=2){return Number.isFinite(Number(v))?Number(v).toLocaleString('ko-KR',{maximumFractionDigits:d}):'—';}

function extent(arr){let lo=Infinity,hi=-Infinity;for(const v of arr){if(Number.isFinite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v);}}return lo===Infinity?[0,1]:lo===hi?[lo-1,hi+1]:[lo,hi];}
function path(points,xScale,yScale){return points.map((p,i)=>`${i?'L':'M'}${xScale(p.t).toFixed(1)},${yScale(p.v).toFixed(1)}`).join(' ');}
function sample(points,max=900){if(points.length<=max)return points;const step=Math.ceil(points.length/max);return points.filter((_,i)=>i%step===0||i===points.length-1);}

export function multiLineChart(seriesList,{height=360,recessions=[],yDomain=null,yFormatter=v=>fmtNumber(v,1),showLegend=true}={}){
  const width=1000,pad={l:58,r:20,t:18,b:36};
  const all=seriesList.flatMap(s=>s.points||[]).map(p=>({t:parseDate(p.date)?.getTime(),v:num(p.value)})).filter(p=>p.t&&p.v!==null);
  if(!all.length)return '<div class="chart-empty">표시할 시계열이 없습니다.</div>';
  const [minT,maxT]=extent(all.map(p=>p.t)); const [minV0,maxV0]=yDomain||extent(all.map(p=>p.v));
  const margin=(maxV0-minV0)*.06||1; const minV=yDomain?minV0:minV0-margin,maxV=yDomain?maxV0:maxV0+margin;
  const x=t=>pad.l+(t-minT)/(maxT-minT||1)*(width-pad.l-pad.r); const y=v=>pad.t+(maxV-v)/(maxV-minV||1)*(height-pad.t-pad.b);
  let svg=`<svg class="analysis-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">`;
  for(const r of recessions){const a=parseDate(r.peak)?.getTime(),b=parseDate(r.trough)?.getTime();if(!a||!b||b<minT||a>maxT)continue;const x1=x(Math.max(a,minT)),x2=x(Math.min(b,maxT));svg+=`<rect x="${x1}" y="${pad.t}" width="${Math.max(1,x2-x1)}" height="${height-pad.t-pad.b}" class="recession-band"/>`;}
  for(let i=0;i<5;i++){const v=minV+(maxV-minV)*i/4, yy=y(v);svg+=`<line x1="${pad.l}" x2="${width-pad.r}" y1="${yy}" y2="${yy}" class="grid-line"/><text x="${pad.l-8}" y="${yy+4}" text-anchor="end" class="axis-label">${esc(yFormatter(v))}</text>`;}
  for(let i=0;i<6;i++){const t=minT+(maxT-minT)*i/5,xx=x(t);svg+=`<text x="${xx}" y="${height-10}" text-anchor="middle" class="axis-label">${fmtDate(new Date(t).toISOString())}</text>`;}
  for(const s of seriesList){const pts=sample((s.points||[]).map(p=>({t:parseDate(p.date)?.getTime(),v:num(p.value)})).filter(p=>p.t&&p.v!==null));if(pts.length<2)continue;svg+=`<path d="${path(pts,x,y)}" class="analysis-line" style="stroke:${esc(s.color||'var(--primary)')};stroke-width:${s.width||2}"/>`;}
  svg+='</svg>';
  if(!showLegend)return svg;
  return `<div class="analysis-chart-wrap">${svg}<div class="chart-legend">${seriesList.filter(s=>s.points?.length).map(s=>`<span><i style="background:${esc(s.color||'var(--primary)')}"></i>${esc(s.name)}</span>`).join('')}</div></div>`;
}

export function barChart(rows,{height=280,valueKey='value',labelKey='date',positive='#16a34a',negative='#dc2626',formatter=v=>fmtNumber(v,0)}={}){
  const width=1000,pad={l:55,r:18,t:18,b:42}; if(!rows?.length)return '<div class="chart-empty">표시할 자료가 없습니다.</div>';
  const vals=rows.map(r=>num(r[valueKey])||0), [lo0,hi0]=extent([...vals,0]);const lo=Math.min(0,lo0),hi=Math.max(0,hi0);const y=v=>pad.t+(hi-v)/(hi-lo||1)*(height-pad.t-pad.b);const zero=y(0);const slot=(width-pad.l-pad.r)/rows.length;
  let svg=`<svg class="analysis-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`;
  for(let i=0;i<5;i++){const v=lo+(hi-lo)*i/4,yy=y(v);svg+=`<line x1="${pad.l}" x2="${width-pad.r}" y1="${yy}" y2="${yy}" class="grid-line"/><text x="${pad.l-8}" y="${yy+4}" text-anchor="end" class="axis-label">${esc(formatter(v))}</text>`;}
  rows.forEach((r,i)=>{const v=num(r[valueKey])||0;const yy=y(v);const h=Math.abs(zero-yy);svg+=`<rect x="${pad.l+i*slot+1}" y="${Math.min(yy,zero)}" width="${Math.max(1,slot-2)}" height="${Math.max(1,h)}" rx="1" fill="${v>=0?positive:negative}" opacity=".82"/>`;});
  for(let i=0;i<5;i++){const idx=Math.round((rows.length-1)*i/4);svg+=`<text x="${pad.l+(idx+.5)*slot}" y="${height-12}" text-anchor="middle" class="axis-label">${esc(fmtDate(rows[idx]?.[labelKey]))}</text>`;}
  return svg+'</svg>';
}

export function stackedAreaChart(rows,sectors,{height=350}={}){
  const width=1000,pad={l:48,r:16,t:14,b:34};if(!rows?.length)return '<div class="chart-empty">표시할 시계열이 없습니다.</div>';
  const colors=['#3478f6','#2fa2b9','#ef4565','#df3f8f','#2fb36c','#8b5cf6','#84b62c','#f59e0b','#7d8795','#ca5d27','#27a8a2'];
  const x=i=>pad.l+i/(rows.length-1||1)*(width-pad.l-pad.r);const y=v=>pad.t+(1-v)*(height-pad.t-pad.b);
  let cum=Array(rows.length).fill(0),svg=`<svg class="analysis-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`;
  for(let i=0;i<=4;i++){const v=i/4,yy=y(v);svg+=`<line x1="${pad.l}" x2="${width-pad.r}" y1="${yy}" y2="${yy}" class="grid-line"/><text x="${pad.l-7}" y="${yy+4}" text-anchor="end" class="axis-label">${Math.round(v*100)}%</text>`;}
  sectors.forEach((s,si)=>{const top=rows.map((r,i)=>cum[i]+(Number(r[s.sector])||0));const upper=top.map((v,i)=>`${x(i)},${y(v)}`).join(' ');const lower=[...cum].map((v,i)=>`${x(i)},${y(v)}`).reverse().join(' ');svg+=`<polygon points="${upper} ${lower}" fill="${colors[si%colors.length]}" opacity=".88"/>`;cum=top;});
  for(let i=0;i<5;i++){const idx=Math.round((rows.length-1)*i/4);svg+=`<text x="${x(idx)}" y="${height-9}" text-anchor="middle" class="axis-label">${fmtDate(rows[idx]?.date)}</text>`;}
  return `<div class="analysis-chart-wrap">${svg}</svg><div class="chart-legend">${sectors.map((s,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${esc(s.name||s.sector)}</span>`).join('')}</div></div>`;
}

export function rrgChart(sectors,{height=440}={}){
  const width=1000,pad={l:52,r:30,t:24,b:38};const pts=sectors.flatMap(s=>s.tail||[]);if(!pts.length)return '<div class="chart-empty">RRG 자료가 없습니다.</div>';
  const xs=pts.map(p=>p.rsRatio),ys=pts.map(p=>p.rsMomentum);let [xl,xh]=extent(xs),[yl,yh]=extent(ys);const span=Math.max(xh-xl,yh-yl,3);xl=Math.min(xl,100-span*.55);xh=Math.max(xh,100+span*.55);yl=Math.min(yl,100-span*.55);yh=Math.max(yh,100+span*.55);
  const x=v=>pad.l+(v-xl)/(xh-xl)*(width-pad.l-pad.r), y=v=>pad.t+(yh-v)/(yh-yl)*(height-pad.t-pad.b);
  let svg=`<svg class="analysis-svg rrg-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`;
  svg+=`<rect x="${x(100)}" y="${pad.t}" width="${width-pad.r-x(100)}" height="${y(100)-pad.t}" class="rrg-q leading"/><rect x="${pad.l}" y="${pad.t}" width="${x(100)-pad.l}" height="${y(100)-pad.t}" class="rrg-q improving"/><rect x="${pad.l}" y="${y(100)}" width="${x(100)-pad.l}" height="${height-pad.b-y(100)}" class="rrg-q lagging"/><rect x="${x(100)}" y="${y(100)}" width="${width-pad.r-x(100)}" height="${height-pad.b-y(100)}" class="rrg-q weakening"/>`;
  svg+=`<line x1="${x(100)}" x2="${x(100)}" y1="${pad.t}" y2="${height-pad.b}" class="rrg-axis"/><line x1="${pad.l}" x2="${width-pad.r}" y1="${y(100)}" y2="${y(100)}" class="rrg-axis"/>`;
  const colors=['#3478f6','#2fa2b9','#ef4565','#df3f8f','#2fb36c','#8b5cf6','#84b62c','#f59e0b','#7d8795','#ca5d27','#27a8a2'];
  sectors.forEach((s,si)=>{const tail=s.tail||[];if(!tail.length)return;const d=tail.map((p,i)=>`${i?'L':'M'}${x(p.rsRatio).toFixed(1)},${y(p.rsMomentum).toFixed(1)}`).join(' ');const c=colors[si%colors.length];svg+=`<path d="${d}" fill="none" stroke="${c}" stroke-width="2" opacity=".65"/>`;tail.forEach((p,i)=>svg+=`<circle cx="${x(p.rsRatio)}" cy="${y(p.rsMomentum)}" r="${i===tail.length-1?5:2.5}" fill="${c}" opacity="${i===tail.length-1?1:.55}"/>`);const p=tail.at(-1);svg+=`<text x="${x(p.rsRatio)+7}" y="${y(p.rsMomentum)+4}" class="rrg-label" fill="${c}">${esc(s.name||s.symbol)}</text>`;});
  svg+=`<text x="${width-115}" y="${pad.t+20}" class="quadrant-label">주도</text><text x="${pad.l+10}" y="${pad.t+20}" class="quadrant-label">개선</text><text x="${pad.l+10}" y="${height-pad.b-12}" class="quadrant-label">후행</text><text x="${width-115}" y="${height-pad.b-12}" class="quadrant-label">약화</text></svg>`;
  return svg;
}
