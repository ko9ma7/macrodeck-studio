import { loadCardHistory, loadDashboardData } from './data.js';
import { loadFavorites, loadLayout, loadTheme, saveFavorites, saveLayout, saveTheme } from './storage.js';
import { lineChart, sparkline } from './spark.js';
import { UI_STYLES, applyUiStyle, loadUiStyle, saveUiStyle } from './theme-manager.js';

const state = { cards:[], favorites:loadFavorites(), layout:loadLayout(), search:'', group:'전체', detailCard:null, detailRange:null };
const els = {
  grid:document.querySelector('#cards'), search:document.querySelector('#search'), group:document.querySelector('#groupFilter'), sort:document.querySelector('#sort'),
  density:document.querySelector('#density'), columns:document.querySelector('#columns'), favoritesOnly:document.querySelector('#favoritesOnly'), theme:document.querySelector('#theme'), uiStyle:document.querySelector('#uiStyle'),
  status:document.querySelector('#statusText'), historyMeta:document.querySelector('#historyMeta'), dataHealth:document.querySelector('#dataHealth'), empty:document.querySelector('#empty'),
  reset:document.querySelector('#resetLayout'), exportPrefs:document.querySelector('#exportPrefs'), importPrefs:document.querySelector('#importPrefs'), viewMenu:document.querySelector('#viewMenu'),
  viewPopover:document.querySelector('#viewPopover'), dialog:document.querySelector('#detailDialog'), detailClose:document.querySelector('#detailClose'), detailGroup:document.querySelector('#detailGroup'),
  detailTitle:document.querySelector('#detailTitle'), detailValue:document.querySelector('#detailValue'), detailChange:document.querySelector('#detailChange'), detailAsOf:document.querySelector('#detailAsOf'),
  detailChart:document.querySelector('#detailChart'), detailStats:document.querySelector('#detailStats'), detailNote:document.querySelector('#detailNote'), rangeTabs:document.querySelector('#rangeTabs'),
};

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
function applyTheme(theme){document.documentElement.dataset.theme=theme;els.theme.value=theme;}
function initUiStyle(){els.uiStyle.innerHTML=UI_STYLES.map(item=>`<option value="${item.id}">${item.label}</option>`).join('');const current=applyUiStyle(loadUiStyle());els.uiStyle.value=current;}
function asShortDate(value){if(!value)return'';const text=String(value);if(/^\d{4}-\d{2}$/.test(text))return text;const slash=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(slash)return `${slash[3]}.${String(slash[1]).padStart(2,'0')}.${String(slash[2]).padStart(2,'0')}`;const date=new Date(text);return Number.isNaN(date.getTime())?text.slice(0,10):date.toLocaleDateString('ko-KR',{year:'2-digit',month:'2-digit',day:'2-digit'});}
function formatChange(value){if(value==null||!Number.isFinite(Number(value)))return'';const n=Number(value);return `<span class="change ${n>0?'up':n<0?'down':''}">${n>0?'+':''}${n.toFixed(2)}%</span>`;}
function formatTrend(card){const n=Number(card.trendValue);if(!Number.isFinite(n))return'';const label=card.trendLabel||'90D';if(card.trendMode==='bp')return `<span class="period-change ${n>0?'up':n<0?'down':''}">${label} ${n>0?'+':''}${n.toFixed(0)}bp</span>`;return `<span class="period-change ${n>0?'up':n<0?'down':''}">${label} ${n>0?'+':''}${n.toFixed(1)}%</span>`;}
function frequencyLabel(card){if(card.frequency==='monthly')return'월간';if(card.frequency==='daily')return'일간';if(card.frequency==='manual')return'수동';return card.frequency||'';}
function syncControls(){
  if(!['compact','comfortable'].includes(state.layout.density))state.layout.density='compact';
  if(!['auto','4','5','6','7'].includes(String(state.layout.columns)))state.layout.columns='auto';
  els.sort.value=state.layout.sort;els.density.value=state.layout.density;els.columns.value=state.layout.columns;els.favoritesOnly.checked=state.layout.showOnlyFavorites;
  document.documentElement.dataset.density=state.layout.density;
  const auto='repeat(auto-fit, minmax(min(100%, 190px), 1fr))';
  document.documentElement.style.setProperty('--user-cols',state.layout.columns==='auto'?auto:`repeat(${state.layout.columns}, minmax(0,1fr))`);
}
function orderedCards(cards){const byId=new Map(cards.map(card=>[card.id,card]));const order=state.layout.order.filter(id=>byId.has(id));const missing=cards.map(card=>card.id).filter(id=>!order.includes(id));state.layout.order=[...order,...missing];saveLayout(state.layout);return state.layout.order.map(id=>byId.get(id)).filter(Boolean);}
function filteredCards(){let cards=state.cards.filter(card=>!state.layout.hidden.includes(card.id));const q=state.search.trim().toLowerCase();if(q)cards=cards.filter(card=>[card.title,card.group,card.status,card.note,card.source].join(' ').toLowerCase().includes(q));if(state.group!=='전체')cards=cards.filter(card=>card.group===state.group);if(state.layout.showOnlyFavorites)cards=cards.filter(card=>state.favorites.has(card.id));if(state.layout.sort==='priority')return [...cards].sort((a,b)=>b.priority-a.priority);if(state.layout.sort==='change')return [...cards].sort((a,b)=>Math.abs(b.change??-Infinity)-Math.abs(a.change??-Infinity));if(state.layout.sort==='name')return [...cards].sort((a,b)=>a.title.localeCompare(b.title,'ko'));if(state.layout.sort==='group')return [...cards].sort((a,b)=>a.group.localeCompare(b.group,'ko')||b.priority-a.priority);return orderedCards(cards);}

