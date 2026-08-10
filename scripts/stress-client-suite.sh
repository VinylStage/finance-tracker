#!/bin/zsh
# 부하에 따라 흔들리는 클라이언트 테스트를 재현한다.
#
# 플레이키는 "가끔 난다" 로는 고쳤는지 확인할 수 없다. 부하를 만들어 실패 조건을
# 재현할 수 있으면 전후 대조가 된다. #429 에서 이 방법으로 5393ms 실패를
# environment 178초 / 4942ms 로 재현했다.
#
# 사용: scripts/stress-client-suite.sh [워커수] [반복]
#
#   워커수 0   부하 없음 (기준선)
#   워커수 24  environment 약 67초
#   워커수 48  약 112초
#   워커수 88  약 178초  ← #429 의 실패 구간
#
# 워커는 CPU 를 100% 태운다. 끝나면 정리하지만, 중간에 끊었으면
#   pkill -9 -f "while :; do :; done"
# 로 직접 지운다.
set -u
WORKERS=${1:-24}
RUNS=${2:-1}
ROOT=${0:A:h:h}
cd "$ROOT/client" || exit 1

PIDS=$(mktemp)
cleanup() {
  [[ -s $PIDS ]] && while read p; do kill -9 $p 2>/dev/null; done < $PIDS
  rm -f $PIDS
}
trap cleanup EXIT INT TERM

if (( WORKERS > 0 )); then
  echo "부하 워커 $WORKERS 개 (코어 $(sysctl -n hw.ncpu)개)"
  for i in $(seq 1 $WORKERS); do
    ( while :; do :; done ) & echo $! >> $PIDS
  done
  sleep 3
fi

for i in $(seq 1 $RUNS); do
  out=$(npx vitest run --reporter=verbose 2>&1)
  env=$(print -r -- "$out" | grep -oE 'environment [0-9.]+s' | head -1)
  fails=$(print -r -- "$out" | grep -E '^ *× ' | sed 's/^ *× //' | head -5)
  slow=$(print -r -- "$out" | grep -oE '> [^>]+ [0-9]{4,}ms' | sort -t' ' -k2 -rn | head -3)
  printf "\n[%d/%d] %s\n" $i $RUNS "${env:-environment ?}"
  if [[ -n $slow ]]; then
    echo "  1초 넘은 테스트:"
    print -r -- "$slow" | sed 's/^/    /'
  fi
  if [[ -n $fails ]]; then
    echo "  실패:"
    print -r -- "$fails" | sed 's/^/    /'
  else
    echo "  실패 없음"
  fi
done
