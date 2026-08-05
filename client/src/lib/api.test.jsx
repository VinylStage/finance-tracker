import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, apiRequest, ApiError } from './api';

// 모든 화면의 요청이 지나는 단일 통로인데 커버리지가 0% 였다.
//
// 이 래퍼가 있는 이유가 곧 검사해야 할 것이다. 기존 클라이언트는 `res.ok` 를
// 대부분 안 봐서 서버가 4xx/5xx 를 줘도 그대로 진행했고(로딩이 안 끝나거나
// 빈 화면), 500 이 HTML 로 오면 `r.json()` 이 던지며 렌더가 멈췄다.
//
// 그래서 여기서 잠그는 것은 "성공하면 값을 준다" 가 아니라 **"실패를 실패로
// 만드는가"** 다.

function mockFetch(impl) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(impl);
}

// Response 를 직접 만들면 jsdom 구현에 따라 헤더 처리가 달라진다.
// 이 래퍼가 실제로 보는 것(ok · status · headers.get · json · text)만 흉내낸다.
function res({ ok = true, status = 200, type = 'application/json', body = {} } = {}) {
  return {
    ok,
    status,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? type : null) },
    json: async () => {
      if (typeof body === 'string') throw new SyntaxError('Unexpected token');
      return body;
    },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('실패를 실패로 만든다', () => {
  it('4xx 면 서버가 준 문구를 그대로 던진다', async () => {
    mockFetch(async () => res({
      ok: false, status: 400, body: { error: '전체 삭제는 추가 확인이 필요합니다.' },
    }));

    // 여기서 안 던지면 화면은 실패를 성공으로 알고 다음 단계로 넘어간다.
    await expect(api.get('/api/x')).rejects.toThrow(ApiError);
    await expect(api.get('/api/x')).rejects.toThrow('전체 삭제는 추가 확인이 필요합니다.');
  });

  it('500 이 HTML 로 와도 렌더가 안 멈춘다', async () => {
    // 이 래퍼가 생긴 직접적인 이유. `r.json()` 이 던지면 그 위 컴포넌트가 통째로 죽는다.
    // 프록시(nginx 등)의 기본 오류 페이지는 보통 200자를 넘는다.
    const html = `<!doctype html><html><head><title>500 Internal Server Error</title></head>`
      + `<body><center><h1>500 Internal Server Error</h1></center>`
      + `<hr><center>nginx/1.25.3</center></body></html>`.padEnd(160, ' ');
    expect(html.length).toBeGreaterThan(200);
    mockFetch(async () => res({ ok: false, status: 500, type: 'text/html', body: html }));

    const err = await api.get('/api/x').catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    // 장문은 사용자에게 그대로 보여주지 않는다 — 상태코드로 대체한다.
    expect(err.message).toBe('요청 실패 (500)');
    // 원본은 버리지 않는다. 화면에는 안 띄워도 진단에는 필요하다.
    expect(err.body).toBe(html);
  });

  it('짧은 비-JSON 본문은 그대로 문구가 된다 — 판정 기준은 길이지 형식이 아니다', async () => {
    // 주석은 "장문(HTML 등)은 그대로 노출하지 않는다" 고 적혀 있지만 구현은
    // **길이만** 본다(`length <= 200`). 그래서 짧은 HTML 은 마크업째 노출된다.
    // 지금 동작을 그대로 박아 둔다 — 바꾸려면 사용자에게 보이는 문구가 바뀌므로
    // 별도 판단이다.
    mockFetch(async () => res({ ok: false, status: 502, type: 'text/html', body: '<h1>502 Bad Gateway</h1>' }));

    const err = await api.get('/api/x').catch((e) => e);

    expect(err.message).toBe('<h1>502 Bad Gateway</h1>');
  });
});

