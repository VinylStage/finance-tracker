#!/bin/sh
# 위임 라운드가 «범위 밖 파일» 을 고쳤는지 판정한다 (#580).
#
# ─────────────────────────────────────────────────────────────────────────
# 왜 경로만으로는 못 잡는가
#
# 예전 검사는 `git status --porcelain` 을 before/after 로 떠서 **새로 나타난 줄**만
# stray 로 봤다. 그런데 그 한 줄은 `(상태) (경로)` 뿐이라 **내용이 얼마나 바뀌었는지를
# 담지 않는다.**
#
# 이미 ` M src/foo.js` 인 파일은 모델이 428줄을 지워도 before·after 양쪽에 글자
# 그대로 같은 줄로 남는다. `comm -13` 결과가 비고, 가드는 통과시킨다.
#
# 2026-08-12 에 `src/routes/cardStrategy.js` 를 그렇게 두 번 잃었다. 두 스냅샷이
# 완전히 동일했고, 그 사이 모델은 428줄을 지우고 없는 컬럼을 SELECT 에 넣었다.
#
# 그래서 스냅샷 한 줄을 **«내용 해시 + 경로»** 로 만든다. 같은 경로의 내용 변화가
# after 에만 있는 줄로 나타난다.
#
# ─────────────────────────────────────────────────────────────────────────
# 왜 zsh 가 아니라 sh 인가
#
# 하네스 나머지는 zsh 다. 이 파일만 POSIX sh 인 이유는 **CI 러너에 zsh 가 없기
# 때문**이다. zsh 로 썼을 때 CI 의 서버 job 이 `spawn status: null`(ENOENT)로 6개를
# 통째로 떨어뜨렸다. 가드를 CI 에서 검증하지 못하면 회귀를 아무도 못 잡는다.
#
# 그래서 프로세스 치환(`<(...)`)·`print`·`(( ))` 을 쓰지 않는다. 정렬 순서는 로케일에
# 따라 달라지므로 `LC_ALL=C` 로 고정한다 — before 와 after 가 다른 순서로 정렬되면
# `comm` 이 엉뚱한 결과를 낸다.
#
# ─────────────────────────────────────────────────────────────────────────
# 무엇을 재는가
#
# 추적 파일 전체를 해시하면 느리다. 두 묶음만 잰다.
#
#   1. 작업 트리에 뜬 파일 — `git status` 에 보이는 것
#   2. **읽기 전용으로 넘긴 파일**
#
# 2번이 왜 따로 필요한지는 실측해서 정했다. 추적되는 소스라면 모델이 고치는 순간
# `git status` 에 ` M` 으로 떠서 1번이 이미 잡는다. 2번이 유일하게 값을 갖는 자리는
# **git status 가 아예 보여주지 않는 파일**이다 — `.gitignore` 된 파일은
# `--untracked-files=all` 로도 안 뜬다(확인함). 그런 파일을 읽기 전용으로 넘겼다면
# 그 변화는 여기 적지 않는 한 아무도 못 본다.
#
# 돌연변이로도 확인했다. 2번을 지우면 `test/delegateScopeCheck.test.js` 의
# gitignore 케이스가 실패한다.
#
# ─────────────────────────────────────────────────────────────────────────
# 판정만 하고 되돌리지 않는다
#
# 되돌리는 일은 부르는 쪽(run-new-batch.sh)이 한다. 이 스크립트가 복구까지 하면
# 테스트가 픽스처를 잃어서 «무엇을 잡았는지» 를 확인할 수 없다.
#
# 사용:
#   scope-snapshot.sh snapshot <출력파일> [읽기전용...]
#   scope-snapshot.sh compare <before파일> <after출력파일> <대상경로> [읽기전용...]
#
# compare 는 범위 밖 편집 경로를 한 줄씩 stdout 에 내고 **1** 을 낸다. 위반이 없으면
# 아무것도 안 내고 0 이다.
set -u
LC_ALL=C
export LC_ALL

mode=${1:?"mode: snapshot | compare"}

# sha1. macOS 는 shasum, 리눅스 러너는 sha1sum 이 표준이다. 둘 다 «해시 공백 경로» 를
# 내므로 앞 필드만 쓴다.
hash_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 1 -- "$1" | cut -d' ' -f1
  else
    sha1sum -- "$1" | cut -d' ' -f1
  fi
}

# 잴 파일 목록. 인자는 읽기 전용 경로들이다.
#
# 경로에 공백이나 따옴표가 있으면 porcelain v1 이 쿼팅하는데 그 복원까지는 하지
# 않는다. 이 저장소 경로에는 공백이 없고, 그 경우 예전 `awk '{print $2}'` 도 이미
# 깨져 있었다. 정확히 하려면 `-z` 로 NUL 을 읽어야 한다.
scope_paths() {
  {
    # 상태 3글자를 떼고, rename 은 화살표 뒤(새 이름)를 쓴다.
    git status --porcelain=v1 --untracked-files=all | sed -e 's/^...//' -e 's/^.* -> //'
    if [ "$#" -gt 0 ]; then
      printf '%s\n' "$@"
    fi
  } | sed -e 's/^"//' -e 's/"$//' | grep -v '^$' | sort -u
}

# 한 줄 = "<해시>  <경로>". 없는 파일은 ABSENT 로 둔다 — 파일이 생기거나 사라지는
# 것도 변화이므로 같은 자리에서 잡혀야 한다.
scope_hashes() {
  scope_paths "$@" | while IFS= read -r f; do
    if [ -f "$f" ]; then
      printf '%s  %s\n' "$(hash_of "$f")" "$f"
    else
      printf 'ABSENT  %s\n' "$f"
    fi
  done | sort
}

case $mode in
  snapshot)
    out=${2:?출력파일}
    shift 2
    scope_hashes "$@" > "$out"
    ;;

  compare)
    before=${2:?before파일}
    after=${3:?after출력파일}
    target=${4:?대상경로}
    shift 4
    scope_hashes "$@" > "$after"

    # after 에만 있는 줄 = 새로 뜬 파일 + **내용이 달라진 파일**. 대상은 빼고 본다.
    # 두 파일은 scope_hashes 가 이미 정렬해 두었으므로 comm 에 그대로 넣는다.
    stray=$(comm -13 "$before" "$after" | sed 's/^[^ ]*  //' | sort -u | grep -v "^${target}\$" || true)

    if [ -n "$stray" ]; then
      printf '%s\n' "$stray"
      exit 1
    fi
    exit 0
    ;;

  *)
    printf '모르는 mode: %s (snapshot | compare)\n' "$mode"
    exit 2
    ;;
esac
