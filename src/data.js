const siteBase = new URL('../', import.meta.url);

export async function readJson(path, { optional = false } = {}) {
  const candidates = [path, `public/${path}`];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const response = await fetch(new URL(candidate, siteBase), { cache: 'no-store' });
      if (response.ok) return await response.json();
      if (response.status !== 404) throw new Error(`${candidate}: HTTP ${response.status}`);
      lastError = new Error(`${candidate}: HTTP 404`);
    } catch (error) {
      lastError = error;
    }
  }
  if (optional) return null;
  throw lastError || new Error(`${path}: 데이터를 읽지 못했습니다.`);
}

const HISTORY_IDS = [
  'core-cpi','unemployment','wages','treasury-2y','treasury-10y','real-10y','usdkrw','dxy','ndx','ixic','spx','kospi','sox','gold','oil','orcl','credit','bei','vix','curve-10y2y','hy-oas','fed-target',
];
const HISTORY_FILES = Object.fromEntries(HISTORY_IDS.map(id => [id, `data/history/${id}.json`]));
const INTRADAY_IDS = new Set(['treasury-10y','usdkrw','dxy','ndx','spx','kospi','sox','gold','oil','orcl','vix']);

const PREVIEW_FILES = {
  'core-cpi':'data/macro/chart__days=730&symbol=CPICORE.json',
  unemployment:'data/macro/chart__days=730&symbol=UNEMP.json',
  wages:'data/macro/chart__days=730&symbol=WAGE.json',
  'treasury-2y':'data/macro/chart__days=252&symbol=UST2Y.json',
  'treasury-10y':'data/macro/chart__days=90&symbol=_5eTNX.json',
  'real-10y':'data/macro/chart__days=90&symbol=REAL10Y.json',
  usdkrw:'data/macro/chart__days=90&symbol=KRW_3dX.json',
  dxy:'data/macro/chart__days=90&symbol=DX-Y.NYB.json',
  ndx:'data/macro/chart__days=90&symbol=_5eNDX.json',
  spx:'data/macro/chart__days=90&symbol=_5eGSPC.json',
  kospi:'data/macro/chart__days=90&symbol=_5eKS11.json',
  sox:'data/macro/chart__days=90&symbol=_5eSOX.json',
  gold:'data/macro/chart__days=90&symbol=GC_3dF.json',
  oil:'data/macro/chart__days=90&symbol=CL_3dF.json',
  orcl:'data/macro/chart__days=90&symbol=ORCL.json',
  credit:'data/macro/chart__days=252&symbol=CREDIT_5fRATIO.json',
  bei:'data/macro/chart__days=90&symbol=BEI.json',
  vix:'data/macro/chart__days=90&symbol=_5eVIX.json',
  'fed-target':'data/macro/chart__days=252&symbol=FEDTARGET.json',
  'curve-10y2y':'data/macro/chart__days=365&symbol=T10Y2Y.json',
  'hy-oas':'data/macro/chart__days=365&symbol=HYOAS.json',
};

const DAILY_RANGES = [
  { id:'7', label:'7일' }, { id:'30', label:'30일' }, { id:'90', label:'90일' }, { id:'365', label:'1년' }, { id:'max', label:'전체' },
];
const MONTHLY_RANGES = [
  { id:'183', label:'6개월' }, { id:'365', label:'1년' }, { id:'730', label:'2년' }, { id:'1825', label:'5년' }, { id:'max', label:'전체' },
];

function parsePointDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  let match = text.match(/^(\d{4})-(\d{2})$/);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sortSeries(series) {
  return [...(series || [])].sort((a,b) => {
    const da = parsePointDate(a.date)?.getTime() ?? 0;
    const db = parsePointDate(b.date)?.getTime() ?? 0;
    return da - db;
  });
}

function filterCalendarRange(series, days) {
  if (!series?.length || !Number.isFinite(Number(days))) return series || [];
  const sorted = sortSeries(series);
  const lastDate = parsePointDate(sorted.at(-1)?.date);
  if (!lastDate) return sorted;
  const cutoff = new Date(lastDate.getTime() - Number(days) * 86400000);
  return sorted.filter(point => {
    const date = parsePointDate(point.date);
    return date && date >= cutoff;
  });
}

