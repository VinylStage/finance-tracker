# 위임 하네스

로컬 모델(Aider + Ollama)에 기계적 편집을 맡길 때 쓰는 스크립트다. `#379` 에서
테스트 파일 23개를 이관하며 만들었고, 그 과정에서 나온 사고마다 가드가 하나씩 붙었다.

이 디렉터리에 있기 전에는 세션 스크래치패드에만 있었다. 세션이 끝나면 사라지는
자리라 저장소로 옮겼다.

## 구성

기계적 편집(기존 파일의 찾기/바꾸기)과 생성(새 테스트 파일 쓰기)은 러너가 다르다.

| 파일 | 하는 일 |
|---|---|
| `make-spec.py` | 파일에서 바꿀 조각만 뽑아 찾기/바꾸기 명세를 만든다 |
| `dry-run.py` | 그 명세를 직접 적용해 테스트가 통과하는지 본다. **위임 전에 돌린다** |
| `run-batch.sh` | 명세로 Aider 를 돌리고 검수한다. 실패하면 사유를 되던져 재시도 |
| `run-new-batch.sh` | **새** 테스트 파일을 쓰게 하고 검수한다. 클라이언트는 vitest, 서버는 `node --test` |
| `mutate-client.py` | 소스를 일부러 망가뜨려 그 테스트가 잡는지 본다 |

## 환경변수

| 변수 | 기본값 |
|---|---|
| `DELEGATE_REPO` | 이 스크립트 위치에서 거슬러 올라간 저장소 루트 |
| `DELEGATE_WORK` | `mktemp -d` — 명세·로그가 쌓이는 곳 |
| `DELEGATE_METRICS` | `DELEGATE_WORK` — 측정값(`numstat-*.tsv`)을 따로 모을 곳 |
| `MIN_TESTS` | `5` — 이보다 적으면 껍데기로 보고 실패시킨다 |
| `DELEGATE_ISSUE` | **필수.** 이 라운드가 속한 이슈/PR 번호 |
| `DELEGATE_MODEL` | `ollama_chat/qwen3-coder:30b` — 원장에 남길 모델 이름 |
| `DELEGATE_TARGET_KIND` | `client` — 검수 방식. 서버 테스트를 신설할 때만 `server` |

## 순서

```bash
export DELEGATE_WORK=$(mktemp -d -t delegate)
export DELEGATE_ISSUE=526   # 없으면 러너가 시작하지 않는다

# 1. 명세를 만든다
python3 scripts/delegate/make-spec.py 1 test/aRoute.test.js test/bRoute.test.js

# 2. 명세가 옳은지 먼저 확인한다 — 이 단계를 건너뛰면 20분을 버린다
python3 scripts/delegate/dry-run.py 1 test/aRoute.test.js test/bRoute.test.js

# 3. 위임한다
scripts/delegate/run-batch.sh 1 "$DELEGATE_WORK" test/aRoute.test.js test/bRoute.test.js
```

2단계에서 실패하면 명세가 틀린 것이다. 고치고 다시 잰다. `#379` 에서 이 단계 없이
세 번 돌려 각각 20분씩 버렸다.

### 새 클라이언트 테스트를 쓰게 할 때

찾기/바꾸기 명세가 없으므로 `make-spec.py` 와 `dry-run.py` 는 쓰지 않는다.
대신 **시나리오를 번호로 적은 산문 명세**를 직접 쓰고 러너에 넘긴다.

```bash
export DELEGATE_WORK=$(mktemp -d -t delegate)
export DELEGATE_ISSUE=526   # 없으면 러너가 시작하지 않는다

MIN_TESTS=8 scripts/delegate/run-new-batch.sh \
  debts /abs/path/spec-debts.md \
  client/src/pages/Debts.test.jsx \
  client/src/pages/Debts.jsx          # 뒤는 전부 읽기 전용으로 붙는다

# 통과한 뒤, 그 테스트가 진짜로 잡는지 되짚는다
python3 scripts/delegate/mutate-client.py \
  src/pages/Debts.jsx src/pages/Debts.test.jsx \
  "#329 판정 되돌리기" "d.loan_type === 'credit_line'" "d.type === '마이너스통장'"
```

### 새 서버 테스트를 쓰게 할 때

`DELEGATE_TARGET_KIND=server` 를 준다. 나머지는 같다.

```bash
DELEGATE_TARGET_KIND=server MIN_TESTS=8 scripts/delegate/run-new-batch.sh \
  savings /abs/path/spec-savings.md \
  test/savingsRoute.test.js \
  src/routes/savings.js
```

검수만 갈린다 — `node --test <파일>` 을 돌리고 `ℹ pass N` · `ℹ fail 0` 요약줄로
판정한다. **요약줄이 아예 없으면 통과가 아니라 "테스트가 돌지 않은 것"** 으로 본다.
import 가 깨져 파일이 로드조차 안 되면 실패 문자열도 안 나오기 때문이다.

테스트 개수는 `it(` 과 `test(` 를 둘 다 센다. 서버 테스트는 `node:test` 라
`test(` 를 주로 쓴다.

명세에 적어야 하는 것이 클라이언트와 다르다.

