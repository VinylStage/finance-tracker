import React, { lazy, Suspense } from 'react';
import { Link, Redirect, Route, Switch, useLocation } from 'wouter';
import { NAV_GROUPS, groupForPath } from './lib/nav';
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
        <Link
          href="/guide"
          aria-label="가이드"
          title="가이드"
          aria-current={location === '/guide' ? 'page' : undefined}
          className={`ml-auto shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors ${
            location === '/guide'
              ? 'bg-brand-tint text-brand-text'
              : 'text-caption hover:text-ink hover:bg-surface-page'
          }`}
        >
          <Icon name="help" size={18} />
        </Link>
      </nav>

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
            <Route path="/assets">
              <Redirect to="/assets/installments" />
            </Route>
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
