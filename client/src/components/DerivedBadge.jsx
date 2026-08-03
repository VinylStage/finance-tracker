import React from 'react';
import { Link } from 'wouter';
import Icon from './Icon';
import { originLabel, originIcon, originHref, originLinkText, originHint } from '../lib/derivedOrigin';

// 파생 거래임을 알리는 표식과 고칠 수 있는 곳으로 가는 링크(#270).
//
// 비활성 버튼을 두지 않는 이유는 그것이 누를 수 있는 것처럼 보이면서 이유는
// 알려주지 않기 때문이다. 자리에 대신 "여기가 아니라 저기서 고친다" 를 놓는다.
//
// 색만으로 구분하지 않는다 — 아이콘과 텍스트를 함께 쓴다(#191, WCAG 1.4.1).
export default function DerivedBadge({ tx }) {
  const label = originLabel(tx);
  if (!label) return null;

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        className="inline-flex items-center gap-1 rounded-full bg-surface-page border border-line px-2 py-0.5 text-[11px] text-caption"
        title={originHint(tx)}
      >
        <Icon name={originIcon(tx)} size={12} />
        {label}
      </span>
      <Link
        href={originHref(tx)}
        className="text-[11px] text-brand-text hover:underline"
      >
        {originLinkText(tx)}
      </Link>
    </span>
  );
}
