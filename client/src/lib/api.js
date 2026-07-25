// 응답 상태를 확인하는 얇은 fetch 래퍼. 새 의존성 없음.
//
// 기존 클라이언트는 fetch 결과의 res.ok 를 대부분 확인하지 않아, 서버가 4xx/5xx 를
// 반환해도 그대로 진행됐다(로딩이 멈추거나 빈 화면이 됐다). 또 500 이 HTML(비-JSON)로
// 오면 r.json() 이 throw 하면서 렌더가 중단됐다. 이 래퍼는:
//   - res.ok 가 아니면 ApiError 를 throw 한다
//   - 네트워크 자체 실패(offline 등)도 ApiError 로 정규화한다
//   - Content-Type 에 따라 JSON/text 로 안전하게 파싱한다

export class ApiError extends Error {
  constructor(message, { status = 0, body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// 응답 본문을 Content-Type 에 맞춰 파싱한다. JSON 파싱 실패는 null 로 흡수한다
// (빈 204 응답, 손상된 본문 등에서 throw 하지 않도록).
async function parseBody(res) {
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try { return await res.json(); }
    catch { return null; }
  }
  return res.text();
}

// 서버 에러 응답에서 사람이 읽을 메시지를 뽑는다.
// 라우트들은 { error: '...' } 형태로 오류를 내려주므로 그것을 우선한다.
function errorMessage(body, status) {
  if (body && typeof body === 'object' && body.error) return body.error;
  // 장문(HTML 등)은 그대로 노출하지 않고 상태코드로 대체한다.
  if (typeof body === 'string' && body.trim() && body.length <= 200) return body;
  return `요청 실패 (${status})`;
}

// 모든 요청의 단일 통로. options 는 fetch 와 동일하게 전달한다.
export async function apiRequest(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    // fetch 자체 거부(네트워크 오류, offline, AbortError 등)
    throw new ApiError('서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.', { status: 0 });
  }
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(errorMessage(body, res.status), { status: res.status, body });
  }
  return body;
}

// JSON 본문 요청의 헤더/직렬화를 일원화한다.
function jsonRequest(method, path, data) {
  return apiRequest(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export const api = {
  get: (path) => apiRequest(path),
  post: (path, data) => jsonRequest('POST', path, data),
  put: (path, data) => jsonRequest('PUT', path, data),
  // DELETE 는 본문이 있는 경우(일괄 삭제 등)와 없는 경우를 모두 지원한다.
  del: (path, data) => (data === undefined
    ? apiRequest(path, { method: 'DELETE' })
    : jsonRequest('DELETE', path, data)),
  // multipart(FormData) 등 특수 요청용. options 를 그대로 전달한다.
  raw: apiRequest,
};
