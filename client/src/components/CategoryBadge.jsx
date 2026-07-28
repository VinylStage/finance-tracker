import React from 'react';
import { categoryStyle } from '../lib/categoryStyle';
import Icon from './Icon';

// 카테고리 대분류를 아이콘 + 텍스트 이중으로 표시한다.
// 아이콘 옆에 대분류 이름이 항상 함께 나오므로 아이콘은 aria-hidden 으로 감춘다.
export default function CategoryBadge({ majorType, name, className = '' }) {
  const { icon, color } = categoryStyle(majorType);
  return (
    <span className={`inline-flex items-center gap-1.5 ${color} ${className}`} title={majorType || '미분류'}>
      <Icon name={icon} size={16} className="shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
