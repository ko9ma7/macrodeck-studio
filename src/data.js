// This project is intentionally deployable without a bundler.
// `src/data.js` lives one level below the site root in both the repository
// and the generated `dist/` folder, so derive the base URL from the module.
const siteBase = new URL('../', import.meta.url);

async function readJson(path, { optional = false } = {}) {
  // GitHub Actions deploys `public/` contents at the site root.
  // Direct "Deploy from a branch" users still have the files under public/.
  // Supporting both makes the project much harder to mis-deploy.
  const candidates = [path, `public/${path}`];
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate, siteBase);
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return await response.json();
      if (response.status !== 404) {
        throw new Error(`${candidate}: HTTP ${response.status}`);
      }
      lastError = new Error(`${candidate}: HTTP 404`);
    } catch (error) {
      lastError = error;
    }
  }

  if (optional) return null;
  throw lastError || new Error(`${path}: 데이터를 읽지 못했습니다.`);
}

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value) * 100;
}

function toneFromChange(change) {
  if (change == null) return 'neutral';
  if (change > 0.15) return 'danger';
  if (change < -0.15) return 'good';
  return 'neutral';
}

function card(id, group, title, value, options = {}) {
  return {
    id,
    group,
    title,
    value,
    valueNumber: options.valueNumber ?? null,
    unit: options.unit ?? '',
    change: options.change ?? null,
    status: options.status ?? '',
    tone: options.tone ?? 'neutral',
    note: options.note ?? '',
    source: options.source ?? '',
    sourceUrl: options.sourceUrl ?? '',
    asOf: options.asOf ?? '',
    spark: options.spark ?? [],
    priority: options.priority ?? 50,
    custom: false,
  };
}

