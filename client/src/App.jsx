import React, { useState, lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Comparison = lazy(() => import('./pages/Comparison'));
const Installments = lazy(() => import('./pages/Installments'));
const Revolving = lazy(() => import('./pages/Revolving'));
const Debts = lazy(() => import('./pages/Debts'));
const Simulator = lazy(() => import('./pages/Simulator'));
const Savings = lazy(() => import('./pages/Savings'));
const Settings = lazy(() => import('./pages/Settings'));
const Guide = lazy(() => import('./pages/Guide'));

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
        <Suspense fallback={<div className="text-slate-500 text-center py-20">로딩 중...</div>}>
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
        </Suspense>
      </main>
    </div>
  );
}
