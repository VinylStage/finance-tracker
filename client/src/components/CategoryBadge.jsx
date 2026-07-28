import React from 'react';
import { categoryStyle } from '../lib/categoryStyle';
import Icon from './Icon';

// 카테고리 대분류를 아이콘 + 텍스트 이중으로 표시한다(#191, #199).
// 색은 세 번째 채널이 아니다 — 카테고리에 색을 배정하지 않기로 해서 전 대분류가
// 같은 caption 색을 쓴다. 구분은 아이콘 모양이 혼자 맡는다.
//
// 아이콘 옆에 대분류 이름이 항상 함께 나오므로 아이콘은 aria-hidden 으로 감춘다.
// title 에 대분류명을 넣는 것은 아이콘만으로는 어떤 대분류인지 학습 전까지 알 수
// 없기 때문이다 — 마우스 호버로도 확인할 길을 남긴다.
export default function CategoryBadge({ majorType, name, className = '' }) {
  const { icon, color } = categoryStyle(majorType);
  return (
    <span className={`inline-flex items-center gap-1.5 ${color} ${className}`} title={majorType || '미분류'}>
      <Icon name={icon} size={16} className="shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
