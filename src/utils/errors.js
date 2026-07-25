'use strict';

// 예상치 못한 서버 오류(500) 응답을 표준화한다.
// 내부 메시지(SQLite 오류 원문, 경로 등)를 클라이언트에 노출하지 않고 서버 로그에만 남긴다.
// 사용자에게 보여야 하는 검증 오류(400)는 이 함수를 쓰지 말고 그대로 status(400)로 응답할 것.
function serverError(res, e, context) {
  console.error(`[${context || 'error'}]`, e);
  // 응답이 이미 시작된 경우(예: 스트리밍 중 오류) status()/json() 호출은 Express가 던진다.
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
}

// catch(e)에서 e가 Error가 아니거나 message가 없을 수 있어(throw 'string' 등) 안전하게 문자열로 뽑는다.
function errMsg(e) {
  return String((e && e.message) || '');
}

module.exports = { serverError, errMsg };
