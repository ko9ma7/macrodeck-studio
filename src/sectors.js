import { readJson } from './data.js';
import { initShell } from './shell.js';
import { stackedAreaChart, rrgChart } from './analysis-charts.js';
initShell('sectors');
const $=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SECTOR_MAP={
 'Information Technology':'기술','Financials':'금융','Communication Services':'커뮤니케이션','Consumer Discretionary':'자유소비재','Health Care':'헬스케어','Industrials':'산업재','Consumer Staples':'필수소비재','Energy':'에너지','Utilities':'유틸리티','Materials':'소재','Real Estate':'부동산'
};
const COLORS=['#3478f6','#2fa2b9','#ef4565','#df3f8f','#2fb36c','#8b5cf6','#84b62c','#f59e0b','#7d8795','#ca5d27','#27a8a2'];
const state={composition:null,history:null,perf:null,rrg:null,rrgTail:10,rrgLevel:'sector',perfPeriod:'m3',leaders:null,sectorKeys:[]};
function pct(v){return `${v>=0?'+':''}${(Number(v)*100).toFixed(1)}%`;}
async function load(){
 const [c,h,p,l]=await Promise.all([readJson('data/sectors/composition.json'),readJson('data/sectors/composition/history.json'),readJson('data/sectors/perf.json'),readJson('data/sectors/leaders.json',{optional:true})]);state.composition=c;state.history=h;state.perf=p;state.leaders=l;state.sectorKeys=(c.sectors||[]).map(x=>x.sector);
 $('#sectorStatus').textContent=`${c.meta?.prices_asof||'—'} 기준 · ${c.estimated?'가격 기반 근사':'원본 시가총액'} · RRG 자동 파생`;
 renderComposition();renderPerf();await loadRrg();fillSectorSelects();renderSubComposition();renderLeaders();
}
function renderComposition(){
 const sectors=[...(state.composition?.sectors||[])].sort((a,b)=>b.weight-a.weight);$('#compositionNote').textContent=state.composition?.meta?.note||state.composition?.source||'';
 $('#compositionStack').innerHTML=sectors.map((s,i)=>`<span style="width:${(s.weight*100).toFixed(3)}%;background:${COLORS[i%COLORS.length]}" title="${esc(s.name||SECTOR_MAP[s.sector])} ${(s.weight*100).toFixed(1)}%"></span>`).join('');
 $('#compositionList').innerHTML=sectors.map((s,i)=>`<button data-sector="${esc(s.sector)}" class="composition-row"><span><i style="background:${COLORS[i%COLORS.length]}"></i>${esc(s.name||SECTOR_MAP[s.sector]||s.sector)}</span><div class="weight-track"><b style="width:${Math.min(100,s.weight/sectors[0].weight*100)}%;background:${COLORS[i%COLORS.length]}"></b></div><strong>${(s.weight*100).toFixed(1)}%</strong></button>`).join('');
 $('#compositionList').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#compositionSector').value=b.dataset.sector;renderSubComposition();});
 $('#compositionHistory').innerHTML=stackedAreaChart(state.history?.rows||[],(state.history?.sectors||[]).map(s=>({...s,name:s.name||SECTOR_MAP[s.sector]})),{height:350});
}
$('#compositionMode').addEventListener('click',e=>{const b=e.target.closest('button[data-mode]');if(!b)return;document.querySelectorAll('#compositionMode button').forEach(x=>x.classList.toggle('active',x===b));const hist=b.dataset.mode==='history';$('#compositionNow').hidden=hist;$('#compositionHistory').hidden=!hist;});
function renderPerf(){const rows=[...(state.perf?.sectors||[])].map(x=>({...x,v:Number(x.returns?.[state.perfPeriod]||0)})).sort((a,b)=>b.v-a.v);const max=Math.max(...rows.map(x=>Math.abs(x.v)),.01);$('#perfList').innerHTML=rows.map((r,i)=>`<div class="perf-row"><span class="rank-num">${i+1}</span><b>${esc(r.name)}</b><div class="perf-track"><i class="${r.v>=0?'pos':'neg'}" style="width:${Math.abs(r.v)/max*100}%"></i></div><strong class="${r.v>=0?'up':'down'}">${pct(r.v)}</strong></div>`).join('');}
$('#perfPeriod').addEventListener('click',e=>{const b=e.target.closest('button[data-period]');if(!b)return;state.perfPeriod=b.dataset.period;document.querySelectorAll('#perfPeriod button').forEach(x=>x.classList.toggle('active',x===b));renderPerf();});
async function loadRrg(){
 let path;if(state.rrgLevel==='sector')path=`data/sectors/rrg__tail=${state.rrgTail}.json`;else{const sec=$('#subSector').value||state.sectorKeys[0]||'Information Technology';path=`data/sectors/rrg__level=sub&sector=${encodeURIComponent(sec).replace(/%20/g,'_20')}&tail=${state.rrgTail}.json`;}
 state.rrg=await readJson(path,{optional:true});$('#rrgChart').innerHTML=rrgChart(state.rrg?.sectors||[],{height:470});$('#rrgNote').textContent=`${state.rrgLevel==='sector'?'섹터 ETF vs S&P 500 · 자동 재계산':'원본 세부 바스켓 캐시'} · 꼬리 ${state.rrgTail}주`;
 const q={leading:[],improving:[],weakening:[],lagging:[]};for(const s of state.rrg?.sectors||[]){if(s.current?.quadrant)q[s.current.quadrant].push(s.name||s.symbol)}$('#quadrantSummary').innerHTML=`<div class="q-card leading"><span>주도</span><b>${q.leading.length}</b><small>${q.leading.join(' · ')||'—'}</small></div><div class="q-card improving"><span>개선</span><b>${q.improving.length}</b><small>${q.improving.join(' · ')||'—'}</small></div><div class="q-card weakening"><span>약화</span><b>${q.weakening.length}</b><small>${q.weakening.join(' · ')||'—'}</small></div><div class="q-card lagging"><span>후행</span><b>${q.lagging.length}</b><small>${q.lagging.join(' · ')||'—'}</small></div>`;
}
$('#rrgTail').addEventListener('click',e=>{const b=e.target.closest('button[data-tail]');if(!b)return;state.rrgTail=Number(b.dataset.tail);document.querySelectorAll('#rrgTail button').forEach(x=>x.classList.toggle('active',x===b));loadRrg();});
$('#rrgLevel').addEventListener('click',e=>{const b=e.target.closest('button[data-level]');if(!b)return;state.rrgLevel=b.dataset.level;document.querySelectorAll('#rrgLevel button').forEach(x=>x.classList.toggle('active',x===b));$('#subSector').hidden=state.rrgLevel!=='sub';loadRrg();});
$('#subSector').addEventListener('change',loadRrg);
function fillSectorSelects(){const opts=state.sectorKeys.map(k=>`<option value="${esc(k)}">${esc(SECTOR_MAP[k]||k)}</option>`).join('');$('#compositionSector').innerHTML=opts;$('#leaderSector').innerHTML=opts;$('#subSector').innerHTML=opts;}
async function renderSubComposition(){const sec=$('#compositionSector').value||state.sectorKeys[0];if(!sec)return;const slug=encodeURIComponent(sec).replace(/%20/g,'_20');const d=await readJson(`data/sectors/composition/subs__sector=${slug}.json`,{optional:true});const rows=(d?.subsectors||d?.groups||d?.items||[]);if(!rows.length){$('#subComposition').innerHTML='<div class="chart-empty small">세부 구성 캐시가 없습니다.</div>';return;}const normalized=rows.map(x=>({name:x.name||x.subsector||x.industry||x.label||'세부',weight:Number(x.weight??x.share??x.market_weight??0)})).sort((a,b)=>b.weight-a.weight);const max=normalized[0]?.weight||1;$('#subComposition').innerHTML=normalized.map((r,i)=>`<div class="sub-row"><span>${esc(r.name)}</span><div class="weight-track"><b style="width:${Math.min(100,r.weight/max*100)}%;background:${COLORS[i%COLORS.length]}"></b></div><strong>${(r.weight*100).toFixed(1)}%</strong></div>`).join('');}
$('#compositionSector').addEventListener('change',renderSubComposition);
function renderLeaders(){const sec=$('#leaderSector').value||state.sectorKeys[0];const eng=sec;const row=(state.leaders?.sectors||[]).find(x=>x.name===SECTOR_MAP[eng]||x.sector===eng||x.symbol===eng);const leaders=row?.leaders||[];$('#leaderList').innerHTML=leaders.length?leaders.map((x,i)=>`<div class="leader-row"><span>${i+1}</span><b>${esc(x.ticker)}</b><strong>$${Number(x.price||0).toLocaleString('en-US',{maximumFractionDigits:2})}</strong></div>`).join(''):'<div class="chart-empty small">대표 종목 캐시가 없습니다.</div>';}
$('#leaderSector').addEventListener('change',renderLeaders);
load().catch(e=>{$('#sectorStatus').textContent='로드 실패';console.error(e);});
