import { formatWon } from './format';

export function conditionText(benefit) {
  const conditions = [];

  // min_amount 조건
  if (benefit.min_amount !== undefined && benefit.min_amount !== null && benefit.min_amount > 0) {
    conditions.push(`건당 ${formatWon(benefit.min_amount)} 이상`);
  }

  // max_amount 조건
  if (benefit.max_amount !== undefined && benefit.max_amount !== null) {
    conditions.push(`건당 ${formatWon(benefit.max_amount)} 미만`);
  }

  // rule_json 파싱
  let rule = {};
  if (benefit.rule_json && typeof benefit.rule_json === 'string') {
    try {
      rule = JSON.parse(benefit.rule_json);
    } catch (e) {
      // 무시하고 계속 진행
    }
  }

  // when.dates 조건
  if (rule.when && Array.isArray(rule.when.dates)) {
    const dateStrings = rule.when.dates.map(date => {
      const [month, day] = date.split('-');
      return `${month}/${day}`;
    });
    conditions.push(`${dateStrings.join(' · ')} 에만`);
  }

  // caps 조건
  const capsMap = {};
  if (Array.isArray(rule.caps)) {
    for (const cap of rule.caps) {
      if (!capsMap[cap.window]) {
        capsMap[cap.window] = {};
      }
      if (cap.amount !== undefined && cap.amount !== null) {
        capsMap[cap.window].amount = cap.amount;
      }
      if (cap.count !== undefined && cap.count !== null) {
        capsMap[cap.window].count = cap.count;
      }
    }
  }

  // caps의 transaction 창 amount
  if (capsMap.transaction?.amount !== undefined) {
    conditions.push(`건당 ${formatWon(capsMap.transaction.amount)}까지`);
  }

  // caps의 day 창 amount
  if (capsMap.day?.amount !== undefined) {
    conditions.push(`하루 ${formatWon(capsMap.day.amount)}까지`);
  }

  // caps의 day 창 count
  if (capsMap.day?.count !== undefined) {
    conditions.push(`하루 ${capsMap.day.count}회`);
  }

  // caps의 month 창 amount
  if (capsMap.month?.amount !== undefined) {
    conditions.push(`월 ${formatWon(capsMap.month.amount)}까지`);
  }

  // caps의 month 창 count
  if (capsMap.month?.count !== undefined) {
    conditions.push(`월 ${capsMap.month.count}회`);
  }

  // monthly_cap 조건 (caps에 month amount가 없을 때만)
  const hasMonthAmountInCaps = capsMap.month?.amount !== undefined;
  if (
    benefit.monthly_cap !== undefined &&
    benefit.monthly_cap !== null &&
    !hasMonthAmountInCaps &&
    typeof benefit.monthly_cap === 'number'
  ) {
    conditions.push(`월 ${formatWon(benefit.monthly_cap)}까지`);
  }

  // threshold_exempt 조건
  if (benefit.threshold_exempt) {
    conditions.push('실적 조건 없음');
  }

  // unified_cap_exempt 조건
  if (benefit.unified_cap_exempt) {
    conditions.push('카드 통합 한도 밖');
  }

  return conditions.join(' · ');
}
