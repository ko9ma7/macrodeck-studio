# MacroDeck V3

GitHub Pages에서 동작하는 **정적 매크로 시장 모니터**입니다. 브라우저가 외부 금융 API를 직접 호출하지 않고, GitHub Actions가 시장 데이터를 수집해 저장소의 JSON으로 누적한 뒤 Pages를 배포합니다.

관리자용 Data Studio는 공개 화면에 링크를 두지 않으며 다음 주소로 직접 접근합니다.

```text
https://USERNAME.github.io/REPOSITORY/admin.html
```

## V3 핵심 기능

### 1. UI 스타일을 즉시 바꿔 보기

상단 `UI` 선택에서 아래 8개 CSS 디자인을 즉시 전환할 수 있습니다. 선택값은 현재 PC/브라우저 LocalStorage에 저장됩니다.

- Monitor — 기본 매크로 모니터
- Terminal — 다크 트레이딩 터미널
- Swiss — 정돈된 스위스 그리드
- Editorial — 경제 리포트/신문형
- Blueprint — 테크니컬 블루프린트
- Glass — 글래스/반투명 패널
- Cyber — 다크 네온 그리드
- Ledger — 금융 원장/리서치 데스크

CSS 파일은 각각 `src/themes/*.css`로 분리되어 있어 원하는 스타일만 직접 수정하기 쉽습니다.

색상 모드는 별도로 `시스템 / 라이트 / 다크`를 선택할 수 있습니다. Terminal/Cyber처럼 본질적으로 다크한 스타일은 디자인 특성상 다크 팔레트를 우선합니다.

### 2. 현재값과 과거자료를 분리해서 저장

V3의 데이터는 세 층으로 나뉩니다.

```text
30분 스냅샷
public/data/archive/intraday/YYYY-MM.json

일별/월별 누적 시계열
public/data/history/<series-id>.json

현재 대시보드용 요약
public/data/macro/summary.json
public/data/fed-monitor.json
```

즉 매번 과거 전체 데이터를 다시 브라우저에 보내는 구조가 아닙니다.

- 첫 대시보드: 짧은 90일 파일을 사용해 빠르게 표시
- 카드 상세 7/30/90/365일: 기간별 정적 JSON 사용
- `전체`: `data/history/<id>.json`의 누적 이력을 **필요할 때만** 로드
- `24시간`: GitHub Actions가 누적한 intraday 월별 스냅샷에서 최근 24시간만 추출

### 3. 기존 누적 데이터도 Canonical History Store로 이전

기존 `chart__days=...` 파일을 버리지 않고 `scripts/migrate_legacy_history.py`로 새로운 `public/data/history/` 저장소에 병합했습니다.

현재 프로젝트 ZIP 자체에 이미 **21개 시계열 / 약 59,000개 관측치**가 들어 있습니다. 최초 배포 후 `backfill`을 한 번 실행하면 Yahoo/FRED에서 접근 가능한 과거 구간을 추가로 확장합니다.

```text
public/data/history/
├─ treasury-10y.json
├─ treasury-2y.json
├─ real-10y.json
├─ usdkrw.json
├─ dxy.json
├─ ndx.json
├─ spx.json
├─ kospi.json
├─ sox.json
├─ gold.json
├─ oil.json
├─ core-cpi.json
├─ unemployment.json
├─ wages.json
├─ credit.json
├─ bei.json
└─ catalog.json
```

`catalog.json`에는 각 시계열의 시작일·종료일·관측치 수·출처·빈도가 기록됩니다.

## 데이터 수집 방식 — 실시간 API인가?

**진짜 실시간 스트리밍은 아닙니다.**

GitHub Pages는 정적 호스팅이고 GitHub Actions는 예약 실행 기반이므로 구조는 다음과 같습니다.

```text
외부 데이터 소스
      ↓
GitHub Actions polling
      ↓
정적 JSON 저장 / Git commit
      ↓
GitHub Pages deploy
      ↓
사용자는 저장된 최신 JSON 조회
```

시장 지표는 Yahoo Finance chart endpoint의 5분 봉에서 마지막 관측치를 읽어 **30분마다 한 번 저장**합니다. 실제 거래소 실시간 피드가 아니므로 공급자 지연·휴장·프리/애프터마켓 상태에 따라 최신 시각이 달라질 수 있습니다.

FRED의 금리·물가·고용 데이터는 원래 일별/월별 발표 데이터이므로 30분마다 다시 요청하지 않고 일별 history 작업에서 갱신합니다.

진짜 초단위/틱 단위 실시간이 필요하다면 GitHub Pages + Actions가 아니라 실시간 데이터 계약 + 백엔드/웹소켓 구조가 필요합니다.

## GitHub Actions 수집 주기

`.github/workflows/deploy.yml`에 세 종류의 수집을 넣었습니다.

### Snapshot — 30분

```text
매시 13분 / 43분 (Asia/Seoul)
```

현재값을 수집하고 다음과 같이 **월 단위 파일에 계속 누적**합니다.

```text
public/data/archive/intraday/2026-09.json
public/data/archive/intraday/2026-10.json
...
```

과거 월 파일을 삭제하지 않으므로 저장소에 계속 남습니다.

GitHub Actions 자체는 더 짧은 cron도 지원하지만, 금융 데이터 공급자 호출·Git commit 수·Pages 배포 빈도·저장소 증가량을 같이 고려하여 기본값을 30분으로 잡았습니다. 매시 정각과 30분 정시 대신 13/43분을 사용하여 예약 워크플로 혼잡도 피합니다.

