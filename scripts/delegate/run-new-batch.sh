#!/bin/zsh
# 테스트 파일 "신설" 을 위임한다. run-batch.sh 는 기계적 find/replace 전용이라
# 생성형에는 안 맞는다. 가드는 같은 사고에서 나온 것들을 가져왔다.
#
# 사용: run-new-batch.sh <라벨> <스펙파일> <생성할테스트파일> <읽기전용소스...>
#
# 클라이언트(vitest)와 서버(node --test)를 둘 다 받는다. 기본은 클라이언트고,
# 서버는 DELEGATE_TARGET_KIND=server 로 바꾼다.
#
#   DELEGATE_TARGET_KIND=server run-new-batch.sh 라벨 /abs/spec.md test/x.test.js src/y.js
#
# 테스트만이 아니라 **구현까지** 위임하려면 DELEGATE_EXTRA_PATHS 에 같이 만들
# 파일을 적는다. 안 적으면 scope_check 가 «배치 밖 편집» 으로 보고 지운다 —
# 실제로 그것 때문에 구현 위임이 구조적으로 막혀 있었다.
#
#   DELEGATE_EXTRA_PATHS='client/src/lib/x.js' run-new-batch.sh 라벨 spec.md client/src/lib/x.test.jsx
#
# 검수는 여전히 target(테스트 파일) 하나로 한다. 그래도 구현이 틀리면 테스트가
# 못 도니 같이 잡힌다 — 검수를 두 개로 늘릴 이유가 없다.
#
# 러너를 둘로 복제하지 않는 이유는 가드 때문이다. 아래 가드는 전부 실제 사고에서
# 하나씩 붙은 것이고, 파일을 나누면 다음 사고 때 한쪽만 고쳐진다. 실제로 다른
# 것은 `verify()` 안 세 줄뿐이라 거기서만 갈래를 탄다.
set -u
label=${1:?라벨}; spec=${2:?스펙파일}; target=${3:?생성할 테스트파일}; shift 3
reads=("$@")
# 아래에서 저장소로 cd 하므로 스펙은 지금 절대경로로 굳힌다. 상대경로로 두면
# aider 가 "file not found" 만 찍고 **지시 없이** 대화형으로 빠진다(실제로 당함).
spec=${spec:A}
[[ -f $spec ]] || { print "스펙이 없다: $spec"; exit 1 }

REPO=${DELEGATE_REPO:-${0:A:h:h:h}}
SC=${DELEGATE_WORK:-$(mktemp -d -t delegate)}
M=${DELEGATE_METRICS:-$SC}
# 라운드를 이슈/PR 에 잇는다(M16). 이 값이 없으면 나중에 "이 PR 에서 위임한 것" 과
# "언젠가 aider 가 건드린 적 있는 파일" 이 구분되지 않는다 — 실제로 그것 때문에
# 위임 비율을 잘못 냈다. 비워 둔 채로 돌지 못하게 필수로 막는다.
ISSUE=${DELEGATE_ISSUE:?DELEGATE_ISSUE 가 필요하다 (예: DELEGATE_ISSUE=526)}
MIN_TESTS=${MIN_TESTS:-5}
# 이 배치가 target 말고 더 만들어도 되는 파일들(공백으로 구분). 구현 위임용이다.
extra=(${=DELEGATE_EXTRA_PATHS:-})
# 검수 방식을 고른다. client 는 vitest, server 는 node --test 다.
KIND=${DELEGATE_TARGET_KIND:-client}
if [[ $KIND != client && $KIND != server ]]; then
  print "DELEGATE_TARGET_KIND 는 client 또는 server 여야 한다 (받은 값: $KIND)"; exit 1
fi
mkdir -p $SC $M
cd $REPO || exit 1

ollama_ready() {
  curl -sf http://127.0.0.1:11434/api/tags >/dev/null && return 0
  print "  ollama 무응답 — 중단한다(다른 세션이 쓰는 싱글턴이라 죽이거나 띄우지 않는다)"
  return 1
}

# 스냅샷은 **run_aider 직전마다** 다시 뜬다. 실행 시작 시점에 한 번만 뜨면,
# 그 뒤 다른 실행이 만든 파일이 전부 "이 실행이 만든 stray" 로 보인다.
# 실제로 좀비가 된 같은 라벨 실행이 남의 산출물 두 개를 지웠다.
snapshot_before() { git status --porcelain=v1 > "$SC/before-$label.txt"; }

# 같은 라벨이 이미 돌고 있으면 시작하지 않는다. 스냅샷 파일이 라벨 키라서
# 두 실행이 서로의 before/after 를 덮어쓴다.
LOCK="$SC/.lock-$label"
acquire_lock() {
  if [[ -f $LOCK ]] && kill -0 "$(cat $LOCK)" 2>/dev/null; then
    print "  같은 라벨($label)이 pid $(cat $LOCK) 로 돌고 있다. 중단한다"
    return 1
  fi
  print $$ > $LOCK
  trap "rm -f $LOCK" EXIT INT TERM
  return 0
}