describe('본문 파싱', () => {
  it('JSON 이면 파싱해서 준다', async () => {
    mockFetch(async () => res({ body: { data: [1, 2] } }));

    const result = await api.get('/api/x');

    expect(result).toEqual({ data: [1, 2] });
  });

  it('JSON 이라는데 깨져 있으면 null 로 흡수한다 — 던지지 않는다', async () => {
    // 204 나 손상된 본문에서 던지면 그 화면이 통째로 안 뜬다.
    mockFetch(async () => res({ body: '깨진본문' }));

    const result = await api.get('/api/x');

    expect(result).toBeNull();
  });

  it('JSON 이 아니면 텍스트로 준다', async () => {
    mockFetch(async () => res({ type: 'text/plain', body: 'ok' }));

    const result = await api.get('/api/x');

    expect(result).toBe('ok');
  });

  it('content-type 헤더가 아예 없어도 죽지 않는다', async () => {
    mockFetch(async () => res({ type: null, body: 'ok' }));

    const result = await api.get('/api/x');

    expect(result).toBe('ok');
  });
});

describe('네트워크 자체 실패', () => {
  it('fetch 가 거부하면 ApiError 로 바꾼다', async () => {
    // 원본 TypeError 가 그대로 올라가면 화면마다 다른 문구가 나온다. 한 종류로 모은다.
    mockFetch(async () => { throw new TypeError('Failed to fetch'); });

    const err = await api.get('/api/x').catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/네트워크/);
  });

  it('오프라인과 서버오류를 status 로 구분할 수 있다', async () => {
    // 화면이 "네트워크를 확인해 주세요" 와 "잠시 후 다시" 를 갈라 말하려면
    // 이 구분이 필요하다. 둘 다 같은 문구면 사용자가 할 수 있는 일이 없다.
    // 네트워크 오류
    mockFetch(async () => { throw new TypeError('Failed to fetch'); });
    const networkErr = await api.get('/api/x').catch((e) => e);
    expect(networkErr.status).toBe(0);

    // 서버 오류
    mockFetch(async () => res({ ok: false, status: 500 }));
    const serverErr = await api.get('/api/x').catch((e) => e);
    expect(serverErr.status).toBe(500);
  });
});

describe('메서드별 요청 모양', () => {
  it('get 은 옵션 없이 부른다', async () => {
    const spy = mockFetch(async () => res());
    await api.get('/api/x');

    expect(spy.mock.calls[0][0]).toBe('/api/x');
    expect(spy.mock.calls[0][1]).toBeUndefined();
  });

  it('post 는 JSON 헤더와 직렬화된 본문을 보낸다', async () => {
    const spy = mockFetch(async () => res());
    await api.post('/api/x', { a: 1 });

    const call = spy.mock.calls[0][1];
    expect(call.method).toBe('POST');
    expect(call.headers['Content-Type']).toBe('application/json');
    expect(call.body).toBe('{"a":1}');
  });

  it('put 도 같은 모양이다', async () => {
    const spy = mockFetch(async () => res());
    await api.put('/api/x', { a: 1 });

    const call = spy.mock.calls[0][1];
    expect(call.method).toBe('PUT');
    expect(call.headers['Content-Type']).toBe('application/json');
    expect(call.body).toBe('{"a":1}');
  });

  it('del 은 본문 없이 부를 수 있다', async () => {
    // 본문 없는 DELETE 에 `"undefined"` 문자열이 실려 나가면 서버가 파싱에서 400 을 낸다.
    const spy = mockFetch(async () => res());
    await api.del('/api/x/1');

    const call = spy.mock.calls[0][1];
    expect(call.method).toBe('DELETE');
    expect(call.body).toBeUndefined();
  });

  it('del 에 본문을 주면 JSON 으로 보낸다', async () => {
    const spy = mockFetch(async () => res());
    await api.del('/api/x', { ids: [1, 2] });

    const call = spy.mock.calls[0][1];
    expect(call.method).toBe('DELETE');
    expect(call.body).toBe('{"ids":[1,2]}');
    expect(call.headers['Content-Type']).toBe('application/json');
  });
});

describe('raw', () => {
  it('옵션을 그대로 넘긴다 — FormData 같은 특수 요청용', async () => {
    const spy = mockFetch(async () => res());
    // FormData 에 Content-Type 을 손으로 붙이면 boundary 가 빠져 서버가 못 읽는다.
    const fd = new FormData();
    await api.raw('/api/upload', { method: 'POST', body: fd });

    expect(spy.mock.calls[0][1].body).toBe(fd);
    expect(spy.mock.calls[0][1].headers).toBeUndefined();
  });
});
