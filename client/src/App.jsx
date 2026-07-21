import React, { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Installments from './pages/Installments';
import Revolving from './pages/Revolving';
import Debts from './pages/Debts';

const NAV = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'transactions', label: '거래입력' },
  { id: 'installments', label: '할부' },
  { id: 'revolving', label: '리볼빙' },
  { id: 'debts', label: '부채' },
];

export default function App() {
  const [page, setPage] = useState('dashboard');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-6">
        <span className="font-bold text-indigo-600 text-lg">💰 Finance Tracker</span>
        {NAV.map(n => (
          <button
            key={n.id}
            onClick={() => setPage(n.id)}
            className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
              page === n.id
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            {n.label}
          </button>
        ))}
      </nav>

      {/* Page */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {page === 'dashboard' && <Dashboard />}
        {page === 'transactions' && <Transactions />}
        {page === 'installments' && <Installments />}
        {page === 'revolving' && <Revolving />}
        {page === 'debts' && <Debts />}
      </main>
    </div>
  );
}
