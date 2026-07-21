import React, { useEffect, useState, useCallback } from 'react';
import TransactionList from '../components/TransactionList';
import TransactionForm from '../components/TransactionForm';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/transactions?limit=100').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/payment-methods').then(r => r.json()),
    ]).then(([txData, cats, pms]) => {
      setTransactions(txData.data || []);
      setCategories(cats);
      setPaymentMethods(pms);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (formData) => {
    const method = editItem ? 'PUT' : 'POST';
    const url = editItem ? `/api/transactions/${editItem.id}` : '/api/transactions';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    setShowForm(false);
    setEditItem(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    load();
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">거래 내역</h1>
        <button
          onClick={() => { setEditItem(null); setShowForm(true); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          + 거래 추가
        </button>
      </div>

      {showForm && (
        <TransactionForm
          initial={editItem}
          categories={categories}
          paymentMethods={paymentMethods}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {loading ? (
        <div className="text-gray-400 text-center py-10">로딩 중...</div>
      ) : (
        <TransactionList
          items={transactions}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
