import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatWon } from '../lib/format';

// 실적 집계에서 뺄 거래를 고른다(#526).
//
// **카드별로 섹션을 나눈다.** 한 목록에 전 카드 거래를 섞으면 어느 카드의 실적을
// 조정하는지 알 수 없다 — 이슈가 명시한 요구다.
//
// 자동 제외(수입·할부금 같은 파생 행)는 목록에 없다. 서버가 애초에 안 내려준다.
// 못 바꾸는 것을 보여주면 눌러 보고 나서 아무 일도 안 일어난다.

// `onChanged` 는 제외가 바뀐 뒤 **위쪽 «전월 실적» 을 다시 읽게** 한다.
// 없으면 이 목록만 줄고 실적 줄은 옛 숫자를 그대로 들고 있어, 한 화면의 두
// 숫자가 서로 다른 말을 한다. 실제로 그 상태를 만들어 확인했다.
export default function ThresholdExclusionSection({ onChanged }) {
  const [cards, setCards] = useState([]);
  const [period, setPeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [openCardId, setOpenCardId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/card-strategy/threshold-transactions');
      setCards(res.data || []);
      setPeriod(res.period || null);
    } catch (e) {
      setError(e.message || '거래를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (tx) => {
    setBusyId(tx.id);
    try {
      if (tx.excluded) {
        await api.del(`/api/card-strategy/exclusions/${tx.id}`);
      } else {
        await api.post('/api/card-strategy/exclusions', { transaction_id: tx.id });
      }
      await load();
      if (onChanged) await onChanged();
    } catch (e) {
      setError(e.message || '바꾸지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-sm text-caption py-4">불러오는 중</p>;

  const withTx = cards.filter((c) => c.transactions.length > 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-body">
          카드사 기준으로 실적에 안 잡히는 거래가 있으면 여기서 뺄 수 있어요.
        </p>
        {period && (
          <p className="text-xs text-caption mt-1">{period.start} ~ {period.end} 거래</p>
        )}
      </div>

      {error && <p className="text-xs text-loss-text">{error}</p>}

      {withTx.length === 0 && (
        <p className="text-sm text-caption">지난달에 카드로 쓴 거래가 없어요.</p>
      )}

      {withTx.map((card) => {
        const open = openCardId === card.cardProductId;
        const excludedCount = card.transactions.filter((t) => t.excluded).length;
        return (
          <section key={card.cardProductId} className="border border-line rounded-card">
            <button
              type="button"
              onClick={() => setOpenCardId(open ? null : card.cardProductId)}
              aria-expanded={open}
              className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
            >
              <span className="text-sm text-ink">
                {card.issuer} {card.productName}
                <span className="text-xs text-caption ml-2">
                  {card.transactions.length}건
                  {excludedCount > 0 && ` · ${excludedCount}건 제외됨`}
                </span>
              </span>
              <span className="text-sm font-medium tabular-nums text-body">
                {formatWon(card.countedTotal)}
              </span>
            </button>

            {open && (
              <ul className="border-t border-line divide-y divide-line-faint">
                {card.transactions.map((tx) => (
                  <li
                    key={tx.id}
                    className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 ${tx.excluded ? 'opacity-60' : ''}`}
                  >
                    <span className="text-xs text-body min-w-0">
                      <span className="text-caption tabular-nums mr-2">{tx.date}</span>
                      {tx.merchant || '(가맹점 없음)'}
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs tabular-nums ${tx.excluded ? 'line-through text-caption' : 'text-body'}`}>
                        {formatWon(tx.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggle(tx)}
                        disabled={busyId === tx.id}
                        className="text-xs px-2 py-1 rounded-chip border border-line text-caption hover:bg-surface-page disabled:opacity-50"
                      >
                        {tx.excluded ? '다시 넣기' : '실적에서 빼기'}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
