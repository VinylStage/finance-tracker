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
| `run-client-batch.sh` | **새** 클라이언트 테스트 파일을 쓰게 하고 vitest 로 검수한다 |
| `mutate-client.py` | 소스를 일부러 망가뜨려 그 테스트가 잡는지 본다 |

## 환경변수

| 변수 | 기본값 |
|---|---|
| `DELEGATE_REPO` | 이 스크립트 위치에서 거슬러 올라간 저장소 루트 |
| `DELEGATE_WORK` | `mktemp -d` — 명세·로그가 쌓이는 곳 |
| `DELEGATE_METRICS` | `DELEGATE_WORK` — 측정값(`numstat-*.tsv`)을 따로 모을 곳 |
| `MIN_TESTS` | `5` — 이보다 적으면 껍데기로 보고 실패시킨다 |

## 순서

```bash
export DELEGATE_WORK=$(mktemp -d -t delegate)

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

MIN_TESTS=8 scripts/delegate/run-client-batch.sh \
  debts spec-debts.md \
  client/src/pages/Debts.test.jsx \
  client/src/pages/Debts.jsx          # 뒤는 전부 읽기 전용으로 붙는다

# 통과한 뒤, 그 테스트가 진짜로 잡는지 되짚는다
python3 scripts/delegate/mutate-client.py \
  src/pages/Debts.jsx src/pages/Debts.test.jsx \
  "#329 판정 되돌리기" "d.loan_type === 'credit_line'" "d.type === '마이너스통장'"
```

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
