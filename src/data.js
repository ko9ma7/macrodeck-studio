const siteBase = new URL('../', import.meta.url);

async function readJson(path, { optional = false } = {}) {
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
  'core-cpi','unemployment','wages','treasury-2y','treasury-10y','real-10y','usdkrw','dxy','ndx','spx','kospi','sox','gold','oil','orcl','credit','bei','vix','curve-10y2y','hy-oas','fed-target',
];
const HISTORY_FILES = Object.fromEntries(HISTORY_IDS.map(id => [id, `data/history/${id}.json`]));
const INTRADAY_IDS = new Set(['treasury-10y','usdkrw','dxy','ndx','spx','kospi','sox','gold','oil','orcl','vix']);

const SERIES_FILES = {
  'core-cpi': { '90':'data/macro/chart__days=730&symbol=CPICORE.json', '365':'data/macro/chart__days=730&symbol=CPICORE.json', max:HISTORY_FILES['core-cpi'] },
  unemployment: { '90':'data/macro/chart__days=730&symbol=UNEMP.json', '365':'data/macro/chart__days=730&symbol=UNEMP.json', max:HISTORY_FILES.unemployment },
  wages: { '90':'data/macro/chart__days=730&symbol=WAGE.json', '365':'data/macro/chart__days=730&symbol=WAGE.json', max:HISTORY_FILES.wages },
  'treasury-2y': { '90':'data/macro/chart__days=252&symbol=UST2Y.json', '365':'data/macro/chart__days=252&symbol=UST2Y.json', max:HISTORY_FILES['treasury-2y'] },
  'treasury-10y': seriesMap('_5eTNX','treasury-10y'),
  'real-10y': seriesMap('REAL10Y','real-10y'),
  usdkrw: seriesMap('KRW_3dX','usdkrw'),
  dxy: seriesMap('DX-Y.NYB','dxy'),
  ndx: seriesMap('_5eNDX','ndx'),
  spx: seriesMap('_5eGSPC','spx'),
  kospi: seriesMap('_5eKS11','kospi'),
  sox: seriesMap('_5eSOX','sox'),
  gold: seriesMap('GC_3dF','gold'),
  oil: seriesMap('CL_3dF','oil'),
  orcl: seriesMap('ORCL','orcl'),
  credit: { '90':'data/macro/chart__days=252&symbol=CREDIT_5fRATIO.json', '365':'data/macro/chart__days=252&symbol=CREDIT_5fRATIO.json', max:HISTORY_FILES.credit },
  bei: { '90':'data/macro/chart__days=90&symbol=BEI.json', max:HISTORY_FILES.bei },
};

function seriesMap(symbol, historyId) {
  const map = {};
  for (const days of [7,30,90,180,365]) map[String(days)] = `data/macro/chart__days=${days}&symbol=${symbol}.json`;
  map.max = HISTORY_FILES[historyId];
  return map;
}

function filterCalendarRange(series, days) {
  if (!series?.length || !Number.isFinite(Number(days))) return series || [];
  const lastDate = new Date(String(series.at(-1).date).slice(0,10));
  if (Number.isNaN(lastDate.getTime())) return series;
  const cutoff = new Date(lastDate);
  cutoff.setUTCDate(cutoff.getUTCDate() - Number(days));
  return series.filter(point => {
    const date = new Date(String(point.date).slice(0,10));
    return !Number.isNaN(date.getTime()) && date >= cutoff;
  });
}

async function loadIntradaySeries(cardId) {
  if (!INTRADAY_IDS.has(cardId)) return [];
  const index = await readJson('data/archive/intraday/index.json', { optional:true });
  const months = Array.isArray(index?.months) ? index.months.slice(-2) : [];
  if (!months.length) return [];
  const payloads = await Promise.all(months.map(month => readJson(`data/archive/intraday/${month}.json`, { optional:true })));
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;
  const points = [];
  for (const payload of payloads) {
    for (const item of payload?.items || []) {
      const value = Number(item?.values?.[cardId]);
      const date = item?.providerAsOf?.[cardId] || item?.at || item?.bucket;
      const stamp = Date.parse(date);
      if (Number.isFinite(value) && Number.isFinite(stamp) && stamp >= cutoff) points.push({ date, value });
    }
  }
  const byDate = new Map(points.map(point => [point.date, point]));
  return [...byDate.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value) * 100;
}

function extractSeries(payload) {
  if (!payload) return [];
  const raw = Array.isArray(payload) ? payload : payload.series || payload.rows || [];
  return raw.map(point => ({
    date: point.date || point.month || '',
    value: Number(point.value ?? point.close ?? point.price),
  })).filter(point => Number.isFinite(point.value));
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

function card(id, group, title, value, options = {}) {
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
    custom: false,
    spark: options.spark ?? [],
    trend90: options.trend90 ?? null,
    trendMode: options.trendMode ?? 'pct',
    historyAvailable: Boolean(SERIES_FILES[id]),
    intradayAvailable: INTRADAY_IDS.has(id),
  };
}

