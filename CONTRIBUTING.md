# 기여 가이드

## 브랜치 전략

- `main` — production 브랜치. 직접 push 금지. **저장소 설정(브랜치 보호 규칙)으로 강제된다** — 아래 «브랜치 보호 규칙» 참조.
- `develop` — GitHub 저장소의 기본 브랜치(default branch). 통합 브랜치 역할을 한다. 브랜치 보호는 걸려 있지 않다.
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

## 브랜치 보호 규칙

이 문서의 브랜치 정책은 문서상 규정에 그치지 않고 저장소 설정으로 강제된다. 보호 대상은 `main` 하나이며, `develop` 에는 아무 제한도 걸지 않는다.

### `main` 에 적용된 설정

| 설정 | 값 | 효과 |
|---|---|---|
| Require a pull request before merging | 켬 (필요 승인 0) | `main` 직접 push 차단 |
| Require status checks to pass | `ci`, `validate-title` | CI 실패 상태로 머지 불가 |
| Require conversation resolution | 켬 | 미해결 리뷰 코멘트가 있으면 머지 불가 |
| Block force pushes | 켬 | `main` 히스토리 재작성 차단 |
| Restrict deletions | 켬 | `main` 삭제 차단 |
| Do not allow bypassing (`enforce_admins`) | **끔** | 저장소 소유자는 위 규칙을 우회할 수 있다 |

필요 승인 수를 0으로 둔 것은 1인 저장소이기 때문이다. PR을 경유하는 절차 자체는 강제하되, 자신의 PR에 셀프 승인을 요구하지는 않는다.

### `develop` 은 보호하지 않는다

`develop` 으로의 직접 push와 force push는 지금까지와 동일하게 가능하다. 통합 브랜치의 유연함을 유지하기 위한 의도적 선택이며, 실수의 여파는 `main` 보호에서 걸러진다.

### bypass 사용 조건

소유자 bypass는 열려 있으나 **일상적인 우회 수단이 아니다.** 아래 경우에 한해 사용하고, 사용했다면 그 사실과 사유를 관련 이슈나 PR에 남긴다.

1. `develop` → `main` 릴리즈 머지에서 release-please 아티팩트(`package.json`, `.release-please-manifest.json`, `CHANGELOG.md`, `package-lock.json`)가 충돌해 로컬 해결이 필요하고, feature 브랜치를 경유하는 경로로는 해소되지 않는 경우
2. CI 인프라 자체의 장애로 필수 status check가 영구 대기 상태에 빠져, 코드 변경과 무관하게 머지가 막힌 경우
3. 보안 사고 대응 등 긴급 상황에서 정상 절차를 밟을 시간이 없는 경우

**단순히 절차가 번거롭다는 이유로는 사용하지 않는다.** 위 1번은 `develop` 과 `main` 의 버전 매니페스트가 어긋날 때 발생하므로, 릴리즈 후 두 브랜치를 동기화해 두면 대부분 예방된다.

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
