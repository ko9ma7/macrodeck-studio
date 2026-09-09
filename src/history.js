import { readJson } from './data.js';
import { initShell } from './shell.js';
import { multiLineChart, barChart, fmtNumber, parseDate } from './analysis-charts.js';

initShell('history');
const COLORS=['#3478f6','#16a34a','#ef4565','#8b5cf6','#f59e0b','#0891b2','#db2777','#64748b','#22c55e','#f97316','#0ea5e9','#a855f7'];
const METRICS=[
 ['spx','S&P 500'],['ndx','나스닥 100'],['curve-10y2y','2s10s'],['vix','VIX'],['treasury-10y','명목 10Y'],['dxy','달러 지수'],['hy-oas','HY OAS'],['real-10y','실질 10Y'],['bei','기대인플레'],['fed-target','연방기금'],['kospi','KOSPI'],['sox','SOX']
].map(([id,name],i)=>({id,name,color:COLORS[i]}));
const state={view:'overlay',mode:'range',years:10,start:0,end:100,selected:new Set(['spx','ndx','curve-10y2y']),history:{},recessions:[],drawdownSymbol:'spx',foreignDays:60};
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function filterYears(series,years){if(years==='max'||!series.length)return series;const last=parseDate(series.at(-1)?.date);if(!last)return series;const cut=new Date(last);cut.setUTCFullYear(cut.getUTCFullYear()-Number(years));return series.filter(r=>parseDate(r.date)>=cut);}
function normalized(series,mode){const vals=series.map(r=>Number(r.value)).filter(Number.isFinite);if(!vals.length)return[];if(mode==='pct'){const base=vals[0];return series.map(r=>({...r,value:base?((Number(r.value)/base)-1)*100:0}));}const lo=Math.min(...vals),hi=Math.max(...vals),span=hi-lo||1;return series.map(r=>({...r,value:(Number(r.value)-lo)/span*100}));}
function currentPosition(series){const vals=series.map(r=>Number(r.value)).filter(Number.isFinite);if(!vals.length)return null;const lo=Math.min(...vals),hi=Math.max(...vals);return hi===lo?50:(vals.at(-1)-lo)/(hi-lo)*100;}

async function loadAll(){
  const ids=METRICS.map(x=>x.id);
  const pairs=await Promise.all(ids.map(async id=>[id,(await readJson(`data/history/${id}.json`,{optional:true}))?.series||[]]));
  state.history=Object.fromEntries(pairs);
  state.recessions=(await readJson('data/reference/nber-recessions.json',{optional:true}))?.items||[];
  const lib=await readJson('data/reference/indicator-library.json',{optional:true});
  $('#historyStatus').textContent=`기초 데이터 ${lib?.count||ids.length}개 · 자동/파생/캐시 구분`;
  renderMetricToggles(); renderOverlay();
}
function renderMetricToggles(){
  $('#overlayMetrics').innerHTML=METRICS.map(m=>`<button class="metric-toggle ${state.selected.has(m.id)?'active':''}" data-id="${m.id}" style="--metric-color:${m.color}"><i></i>${m.name}</button>`).join('');
  $('#overlayMetrics').querySelectorAll('button').forEach(b=>b.onclick=()=>{const id=b.dataset.id;state.selected.has(id)?state.selected.delete(id):state.selected.add(id);if(!state.selected.size)state.selected.add('spx');renderMetricToggles();renderOverlay();});
}
function renderOverlay(){
  const anchor=filterYears(state.history.spx||[],state.years);
  let minBrush=-Infinity,maxBrush=Infinity;
  if(anchor.length){const a=Math.min(state.start,state.end),b=Math.max(state.start,state.end);const p1=anchor[Math.floor((anchor.length-1)*a/100)],p2=anchor[Math.ceil((anchor.length-1)*b/100)];minBrush=parseDate(p1?.date)?.getTime()??-Infinity;maxBrush=parseDate(p2?.date)?.getTime()??Infinity;$('#brushLabel').textContent=`${p1?.date||''} → ${p2?.date||''}`;}
  const shown=METRICS.filter(m=>state.selected.has(m.id)).map(m=>{let s=filterYears(state.history[m.id]||[],state.years);s=s.filter(r=>{const t=parseDate(r.date)?.getTime();return t!=null&&t>=minBrush&&t<=maxBrush;});return {...m,raw:s,points:normalized(s,state.mode)};}).filter(x=>x.points.length);
  const allDates=shown.flatMap(s=>s.raw.map(r=>parseDate(r.date)?.getTime()).filter(Boolean));
  const minT=Math.min(...allDates),maxT=Math.max(...allDates);const rec=state.recessions.filter(r=>{const a=parseDate(r.peak)?.getTime(),b=parseDate(r.trough)?.getTime();return a&&b&&b>=minT&&a<=maxT;});
  $('#overlayDescription').textContent=state.mode==='range'?'범위 위치 0~100 — 선택 구간의 최저·최고 사이 현재 위치 · 회색=NBER 침체':'시작점 대비 % 변화 — 단위가 다른 지표도 같은 기준점에서 방향과 누적 변화를 비교';
  $('#overlayChart').innerHTML=multiLineChart(shown,{height:390,recessions:rec,yDomain:state.mode==='range'?[0,100]:null,yFormatter:v=>state.mode==='range'?`${Math.round(v)}`:`${v>=0?'+':''}${v.toFixed(0)}%`});
  $('#rangeRank').innerHTML=shown.map(s=>({name:s.name,color:s.color,pos:currentPosition(s.raw),last:s.raw.at(-1)?.value})).sort((a,b)=>(b.pos??0)-(a.pos??0)).map(x=>`<div class="rank-row"><span><i style="background:${x.color}"></i>${x.name}</span><b>${x.pos==null?'—':x.pos.toFixed(0)}</b><small>${fmtNumber(x.last,2)}</small></div>`).join('');
}

