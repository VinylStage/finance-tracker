import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useConfirm } from './ConfirmProvider';
import { formatWon } from '../lib/format';
import { SETTLEMENT_OPTIONS, settlementLabel, settlementEffect, withRo } from '../lib/settlementLabels';

// 결제 방식 일괄 재분류(#289).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 이 도구가 필요한가
//
// 021 은 기존 거래를 전부 `immediate` 로 남겼다. **자동 변환을 안 하기로 한
// 결정**이다 — 이 저장소는 과거 실거래 2,212건 유실 사고가 있었고, 조용한
// 대량 변경은 같은 범주의 위험이다.
//
// 그래서 사용자가 직접 "이 카드로 쓴 건 전부 카드 사용이다" 를 지정하는 길이
// 필요하다. 그게 여기다.
//
// ─────────────────────────────────────────────────────────────────────────
// 잔액이 어떻게 달라지는지를 먼저 보여준다
//
// 이 작업의 결과는 **건수가 아니라 잔액**이다. "3건이 바뀐다" 만 보여주면
// 사용자는 통장 숫자가 왜 갑자기 늘었는지 알 수 없다.
//
// 그리고 늘어난 잔액은 **돈이 생긴 게 아니다.** 나갈 돈이 카드 쪽으로 옮겨
// 간 것이라 카드 미결제액을 반드시 같이 보여준다. 잔액만 보여주면 사용자는
// 쓸 수 있는 돈이 늘었다고 읽는다.

const PREVIEW_DELAY_MS = 300;

const EMPTY = { payment_method_id: '', settlement: 'deferred', from: '', to: '' };

const blank = (v) => (v === '' || v === null || v === undefined ? undefined : v);

export function toCriteria(c) {
  return {
    payment_method_id: Number(c.payment_method_id),
    settlement: c.settlement,
    from: blank(c.from),
    to: blank(c.to),
  };
}

// 잔액이 어떻게 움직이는지 한 줄로. 부호를 글자로도 말한다 — 색이나 기호만으로
// 방향을 구분하면 못 읽는 사용자가 생긴다(#191).
export function impactLine(i) {
  const dir = i.balanceDelta > 0 ? '늘어요' : i.balanceDelta < 0 ? '줄어요' : '그대로예요';
  const amount = formatWon(Math.abs(i.balanceDelta));
  const unpaid = i.cardUnpaidAfter - i.cardUnpaidBefore;

  // 「A → B 로 N원 늘어요」 처럼 쓰면 금액 뒤에 조사가 붙어 '원 로' 가 된다.
  // 변화량을 앞에 두고 전·후를 괄호로 빼면 조사 문제가 아예 없어지고 읽기도
  // 낫다 — 사용자가 먼저 알아야 하는 것은 얼마나 달라지느냐다.
  const balance = i.balanceDelta === 0
    ? `${i.accountName} 잔액은 그대로예요.`
    : `${i.accountName} 잔액이 ${amount} ${dir} (${formatWon(i.balanceBefore)} → ${formatWon(i.balanceAfter)}).`;

  if (unpaid === 0) return balance;

  // 돈이 생긴 게 아니라는 것을 같은 줄에서 말한다.
  return `${balance} 대신 카드 미결제액이 ${formatWon(Math.abs(unpaid))} ${unpaid > 0 ? '늘어요' : '줄어요'}.`;
}

const inp = 'w-full text-sm bg-surface border border-line rounded-control px-3 py-2 text-ink';

