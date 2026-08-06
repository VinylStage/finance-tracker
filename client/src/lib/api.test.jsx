import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, apiRequest, ApiError } from './api';

// 모든 화면이 서버와 통신하는 단일 통로인데 테스트가 하나도 없었다(구문 0% / 분기 0%).
//
// 이 파일이 생긴 이유가 파일 주석에 적혀 있다 — 예전 클라이언트는 `res.ok` 를
// 확인하지 않아 서버가 4xx/5xx 를 내도 그대로 진행했고(로딩이 안 걷히거나 빈 화면),
// 500 이 HTML 로 오면 `r.json()` 이 던지면서 렌더가 멈췄다.
//
// **그 처리가 맞는지는 아무도 확인하지 않았다.** 여기가 조용히 깨지면 증상이
// 화면마다 다르게 나타나서 원인을 찾기 어렵다.

function jsonResponse(body, { status = 200, ok = status < 400 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json; charset=utf-8' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function textResponse(text, { status = 200, ok = status < 400, type = 'text/plain' } = {}) {
  return {
    ok,
    status,
    headers: { get: () => type },
    json: async () => { throw new Error('본문이 JSON 이 아니다'); },
    text: async () => text,
  };
}

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('성공 응답', () => {
  it('JSON 본문을 그대로 돌려준다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [1, 2] }));
    await expect(apiRequest('/api/x')).resolves.toEqual({ data: [1, 2] });
  });

  it('JSON 이 아니면 텍스트로 돌려준다', async () => {
    // 가이드 문서가 text/markdown 으로 온다. JSON 으로만 파싱하면 화면이 죽는다.
    fetchMock.mockResolvedValue(textResponse('# 가이드', { type: 'text/markdown' }));
    await expect(apiRequest('/api/guide')).resolves.toBe('# 가이드');
  });

  it('JSON 이라 했는데 깨져 있으면 null 로 흡수한다', async () => {
    // 204 나 손상된 본문에서 던지면 호출부가 전부 try/catch 를 달아야 한다.
    fetchMock.mockResolvedValue({
      ok: true, status: 204,
      headers: { get: () => 'application/json' },
      json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
      text: async () => '',
    });
    await expect(apiRequest('/api/x')).resolves.toBeNull();
  });
});

describe('오류 응답', () => {
  it('4xx 면 ApiError 를 던지고 상태와 본문을 싣는다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: '이미 등록된 카드입니다.' }, { status: 409 }));
    await expect(apiRequest('/api/x')).rejects.toMatchObject({
      name: 'ApiError',
      message: '이미 등록된 카드입니다.',
      status: 409,
      body: { error: '이미 등록된 카드입니다.' },
    });
  });

  it('서버가 준 error 문구를 그대로 쓴다', async () => {
    // 라우트들이 사용자에게 보여줄 문장을 내려준다. 여기서 갈아치우면 그 문장이
    // 화면에 못 간다.
    fetchMock.mockResolvedValue(jsonResponse({ error: '되돌릴 작업이 없어요.' }, { status: 400 }));
    await expect(apiRequest('/api/x')).rejects.toThrow('되돌릴 작업이 없어요.');
  });

  it('HTML 500 처럼 긴 본문은 화면에 흘리지 않는다', async () => {
    // 스택 트레이스가 담긴 HTML 오류 페이지가 그대로 뜨면 안 된다.
    const html = '<!DOCTYPE html><html><body>' + 'x'.repeat(400) + '</body></html>';
    fetchMock.mockResolvedValue(textResponse(html, { status: 500, type: 'text/html' }));
    const err = await apiRequest('/api/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('요청 실패 (500)');
    expect(err.message).not.toContain('DOCTYPE');
  });

  it('짧은 텍스트 오류는 그대로 보여준다', async () => {
    fetchMock.mockResolvedValue(textResponse('Not Found', { status: 404, type: 'text/plain' }));
    await expect(apiRequest('/api/x')).rejects.toThrow('Not Found');
  });

  it('본문이 비어 있으면 상태코드로 대체한다', async () => {
    fetchMock.mockResolvedValue(textResponse('   ', { status: 502, type: 'text/plain' }));
    await expect(apiRequest('/api/x')).rejects.toThrow('요청 실패 (502)');
  });
});

