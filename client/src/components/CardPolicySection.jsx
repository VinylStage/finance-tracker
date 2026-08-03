import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useConfirm } from './ConfirmProvider';
import EmptyState from './EmptyState';
import Icon from './Icon';
import { groupToRanges, rangeLabel, describePolicy, describePeriod, fieldsFor } from '../lib/cardPolicyRanges';

// 카드사 할부 정책 입력(#271).
//
// 연 1회 정도 입력하고 이후엔 거의 안 건드리는 성격이라 설정 화면에 둔다.
// 결제수단 바로 아래인 이유는 정책이 결제수단에 딸린 데이터이기 때문이다.
//
// 입력은 구간(2~3개월)으로 받고 저장은 서버가 개월수별 행으로 펼친다. 화면이
// 펼쳐서 11번 POST 하면 중간에 겹침으로 막혔을 때 앞부분만 들어간 상태가 남는다.

const POLICY_TYPES = ['무이자', '부분무이자', '유이자'];

const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

const EMPTY_FORM = {
  from_month: '2',
  to_month: '3',
  policy_type: '무이자',
  annual_rate: '',
  free_from_sequence: '',
  effective_from: '',
  effective_to: '',
  memo: '',
};

// 할부 정책을 고를 수 있는 결제수단.
//
// 신용카드만 추린다 — 현금·계좌이체에 할부 정책을 물어보는 목록은 사용자가
// 무엇을 골라야 할지 헷갈리게 한다. 다만 신용으로 분류된 것이 하나도 없으면
// 전체를 보여준다. 유형을 다르게 적어 둔 사용자가 화면에서 잠기면 안 된다.
export function selectableMethods(paymentMethods) {
  const active = (paymentMethods || []).filter((p) => p.is_active);
  const credit = active.filter((p) => p.type === '신용');
  return credit.length ? credit : active;
}

