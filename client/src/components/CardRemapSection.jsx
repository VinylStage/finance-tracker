import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useConfirm } from './ConfirmProvider';
import EmptyState from './EmptyState';
import { formatWon } from '../lib/format';

// 기존 거래를 카드 상품에 붙이는 재매핑(#302 3단계).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 대량 지정이 기본인가
//
// B안(신규 행 + 재매핑) 대상은 신한·하나 두 카드사뿐인데, **카드 거래의 58%가
// 하나카드**다(실측 260건). "2장 이상인 예외는 소수라 손으로 처리하면 된다" 는
// 가정이 여기서 깨진다 — 가장 큰 덩어리가 예외다. 260건을 한 건씩 고르게 하는
// 설계는 실패하므로 기간·가맹점·금액대로 묶어 한 번에 지정한다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 프리뷰가 먼저인가 (ADR 0008)
//
// 이 저장소는 과거 실거래 2,212건이 유실된 사고가 있었다. 조용한 대량 변경은
// 같은 범주의 위험이다 — 실행 시점에 아무 일도 없어 보이고 이상을 알아채기까지
// 시간이 걸린다. 되돌리기가 있어도 **무엇이 바뀌었는지 모르면 되돌릴 판단 자체를
// 못 한다.** 프리뷰는 실행취소의 대체재가 아니라 전제다.
//
// 조건을 고칠 때마다 건수를 다시 받아온다. 실행 전에 범위를 좁혀볼 수 있어야
// 한다는 요건이라, 서버가 준 지문(preview_token)도 그때마다 새로 받는다.
//
// ─────────────────────────────────────────────────────────────────────────
// 부분 완료가 정상이다
//
// 기억나지 않아 못 고르는 거래는 남는다. 그건 미상으로 두고 끝낼 수 있어야
// 하므로(#306) 남은 미상 건수를 항상 띄우고, 0 이 되기를 강요하지 않는다.
// ─────────────────────────────────────────────────────────────────────────

const EMPTY_CRITERIA = {
  card_product_id: '',
  from: '',
  to: '',
  merchant: '',
  min_amount: '',
  max_amount: '',
  include_assigned: false,
};

// 입력할 때마다 서버를 부르면 타이핑 한 글자마다 요청이 나간다. 사용자가 손을
// 멈춘 뒤에 부른다 — 건수는 "지금 조건" 을 따라와야 하므로 길게 잡지 않는다.
const PREVIEW_DELAY_MS = 300;

function blankToUndefined(v) {
  return v === '' || v === null || v === undefined ? undefined : v;
}

// 서버에 보낼 조건. 빈 칸은 아예 빼서 "조건 없음" 으로 만든다 — 빈 문자열을
// 그대로 보내면 서버가 그것을 조건으로 해석할 여지가 생긴다.
export function toCriteria(c) {
  return {
    card_product_id: Number(c.card_product_id),
    from: blankToUndefined(c.from),
    to: blankToUndefined(c.to),
    merchant: blankToUndefined(c.merchant),
    min_amount: blankToUndefined(c.min_amount),
    max_amount: blankToUndefined(c.max_amount),
    include_assigned: c.include_assigned || undefined,
  };
}

