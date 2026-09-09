
const form = document.querySelector('#itemForm');
const list = document.querySelector('#draftList');
const preview = document.querySelector('#jsonPreview');
const importInput = document.querySelector('#importData');
let items = [];

function slugify(value) {
  const base = String(value || '').trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
  return base || `metric-${Date.now()}`;
}

function formItem() {
  const fd = new FormData(form);
  const spark = String(fd.get('spark') || '').split(',').map(v => Number(v.trim())).filter(Number.isFinite);
  const item = {
    id: slugify(fd.get('id') || fd.get('title')),
    group: String(fd.get('group') || '사용자 데이터').trim(),
    title: String(fd.get('title') || '').trim(),
    value: String(fd.get('value') || '').trim(),
    valueNumber: fd.get('valueNumber') === '' ? null : Number(fd.get('valueNumber')),
    unit: String(fd.get('unit') || '').trim(),
    change: fd.get('change') === '' ? null : Number(fd.get('change')),
    status: String(fd.get('status') || '').trim(),
    tone: String(fd.get('tone') || 'neutral'),
    note: String(fd.get('note') || '').trim(),
    source: String(fd.get('source') || '').trim(),
    sourceUrl: String(fd.get('sourceUrl') || '').trim(),
    asOf: String(fd.get('asOf') || '').trim(),
    priority: Number(fd.get('priority') || 50),
    spark,
  };
  if (!item.title) throw new Error('지표 이름은 필수입니다.');
  if (!item.value) throw new Error('표시값은 필수입니다.');
  if (!Number.isFinite(item.priority) || item.priority < 0 || item.priority > 100) throw new Error('우선순위는 0~100이어야 합니다.');
  if (item.sourceUrl && !/^https?:\/\//i.test(item.sourceUrl)) throw new Error('출처 URL은 http:// 또는 https://로 시작해야 합니다.');
  return item;
}

function payload() {
  return {
    schemaVersion: 1,
    meta: {
      title: document.querySelector('#datasetTitle').value.trim() || 'MacroDeck 사용자 데이터',
      updatedAt: new Date().toISOString(),
      description: document.querySelector('#datasetDescription').value.trim(),
    },
    items,
  };
}

function render() {
  list.innerHTML = items.length ? items.map((item, index) => `<li><div><strong>${item.title}</strong><span>${item.group} · ${item.value}${item.unit || ''} · 우선순위 ${item.priority}</span></div><div><button data-edit="${index}">수정</button><button class="danger-text" data-remove="${index}">삭제</button></div></li>`).join('') : '<li class="empty-line">아직 추가한 지표가 없습니다.</li>';
  preview.textContent = JSON.stringify(payload(), null, 2);
  document.querySelector('#count').textContent = `${items.length}개 지표`;
}

form.addEventListener('submit', e => {
  e.preventDefault();
  try {
    const item = formItem();
    const editIndex = Number(form.dataset.editIndex ?? -1);
    const duplicate = items.findIndex((x, i) => x.id === item.id && i !== editIndex);
    if (duplicate >= 0) throw new Error(`id '${item.id}'가 이미 있습니다.`);
    if (editIndex >= 0) items[editIndex] = item; else items.push(item);
    form.reset(); delete form.dataset.editIndex; document.querySelector('#saveItem').textContent = '지표 추가'; render();
  } catch (error) { alert(error.message); }
});

list.addEventListener('click', e => {
  const edit = e.target.closest('[data-edit]');
  const remove = e.target.closest('[data-remove]');
  if (remove) { items.splice(Number(remove.dataset.remove), 1); render(); }
  if (edit) {
    const index = Number(edit.dataset.edit); const item = items[index];
    for (const [key, value] of Object.entries(item)) {
      const input = form.elements.namedItem(key);
      if (input) input.value = Array.isArray(value) ? value.join(', ') : value ?? '';
    }
    form.dataset.editIndex = String(index); document.querySelector('#saveItem').textContent = '수정 저장'; form.scrollIntoView({ behavior:'smooth' });
  }
});

document.querySelector('#download').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(payload(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'custom-data.json'; a.click(); URL.revokeObjectURL(a.href);
});

document.querySelector('#copyJson').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(payload(), null, 2)); alert('JSON을 클립보드에 복사했습니다.'); }
  catch { alert('클립보드 복사 권한이 없습니다. JSON 미리보기에서 직접 복사해주세요.'); }
});

importInput.addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.items)) throw new Error('items 배열이 없는 파일입니다.');
    items = data.items;
    document.querySelector('#datasetTitle').value = data.meta?.title || '';
    document.querySelector('#datasetDescription').value = data.meta?.description || '';
    render();
  } catch (error) { alert(`가져오기 실패: ${error.message}`); }
  e.target.value = '';
});

document.querySelector('#clear').addEventListener('click', () => {
  if (items.length && !confirm('작성 중인 모든 지표를 지울까요?')) return;
  items = []; form.reset(); render();
});

render();
