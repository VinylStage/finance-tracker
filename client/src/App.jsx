import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Redirect, Route, Switch, useLocation } from 'wouter';
import { NAV_GROUPS, groupForPath } from './lib/nav';
import CommandPalette from './components/CommandPalette';
import BottomTabBar from './components/BottomTabBar';
import WelcomeGate from './components/WelcomeGate';
import Icon from './components/Icon';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Comparison = lazy(() => import('./pages/Comparison'));
const Installments = lazy(() => import('./pages/Installments'));
const Revolving = lazy(() => import('./pages/Revolving'));
const Debts = lazy(() => import('./pages/Debts'));
const Simulator = lazy(() => import('./pages/Simulator'));
const Savings = lazy(() => import('./pages/Savings'));
const CardStrategy = lazy(() => import('./pages/CardStrategy'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Settings = lazy(() => import('./pages/Settings'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Guide = lazy(() => import('./pages/Guide'));

function NavLink({ href, active, className = '', children }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`text-sm px-3 py-1.5 rounded-control transition-colors whitespace-nowrap shrink-0 ${
        active ? 'bg-brand-tint text-brand-text' : 'text-caption hover:text-ink hover:bg-surface-page'
      } ${className}`}
    >
      {children}
    </Link>
  );
}

export default function App() {
  const [location] = useLocation();
  const group = groupForPath(location);

  // 화면 검색(#281). 단축키는 데스크톱의 지름길일 뿐이고, 헤더 버튼이 정식
  // 진입점이다 — 모바일에는 Cmd+K 가 없다.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    // pb-16 은 모바일 하단 탭바에 콘텐츠가 가리지 않게 하기 위한 여백이다.
    <div className="min-h-screen bg-surface-page pb-16 md:pb-0">
      <nav className="bg-surface border-b border-line px-4 py-3 flex items-center gap-4 sm:gap-6">
        <Link href="/" className="font-bold text-brand-text text-lg whitespace-nowrap shrink-0 inline-flex items-center gap-1.5">
          <Icon name="wallet" size={20} className="shrink-0" />
          Finance Tracker
        </Link>
        <div className="hidden md:flex items-center gap-1 sm:gap-2 overflow-x-auto">
          {NAV_GROUPS.map((g) => (
            <NavLink key={g.id} href={g.path} active={group?.id === g.id}>
              {g.label}
            </NavLink>
          ))}
        </div>
        {/* 아이콘 대신 글자를 쓴다. icons/paths.js 에 돋보기가 없고 그 파일은 수정
            금지인 데다, "기능을 못 찾겠다" 는 요청에는 돋보기보다 '검색' 글자가
            눈에 띈다. */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="화면 검색 열기"
          title="화면 검색 (⌘K)"
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs text-caption hover:text-ink hover:bg-surface-page transition-colors"
        >
          검색
          <kbd className="hidden sm:inline text-[10px] border border-line rounded px-1">⌘K</kbd>
        </button>
        <Link
          href="/guide"
          aria-label="가이드"
          title="가이드"
          aria-current={location === '/guide' ? 'page' : undefined}
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors ${
            location === '/guide'
              ? 'bg-brand-tint text-brand-text'
              : 'text-caption hover:text-ink hover:bg-surface-page'
          }`}
        >
          <Icon name="help" size={18} />
        </Link>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {group?.children && (
        <div className="bg-surface border-b border-line px-4 py-2 flex items-center gap-1 overflow-x-auto">
          {group.children.map((c) => (
            <NavLink key={c.path} href={c.path} active={location === c.path} className="text-xs">
              {c.label}
            </NavLink>
          ))}
        </div>
      )}

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-6">
        <Suspense fallback={<div className="text-caption text-center py-20">로딩 중...</div>}>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/transactions" component={Transactions} />
            <Route path="/analysis">
              <Redirect to="/analysis/comparison" />
            </Route>
            <Route path="/analysis/comparison" component={Comparison} />
            <Route path="/analysis/simulator" component={Simulator} />
            <Route path="/analysis/cards" component={CardStrategy} />
            <Route path="/assets">
              <Redirect to="/assets/installments" />
            </Route>
            <Route path="/assets/accounts" component={Accounts} />
            <Route path="/assets/installments" component={Installments} />
            <Route path="/assets/revolving" component={Revolving} />
            <Route path="/assets/debts" component={Debts} />
            <Route path="/assets/savings" component={Savings} />
            <Route path="/settings" component={Settings} />
            <Route path="/settings/history" component={AuditLog} />
            <Route path="/guide" component={Guide} />
            <Route>
              <Redirect to="/" />
            </Route>
          </Switch>
        </Suspense>
      </main>

      <BottomTabBar />
      <WelcomeGate />
    </div>
  );
}
