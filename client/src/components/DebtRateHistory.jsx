import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useConfirm } from './ConfirmProvider';

// 부채 금리 이력(#329).
//
// 변동금리(예: 3개월 주기)를 통보받을 때마다 여기에 넣는다. 이력이 있어야 과거
// 이자를 그때 금리로 계산할 수 있다 — 지금 금리로 소급하면 실제 청구액과 다르다(#285).
//
// 부채 수정 폼에서는 금리를 못 고친다. 금리는 **시점이 붙어야** 의미가 있어서
// 여기로만 들어온다.

function pct(n) {
  return `연 ${Number(n)}%`;
}

// 적용 기간 표시. 종료일이 없으면 "부터" 로 끝낸다 — 내부적으로 무기한을 어떻게
// 다루든 그건 화면에 나올 것이 아니다.
function period(row) {
  return row.effective_to ? `${row.effective_from} ~ ${row.effective_to}` : `${row.effective_from}부터`;
}

export default function DebtRateHistory({ debtId, onChanged }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ annual_rate: '', effective_from: '', memo: '' });
  const [saveError, setSaveError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { alert } = useConfirm();

  const load = async () => {
    try {
      const res = await api.get(`/api/debts/${debtId}/rates`);
      setRows(res.data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, [debtId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    try {
      await api.post(`/api/debts/${debtId}/rates`, {
        annual_rate: Number(form.annual_rate),
        effective_from: form.effective_from,
        memo: form.memo || null,
      });
      setForm({ annual_rate: '', effective_from: '', memo: '' });
      setShowForm(false);
      await load();
      onChanged?.();
    } catch (err) {
      // 폼 옆에 남긴다. 모달로 띄우고 사라지면 어느 값을 고쳐야 하는지 보면서
      // 수정할 수 없다.
      setSaveError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p role="alert" className="text-xs text-loss-text py-2">{error}</p>;
  if (rows === null) return <p className="text-xs text-caption py-2">불러오는 중...</p>;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-caption">금리 이력</h4>
        <button
          type="button"
          onClick={() => { setShowForm((s) => !s); setSaveError(null); }}
          className="text-xs text-brand-text hover:underline"
        >
          {showForm ? '닫기' : '+ 금리 변경'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface-page rounded-control p-3 mt-2 space-y-2">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="w-28">
              <label htmlFor="rate-value" className="block text-xs text-caption mb-1">연이율 (%)</label>
              {/* 소수를 받아야 한다. 실제 금리가 연 4.17% 같은 값이다. */}
              <input
                id="rate-value" type="number" step="0.01" min="0" max="100" required
                className="w-full bg-surface border border-line-strong rounded-control px-2 py-1.5 text-sm text-ink"
                value={form.annual_rate}
                onChange={(e) => setForm((f) => ({ ...f, annual_rate: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="rate-from" className="block text-xs text-caption mb-1">적용 시작일</label>
              <input
                id="rate-from" type="date" required
                className="bg-surface border border-line-strong rounded-control px-2 py-1.5 text-sm text-ink"
                value={form.effective_from}
                onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
              />
            </div>
            <div className="flex-1 min-w-[8rem]">
              <label htmlFor="rate-memo" className="block text-xs text-caption mb-1">메모</label>
              <input
                id="rate-memo" type="text" placeholder="예: 3개월 재산정"
                className="w-full bg-surface border border-line-strong rounded-control px-2 py-1.5 text-sm text-ink"
                value={form.memo}
                onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              />
            </div>
            <button type="submit" disabled={busy} className="btn-primary text-xs px-3 py-1.5 rounded-control disabled:opacity-60">
              {busy ? '저장 중...' : '저장'}
            </button>
          </div>
          <p className="text-[11px] text-caption">
            이 날짜부터 새 금리가 적용돼요. 이전 금리는 전날까지로 닫히고, 그 기간 이자는
            그때 금리로 계산됩니다.
          </p>
          {saveError && <p role="alert" className="text-xs text-loss-text">{saveError}</p>}
        </form>
      )}

      {!rows.length ? (
        <p className="text-xs text-caption py-2">
          금리 이력이 없어요. 금리를 넣어 두면 그 시점 기준으로 이자를 계산할 수 있어요.
        </p>
      ) : (
        <ul className="divide-y divide-line-faint mt-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span className="text-ink tabular-nums whitespace-nowrap">{pct(r.annual_rate)}</span>
              <span className="text-caption flex-1 truncate">{period(r)}</span>
              {r.memo && <span className="text-caption truncate max-w-[8rem]">{r.memo}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
