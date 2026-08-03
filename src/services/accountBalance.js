'use strict';

// 계좌 잔액을 계산한다(#288). DB 를 모르는 순수 함수다 — 호출부가 계좌 행과
// 거래 배열을 읽어 넘긴다.
//
// 잔액을 저장하지 않고 매번 계산하는 것이 이 설계의 핵심이다. 저장하면 거래를
// 고치거나 지울 때마다 갱신해야 하고, 한 번 어긋나면 그 뒤가 전부 틀린다.
//
// 날짜 비교는 문자열로 한다. 'YYYY-MM-DD' 는 사전순이 곧 시간순이고, Date 로
// 바꾸면 UTC 로 해석돼 KST 자정~9시에 하루 어긋난다(FND-20).

const YMD = /^\d{4}-\d{2}-\d{2}$/;

// computeBalance(account, transactions) → { balance, counted, skipped }
//
// opening_date **이전** 거래는 건너뛴다. 그 잔액에 이미 반영돼 있다고 본다.
// 당일은 포함한다 — "이 잔액이 기준이 되는 날짜" 의 거래까지 세는 것이
// 사용자가 통장을 보고 입력하는 방식과 맞다.
function computeBalance(account, transactions) {
  const opening = Number(account?.opening_balance) || 0;
  const openingDate = account?.opening_date;

  if (!Array.isArray(transactions)) {
    return { balance: opening, counted: 0, skipped: 0 };
  }

  let balance = opening;
  let counted = 0;
  let skipped = 0;

  for (const tx of transactions) {
    if (!tx || typeof tx.date !== 'string' || !YMD.test(tx.date)) { skipped++; continue; }
    if (openingDate && tx.date < openingDate) { skipped++; continue; }

    const amount = Number(tx.amount) || 0;
    if (tx.direction === 'in') balance += amount;
    else balance -= amount;
    counted++;
  }

  return { balance, counted, skipped };
}

// 마이너스통장은 잔액이 음수여도 한도까지 쓸 수 있다. 화면이 "쓸 수 있는 돈" 을
// 말하려면 잔액과 별개의 값이 필요하다.
function availableAmount(account, balance) {
  const limit = account?.credit_limit;
  if (limit === null || limit === undefined) return balance;
  return balance + (Number(limit) || 0);
}

module.exports = { computeBalance, availableAmount };
