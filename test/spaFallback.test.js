const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627).
//
// 처음에 21655 를 잡았는데 **다른 트랙의 #712 가 같은 번호를 썼다**
// (`test/cardOverseasUndo.test.js`). 각자 브랜치에서는 `test:ports` 가 통과하고
// 합친 뒤에만 걸린다 — 그 검사는 자기 트리만 보기 때문이다. 21661 로 옮긴다.
const PORT = 21661;
const BASE = `http://127.0.0.1:${PORT}`;
const PUBLIC_INDEX = path.join(__dirname, '..', 'public', 'index.html');
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

async function get(p) {
  const res = await fetch(`${BASE}${p}`);
  return { status: res.status, type: (res.headers.get('content-type') || '').split(';')[0] };
}

// 빌드 산출물이 없는 환경에서는 폴백이 JSON 안내를 낸다. 그때는 화면 확인을 건너뛴다.
const built = fs.existsSync(PUBLIC_INDEX);

test('화면 주소를 직접 열면 앱이 온다', { skip: !built }, async () => {
  const paths = ['/', '/settings', '/analysis', '/transactions', '/analysis/cards/detail'];
  for (const p of paths) {
    const { status, type } = await get(p);
    assert.strictEqual(status, 200);
    assert.strictEqual(type, 'text/html');
  }
});

test('없는 API 경로는 404 JSON 이다', async () => {
  const { status, type } = await get('/api/이런건없다');
  assert.strictEqual(status, 404);
  assert.strictEqual(type, 'application/json');
});

test('폴백이 `sendFile` 에 `root` 를 준다 — 소스로 못박는다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  assert.match(source, /sendFile\(\s*'index\.html'\s*,\s*\{\s*root:/);
  // 절대경로를 그대로 넘기는 형태가 없는지 확인 — 이 버그는 점으로 시작하는 경로에서만 발생
  assert.doesNotMatch(source, /sendFile\(\s*index\s*\)/);
});

test('정적 자산은 그대로 서빙된다', { skip: !built }, async () => {
  const { status } = await get('/index.html');
  assert.strictEqual(status, 200);
});
