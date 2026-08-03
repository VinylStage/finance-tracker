'use strict';

// 부분무이자 표기를 카드사 방식으로 바꾼다(#267 수정).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 바꾸는가
//
// #266/#267 은 부분무이자를 "앞 free_months 회차가 면제" 로 잡았다. 실제 카드사는
// 반대다. KB국민카드 무이자할부 안내(2026-08 기준)의 표기가 이렇다.
//
//   "6개월 부분무이자 할부(4회차부터 면제)"
//   "10개월 부분무이자 할부(6회차부터 면제)"
//   "24개월 부분무이자 할부(11회차부터 면제)"
//
// 앞 회차는 고객이 수수료를 부담하고 지정 회차부터 면제된다. 앞 회차일수록 할부
// 잔액이 커서 수수료도 크기 때문에, 카드사가 비싼 구간을 고객에게 남기는 구조다.
//
// 뒤집혀 있던 탓에 이자가 실제의 40% 밖에 안 잡혔다. 600,000원 6개월 연 15.9%
// 기준 실제 19,875원 / 종전 계산 7,950원.
//
// 컬럼명을 free_months 그대로 두고 뜻만 뒤집는 안도 있었으나, "면제 개월수" 라는
// 이름이 뜻과 반대로 남는다. 카드사 안내가 "4회차부터 면제" 이므로 사용자가 그
// 문구를 그대로 옮겨 적을 수 있는 이름을 쓴다.
//
// 실사용 DB 의 정책 행이 0건이라 지금이 가장 싸다.
// ─────────────────────────────────────────────────────────────────────────
//
// free_from_sequence: 이 회차부터 수수료가 면제된다. 부분무이자에만 값이 있다.
//   4 이면 1~3회차는 고객 부담, 4회차부터 면제.
function up(db) {
  const cols = db.prepare('PRAGMA table_info(card_installment_policies)').all().map((c) => c.name);

  if (!cols.includes('free_from_sequence')) {
    db.exec('ALTER TABLE card_installment_policies ADD COLUMN free_from_sequence INTEGER NOT NULL DEFAULT 0');
  }

  // 기존 값 변환. 종전 free_months=3 은 "앞 3회차 면제" 였고, 새 뜻으로 같은
  // 면제 범위를 유지하려면 4회차부터 면제다. 뜻이 뒤집힌 것을 바로잡는 게
  // 목적이므로 "면제 시작 회차 = 종전 값 + 1" 로 옮긴다.
  //
  // 실사용 DB 는 0건이라 아무것도 옮기지 않는다. 다른 사람의 테스트 DB 가
  // 조용히 깨지지 않도록 변환 자체는 남긴다.
  if (cols.includes('free_months')) {
    db.prepare(`
      UPDATE card_installment_policies
      SET free_from_sequence = free_months + 1
      WHERE policy_type = '부분무이자' AND free_months > 0
    `).run();

    // 두 컬럼이 남아 있으면 같은 것을 뜻하는 값이 두 벌이 된다 — 이번 결함이
    // 정확히 그렇게 시작했다. 뜻이 하나면 컬럼도 하나여야 한다.
    db.exec('ALTER TABLE card_installment_policies DROP COLUMN free_months');
  }
}

module.exports = { up };
