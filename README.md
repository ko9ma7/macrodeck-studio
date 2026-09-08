# MacroDeck

**시장 신호를 내 방식대로 배열하는 GitHub Pages용 매크로 대시보드**입니다.

기존 `agt-pf-macro`의 공개 스냅샷 데이터를 그대로 재사용하면서, 별도의 서버 없이 다음 기능을 추가했습니다.

- 사용자 정의 지표 JSON 주입
- 관리자형 Data Studio에서 입력 → `custom-data.json` 다운로드
- GitHub에 데이터 파일을 올리면 다음 Pages 배포부터 자동 반영
- 카드 순서, 숨김, 즐겨찾기, 밀도, 열 수를 사용자 PC(LocalStorage)에 저장
- 중요도 / 변동폭 / 그룹 / 이름 / 사용자 지정 순서 정렬
- 라이트 / 다크 / 시스템 테마
- 반응형 카드 레이아웃
- GitHub Actions 자동 배포

## Preview

- `index.html`: 실제 시장 스냅샷 + 사용자 정의 지표를 합쳐 보여주는 메인 대시보드
- `admin.html`: 사용자 지표를 양식으로 만들고 JSON으로 내려받는 Data Studio

## Data flow

```text
기존 시장 스냅샷 (public/data/*.json)
           +
사용자 생성 파일 (public/data/custom-data.json)
           ↓
      MacroDeck Dashboard
           ↓
개인 보기 설정 → Browser LocalStorage
```

Data Studio는 보안 인증을 제공하는 서버 관리자 페이지가 아니라 **정적 데이터 파일 생성기**입니다. GitHub Pages에 Secret/Token을 넣지 않습니다.

## Features

### Dashboard
- 검색, 그룹 필터
- 내 순서 / 중요도 / 변동폭 / 그룹 / 이름 정렬
- 즐겨찾기 및 즐겨찾기만 보기
- 카드 숨김
- 반응형 자동 열 수 또는 2~6열 고정
- 촘촘하게 / 여유롭게 밀도 선택
- 카드 드래그 및 좌우 순서 이동
- 설정 JSON 백업/복원

### Data Studio
- 지표 이름, 그룹, 표시값, 숫자값, 단위, 변동률, 상태, 색상, 우선순위, 메모, 기준일, 출처, URL, 스파크라인 입력
- 기존 `custom-data.json` 가져오기
- 항목 수정/삭제
- JSON 미리보기/복사
- `custom-data.json` 다운로드

## Project Structure

```text
/
├─ public/
│  ├─ data/                  # 기존 시장 데이터 + custom-data.json
│  ├─ icons/                 # favicon / PWA icon
│  ├─ 404.html
│  ├─ manifest.webmanifest
│  ├─ og-image.png
│  ├─ robots.txt
│  └─ sitemap.xml
├─ src/
│  ├─ admin.js
│  ├─ config.js
│  ├─ data.js
│  ├─ main.js
│  ├─ spark.js
│  ├─ storage.js
│  └─ styles.css
├─ scripts/validate-data.mjs
├─ .github/workflows/deploy.yml
├─ admin.html
├─ index.html
├─ package.json
└─ vite.config.js
```

## Local Development

Node.js 20+ 권장.

```bash
npm install
npm run dev
```

브라우저에서 Vite가 안내하는 로컬 URL로 접속합니다.

## Build

```bash
npm run check
npm run build
```

`dist/`가 생성됩니다.

## 사용자 지표 추가 방법

1. `admin.html`의 Data Studio를 엽니다.
2. 필요한 지표를 추가합니다.
3. `custom-data.json 내려받기`를 누릅니다.
4. 받은 파일을 저장소의 `public/data/custom-data.json`에 덮어씁니다.
5. Commit & Push 합니다.
6. GitHub Actions 배포가 끝나면 메인 대시보드에 자동 표시됩니다.

> 중요: API Secret, Access Token, 비밀번호, 개인 식별정보는 `custom-data.json`에 넣지 마세요. GitHub Pages의 파일은 공개됩니다.

## GitHub Pages Deployment

1. 새 GitHub Repository를 만듭니다. 예: `macrodeck`
2. 이 프로젝트 전체를 업로드합니다.
3. 기본 브랜치를 `main`으로 둡니다.
4. Repository → **Settings → Pages**에서 Source를 **GitHub Actions**로 선택합니다.
5. `main`에 push하면 `.github/workflows/deploy.yml`이 build 및 deploy를 수행합니다.
6. 완료 후 보통 다음 형태의 URL에서 열립니다.

```text
https://USERNAME.github.io/REPOSITORY/
```

Vite `base: './'`를 사용하므로 repository 하위 경로에서도 정적 asset과 data 경로가 동작합니다.

## Configuration

브랜드명/설명 등 앱 설정은 `src/config.js`에서 수정할 수 있습니다.

`public/sitemap.xml`의 `USERNAME`과 `REPOSITORY`는 실제 배포 정보로 교체하세요. Open Graph의 절대 URL이 필요한 경우 `index.html`의 `og:url`, canonical 메타를 실제 주소로 추가하는 것을 권장합니다.

## Custom Domain

커스텀 도메인을 쓸 경우:

1. GitHub Pages 설정에서 Custom domain 등록
2. DNS의 CNAME/A/AAAA 레코드 설정
3. 필요하면 `public/CNAME` 파일에 도메인을 한 줄로 저장
4. HTTPS 강제 적용

## Data source compatibility

프로젝트는 기존 스냅샷의 다음 핵심 파일을 읽습니다.

- `public/data/macro/summary.json`
- `public/data/fed-monitor.json`
- `public/data/fedwatch.json`
- `public/data/meta.json`
- `public/data/custom-data.json`

기존 저장소의 나머지 정적 JSON도 `public/data/`에 보존되어 있어 향후 섹터 로테이션, RRG, 상세 차트 페이지로 확장할 수 있습니다.

## Security

- GitHub Pages는 공개 정적 호스팅입니다.
- 프론트엔드에 GitHub PAT, API Secret, 비밀번호를 넣지 않습니다.
- 현재 Data Studio는 파일을 **다운로드만** 하며 GitHub API로 직접 쓰지 않습니다.
- 브라우저에서 GitHub에 자동 커밋하는 기능이 꼭 필요하다면 OAuth/Serverless 중계 계층을 추가해야 합니다.


## GitHub Pages에서 화면이 HTML처럼만 보일 때

이 프로젝트는 브라우저 네이티브 ES Module + 정적 CSS로 동작합니다. 최신 패키지는 CSS를 HTML에서 직접 로드하므로 별도 번들러가 없어도 UI가 적용됩니다.

권장 배포 설정은 **Settings → Pages → Source → GitHub Actions** 입니다. 저장소 파일을 수정한 뒤 `main`에 push하면 `.github/workflows/deploy.yml`이 `dist/`를 자동 배포합니다.

만약 **Deploy from a branch**를 사용하더라도 대시보드 데이터는 `public/data/` 경로를 자동으로 탐색하도록 호환 처리가 되어 있습니다. 다만 favicon/manifest/OG 자산까지 정확히 배포하려면 GitHub Actions 방식을 권장합니다.

브라우저 캐시에 이전 JS가 남아 있으면 **Ctrl+Shift+R**(macOS: **Cmd+Shift+R**)로 강력 새로고침하세요.

## License

기존 데이터 산출물의 사용 조건과 각 외부 데이터 제공처의 이용 조건을 확인하세요. 새로 작성된 UI/코드는 원하는 라이선스를 선택해 공개할 수 있습니다.
