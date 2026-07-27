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

// 사용자 입력 문제로 400을 내려야 하는 오류(#231).
// 이전에는 메시지에 'PARSE_FAILED:' 같은 접두어를 붙여 정규식으로 판정했는데,
// 그 접두어가 사용자 화면에 그대로 노출됐고 메시지를 고치면 판정이 조용히 깨졌다.
// 성격은 메시지가 아니라 오류 객체가 들고 있어야 한다.
//
// message는 사용자에게 그대로 보이는 문구다. 필드명이나 내부 상태를 담지 말 것.
class UserInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserInputError';
  }
}

// instanceof는 같은 모듈 인스턴스에서만 성립한다. 이 저장소는 단일 프로세스에
// 단일 require 그래프라 문제없지만, 판정을 한곳에 모아 두면 나중에 바꾸기 쉽다.
function isUserInputError(e) {
  return e instanceof UserInputError;
}

module.exports = { serverError, errMsg, UserInputError, isUserInputError };
