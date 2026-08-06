#!/usr/bin/env python3
"""클라이언트(vitest) 용 돌연변이 검증.

`mutate.py` 와 같은 규율을 쓴다 — **치환이 실제로 됐는지 먼저 증명**하고,
문법이 깨지지 않았는지 확인한 뒤에야 테스트를 돌린다. 셋 다 실제로 당한
오탐이라 하나씩 붙었다.

사용:
  mutv-client.py <소스파일> <테스트파일> <라벨> <찾을문자열> <바꿀문자열> [occurrence]
"""
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(os.environ.get("DELEGATE_REPO", Path(__file__).resolve().parents[2]))
CLIENT = REPO / "client"


def main() -> int:
    if len(sys.argv) < 6:
        print(__doc__)
        return 1
    src, testfile, label, find, repl = sys.argv[1:6]
    occ = int(sys.argv[6]) if len(sys.argv) > 6 else None

    path = CLIENT / src
    original = path.read_text(encoding="utf-8")
    count = original.count(find)

    if count == 0:
        print(f"  {label:<44} ✖ 치환 실패 — 찾을 문자열이 없다")
        return 1
    if count > 1 and occ is None:
        print(f"  {label:<44} ✖ 치환 모호 — {count}곳. occurrence 를 지정하라")
        return 1

    if occ is None:
        mutated = original.replace(find, repl, 1)
    else:
        if occ > count:
            print(f"  {label:<44} ✖ occurrence {occ} > 발견 {count}")
            return 1
        parts = original.split(find)
        mutated = find.join(parts[:occ]) + repl + find.join(parts[occ:])

    if mutated == original:
        print(f"  {label:<44} ✖ 치환 후에도 내용이 같다")
        return 1

    path.write_text(mutated, encoding="utf-8")
    try:
        r = subprocess.run(
            ["npx", "vitest", "run", testfile, "--reporter=verbose"],
            cwd=CLIENT, capture_output=True, text=True,
        )
        out = r.stdout + r.stderr
        # 문법이 깨지면 "테스트가 못 잡았다" 가 아니라 측정 자체가 무효다
        if "Failed to parse" in out or "Transform failed" in out:
            print(f"  {label:<44} ✖ 문법이 깨졌다 — 측정 무효")
            return 1

        # **요약 줄이 없으면 안 잡힌 게 아니라 안 돈 것이다.** `--reporter=basic`
        # 이 이 버전에 없어 리포터 적재 단계에서 죽었는데, 실패 문자열이 없다는
        # 이유로 "못 잡음" 3건을 그대로 보고할 뻔했다.
        summary = next((l.strip() for l in out.splitlines()
                        if l.strip().startswith("Tests ")), None)
        if summary is None:
            print(f"  {label:<44} ✖ 테스트가 실행되지 않았다 — 측정 무효")
            print("     " + "\n     ".join(out.strip().splitlines()[-4:]))
            return 1

        failed = "failed" in summary
        mark = "✓ 잡음" if failed else "✖ 못 잡음"
        print(f"  {label:<44} {summary:<30} {mark}")
        return 0 if failed else 2
    finally:
        path.write_text(original, encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
