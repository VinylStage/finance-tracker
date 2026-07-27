const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert');

let api, ApiError, apiRequest;
let categoryStyle, CATEGORY_STYLE, AMOUNT_MARK;
let localYMD, localYearMonth;
let NAV_GROUPS, MOBILE_PRIMARY, groupForPath;

// fetch 가짜. 테스트마다 next 를 갈아끼운다.
let nextResponse = null;
let lastCall = null;

function fakeResponse({ ok = true, status = 200, type = 'application/json', body = {} } = {}) {
  return {
    ok, status,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? type : null) },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

before(async () => {
  globalThis.fetch = async (path, options) => {
    lastCall = { path, options };
    if (nextResponse instanceof Error) throw nextResponse;
    return nextResponse;
  };
  ({ api, ApiError, apiRequest } = await import('../client/src/lib/api.js'));
  ({ categoryStyle, CATEGORY_STYLE, AMOUNT_MARK } = await import('../client/src/lib/categoryStyle.js'));
  ({ localYMD, localYearMonth } = await import('../client/src/lib/date.js'));
  ({ NAV_GROUPS, MOBILE_PRIMARY, groupForPath } = await import('../client/src/lib/nav.js'));
});

beforeEach(() => { nextResponse = null; lastCall = null; });

describe('A. api.js', () => {
  describe('A-1. 성공 경로', () => {
    test('JSON 응답이면 파싱된 객체를 그대로 돌려준다', async () => {
      nextResponse = fakeResponse({ ok: true, body: { x: 1 } });
      const result = await apiRequest('/x');
      assert.deepStrictEqual(result, { x: 1 });
    });

    test('text/html 응답이면 문자열을 돌려준다', async () => {
      nextResponse = fakeResponse({ ok: true, type: 'text/html', body: '<html></html>' });
      const result = await apiRequest('/x');
      assert.strictEqual(result, '<html></html>');
    });

    test('api.get(\'/x\') 는 fetch 를 \'/x\' 로 부른다', async () => {
      nextResponse = fakeResponse({ ok: true, body: {} });
      await api.get('/x');
      assert.strictEqual(lastCall.path, '/x');
    });

    test('api.post(\'/x\', { a: 1 }) 는 method: \'POST\', Content-Type: application/json, body: \'{"a":1}\' 로 부른다', async () => {
      nextResponse = fakeResponse({ ok: true, body: {} });
      await api.post('/x', { a: 1 });
      assert.strictEqual(lastCall.options.method, 'POST');
      assert.strictEqual(lastCall.options.headers['Content-Type'], 'application/json');
      assert.strictEqual(lastCall.options.body, '{"a":1}');
    });

    test('api.del(\'/x\') 는 본문 없이 method: \'DELETE\' — lastCall.options.body 가 undefined', async () => {
      nextResponse = fakeResponse({ ok: true, body: {} });
      await api.del('/x');
      assert.strictEqual(lastCall.options.method, 'DELETE');
      assert.strictEqual(lastCall.options.body, undefined);
    });

    test('api.del(\'/x\', { ids: [1] }) 는 본문을 실어 보낸다', async () => {
      nextResponse = fakeResponse({ ok: true, body: {} });
      await api.del('/x', { ids: [1] });
      assert.strictEqual(lastCall.options.method, 'DELETE');
      assert.strictEqual(lastCall.options.body, '{"ids":[1]}');
    });
  });

  describe('A-2. 실패 경로', () => {
    test('ok: false + { error: \'메시지\' } 이면 ApiError 가 던져지고 message 가 \'메시지\'', async () => {
      nextResponse = fakeResponse({ ok: false, status: 400, body: { error: '메시지' } });
      try {
        await apiRequest('/x');
        assert.fail('ApiError should have been thrown');
      } catch (e) {
        assert.ok(e instanceof ApiError);
        assert.strictEqual(e.message, '메시지');
      }
    });

    test('그때 status 와 body 가 ApiError 에 담긴다', async () => {
      nextResponse = fakeResponse({ ok: false, status: 500, body: { error: 'error' } });
      try {
        await apiRequest('/x');
        assert.fail('ApiError should have been thrown');
      } catch (e) {
        assert.strictEqual(e.status, 500);
        assert.deepStrictEqual(e.body, { error: 'error' });
      }
    });

    test('fetch 자체가 throw 하면(\'서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.\') 로 정규화되고 status 가 0', async () => {
      nextResponse = new Error('boom');
      try {
        await apiRequest('/x');
        assert.fail('ApiError should have been thrown');
      } catch (e) {
        assert.ok(e instanceof ApiError);
        assert.strictEqual(e.message, '서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.');
        assert.strictEqual(e.status, 0);
      }
    });

    test('ok: false 이고 본문이 200자를 넘는 문자열이면 원문 대신 요청 실패 (<status>) 형태가 된다', async () => {
      const longBody = 'x'.repeat(201);
      nextResponse = fakeResponse({ ok: false, status: 500, body: longBody });
      try {
        await apiRequest('/x');
        assert.fail('ApiError should have been thrown');
      } catch (e) {
        assert.strictEqual(e.message, '요청 실패 (500)');
      }
    });

    test('ok: false 이고 본문이 짧은 문자열이면 그 문자열이 메시지가 된다', async () => {
      nextResponse = fakeResponse({ ok: false, status: 400, body: 'short error' });
      try {
        await apiRequest('/x');
        assert.fail('ApiError should have been thrown');
      } catch (e) {
        assert.strictEqual(e.message, 'short error');
      }
    });

    test('JSON 파싱이 실패해도 던지지 않고 진행한다 — ok: false 일 때 메시지가 요청 실패 (<status>) 가 된다', async () => {
      nextResponse = {
        ok: false,
        status: 500,
        headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => { throw new Error('parse error'); },
        text: async () => '{"error": "parse error"}',
      };
      try {
        await apiRequest('/x');
        assert.fail('ApiError should have been thrown');
      } catch (e) {
        assert.strictEqual(e.message, '요청 실패 (500)');
      }
    });
  });
});

