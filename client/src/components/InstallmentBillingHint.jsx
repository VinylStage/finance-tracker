import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { formatWon } from '../lib/format';

// 할부 입력 폼의 월별 청구액 자동계산(#316).
//
// ─────────────────────────────────────────────────────────────────────────
// 채우되 가두지 않는다
//
// 계산 결과는 **기본값**이지 강제값이 아니다. 카드사 내부 규칙이나 이벤트 예외
// 때문에 실제 청구서가 계산과 다른 경우가 있고, 그때 사용자가 실제 값을 넣을 수
// 없으면 가계부가 틀린 값을 강제하게 된다.
//
// 그래서 사용자가 한 번이라도 직접 고치면 그 뒤로는 덮어쓰지 않는다. 대신
// 계산값과 다르다는 사실을 표시한다 — 나중에 왜 다른지 알 수 있어야 한다.
//
// ─────────────────────────────────────────────────────────────────────────
// 단일 값이 스케줄 전체를 대변하지 못한다
//
// 폼은 월납부액·월수수료를 한 값으로만 받는데 실제 스케줄은 회차마다 다르다
// (끝수는 1회차에, 수수료는 잔액 기준이라 체감). 그래서 대표값만 채우고
// "회차마다 다르다" 는 사실을 함께 적는다. 이걸 숨기면 사용자는 2회차 청구서를
// 보고 앱이 틀렸다고 판단한다.
// ─────────────────────────────────────────────────────────────────────────


// 입력 중에 매 글자마다 부르지 않는다. 총액은 한 자씩 늘어나므로
// 디바운스가 없으면 1,200,000 하나 치는 데 일곱 번 부른다.
const DEBOUNCE_MS = 400;

export default function InstallmentBillingHint({
  totalAmount, months, paymentMethodId, purchaseDate, startBillingMonth,
  categoryId, monthlyAmount, feePerMonth, onEstimate,
}) {
  const [estimate, setEstimate] = useState(null);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  const total = Number(totalAmount);
  const m = Number(months);
  const ready = total > 0 && m >= 2 && !!startBillingMonth;

  useEffect(() => {
    if (!ready) {
      setEstimate(null);
      setError(null);
      return undefined;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await api.post('/api/installments/billing-estimate', {
          total_amount: total,
          months: m,
          payment_method_id: paymentMethodId ? Number(paymentMethodId) : undefined,
          purchase_date: purchaseDate || undefined,
          start_billing_month: startBillingMonth,
          // 카테고리 예외 정책까지 반영해야 저장 후 생성될 값과 일치한다(#316).
          category_id: categoryId ? Number(categoryId) : undefined,
        });
        setError(null);
        setEstimate(res.data);
        onEstimate?.(res.data);
      } catch (err) {
        // 계산이 실패해도 입력은 계속할 수 있어야 한다. 기록이 계산에
        // 종속되면 안 된다 — 정책을 아직 안 넣은 사용자가 정상적으로 존재한다.
        setEstimate(null);
        setError(err.message);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
    // onEstimate 는 매 렌더 새 함수라 의존성에 넣으면 무한 루프가 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, total, m, paymentMethodId, purchaseDate, startBillingMonth, categoryId]);

  if (error) {
    return (
      <p role="status" className="text-xs text-caption">
        청구액을 계산하지 못했어요. 직접 입력해 주세요.
      </p>
    );
  }

  if (!estimate) return null;

  const { rows, monthly_amount, fee_per_month, totals, varies, basis } = estimate;
  const first = rows[0];
  const second = rows[1];

  const enteredMonthly = Number(monthlyAmount);
  const enteredFee = Number(feePerMonth || 0);
  const monthlyDiffers = enteredMonthly > 0 && enteredMonthly !== monthly_amount;
  const feeDiffers = enteredFee !== fee_per_month;

  return (
    <div className="rounded-control bg-surface-sunken px-3 py-2.5 space-y-1.5">
      <p className="text-xs font-medium text-body">이렇게 청구될 것 같아요</p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-caption">1회차</dt>
        <dd className="text-ink tabular-nums">
          {formatWon(first.total)}
          {first.interest > 0 && (
            <span className="text-caption"> (원금 {formatWon(first.principal)} + 수수료 {formatWon(first.interest)})</span>
          )}
        </dd>

        {second && (varies.principal || varies.interest) && (
          <>
            <dt className="text-caption">2회차</dt>
            <dd className="text-ink tabular-nums">{formatWon(second.total)}</dd>
          </>
        )}

        <dt className="text-caption">총 수수료</dt>
        <dd className="text-ink tabular-nums">{formatWon(totals.interest)}</dd>

        <dt className="text-caption">총 상환액</dt>
        <dd className="text-ink tabular-nums">{formatWon(totals.total)}</dd>
      </dl>

      {(varies.principal || varies.interest) && (
        <p className="text-[11px] text-caption">
          {varies.interest
            ? '남은 금액에 수수료가 붙어서 회차마다 조금씩 줄어요.'
            : '나누어떨어지지 않아 1회차만 조금 커요.'}
        </p>
      )}

      <p className="text-[11px] text-caption">{basis.reason}</p>

      {(monthlyDiffers || feeDiffers) && (
        <p className="text-[11px] text-brand-text">
          입력한 값이 계산과 달라요 — 계산값은
          {monthlyDiffers && ` 월납부액 ${formatWon(monthly_amount)}`}
          {monthlyDiffers && feeDiffers && ','}
          {feeDiffers && ` 월 수수료 ${formatWon(fee_per_month)}`}
          . 입력한 값을 그대로 저장해요.
        </p>
      )}
    </div>
  );
}