async function loadIntradaySeries(cardId) {
  if (!INTRADAY_IDS.has(cardId)) return [];
  const index = await readJson('data/archive/intraday/index.json', { optional:true });
  const months = Array.isArray(index?.months) ? index.months.slice(-2) : [];
  if (!months.length) return [];
  const payloads = await Promise.all(months.map(month => readJson(`data/archive/intraday/${month}.json`, { optional:true })));
  const points = [];
  for (const payload of payloads) {
    for (const item of payload?.items || []) {
      const value = Number(item?.values?.[cardId]);
      const date = item?.providerAsOf?.[cardId] || item?.at || item?.bucket;
      const stamp = Date.parse(date);
      if (Number.isFinite(value) && Number.isFinite(stamp)) points.push({ date, value });
    }
  }
  const byDate = new Map(points.map(point => [point.date, point]));
  const sorted = [...byDate.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  if (!sorted.length) return [];
  const anchor = Date.parse(sorted.at(-1).date);
  const cutoff = anchor - 24 * 60 * 60 * 1000;
  return sorted.filter(point => Date.parse(point.date) >= cutoff);
}

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value) * 100;
}

function extractSeries(payload) {
  if (!payload) return [];
  const raw = Array.isArray(payload) ? payload : payload.series || payload.rows || [];
  return sortSeries(raw.map(point => ({
    date: point.date || point.month || '',
    value: Number(point.value ?? point.close ?? point.price),
  })).filter(point => Number.isFinite(point.value)));
}

function sparkValues(series, maxPoints = 48) {
  if (!series?.length) return [];
  const step = Math.max(1, Math.ceil(series.length / maxPoints));
  return series.filter((_, index) => index % step === 0 || index === series.length - 1).map(point => point.value);
}

function trend(series, mode = 'pct') {
  if (!series || series.length < 2) return null;
  const first = Number(series[0].value);
  const last = Number(series.at(-1).value);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  if (mode === 'bp') return (last - first) * 100;
  if (first === 0) return null;
  return ((last / first) - 1) * 100;
}

function toneFromChange(change) {
  if (change == null) return 'neutral';
  if (change > 0.15) return 'danger';
  if (change < -0.15) return 'info';
  return 'neutral';
}

function latest(series) {
  return series?.length ? series.at(-1) : null;
}

function defaultRanges(frequency, intradayAvailable) {
  const base = frequency === 'monthly' ? MONTHLY_RANGES : DAILY_RANGES;
  return intradayAvailable ? [{ id:'24h', label:'24시간' }, ...base] : base;
}

function card(id, group, title, value, options = {}) {
  const historyAvailable = options.historyAvailable ?? Boolean(HISTORY_FILES[id]);
  const intradayAvailable = options.intradayAvailable ?? INTRADAY_IDS.has(id);
  const frequency = options.frequency || 'daily';
  return {
    id, group, title, value,
    valueNumber: options.valueNumber ?? null,
    unit: options.unit ?? '',
    change: options.change ?? null,
    status: options.status ?? '',
    tone: options.tone ?? 'neutral',
    note: options.note ?? '',
    asOf: options.asOf ?? '',
    priority: options.priority ?? 50,
    custom: Boolean(options.custom),
    spark: options.spark ?? [],
    trendValue: options.trendValue ?? null,
    trendLabel: options.trendLabel ?? (frequency === 'monthly' ? '1Y' : '90D'),
    trendMode: options.trendMode ?? 'pct',
    historyAvailable,
    intradayAvailable,
    frequency,
    source: options.source || '',
    defaultRange: options.defaultRange || (frequency === 'monthly' ? '365' : '90'),
    rangeOptions: options.rangeOptions || defaultRanges(frequency, intradayAvailable),
  };
}

async function loadPreviewSeries(id) {
  const path = PREVIEW_FILES[id];
  if (path) {
    const preview = await readJson(path, { optional:true });
    if (preview) return extractSeries(preview);
  }
  const historyPath = HISTORY_FILES[id];
  if (!historyPath) return [];
  const full = extractSeries(await readJson(historyPath, { optional:true }));
  return filterCalendarRange(full, 365);
}

