import React from 'react';
import { categoryStyle } from '../lib/categoryStyle';

// 카테고리 대분류를 아이콘 + 색상 + 텍스트 3중으로 표시한다(#191, #199).
// 아이콘은 장식이므로 aria-hidden — 의미는 옆의 텍스트가 전달한다.
// title 에 대분류명을 넣어 마우스 호버로도 확인 가능하게 한다(아이콘만으로는
// 어떤 대분류인지 학습 전까지 알 수 없으므로).
export default function CategoryBadge({ majorType, name, className = '' }) {
  const { icon, color } = categoryStyle(majorType);
  return (
    <span className={`inline-flex items-center gap-1.5 ${color} ${className}`} title={majorType || '미분류'}>
      <span aria-hidden="true" className="shrink-0">{icon}</span>
      <span className="truncate">{name}</span>
    </span>
  );
}
