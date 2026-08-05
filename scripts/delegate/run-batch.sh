#!/bin/zsh
# 위임 1배치를 끝까지 돌린다. 검수 실패 시 실패 내용을 aider 에게 되던져 고치게 한다.
# 사람이 손대는 지점은 없다 — 그게 이 스크립트의 목적이다.
# 사용: delegate.sh <배치번호> <메트릭디렉터리> <파일...>
set -u
n=$1; M=$2; shift 2
files=("$@")
# 작업 디렉터리. 저장소 밖에 두어 산출물이 커밋에 섞이지 않게 한다.
SC=${DELEGATE_WORK:-$(mktemp -d -t delegate)}
# 저장소 루트. 이 스크립트 위치에서 거슬러 올라가 찾는다.
WT=${DELEGATE_REPO:-${0:A:h:h:h}}
cd "$WT" || exit 1
mkdir -p "$M"

ollama_ready() {
  curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && return 0
  # 다른 세션 aider 가 물고 있을 수 있으니 죽이지 않고 없을 때만 띄운다
  nohup ollama serve > "$SC/ollama-b$n.log" 2>&1 &
  for i in $(seq 1 60); do
    curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

run_aider() {  # $1=스펙파일 $2=로그파일
  ollama_ready || { echo "FATAL ollama 미기동"; return 99; }
  local S=$(date +%s)
  timeout 1800 aider --no-auto-commits --no-dirty-commits --yes --no-detect-urls --no-stream --map-tokens 0 --timeout 900 --edit-format diff \
    --message-file "$1" "${files[@]}" \
    --read test/helpers/testServer.js > "$2" 2>&1
  local rc=$?
  echo "  aider 소요 $(($(date +%s)-S))초 exit=$rc"
  return $rc
}

# 배치 밖 파일을 건드렸으면 되돌린다 (6차 사고 재발 방지).
# 단, **위임 전부터 있던 편집은 건드리지 않는다.** 같은 워크트리에서 다른 이슈를
# 병행하면 그쪽 작업파일이 여기 걸려 통째로 날아간다 (#429 수정본이 실제로 걸릴 뻔했다).
# 그래서 실행 전 상태를 찍어두고 그 차집합만 되돌린다.
snapshot_before() {
  git status --porcelain=v1 | awk '{print $2}' | sort > "$SC/pre-$n.txt"
}

# 이관은 **서버 기동 방식만** 바꾸는 작업이다. 테스트가 줄어들면 그건 이관이
# 아니라 삭제다. 12b 에서 diff 형식이 489줄 파일을 33줄로 만들고 테스트 16개를
# 전부 날렸는데, spawn/helper/stop/PORT 만 보던 검수는 그걸 "통과" 로 판정했다.
# 빈 껍데기가 그 조건을 전부 만족하기 때문이다.
# 죽인 실행이 남긴 테스트 서버가 그 포트를 계속 물고 있으면, 새 테스트가 자기
# 서버가 아니라 **옛 서버(데이터가 쌓인)** 에 붙는다. 실제로 12b 검수에서
# "같은 이름의 카드가 이미 있어요" 로 20건이 실패했는데 모델과 무관한 실패였다.
# 파일이 선언한 PORT 를 읽어 그 포트만 정리한다 — 다른 세션 것은 건드리지 않는다.
free_ports() {
  for f in "${files[@]}"; do
    local port=$(grep -m1 '^const PORT' "$f" | grep -oE '[0-9]+')
    [[ -z $port ]] && continue
    local pids=$(lsof -nP -tiTCP:$port -sTCP:LISTEN 2>/dev/null)
    if [[ -n $pids ]]; then
      echo "  포트 $port 점유 정리: $pids"
      kill $pids 2>/dev/null; sleep 1
      lsof -nP -tiTCP:$port -sTCP:LISTEN >/dev/null 2>&1 && kill -9 $(lsof -nP -tiTCP:$port -sTCP:LISTEN) 2>/dev/null
    fi
  done
}

baseline() {
  : > "$SC/base-$n.txt"
  for f in "${files[@]}"; do
    print -r -- "$f $(grep -cE '^[[:space:]]*(test|it)\(' $f) $(wc -l < $f)" >> "$SC/base-$n.txt"
  done
}

scope_check() {
  git status --porcelain=v1 | awk '{print $2}' | sort > "$SC/post-$n.txt"
  comm -13 "$SC/pre-$n.txt" "$SC/post-$n.txt" | while read p; do
    local hit=0
    for f in "${files[@]}"; do [[ "$p" == "$f" ]] && hit=1; done
    if [[ $hit -eq 0 ]]; then
      echo "  ⚠ 배치 밖 편집 되돌림: $p"
      git checkout -- "$p" 2>/dev/null || git clean -f "$p"
    fi
  done
  return 0
}

verify() {  # 통과하면 0. 실패 사유를 $SC/fail-$n.txt 에 남긴다
  : > "$SC/fail-$n.txt"
  local ok=1
  node --test "${files[@]}" > "$SC/testout-$n.txt" 2>&1 || ok=0
  grep -E "^ℹ (tests|pass|fail)" "$SC/testout-$n.txt"
  if [[ $ok -eq 0 ]]; then
    echo "테스트가 실패한다. 실패 출력:" >> "$SC/fail-$n.txt"
    grep -E "^not ok|✖|Error|AssertionError" "$SC/testout-$n.txt" | head -30 >> "$SC/fail-$n.txt"
  fi
  for f in "${files[@]}"; do
    local b0=$(awk -v k="$f" '$1==k{print $2}' "$SC/base-$n.txt")
    local l0=$(awk -v k="$f" '$1==k{print $3}' "$SC/base-$n.txt")
    local b1=$(grep -cE '^[[:space:]]*(test|it)\(' "$f")
    local l1=$(wc -l < "$f")
    if [[ -n "$b0" && $b1 -lt $b0 ]]; then
      echo "  ✖ $f: 테스트 블록이 $b0 → $b1 로 줄었다"
      echo "$f: 테스트 블록을 지우지 마라. 이관 전 $b0 개였는데 지금 $b1 개다. 서버 기동 방식만 바꾸고 test/it 블록과 단언은 전부 그대로 둔다." >> "$SC/fail-$n.txt"
      ok=0
    fi
    if [[ -n "$l0" && $(( l0 - l1 )) -gt 80 ]]; then
      echo "  ✖ $f: $l0 → $l1 줄, $(( l0 - l1 ))줄 사라졌다"
      echo "$f: 삭제량이 과하다($l0 → $l1). 지워도 되는 것은 spawn 기동 블록과 health 폴링, after 의 kill/unlink 뿐이다." >> "$SC/fail-$n.txt"
      ok=0
    fi
    local sp=$(grep -c "spawn('node'" "$f")
    local hp=$(grep -c 'startTestServer' "$f")
    local st=$(grep -c 'server.stop()' "$f")
    local pt=$(grep -c '^const PORT' "$f")
    printf "  %-40s spawn %s / helper %s / stop %s / PORT %s\n" "$(basename $f)" $sp $hp $st $pt
    [[ $sp -ne 0 ]] && { echo "$f: spawn('node') 가 아직 $sp 곳 남아 있다. 전부 startTestServer 로 바꿔라." >> "$SC/fail-$n.txt"; ok=0; }
    [[ $hp -lt 2 ]] && { echo "$f: startTestServer 를 require 하고 before 에서 호출해야 한다." >> "$SC/fail-$n.txt"; ok=0; }
    [[ $st -lt 1 ]] && { echo "$f: after 에서 server.stop() 을 불러야 한다." >> "$SC/fail-$n.txt"; ok=0; }
    [[ $pt -lt 1 ]] && { echo "$f: const PORT 선언을 지우지 마라. 파일마다 포트가 달라야 한다." >> "$SC/fail-$n.txt"; ok=0; }
  done
  return $((1-ok))
}

# 위임비율의 분자는 **모델이 실제로 바꾼 줄수**다. 그동안 이것을 추정으로 적었고
# 한 번 크게 틀렸다(#422 를 7.0% 로 보고했는데 실측은 14~18% 였다). 라운드마다
# git diff --numstat 을 남겨 나중에 세지 않고 그때 잰 값을 쓴다.
record_numstat() {  # $1=라운드 라벨
  local out="$M/numstat-$n-$1.tsv"
  git diff --numstat -- "${files[@]}" > "$out" 2>/dev/null
  local add=$(awk '{a+=$1} END{print a+0}' "$out")
  local del=$(awk '{d+=$2} END{print d+0}' "$out")
  printf "  numstat(%s) +%s/-%s  → %s\n" "$1" "$add" "$del" "$out"
  printf "%s\t%s\t%s\t%s\n" "$n" "$1" "$add" "$del" >> "$M/numstat-summary.tsv"
}

echo "=== ${n}차 1회차 ==="
free_ports
snapshot_before
baseline
run_aider "$SC/aider-379-batch$n.md" "$M/aider-batch$n.log"
scope_check
record_numstat r1
if verify; then echo "=== ${n}차 통과 (수정 라운드 0회) ==="; exit 0; fi

for round in 2; do
  echo "=== ${n}차 ${round}회차 — 실패를 되던진다 ==="
  free_ports
  snapshot_before
  cat "$SC/fail-$n.txt"
  {
    echo "직전 수정에 문제가 있다. 아래를 고쳐라. 이 ${#files[@]}개 파일만 수정한다."
    echo
    cat "$SC/fail-$n.txt"
    echo
    sed -n '/^# 공용 헬퍼/,/^# 검증/p' "$SC/aider-379-batch$n.md" | sed '$d'
  } > "$SC/aider-379-batch$n-fix$round.md"
  run_aider "$SC/aider-379-batch$n-fix$round.md" "$M/aider-batch$n-fix$round.log"
  scope_check
  record_numstat "r$round"
  if verify; then echo "=== ${n}차 통과 (수정 라운드 $((round-1))회) ==="; exit 0; fi
done

echo "=== ${n}차 실패 — 3회차까지 못 고쳤다 ==="
exit 1