$('#historyViewTabs').addEventListener('click',e=>{const b=e.target.closest('button[data-view]');if(!b)return;state.view=b.dataset.view;document.querySelectorAll('#historyViewTabs button').forEach(x=>x.classList.toggle('active',x===b));['overlay','foreign','drawdown'].forEach(v=>document.querySelector(`#${v}View`).hidden=v!==state.view);$('#overlayModeTabs').style.display=state.view==='overlay'?'flex':'none';if(state.view==='foreign')renderForeign();if(state.view==='drawdown')renderDrawdown();});
$('#overlayModeTabs').addEventListener('click',e=>{const b=e.target.closest('button[data-mode]');if(!b)return;state.mode=b.dataset.mode;document.querySelectorAll('#overlayModeTabs button').forEach(x=>x.classList.toggle('active',x===b));renderOverlay();});
$('#overlayRange').addEventListener('click',e=>{const b=e.target.closest('button[data-years]');if(!b)return;state.years=b.dataset.years;state.start=0;state.end=100;$('#rangeStart').value=0;$('#rangeEnd').value=100;document.querySelectorAll('#overlayRange button').forEach(x=>x.classList.toggle('active',x===b));renderOverlay();});
for(const id of ['rangeStart','rangeEnd'])$('#'+id).addEventListener('input',()=>{state.start=Number($('#rangeStart').value);state.end=Number($('#rangeEnd').value);if(Math.abs(state.end-state.start)<4){if(id==='rangeStart')state.start=Math.max(0,state.end-4);else state.end=Math.min(100,state.start+4);}renderOverlay();});