describe('B. categoryStyle.js', () => {
  test('CATEGORY_STYLE 의 키가 정확히 7개다', () => {
    assert.strictEqual(Object.keys(CATEGORY_STYLE).length, 7);
  });

  test('알려진 대분류 각각에 대해 categoryStyle(x) 가 icon 과 color 를 돌려준다', () => {
    const knownTypes = ['수입', '고정지출', '변동필수', '부채상환', '선택지출', '저축', '미분류'];
    for (const type of knownTypes) {
      const style = categoryStyle(type);
      assert.ok(style.icon);
      assert.ok(style.color);
      assert.ok(style.color.startsWith('text-'));
    }
  });

  test('categoryStyle(\'없는값\') 이 폴백(icon: \'❓\', color: \'text-ink-muted\')을 돌려준다', () => {
    const style = categoryStyle('없는값');
    assert.strictEqual(style.icon, '❓');
    assert.strictEqual(style.color, 'text-ink-muted');
  });

  test('categoryStyle(undefined), categoryStyle(null), categoryStyle(\'\') 도 폴백', () => {
    assert.deepStrictEqual(categoryStyle(undefined), { icon: '❓', color: 'text-ink-muted' });
    assert.deepStrictEqual(categoryStyle(null), { icon: '❓', color: 'text-ink-muted' });
    assert.deepStrictEqual(categoryStyle(''), { icon: '❓', color: 'text-ink-muted' });
  });

  test('AMOUNT_MARK.income.arrow 가 \'▲\', AMOUNT_MARK.expense.arrow 가 \'▼\'', () => {
    assert.strictEqual(AMOUNT_MARK.income.arrow, '▲');
    assert.strictEqual(AMOUNT_MARK.expense.arrow, '▼');
  });

  test('모든 스타일의 color 가 text- 로 시작한다 — 토큰 클래스 규약', () => {
    for (const style of Object.values(CATEGORY_STYLE)) {
      assert.ok(style.color.startsWith('text-'));
    }
  });
});

