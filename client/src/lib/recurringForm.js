// 반복 규칙 폼의 값 변환과 일정 표기(#280).
//
// 규칙을 새로 입력하려면 카테고리·가맹점·금액·결제수단·결제방식을 다시 다 골라야
// 한다. **그 조합은 이미 거래내역에 있다.** 그래서 거래에서 규칙을 만드는 경로가
// 있고, 그 변환을 화면이 아니라 여기에 둔다 — 화면 세 곳에서 각자 변환하면
// 어느 하나가 필드를 빠뜨렸을 때 조용히 다른 규칙이 만들어진다.

export const EMPTY_RULE_FORM = {
  category_id: '', merchant: '', amount: '',
  freq: 'monthly', interval: '1',
  day_of_month: '1', month_of_year: '',
  starts_on: '', ends_on: '',
  payment_method_id: '', payment_style: '일시불', memo: '',
};

function pad2(n) { return String(n).padStart(2, '0'); }

// 로컬 기준이다. UTC 로 하면 KST 자정~9시 사이에 하루 어긋난다(FND-20).
export function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function ruleToForm(rule) {
  return {
    category_id: String(rule.category_id ?? ''),
    merchant: rule.merchant || '',
    amount: String(rule.amount ?? ''),
    freq: rule.freq || 'monthly',
    interval: String(rule.interval ?? 1),
    day_of_month: String(rule.day_of_month ?? 1),
    month_of_year: rule.month_of_year ? String(rule.month_of_year) : '',
    starts_on: rule.starts_on || '',
    ends_on: rule.ends_on || '',
    payment_method_id: rule.payment_method_id ? String(rule.payment_method_id) : '',
    payment_style: rule.payment_style || '일시불',
    memo: rule.memo || '',
  };
}

// 거래 한 건을 규칙 폼으로 옮긴다.
//
// **날짜는 복사하지 않는다.** 거래의 date 는 과거 1회분이고, 규칙에 필요한 건
// starts_on 과 발생 규칙이다. 다만 그 날짜의 일자는 발생일 힌트로 쓴다 — 25일에
// 낸 거래는 매월 25일에 나갈 가능성이 높다.
export function formFromTransaction(tx) {
  const date = typeof tx?.date === 'string' ? tx.date : '';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(8, 10)) : 1;
  const month = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(5, 7)) : '';
  return {
    ...EMPTY_RULE_FORM,
    category_id: tx?.category_id ? String(tx.category_id) : '',
    merchant: tx?.merchant || '',
    amount: String(tx?.amount ?? ''),
    day_of_month: String(day),
    month_of_year: month ? String(month) : '',
    // 시작일은 오늘이다. 과거 거래일로 두면 저장하는 순간 따라잡기(#279)가
    // 그 사이 회차를 전부 만들어 버린다.
    starts_on: todayYMD(),
    payment_method_id: tx?.payment_method_id ? String(tx.payment_method_id) : '',
    payment_style: tx?.payment_style === '해당없음' ? '해당없음' : '일시불',
    memo: tx?.memo || '',
  };
}

export function formToBody(form) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  return {
    category_id: num(form.category_id),
    merchant: form.merchant,
    amount: num(form.amount),
    freq: form.freq,
    interval: num(form.interval) || 1,
    // 일 단위 반복에 발생일은 의미가 없다. 보내면 안 쓰는 값이 저장돼,
    // 나중에 주기를 월로 바꿨을 때 사용자가 정한 적 없는 날짜가 튀어나온다.
    day_of_month: form.freq === 'daily' ? null : num(form.day_of_month),
    month_of_year: form.freq === 'yearly' ? num(form.month_of_year) : null,
    starts_on: form.starts_on || todayYMD(),
    ends_on: form.ends_on || null,
    payment_method_id: num(form.payment_method_id),
    payment_style: form.payment_style,
    memo: form.memo,
  };
}

// 저장 전에 화면에서 잡을 것. 서버도 막지만, 눌러 보고 나서 거부당하는 것보다
// 미리 알려주는 편이 낫다.
export function validateForm(form) {
  if (!form.category_id) return '카테고리를 골라 주세요.';
  if (!form.merchant?.trim()) return '가맹점/이름을 입력해 주세요.';
  if (form.amount === '' || Number.isNaN(Number(form.amount))) return '금액을 입력해 주세요.';
  if (!form.starts_on) return '시작일을 입력해 주세요.';

  const interval = Number(form.interval);
  if (!Number.isInteger(interval) || interval < 1) return '간격은 1 이상이어야 해요.';

  if (form.ends_on && form.ends_on < form.starts_on) {
    return '종료일이 시작일보다 빠를 수 없어요.';
  }
  if (form.freq !== 'daily') {
    const day = Number(form.day_of_month);
    if (!Number.isInteger(day) || day < 1 || day > 31) return '발생일은 1일에서 31일 사이여야 해요.';
  }
  if (form.freq === 'yearly') {
    const m = Number(form.month_of_year);
    if (!Number.isInteger(m) || m < 1 || m > 12) return '몇 월인지 골라 주세요.';
  }
  return null;
}

const FREQ_UNIT = { daily: '일', monthly: '개월', yearly: '년' };

// 목록에 낼 한 줄짜리 일정 설명. "매월 25일" 처럼 사람 말로 쓴다 —
// freq/interval/day_of_month 세 컬럼을 나란히 보여주면 사용자가 조합해 읽어야 한다.
export function describeSchedule(rule) {
  const freq = rule?.freq || 'monthly';
  const interval = Number(rule?.interval) > 0 ? Number(rule.interval) : 1;
  const every = interval === 1 ? '매' : `${interval}${FREQ_UNIT[freq] || ''}마다 `;

  if (freq === 'daily') return interval === 1 ? '매일' : `${interval}일마다`;
  if (freq === 'yearly') {
    const m = rule?.month_of_year;
    const when = m ? `${m}월 ${rule.day_of_month}일` : `${rule.day_of_month}일`;
    return interval === 1 ? `매년 ${when}` : `${interval}년마다 ${when}`;
  }
  return `${every}${interval === 1 ? '월 ' : ''}${rule?.day_of_month}일`;
}

// 말일 처리 규칙을 화면에서 설명한다. 안 알려주면 2월에 날짜가 다른 것을
// 버그로 읽는다(#278 A안 확정).
export function endOfMonthNote(form) {
  if (form.freq === 'daily') return null;
  if (Number(form.day_of_month) < 29) return null;
  return `${form.day_of_month}일이 없는 달에는 그 달 마지막 날에 생깁니다.`;
}