- 서버 테스트는 `mkdtemp` 로 임시 DB 를 만들고 `DB_PATH` 로 주입한다. 실거래 DB 에
  닿지 않게 하는 규칙이라 명세에 그 뼈대를 그대로 적는다
- HTTP 를 태우는 테스트는 `test/helpers/testServer.js` 의 `startTestServer({ port })`
  를 쓴다. **포트를 명세에 박고, 겹치지 않는 값인지 `npm run test:ports` 로 먼저 확인한다**
- 파일 위치는 `test/` 다. `client/` 안에 두면 vitest 쪽으로 샌다

명세에 **반드시 적어야 하는 것** — 빠뜨려서 라운드를 버린 것들이다.

- 이 저장소에는 `@testing-library/jest-dom` 이 없다. `toBeInTheDocument()` 를
  쓰면 `Invalid Chai property` 로 전부 실패한다
- 목록은 비동기로 온다. `getByText` 가 아니라 `await findByText` 로 기다린다
- 자료의 값이 서로 겹치지 않게 한다. 부채명을 `'마이너스통장'` 으로 두면
  타입 배지와 글자가 같아 `getByText` 가 둘을 찾아 실패한다

## 가드가 있는 이유

전부 실제로 당한 것들이다.

| 가드 | 무엇을 막나 |
|---|---|
| `ollama_ready` | 서버가 죽은 채로 백오프만 돌다 빈손으로 끝나는 것 |
| `free_ports` | 죽인 실행이 남긴 서버가 포트를 물고 있어, 새 테스트가 데이터가 쌓인 옛 서버에 붙는 것 |
| `snapshot_before` + `scope_check` | 모델이 배치 밖 파일을 고치는 것. `--yes` 는 모델이 제안한 파일을 확인 없이 추가한다 |
| 스냅샷을 **내용 해시**로 뜬다 (#580) | 이미 ` M` 인 파일이 더 망가지는 것. 경로만 비교하던 예전 검사는 428줄이 지워져도 before·after 가 글자 그대로 같아 통과시켰다 — 그렇게 같은 파일을 두 번 잃었다 |
| `baseline` | **테스트를 지우고 통과하는 것.** 헬퍼만 import 한 빈 껍데기는 구조 검사를 전부 만족하고 `node --test` 도 통과한다 |
| 줄수 상한 | 정상 절감폭을 넘는 삭제 |
| `record_numstat` | 위임비율 분자를 추정으로 적는 것 |
| `spec=${spec:A}` | 러너가 저장소로 `cd` 한 뒤 상대경로 명세를 못 찾는 것. aider 는 한 줄만 찍고 **지시 없이** 대화형으로 들어간다 |
| stdin 파이프 | 백그라운드에서 fd 0 이 정규 파일이면 aider 가 kqueue 등록에 실패해 죽고, 그 예외 루프가 로그를 37MB 로 불린다 |
| `acquire_lock` | 같은 라벨 실행이 겹쳐 **서로의 스냅샷을 덮어쓰는 것.** 좀비가 된 실행이 남의 산출물을 stray 로 보고 지웠다 |
| 라운드마다 `snapshot_before` | 시작 시 한 번만 뜨면 그 뒤 남이 만든 파일이 전부 "내가 만든 stray" 로 보인다 |
| `mutate-client.py` 의 요약줄 검사 | 리포터 이름이 틀려 테스트가 **안 돈 것**을 "돌연변이를 못 잡았다" 로 읽는 것 |

`baseline` 이 없던 시절 모델이 489줄 파일을 33줄로 만들며 테스트 16개를 전부
지웠는데 검수가 "통과" 를 찍었다. 구조 조건만 보면 삭제형 실패를 구조적으로 못 잡는다.

## 측정값

라운드마다 `DELEGATE_WORK` 에 남는다.

```
numstat-<배치>-<라운드>.tsv   그 라운드의 git diff --numstat
numstat-summary.tsv           배치·라운드별 추가/삭제 누적
aider-batch<배치>.log         Aider 출력 전체
harness-<배치>.log            검수 결과
```

위임비율을 적을 때 **이 파일의 숫자를 쓴다.** 눈대중으로 세지 않는다. 한 번
7.0% 로 보고했는데 실측이 14~18% 였던 적이 있다.

## 알려진 함정

- `aider` 종료코드 0 을 성공으로 읽지 않는다. Ollama 가 생성 중 끊겨도 재시도
  백오프를 소진한 뒤 0 을 낸다. `git status --porcelain=v1` 로 실제 편집을 확인한다
- 프롬프트에 `http://127.0.0.1:<port>` 같은 문자열을 넣지 않는다. Aider 가
  playwright 로 접속을 시도한다. `--no-detect-urls` 도 함께 쓴다
- `--map-tokens 0` 을 유지한다. 리포맵이 이름 비슷한 파일을 끌어와 편집 대상을 헷갈린다
- Ollama 는 여러 세션이 공유한다. 정리한다고 죽이지 않는다
- **돌연변이 검증과 위임 라운드를 겹쳐 돌리지 않는다.** 돌연변이는 추적 파일을
  고쳤다 되돌리고, `scope_check` 는 `git status` 를 읽는다. 겹치면 멀쩡한 위임이
  "배치 밖 편집" 으로 오판돼 중단된다
- 검수가 "통과" 를 찍어도 그것만으로 끝내지 않는다. 커버리지가 오른 것과 규칙이
  지켜지는 것은 다른 문제다. `mutate-client.py` 로 되짚는다. 실제로 첫 판이
  `loan_type` 대신 `type` 으로 판정하도록 되돌려도 7건 전부 통과했다 —
  자료가 두 값을 늘 함께 갖고 있었기 때문이다

## 라운드 원장 (`rounds.tsv`)

`DELEGATE_METRICS` 에 라운드마다 한 줄이 쌓인다.

```
ts	issue	label	round	target	added	model
2026-08-10T20:22:40	526	3	r1	src/a.js test/b.test.js	0	ollama_chat/qwen3-coder:30b
```

**`DELEGATE_ISSUE` 를 필수로 만든 이유가 이 파일이다.** 전에는 라운드와 이슈/PR 을
잇는 필드가 없어서, 나중에 위임 비율을 낼 때 **"이 PR 에서 위임한 것" 과 "언젠가
aider 가 건드린 적 있는 파일" 이 구분되지 않았다.** 파일명만 대조하면 몇 주 전
라운드가 만졌던 파일이 오늘 PR 의 위임 산출로 잡힌다 — 실제로 그렇게 비율을
잘못 냈다(락파일만 고친 PR 이 33% 로 나왔다).

선택값으로 두면 안 채우고 돌리게 되고, 그러면 같은 상태로 돌아간다. 그래서
비어 있으면 러너가 시작하지 않는다.
## 스펙 체크리스트

2026-08-10 야간 라운드 4회의 실측이다. **실패한 단언 4건이 전부 모델이 아니라
사람 스펙의 결함이었다.** 타입과 헬퍼를 명시한 3·4라운드는 17건이 한 번에
전부 통과했고 수정 라운드가 0회였다.

스펙을 넘기기 전에 확인한다.

- [ ] **골격에 헬퍼가 빠짐없이 있는가** — GET·POST·PUT·DELETE 중 테스트가 쓸
      것을 다 넣는다. 1라운드에서 `put`·`post`·`del` 만 주고 "GET 으로 조회"
      라고 적었더니 모델이 `post` 를 집었다. 없는 헬퍼는 쓰지 않는 게 아니라
      **있는 것 중에 고른다**
- [ ] **기대값의 타입을 적었는가** — 숫자면 "숫자 `400000`", 문자열이면 그렇게
      쓴다. 백틱 안에 `0` 만 적으면 입력이 문자열일 때 모델이 `'0'` 을 고른다
- [ ] **"없는 id" 같은 말에 타입을 붙였는가** — 숫자 id 를 기대하면서 "없는
      거래 id" 라고만 적으면 모델이 문자열을 넣는다. 라우트는 그것을 형식
      오류(400)로 보고, 기대는 404 였다
- [ ] **비동기 대기 방식을 지정했는가** — "`waitFor` 로 감싼다" 를 명시한다
- [ ] **건수를 못 박았는가** — "위 N 건만 쓴다. 다른 테스트를 추가하지 않는다"
- [ ] **범위를 못 박았는가** — "그 외에는 한 글자도 바꾸지 않는다". 이걸 적어도
      넘는 경우가 있다(아래)

### 범위 위반은 스펙만으로 못 막는다

1라운드에서 "한 글자도 바꾸지 않는다" 를 적었는데도 요청하지 않은 폴백 블록이
들어왔다. 도달 불가능한 분기라 실패 경로만 늘리는 코드였다.

러너의 `scope_check()` 는 **배치 밖 파일**이 바뀌었는지만 본다 — 같은 파일 안에서
범위를 넘는 것은 통과시킨다. 그래서 위임 산출은 diff 를 눈으로 본다. 특히
**요청하지 않은 방어 코드**가 붙었는지 본다.

판정은 `scope-snapshot.sh` 한 곳에 있고 `test/delegateScopeCheck.test.js` 가 잠근다
(#580). 잡는 것은 넷이다 — 배치 밖 새 파일 · 읽기 전용 소스 변경 · **이미 수정돼
있던 파일의 추가 오염** · 파일 삭제. 세 번째가 예전에 새던 자리다.

여전히 **위임 전에 커밋해 트리를 비우는 것이 맞다.** 해시로 재므로 오염은 잡히지만,
다른 세션이 같은 파일을 그 사이 고치면 이 라운드의 오염으로 오판하고 되돌려 버린다.
러너가 시작할 때 더러운 트리를 경고한다.

### 통과를 검수로 착각하지 않는다

돌연변이를 돌린다. `#526` 에서 위임 테스트 9건이 전부 통과했는데 구간 경계를
`>=` 에서 `>` 로 바꿔도 1649건이 그대로 통과했다 — 라우트만 덮고 **계산 자체가
무테스트**였다. 통과는 "그 테스트가 무엇을 잡는가" 를 말해 주지 않는다.
