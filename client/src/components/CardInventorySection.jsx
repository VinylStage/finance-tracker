import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import EmptyState from './EmptyState';
import { formatWon } from '../lib/format';

// 등록 현황 한눈에 보기(#520).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 등록 화면과 따로인가
//
// 카드 등록(#302)·혜택 입력(#435)은 **넣는 화면**이다. 넣는 화면은 이미 넣은
// 것만 보여주지, 아직 안 넣은 것은 말하지 않는다. 실사용 DB 가 카드 0장·혜택
// 0건인 채로 넉 달을 간 이유가 그거다 — 비어 있다는 신호가 어디에도 없었다.
//
// 이 화면은 반대로 **모자란 것을 세는** 화면이다. 읽기 전용이고, 고치는 일은
// 각자의 등록 화면으로 보낸다.
//
// ─────────────────────────────────────────────────────────────────────────
// 무엇을 "비었다" 로 볼 것인가
//
//   혜택 0건        추천 계산이 이 카드를 **혜택 없는 카드**로 본다. 가장 무겁다
//   청구주기 미설정  할부 첫 청구월이 구매일의 달로 조용히 폴백한다(#290)
//   실적 기준 미설정  무실적 카드일 수도 있어 **경고가 아니라 사실**로만 적는다
//
// 실적은 비워 두는 것이 정답인 카드가 실제로 많다(무실적 카드). 이걸 빨갛게
// 칠하면 사용자가 없는 값을 지어내게 된다 — 그래서 색을 달리한다.
//
// ─────────────────────────────────────────────────────────────────────────
// 카드사별 미지정 건수를 같이 싣는 이유
//
// "카드 미지정 273건" 은 할 일을 말해 주지 않는다. **어느 카드사에서** 273건이
// 뜨는지를 알아야 그 카드사 카드를 더 등록할지, 지난 거래를 붙일지가 갈린다.
// ─────────────────────────────────────────────────────────────────────────

const isActive = (c) => c.is_active === undefined || c.is_active === null || !!c.is_active;

// 카드 한 장에서 아직 안 채워진 것. 순서가 곧 중요도다.
export function gapsOf(card) {
  const gaps = [];
  if (!card.benefit_count) gaps.push({ key: 'benefit', label: '혜택 없음', level: 'warn' });
  if (!card.statement_close_day || !card.billing_cycle_day) {
    gaps.push({ key: 'cycle', label: '청구주기 미설정', level: 'warn' });
  }
  if (card.prev_month_threshold === null || card.prev_month_threshold === undefined) {
    gaps.push({ key: 'threshold', label: '실적 기준 없음', level: 'info' });
  }
  return gaps;
}

