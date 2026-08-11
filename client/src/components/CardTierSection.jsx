import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatWon } from '../lib/format';
import { useConfirm } from './ConfirmProvider';

// 카드 실적 구간 등록(#526).
//
// 카드사마다 구간 수도 금액도 다르다. 그래서 화면도 "구간 몇 개짜리" 를 미리
// 정하지 않고 **행을 사용자가 늘리고 줄이게** 한다.
//
// 저장은 카드 단위 통째 교체다(PUT). 행 하나씩 저장하면 "3개를 2개로 줄이기" 가
// 삭제+수정 조합이 되어 중간 상태에서 하한이 겹칠 수 있고, 겹치면 어느 요율을
// 쓸지 정할 수 없다. 화면도 그 계약을 그대로 따른다 — 편집 중에는 서버에 아무것도
// 보내지 않고, 저장을 누를 때 현재 목록 전체를 보낸다.

const EMPTY_ROW = { min_spend: '', rate: '', label: '' };

// 하한이 겹치면 저장 전에 막는다. 서버도 막지만, 눌러 보고 나서 거부당하는 것보다
// 그 자리에서 알려주는 편이 낫다.
export function duplicateMinSpend(rows) {
  const seen = new Set();
  for (const r of rows) {
    const v = String(r.min_spend).trim();
    if (v === '') continue;
    if (seen.has(v)) return Number(v);
    seen.add(v);
  }
  return null;
}

export default function CardTierSection() {
  // 카드 목록은 이 섹션이 직접 읽는다. CardBenefitSection 과 같은 방식이다 —
  // 설정 화면이 카드까지 들고 있으면 이 섹션을 안 보는 사용자도 그 조회를 낸다.
  const [cards, setCards] = useState([]);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { alert } = useConfirm();

  const load = useCallback(async (cardId) => {
    if (!cardId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/card-strategy/tiers/${cardId}`);
      const list = (res.data || []).map((t) => ({
        min_spend: String(t.min_spend),
        rate: t.rate === null || t.rate === undefined ? '' : String(t.rate),
        label: t.label || '',
      }));
      setRows(list);
    } catch (e) {
      setError(e.message || '구간을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/card-products')
      .then((res) => { if (!cancelled) setCards(res.data || []); })
      .catch(() => { if (!cancelled) setCards([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { load(selectedCardId); }, [selectedCardId, load]);

  const setRow = (i, key, value) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const addRow = () => setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  const removeRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    const dup = duplicateMinSpend(rows);
    if (dup !== null) {
      await alert(`구간 하한 ${formatWon(dup)}이 두 번 있습니다. 하한은 구간마다 달라야 합니다.`);
      return;
    }
    setSaving(true);
    try {
      const tiers = rows
        .filter((r) => String(r.min_spend).trim() !== '')
        .map((r) => ({
          min_spend: Number(r.min_spend),
          rate: String(r.rate).trim() === '' ? null : Number(r.rate),
          label: r.label.trim() || null,
        }));
      await api.put(`/api/card-strategy/tiers/${selectedCardId}`, { tiers });
      await load(selectedCardId);
    } catch (e) {
      await alert(e.message || '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const inp = 'bg-surface border border-line-strong rounded-control px-2 py-1 text-sm text-ink focus:outline-none focus:border-brand-fill';

  return (
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-body">카드 실적 구간</h2>
      </div>

      <p className="text-xs text-caption leading-relaxed">
        전월 실적에 따라 적립률이 달라지는 카드는 구간을 그대로 등록하세요. 지난달 지출로
        이번 달에 적용되는 구간이 자동으로 정해집니다. 구간을 등록하지 않으면 보유 카드에
        적어 둔 실적 조건 하나로 «충족 / 미달»만 판정합니다.
      </p>

      <div>
        <label htmlFor="tier-card" className="block text-xs text-caption mb-1">카드</label>
        <select
          id="tier-card"
          className={`${inp} w-full`}
          value={selectedCardId}
          onChange={(e) => setSelectedCardId(e.target.value)}
        >
          <option value="">선택...</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>{c.issuer} {c.product_name}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-loss-text">{error}</p>}

      {selectedCardId && !loading && (
        <>
          {rows.length === 0 && (
            <p className="text-xs text-caption">등록된 구간이 없어요. 구간을 더해 보세요.</p>
          )}

          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-[11px] text-caption mb-1" htmlFor={`tier-min-${i}`}>
                    실적 하한
                  </label>
                  <input
                    id={`tier-min-${i}`}
                    type="number"
                    min="0"
                    className={`${inp} w-32`}
                    value={r.min_spend}
                    onChange={(e) => setRow(i, 'min_spend', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-caption mb-1" htmlFor={`tier-rate-${i}`}>
                    적립률 %
                  </label>
                  <input
                    id={`tier-rate-${i}`}
                    type="number"
                    min="0"
                    step="0.1"
                    className={`${inp} w-24`}
                    value={r.rate}
                    onChange={(e) => setRow(i, 'rate', e.target.value)}
                  />
                </div>
                <div className="flex-1 min-w-32">
                  <label className="block text-[11px] text-caption mb-1" htmlFor={`tier-label-${i}`}>
                    이름 (선택)
                  </label>
                  <input
                    id={`tier-label-${i}`}
                    type="text"
                    className={`${inp} w-full`}
                    value={r.label}
                    onChange={(e) => setRow(i, 'label', e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label={`${i + 1}번째 구간 지우기`}
                  className="text-xs text-caption hover:text-loss-text px-2 py-1.5"
                >
                  지우기
                </button>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={addRow}
              className="text-xs text-brand-text border border-line rounded-control px-3 py-1.5 hover:bg-surface-page"
            >
              + 구간 추가
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-xs px-4 py-1.5 rounded-control disabled:opacity-50"
            >
              {saving ? '저장 중' : '저장'}
            </button>
          </div>

          <p className="text-[11px] text-caption">
            저장은 이 카드의 구간을 통째로 바꿉니다. 비워 둔 하한은 저장되지 않습니다.
          </p>
        </>
      )}
    </div>
  );
}