scope_check() {   # 배치 밖 파일이 바뀌었나
  git status --porcelain=v1 > "$SC/after-$label.txt"
  # target 과 DELEGATE_EXTRA_PATHS 는 이 배치가 만들기로 한 것이라 stray 가 아니다.
  local allowed=("$target" "${extra[@]}")
  local stray=$(comm -13 <(sort "$SC/before-$label.txt") <(sort "$SC/after-$label.txt") \
                | awk '{print $2}' \
                | grep -vxF -- "${(F)allowed}")
  if [[ -n "$stray" ]]; then
    print "  ✖ 배치 밖 편집: $stray"
    # 되돌리는 순서가 중요하다. aider 는 만든 파일을 **스테이지해 둔다**.
    # 그 상태에서 `git checkout -- f` 는 인덱스에서 되살려 놓는 꼴이라 파일이
    # 안 지워진다 — 실제로 stray 가 그대로 남아 다음 실행을 오염시켰다.
    # 인덱스에서 먼저 빼고, 추적 중이던 파일만 되돌린다.
    print -r -- "$stray" | while read f; do
      if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
        git checkout HEAD -- "$f" 2>/dev/null
      else
        git rm -q --cached --force -- "$f" 2>/dev/null
        rm -f "$f"
      fi
    done
    return 1
  fi
  return 0
}

run_aider() {  # $1=스펙 $2=로그
  local S=$(date +%s) readargs=()
  for r in "${reads[@]}"; do readargs+=(--read "$r"); done
  # 새 파일이라 diff 형식이 붙을 자리가 없다. whole 로 통째로 쓰게 한다.
  #
  # stdin 을 파이프로 준다. 백그라운드 실행에서 fd 0 이 정규 파일이면 aider 가
  # 대화형으로 떨어질 때 asyncio 가 kqueue 에 등록하다 EINVAL 로 죽고, 그 루프가
  # 로그를 37MB 까지 불린다. 파이프는 kqueue 가 감시할 수 있다.
  printf '' | timeout 1800 aider --no-auto-commits --no-dirty-commits --yes --no-detect-urls \
    --no-stream --map-tokens 0 --timeout 900 --edit-format whole \
    --message-file "$1" "${readargs[@]}" "$target" > "$2" 2>&1
  local rc=$?
  # 지시를 못 읽었으면 그 뒤 결과는 볼 필요가 없다
  if grep -q "file not found error" "$2"; then
    print "  ✖ aider 가 메시지 파일을 못 읽었다 — 지시 없이 돌았다"; return 1
  fi
  print "  aider 소요 $(($(date +%s)-S))초 exit=$rc"
}

verify() {   # 통과하면 0, 실패 사유를 $SC/fail-$label.txt 로
  : > "$SC/fail-$label.txt"
  if [[ ! -f "$REPO/$target" ]]; then
    print "파일이 만들어지지 않았다: $target" >> "$SC/fail-$label.txt"; return 1
  fi
  # 같이 만들기로 한 파일도 확인한다. 테스트만 쓰고 구현을 빼면 아래 실행에서
  # «못 찾음» 으로 잡히긴 하지만, 사유가 «파일이 없다» 로 나와야 모델이 고친다.
  for e in "${extra[@]}"; do
    if [[ ! -f "$REPO/$e" ]]; then
      print "같이 만들기로 한 파일이 없다: $e" >> "$SC/fail-$label.txt"; return 1
    fi
  done
  # 껍데기 방지 — 테스트 개수를 센다. 삭제형/빈껍데기 실패는 실행결과로 안 잡힌다.
  # 서버는 node:test 라 `test(` 도 쓴다. 둘 다 세지 않으면 멀쩡한 산출물이
  # "0 개" 로 반려된다.
  local its=$(grep -cE "^\s*(it|test)\(" "$REPO/$target")
  if (( its < MIN_TESTS )); then
    print "테스트가 $its 개다. $MIN_TESTS 개 이상이어야 한다" >> "$SC/fail-$label.txt"; return 1
  fi

  local out
  if [[ $KIND == server ]]; then
    out=$(cd $REPO && node --test "$target" 2>&1)
    print -r -- "$out" > "$SC/testrun-$label.log"
    # node:test 는 요약을 `ℹ pass N` / `ℹ fail N` 으로 낸다. 요약줄이 아예 없으면
    # **테스트가 안 돈 것**이지 통과가 아니다 — 그 둘을 구분해야 한다.
    if ! print -r -- "$out" | grep -qE "^ℹ pass [0-9]+"; then
      print "node --test 요약줄이 없다 — 테스트가 돌지 않았다:" >> "$SC/fail-$label.txt"
      print -r -- "$out" | grep -E "^(not ok|✖)|Error|Cannot find" | head -30 >> "$SC/fail-$label.txt"
      return 1
    fi
    if ! print -r -- "$out" | grep -qE "^ℹ fail 0$"; then
      print "node --test 실패:" >> "$SC/fail-$label.txt"
      # `Error:` 만 잡으면 부족하다. node 의 실제 원인은 들여쓰인 `[cause]:` 줄과
      # `Error [ConnectTimeoutError]` 처럼 대괄호가 붙은 형태로 나오는데, 그 줄이
      # 빠지면 모델에게 "fetch failed" 만 전달돼 세 라운드를 헛돈다.
      # 주소·포트가 그 줄에만 있어 오타를 그것 없이는 못 고친다(실측).
      print -r -- "$out" \
        | grep -E "^(not ok|✖)|AssertionError|Error|cause|attempted address|code:|expected|actual" \
        | head -40 >> "$SC/fail-$label.txt"
      return 1
    fi
  else
    out=$(cd $REPO/client && npx vitest run "${target#client/}" --reporter=verbose 2>&1)
    print -r -- "$out" > "$SC/vitest-$label.log"
    if ! print -r -- "$out" | grep -qE "Tests +[0-9]+ passed"; then
      print "vitest 실패:" >> "$SC/fail-$label.txt"
      print -r -- "$out" | grep -E "^ *(×|→|AssertionError|TestingLibraryElementError)|Error:" | head -30 >> "$SC/fail-$label.txt"
      return 1
    fi
    if print -r -- "$out" | grep -qE "Tests +[0-9]+ failed"; then
      print "일부 실패" >> "$SC/fail-$label.txt"; return 1
    fi
  fi

  print "  ✓ 테스트 $its 개, $KIND 검수 통과"
  return 0
}

