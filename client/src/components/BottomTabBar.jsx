import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { NAV_GROUPS, MOBILE_PRIMARY, groupForPath } from '../lib/nav';
import Icon from './Icon';

// 라벨은 굵기가 400에서 600으로 바뀌면 폭이 늘어 탭이 좌우로 흔들린다. 굵은 쪽
// 사본을 자리만 차지하게 겹쳐 두어 두 상태의 폭을 같게 맞춘다.
function TabLabel({ children, on }) {
  return (
    <span className="relative inline-flex justify-center">
      <span aria-hidden="true" className="invisible font-semibold">
        {children}
      </span>
      <span className={`absolute inset-0 flex justify-center ${on ? 'font-semibold' : ''}`}>
        {children}
      </span>
    </span>
  );
}

// 모바일(<md) 하단 탭바(#188). 핵심 3개만 상시 노출하고 나머지 그룹과 가이드는
// '더보기' 시트로 내린다. 데스크톱에서는 상단 내비게이션이 같은 역할을 하므로 숨긴다.
//
// 활성 표시는 채움 + 굵기 + 색 세 채널이다. 별도 인디케이터 막대를 두지 않는다 —
// 세 채널이면 충분하고, 막대를 더하면 탭바 높이만 먹는다.
export default function BottomTabBar() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const active = groupForPath(location);

  const primary = NAV_GROUPS.filter((g) => MOBILE_PRIMARY.includes(g.id));
  const rest = NAV_GROUPS.filter((g) => !MOBILE_PRIMARY.includes(g.id));
  const restActive = rest.some((g) => g.id === active?.id) || location === '/guide';

  // 히트 타깃 44px 하한. index.css 의 base 규칙은 button 과 a[role=button] 만
  // 잡으므로 링크로 렌더되는 탭에는 여기서 직접 준다.
  const itemClass = (on) =>
    `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-11 text-[10px] transition-colors ${
      on ? 'text-brand-text' : 'text-caption'
    }`;

  const sheetItemClass =
    'flex items-center gap-2 px-3 py-2.5 rounded-control text-sm text-body hover:bg-surface-page';

  return (
    <>
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-scrim/30"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}
      {moreOpen && (
        <div className="md:hidden fixed bottom-16 inset-x-0 z-50 mx-3 rounded-card border border-line bg-surface shadow-card p-2">
          {rest.map((g) => (
            <Link key={g.id} href={g.path} onClick={() => setMoreOpen(false)} className={sheetItemClass}>
              <Icon name={g.icon} size={18} className="shrink-0 text-caption" />
              {g.label}
            </Link>
          ))}
          <Link href="/guide" onClick={() => setMoreOpen(false)} className={sheetItemClass}>
            <Icon name="help" size={18} className="shrink-0 text-caption" />
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
              {/* 활성 탭만 채운다. 채움과 굵기와 색이 함께 바뀌므로 색을 못 보는
                  사람도 어느 탭에 있는지 알 수 있다. */}
              <Icon name={g.icon} filled={on} size={20} className="shrink-0" />
              <TabLabel on={on}>{g.label}</TabLabel>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className={itemClass(restActive || moreOpen)}
        >
          <Icon name="more_horiz" filled={restActive || moreOpen} size={20} className="shrink-0" />
          <TabLabel on={restActive || moreOpen}>더보기</TabLabel>
        </button>
      </nav>
    </>
  );
}
