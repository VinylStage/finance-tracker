#!/usr/bin/env python3
"""파일마다 **바꿔야 할 조각만** 골라 찾기/바꾸기 쌍을 만든다.

한 덩어리(맨 앞 ~ after 블록 끝)를 통째로 치환하게 하면 그 사이에 있던 것이 같이
사라진다. 실제로 세 번 당했다.

  1차: 파일 고유 변수 선언(`let acctA, acctB;`) 소실 → ReferenceError: acctA
  2차: `require('node:test')` 소실 → ReferenceError: before is not defined
  3차: 헬퍼 함수(`async function json(...)`) 소실 → ReferenceError: json

구간을 넓게 잡은 것이 원인이다. 바꿀 것은 넷뿐이고 각각 짧고 유일하다.

  A. spawn require 한 줄   → 헬퍼 require 한 줄
  B. 기동용 변수 선언 묶음 → let server; let dbPath;
  C. before 블록           → 헬퍼 호출 + 원래 준비 작업 그대로
  D. after 블록            → server.stop()

사용: mkspec-pieces.py <배치번호> <파일...>
"""
import re, sys, os, tempfile
from pathlib import Path

WT = os.environ.get("DELEGATE_REPO") or str(Path(__file__).resolve().parents[2])
SC = os.environ.get("DELEGATE_WORK") or tempfile.mkdtemp(prefix="delegate")

BOILER_DECL = re.compile(r"^let\s+(serverProcess|dbPath|serverOutput|up)\b")


def block(lines, start_pat):
    for i, l in enumerate(lines):
        if re.match(start_pat, l):
            for j in range(i + 1, len(lines)):
                if lines[j].rstrip() == "});":
                    return i, j
    return None


def pieces(path):
    lines = open(os.path.join(WT, path)).read().split("\n")
    out = {}

    for l in lines:
        if "child_process" in l and "require(" in l:
            out["spawn_req"] = l
            break

    idx = [i for i, l in enumerate(lines) if BOILER_DECL.match(l)]
    if idx:
        lo, hi = min(idx), max(idx)
        # 사이에 낀 줄이 전부 boilerplate 선언일 때만 한 묶음으로 본다.
        if all(BOILER_DECL.match(lines[i]) or not lines[i].strip() for i in range(lo, hi + 1)):
            out["decls"] = "\n".join(lines[lo:hi + 1])

    b = block(lines, r"^before\(")
    a = block(lines, r"^after\(")
    if not b or not a:
        return None
    out["before"] = "\n".join(lines[b[0]:b[1] + 1])
    out["after"] = "\n".join(lines[a[0]:a[1] + 1])

    # before 안에서 서버 기동 뒤에 하던 준비 작업 — 헬퍼 호출 뒤로 그대로 옮긴다
    body = lines[b[0] + 1:b[1]]
    cut = 0
    for i, l in enumerate(body):
        if "throw new Error(`서버가" in l:
            cut = i + 1
    out["setup"] = "\n".join(body[cut:]).strip("\n")
    out["tests"] = sum(1 for l in lines if re.match(r"^\s*(test|it)\(", l))
    return out


def main():
    n, files = sys.argv[1], sys.argv[2:]
    o = ["아래 파일들에서 **서버를 띄우는 부분만** 공용 헬퍼로 바꾼다.\n",
         "파일마다 바꿀 조각을 짝지어 적었다. **적힌 조각만** 바꾸고 나머지는 한 글자도\n"
         "건드리지 않는다.\n"]

    for f in files:
        p = pieces(f)
        if not p:
            print(f"건너뜀: {f}", file=sys.stderr)
            continue
        o.append(f"\n## `{f}`\n")
        k = 0
        if "spawn_req" in p:
            k += 1
            o.append(f"**{k}. require 한 줄**\n")
            o.append("찾기\n```js\n" + p["spawn_req"] + "\n```\n")
            o.append("바꾸기\n```js\nconst { startTestServer } = require('./helpers/testServer');\n```\n")
        if "decls" in p:
            k += 1
            o.append(f"**{k}. 기동용 변수 선언**\n")
            o.append("찾기\n```js\n" + p["decls"] + "\n```\n")
            o.append("바꾸기\n```js\nlet server;\nlet dbPath;\n```\n")
        setup = ("\n" + p["setup"] + "\n") if p["setup"] else ""
        k += 1
        o.append(f"**{k}. before 블록**\n")
        o.append("찾기\n```js\n" + p["before"] + "\n```\n")
        o.append("바꾸기\n```js\nbefore(async () => {\n"
                 "  server = await startTestServer({ port: PORT });\n"
                 "  dbPath = server.dbPath;\n" + setup + "});\n```\n")
        k += 1
        o.append(f"**{k}. after 블록**\n")
        o.append("찾기\n```js\n" + p["after"] + "\n```\n")
        o.append("바꾸기\n```js\nafter(() => {\n  if (server) server.stop();\n});\n```\n")
        o.append(f"이 파일의 `test`/`it` 블록은 {p['tests']}개다. 작업 후에도 {p['tests']}개여야 한다.\n")

    o.append("\n# 하지 말 것\n")
    o.append("- 위에 적지 않은 줄을 지우거나 고치지 마라. 헬퍼 함수, `require`, 주석,\n"
             "  단언, `const PORT`/`const BASE` 전부 그대로 둔다.\n")
    o.append("- `src/server.js` 를 요청하지 마라. 볼 필요 없다.\n")
    o.append("\n# 검증\n\n```\nnode --test " + " ".join(files) + "\n```\n")

    path = os.path.join(SC, f"aider-379-batch{n}.md")
    open(path, "w").write("\n".join(o))
    print(f"batch{n} 스펙: {os.path.getsize(path)} 바이트")


if __name__ == "__main__":
    main()