record_numstat() {
  local out="$M/numstat-$label-$1.tsv"
  git diff --numstat -- "$target" "${extra[@]}" > "$out" 2>/dev/null
  # 새 파일은 diff --numstat 에 안 잡힌다. 추적되지 않은 파일은 줄수로 센다
  # 새 파일은 diff --numstat 에 안 잡힌다. 추적되지 않은 파일은 줄수로 센다.
  # **구현 파일도 같이 센다** — 안 세면 위임한 줄이 통계에서 빠져 비율이 낮게 나온다.
  for f in "$target" "${extra[@]}"; do
    [[ -f "$REPO/$f" ]] || continue
    grep -qF -- "	$f" "$out" 2>/dev/null && continue
    printf "%s\t0\t%s\n" "$(wc -l < "$REPO/$f" | tr -d ' ')" "$f" >> "$out"
  done
  local add=$(awk '{a+=$1} END{print a+0}' "$out")
  printf "  numstat(%s) +%s → %s\n" "$1" "$add" "$out"
  printf "%s\t%s\t%s\n" "$label" "$1" "$add" >> "$M/numstat-summary.tsv"
  # 라운드 원장. 헤더는 파일이 없을 때 한 번만 쓴다.
  local ledger="$M/rounds.tsv"
  [[ -f $ledger ]] || printf "ts\tissue\tlabel\tround\ttarget\tadded\tmodel\n" > "$ledger"
  printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
    "$(date +%Y-%m-%dT%H:%M:%S)" "$ISSUE" "$label" "$1" "$target" "$add" \
    "${DELEGATE_MODEL:-ollama_chat/qwen3-coder:30b}" >> "$ledger"
}

ollama_ready || exit 1
acquire_lock || exit 3
print "=== $label 위임 시작 ==="
snapshot_before
run_aider "$spec" "$M/aider-$label.log"

if ! scope_check; then print "=== $label 범위 위반으로 중단 ==="; exit 2; fi
if verify; then record_numstat "1차"; print "=== $label 통과 (수정 0회) ==="; exit 0; fi

round=1
while (( round <= 3 )); do
  # zsh print 는 `---` 을 옵션으로 읽는다. -r -- 로 끊어 준다
  print -r -- "--- $label 수정 $round 회차 ---"
  { print "직전 결과가 아래 이유로 실패했다. 그 부분만 고친다. 파일 전체를 다시 쓴다."
    print ""; cat "$SC/fail-$label.txt" } > "$SC/fix-$label-$round.md"
  snapshot_before
  run_aider "$SC/fix-$label-$round.md" "$M/aider-$label-fix$round.log"
  if ! scope_check; then print "=== 범위 위반 ==="; exit 2; fi
  if verify; then record_numstat "수정${round}회"; print "=== $label 통과 (수정 $round 회) ==="; exit 0; fi
  (( round++ ))
done
print "=== $label 3회 수정에도 실패 ==="
cat "$SC/fail-$label.txt"
exit 1
