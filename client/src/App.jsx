import React, { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Comparison from './pages/Comparison';
import Installments from './pages/Installments';
import Revolving from './pages/Revolving';
import Debts from './pages/Debts';
import Simulator from './pages/Simulator';
import Savings from './pages/Savings';
import Settings from './pages/Settings';
import Guide from './pages/Guide';

const NAV = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'transactions', label: '거래입력' },
  { id: 'comparison', label: '기간비교' },
  { id: 'installments', label: '할부' },
  { id: 'revolving', label: '리볼빙' },
  { id: 'debts', label: '부채' },
  { id: 'savings', label: '적금' },
  { id: 'simulator', label: '시뮬레이터' },
  { id: 'settings', label: '설정' },
  { id: 'guide', label: '가이드' },
];

export default function App() {
  const [page, setPage] = useState('dashboard');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-4 sm:gap-6">
        <span className="font-bold text-indigo-600 text-lg whitespace-nowrap shrink-0">💰 Finance Tracker</span>
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`text-sm px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                page === n.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {n.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Page */}
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-6">
        {page === 'dashboard' && <Dashboard />}
        {page === 'transactions' && <Transactions />}
        {page === 'comparison' && <Comparison />}
        {page === 'installments' && <Installments />}
        {page === 'revolving' && <Revolving />}
        {page === 'debts' && <Debts />}
        {page === 'savings' && <Savings />}
        {page === 'simulator' && <Simulator />}
        {page === 'settings' && <Settings />}
        {page === 'guide' && <Guide />}
      </main>
    </div>
  );
}
