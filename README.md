# MacroDeck V5 — Macro Market Monitor + Analysis Lab

GitHub Pages에서 동작하는 정적 매크로 시장 모니터입니다. 브라우저가 외부 금융 API를 직접 호출하지 않고, GitHub Actions가 데이터를 수집해 저장소 JSON에 누적한 뒤 Pages를 배포합니다.

## Public pages

- `/` — 현재값·스파크라인·상세 누적 차트
- `/history.html` — 정규화 오버레이, 범위 위치, 시작점 대비 % 변화, 외국인 수급, 반도체 수출, 폭락 이력
- `/sectors.html` — S&P 500 섹터 구성비, 구성비 시계열, 섹터 성과, RRG, 세부 섹터 캐시
- `/catalog.html` — 기초 데이터 라이브러리. 자동/파생/시드/캐시 상태와 공급원·빈도·기간·포인트 확인
- `/admin.html` — 직접 주소로 접근하는 Data Studio

V5부터 모든 공개 페이지가 같은 `app-v5/` 디자인 시스템과 versioned asset path를 사용합니다. GitHub Pages의 저장소 하위 경로에서도 CSS/JS/JSON을 상대경로로 읽습니다.

## Data model

### Automatic history

GitHub Actions가 Yahoo Finance chart와 FRED CSV를 읽어 `public/data/history/*.json`에 날짜 기준으로 병합합니다.

기본 수집군:

- 시장: S&P 500, Nasdaq 100, Nasdaq Composite, KOSPI, SOX, VIX
- 환율: USD/KRW, Dollar Index
- 원자재: Gold, WTI
- 금리/연준: US 2Y, US 10Y, 10Y real yield, 10Y breakeven, 10Y-2Y spread, Effective Fed Funds Rate
- 신용: HY OAS, HYG/LQD
- 물가/고용: Core CPI YoY, Unemployment, Average Hourly Earnings YoY
- 섹터: 11개 SPDR sector ETF 5년 로컬 history

### Intraday archive

시장성 지표는 snapshot Action에서 Yahoo 5분봉의 마지막 공급자 시각을 읽고, 30분 cadence bucket으로 `public/data/archive/intraday/YYYY-MM.json`에 저장합니다.

- Action 주기: 30분
- 실제 값 변화: 해당 시장/상품의 거래시간과 공급자 timestamp에 따라 다름
- 휴장/장마감 후 동일 provider timestamp + 동일 값은 중복 저장하지 않음
- 24시간 차트는 Actions를 켠 시점 이후 쌓인 intraday archive를 사용
- 과거 장기 backfill은 기본적으로 daily history이며 과거 수년치 intraday를 소급 저장하지 않음

자세한 설명은 [`DATA-CADENCE.md`](./DATA-CADENCE.md)를 참고하세요.

### Derived analytics

`scripts/derive_analytics.py`가 저장된 데이터에서 다음을 재계산합니다.

- S&P 500 / Nasdaq Composite drawdown과 -10% 이상 하락 에피소드
- Sector performance leaderboard
- Sector RRG 6/10/14주 tail
- 기존 시가총액 구성비 앵커 + 섹터 ETF 가격비를 이용한 구성비 연장 근사
- 데이터 카탈로그 `public/data/reference/indicator-library.json`

### Seed / cached datasets

사용자가 제공한 원본 프로젝트에 이미 있던 다음 자료는 초기 기초자료로 보존합니다.

- 외국인·개인·기관 순매수
- 외국인 보유비중 장기 분기자료
- 한국 반도체 수출 월별자료
- 기존 섹터 세부구성 / 세부 RRG / 대표종목 캐시
- 장기 drawdown 및 legacy macro files

공개·안정적 자동 공급원이 연결되지 않은 자료는 임의 스크래핑으로 덮어쓰지 않고 `cached`로 표시합니다.

## Analysis semantics

### Normalized overlay

- **범위 위치**: 선택 구간의 min/max를 0~100으로 정규화
- **% 변화**: 선택 구간 첫 관측치를 0% 기준으로 누적 변화
- 미국 침체 음영은 NBER Business Cycle Dating chronology를 사용

### RRG

Sector ETF / S&P 500 상대가격을 주간으로 샘플링한 뒤 rolling z-score 기반 RS-Ratio와 RS-Momentum 근사치를 100 중심으로 표시합니다. 방향·회전 관찰용이며 공식 상용 RRG 계산과 동일하다고 주장하지 않습니다.

### Sector composition history

원본의 현재 시가총액 섹터 비중을 고정 앵커로 보존합니다. 이후 구간은 각 섹터 ETF 가격비로 비중 변화를 근사해 연장합니다. 구성종목 편입·퇴출, 발행주식수 변화, 배당은 반영하지 않으므로 UI에 `가격 기반 근사`로 표시합니다.

## GitHub Actions schedules

`.github/workflows/deploy.yml`

- `13,43 * * * *` Asia/Seoul — 30분 snapshot
- `17 7 * * *` Asia/Seoul — daily merge
- `29 4 * * 0` Asia/Seoul — weekly deep backfill

수동 실행 모드:

- `snapshot` — 현재 시장 snapshot만
- `daily` — 최근 daily + FRED + sector ETF 갱신
- `backfill` — 가능한 최대 daily history 병합 + 분석 재계산
- `all` — backfill + snapshot

GitHub의 scheduled workflow는 정확한 실시간 타이머가 아니며 부하 시 지연될 수 있습니다. 매시 00분/30분 대신 13분/43분을 사용해 혼잡 구간을 피합니다.

## First setup / V5 update

1. Repository `Settings → Actions → General → Workflow permissions → Read and write permissions`
2. `Settings → Pages → Source → GitHub Actions`
3. V5 코드 업로드 후 `Actions → Collect market data and deploy MacroDeck → Run workflow → backfill`
4. backfill 성공 후 `snapshot`을 한 번 실행
5. 공개 페이지에서 `Ctrl + Shift + R`로 강력 새로고침

기존 저장소를 V5로 올릴 때는 배포 키트의 `UPLOAD-V5.cmd`를 권장합니다. 이 업로더는 기존 `public/data`를 우선 보존하고 V5 코드만 교체합니다.

## Local development

```bash
npm install
npm run dev
```

Build:

```bash
npm run check
npm run build
```

## Source references

- FRED: https://fred.stlouisfed.org/
- NBER Business Cycle Dates: https://www.nber.org/research/data/us-business-cycle-expansions-and-contractions
- BLS: https://www.bls.gov/
- GitHub Pages / Actions: https://docs.github.com/

Yahoo Finance chart endpoint는 공개 웹 데이터 접근용으로 사용되며 공식 계약형 실시간 시장 데이터 피드가 아닙니다. 공급자 변경·지연·휴장·수정 가능성을 전제로 기존 데이터 비파괴 병합과 실패 보존 정책을 사용합니다.

## Disclaimer

정보 확인·분석 보조용 도구입니다. 투자 조언이 아닙니다.
