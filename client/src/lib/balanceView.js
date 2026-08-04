// 잔액 화면의 표시 계층(#291).
//
// 순수 함수로 두는 이유: 잔액과 카드 미결제액은 서버가 계산해 내려주고
// (accountBalance.js), 여기서는 **그 값을 사람이 읽는 형태로 바꾸기만 한다.**
// 계산이 섞이면 같은 숫자를 두 곳에서 만들게 되고 둘이 어긋난다.
//
// accountStatus 가 돌려주는 값은 **상태 키이지 화면 문구가 아니다.** 문구는
// 화면이 정한다 — 같은 상태라도 목록과 상세에서 다르게 말해야 할 수 있다.

// 금액 표기는 lib/format.js 가 정본이다(#236). 여기 있던 구현을 그리로 옮겼다 —
// 같은 이름의 함수가 두 곳에 서로 다른 반올림 규칙으로 존재하고 있었다.
//
// 재수출로 남기는 이유는 이 모듈에서 가져다 쓰는 화면(Accounts, BalanceProjection)의
// import 경로를 건드리지 않기 위해서다. 잔액 화면 입장에서는 표시 계층의 일부다.
export { formatWon } from './format';

export function unpaidSummary(cardUnpaid) {
  if (!cardUnpaid) {
    return { total: 0, months: [], unknownCount: 0 };
  }

  const result = {
    total: cardUnpaid.total || 0,
    months: [],
    unknownCount: cardUnpaid.unassigned?.count || 0
  };

  for (const [month, data] of Object.entries(cardUnpaid.byMonth || {})) {
    if (data.unpaid !== 0) {
      result.months.push({ month, unpaid: data.unpaid });
    }
  }

  result.months.sort((a, b) => a.month.localeCompare(b.month));

  return result;
}

export function accountStatus(account) {
  if (!account) {
    return 'no-account';
  }
  if (account.opening_balance == null) {
    return 'no-opening-balance';
  }
  if (account.card_unpaid?.unassigned?.count > 0) {
    return 'unknown-billing';
  }
  if (account.counted === 0 && account.deferred === 0) {
    return 'no-activity';
  }
  return 'ok';
}
