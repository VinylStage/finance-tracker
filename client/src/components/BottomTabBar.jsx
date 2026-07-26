import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { NAV_GROUPS, MOBILE_PRIMARY, groupForPath } from '../lib/nav';

// 모바일(<md) 하단 탭바(#188). 핵심 3개만 상시 노출하고 나머지 그룹과 가이드는
// '더보기' 시트로 내린다. 데스크톱에서는 상단 내비게이션이 같은 역할을 하므로 숨긴다.
export default function BottomTabBar() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const active = groupForPath(location);

  const primary = NAV_GROUPS.filter((g) => MOBILE_PRIMARY.includes(g.id));
  const rest = NAV_GROUPS.filter((g) => !MOBILE_PRIMARY.includes(g.id));
  const restActive = rest.some((g) => g.id === active?.id) || location === '/guide';

  const itemClass = (on) =>
    `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors ${
      on ? 'text-accent-strong' : 'text-ink-faint'
    }`;

  const sheetItemClass =
    'flex items-center gap-2 px-3 py-2.5 rounded-md text-sm text-ink-body hover:bg-surface-muted';

  return (
    <>
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-ink/30"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}
      {moreOpen && (
        <div className="md:hidden fixed bottom-16 inset-x-0 z-50 mx-3 rounded-card border border-line bg-surface shadow-card p-2">
          {rest.map((g) => (
            <Link key={g.id} href={g.path} onClick={() => setMoreOpen(false)} className={sheetItemClass}>
              <span aria-hidden="true">{g.icon}</span>
              {g.label}
            </Link>
          ))}
          <Link href="/guide" onClick={() => setMoreOpen(false)} className={sheetItemClass}>
            <span aria-hidden="true">❓</span>
            가이드
          </Link>
        </div>
      )}
      <nav
        aria-label="주요 화면"
        className="md:hidden fixed bottom-0 inset-x-0 z-50 flex bg-surface border-t border-line"
      >
        {primary.map((g) => {
          const on = active?.id === g.id;
          return (
            <Link
              key={g.id}
              href={g.path}
              aria-current={on ? 'page' : undefined}
              className={itemClass(on)}
            >
              <span aria-hidden="true" className="text-base leading-none">{g.icon}</span>
              {g.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className={itemClass(restActive || moreOpen)}
        >
          <span aria-hidden="true" className="text-base leading-none">⋯</span>
          더보기
        </button>
      </nav>
    </>
  );
}