### Daily history — 1일 1회

```text
매일 07:17 Asia/Seoul
```

- Yahoo: 최근 2년 일봉을 다시 가져와 기존 이력과 `date` 기준 병합
- FRED: 전체 공식 시계열을 읽어 기존 이력과 병합
- Core CPI YoY / 임금 YoY 재계산
- HYG/LQD 파생 시계열 갱신
- 기존 `chart__days=...` 호환 파일 갱신

기존 과거 관측치는 삭제하지 않습니다.

### Deep backfill — 주 1회

```text
매주 일요일 04:29 Asia/Seoul
```

Yahoo에서 가능한 `range=max`와 FRED 전체 이력을 사용해 누락 구간이나 과거 수정치를 복구합니다.

이미 저장된 데이터가 동일하면 canonical history 파일을 다시 쓰지 않도록 하여 불필요한 Git diff를 줄였습니다.

## 최초 배포 후 권장 작업

GitHub에서 저장소를 올린 다음 한 번만 다음 작업을 실행하면 좋습니다.

```text
Actions
→ Collect market data and deploy MacroDeck
→ Run workflow
→ mode: backfill
```

그러면 현재 ZIP에 들어 있는 누적 데이터와 공급자에서 가져온 최대 과거자료가 `date` 기준으로 합쳐집니다.

## 수집 소스

### Yahoo Finance chart

- 미국 10년물
- USD/KRW
- DXY
- Nasdaq 100
- S&P 500
- KOSPI
- SOX
- Gold
- WTI
- Oracle
- VIX
- HYG/LQD 파생 비율
- 미국 섹터 ETF 성과

Yahoo chart endpoint는 별도 키 없이 접근 가능한 endpoint를 사용하지만 공식 계약형 실시간 API로 간주하지 않습니다. 실패하면 기존 JSON을 보존합니다.

### FRED

- 미국 2년물
- 미국 10년 실질금리
- 10년 기대인플레이션
- 10Y-2Y
- High Yield OAS
- Effective Fed Funds
- Core CPI
- 실업률
- 시간당 임금

## 아직 자동 생성하지 않는 기존 항목

원본 자료에는 생성 로직이나 인증 조건이 포함되지 않은 데이터가 있습니다. 이런 데이터는 임의로 다른 값으로 덮어쓰지 않습니다.

예:

- FedWatch 확률
- 한국 투자자 수급
- 관세청 반도체 수출
- 특정 방식으로 계산한 섹터 구성 데이터

해당 항목은 Data Studio에서 정적 JSON으로 넣거나, 정확한 공식 데이터 소스를 정한 뒤 collector 모듈을 추가하는 방식이 안전합니다.

## 사용자 PC에 저장되는 설정

서버 계정 없이 LocalStorage에 저장됩니다.

- UI 스타일
- 라이트/다크/시스템
- 카드 순서
- 즐겨찾기
- 숨긴 카드
- 정렬
- 카드 밀도
- 열 수

`설정 내보내기 / 가져오기`로 JSON 백업도 가능합니다.

## GitHub Pages 설정

1. ZIP 내부 파일을 저장소 루트에 업로드합니다.
2. `Settings → Pages → Build and deployment → Source`를 **GitHub Actions**로 설정합니다.
3. `Settings → Actions → General → Workflow permissions`에서 **Read and write permissions**를 허용합니다.
4. Branch protection이 `github-actions[bot]`의 데이터 commit을 차단하지 않는지 확인합니다.
5. Actions에서 `backfill`을 1회 수동 실행합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

## 검증

```bash
npm run check
npm run build
python -m py_compile scripts/update_market_data.py
```

## 수동 데이터 수집

```bash
# 가벼운 현재값 수집
python scripts/update_market_data.py --data-dir public/data --mode snapshot --snapshot-minutes 30

# 최근 일별 + FRED 전체 병합
python scripts/update_market_data.py --data-dir public/data --mode daily

# 최대 과거자료 백필
python scripts/update_market_data.py --data-dir public/data --mode backfill
```

## 주요 구조

```text
/
├─ index.html
├─ admin.html
├─ src/
│  ├─ main.js
│  ├─ data.js
│  ├─ theme-manager.js
│  ├─ styles.css
│  └─ themes/
│     ├─ monitor.css
│     ├─ terminal.css
│     ├─ swiss.css
│     ├─ editorial.css
│     ├─ blueprint.css
│     ├─ glass.css
│     ├─ cyber.css
│     └─ ledger.css
├─ scripts/
│  ├─ update_market_data.py
│  ├─ migrate_legacy_history.py
│  ├─ validate-data.mjs
│  └─ build.mjs
├─ public/data/
│  ├─ history/
│  ├─ archive/intraday/
│  ├─ macro/
│  └─ collection-meta.json
└─ .github/workflows/deploy.yml
```

## 운영상 주의

- GitHub scheduled workflows는 정확한 초/분 실행을 보장하는 실시간 스케줄러가 아닙니다.
- 예약 작업은 GitHub Actions 혼잡 시 지연될 수 있습니다.
- 공개 저장소가 장기간 비활성 상태이면 GitHub가 scheduled workflow를 비활성화할 수 있습니다.
- 민감한 API key/토큰은 GitHub Pages 프론트엔드 코드에 넣지 마세요. 인증이 필요한 공급자는 GitHub Secrets 또는 별도 서버/Serverless proxy를 사용해야 합니다.