export default function CardRemapSection({ paymentMethods }) {
  const { confirm, alert } = useConfirm();
  const [products, setProducts] = useState([]);
  const [unassigned, setUnassigned] = useState(null);
  const [criteria, setCriteria] = useState(EMPTY_CRITERIA);
  const [plan, setPlan] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [running, setRunning] = useState(false);

  const cards = paymentMethods.filter((p) => p.type === '신용' || p.type === '체크');

  const load = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        api.get('/api/card-products'),
        api.get('/api/card-products/unassigned-count'),
      ]);
      setProducts(list.data || []);
      setUnassigned(count.unassigned);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => {
    setCriteria((c) => ({ ...c, [k]: v }));
    // 조건이 바뀌면 직전 결과는 더 이상 그 조건의 답이 아니다. 남겨 두면
    // 사용자가 옛 건수를 보고 실행을 누른다.
    setDone(null);
  };

  // 조건이 바뀔 때마다 건수를 다시 받는다. 마지막 요청의 답만 반영한다 —
  // 느린 앞 요청이 뒤늦게 도착해 좁혀 놓은 건수를 덮으면 안 된다.
  const seq = useRef(0);
  useEffect(() => {
    if (!criteria.card_product_id) { setPlan(null); setError(null); return; }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await api.post('/api/card-products/remap/preview', toCriteria(criteria));
        if (mine !== seq.current) return;
        setPlan(res);
        setUnassigned(res.remaining_unassigned);
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

    const overwrite = plan.already_assigned > 0
      ? ` 그중 ${plan.already_assigned}건은 이미 다른 카드로 지정돼 있어요 — 그 지정을 덮어써요.`
      : '';
    const ok = await confirm(
      `${plan.count}건을 '${plan.target.product_name}' 로 옮길까요?${overwrite} 되돌리기로 되돌릴 수 있어요.`
    );
    if (!ok) return;

    setRunning(true);
    try {
      const res = await api.post('/api/card-products/remap', {
        ...toCriteria(criteria),
        preview_token: plan.preview_token,
      });
      setDone(res);
      setUnassigned(res.remaining_unassigned);
      setPlan(null);
      // 방금 옮긴 조건 그대로 두면 건수 0 인 프리뷰가 다시 돌아온다. 조건을
      // 비워 다음 묶음을 새로 고르게 한다 — 부분 완료가 정상 흐름이다.
      setCriteria((c) => ({ ...EMPTY_CRITERIA, card_product_id: c.card_product_id }));
    } catch (err) {
      // 프리뷰 이후 대상이 달라지면 서버가 막는다(409). 사용자가 본 것과 다른
      // 것을 옮기지 않기 위한 것이므로, 문구를 그대로 보여주고 다시 보게 한다.
      await alert(err.message);
      setPlan(null);
      setCriteria((c) => ({ ...c }));
    } finally {
      setRunning(false);
    }
  };

  const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

  if (cards.length === 0 || products.length === 0) {
    return (
      <EmptyState
        title="먼저 카드를 등록해 주세요"
        description="'보유 카드 관리' 에서 카드를 등록하면, 지난 거래가 어느 카드였는지 여기서 한 번에 지정할 수 있어요."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-caption">
          지난 거래는 카드사까지만 남아 있어요. 기간·가맹점·금액대로 묶어
          <strong className="text-body"> 어느 카드였는지 한 번에 </strong>
          지정할 수 있어요.
        </p>
        {unassigned !== null && (
          <p className="text-xs text-caption shrink-0 tabular-nums" data-testid="remap-unassigned">
            아직 카드 미상 <strong className="text-body">{unassigned}건</strong>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label htmlFor="remap-card" className="block text-xs text-caption mb-1">어느 카드로 옮길까요? *</label>
          <select
            id="remap-card" className={inp}
            value={criteria.card_product_id}
            onChange={(e) => set('card_product_id', e.target.value)}
          >
            <option value="">선택...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_name} · {p.payment_method_name || p.issuer}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-caption">
            그 카드가 달린 카드사의 거래만 대상이 돼요.
          </p>
        </div>

        <div>
          <label htmlFor="remap-from" className="block text-xs text-caption mb-1">기간 시작</label>
          <input id="remap-from" type="date" className={inp} value={criteria.from}
            onChange={(e) => set('from', e.target.value)} />
        </div>
        <div>
          <label htmlFor="remap-to" className="block text-xs text-caption mb-1">기간 끝</label>
          <input id="remap-to" type="date" className={inp} value={criteria.to}
            onChange={(e) => set('to', e.target.value)} />
        </div>
        <div>
          <label htmlFor="remap-merchant" className="block text-xs text-caption mb-1">가맹점</label>
          <input id="remap-merchant" type="text" className={inp} value={criteria.merchant}
            onChange={(e) => set('merchant', e.target.value)} placeholder="이름 일부만 넣어도 돼요" />
        </div>
        {/* 금액은 부호 없이 저장된다. 지출·수입은 카테고리의 대분류가 가르므로
            여기서 음수를 넣으라고 안내하면 아무것도 안 걸린다. */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="remap-min" className="block text-xs text-caption mb-1">금액 하한</label>
            <input id="remap-min" type="number" min="0" className={inp} value={criteria.min_amount}
              onChange={(e) => set('min_amount', e.target.value)} placeholder="예: 10000" />
          </div>
          <div>
            <label htmlFor="remap-max" className="block text-xs text-caption mb-1">금액 상한</label>
            <input id="remap-max" type="number" min="0" className={inp} value={criteria.max_amount}
              onChange={(e) => set('max_amount', e.target.value)} placeholder="예: 50000" />
          </div>
        </div>

        <label className="sm:col-span-2 flex items-center gap-2 text-xs text-caption">
          <input type="checkbox" checked={criteria.include_assigned}
            onChange={(e) => set('include_assigned', e.target.checked)} />
          이미 다른 카드로 지정한 거래도 덮어쓰기
        </label>
      </div>

      {error && <p role="alert" className="text-xs text-loss-text">{error}</p>}

      {done && (
        <p role="status" className="text-xs text-goal-text">
          {done.updated}건을 &lsquo;{done.target.product_name}&rsquo; 로 옮겼어요.
          {done.remaining_unassigned > 0
            ? ` 아직 카드 미상 ${done.remaining_unassigned}건이 남아 있어요 — 나눠서 해도 괜찮아요.`
            : ' 카드 미상 거래가 모두 정리됐어요.'}
        </p>
      )}

      {criteria.card_product_id && (
        <div className="bg-surface-sunken rounded-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-medium text-body">
              {previewing ? '세는 중...' : plan ? `${plan.count}건이 바뀌어요` : ' '}
            </h4>
            <button
              type="button" onClick={run}
              disabled={!plan || plan.count === 0 || previewing || running}
              className="btn-primary text-xs px-3 py-1.5 rounded-control shrink-0 disabled:opacity-50"
            >
              {running ? '옮기는 중...' : '옮기기'}
            </button>
          </div>

          {plan && plan.count === 0 && (
            <p className="text-xs text-caption">
              조건에 걸리는 거래가 없어요. 기간이나 가맹점을 넓혀 보세요.
            </p>
          )}

          {plan && plan.already_assigned > 0 && (
            <p className="text-xs text-warn-text">
              그중 {plan.already_assigned}건은 이미 다른 카드로 지정돼 있어요. 그 지정을 덮어써요.
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
                      {s.before || '미상'} → <strong className="text-body">{s.after}</strong>
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