function Badge({ level, children }) {
  const tone = level === 'warn'
    ? 'bg-loss-tint text-loss-text'
    : 'bg-surface-sunken text-caption';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${tone}`}>{children}</span>
  );
}

export default function CardInventorySection() {
  const [cards, setCards] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/card-products/inventory');
      const d = (res && res.data) || {};
      setCards(d.cards || []);
      setUnassigned(d.unassigned || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = cards.filter(isActive);
  const inactive = cards.filter((c) => !isActive(c));
  const benefitTotal = cards.reduce((s, c) => s + (c.benefit_count || 0), 0);
  const noBenefit = active.filter((c) => !c.benefit_count);
  const unassignedTotal = unassigned.reduce((s, u) => s + (u.count || 0), 0);

  // 카드사로 묶는다. 평평하게 늘어놓으면 어느 카드사 카드인지 매번 읽어야 한다.
  const issuers = [];
  for (const c of active) {
    const name = c.payment_method_name || c.issuer || '카드사 미상';
    let g = issuers.find((x) => x.name === name);
    if (!g) { g = { name, items: [] }; issuers.push(g); }
    g.items.push(c);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-caption">
          지금 등록된 카드와 <strong className="text-body">아직 안 채운 것</strong>을 모아 봐요.
          고치는 건 위의 &lsquo;보유 카드&rsquo; · &lsquo;카드 혜택&rsquo; 에서 해요.
        </p>
        <button
          type="button" onClick={load}
          className="text-xs text-brand-text border border-line hover:bg-surface-page rounded-control px-3 py-1.5 shrink-0 transition-colors"
        >
          새로고침
        </button>
      </div>

      {error && <p role="alert" className="text-xs text-loss-text">{error}</p>}

      {loaded && cards.length === 0 && !error && (
        <EmptyState
          title="등록된 카드가 없어요"
          description="'보유 카드' 에서 카드를 등록하면 여기에 현황이 나와요."
        />
      )}

      {cards.length > 0 && (
        <>
          {/* 요약을 맨 위에 둔다. 목록을 다 읽고 나서야 "혜택이 몇 장이나 비었지"
              를 알게 되면 이 화면의 목적이 사라진다. */}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-surface-sunken rounded-card px-3 py-2">
              <dt className="text-[11px] text-caption">등록 카드</dt>
              <dd className="text-sm text-ink">{active.length}장</dd>
            </div>
            <div className="bg-surface-sunken rounded-card px-3 py-2">
              <dt className="text-[11px] text-caption">혜택</dt>
              <dd className="text-sm text-ink">{benefitTotal}건</dd>
            </div>
            <div className="bg-surface-sunken rounded-card px-3 py-2">
              <dt className="text-[11px] text-caption">혜택 없는 카드</dt>
              <dd className="text-sm text-ink">{noBenefit.length}장</dd>
            </div>
            <div className="bg-surface-sunken rounded-card px-3 py-2">
              <dt className="text-[11px] text-caption">카드 미지정 거래</dt>
              <dd className="text-sm text-ink">{unassignedTotal}건</dd>
            </div>
          </dl>

          {issuers.map((g) => (
            <div key={g.name} className="space-y-2">
              <h4 className="text-xs font-medium text-body">{g.name}</h4>
              <ul className="space-y-2">
                {g.items.map((c) => {
                  const gaps = gapsOf(c);
                  return (
                    <li key={c.id} className="bg-surface-sunken rounded-card px-3 py-2 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm text-ink">{c.product_name}</span>
                        <span className="text-[11px] text-caption shrink-0">{c.card_type}</span>
                      </div>
                      <p className="text-[11px] text-caption">
                        연회비 {formatWon(c.annual_fee || 0)}
                        {' · '}
                        {c.prev_month_threshold === null || c.prev_month_threshold === undefined
                          ? '전월실적 조건 없음'
                          : `전월실적 ${formatWon(c.prev_month_threshold)}`}
                        {' · '}
                        {c.statement_close_day && c.billing_cycle_day
                          ? `${c.statement_close_day}일 마감 · ${c.billing_cycle_day}일 결제`
                          : '청구주기 미설정'}
                      </p>
                      <p className="text-[11px] text-caption">
                        혜택 {c.benefit_count}건 · 이 카드로 기록된 거래 {c.transaction_count}건
                      </p>
                      {gaps.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {gaps.map((gp) => (
                            <Badge key={gp.key} level={gp.level}>{gp.label}</Badge>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {inactive.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-caption">더 안 쓰기로 한 카드</h4>
              <ul className="space-y-1">
                {inactive.map((c) => (
                  <li key={c.id} className="text-[11px] text-caption">
                    {c.payment_method_name || c.issuer} · {c.product_name}
                    {' — '}이 카드로 기록된 거래 {c.transaction_count}건
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {unassigned.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-body">아직 어느 카드인지 안 정한 거래</h4>
          <ul className="space-y-1">
            {unassigned.map((u) => (
              <li key={u.payment_method_id} className="text-[11px] text-caption">
                {u.name} — {u.count}건
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-caption">
            카드를 등록한 뒤 &lsquo;지난 거래 카드 지정&rsquo; 에서 붙일 수 있어요.
            기억나지 않는 건 안 정한 채로 두어도 괜찮아요.
          </p>
        </div>
      )}
    </div>
  );
}
