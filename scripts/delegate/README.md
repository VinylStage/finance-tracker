# 위임 하네스

로컬 모델(Aider + Ollama)에 기계적 편집을 맡길 때 쓰는 스크립트다. `#379` 에서
테스트 파일 23개를 이관하며 만들었고, 그 과정에서 나온 사고마다 가드가 하나씩 붙었다.

이 디렉터리에 있기 전에는 세션 스크래치패드에만 있었다. 세션이 끝나면 사라지는
자리라 저장소로 옮겼다.

## 구성

| 파일 | 하는 일 |
|---|---|
| `make-spec.py` | 파일에서 바꿀 조각만 뽑아 찾기/바꾸기 명세를 만든다 |
| `dry-run.py` | 그 명세를 직접 적용해 테스트가 통과하는지 본다. **위임 전에 돌린다** |
| `run-batch.sh` | 명세로 Aider 를 돌리고 검수한다. 실패하면 사유를 되던져 재시도 |

## 환경변수

| 변수 | 기본값 |
|---|---|
| `DELEGATE_REPO` | 이 스크립트 위치에서 거슬러 올라간 저장소 루트 |
| `DELEGATE_WORK` | `mktemp -d` — 명세·로그·측정값이 쌓이는 곳 |

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
