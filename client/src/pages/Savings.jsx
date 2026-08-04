import React, { useState } from 'react';
import { api } from '../lib/api';
import { localYMD } from '../lib/date';
import { useLoader } from '../hooks/useLoader';
import { useConfirm } from '../components/ConfirmProvider';
import LoadError from '../components/LoadError';
import EmptyState from '../components/EmptyState';
import SavingsGoalBar from '../components/SavingsGoalBar';
import Icon from '../components/Icon';
import { formatWon } from '../lib/format';


export default function Savings() {
  const today = localYMD();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const { confirm, alert } = useConfirm();

  const { loading, error, reload } = useLoader(async () => {
    const [s, cats] = await Promise.all([
      api.get('/api/savings'),
      api.get('/api/categories'),
    ]);
    setItems(s.data || []);
    setCategories((cats || []).filter(c => c.major_type === '저축'));
  }, []);

  const handleSave = async (formData) => {
    try {
      if (editItem) await api.put(`/api/savings/${editItem.id}`, formData);
      else await api.post('/api/savings', formData);
      setShowForm(false);
      setEditItem(null);
      reload();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!await confirm('삭제하시겠습니까?', { tone: 'danger' })) return;
    try {
      await api.del(`/api/savings/${id}`);
      reload();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleMature = async (item) => {
    if (!await confirm(`"${item.name}" 만기 처리하시겠습니까? 원금 회수 + 이자가 거래 내역에 자동 기록됩니다.`)) return;
    try {
      const body = await api.raw(`/api/savings/${item.id}/mature`, { method: 'POST' });
      await alert(`만기 처리 완료\n원금: ${formatWon(body.principal)}\n이자: ${formatWon(body.interest)}\n총 수령액: ${formatWon(body.payout)}`);
      reload();
    } catch (err) {
      await alert(err.message || '처리 실패');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">적금 / 저축성보험</h1>
        <button
          onClick={() => { setEditItem(null); setShowForm(true); }}
          className="btn-primary text-sm px-4 py-2 rounded-control transition-colors"
        >
          + 상품 등록
        </button>
      </div>

      {showForm && (
        <SavingsForm
          initial={editItem}
          categories={categories}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {loading ? (
        <div className="text-caption text-center py-10">로딩 중...</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Icon name="savings" size={32} />}
          title="아직 저축 상품이 없어요"
          description="적금이나 저축성보험을 등록하면 만기까지 얼마가 남았는지, 목표의 몇 %를 채웠는지 보여드려요."
        />
      ) : (
        <div className="bg-surface shadow-card rounded-card border border-line overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-page">
              <tr className="border-b border-line">
                <th className="text-left px-4 py-3 text-caption font-medium">상품명</th>
                <th className="text-right px-4 py-3 text-caption font-medium">월 납입액</th>
                <th className="text-left px-4 py-3 text-caption font-medium hidden sm:table-cell">시작일</th>
                <th className="text-left px-4 py-3 text-caption font-medium hidden sm:table-cell">만기일</th>
                <th className="text-left px-4 py-3 text-caption font-medium">목표 진행</th>
                <th className="text-right px-4 py-3 text-caption font-medium">예상 수령액</th>
                <th className="text-center px-4 py-3 text-caption font-medium">상태</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s, i) => (
                <tr key={s.id} className={`border-b border-line-faint hover:bg-surface-page transition-colors ${i % 2 === 0 ? '' : 'bg-surface-page/50'}`}>
                  <td className="px-4 py-3 text-ink">{s.name}</td>
                  <td className="px-4 py-3 text-right text-body tabular-nums">{formatWon(s.monthly_contribution)}</td>
                  <td className="px-4 py-3 text-caption text-xs hidden sm:table-cell">{s.start_date}</td>
                  <td className="px-4 py-3 text-caption text-xs hidden sm:table-cell">{s.maturity_date || '—'}</td>
                  <td className="px-4 py-3">
                    <SavingsGoalBar product={s} today={today} />
                  </td>
                  <td className="px-4 py-3 text-right text-brand-text font-medium tabular-nums">{s.expected_payout ? formatWon(s.expected_payout) : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${s.status === '진행중' ? 'text-brand-text' : 'text-caption'}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end flex-wrap">
                      {s.status === '진행중' && (
                        <button onClick={() => handleMature(s)} className="text-caption hover:text-brand-text transition-colors text-xs">만기처리</button>
                      )}
                      <button onClick={() => { setEditItem(s); setShowForm(true); }} className="text-caption hover:text-brand-text transition-colors text-xs">수정</button>
                      <button onClick={() => handleDelete(s.id)} className="text-caption hover:text-loss-text transition-colors text-xs">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SavingsForm({ initial, categories, onSave, onCancel }) {
  const today = localYMD();
  const [form, setForm] = useState({
    name: initial?.name || '',
    monthly_contribution: initial ? String(initial.monthly_contribution) : '',
    start_date: initial?.start_date || today,
    maturity_date: initial?.maturity_date || '',
    expected_payout: initial ? String(initial.expected_payout || '') : '',
    category_id: initial?.category_id ? String(initial.category_id) : '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      monthly_contribution: Number(form.monthly_contribution),
      expected_payout: form.expected_payout ? Number(form.expected_payout) : null,
      category_id: form.category_id ? Number(form.category_id) : null,
    });
  };

  const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

  return (
    <form onSubmit={handleSubmit} className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-body">{initial ? '상품 수정' : '상품 등록'}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="savings-name" className="block text-xs text-caption mb-1">상품명 *</label>
          <input id="savings-name" type="text" className={inp} value={form.name} onChange={e => set('name', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="savings-monthly-contribution" className="block text-xs text-caption mb-1">월 납입액 (원) *</label>
          <input id="savings-monthly-contribution" type="number" className={inp} value={form.monthly_contribution} onChange={e => set('monthly_contribution', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="savings-start-date" className="block text-xs text-caption mb-1">시작일 *</label>
          <input id="savings-start-date" type="date" className={inp} value={form.start_date} onChange={e => set('start_date', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="savings-maturity-date" className="block text-xs text-caption mb-1">만기일</label>
          <input id="savings-maturity-date" type="date" className={inp} value={form.maturity_date} onChange={e => set('maturity_date', e.target.value)} />
        </div>
        <div>
          <label htmlFor="savings-expected-payout" className="block text-xs text-caption mb-1">예상 수령액 (원)</label>
          <input id="savings-expected-payout" type="number" className={inp} placeholder="원금+이자" value={form.expected_payout} onChange={e => set('expected_payout', e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="savings-category" className="block text-xs text-caption mb-1">저축 카테고리 (만기 시 원금 회수 기록에 사용)</label>
          <select id="savings-category" className={inp} value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">선택 안 함</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="submit" className="btn-primary text-sm px-5 py-2 rounded-control transition-colors">
          {initial ? '저장' : '등록'}
        </button>
        <button type="button" onClick={onCancel} className="text-caption hover:text-ink text-sm px-4 py-2 rounded-control hover:bg-surface-sunken transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}