export async function loadDashboardData() {
  const [summary, fedMonitor, fedwatch, customData, meta] = await Promise.all([
    readJson('data/macro/summary.json'),
    readJson('data/fed-monitor.json'),
    readJson('data/fedwatch.json'),
    readJson('data/custom-data.json', { optional: true }),
    readJson('data/meta.json', { optional: true }),
  ]);

  const cards = [
    card('core-cpi', '연준 모니터', 'Core CPI', `${fedMonitor.core_cpi_yoy.toFixed(2)}%`, { valueNumber: fedMonitor.core_cpi_yoy, status: '물가', tone: fedMonitor.core_cpi_yoy > 3 ? 'danger' : 'warn', asOf: fedMonitor.core_cpi_asof, priority: 95 }),
    card('unemployment', '연준 모니터', '실업률', `${fedMonitor.unemployment.toFixed(2)}%`, { valueNumber: fedMonitor.unemployment, status: '고용', tone: fedMonitor.unemployment > 4.5 ? 'warn' : 'neutral', asOf: fedMonitor.unemp_asof, priority: 90 }),
    card('wages', '연준 모니터', '임금상승률', `${fedMonitor.wage_yoy.toFixed(2)}%`, { valueNumber: fedMonitor.wage_yoy, status: '임금', tone: fedMonitor.wage_yoy > 4 ? 'danger' : 'info', asOf: fedMonitor.wage_asof, priority: 88 }),
    card('treasury-2y', '금리', '미 2년 국채', `${fedMonitor.treasury_2y.toFixed(2)}%`, { valueNumber: fedMonitor.treasury_2y, status: '단기금리', tone: fedMonitor.treasury_2y > 4.5 ? 'warn' : 'neutral', asOf: fedMonitor.treasury_asof, priority: 94 }),
    card('treasury-10y', '금리', '미 10년 국채', `${summary.treasury_10y.toFixed(3)}%`, { valueNumber: summary.treasury_10y, status: '장기금리', tone: summary.treasury_10y > 4.5 ? 'danger' : 'warn', asOf: summary.fetched_at, priority: 96 }),
    card('real-10y', '금리', '미 10년 실질금리', `${summary.real_10y.toFixed(2)}%`, { valueNumber: summary.real_10y, status: '실질금리', tone: summary.real_10y > 2 ? 'warn' : 'neutral', asOf: summary.fetched_at, priority: 84 }),
    card('fed-next', '연준 모니터', '다음 FOMC 인상 확률', `${fedwatch.next.hike}%`, { valueNumber: fedwatch.next.hike, status: fedwatch.next.label, tone: fedwatch.next.hike >= 50 ? 'danger' : 'good', note: `동결 ${fedwatch.next.hold}% · 인하 ${fedwatch.next.cut}%`, priority: 100 }),
    card('usdkrw', '환율', '달러/원', `${summary.usdkrw.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`, { valueNumber: summary.usdkrw, change: pct(summary.usdkrw_trend?.change_pct), status: 'KRW', tone: summary.usdkrw > 1400 ? 'danger' : summary.usdkrw > 1350 ? 'warn' : 'good', note: `20거래일 ${pct(summary.usdkrw_trend?.change_pct)?.toFixed(2) ?? '-'}%`, priority: 98 }),
    card('dxy', '환율', '달러 지수', summary.dxy.value.toFixed(2), { valueNumber: summary.dxy.value, change: pct(summary.dxy.changePct), status: 'DXY', tone: toneFromChange(pct(summary.dxy.changePct)), priority: 82 }),
    card('ndx', '시장', '나스닥 100', Math.round(summary.ndx.value).toLocaleString('ko-KR'), { valueNumber: summary.ndx.value, change: pct(summary.ndx.changePct), status: 'NDX', tone: toneFromChange(pct(summary.ndx.changePct)), priority: 89 }),
    card('spx', '시장', 'S&P 500', summary.spx.value.toLocaleString('ko-KR', { maximumFractionDigits: 1 }), { valueNumber: summary.spx.value, change: pct(summary.spx.changePct), status: 'SPX', tone: toneFromChange(pct(summary.spx.changePct)), priority: 91 }),
    card('kospi', '시장', '코스피', summary.kospi.value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }), { valueNumber: summary.kospi.value, change: pct(summary.kospi.changePct), status: 'KOSPI', tone: toneFromChange(pct(summary.kospi.changePct)), priority: 87 }),
    card('sox', '시장', '필라델피아 반도체', Math.round(summary.sox.value).toLocaleString('ko-KR'), { valueNumber: summary.sox.value, change: pct(summary.sox.changePct), status: 'SOX', tone: toneFromChange(pct(summary.sox.changePct)), priority: 86 }),
    card('gold', '원자재', '금', `$${summary.gold.value.toLocaleString('en-US')}`, { valueNumber: summary.gold.value, change: pct(summary.gold.changePct), status: 'Gold', tone: toneFromChange(pct(summary.gold.changePct)), priority: 78 }),
    card('oil', '원자재', 'WTI 원유', `$${summary.oil.value.toFixed(2)}`, { valueNumber: summary.oil.value, change: pct(summary.oil.changePct), status: 'Oil', tone: summary.oil.value > 100 ? 'danger' : 'warn', priority: 83 }),
    card('orcl', '종목', 'Oracle', `$${summary.orcl.value.toFixed(2)}`, { valueNumber: summary.orcl.value, change: pct(summary.orcl.changePct), status: 'ORCL', tone: 'neutral', priority: 60 }),
  ];

  const customCards = Array.isArray(customData?.items) ? customData.items.map((item, index) => ({
    id: item.id || `custom-${index + 1}`,
    group: item.group || '사용자 데이터',
    title: item.title || `사용자 지표 ${index + 1}`,
    value: item.value ?? '-',
    valueNumber: Number.isFinite(Number(item.valueNumber)) ? Number(item.valueNumber) : null,
    unit: item.unit || '',
    change: Number.isFinite(Number(item.change)) ? Number(item.change) : null,
    status: item.status || '사용자',
    tone: ['good','warn','danger','info','neutral'].includes(item.tone) ? item.tone : 'neutral',
    note: item.note || '',
    source: item.source || '',
    sourceUrl: item.sourceUrl || '',
    asOf: item.asOf || '',
    spark: Array.isArray(item.spark) ? item.spark.map(Number).filter(Number.isFinite) : [],
    priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 50,
    custom: true,
  })) : [];

  return {
    cards: [...cards, ...customCards],
    generatedAt: meta?.generated_at || summary.fetched_at,
    customMeta: customData?.meta || null,
  };
}
