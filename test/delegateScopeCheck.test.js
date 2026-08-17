'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 위임 하네스의 범위 검사를 잠근다 (#580).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 이 테스트가 필요한가
//
// 예전 검사는 `git status --porcelain` 을 before/after 로 떠서 새로 나타난 줄만
// stray 로 봤다. 그 한 줄은 `(상태) (경로)` 뿐이라 **내용 변화를 담지 않는다.**
// 그래서 이미 ` M` 인 파일은 모델이 428줄을 지워도 양쪽에 같은 줄로 남아 통과했다.
//
// 2026-08-12 에 그렇게 `src/routes/cardStrategy.js` 를 두 번 잃었다. 첫 번째는
// 러너를 죽인 탓으로 봤고, 두 번째에 스냅샷을 직접 열어 보고서야 원인을 알았다.
// **가드가 조용히 통과하는 실패**라 산출물만 보고는 알 수 없다 — 그래서 잠근다.
//
// 마지막 케이스가 그 사각지대 자체를 재현한다. 경로만 비교하는 예전 방식으로는
// 그 케이스가 통과해 버리는 것도 같이 확인한다.

const SCRIPT = path.join(__dirname, '..', 'scripts', 'delegate', 'scope-snapshot.sh');

// 임시 git 저장소를 만든다. 실거래 저장소에서 돌리면 이 테스트가 남의 작업 트리를
// 읽어 결과가 흔들린다.
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-check-'));
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'source.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, 'other.js'), 'module.exports = 2;\n');
  // git status 가 보여주지 않는 파일. 읽기 전용 인자가 값을 갖는 자리다(아래 테스트).
  fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored.json\n');
  fs.writeFileSync(path.join(dir, 'ignored.json'), '{"a":1}\n');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return dir;
}

function run(dir, args) {
  const r = spawnSync('zsh', [SCRIPT, ...args], { cwd: dir, encoding: 'utf-8' });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// before 스냅샷 → 콜백이 파일을 건드림 → compare. compare 의 결과를 돌려준다.
//
// 스냅샷은 **저장소 밖**에 둔다. 안에 두면 그 파일이 untracked 로 잡혀 자기 자신이
// stray 가 된다. 실제 하네스도 `$SC`(DELEGATE_WORK)를 저장소 밖으로 잡는다.
function roundTrip(dir, { target, reads = [], mutate }) {
  const snapDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-snap-'));
  const before = path.join(snapDir, 'before');
  const after = path.join(snapDir, 'after');
  const snap = run(dir, ['snapshot', before, ...reads]);
  assert.equal(snap.code, 0, `snapshot 실패: ${snap.stderr}`);
  mutate();
  return run(dir, ['compare', before, after, target, ...reads]);
}

test('대상 파일만 만들면 통과한다', (t) => {
  const dir = makeRepo();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const r = roundTrip(dir, {
    target: 'test/new.test.js',
    reads: ['source.js'],
    mutate: () => {
      fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'test/new.test.js'), 'test("x", () => {});\n');
    },
  });

  assert.equal(r.code, 0, `통과해야 하는데 stray 로 잡았다: ${r.stdout}`);
  assert.equal(r.stdout.trim(), '');
});

test('읽기 전용으로 넘긴 파일을 덮어쓰면 잡는다', (t) => {
  const dir = makeRepo();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const r = roundTrip(dir, {
    target: 'test/new.test.js',
    reads: ['source.js'],
    mutate: () => fs.writeFileSync(path.join(dir, 'source.js'), '// 통째로 덮였다\n'),
  });

  assert.equal(r.code, 1, '읽기 전용 소스가 덮였는데 통과했다');
  assert.match(r.stdout, /source\.js/);
});

test('이미 수정돼 있던 파일을 더 고치면 잡는다 — 여기가 새던 자리다', (t) => {
  const dir = makeRepo();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // 라운드 시작 전부터 ` M` 인 상태를 만든다.
  fs.writeFileSync(path.join(dir, 'other.js'), 'module.exports = 2; // 사람이 고쳐 둔 것\n');

  const r = roundTrip(dir, {
    target: 'test/new.test.js',
    reads: ['source.js'],
    // 모델이 그 파일을 통째로 지운다. git status 의 줄은 ` M other.js` 로 **그대로**다.
    mutate: () => fs.writeFileSync(path.join(dir, 'other.js'), ''),
  });

  assert.equal(r.code, 1, '이미 수정된 파일의 추가 오염을 못 잡았다');
  assert.match(r.stdout, /other\.js/);
});

test('경로만 비교하는 예전 방식은 그 사각지대를 통과시킨다', (t) => {
  const dir = makeRepo();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(dir, 'other.js'), 'module.exports = 2; // 사람이 고쳐 둔 것\n');

  // 예전 검사와 같은 방식: `git status --porcelain` 의 줄을 before/after 로 비교한다.
  const status = () =>
    spawnSync('git', ['status', '--porcelain=v1'], { cwd: dir, encoding: 'utf-8' }).stdout;

  const before = status();
  fs.writeFileSync(path.join(dir, 'other.js'), '');
  const after = status();

  // 두 스냅샷이 글자 그대로 같다. 그래서 `comm -13` 이 비고 가드가 통과했다.
  assert.equal(before, after, '예전 방식이 이 케이스를 잡는다면 이 테스트의 전제가 틀렸다');
  assert.match(before, / M other\.js/);
});

test('배치 밖에 새 파일이 생기면 잡는다', (t) => {
  const dir = makeRepo();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const r = roundTrip(dir, {
    target: 'test/new.test.js',
    reads: [],
    // 모델이 파일 이름만 보고 저장소 루트에 딴 파일을 만드는 실제 실패 형태다.
    mutate: () => fs.writeFileSync(path.join(dir, 'new.test.js'), 'test("x", () => {});\n'),
  });

  assert.equal(r.code, 1, '배치 밖 새 파일을 못 잡았다');
  assert.match(r.stdout, /new\.test\.js/);
});

test('git status 가 안 보여주는 파일도 읽기 전용으로 넘겼으면 지킨다', (t) => {
  const dir = makeRepo();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // 먼저 전제를 확인한다 — gitignore 된 파일은 `--untracked-files=all` 로도 안 뜬다.
  // 그래서 이 파일의 변화는 **읽기 전용 인자로 넘기지 않으면 아무도 못 본다.**
  fs.writeFileSync(path.join(dir, 'ignored.json'), '{"a":2}\n');
  const status = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: dir,
    encoding: 'utf-8',
  }).stdout;
  assert.equal(status.trim(), '', `전제가 틀렸다 — gitignore 된 파일이 status 에 떴다: ${status}`);

  const r = roundTrip(dir, {
    target: 'test/new.test.js',
    reads: ['ignored.json'],
    mutate: () => fs.writeFileSync(path.join(dir, 'ignored.json'), '{"a":3}\n'),
  });

  assert.equal(r.code, 1, '읽기 전용으로 넘긴 파일이 바뀌었는데 통과했다');
  assert.match(r.stdout, /ignored\.json/);
});

test('파일이 사라지는 것도 변화로 본다', (t) => {
  const dir = makeRepo();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const r = roundTrip(dir, {
    target: 'test/new.test.js',
    reads: ['source.js'],
    mutate: () => fs.rmSync(path.join(dir, 'source.js')),
  });

  assert.equal(r.code, 1, '읽기 전용 소스가 지워졌는데 통과했다');
  assert.match(r.stdout, /source\.js/);
});
