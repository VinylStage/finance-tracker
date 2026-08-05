import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useConfirm } from './ConfirmProvider';
import EmptyState from './EmptyState';
import { formatWon } from '../lib/format';

const EMPTY_CRITERIA = {
  mode: 'fill',
  card_product_id: '',
};

const PREVIEW_DELAY_MS = 300;

function blankToUndefined(v) {
  return v === '' || v === null || v === undefined ? undefined : v;
}

export default function BillingMonthBackfillSection() {
  const { confirm, alert } = useConfirm();
  // 청구월이 비어 있는 deferred 거래 수. 화면을 열기 전에 소급이 필요한 상태인지
  // 알 수 있어야 한다.
  const [missing, setMissing] = useState(null);
  // 카드 목록은 스스로 싣는다. `CardRemapSection` 과 같은 방식이다 — 설정 화면이
  // 카드를 안 들고 있어서, 프롭으로 받으면 화면 쪽에 로딩을 하나 더 만들어야 한다.
  //
  // **비활성 카드도 싣는다**(#410). 빼면 그 카드에 달린 과거 거래를 고를 수 없어
  // 청구월이 빈 채로 영영 남는다.
  const [cardProducts, setCardProducts] = useState([]);
  const [criteria, setCriteria] = useState(EMPTY_CRITERIA);
  const [plan, setPlan] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [count, list] = await Promise.all([
        api.get('/api/billing-month/missing-count'),
        api.get('/api/card-products?include_inactive=1'),
      ]);
      setMissing(count.missing);
      setCardProducts(list.data || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => {
    setCriteria((c) => ({ ...c, [k]: v }));
    setDone(null);
  };

  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await api.post('/api/billing-month/backfill/preview', {
          mode: criteria.mode,
          card_product_id: blankToUndefined(criteria.card_product_id),
        });
        if (mine !== seq.current) return;
        setPlan(res);
        // 프리뷰 응답에는 남은 건수가 없다. **프리뷰는 DB 를 안 바꾸므로**
        // 남은 건수도 안 바뀐다 — 여기서 덮으면 undefined 가 화면에 뜬다.
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

    const overwrite = plan.cleared > 0
      ? ` 그중 ${plan.cleared}건은 지워져요.`
      : '';
    const ok = await confirm(
      `${plan.count}건의 청구월을 채울까요?${overwrite} 되돌리기로 되돌릴 수 있어요.`
    );
    if (!ok) return;

    setRunning(true);
    try {
      const res = await api.post('/api/billing-month/backfill', {
        mode: criteria.mode,
        card_product_id: blankToUndefined(criteria.card_product_id),
        preview_token: plan.preview_token,
      });
      setDone(res);
      setMissing(res.missing);
      setPlan(null);
      setCriteria(EMPTY_CRITERIA);
    } catch (err) {
      await alert(err.message);
      setPlan(null);
      setCriteria((c) => ({ ...c }));
    } finally {
      setRunning(false);
    }
  };

  const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

  if (!cardProducts || cardProducts.length === 0) {
    return (
      <EmptyState
        title="먼저 카드를 등록해 주세요"
        description="'보유 카드 관리' 에서 카드의 결제일과 마감일을 넣으면, 그 전에 쌓인 거래의 청구월을 여기서 한 번에 채울 수 있어요."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-caption">
          카드의 결제일·마감일을 나중에 넣으면, 그 전에 기록한 카드 사용은
          <strong className="text-body"> 언제 빠질 돈인지 </strong>
          비어 있는 채로 남아요. 여기서 한 번에 채울 수 있어요.
        </p>
        {missing !== null && (
          <p className="text-xs text-caption shrink-0 tabular-nums" data-testid="backfill-missing">
            청구월 미상 <strong className="text-body">{missing}건</strong>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs text-caption mb-1">모드</label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs text-caption">
              <input
                type="radio"
                name="backfill-mode"
                checked={criteria.mode === 'fill'}
                onChange={() => set('mode', 'fill')}
              />
              빈 것만 채워요
            </label>
            <label className="flex items-center gap-2 text-xs text-caption">
              <input
                type="radio"
                name="backfill-mode"
                checked={criteria.mode === 'recompute'}
                onChange={() => set('mode', 'recompute')}
              />
              전부 다시 계산해요
            </label>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="backfill-card" className="block text-xs text-caption mb-1">어느 카드를 채울까요</label>
          <select
            id="backfill-card"
            className={inp}
            value={criteria.card_product_id}
            onChange={(e) => set('card_product_id', e.target.value)}
          >
            <option value="">전체</option>
            {cardProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_name} · {p.payment_method_name || p.issuer}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-loss-text">{error}</p>}

      {done && (
        <p role="status" className="text-xs text-goal-text">
          {done.updated}건의 청구월을 채웠어요.
        </p>
      )}

      {/* 재매핑과 달리 카드를 안 골라도(전체) 프리뷰가 돈다. 소급은 "어느 카드가
          빠졌는지" 를 사용자가 모르는 채로 시작하는 일이라, 고르기 전에도 전체
          건수가 보여야 한다. */}
      {(plan || previewing) && (
        <div className="bg-surface-sunken rounded-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-medium text-body">
              {previewing ? '세는 중...' : plan ? `${plan.count}건이 바뀌어요` : ' '}
            </h4>
            <button
              type="button"
              onClick={run}
              disabled={!plan || plan.count === 0 || previewing || running}
              className="btn-primary text-xs px-3 py-1.5 rounded-control shrink-0 disabled:opacity-50"
            >
              {running ? '채우는 중...' : '채우기'}
            </button>
          </div>

          {plan && plan.count === 0 && (
            <p className="text-xs text-caption">
              채울 청구월이 없어요. 카드의 결제일과 마감일이 들어가 있는지 확인해 주세요.
            </p>
          )}

          {plan && plan.filled > 0 && (
            <p className="text-xs text-caption">
              빈 청구월 {plan.filled}건이 채워져요.
            </p>
          )}

          {plan && plan.rewritten > 0 && (
            <p className="text-xs text-warn-text">
              이미 적힌 청구월 {plan.rewritten}건이 다시 계산돼요.
            </p>
          )}

          {plan && plan.cleared > 0 && (
            <p className="text-xs text-warn-text">
              청구월 {plan.cleared}건이 지워져요. 카드의 결제일·마감일을 몰라서예요.
            </p>
          )}

          {plan && plan.skipped_written > 0 && (
            <p className="text-xs text-caption">
              이미 적힌 {plan.skipped_written}건은 그대로 둬요. 전부 다시 계산하려면 위에서 바꿔 주세요.
            </p>
          )}

          {plan && plan.samples.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] text-caption">
                이렇게 바뀌어요 (전체 {plan.count}건 중 {plan.samples.length}건)
              </p>
              <ul className="space-y-1">
                {plan.samples.map((s) => (
                  <li key={s.id} className="text-[11px] text-body flex flex-wrap items-baseline gap-x-2">
                    <span className="text-caption tabular-nums">{s.date}</span>
                    <span>{s.merchant || '(가맹점 없음)'}</span>
                    <span className="tabular-nums">{formatWon(s.amount)}</span>
                    <span className="text-caption">
                      {s.card_product_name || '카드 미지정'}
                    </span>
                    <span className="text-caption">
                      {s.before || '없음'} → <strong className="text-body">{s.after || '없음'}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
