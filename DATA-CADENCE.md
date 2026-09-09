# MacroDeck V5 데이터 갱신 주기

MacroDeck의 상단 `스냅샷 30분`은 **모든 카드 값이 30분마다 반드시 바뀐다는 뜻이 아닙니다.** GitHub Actions가 30분마다 시장성 공급원을 확인한다는 뜻입니다.

## 1. 30분 snapshot 대상

다음 시리즈는 Yahoo chart의 5분봉 마지막 관측값을 읽습니다.

- USD/KRW
- Dollar Index
- Nasdaq 100
- S&P 500
- KOSPI
- SOX
- Gold Futures
- WTI Futures
- Oracle
- VIX
- US 10Y Treasury proxy (`^TNX`)

저장 위치:

```text
public/data/archive/intraday/YYYY-MM.json
```

동일 30분 bucket에서 재실행되면 마지막 값을 교체합니다. 장 마감/휴장으로 공급자 timestamp와 값이 이전 실행과 완전히 같으면 불필요한 중복 포인트를 추가하지 않습니다.

## 2. 왜 30분마다 값이 모두 변하지 않는가

### 거래시간이 다름

- KOSPI는 한국 거래시간 중심으로 변합니다.
- S&P 500 / Nasdaq / VIX / 미국 개별주는 미국 거래시간 중심입니다.
- Gold/WTI 선물은 대부분의 평일에 더 긴 시간 거래되지만 일일 정산/휴장 구간이 있습니다.
- FX와 Dollar Index도 주말에는 멈춥니다.

따라서 한국 오전에 미국 현물지수가 멈춰 있거나, 미국 장중에 KOSPI가 그대로인 것은 정상입니다.

### FRED/BLS 데이터는 원래 intraday가 아님

다음은 시간별로 갱신할 데이터가 아닙니다.

- US 2Y Treasury (FRED DGS2): daily
- 10Y real yield: daily
- 10Y breakeven: daily
- 10Y-2Y spread: daily
- High Yield OAS: daily
- Effective Fed Funds Rate: daily
- Core CPI: monthly
- Unemployment: monthly
- Wages: monthly

이들은 `daily` Action에서 갱신하며, 새 발표가 없으면 값이 그대로 유지됩니다.

## 3. 24시간 차트가 비어 있을 수 있는 이유

24시간 차트는 과거 daily history가 아니라 `archive/intraday`를 읽습니다. 따라서 V5 snapshot 수집을 시작한 직후에는 0~1개 포인트일 수 있습니다.

시간이 지나면서 자동으로:

```text
09:13 → 09:43 → 10:13 → 10:43 → ...
```

처럼 새 공급자 관측치가 쌓입니다.

`backfill`은 수년치 daily history를 채우지만 수년치 intraday 5분/30분 데이터를 소급 수집하지 않습니다. Git 저장소 크기와 Actions 비용을 통제하기 위한 의도적인 설계입니다.

## 4. 자동 실행 일정

```text
매시 13분 / 43분    snapshot
매일 07:17          daily
일요일 04:29        backfill
```

시간대: `Asia/Seoul`

GitHub Actions schedule은 실시간 스케줄러가 아니므로 몇 분 지연될 수 있습니다.

## 5. 데이터 확인 방법

- `catalog.html`: 지표별 공급원 / 빈도 / 기간 / 포인트 / 수집 방식
- `public/data/status.json`: 최근 실행 성공/실패 공급원
- `public/data/collection-meta.json`: 최근 실행 모드와 누적 포인트
- `public/data/archive/intraday/index.json`: intraday 월 목록
- `public/data/archive/intraday/YYYY-MM.json`: 실제 30분 snapshot 기록
