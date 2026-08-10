import React, { useEffect, useRef, useState } from 'react';
import { cashFlow, REST_KEY, SOURCE_COLOR } from '../lib/cashFlow';
import { formatWon } from '../lib/format';

// 자금흐름 Sankey — 데스크톱 전용(#241).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 recharts <Sankey> 를 안 쓰는가
//
// 위상이 **수입 1개 → 갈래 N개** 로 고정이다. 일반 Sankey 레이아웃 엔진이 푸는
// 문제(다단 그래프의 노드 순서·교차 최소화)가 여기엔 없다. 이슈도 "노드 라벨
// 배치를 직접 잡아야 한다" 고 적어 뒀는데, 라벨을 어차피 손으로 놓을 거라면
// 레이아웃까지 직접 하는 쪽이 코드가 적고 통제도 확실하다.
//
// 실무적인 이유도 있다 — recharts 3.10.1 의 <Pie> 는 진입 애니메이션이 켜져
// 있으면 조각을 아예 안 그린다(#237). 같은 계열 결함을 Sankey 에서 또 만나면
// 디버깅 비용이 이 컴포넌트를 직접 쓰는 비용보다 크다.
//
// ─────────────────────────────────────────────────────────────────────────
// 색 사용 제약 (#241)
//
// 이 차트는 hue 2개 원칙의 **유일한 예외 구역**이다. 6개 흐름을 서로 구별하는
// 것이 목적이라 단일 hue 농도 램프로는 인접 밴드를 가를 수 없다.
//
// 그래서 색은 **밴드와 노드 rect 밖으로 나가지 않는다.** 라벨 텍스트·금액·비율은
// 전부 기본 텍스트 토큰을 쓴다. 여기서 색을 라벨에 쓰기 시작하면 카테고리 색을
// 되살리는 것과 같아진다.
//
// 밴드는 --flow-band-opacity 로 채우고 노드 rect 는 solid 다. 밴드가 옅어야
// 겹치는 구간에서 서로를 가리지 않는다.
// ─────────────────────────────────────────────────────────────────────────

// 컨테이너 폭을 실측해 그 폭으로 그린다.
//
// viewBox 를 고정 폭으로 두고 CSS 로 늘리면 preserveAspectRatio 가 전체를
// 축소·중앙정렬해서 카드 폭을 못 채우고, 늘리는 쪽을 택하면 라벨 글자까지
// 같이 확대돼 나머지 UI 와 크기가 어긋난다. 실측하면 둘 다 없다.
const MIN_W = 420;
const NODE_W = 12;
const GAP = 6;            // 노드 사이 세로 간격
const LABEL_X = 14;       // 오른쪽 노드에서 라벨까지
const LABEL_GUTTER = 190; // 라벨이 쓸 오른쪽 여백. '255,046원 · 36%' 가 들어간다
const PAD_Y = 4;


// 왼쪽 노드 오른쪽 끝에서 오른쪽 노드 왼쪽 끝까지 잇는 리본.
// 위·아래 경계선을 각각 3차 베지어로 그리고 닫는다.
function ribbon(x0, x1, y0a, y0b, y1a, y1b) {
  const cx = (x0 + x1) / 2;
  return [
    `M ${x0} ${y0a}`,
    `C ${cx} ${y0a}, ${cx} ${y1a}, ${x1} ${y1a}`,
    `L ${x1} ${y1b}`,
    `C ${cx} ${y1b}, ${cx} ${y0b}, ${x0} ${y0b}`,
    'Z',
  ].join(' ');
}

