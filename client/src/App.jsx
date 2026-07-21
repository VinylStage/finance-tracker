import React, { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';

const NAV = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'transactions', label: '거래입력' },
];

export default function App() {
  const [page, setPage] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Nav */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-6">
        <span className="font-bold text-indigo-400 text-lg">💰 Finance Tracker</span>
        {NAV.map(n => (
          <button
            key={n.id}
            onClick={() => setPage(n.id)}
            className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
              page === n.id
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
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
      </main>
    </div>
  );
}
