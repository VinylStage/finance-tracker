#!/usr/bin/env bash
# main 의 릴리즈 아티팩트 버전을 현재 브랜치로 가져온다.
#
# **버전과 CHANGELOG 항목만** 옮긴다. package.json 의 의존성·스크립트나
# package-lock 의 의존성 트리는 건드리지 않는다 — develop 이 앞서 있는 것이 정상이고,
# 통째로 덮으면 그동안의 의존성 변경이 되돌아간다.
set -euo pipefail

BASE_REF="${1:-origin/main}"
git rev-parse --verify --quiet "$BASE_REF" >/dev/null || {
  echo "✖ $BASE_REF 없음. 'git fetch origin main' 먼저." >&2; exit 2; }

python3 - "$BASE_REF" <<'PY'
import json, re, subprocess, sys

base = sys.argv[1]
def show(path):
    return subprocess.run(['git','show',f'{base}:{path}'], capture_output=True, text=True, check=True).stdout

ver = json.loads(show('.release-please-manifest.json'))['.']

with open('.release-please-manifest.json','w') as f:
    f.write(json.dumps({'.': ver}, indent=2) + '\n')

for path, count in (('package.json', 1), ('package-lock.json', 2)):
    s = open(path, encoding='utf-8').read()
    s = re.sub(r'("version":\s*")[^"]+(")', lambda m: m.group(1) + ver + m.group(2), s, count=count)
    open(path, 'w', encoding='utf-8').write(s)

main_cl, dev_cl = show('CHANGELOG.md'), open('CHANGELOG.md', encoding='utf-8').read()
# develop 의 맨 위 릴리즈 항목을 main 쪽에서 찾아, 그 앞의 새 항목들을 얹는다.
m = re.search(r'^## \[.*$', dev_cl, re.M)
if m:
    anchor = m.group(0)
    if anchor in main_cl and main_cl.index(anchor) > 0:
        open('CHANGELOG.md','w',encoding='utf-8').write(
            main_cl[:main_cl.index(anchor)] + dev_cl[dev_cl.index(anchor):])

print(f'동기화 완료: {ver}')
PY
