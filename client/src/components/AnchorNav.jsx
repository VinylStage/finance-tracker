import React, { useEffect, useState } from 'react';

// 한 페이지에 섹션이 열 개 넘게 쌓이면 원하는 항목까지 스크롤로만 찾아야 한다.
// 좌측 목차를 붙여 어디에 무엇이 있는지 한눈에 보이게 하고, 지금 보고 있는 위치도
// 함께 알린다.
//
// 라우팅은 바꾸지 않는다. 같은 페이지 안에서 스크롤할 뿐이다 — 설정 화면을 여러
// 라우트로 쪼개면 뒤로 가기 동작과 링크 공유가 함께 바뀌는데, 그건 시각 개편의
// 범위를 넘는다.
//
// 활성 표시는 왼쪽 2px 인디케이터의 opacity 만 바꾼다. 인디케이터를 이동시키면
// 스크롤 중에 목차가 계속 움직여서 읽고 있던 위치를 잃는다.
export default function AnchorNav({ items, className = '' }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;

    // 관찰 결과를 그대로 쓰지 않고, 신호가 올 때마다 위치를 다시 재서 정한다.
    //
    // 교차한 것들 중 top 이 가장 작은 것을 고르면 키 큰 섹션에서 틀린다. 카테고리
    // 목록처럼 화면 몇 개 분량인 섹션은 한참 지나쳐도 계속 교차 상태로 남고,
    // top 이 크게 음수라 언제나 "가장 위" 로 뽑혀 활성이 그 자리에 붙박인다.
    //
    // 기준선(화면 상단에서 TRIGGER px)을 지난 마지막 섹션이 지금 보고 있는 것이다.
    const TRIGGER = 100;

    const pick = () => {
      let current = items[0]?.id ?? null;
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top <= TRIGGER) current = it.id;
      }
      if (current) setActiveId(current);
    };

    const observer = new IntersectionObserver(pick, { threshold: [0, 1] });
    const nodes = items.map((it) => document.getElementById(it.id)).filter(Boolean);
    nodes.forEach((n) => observer.observe(n));

    // 관찰은 경계를 넘는 순간에만 발화한다. 한 섹션 안에서 길게 스크롤하는 동안에도
    // 따라오게 하려면 스크롤 자체를 들어야 한다. rAF 로 묶어 프레임당 한 번만 잰다.
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        pick();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    pick();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [items]);

  const go = (event, id) => {
    event.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    // 클릭 직후에는 관찰 결과를 기다리지 않고 바로 활성으로 옮긴다. 스크롤이 끝날
    // 때까지 목차가 이전 항목을 가리키고 있으면 클릭이 먹지 않은 것처럼 보인다.
    setActiveId(id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav aria-label="설정 목차" className={className}>
      <ul className="space-y-0.5">
        {items.map((it) => {
          const on = it.id === activeId;
          return (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                onClick={(e) => go(e, it.id)}
                aria-current={on ? 'true' : undefined}
                className={`flex items-center gap-2 py-1.5 pl-0.5 text-sm transition-colors ${
                  on ? 'text-brand-text font-medium' : 'text-caption hover:text-body'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-4 w-0.5 shrink-0 rounded-bar bg-brand-fill transition-opacity ${
                    on ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <span className="truncate">{it.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
