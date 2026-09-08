export function sparkline(values, tone = 'neutral') {
  if (!Array.isArray(values) || values.length < 2) return '';
  const width = 140;
  const height = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="spark spark-${tone}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${points}" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
}