function render(){
  syncControls();const cards=filteredCards();els.empty.hidden=cards.length>0;
  els.grid.innerHTML=cards.map(card=>{
    const favorite=state.favorites.has(card.id);const clickable=card.historyAvailable?'has-history':'no-history';
    const foot=formatTrend(card)||escapeHtml(card.note||(card.historyAvailable?`${frequencyLabel(card)} 누적`:'정적 · 상세 없음'));
    return `<article class="metric-card tone-${escapeHtml(card.tone)} ${clickable}" data-id="${escapeHtml(card.id)}" draggable="${state.layout.sort==='custom'}" tabindex="${card.historyAvailable?'0':'-1'}" ${card.historyAvailable?'role="button" aria-label="'+escapeHtml(card.title)+' 상세 차트 보기"':'aria-disabled="true"'}>
      <div class="card-head"><span class="card-group">${escapeHtml(card.group)}</span><div class="card-actions"><button class="star-btn ${favorite?'active':''}" data-action="favorite" aria-label="${favorite?'즐겨찾기 해제':'즐겨찾기'}">★</button><button class="hide-btn" data-action="hide" aria-label="카드 숨기기">×</button></div></div>
      <div class="card-title-line"><h2>${escapeHtml(card.title)}</h2><span class="status-pill">${escapeHtml(card.status||frequencyLabel(card))}</span></div>
      <div class="card-value-line"><strong>${escapeHtml(card.value)}${escapeHtml(card.unit)}</strong>${formatChange(card.change)}</div>
      <div class="spark-wrap">${sparkline(card.spark,card.tone)}</div>
      <div class="card-foot"><span>${foot}</span><span>${escapeHtml(asShortDate(card.asOf))}</span></div>
    </article>`;
  }).join('');
}