export async function loadDashboardData() {
  const [summary, fedMonitor, customData, meta, manifest, status, historyCatalog, collectionMeta] = await Promise.all([
    readJson('data/macro/summary.json'),
    readJson('data/fed-monitor.json'),
    readJson('data/custom-data.json', { optional:true }),
    readJson('data/meta.json', { optional:true }),
    readJson('data/manifest.json', { optional:true }),
    readJson('data/status.json', { optional:true }),
    readJson('data/history/catalog.json', { optional:true }),
    readJson('data/collection-meta.json', { optional:true }),
  ]);

  const seriesIds = ['core-cpi','unemployment','wages','treasury-2y','treasury-10y','real-10y','usdkrw','dxy','ndx','spx','kospi','sox','gold','oil','orcl','credit','bei','vix','fed-target','curve-10y2y','hy-oas'];
  const previewPairs = await Promise.all(seriesIds.map(async id => [id, await loadPreviewSeries(id)]));
  const history = Object.fromEntries(previewPairs);
  const h = id => {
    const series = history[id] || [];
    if (id !== 'hy-oas') return series;
    return series.map(point => ({ ...point, value:Math.abs(point.value) > 20 ? point.value / 100 : point.value }));
  };
  const catalogMap = new Map((historyCatalog?.items || []).map(item => [item.id, item]));
  const metaFor = id => catalogMap.get(id) || {};
  const freq = (id, fallback='daily') => metaFor(id).frequency || fallback;
  const source = id => metaFor(id).source || '';
  const monthlyTrend = id => trend(filterCalendarRange(h(id), 365), 'bp');
  const dailyTrend = (id, mode='pct') => trend(filterCalendarRange(h(id), 90), mode);
  const valueFrom = (id, fallback=null) => latest(h(id))?.value ?? fallback;
  const asOfFrom = (id, fallback='') => latest(h(id))?.date || fallback;

  const fedRate = valueFrom('fed-target');
  const bei = valueFrom('bei');
  const curve = valueFrom('curve-10y2y');
  const hyOas = valueFrom('hy-oas');
  const vix = valueFrom('vix');

  const cards = [
    card('core-cpi','물가','Core CPI',`${fedMonitor.core_cpi_yoy.toFixed(2)}%`,{ valueNumber:fedMonitor.core_cpi_yoy,status:'월간',tone:fedMonitor.core_cpi_yoy>3?'danger':'warn',asOf:fedMonitor.core_cpi_asof,priority:98,spark:sparkValues(h('core-cpi')),trendValue:monthlyTrend('core-cpi'),trendMode:'bp',frequency:freq('core-cpi','monthly'),source:source('core-cpi') }),
    card('unemployment','고용','실업률',`${fedMonitor.unemployment.toFixed(2)}%`,{ valueNumber:fedMonitor.unemployment,status:'월간',tone:fedMonitor.unemployment>4.5?'warn':'neutral',asOf:fedMonitor.unemp_asof,priority:96,spark:sparkValues(h('unemployment')),trendValue:monthlyTrend('unemployment'),trendMode:'bp',frequency:freq('unemployment','monthly'),source:source('unemployment') }),
    card('wages','고용','임금상승률',`${fedMonitor.wage_yoy.toFixed(2)}%`,{ valueNumber:fedMonitor.wage_yoy,status:'월간',tone:fedMonitor.wage_yoy>4?'danger':'info',asOf:fedMonitor.wage_asof,priority:94,spark:sparkValues(h('wages')),trendValue:monthlyTrend('wages'),trendMode:'bp',frequency:freq('wages','monthly'),source:source('wages') }),
    card('fed-target','연준','연방기금 유효금리',fedRate == null?'-':`${fedRate.toFixed(2)}%`,{ valueNumber:fedRate,status:'FRED',tone:'neutral',asOf:asOfFrom('fed-target'),priority:99,spark:sparkValues(filterCalendarRange(h('fed-target'),365)),trendValue:dailyTrend('fed-target','bp'),trendMode:'bp',frequency:freq('fed-target'),source:source('fed-target'),note:'정책금리는 회의 사이에 같은 값이 이어질 수 있습니다.' }),
    card('treasury-2y','금리','미 2년 국채',`${fedMonitor.treasury_2y.toFixed(2)}%`,{ valueNumber:fedMonitor.treasury_2y,status:'2Y',tone:fedMonitor.treasury_2y>4.5?'warn':'neutral',asOf:fedMonitor.treasury_asof,priority:97,spark:sparkValues(h('treasury-2y')),trendValue:dailyTrend('treasury-2y','bp'),trendMode:'bp',frequency:freq('treasury-2y'),source:source('treasury-2y') }),
    card('treasury-10y','금리','미 10년 국채',`${summary.treasury_10y.toFixed(3)}%`,{ valueNumber:summary.treasury_10y,status:'10Y',tone:summary.treasury_10y>4.5?'danger':'warn',asOf:summary.fetched_at,priority:100,spark:sparkValues(h('treasury-10y')),trendValue:dailyTrend('treasury-10y','bp'),trendMode:'bp',frequency:freq('treasury-10y'),source:source('treasury-10y') }),
    card('real-10y','금리','미 10년 실질금리',`${summary.real_10y.toFixed(2)}%`,{ valueNumber:summary.real_10y,status:'Real',tone:summary.real_10y>2?'warn':'neutral',asOf:asOfFrom('real-10y',summary.fetched_at),priority:91,spark:sparkValues(h('real-10y')),trendValue:dailyTrend('real-10y','bp'),trendMode:'bp',frequency:freq('real-10y'),source:source('real-10y') }),
    card('bei','금리','10년 기대인플레이션',bei == null?'-':`${bei.toFixed(2)}%`,{ valueNumber:bei,status:'BEI',tone:bei!=null&&bei>2.7?'warn':'neutral',asOf:asOfFrom('bei'),priority:89,spark:sparkValues(h('bei')),trendValue:dailyTrend('bei','bp'),trendMode:'bp',frequency:freq('bei'),source:source('bei') }),
    card('curve-10y2y','금리','10Y-2Y 금리차',curve == null?'-':`${curve.toFixed(2)}%`,{ valueNumber:curve,status:'Curve',tone:curve!=null&&curve<0?'danger':'neutral',asOf:asOfFrom('curve-10y2y'),priority:86,spark:sparkValues(h('curve-10y2y')),trendValue:dailyTrend('curve-10y2y','bp'),trendMode:'bp',frequency:freq('curve-10y2y'),source:source('curve-10y2y') }),
    card('credit','신용','HYG/LQD',Number(fedMonitor.credit_ratio).toFixed(3),{ valueNumber:fedMonitor.credit_ratio,change:fedMonitor.credit_ratio_chg,status:'Ratio',tone:'neutral',asOf:fedMonitor.credit_ratio_asof,priority:88,spark:sparkValues(h('credit')),trendValue:dailyTrend('credit'),frequency:freq('credit'),source:source('credit') }),
    card('hy-oas','신용','하이일드 OAS',hyOas == null?'-':`${hyOas.toFixed(2)}%`,{ valueNumber:hyOas,status:'OAS',tone:hyOas!=null&&hyOas>5?'danger':hyOas!=null&&hyOas>4?'warn':'neutral',asOf:asOfFrom('hy-oas'),priority:87,spark:sparkValues(h('hy-oas')),trendValue:dailyTrend('hy-oas','bp'),trendMode:'bp',frequency:freq('hy-oas'),source:source('hy-oas') }),
    card('usdkrw','환율','달러/원',summary.usdkrw.toLocaleString('ko-KR',{maximumFractionDigits:2}),{ valueNumber:summary.usdkrw,change:pct(summary.usdkrw_trend?.change_pct),status:'KRW',tone:summary.usdkrw>1400?'danger':summary.usdkrw>1350?'warn':'good',asOf:summary.fetched_at,priority:98,spark:sparkValues(h('usdkrw')),trendValue:dailyTrend('usdkrw'),frequency:freq('usdkrw'),source:source('usdkrw') }),
    card('dxy','환율','달러 지수',summary.dxy.value.toFixed(2),{ valueNumber:summary.dxy.value,change:pct(summary.dxy.changePct),status:'DXY',tone:toneFromChange(pct(summary.dxy.changePct)),asOf:summary.fetched_at,priority:90,spark:sparkValues(h('dxy')),trendValue:dailyTrend('dxy'),frequency:freq('dxy'),source:source('dxy') }),
    card('ndx','시장','나스닥 100',Math.round(summary.ndx.value).toLocaleString('ko-KR'),{ valueNumber:summary.ndx.value,change:pct(summary.ndx.changePct),status:'NDX',tone:toneFromChange(pct(summary.ndx.changePct)),asOf:summary.fetched_at,priority:95,spark:sparkValues(h('ndx')),trendValue:dailyTrend('ndx'),frequency:freq('ndx'),source:source('ndx') }),
    card('spx','시장','S&P 500',summary.spx.value.toLocaleString('ko-KR',{maximumFractionDigits:1}),{ valueNumber:summary.spx.value,change:pct(summary.spx.changePct),status:'SPX',tone:toneFromChange(pct(summary.spx.changePct)),asOf:summary.fetched_at,priority:96,spark:sparkValues(h('spx')),trendValue:dailyTrend('spx'),frequency:freq('spx'),source:source('spx') }),
    card('kospi','시장','코스피',summary.kospi.value.toLocaleString('ko-KR',{maximumFractionDigits:2}),{ valueNumber:summary.kospi.value,change:pct(summary.kospi.changePct),status:'KOSPI',tone:toneFromChange(pct(summary.kospi.changePct)),asOf:summary.fetched_at,priority:92,spark:sparkValues(h('kospi')),trendValue:dailyTrend('kospi'),frequency:freq('kospi'),source:source('kospi') }),
    card('sox','시장','필라델피아 반도체',Math.round(summary.sox.value).toLocaleString('ko-KR'),{ valueNumber:summary.sox.value,change:pct(summary.sox.changePct),status:'SOX',tone:toneFromChange(pct(summary.sox.changePct)),asOf:summary.fetched_at,priority:93,spark:sparkValues(h('sox')),trendValue:dailyTrend('sox'),frequency:freq('sox'),source:source('sox') }),
    card('vix','시장','VIX 변동성',vix == null?'-':vix.toFixed(2),{ valueNumber:vix,status:'VIX',tone:vix!=null&&vix>=30?'danger':vix!=null&&vix>=20?'warn':'neutral',asOf:asOfFrom('vix'),priority:90,spark:sparkValues(h('vix')),trendValue:dailyTrend('vix'),frequency:freq('vix'),source:source('vix') }),
    card('gold','원자재','금',`$${summary.gold.value.toLocaleString('en-US')}`,{ valueNumber:summary.gold.value,change:pct(summary.gold.changePct),status:'Gold',tone:toneFromChange(pct(summary.gold.changePct)),asOf:summary.fetched_at,priority:84,spark:sparkValues(h('gold')),trendValue:dailyTrend('gold'),frequency:freq('gold'),source:source('gold') }),
    card('oil','원자재','WTI 원유',`$${summary.oil.value.toFixed(2)}`,{ valueNumber:summary.oil.value,change:pct(summary.oil.changePct),status:'WTI',tone:summary.oil.value>100?'danger':'warn',asOf:summary.fetched_at,priority:89,spark:sparkValues(h('oil')),trendValue:dailyTrend('oil'),frequency:freq('oil'),source:source('oil') }),
    card('orcl','종목','Oracle',`$${summary.orcl.value.toFixed(2)}`,{ valueNumber:summary.orcl.value,change:pct(summary.orcl.changePct),status:'ORCL',tone:'neutral',asOf:summary.fetched_at,priority:55,spark:sparkValues(h('orcl')),trendValue:dailyTrend('orcl'),frequency:freq('orcl'),source:source('orcl') }),
  ];

  const customItems = Array.isArray(customData?.items) ? customData.items.filter(item => item?.id !== 'sample-liquidity') : [];
  const customCards = customItems.map((item,index)=>card(
    item.id||`custom-${index+1}`, item.group||'사용자 데이터', item.title||`사용자 지표 ${index+1}`, item.value??'-', {
      valueNumber:Number.isFinite(Number(item.valueNumber))?Number(item.valueNumber):null, unit:item.unit||'',
      change:Number.isFinite(Number(item.change))?Number(item.change):null, status:item.status||'수동',
      tone:['good','warn','danger','info','neutral'].includes(item.tone)?item.tone:'neutral', note:item.note||'수동 데이터 · 상세 시계열 없음', asOf:item.asOf||'',
      spark:Array.isArray(item.spark)?item.spark.map(Number).filter(Number.isFinite):[], trendValue:null,
      priority:Number.isFinite(Number(item.priority))?Number(item.priority):50, custom:true, historyAvailable:false, intradayAvailable:false,
      frequency:'manual', source:item.source||'User', rangeOptions:[],
    }
  ));

  const pointCount = Number(historyCatalog?.totalPoints) || 0;
  return {
    cards:[...cards,...customCards],
    generatedAt:meta?.generated_at||summary.fetched_at,
    fileCount:meta?.files||manifest?.files?.length||null,
    pointCount,
    status,
    historyCatalog,
    collectionMeta,
  };
}

export async function loadCardHistory(cardId, requestedRange = '90') {
  if (requestedRange === '24h') return { series:await loadIntradaySeries(cardId), range:'24h' };
  const path = HISTORY_FILES[cardId];
  if (!path) return { series:[], range:requestedRange };
  const payload = await readJson(path, { optional:true });
  let series = extractSeries(payload);
  if (cardId === 'hy-oas') series = series.map(point => ({ ...point, value:Math.abs(point.value) > 20 ? point.value / 100 : point.value }));
  if (requestedRange !== 'max') series = filterCalendarRange(series, Number(requestedRange));
  return { series, range:requestedRange };
}