async function loadDefaultSeries(id) {
  const path = SERIES_FILES[id]?.['90'] || SERIES_FILES[id]?.['365'] || SERIES_FILES[id]?.max;
  if (!path) return [];
  return extractSeries(await readJson(path, { optional: true }));
}

export async function loadDashboardData() {
  const [summary, fedMonitor, fedwatch, customData, meta, manifest, status, historyCatalog, collectionMeta] = await Promise.all([
    readJson('data/macro/summary.json'),
    readJson('data/fed-monitor.json'),
    readJson('data/fedwatch.json'),
    readJson('data/custom-data.json', { optional: true }),
    readJson('data/meta.json', { optional: true }),
    readJson('data/manifest.json', { optional: true }),
    readJson('data/status.json', { optional: true }),
    readJson('data/history/catalog.json', { optional: true }),
    readJson('data/collection-meta.json', { optional: true }),
  ]);

  const seriesIds = ['core-cpi','unemployment','wages','treasury-2y','treasury-10y','real-10y','usdkrw','dxy','ndx','spx','kospi','sox','gold','oil','orcl','credit','bei'];
  const historyPairs = await Promise.all(seriesIds.map(async id => [id, await loadDefaultSeries(id)]));
  const history = Object.fromEntries(historyPairs);
  const h = id => history[id] || [];

  const cards = [
    card('core-cpi','물가','Core CPI',`${fedMonitor.core_cpi_yoy.toFixed(2)}%`,{ valueNumber:fedMonitor.core_cpi_yoy,status:'물가',tone:fedMonitor.core_cpi_yoy>3?'danger':'warn',asOf:fedMonitor.core_cpi_asof,priority:98,spark:sparkValues(h('core-cpi')),trend90:trend(h('core-cpi')) }),
    card('unemployment','고용','실업률',`${fedMonitor.unemployment.toFixed(2)}%`,{ valueNumber:fedMonitor.unemployment,status:'고용',tone:fedMonitor.unemployment>4.5?'warn':'neutral',asOf:fedMonitor.unemp_asof,priority:96,spark:sparkValues(h('unemployment')),trend90:trend(h('unemployment')) }),
    card('wages','고용','임금상승률',`${fedMonitor.wage_yoy.toFixed(2)}%`,{ valueNumber:fedMonitor.wage_yoy,status:'임금',tone:fedMonitor.wage_yoy>4?'danger':'info',asOf:fedMonitor.wage_asof,priority:94,spark:sparkValues(h('wages')),trend90:trend(h('wages')) }),
    card('treasury-2y','금리','미 2년 국채',`${fedMonitor.treasury_2y.toFixed(2)}%`,{ valueNumber:fedMonitor.treasury_2y,status:'2Y',tone:fedMonitor.treasury_2y>4.5?'warn':'neutral',asOf:fedMonitor.treasury_asof,priority:97,spark:sparkValues(h('treasury-2y')),trend90:trend(h('treasury-2y'),'bp'),trendMode:'bp' }),
    card('treasury-10y','금리','미 10년 국채',`${summary.treasury_10y.toFixed(3)}%`,{ valueNumber:summary.treasury_10y,status:'10Y',tone:summary.treasury_10y>4.5?'danger':'warn',asOf:summary.fetched_at,priority:100,spark:sparkValues(h('treasury-10y')),trend90:trend(h('treasury-10y'),'bp'),trendMode:'bp' }),
    card('real-10y','금리','미 10년 실질금리',`${summary.real_10y.toFixed(2)}%`,{ valueNumber:summary.real_10y,status:'Real',tone:summary.real_10y>2?'warn':'neutral',asOf:summary.fetched_at,priority:91,spark:sparkValues(h('real-10y')),trend90:trend(h('real-10y'),'bp'),trendMode:'bp' }),
    card('credit','신용','HYG/LQD',Number(fedMonitor.credit_ratio).toFixed(3),{ valueNumber:fedMonitor.credit_ratio,change:fedMonitor.credit_ratio_chg,status:'신용',tone:'neutral',asOf:fedMonitor.credit_ratio_asof,priority:88,spark:sparkValues(h('credit')),trend90:trend(h('credit')) }),
    card('fed-next','연준','다음 FOMC 인상확률',`${fedwatch.next.hike}%`,{ valueNumber:fedwatch.next.hike,status:fedwatch.next.label,tone:fedwatch.next.hike>=50?'danger':'good',note:`동결 ${fedwatch.next.hold}% · 인하 ${fedwatch.next.cut}%`,priority:99,spark:(fedwatch.path||[]).map(p=>Number(p.value)).filter(Number.isFinite),historyAvailable:false }),
    card('usdkrw','환율','달러/원',summary.usdkrw.toLocaleString('ko-KR',{maximumFractionDigits:2}),{ valueNumber:summary.usdkrw,change:pct(summary.usdkrw_trend?.change_pct),status:'KRW',tone:summary.usdkrw>1400?'danger':summary.usdkrw>1350?'warn':'good',asOf:summary.fetched_at,priority:98,spark:sparkValues(h('usdkrw')),trend90:trend(h('usdkrw')) }),
    card('dxy','환율','달러 지수',summary.dxy.value.toFixed(2),{ valueNumber:summary.dxy.value,change:pct(summary.dxy.changePct),status:'DXY',tone:toneFromChange(pct(summary.dxy.changePct)),asOf:summary.fetched_at,priority:90,spark:sparkValues(h('dxy')),trend90:trend(h('dxy')) }),
    card('ndx','시장','나스닥 100',Math.round(summary.ndx.value).toLocaleString('ko-KR'),{ valueNumber:summary.ndx.value,change:pct(summary.ndx.changePct),status:'NDX',tone:toneFromChange(pct(summary.ndx.changePct)),asOf:summary.fetched_at,priority:95,spark:sparkValues(h('ndx')),trend90:trend(h('ndx')) }),
    card('spx','시장','S&P 500',summary.spx.value.toLocaleString('ko-KR',{maximumFractionDigits:1}),{ valueNumber:summary.spx.value,change:pct(summary.spx.changePct),status:'SPX',tone:toneFromChange(pct(summary.spx.changePct)),asOf:summary.fetched_at,priority:96,spark:sparkValues(h('spx')),trend90:trend(h('spx')) }),
    card('kospi','시장','코스피',summary.kospi.value.toLocaleString('ko-KR',{maximumFractionDigits:2}),{ valueNumber:summary.kospi.value,change:pct(summary.kospi.changePct),status:'KOSPI',tone:toneFromChange(pct(summary.kospi.changePct)),asOf:summary.fetched_at,priority:92,spark:sparkValues(h('kospi')),trend90:trend(h('kospi')) }),
    card('sox','시장','필라델피아 반도체',Math.round(summary.sox.value).toLocaleString('ko-KR'),{ valueNumber:summary.sox.value,change:pct(summary.sox.changePct),status:'SOX',tone:toneFromChange(pct(summary.sox.changePct)),asOf:summary.fetched_at,priority:93,spark:sparkValues(h('sox')),trend90:trend(h('sox')) }),
    card('gold','원자재','금',`$${summary.gold.value.toLocaleString('en-US')}`,{ valueNumber:summary.gold.value,change:pct(summary.gold.changePct),status:'Gold',tone:toneFromChange(pct(summary.gold.changePct)),asOf:summary.fetched_at,priority:84,spark:sparkValues(h('gold')),trend90:trend(h('gold')) }),
    card('oil','원자재','WTI 원유',`$${summary.oil.value.toFixed(2)}`,{ valueNumber:summary.oil.value,change:pct(summary.oil.changePct),status:'WTI',tone:summary.oil.value>100?'danger':'warn',asOf:summary.fetched_at,priority:89,spark:sparkValues(h('oil')),trend90:trend(h('oil')) }),
    card('orcl','종목','Oracle',`$${summary.orcl.value.toFixed(2)}`,{ valueNumber:summary.orcl.value,change:pct(summary.orcl.changePct),status:'ORCL',tone:'neutral',asOf:summary.fetched_at,priority:55,spark:sparkValues(h('orcl')),trend90:trend(h('orcl')) }),
  ];

  const customCards = Array.isArray(customData?.items) ? customData.items.map((item,index)=>({
    id:item.id||`custom-${index+1}`, group:item.group||'사용자 데이터', title:item.title||`사용자 지표 ${index+1}`,
    value:item.value??'-', valueNumber:Number.isFinite(Number(item.valueNumber))?Number(item.valueNumber):null, unit:item.unit||'',
    change:Number.isFinite(Number(item.change))?Number(item.change):null, status:item.status||'사용자',
    tone:['good','warn','danger','info','neutral'].includes(item.tone)?item.tone:'neutral', note:item.note||'', asOf:item.asOf||'',
    spark:Array.isArray(item.spark)?item.spark.map(Number).filter(Number.isFinite):[], trend90:null, trendMode:'pct',
    priority:Number.isFinite(Number(item.priority))?Number(item.priority):50, custom:true, historyAvailable:false, intradayAvailable:false,
  })) : [];

  const pointCount = Number(historyCatalog?.totalPoints) || Object.values(history).reduce((sum,series)=>sum+series.length,0);
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
  const map = SERIES_FILES[cardId];
  if (!map) return { series:[], range:requestedRange };
  let range = requestedRange;
  let path = map[range];
  if (!path && range === 'max') path = map.max;
  if (!path && range === '365') path = map['365'] || map.max || map['90'];
  if (!path && range === '30') path = map['30'] || map['90'] || map.max;
  if (!path && range === '7') path = map['7'] || map['30'] || map['90'] || map.max;
  if (!path) {
    const fallback = Object.entries(map).find(([,value])=>value);
    range = fallback?.[0] || requestedRange;
    path = fallback?.[1];
  }
  if (!path) return { series:[], range };
  const payload = await readJson(path, { optional:true });
  let series = extractSeries(payload);
  if (path === map.max && requestedRange !== 'max') series = filterCalendarRange(series, Number(requestedRange));
  return { series, range };
}