function buildGroupOptions(){const groups=['전체',...new Set(state.cards.map(card=>card.group))];els.group.innerHTML=groups.map(group=>`<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join('');}
function moveOrder(dragId,targetId){const order=state.layout.order.length?[...state.layout.order]:state.cards.map(card=>card.id);const from=order.indexOf(dragId);const to=order.indexOf(targetId);if(from<0||to<0||from===to)return;order.splice(to,0,order.splice(from,1)[0]);state.layout.order=order;saveLayout(state.layout);render();}
function renderRangeTabs(card,selected){
  els.rangeTabs.innerHTML=(card.rangeOptions||[]).map(option=>`<button data-range="${escapeHtml(option.id)}" role="tab" aria-selected="${String(option.id===selected)}" class="${option.id===selected?'active':''}">${escapeHtml(option.label)}</button>`).join('');
}
function detailNoteText(card,series,range){
  const source=card.source?`출처 ${card.source}. `:'';
  if(range==='24h'&&series.length<2)return `${source}30분 스냅샷은 자동 수집을 시작한 뒤부터 누적됩니다. 현재 ${series.length}개 관측치라 추세선을 만들기에는 아직 부족합니다.`;
  if(card.frequency==='monthly')return `${source}월간 발표 지표입니다. 발표 전까지 같은 값이 유지되는 것이 정상이며, 짧은 일 단위 대신 6개월·1년·2년 구간으로 표시합니다.`;
  if(card.id==='fed-target')return `${source}연방기금 유효금리는 정책 결정 사이에 같은 값이 길게 이어질 수 있으므로 평평한 구간은 데이터 오류가 아닙니다.`;
  return `${source}저장소에 누적된 일별 시계열에서 선택한 기간만 잘라 표시합니다.`;
}

async function openDetails(id,range=null){
  const card=state.cards.find(item=>item.id===id);if(!card||!card.historyAvailable)return;
  const validRanges=new Set((card.rangeOptions||[]).map(option=>option.id));
  const selected=range&&validRanges.has(range)?range:(validRanges.has(card.defaultRange)?card.defaultRange:(card.rangeOptions?.[0]?.id||'90'));
  state.detailCard=card;state.detailRange=selected;
  els.detailGroup.textContent=`${card.group} · ${frequencyLabel(card)}`;els.detailTitle.textContent=card.title;els.detailValue.textContent=`${card.value}${card.unit}`;els.detailChange.innerHTML=formatChange(card.change);els.detailAsOf.textContent=card.asOf?`기준 ${asShortDate(card.asOf)}`:'';
  renderRangeTabs(card,selected);els.detailNote.textContent='저장된 시계열을 불러오는 중입니다.';
  els.detailChart.innerHTML='<div class="chart-loading">시계열 불러오는 중…</div>';els.detailStats.innerHTML='';if(!els.dialog.open)els.dialog.showModal();
  const {series}=await loadCardHistory(id,selected);if(state.detailCard?.id!==id||state.detailRange!==selected)return;
  els.detailChart.innerHTML=lineChart(series);els.detailNote.textContent=detailNoteText(card,series,selected);
  if(series.length){const vals=series.map(p=>p.value);const first=vals[0],last=vals.at(-1),min=Math.min(...vals),max=Math.max(...vals);const delta=card.trendMode==='bp'?(last-first)*100:(first?((last/first)-1)*100:null);const deltaLabel=delta==null?'-':card.trendMode==='bp'?`${delta>0?'+':''}${delta.toFixed(0)}bp`:`${delta>0?'+':''}${delta.toFixed(2)}%`;els.detailStats.innerHTML=`<div><span>관측치</span><strong>${series.length.toLocaleString('ko-KR')}</strong></div><div><span>기간 변화</span><strong class="${delta>0?'up':delta<0?'down':''}">${deltaLabel}</strong></div><div><span>최저</span><strong>${min.toLocaleString('ko-KR',{maximumFractionDigits:3})}</strong></div><div><span>최고</span><strong>${max.toLocaleString('ko-KR',{maximumFractionDigits:3})}</strong></div>`;}else{els.detailStats.innerHTML='<div class="no-stats">아직 이 기간의 저장된 관측치가 없습니다.</div>';}
}

els.grid.addEventListener('click',event=>{const button=event.target.closest('button[data-action]');const cardEl=event.target.closest('[data-id]');if(!cardEl)return;const id=cardEl.dataset.id;if(button){event.stopPropagation();if(button.dataset.action==='favorite'){state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);saveFavorites(state.favorites);}if(button.dataset.action==='hide'){state.layout.hidden=[...new Set([...state.layout.hidden,id])];saveLayout(state.layout);}render();return;}openDetails(id);});
els.grid.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('.metric-card.has-history')){event.preventDefault();openDetails(event.target.dataset.id);}});
let dragId=null;els.grid.addEventListener('dragstart',event=>{dragId=event.target.closest('[data-id]')?.dataset.id||null;event.target.closest('.metric-card')?.classList.add('dragging');});els.grid.addEventListener('dragend',event=>event.target.closest('.metric-card')?.classList.remove('dragging'));els.grid.addEventListener('dragover',event=>{if(state.layout.sort==='custom')event.preventDefault();});els.grid.addEventListener('drop',event=>{if(!dragId||state.layout.sort!=='custom')return;event.preventDefault();const targetId=event.target.closest('[data-id]')?.dataset.id;if(targetId)moveOrder(dragId,targetId);dragId=null;});
els.search.addEventListener('input',e=>{state.search=e.target.value;render();});els.group.addEventListener('change',e=>{state.group=e.target.value;render();});for(const [el,key] of [[els.sort,'sort'],[els.density,'density'],[els.columns,'columns']])el.addEventListener('change',e=>{state.layout[key]=e.target.value;saveLayout(state.layout);render();});els.favoritesOnly.addEventListener('change',e=>{state.layout.showOnlyFavorites=e.target.checked;saveLayout(state.layout);render();});els.theme.addEventListener('change',e=>{saveTheme(e.target.value);applyTheme(e.target.value);});els.uiStyle.addEventListener('change',e=>{const value=saveUiStyle(e.target.value);applyUiStyle(value);});
els.viewMenu.addEventListener('click',()=>{const willOpen=els.viewPopover.hidden;els.viewPopover.hidden=!willOpen;els.viewMenu.setAttribute('aria-expanded',String(willOpen));});document.addEventListener('click',e=>{if(!els.viewPopover.hidden&&!e.target.closest('.view-popover')&&!e.target.closest('#viewMenu')){els.viewPopover.hidden=true;els.viewMenu.setAttribute('aria-expanded','false');}});
els.reset.addEventListener('click',()=>{if(!confirm('카드 순서, 숨김, 보기 설정을 초기화할까요? 즐겨찾기는 유지됩니다.'))return;state.layout={sort:'custom',density:'compact',columns:'auto',showOnlyFavorites:false,order:[],hidden:[]};saveLayout(state.layout);render();});
els.exportPrefs.addEventListener('click',()=>{const payload={version:3,layout:state.layout,favorites:[...state.favorites],theme:loadTheme(),uiStyle:loadUiStyle(),exportedAt:new Date().toISOString()};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='macrodeck-preferences.json';a.click();URL.revokeObjectURL(a.href);});
els.importPrefs.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const payload=JSON.parse(await file.text());if(!payload.layout)throw new Error('layout 필드가 없습니다.');state.layout={...state.layout,...payload.layout};state.favorites=new Set(Array.isArray(payload.favorites)?payload.favorites:[]);saveLayout(state.layout);saveFavorites(state.favorites);if(payload.theme){saveTheme(payload.theme);applyTheme(payload.theme);}if(payload.uiStyle){const style=saveUiStyle(payload.uiStyle);applyUiStyle(style);els.uiStyle.value=style;}render();}catch(error){alert(`설정 파일을 읽지 못했습니다: ${error.message}`);}e.target.value='';});
els.detailClose.addEventListener('click',()=>els.dialog.close());els.dialog.addEventListener('click',e=>{if(e.target===els.dialog)els.dialog.close();});els.rangeTabs.addEventListener('click',e=>{const button=e.target.closest('button[data-range]');if(!button||!state.detailCard)return;openDetails(state.detailCard.id,button.dataset.range);});

async function start(){applyTheme(loadTheme());initUiStyle();try{const data=await loadDashboardData();state.cards=data.cards;state.layout.order=state.layout.order.length?state.layout.order:state.cards.map(card=>card.id);if(!state.layout.density)state.layout.density='compact';buildGroupOptions();const generated=data.generatedAt?new Date(data.generatedAt):null;els.status.textContent=generated&&!Number.isNaN(generated.getTime())?`${generated.toLocaleString('ko-KR')} 저장본`:'저장 데이터 로드';const cadence=Number(data.collectionMeta?.snapshotCadenceMinutes)||30;const seriesCount=Number(data.collectionMeta?.historySeries)||data.historyCatalog?.items?.length||0;els.historyMeta.textContent=`누적 ${data.pointCount.toLocaleString('ko-KR')}포인트 · ${seriesCount}개 시계열 · 스냅샷 ${cadence}분`;if(data.status){const ok=data.status.ok??data.status.success??0;const failed=data.status.failed??0;const mode=data.status.mode?` · ${data.status.mode}`:'';els.dataHealth.textContent=`정적 저장 데이터 · 최근 수집${mode} · 성공 ${ok} / 실패 ${failed}`;}else{els.dataHealth.textContent=`정적 저장 데이터 · 스냅샷 ${cadence}분 / 일별 이력 1일 / 주간 백필`;}render();}catch(error){console.error(error);els.status.textContent='데이터 로드 실패';document.querySelector('#error').hidden=false;}}
start();