async function renderForeign(){
  const [flow,share,semi]=await Promise.all([readJson('data/macro/investor-flow__from=2026-01-01.json',{optional:true}),readJson('data/macro/foreign-share__from=2003-01-01.json',{optional:true}),readJson('data/macro/semi-export__from=2020-01.json',{optional:true})]);
  const foreign=(flow?.rows||[]).filter(r=>r.investor==='foreign').slice(-state.foreignDays).map(r=>({date:r.date,value:Number(r.net_eok)}));
  $('#foreignBar').innerHTML=barChart(foreign,{height:290,formatter:v=>`${Math.round(v).toLocaleString()}억`});
  const fs=flow?.summary?.foreign||{};const retrace=flow?.summary?.retrace||{};const sum20=Number(fs.sum20d_eok??foreign.slice(-20).reduce((a,r)=>a+r.value,0)),sum5=Number(fs.sum5d_eok??foreign.slice(-5).reduce((a,r)=>a+r.value,0));$('#foreignSummary').innerHTML=`<div><span>최근 5일</span><b class="${sum5>=0?'up':'down'}">${sum5>=0?'+':''}${Math.round(sum5).toLocaleString()}억</b></div><div><span>최근 20일</span><b class="${sum20>=0?'up':'down'}">${sum20>=0?'+':''}${Math.round(sum20).toLocaleString()}억</b></div><div><span>YTD</span><b class="${Number(fs.ytd_eok)>=0?'up':'down'}">${Number(fs.ytd_eok)>=0?'+':''}${Math.round(Number(fs.ytd_eok||0)).toLocaleString()}억</b></div><div><span>연속</span><b>${fs.streak_days||0}일 ${fs.streak_dir||''}</b></div><div><span>극단 대비 회복</span><b>${Number(retrace.recovered_pct||0).toFixed(1)}%</b></div><div><span>기준일</span><b>${flow?.summary?.asof||foreign.at(-1)?.date||'—'}</b></div>`;
  const sh=(share?.share||[]).map(r=>({date:r.quarter.replace('Q1','01').replace('Q2','04').replace('Q3','07').replace('Q4','10'),value:Number(r.share_pct)}));$('#foreignShareChart').innerHTML=multiLineChart([{name:'외국인 보유비중',color:'#16a34a',points:sh}],{height:290,yFormatter:v=>`${v.toFixed(0)}%`,showLegend:false});
  const latest=sh.at(-1),first=sh[0];$('#foreignShareStats').innerHTML=`<div><span>최근</span><b>${latest?latest.value.toFixed(1):'—'}%</b></div><div><span>시작</span><b>${first?first.value.toFixed(1):'—'}%</b></div><div><span>관측</span><b>${sh.length}분기</b></div>`;
  let cum=0;const long=(share?.netbuy||[]).map(r=>{cum+=Number(r.net_eok||0);return {date:r.date,value:cum/10000};});$('#foreignLongChart').innerHTML=multiLineChart([{name:'외국인 누적 순매수',color:'#0ea5e9',points:long}],{height:290,yFormatter:v=>`${v>=0?'+':''}${v.toFixed(0)}조`,showLegend:false});const lv=long.at(-1)?.value??0;const lmin=Math.min(...long.map(x=>x.value)),lmax=Math.max(...long.map(x=>x.value));$('#foreignLongStats').innerHTML=`<div><span>누적</span><b class="${lv>=0?'up':'down'}">${lv>=0?'+':''}${lv.toFixed(1)}조</b></div><div><span>저점</span><b>${lmin.toFixed(1)}조</b></div><div><span>고점</span><b>${lmax.toFixed(1)}조</b></div>`;
  const sr=(semi?.series||[]).map(r=>({date:r.month,value:Number(r.export_usd)/1e9}));$('#semiChart').innerHTML=multiLineChart([{name:'반도체 수출',color:'#8b5cf6',points:sr}],{height:290,yFormatter:v=>`$${v.toFixed(1)}B`,showLegend:false});const last=sr.at(-1),prev=sr.length>12?sr.at(-13):null;const yoy=last&&prev?(last.value/prev.value-1)*100:null;$('#semiStats').innerHTML=`<div><span>최근 월</span><b>${last?`$${last.value.toFixed(2)}B`:'—'}</b></div><div><span>YoY</span><b class="${yoy>=0?'up':'down'}">${yoy==null?'—':`${yoy>=0?'+':''}${yoy.toFixed(1)}%`}</b></div><div><span>자료</span><b>${sr.length}개월</b></div>`;
}
$('#foreignDays').addEventListener('click',e=>{const b=e.target.closest('button[data-days]');if(!b)return;state.foreignDays=Number(b.dataset.days);document.querySelectorAll('#foreignDays button').forEach(x=>x.classList.toggle('active',x===b));renderForeign();});

async function renderDrawdown(){
  const map={spx:'data/macro/drawdown__from=1985-01-01&symbol=_5eGSPC.json',ixic:'data/macro/drawdown__from=1985-01-01&symbol=_5eIXIC.json'};const d=await readJson(map[state.drawdownSymbol],{optional:true});const points=(d?.series||[]).map(r=>({date:r.date,value:Number(r.drawdown)*100}));$('#drawdownChart').innerHTML=multiLineChart([{name:d?.name||'',color:'#ef4565',points}],{height:300,yDomain:[Math.min(-10,...points.map(p=>p.value)),0],yFormatter:v=>`${v.toFixed(0)}%`,showLegend:false});
  const eps=[...(d?.episodes||[])].sort((a,b)=>a.depth-b.depth);$('#drawdownTable').innerHTML=eps.map((x,i)=>`<tr class="${x.ongoing?'ongoing':''}"><td><b>${x.ongoing?'현재 사이클':`#${i+1}`}</b></td><td>${esc(x.peak_date)}</td><td>${esc(x.trough_date)}</td><td class="num down"><b>${(x.depth*100).toFixed(1)}%</b></td><td class="num">${Math.round((x.decline_days||0)/30.4)}개월</td><td class="num">${x.ongoing?'<span class="warn-text">미회복</span>':`${Math.round((x.recovery_days||0)/30.4)}개월`}</td></tr>`).join('');
}
$('#drawdownSymbol').addEventListener('click',e=>{const b=e.target.closest('button[data-symbol]');if(!b)return;state.drawdownSymbol=b.dataset.symbol;document.querySelectorAll('#drawdownSymbol button').forEach(x=>x.classList.toggle('active',x===b));renderDrawdown();});
loadAll().catch(err=>{$('#historyStatus').textContent='로드 실패';console.error(err);});