export default function CashFlowSankey({ rows, income, height = 260 }) {
  const hostRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const flow = cashFlow(rows, income);

  if (flow.nodes.length === 0) {
    return <p className="text-caption text-sm text-center py-6">이번 달 자금 흐름을 그릴 내역이 없습니다.</p>;
  }

  // 측정 전에는 최소 폭으로 그린다. 0 으로 그리면 첫 프레임에 차트가 사라졌다
  // 나타나 깜빡인다.
  const viewW = Math.max(MIN_W, width || MIN_W);

  const usableH = height - PAD_Y * 2 - GAP * Math.max(0, flow.nodes.length - 1);

  // 노드를 최대한 오른쪽으로 민다. 밴드가 길수록 흐름이 읽히고, 라벨은 고정 폭
  // 여백에 놓는다. 비율(예: 0.42)로 잡으면 넓은 화면에서 오른쪽이 통째로 빈다.
  const rightX = Math.max(viewW * 0.3, viewW - LABEL_GUTTER - NODE_W);

  // 노드 높이는 비율 그대로다. 최소 높이를 주면 작은 갈래가 실제보다 커 보인다 —
  // 차트가 조금이라도 거짓말하면 이 화면의 목적(어디로 갔나)이 무너진다.
  let cursor = PAD_Y;
  const targets = flow.nodes.map((n) => {
    const h = Math.max(1, usableH * n.share);
    const top = cursor;
    cursor += h + GAP;
    return { ...n, top, h, bottom: top + h };
  });

  // 왼쪽 수입 노드는 오른쪽 노드 전체가 차지하는 높이를 덮는다.
  //
  // 밴드가 출발하는 구간은 **간격 없이 이어 붙인다.** 오른쪽은 노드끼리 떨어져
  // 있어야 읽히지만, 왼쪽은 하나의 수입에서 갈라지는 것이라 틈이 있으면 "수입
  // 일부가 어디로도 안 갔다" 로 잘못 읽힌다. 그래서 각 밴드의 왼쪽 두께는
  // 오른쪽 노드 높이의 비율을 수입 노드 높이에 그대로 펼친 값이다.
  const srcTop = PAD_Y;
  const srcH = targets[targets.length - 1].bottom - srcTop;
  const sumTargetH = targets.reduce((s, t) => s + t.h, 0) || 1;

  let srcCursor = srcTop;
  const bands = targets.map((t) => {
    const bandH = srcH * (t.h / sumTargetH);
    const y0 = srcCursor;
    srcCursor += bandH;
    return {
      key: t.key,
      color: t.color,
      d: ribbon(NODE_W, rightX, y0, y0 + bandH, t.top, t.bottom),
    };
  });

  const totalLabel = flow.overspent > 0
    ? `수입 ${formatWon(flow.income)} · ${formatWon(flow.overspent)} 초과`
    : `수입 ${formatWon(flow.income)}`;

  return (
    <div className="w-full" ref={hostRef}>
      <svg
        viewBox={`0 0 ${viewW} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`자금 흐름. ${totalLabel}. ${targets.map((t) => `${t.key} ${Math.round(t.share * 100)}퍼센트`).join(', ')}`}
      >
        {/* 밴드가 먼저. 노드 rect 가 위에 얹혀야 경계가 또렷하다. */}
        <g style={{ opacity: 'var(--flow-band-opacity)' }}>
          {bands.map((b) => (
            <path key={b.key} d={b.d} fill={b.color} />
          ))}
        </g>

        {/* 수입 노드 — 무채색이다. 출발점이지 갈래가 아니다. */}
        <rect x={0} y={srcTop} width={NODE_W} height={srcH} rx={2} fill={SOURCE_COLOR} />

        {targets.map((t) => (
          <g key={t.key}>
            <rect x={rightX} y={t.top} width={NODE_W} height={t.h} rx={2} fill={t.color} />
            {/* 라벨은 색을 쓰지 않는다. 색은 밴드·노드가 전달한다. */}
            <text
              x={rightX + LABEL_X}
              y={t.top + t.h / 2}
              dominantBaseline="middle"
              className="fill-ink"
              style={{ fontSize: 12 }}
            >
              {t.key === REST_KEY ? REST_KEY : t.key}
            </text>
            <text
              x={rightX + LABEL_X}
              y={t.top + t.h / 2 + 14}
              dominantBaseline="middle"
              className="fill-caption"
              style={{ fontSize: 11 }}
            >
              {formatWon(t.value)} · {Math.round(t.share * 100)}%
            </text>
          </g>
        ))}
      </svg>

      <p className="text-xs text-caption mt-1">
        {totalLabel}
      </p>
    </div>
  );
}