describe('네트워크 자체 실패', () => {
  it('fetch 가 거부하면 status 0 인 ApiError 로 바꾼다', async () => {
    // offline 이나 서버가 안 떠 있을 때다. 원래 TypeError 가 그대로 올라가면
    // 화면마다 다른 문구가 뜬다.
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await apiRequest('/api/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toContain('네트워크');
  });
});

describe('메서드별 호출 모양', () => {
  it('get 은 옵션 없이 부른다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await api.get('/api/x');
    expect(fetchMock).toHaveBeenCalledWith('/api/x', undefined);
  });

  it('post 는 JSON 헤더와 직렬화된 본문을 붙인다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await api.post('/api/x', { a: 1 });
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual({ a: 1 });
  });

  it('put 도 같은 모양이다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await api.put('/api/x', { b: 2 });
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ b: 2 });
  });

  it('del 은 본문이 없으면 붙이지 않는다', async () => {
    // 본문 없는 DELETE 에 `body: "undefined"` 가 붙으면 서버가 JSON 파싱에서 400 을 낸다.
    fetchMock.mockResolvedValue(jsonResponse({}));
    await api.del('/api/x/1');
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(opts.body).toBeUndefined();
  });

  it('del 은 본문이 있으면 JSON 으로 보낸다', async () => {
    // 일괄 삭제가 id 목록을 본문으로 보낸다. 여기가 깨지면 아무것도 안 지워진다.
    fetchMock.mockResolvedValue(jsonResponse({}));
    await api.del('/api/x', { ids: [1, 2] });
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(JSON.parse(opts.body)).toEqual({ ids: [1, 2] });
  });

  it('raw 는 옵션을 그대로 넘긴다', async () => {
    // 파일 업로드(FormData)가 이 경로를 쓴다. Content-Type 을 임의로 붙이면
    // multipart 경계가 깨진다.
    fetchMock.mockResolvedValue(jsonResponse({}));
    const form = new FormData();
    await api.raw('/api/card-import', { method: 'POST', body: form });
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.body).toBe(form);
    expect(opts.headers).toBeUndefined();
  });
});

describe('마크업은 사용자에게 안 보여준다 (#472)', () => {
  it('짧은 HTML 도 태그째 노출하지 않는다', async () => {
    // 예전에는 길이만 봤다(`length <= 200`). 주석은 "장문(HTML 등)은 노출하지
    // 않는다" 였는데 구현이 형식을 안 봐서, 짧은 오류 페이지가 태그째 찍혔다.
    fetchMock.mockResolvedValue(textResponse('<h1>502 Bad Gateway</h1>', { status: 502, type: 'text/html' }));

    const err = await api.get('/api/x').catch((e) => e);

    expect(err.message).toBe('요청 실패 (502)');
    // 원본은 버리지 않는다. 화면에는 안 띄워도 진단에는 필요하다.
    expect(err.body).toBe('<h1>502 Bad Gateway</h1>');
  });

  it('헤더가 없어도 태그로 시작하면 안 보여준다', async () => {
    // 프록시가 content-type 없이 HTML 오류 페이지를 주는 경우가 있다.
    fetchMock.mockResolvedValue(textResponse('<html>nope</html>', { status: 500, type: '' }));

    const err = await api.get('/api/x').catch((e) => e);

    expect(err.message).toBe('요청 실패 (500)');
  });

  it('서버가 준 짧은 평문은 그대로 보여준다', async () => {
    // 형식만 보고 전부 막으면 서버가 사용자 말로 적어 준 오류 문구까지 사라진다.
    // 그건 이 변경이 의도한 바가 아니다.
    fetchMock.mockResolvedValue(textResponse('이번 달 마감이 지났어요.', { status: 400, type: 'text/plain' }));

    const err = await api.get('/api/x').catch((e) => e);

    expect(err.message).toBe('이번 달 마감이 지났어요.');
  });

  it('헤더가 HTML 이면 태그가 없어도 안 보여준다', async () => {
    // nginx 등이 `text/html` 로 아주 짧은 본문만 주는 경우가 있다. 태그가 없다고
    // 그대로 띄우면 사용자 말이 아닌 서버 상투구가 안내 문구가 된다.
    // 본문만 보고 판정하면 이 경우가 새어 나간다.
    fetchMock.mockResolvedValue(textResponse('502 Bad Gateway', { status: 502, type: 'text/html' }));

    const err = await api.get('/api/x').catch((e) => e);

    expect(err.message).toBe('요청 실패 (502)');
  });

  it('평문이라도 너무 길면 안 보여준다', async () => {
    // 스택 트레이스나 로그가 통째로 오는 경우가 있다. 오류 안내에 수백 자를
    // 쏟으면 사용자는 무엇이 문제인지 읽어낼 수 없다.
    const long = '서버 처리 중 오류가 발생했습니다. '.repeat(20);
    expect(long.length).toBeGreaterThan(200);
    fetchMock.mockResolvedValue(textResponse(long, { status: 500, type: 'text/plain' }));

    const err = await api.get('/api/x').catch((e) => e);

    expect(err.message).toBe('요청 실패 (500)');
    expect(err.body).toBe(long);
  });

  it('JSON 의 error 필드가 먼저다', async () => {
    // 서버가 형식을 갖춰 준 문구가 가장 정확하다. 형식 판정보다 앞선다.
    fetchMock.mockResolvedValue(jsonResponse({ error: '카드를 먼저 등록해 주세요.' }, { status: 400 }));

    const err = await api.get('/api/x').catch((e) => e);

    expect(err.message).toBe('카드를 먼저 등록해 주세요.');
  });
});