export default function SettlementReclassifySection({ paymentMethods }) {
  const { confirm, alert } = useConfirm();
  const [criteria, setCriteria] = useState(EMPTY);
  const [plan, setPlan] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [running, setRunning] = useState(false);

  const set = (k, v) => {
    setCriteria((c) => ({ ...c, [k]: v }));
    // 조건이 바뀌면 직전 결과는 더 이상 그 조건의 답이 아니다. 남겨 두면
    // 사용자가 옛 건수를 보고 실행을 누른다.
    setDone(null);
  };

  // 조건이 바뀔 때마다 다시 계산한다. 마지막 요청의 답만 반영한다 — 느린 앞
  // 요청이 뒤늦게 도착해 좁혀 놓은 결과를 덮으면 안 된다.
  const seq = useRef(0);
  useEffect(() => {
    if (!criteria.payment_method_id) { setPlan(null); setError(null); return undefined; }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await api.post('/api/settlement/reclassify/preview', toCriteria(criteria));
        if (mine !== seq.current) return;
        setPlan(res);
        setError(null);
      } catch (err) {
        if (mine !== seq.current) return;
        setPlan(null);
        setError(err.message);
      } finally {
        if (mine === seq.current) setPreviewing(false);
      }
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [criteria]);

  const run = async () => {
    if (!plan || plan.count === 0) return;

    // 확인 문구에 **잔액 변화**를 넣는다. 건수만 물으면 사용자는 무엇을
    // 승인하는지 모른 채 승인한다.
    const impact = (plan.impact || []).map(impactLine).join(' ');
    const ok = await confirm(
      `${plan.count}건을 ${withRo(`'${settlementLabel(plan.target.settlement)}'`)} 바꿀까요? ${impact} 되돌리기로 되돌릴 수 있어요.`
    );
    if (!ok) return;

    setRunning(true);
    try {
      const res = await api.post('/api/settlement/reclassify', {
        ...toCriteria(criteria),
        preview_token: plan.preview_token,
      });
      setDone(res);
      setPlan(null);
      setCriteria((c) => ({ ...c }));  // 다시 계산해 남은 대상을 보여준다
    } catch (err) {
      // 프리뷰 이후 대상이 달라졌으면 다시 보게 한다. 조용히 실행하면 사용자가
      // 본 적 없는 상태의 거래가 바뀐다.
      await alert(err.message);
    } finally {
      setRunning(false);
    }
  };

  const methods = paymentMethods || [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-caption leading-relaxed">
        예전에 넣은 거래는 전부 &lsquo;즉시 결제&rsquo;로 기록돼 있어요. 신용카드로 쓴 내역을
        골라 &lsquo;카드 사용&rsquo;으로 바꾸면 통장 잔액과 카드 미결제액이 실제와 맞아요.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="rc-method" className="block text-xs text-caption mb-1">결제수단</label>
          <select id="rc-method" className={inp} value={criteria.payment_method_id}
            onChange={(e) => set('payment_method_id', e.target.value)}>
            <option value="">고르세요</option>
            {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="rc-settlement" className="block text-xs text-caption mb-1">이렇게 바꿔요</label>
          <select id="rc-settlement" className={inp} value={criteria.settlement}
            onChange={(e) => set('settlement', e.target.value)}>
            {SETTLEMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-xs text-caption mt-1">{settlementEffect(criteria.settlement)}</p>
        </div>

        <div>
          <label htmlFor="rc-from" className="block text-xs text-caption mb-1">시작일 (비우면 전체)</label>
          <input id="rc-from" type="date" className={inp} value={criteria.from}
            onChange={(e) => set('from', e.target.value)} />
        </div>
        <div>
          <label htmlFor="rc-to" className="block text-xs text-caption mb-1">종료일 (비우면 전체)</label>
          <input id="rc-to" type="date" className={inp} value={criteria.to}
            onChange={(e) => set('to', e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-loss-text">{error}</p>}
      {previewing && <p className="text-sm text-caption">불러오는 중</p>}

      {plan && !previewing && (
        <div className="border border-line rounded-card p-4 space-y-3">
          {plan.count === 0 ? (
            <p className="text-sm text-body">이 조건에 바꿀 거래가 없어요.</p>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">
                {plan.count}건을 {withRo(`‘${settlementLabel(plan.target.settlement)}’`)} 바꿔요.
              </p>

              {(plan.impact || []).map((i) => (
                <p key={i.accountId} className="text-sm text-body leading-relaxed">{impactLine(i)}</p>
              ))}

              <ul className="text-xs text-caption space-y-1 border-t border-line pt-3">
                {plan.samples.map((s) => (
                  <li key={s.id}>
                    {s.date} {s.merchant} {formatWon(s.amount)} — {settlementLabel(s.before)} → {settlementLabel(s.after)}
                  </li>
                ))}
                {plan.count > plan.samples.length && (
                  <li>… 그 밖에 {plan.count - plan.samples.length}건</li>
                )}
              </ul>

              <button type="button" onClick={run} disabled={running}
                className="text-sm border border-brand-text text-brand-text rounded-control px-4 py-2 hover:bg-brand-tint transition-colors disabled:opacity-50">
                {running ? '바꾸는 중' : `${plan.count}건 바꾸기`}
              </button>
            </>
          )}
        </div>
      )}

      {done && (
        <div className="border border-line rounded-card p-4 space-y-2">
          <p className="text-sm text-ink">{done.updated}건을 바꿨습니다.</p>
          {(done.impact || []).map((i) => (
            <p key={i.accountId} className="text-xs text-caption leading-relaxed">{impactLine(i)}</p>
          ))}
        </div>
      )}
    </div>
  );
}
