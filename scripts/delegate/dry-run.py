"""스펙의 찾기/바꾸기를 그대로 적용해 본다. 스펙이 옳으면 이것만으로 테스트가 통과한다."""
import re, sys, os, tempfile
import subprocess, shutil
from pathlib import Path
SC=os.environ.get("DELEGATE_WORK") or tempfile.mkdtemp(prefix="delegate")
WT=os.environ.get("DELEGATE_REPO") or str(Path(__file__).resolve().parents[2])
n=sys.argv[1]; files=sys.argv[2:]
spec=open(f"{SC}/aider-379-batch{n}.md").read()
applied=[]
for f in files:
    sec=spec.split(f"## `{f}`")[1].split("\n## `")[0]
    pairs=re.findall(r"찾기\n```js\n(.*?)\n```\n\n바꾸기\n```js\n(.*?)\n```", sec, re.S)
    p=os.path.join(WT,f); src=open(p).read(); orig=src
    for find, repl in pairs:
        if find not in src:
            print(f"  ✖ {f}: 찾기 블록 불일치\n---\n{find[:200]}\n---"); sys.exit(1)
        src=src.replace(find, repl, 1)
    shutil.copy(p, f"{SC}/dry-{os.path.basename(f)}")
    open(p,"w").write(src); applied.append((p, f"{SC}/dry-{os.path.basename(f)}"))
    print(f"  적용 {f}: {len(pairs)}쌍")
r=subprocess.run(["node","--test"]+files, cwd=WT, capture_output=True, text=True)
out=r.stdout
for line in out.splitlines():
    if line.startswith("ℹ tests") or line.startswith("ℹ pass") or line.startswith("ℹ fail"):
        print("  "+line)
if "fail 0" not in out:
    for line in out.splitlines():
        if "Error" in line: print("  "+line.strip()); break
for p,b in applied: shutil.copy(b,p)
print("  (원복 완료)")
