# 기여 가이드

## 브랜치 전략

- `main` — production 브랜치. 직접 push 금지.
- `develop` — GitHub 저장소의 기본 브랜치(default branch). 통합 브랜치 역할을 한다.
- `feature/issue-number-description` — 기능 개발용 (예: `feature/12-add-export`)
- `fix/issue-number-description` — 버그 수정용
- `chore/description` — 설정/문서/인프라 변경용
- 모든 변경은 PR을 통해 develop에 머지한다 (squash merge).
- `develop` → `main` 으로의 PR은 릴리즈 준비가 됐을 때만 진행한다 (이 시점에 release-please가 동작).

브랜치 전략 흐름:

- feature/* → develop (PR, 자유롭게 머지)
- develop → main (릴리즈 타이밍 조절, release-please 트리거)

## 커밋 컨벤션

- Conventional Commits 규칙을 따른다: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`, `test:` 등의 prefix 사용.
- 커밋 메시지는 "왜"를 설명하는 데 집중한다 (관례적인 좋은 커밋 메시지 작성 원칙 간단히 언급).

## PR 생성 방법

- `gh pr create` 또는 GitHub 웹 UI로 PR을 생성한다.
- PR 제목은 커밋 컨벤션과 동일한 prefix 규칙을 따른다.
- PR 본문에는 변경 요약과 관련 이슈 번호(`closes #N`)를 포함한다.
- GitHub 저장소 기본 브랜치는 `develop`으로 변경되었으므로, `feature/*`, `fix/*`, `chore/*` 브랜치의 PR은 base를 별도로 지정하지 않아도 자동으로 `develop`을 가리킨다. `develop` → `main` 으로의 릴리즈 PR은 반드시 `gh pr create --base main` 또는 GitHub UI에서 base를 `main`으로 수동 지정해야 한다.

## PR 머지 주체

- **PR 머지는 항상 저장소 소유자(사용자)가 직접 수행한다.** 자동 머지나 제3자 머지는 하지 않는다.

## 문서 업데이트 체크

- 기능을 추가하거나 변경할 때, 관련 문서(`docs/API.md`, `docs/DATA_MODEL.md`, `docs/ROADMAP.md`, `CHANGELOG.md` 등)를 함께 업데이트했는지 PR 전에 확인한다.

## 로컬 QA

- PR을 올리기 전에 반드시 로컬에서 `npm run build`(루트에서 실행하면 클라이언트 빌드까지 수행)를 실행해서 빌드가 깨지지 않는지 확인한다.
- 백엔드 변경 시 `node --check <file>`로 문법 오류가 없는지 확인하는 것을 권장한다.

## 이슈 라벨 기준

다음은 이 저장소에서 사용하는 이슈 라벨 체계입니다. 이 라벨 체계는 horror-story-generator 저장소의 priority 라벨 체계(P1/P2/P3)를 기준으로 통일했습니다.

| 라벨 | 색상 | 설명 |
|------|------|------|
| P1-high | #b60205 | 높은 우선순위 — 프로덕션 장애, 보안 이슈, 다음 배포를 막는 버그 등 즉시 처리 필요한 이슈 |
| P2-medium | #ff9f1c | 보통 우선순위 — 다음 릴리즈에 포함되어야 하는 기능/개선, CI·문서화 등 중요하지만 급하지 않은 작업 |
| P3-low | #0e8a16 | 낮은 우선순위 — 여유 있을 때 처리, 기술 부채, 사소한 개선 |

이슈 생성 시 반드시 해당하는 type 라벨(bug/feature/chore/docs 등)과 priority 라벨(P1-high/P2-medium/P3-low)을 동시에 부여해야 합니다. 라벨 없는 이슈 생성은 금지합니다.