export default function CardPolicySection({ paymentMethods }) {
  const active = selectableMethods(paymentMethods);
  const [selectedId, setSelectedId] = useState(() => (active[0] ? String(active[0].id) : ''));
  const [policies, setPolicies] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { confirm, alert } = useConfirm();

  const load = async (id) => {
    if (!id) { setPolicies([]); return; }
    try {
      const res = await api.get(`/api/card-policies?payment_method_id=${id}`);
      setPolicies(res.data || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    }
  };

  useEffect(() => { load(selectedId); }, [selectedId]);

  const visible = fieldsFor(form.policy_type);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    // 이전 오류를 남겨두면 성공한 뒤에도 붉은 문구가 붙어 있다.
    setSaveError(null);
    try {
      await api.post('/api/card-policies/range', {
        payment_method_id: Number(selectedId),
        from_month: Number(form.from_month),
        to_month: Number(form.to_month),
        policy_type: form.policy_type,
        // 감춘 입력은 값을 보내지 않는다. 종류를 바꾸기 전에 적어둔 값이
        // 남아 있으면 서버가 "무이자에는 이자율을 넣을 수 없습니다" 로 막는다.
        annual_rate: visible.rate ? Number(form.annual_rate || 0) : 0,
        free_from_sequence: visible.free ? Number(form.free_from_sequence || 0) : 0,
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
        memo: form.memo || null,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load(selectedId);
    } catch (err) {
      // 겹침(409)은 사용자가 고칠 수 있는 문제다. 모달로 띄우고 사라지게 두면
      // 어느 값을 고쳐야 하는지 보면서 수정할 수 없다 — 폼 옆에 남긴다.
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (range) => {
    const label = rangeLabel(range);
    const count = range.ids.length;
    const ok = await confirm(
      `${label} 구간을 지울까요? 개월수 ${count}건이 함께 사라집니다.`,
      { tone: 'danger', confirmLabel: '지우기' }
    );
    if (!ok) return;
    try {
      const params = new URLSearchParams({
        payment_method_id: String(range.payment_method_id),
        from_month: String(range.from_month),
        to_month: String(range.to_month),
        effective_from: range.effective_from,
      });
      await api.del(`/api/card-policies/range?${params}`);
      await load(selectedId);
    } catch (err) {
      await alert(err.message);
    }
  };

  const ranges = groupToRanges(policies);

  return (
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-body">카드 할부 정책</h2>
        {selectedId && (
          <button
            type="button"
            onClick={() => { setShowForm((s) => !s); setSaveError(null); }}
            className="text-xs text-brand-text hover:text-brand-text"
          >
            {showForm ? '닫기' : '+ 구간 추가'}
          </button>
        )}
      </div>

      <p className="text-xs text-caption leading-relaxed">
        카드사 안내에 적힌 무이자·부분무이자 구간을 그대로 넣어 두면, 할부를 등록할 때
        회차별 수수료를 자동으로 계산해요. 부분무이자는 안내에 적힌 "4회차부터 면제" 의
        숫자를 그대로 넣으시면 돼요. 한 번 넣어 두면 정책이 바뀔 때까지 다시 만질 일이 없어요.
      </p>

      {active.length === 0 ? (
        <EmptyState
          icon={<Icon name="payments" size={28} />}
          title="등록된 결제수단이 아직 없어요"
          description="할부 정책은 결제수단에 딸린 정보예요. 위 결제수단 관리에서 카드를 먼저 추가해 주세요."
        />
      ) : (
        <>
          <div>
            <label htmlFor="card-policy-method" className="block text-xs text-caption mb-1">결제수단</label>
            <select
              id="card-policy-method"
              className={inp}
              value={selectedId}
              onChange={(e) => { setSelectedId(e.target.value); setSaveError(null); }}
            >
              {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="bg-surface-page rounded-control p-3 space-y-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="w-24">
                  <label htmlFor="policy-from-month" className="block text-xs text-caption mb-1">시작 개월</label>
                  <input
                    id="policy-from-month" type="number" min="2" className={inp}
                    value={form.from_month}
                    onChange={(e) => setForm((f) => ({ ...f, from_month: e.target.value }))}
                    required
                  />
                </div>
                <div className="w-24">
                  <label htmlFor="policy-to-month" className="block text-xs text-caption mb-1">종료 개월</label>
                  <input
                    id="policy-to-month" type="number" min="2" className={inp}
                    value={form.to_month}
                    onChange={(e) => setForm((f) => ({ ...f, to_month: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="policy-type" className="block text-xs text-caption mb-1">정책 종류</label>
                  <select
                    id="policy-type" className={inp}
                    value={form.policy_type}
                    onChange={(e) => setForm((f) => ({ ...f, policy_type: e.target.value }))}
                  >
                    {POLICY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {visible.rate && (
                  <div className="w-28">
                    <label htmlFor="policy-annual-rate" className="block text-xs text-caption mb-1">연 이자율(%)</label>
                    <input
                      id="policy-annual-rate" type="number" step="0.1" min="0" max="100" className={inp}
                      value={form.annual_rate}
                      onChange={(e) => setForm((f) => ({ ...f, annual_rate: e.target.value }))}
                      required
                    />
                  </div>
                )}
                {visible.free && (
                  <div className="w-32">
                    {/* 카드사 안내가 "4회차부터 면제" 라고 적어 주므로 그 숫자를
                        그대로 옮겨 적게 한다. 앞 회차는 고객 부담이다. */}
                    <label htmlFor="policy-free-from" className="block text-xs text-caption mb-1">면제 시작 회차</label>
                    <input
                      id="policy-free-from" type="number" min="2" className={inp}
                      placeholder="예: 4"
                      value={form.free_from_sequence}
                      onChange={(e) => setForm((f) => ({ ...f, free_from_sequence: e.target.value }))}
                      required
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label htmlFor="policy-effective-from" className="block text-xs text-caption mb-1">적용 시작일</label>
                  <input
                    id="policy-effective-from" type="date" className={inp}
                    value={form.effective_from}
                    onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="policy-effective-to" className="block text-xs text-caption mb-1">적용 종료일 (비우면 계속)</label>
                  <input
                    id="policy-effective-to" type="date" className={inp}
                    value={form.effective_to}
                    onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))}
                  />
                </div>
                <button type="submit" disabled={saving} className="btn-primary text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-60">
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>

              {saveError && (
                <p role="alert" className="text-xs text-loss-text">{saveError}</p>
              )}
            </form>
          )}

          {loadError && <p role="alert" className="text-xs text-loss-text">{loadError}</p>}

          {ranges.length === 0 ? (
            <EmptyState
              icon={<Icon name="wallet" size={28} />}
              title="이 카드에 등록된 할부 정책이 없어요"
              description="카드사 안내의 무이자 구간을 넣어 두면 할부 등록 시 수수료가 자동으로 계산돼요. 위 구간 추가로 시작해 보세요."
            />
          ) : (
            <ul className="divide-y divide-line">
              {ranges.map((r) => (
                <li key={`${r.effective_from}-${r.from_month}-${r.to_month}`} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">
                      <span className="font-medium">{rangeLabel(r)}</span>
                      <span className="text-caption"> · {describePolicy(r)}</span>
                    </p>
                    <p className="text-xs text-caption mt-0.5">{describePeriod(r)}</p>
                    {r.memo && <p className="text-xs text-caption mt-0.5 truncate">{r.memo}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(r)}
                    aria-label={`${rangeLabel(r)} 구간 삭제`}
                    className="shrink-0 text-caption hover:text-loss-text px-1.5 py-0.5 rounded-full hover:bg-loss-tint"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