describe('C. date.js', () => {
  test('new Date(2026, 0, 5) 입력 시 localYMD 가 \'2026-01-05\'', () => {
    const result = localYMD(new Date(2026, 0, 5));
    assert.strictEqual(result, '2026-01-05');
  });

  test('new Date(2026, 11, 31) 입력 시 localYMD 가 \'2026-12-31\'', () => {
    const result = localYMD(new Date(2026, 11, 31));
    assert.strictEqual(result, '2026-12-31');
  });

  test('new Date(2026, 6, 1) 입력 시 localYMD 가 \'2026-07-01\'', () => {
    const result = localYMD(new Date(2026, 6, 1));
    assert.strictEqual(result, '2026-07-01');
  });

  test('월·일이 한 자리일 때 0 으로 채워지는지 확인', () => {
    const result = localYMD(new Date(2026, 0, 5));
    assert.strictEqual(result, '2026-01-05');
  });

  test('인자를 안 주면 오늘 날짜를 쓴다 — 형식이 /^\d{4}-\d{2}-\d{2}$/ 를 만족하는지만 확인', () => {
    const result = localYMD();
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result));
  });

  test('localYearMonth 가 정확히 년-월을 반환한다', () => {
    assert.strictEqual(localYearMonth(new Date(2026, 0, 5)), '2026-01');
    assert.strictEqual(localYearMonth(new Date(2026, 11, 31)), '2026-12');
    assert.strictEqual(localYearMonth(new Date(2026, 6, 1)), '2026-07');
  });
});

describe('D. nav.js', () => {
  test('NAV_GROUPS 가 5개다', () => {
    assert.strictEqual(NAV_GROUPS.length, 5);
  });

  test('각 그룹에 id, label, path, icon 이 있다', () => {
    for (const group of NAV_GROUPS) {
      assert.ok(group.id);
      assert.ok(group.label);
      assert.ok(group.path);
      assert.ok(group.icon);
    }
  });

  test('MOBILE_PRIMARY 가 정확히 [\'home\', \'transactions\', \'analysis\']', () => {
    assert.deepStrictEqual(MOBILE_PRIMARY, ['home', 'transactions', 'analysis']);
  });

  test('MOBILE_PRIMARY 의 모든 id 가 NAV_GROUPS 에 실재한다', () => {
    for (const id of MOBILE_PRIMARY) {
      assert.ok(NAV_GROUPS.some(g => g.id === id));
    }
  });

  test('groupForPath(\'/\') 는 home 그룹을 돌려준다', () => {
    const result = groupForPath('/');
    assert.strictEqual(result.id, 'home');
  });

  test('groupForPath(\'/transactions\') 는 transactions 그룹을 돌려준다', () => {
    const result = groupForPath('/transactions');
    assert.strictEqual(result.id, 'transactions');
  });

  test('groupForPath(\'/analysis\') 는 analysis 그룹을 돌려준다', () => {
    const result = groupForPath('/analysis');
    assert.strictEqual(result.id, 'analysis');
  });

  test('groupForPath(\'/analysis/comparison\') 는 analysis 그룹을 돌려준다', () => {
    const result = groupForPath('/analysis/comparison');
    assert.strictEqual(result.id, 'analysis');
  });

  test('groupForPath(\'/assets/savings\') 는 assets 그룹을 돌려준다', () => {
    const result = groupForPath('/assets/savings');
    assert.strictEqual(result.id, 'assets');
  });

  test('groupForPath(\'/settings\') 는 settings 그룹을 돌려준다', () => {
    const result = groupForPath('/settings');
    assert.strictEqual(result.id, 'settings');
  });

  test('\'/analysis-x\' 는 analysis 로 매칭되면 안 된다 — 구분자까지 비교해야 한다', () => {
    const result = groupForPath('/analysis-x');
    assert.ok(!result || result.id !== 'analysis');
  });

  test('\'/\' 가 모든 경로의 접두사인데도 /transactions 가 home 으로 가지 않는지 확인', () => {
    const result = groupForPath('/transactions');
    assert.strictEqual(result.id, 'transactions');
  });
});
