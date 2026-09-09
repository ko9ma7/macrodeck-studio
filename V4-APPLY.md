# MacroDeck V4 적용 가이드

V4는 기존 저장소에 이미 누적된 `public/data/history/`, `public/data/archive/`, `public/data/custom-data.json`을 보존하면서 분석 화면과 자동 파생 로직을 추가합니다.

## 안전 패치 적용

`macrodeck-v4-patch.zip`의 파일을 저장소 루트에 **경로 그대로 덮어쓰기**합니다.

패치는 다음 실시간/사용자 누적 데이터를 포함하지 않습니다.

- `public/data/history/*.json`
- `public/data/archive/**`
- `public/data/custom-data.json`
- `public/data/collection-meta.json`

따라서 기존 누적 데이터는 유지됩니다.

## 적용 직후 GitHub Actions

1. `Actions → Collect market data and deploy MacroDeck → Run workflow`
2. `mode = backfill`을 1회 실행
3. 성공 후 `mode = snapshot`을 1회 실행

첫 backfill에서 기존 history와 공급자 데이터를 날짜 기준으로 병합하고, Nasdaq Composite 및 11개 미국 섹터 ETF history를 채운 뒤 섹터 성과/RRG/구성비 근사/폭락 이력/데이터 목록을 재계산합니다.

## 공개 페이지

- `/` 모니터
- `/history.html` 장기 이력·정규화 오버레이·외국인 수급·폭락 이력
- `/sectors.html` 섹터 구성비·성과·RRG·세부섹터
- `/catalog.html` 데이터 목록·공급원·빈도·기간·상태
- `/admin.html` Data Studio (직접 주소 접근)

## 자동 갱신 상태 구분

- `auto`: 외부 공개 데이터에서 자동 갱신
- `derived`: 로컬 누적 데이터에서 자동 재계산
- `seeded`: 기존 기초자료. backfill에서 확장
- `cached`: 원본 스냅샷에는 있으나 안정적 자동 공급원이 아직 연결되지 않은 자료

외국인 투자자별 순매수, 외국인 보유비중, 한국 반도체 수출 및 일부 세부 섹터 캐시는 원본 데이터는 모두 표시하지만 현재는 `cached`입니다. 공급원이 확인되지 않은 값을 임의로 생성하거나 스크래핑해 덮어쓰지 않습니다.
