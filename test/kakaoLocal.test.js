'use strict';
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const kakao = require('../src/services/kakaoLocal');

// 카카오 로컬 연동(#275).
//
// **이 파일의 핵심은 "실패해도 던지지 않는다" 다.** 이건 보조 기능이라
// 실패가 거래 입력을 막으면 안 된다. 외부 API 는 실패하고, 쿼터는 소진되고,
// 키는 없을 수 있다 — 전부 정상 경로다.
//
// 실제 API 를 부르지 않는다. `fetch` 를 갈아끼워 응답을 만든다 — 외부 호출에
// 의존하는 테스트는 오프라인에서 깨지고 쿼터도 쓴다.

const REAL_FETCH = globalThis.fetch;
const KEY = 'KAKAO_REST_API_KEY';
let savedKey;

function mockFetch(impl) {
  globalThis.fetch = impl;
}

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  savedKey = process.env[KEY];
  process.env[KEY] = 'test-key-1234';
  kakao.resetStats();
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  if (savedKey === undefined) delete process.env[KEY];
  else process.env[KEY] = savedKey;
});

describe('A. 키가 없으면 꺼진다', () => {
  test('A-1. 키가 없으면 disabled 를 돌려주고 호출하지 않는다', async () => {
    delete process.env[KEY];
    let called = false;
    mockFetch(async () => { called = true; return jsonResponse({}); });

    const r = await kakao.lookupMerchant('스타벅스');

    assert.deepEqual(r, { ok: false, reason: 'disabled' });
    assert.equal(called, false, '키가 없는데 외부를 불렀다');
    assert.equal(kakao.isEnabled(), false);
  });

  test('A-2. 빈 문자열 키도 꺼진 것으로 본다', async () => {
    process.env[KEY] = '';
    assert.equal(kakao.isEnabled(), false);
    assert.equal((await kakao.lookupMerchant('스타벅스')).reason, 'disabled');
  });
});

describe('B. 정상 조회', () => {
  test('B-1. 분류를 앱 대분류로 옮겨 돌려준다', async () => {
    mockFetch(async () => jsonResponse({
      documents: [{ place_name: '스타벅스 강남점', category_group_name: '카페', category_name: '음식점 > 카페 > 스타벅스' }],
    }));

    const r = await kakao.lookupMerchant('스타벅스');

    assert.equal(r.ok, true);
    assert.equal(r.group, '카페');
    assert.equal(r.majorType, '선택지출');
    assert.equal(r.name, '음식점 > 카페 > 스타벅스');
  });

  test('B-2. 키를 URL 이 아니라 Authorization 헤더로 보낸다', async () => {
    let seenUrl, seenHeaders;
    mockFetch(async (url, opts) => {
      seenUrl = url; seenHeaders = opts && opts.headers;
      return jsonResponse({ documents: [{ category_group_name: '카페' }] });
    });

    await kakao.lookupMerchant('스타벅스');

    assert.ok(!seenUrl.includes('test-key-1234'), 'URL 에 키가 실렸다');
    assert.equal(seenHeaders.Authorization, 'KakaoAK test-key-1234');
  });

  test('B-3. 가맹점명을 URL 인코딩한다', async () => {
    let seenUrl;
    mockFetch(async (url) => { seenUrl = url; return jsonResponse({ documents: [] }); });

    await kakao.lookupMerchant('김밥 & 라면');

    assert.ok(!seenUrl.includes(' '), '공백이 그대로 들어갔다');
    assert.ok(seenUrl.includes(encodeURIComponent('김밥 & 라면')));
  });
});

describe('C. 실패해도 던지지 않는다 — 이 파일의 핵심', () => {
  test('C-1. 네트워크 실패는 error 로 돌아온다', async () => {
    mockFetch(async () => { throw new Error('network down'); });

    const r = await kakao.lookupMerchant('스타벅스');

    assert.deepEqual(r, { ok: false, reason: 'error' });
  });

  test('C-2. 쿼터 소진(429)도 던지지 않는다', async () => {
    mockFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }));

    const r = await kakao.lookupMerchant('스타벅스');

    assert.equal(r.ok, false);
    assert.equal(r.reason, 'error');
  });

  test('C-3. 에러 메시지에 키가 새지 않는다', async () => {
    mockFetch(async () => { throw new Error('failed for key test-key-1234'); });

    await kakao.lookupMerchant('스타벅스');

    const stats = kakao.getStats();
    assert.ok(!String(stats.lastError).includes('test-key-1234'), `키 노출: ${stats.lastError}`);
    assert.ok(String(stats.lastError).includes('***'), '마스킹이 안 됐다');
  });

  test('C-4. 응답에 documents 가 없어도 견딘다', async () => {
    for (const body of [{}, { documents: null }, { documents: 'x' }, null]) {
      mockFetch(async () => jsonResponse(body));
      const r = await kakao.lookupMerchant('스타벅스');
      assert.equal(r.ok, false, `body=${JSON.stringify(body)} 에서 던지거나 성공했다`);
      assert.equal(r.reason, 'not-found');
    }
  });

  test('C-5. category_group_name 이 없는 장소는 not-found 다', async () => {
    // 카카오가 이 필드를 안 주는 장소가 실제로 있다.
    mockFetch(async () => jsonResponse({ documents: [{ place_name: '어떤곳' }] }));

    const r = await kakao.lookupMerchant('어떤곳');

    assert.deepEqual(r, { ok: false, reason: 'not-found' });
  });

  test('C-6. 빈 가맹점명은 부르지 않는다', async () => {
    let called = false;
    mockFetch(async () => { called = true; return jsonResponse({}); });

    for (const bad of ['', '   ', null, undefined, 123]) {
      const r = await kakao.lookupMerchant(bad);
      assert.equal(r.reason, 'invalid-input', `${JSON.stringify(bad)} 가 통과됐다`);
    }
    assert.equal(called, false, '빈 입력으로 쿼터를 썼다');
  });
});

describe('D. 호출 횟수를 센다', () => {
  test('D-1. 쿼터 소진 전에 알 수 있어야 한다', async () => {
    mockFetch(async () => jsonResponse({ documents: [{ category_group_name: '카페' }] }));

    assert.equal(kakao.getStats().calls, 0);
    await kakao.lookupMerchant('a');
    await kakao.lookupMerchant('b');
    assert.equal(kakao.getStats().calls, 2);
  });

  test('D-2. 부르지 않은 경우는 세지 않는다', async () => {
    delete process.env[KEY];
    await kakao.lookupMerchant('스타벅스');
    process.env[KEY] = 'test-key-1234';
    await kakao.lookupMerchant('');

    assert.equal(kakao.getStats().calls, 0, '안 부른 것을 셌다');
  });
});
