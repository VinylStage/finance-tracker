#!/bin/zsh
# 클라이언트 테스트 파일 "신설" 을 위임한다. run-batch.sh 는 기계적 find/replace
# 전용이라 생성형에는 안 맞는다. 가드는 같은 사고에서 나온 것들을 가져왔다.
#
# 사용: run-client-batch.sh <라벨> <스펙파일> <생성할테스트파일> <읽기전용소스...>
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
MIN_TESTS=${MIN_TESTS:-5}
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
  local stray=$(comm -13 <(sort "$SC/before-$label.txt") <(sort "$SC/after-$label.txt") \
                | awk '{print $2}' | grep -v "^${target}$")
  if [[ -n "$stray" ]]; then
    print "  ✖ 배치 밖 편집: $stray"
    print -r -- "$stray" | while read f; do git checkout -- "$f" 2>/dev/null || rm -f "$f"; done
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
  # 껍데기 방지 — it 개수를 센다. 삭제형/빈껍데기 실패는 실행결과로 안 잡힌다
  local its=$(grep -cE "^\s*it\(" "$REPO/$target")
  if (( its < MIN_TESTS )); then
    print "테스트가 $its 개다. $MIN_TESTS 개 이상이어야 한다" >> "$SC/fail-$label.txt"; return 1
  fi
  local out=$(cd $REPO/client && npx vitest run "${target#client/}" --reporter=verbose 2>&1)
  print -r -- "$out" > "$SC/vitest-$label.log"
  if ! print -r -- "$out" | grep -qE "Tests +[0-9]+ passed"; then
    print "vitest 실패:" >> "$SC/fail-$label.txt"
    print -r -- "$out" | grep -E "^ *(×|→|AssertionError|TestingLibraryElementError)|Error:" | head -30 >> "$SC/fail-$label.txt"
    return 1
  fi
  if print -r -- "$out" | grep -qE "Tests +[0-9]+ failed"; then
    print "일부 실패" >> "$SC/fail-$label.txt"; return 1
  fi
  print "  ✓ it $its 개, vitest 통과"
  return 0
}

record_numstat() {
  local out="$M/numstat-$label-$1.tsv"
  git diff --numstat -- "$target" > "$out" 2>/dev/null
  # 새 파일은 diff --numstat 에 안 잡힌다. 추적되지 않은 파일은 줄수로 센다
  if [[ ! -s "$out" && -f "$REPO/$target" ]]; then
    printf "%s\t0\t%s\n" "$(wc -l < "$REPO/$target" | tr -d ' ')" "$target" > "$out"
  fi
  local add=$(awk '{a+=$1} END{print a+0}' "$out")
  printf "  numstat(%s) +%s → %s\n" "$1" "$add" "$out"
  printf "%s\t%s\t%s\n" "$label" "$1" "$add" >> "$M/numstat-summary.tsv"
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
