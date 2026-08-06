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

### 릴리즈 체크리스트

`develop` → `main` PR 을 올리기 전에 확인한다. 1번은 **CI 가 강제**하므로 잊어도
develop 대상 PR 이 빨간불로 알려 준다.

1. **릴리즈 아티팩트가 `main` 과 맞는가** — `./scripts/check-release-sync.sh`.
   어긋나면 `./scripts/sync-release-artifacts.sh` 로 맞추고 커밋한다
2. 열린 PR 중 `develop` 에 들어가야 할 것이 남아 있지 않은가
3. `docs/IMPLEMENTATION_AUDIT.md` 가 코드와 맞는가
   (`docs/API.md` · `docs/DATA_MODEL.md` 는 **CI 가 강제**한다 — 아래 «문서 업데이트 체크» 참조)

머지 후 release-please 가 `main` 에 릴리즈 PR 을 연다. 그 PR 이 머지되면
**아티팩트가 다시 어긋나므로** 1번이 develop 에서 빨간불이 된다 — 그때 동기화한다.
그 순환이 이 절차의 전부다.

#### 왜 CI 로 강제하나

release-please 는 `main` 에서만 돈다. 릴리즈마다 `main` 의 네 파일이 올라가는데 그
커밋이 `develop` 으로 돌아오지 않는다. 이 문서는 예전부터 "릴리즈 후 두 브랜치를
동기화해 두면 대부분 예방된다" 고 적어 뒀지만 **사람이 기억해서 하는 일이라 0.7.0 ·
0.8.0 · 0.9.0 세 번 연속 놓쳤다.** develop 이 0.6.0 에 멈춘 채 102 커밋이 쌓였다.

규칙을 문서에 적는 것과 지켜지게 만드는 것은 다르다. 그래서 검사를 CI 에 넣었다.

### bypass 사용 조건

소유자 bypass는 열려 있으나 **일상적인 우회 수단이 아니다.** 아래 경우에 한해 사용하고, 사용했다면 그 사실과 사유를 관련 이슈나 PR에 남긴다.

1. `develop` → `main` 릴리즈 머지에서 release-please 아티팩트(`package.json`, `.release-please-manifest.json`, `CHANGELOG.md`, `package-lock.json`)가 충돌해 로컬 해결이 필요하고, feature 브랜치를 경유하는 경로로는 해소되지 않는 경우
2. CI 인프라 자체의 장애로 필수 status check가 영구 대기 상태에 빠져, 코드 변경과 무관하게 머지가 막힌 경우
3. 보안 사고 대응 등 긴급 상황에서 정상 절차를 밟을 시간이 없는 경우

**단순히 절차가 번거롭다는 이유로는 사용하지 않는다.** 위 1번은 `develop` 과 `main` 의 버전 매니페스트가 어긋날 때 발생하므로, 릴리즈 후 두 브랜치를 동기화해 두면 대부분 예방된다.

## 문서 업데이트 체크

- 기능을 추가하거나 변경할 때, 관련 문서(`docs/API.md`, `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md` 등)를 함께 업데이트했는지 PR 전에 확인한다. `CHANGELOG.md` 는 release-please 가 만들므로 손으로 고치지 않는다. 진행 상태는 GitHub 마일스톤·이슈가 정본이라 문서에 따로 적지 않는다.

### 무엇이 CI 로 강제되나

**이 절의 체크리스트는 세 번 실패했다**(#33, FND-17, 그리고 릴리즈 체크리스트 3번). 그래서 기계가 볼 수 있는 것은 기계에 넘겼다.

| 문서 | 수단 | 무엇을 보는가 |
|---|---|---|
| `docs/ARCHITECTURE.md` | `npm run docs:inventory:check` | 라우트·서비스·페이지·컴포넌트·마이그레이션 **목록을 생성**해 대조 |
| `docs/API.md` | `npm run docs:check` | 마운트된 라우트마다 `## <파일명>` 절이 있는가 |
| `docs/DATA_MODEL.md` | `npm run docs:check` | `CREATE TABLE` 되는 표가 문서에 나오는가 |
| `docs/GUIDE.md` | 아직 없음 | #490 이 내용을 채운 뒤 켠다 (`scripts/check-docs.js` 주석 참조) |

`docs:check` 가 보는 것은 **존재 여부까지**다. API.md 는 엔드포인트마다 요청·응답을 적는 문서이고 DATA_MODEL.md 는 컬럼과 관계를 설명하는 문서라, 본문을 코드에서 만들어 낼 수 없다. 만들 수 있는 척하면 "자동 생성됨" 표시만 붙은 빈 껍데기가 된다. **내용이 맞는지는 사람이 본다 — 다만 통째로 빠지는 것은 막는다.**

새 표를 만들었는데 문서에 실릴 성격이 아니면 `scripts/check-docs.js` 의 `TABLE_EXCLUDE` 에 **이유와 함께** 더한다.

## 문서 변경 승인 게이트 (confirm-chain)

`docs/audit/`, `docs/design/`, `docs/decisions/` 아래 문서는 **커밋 훅으로 승인 게이트가 걸려 있다.** 감사 보고서·설계 문서·ADR은 되돌리기 어렵고 다른 결정의 근거가 되므로, 승인 없이 조용히 들어가는 것을 막는다.

감시 경로는 `.confirm-chain-paths`에 있다.

### 최초 1회 설치

훅 자체(`.githooks/`)는 저장소에 포함되지만, **`core.hooksPath` 설정은 로컬 설정이라 clone 후 한 번 실행해야 한다.**

```bash
<confirm-chain 경로>/install-hooks.sh .
```

`confirm-chain`은 공통 프로세스 레포(`little-jotjotsaw-base`)의 `tools/confirm-chain`에 있다. 설치 스크립트가 도구 경로를 `git config confirmchain.dir`(로컬)에 기록하므로 절대경로가 커밋되지 않는다.

### 커밋이 막혔을 때

훅이 승인 절차 명령을 그대로 출력한다. 요약하면:

```bash
cd <confirm-chain 경로>
poetry run python3 confirm_chain.py process_doc '<변경 요약>' --thread <스레드> --db <저장소>/.confirm-chain.sqlite
poetry run python3 confirm_chain.py --resume approve --thread <스레드> --db <저장소>/.confirm-chain.sqlite
```

스레드 ID는 **스테이징된 변경 내용의 해시**다. 문서를 한 글자라도 고치면 새 스레드가 되므로 이전 승인이 자동 무효화된다.

### 우회

`git commit --no-verify`로 건너뛸 수 있다. 다만 통과한 커밋에만 `Doc-Approval:` 트레일러가 붙으므로 우회 이력은 사후에 그대로 드러난다.

```bash
git log --format='%h %s%n  %(trailers:key=Doc-Approval)' -- docs/audit
```

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
