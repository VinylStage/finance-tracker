#!/usr/bin/env bash
# develop 의 릴리즈 아티팩트 버전이 main 과 같은지 본다.
#
# 왜 필요한가
# ───────────
# release-please 는 `main` 에서만 돈다. 릴리즈할 때마다 `main` 의 package.json ·
# package-lock.json · .release-please-manifest.json · CHANGELOG.md 가 올라가는데,
# 그 커밋이 `develop` 으로 돌아오지 않는다.
#
# CONTRIBUTING.md 가 이 상황을 bypass 조건 1번으로 적어 두고 "릴리즈 후 두 브랜치를
# 동기화해 두면 예방된다" 고 했지만, **사람이 기억해서 하는 일이라 세 번 연속
# 놓쳤다**(0.7.0 · 0.8.0 · 0.9.0). develop 이 0.6.0 에 멈춘 채 102 커밋이 쌓였다.
#
# 그래서 기억 대신 CI 가 막는다.
#
# 무엇을 비교하나
# ───────────────
# **버전만** 본다. 파일 전체를 비교하면 안 된다 — develop 은 main 보다 앞서 있는
# 것이 정상이고(의존성 추가 등), 그것까지 같기를 요구하면 통과할 수 없는 검사가 된다.
set -euo pipefail

BASE_REF="${1:-origin/main}"

fail() { echo "✖ $1" >&2; FAILED=1; }
FAILED=0

json_get() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
  echo "✖ $BASE_REF 를 찾을 수 없다. 'git fetch origin main' 이 먼저다." >&2
  exit 2
fi

MAIN_VER=$(git show "$BASE_REF:.release-please-manifest.json" | json_get '["."]')
[ -z "$MAIN_VER" ] && { echo "✖ $BASE_REF 의 매니페스트를 못 읽었다." >&2; exit 2; }

MANIFEST_VER=$(json_get '["."]' < .release-please-manifest.json)
PKG_VER=$(json_get '["version"]' < package.json)
LOCK_VER=$(json_get '["version"]' < package-lock.json)
LOCK_PKG_VER=$(json_get '["packages"][""]["version"]' < package-lock.json)

echo "$BASE_REF 버전: $MAIN_VER"

[ "$MANIFEST_VER" = "$MAIN_VER" ] || fail ".release-please-manifest.json: $MANIFEST_VER (기대 $MAIN_VER)"
[ "$PKG_VER"      = "$MAIN_VER" ] || fail "package.json: $PKG_VER (기대 $MAIN_VER)"
[ "$LOCK_VER"     = "$MAIN_VER" ] || fail "package-lock.json 최상위: $LOCK_VER (기대 $MAIN_VER)"
[ "$LOCK_PKG_VER" = "$MAIN_VER" ] || fail "package-lock.json packages.\"\": $LOCK_PKG_VER (기대 $MAIN_VER)"

# CHANGELOG 는 main 의 맨 위 릴리즈 제목이 develop 에도 있어야 한다. 전체 비교는
# 안 한다 — develop 이 문서를 더 고칠 수 있다.
MAIN_TOP=$(git show "$BASE_REF:CHANGELOG.md" | grep -m1 '^## \[' || true)
if [ -n "$MAIN_TOP" ] && ! grep -qF "$MAIN_TOP" CHANGELOG.md; then
  fail "CHANGELOG.md 에 $BASE_REF 의 최신 릴리즈 항목이 없다: ${MAIN_TOP:0:60}"
fi

if [ "$FAILED" -ne 0 ]; then
  cat >&2 <<'MSG'

릴리즈 아티팩트가 main 과 어긋났다. 릴리즈 직후 동기화가 안 된 상태다.

고치는 법:

    ./scripts/sync-release-artifacts.sh
    git add package.json package-lock.json .release-please-manifest.json CHANGELOG.md
    git commit -m "chore: 릴리즈 아티팩트를 main 과 맞춘다"

그대로 두면 develop → main 릴리즈 PR 에서 네 파일이 충돌하고,
CONTRIBUTING.md 의 소유자 bypass(조건 1번)를 쓰게 된다.
MSG
  exit 1
fi

echo "✔ 릴리즈 아티팩트가 main 과 맞다 ($MAIN_VER)"
