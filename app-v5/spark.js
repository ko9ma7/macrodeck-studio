function normalizedPoints(values, width, height, pad = 2) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (nums.length < 2) return '';
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const flat = max === min;
  const span = flat ? 1 : max - min;
  return nums.map((value, index) => {
    const x = pad + (index / (nums.length - 1)) * (width - pad * 2);
    const y = flat ? height / 2 : height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function sparkline(values, tone = 'neutral') {
  if (!Array.isArray(values) || values.length < 2) return '<div class="spark-empty" aria-hidden="true"></div>';
  const width = 180;
  const height = 34;
  const points = normalizedPoints(values, width, height, 2);
  return `<svg class="spark spark-${tone}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
}

export function lineChart(series) {
  const cleaned = (series || []).map(point => ({ date: point.date || point.month || '', value: Number(point.value ?? point.close) })).filter(point => Number.isFinite(point.value));
  if (!cleaned.length) return '<div class="chart-empty">이 기간에는 저장된 관측치가 없습니다.</div>';
  const width = 900;
  const height = 300;
  const plot = { left: 20, right: 16, top: 18, bottom: 32 };
  const vals = cleaned.map(point => point.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const flat = max === min;
  const span = flat ? 1 : max - min;
  const firstDate = cleaned[0]?.date || '';
  const lastDate = cleaned.at(-1)?.date || '';

  if (cleaned.length === 1) {
    const x = width / 2;
    const y = height / 2;
    return `<svg class="history-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${firstDate} 관측치 1개">
      <line x1="${plot.left}" y1="${y}" x2="${width - plot.right}" y2="${y}" class="grid-line"/>
      <circle cx="${x}" cy="${y}" r="5" class="history-point" vector-effect="non-scaling-stroke"/>
      <text x="${plot.left}" y="${height - 9}" class="chart-label">${firstDate}</text>
      <text x="${width - plot.right}" y="${y - 10}" text-anchor="end" class="chart-value-label">${cleaned[0].value.toLocaleString('ko-KR',{maximumFractionDigits:3})}</text>
      <text x="${x}" y="${y + 28}" text-anchor="middle" class="chart-hint">관측치 1개 · 추가 데이터 누적 대기</text>
    </svg>`;
  }

  const points = cleaned.map((point, index) => {
    const x = plot.left + (index / (cleaned.length - 1)) * (width - plot.left - plot.right);
    const y = flat ? height / 2 : height - plot.bottom - ((point.value - min) / span) * (height - plot.top - plot.bottom);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const mid = flat ? min : min + span / 2;
  return `<svg class="history-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${firstDate}부터 ${lastDate}까지 시계열 차트">
    <line x1="${plot.left}" y1="${plot.top}" x2="${width - plot.right}" y2="${plot.top}" class="grid-line"/>
    <line x1="${plot.left}" y1="${height / 2}" x2="${width - plot.right}" y2="${height / 2}" class="grid-line"/>
    <line x1="${plot.left}" y1="${height - plot.bottom}" x2="${width - plot.right}" y2="${height - plot.bottom}" class="grid-line"/>
    <polyline points="${points}" class="history-line" fill="none" vector-effect="non-scaling-stroke"/>
    <text x="${plot.left}" y="${height - 9}" class="chart-label">${firstDate}</text>
    <text x="${width - plot.right}" y="${height - 9}" text-anchor="end" class="chart-label">${lastDate}</text>
    <text x="${width - plot.right}" y="${plot.top + 12}" text-anchor="end" class="chart-value-label">${max.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}</text>
    <text x="${width - plot.right}" y="${height / 2 - 6}" text-anchor="end" class="chart-value-label">${mid.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}</text>
    <text x="${width - plot.right}" y="${height - plot.bottom - 6}" text-anchor="end" class="chart-value-label">${min.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}</text>
  </svg>`;
}
