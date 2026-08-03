import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useConfirm } from './ConfirmProvider';
import Icon from './Icon';

// 할부 전환으로 생긴 중복 의심 거래(#269 잔여).
//
// B안은 "할부의 정본은 installments 행 하나이고 거래내역에는 청구 회차만 나타난다"
// 이다. 그 전에 할부 구매를 직접 거래로 넣어 뒀으면 그게 중복이 된다.
//
// **자동으로 지우지 않는다.** 이 저장소는 실거래 2,212건 유실 사고가 있었다.
// 후보를 보여주고 사용자가 하나씩 고른다(ADR 0008 프리뷰 → 확인).

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

// 확신도를 사용자 말로 옮긴다. 내부 값(exact/likely/review)을 노출하지 않는다(#231).
//
// 색만으로 구분하지 않는다 — 아이콘과 텍스트를 함께 쓴다(#191, WCAG 1.4.1).
const CONFIDENCE_LABEL = {
  exact: { icon: 'error', text: '금액·가맹점·날짜가 모두 같아요', tone: 'text-loss-text' },
  likely: { icon: 'analytics', text: '월 납입액과 같아요', tone: 'text-body' },
  review: { icon: 'help', text: '할부로 적혀 있는데 등록된 할부가 없어요', tone: 'text-caption' },
};

export default function DuplicateCandidates() {
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { confirm, alert } = useConfirm();

  const load = async () => {
    try {
      const res = await api.get('/api/installments/duplicates');
      setRows(res.data || []);
      setSelected(new Set());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // 지우기는 두 단계다. 서버에 먼저 확인을 받고, 무엇이 사라지는지 보여준 뒤에만
  // 실행한다. 지문이 없거나 낡으면 서버가 막는다.
  const handleDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    try {
      const preview = await api.post('/api/installments/duplicates/preview', { ids });
      const plan = preview.data;

      const ok = await confirm(
        `${plan.rows.length}건, 합계 ${fmt(plan.total)}을 지울까요? 되돌릴 수 없어요.`,
        { tone: 'danger', confirmLabel: '지우기' }
      );
      if (!ok) return;

      const res = await api.post('/api/installments/duplicates/resolve', {
        delete_ids: ids, preview_token: plan.fingerprint,
      });
      await load();
      await alert(`${res.deleted}건을 지웠어요.`);
    } catch (err) {
      await alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  // 지우는 것만이 판단이 아니다. 둘 다 남겨 두기로 했으면 그것도 판단이고,
  // 기억해 두지 않으면 목록이 계속 같은 행을 보여줘 결국 무시하게 된다.
  const handleKeep = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    try {
      const res = await api.post('/api/installments/duplicates/resolve', { keep_ids: ids });
      await load();
      await alert(`${res.kept}건을 중복이 아닌 것으로 표시했어요. 목록에서 빠집니다.`);
    } catch (err) {
      await alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="bg-surface shadow-card rounded-card border border-line p-5">
        <p role="alert" className="text-xs text-loss-text">{error}</p>
      </div>
    );
  }
  if (rows === null) return null;
  // 후보가 없으면 자리를 차지하지 않는다. 없는 게 정상이다.
  if (!rows.length) return null;

  return (
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-body">중복일 수 있는 거래 {rows.length}건</h2>
        {selected.size > 0 && (
          <div className="flex gap-2">
            <button
              type="button" onClick={handleKeep} disabled={busy}
              className="text-xs text-caption hover:text-ink px-2 py-1 rounded-control hover:bg-surface-sunken disabled:opacity-60"
            >
              중복 아님 ({selected.size})
            </button>
            <button
              type="button" onClick={handleDelete} disabled={busy}
              className="text-xs text-loss-text hover:bg-loss-tint px-2 py-1 rounded-control disabled:opacity-60"
            >
              지우기 ({selected.size})
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-caption leading-relaxed">
        할부를 등록하면 청구 회차가 거래내역에 자동으로 만들어져요. 그 전에 직접 넣어 둔
        거래가 있으면 같은 지출이 두 번 잡힙니다. <strong>무엇을 지울지는 직접 골라 주세요</strong> —
        자동으로 지우지 않아요.
      </p>

      <ul className="divide-y divide-line">
        {rows.map((c) => {
          const label = CONFIDENCE_LABEL[c.confidence] || CONFIDENCE_LABEL.review;
          return (
            <li key={c.transaction.id} className="py-2.5 flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 cursor-pointer"
                aria-label={`${c.transaction.date} ${c.transaction.merchant || ''} ${fmt(c.transaction.amount)} 선택`}
                checked={selected.has(c.transaction.id)}
                onChange={() => toggle(c.transaction.id)}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  <span className="text-caption">{c.transaction.date}</span>
                  {' · '}
                  {c.transaction.merchant || '가맹점 없음'}
                  {' · '}
                  <span className="tabular-nums">{fmt(c.transaction.amount)}</span>
                </p>
                <p className={`text-xs mt-0.5 inline-flex items-center gap-1 ${label.tone}`}>
                  <Icon name={label.icon} size={12} />
                  {label.text}
                  {c.installment_merchant && ` · 할부 「${c.installment_merchant}」`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
