'use strict';

// 반복 규칙 제안을 사용자가 거절한 기록(#499).
//
// **거절을 기억하는 것이 이 기능의 생사를 가른다.** "아니오" 를 눌렀는데 다음 달에
// 또 물으면 사용자는 제안 자체를 무시하게 되고, 그러면 기능이 있으나 마나다.
// `CatchupNotice`(#280)가 같은 이유로 세션 기록을 쓰는 것과 같은 문제다.
//
// 세션이 아니라 DB 에 남기는 이유: 이 판단은 "이번에 안 보겠다" 가 아니라
// "이 가맹점은 반복이 아니다" 라는 지속적인 사실이다. 브라우저를 바꿔도 유지돼야
// 한다.
//
// 가맹점명을 키로 쓴다. 거래 id 로 걸면 그 거래를 지웠을 때 거절이 사라지고,
// 같은 패턴이 다시 제안된다.

module.exports = {
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS recurrence_suggestion_dismissals (
        id INTEGER PRIMARY KEY,
        merchant TEXT NOT NULL UNIQUE,
        dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  },
};
