# 🎭 관극노트 — 뮤지컬 관람 아카이브

뮤지컬 공연을 보고 난 뒤의 기록을 모아두는 개인 아카이빙 사이트입니다.

- **프론트엔드**: GitHub Pages에 배포되는 정적 사이트 (`index.html`)
- **백엔드**: Google Apps Script + 구글 스프레드시트 (`apps-script/Code.gs`)
- **AI**: Google Gemini API — 작품 기본정보 자동입력, 후기 글 다듬기
- **권한**: 글 작성/수정/삭제는 관리자(나)만, 공개 글 열람은 누구나
- 각 기록마다 **공개 / 비공개**를 선택할 수 있습니다.
- 포스터는 **이미지 주소 입력 · 파일 업로드 · 클립보드 붙여넣기(Ctrl+V)** 모두 지원하며,
  업로드한 이미지는 구글 드라이브에 저장됩니다. AI 자동입력 시 공식 포스터 주소를 찾으면 함께 채워줍니다.

---

## 설치 순서

### 1. 스프레드시트 백엔드 만들기 (Apps Script)

1. [Google 스프레드시트](https://sheets.new)를 새로 만듭니다. (이름 예: `관극노트 DB`)
2. 메뉴에서 **확장 프로그램 → Apps Script**를 엽니다.
3. 기본 `Code.gs` 내용을 지우고, 이 리포지토리의 [`apps-script/Code.gs`](apps-script/Code.gs) 내용을 붙여넣고 저장합니다.
4. 왼쪽 **프로젝트 설정(⚙️) → 스크립트 속성 → 속성 추가**:
   - 속성: `ADMIN_TOKEN`
   - 값: 관리자 로그인에 쓸 비밀번호 (길고 추측하기 어려운 문자열 권장)
5. **배포 → 새 배포 → 유형 선택(⚙️) → 웹 앱**:
   - 설명: 자유롭게
   - 실행 계정: **나**
   - 액세스 권한: **모든 사용자**
6. 배포 후 나오는 **웹 앱 URL**(`https://script.google.com/macros/s/…/exec`)을 복사해 둡니다.

> 코드를 수정한 뒤에는 **배포 → 배포 관리 → 수정(연필) → 새 버전**으로 다시 배포해야 반영됩니다.

### 2. Gemini API 키 발급

1. [Google AI Studio](https://aistudio.google.com/apikey)에서 API 키를 발급받습니다.
2. (권장) 키에 **웹사이트 제한**을 걸어 내 GitHub Pages 도메인에서만 쓰이도록 설정합니다.

### 3. GitHub 시크릿 등록

리포지토리 **Settings → Secrets and variables → Actions → New repository secret**:

| 이름 | 값 |
|------|-----|
| `APPS_SCRIPT_URL` | 1번에서 복사한 웹 앱 URL |
| `GEMINI_API_KEY` | 2번에서 발급한 Gemini API 키 |

### 4. GitHub Pages 활성화

1. 리포지토리 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
2. `main` 브랜치에 푸시하면 `.github/workflows/deploy.yml`이 실행되어
   시크릿 값을 `config.js`에 주입한 뒤 사이트를 배포합니다.

### 5. 사용하기

- 배포된 사이트에 접속하면 **공개 글 목록**이 누구에게나 보입니다.
- 우측 상단 **열쇠 아이콘 → ADMIN_TOKEN 입력**으로 관리자 로그인하면
  기록하기 / 수정 / 삭제 / 비공개 글 열람이 가능합니다.
- 새 기록에서 작품명을 입력하고 **AI 자동입력**을 누르면 Gemini가 검색을 통해
  공연장·러닝타임·시놉시스·캐스트·포스터를 채워줍니다.
- 후기를 쓴 뒤 **AI로 다듬기**를 누르면 원문과 다듬은 글을 비교한 후 적용할 수 있습니다.

---

## 데이터 구조

스프레드시트의 `records` 시트에 한 줄 = 한 관람 기록으로 저장됩니다.

| 컬럼 | 설명 |
|------|------|
| `id` | 자동 생성 UUID |
| `title` | 작품명 |
| `venue` | 공연장 |
| `viewDate` | 관람일 (YYYY-MM-DD) |
| `cast` | 캐스트 |
| `seat` | 좌석 |
| `runningTime` | 러닝타임 |
| `synopsis` | 시놉시스 |
| `rating` | 평점 (0~5, 0.5 단위) |
| `review` | 관람 후기 |
| `posterUrl` | 포스터 이미지 URL |
| `isPublic` | 공개 여부 (TRUE/FALSE) |
| `createdAt` / `updatedAt` | 생성/수정 시각 |

같은 작품을 여러 번 보면 사이트에서 자동으로 **N차 관람** 배지가 붙습니다.

## 알아두면 좋은 점

- **Gemini API 키는 정적 사이트에 주입되므로 방문자가 볼 수 있습니다.**
  반드시 Google AI Studio에서 웹사이트(HTTP 리퍼러) 제한을 걸고, 무료 할당량 내에서 사용하세요.
  키가 노출되어 문제가 되면 즉시 폐기하고 재발급하면 됩니다.
- `ADMIN_TOKEN`은 사이트에 포함되지 않으며, 글 쓰기 요청 때만 전송되어 Apps Script에서 검증됩니다.
- 관리자 로그인 후 **설정(⚙️)**에서 이 브라우저에만 적용되는 URL/키를 임시로 넣어
  배포 전에 로컬 테스트를 할 수도 있습니다.
