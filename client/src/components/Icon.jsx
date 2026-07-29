import React from 'react';
import { ICON_PATH, ICON_VIEWBOX } from '../components/icons/paths';

// Icon 컴포넌트는 Material Symbols Outlined 아이콘을 표시한다.
// 채움 변형이 있는 아이콘은 filled prop 이 true 일 때 _fill 접미사를 붙인 키를 찾는다.
// 채움 변형이 없는 아이콘은 그냥 name 키를 사용한다.
// 아이콘은 스크린리더가 읽지 않도록 aria-hidden="true" 를 설정하고,
// 탭 순서에서 제외되도록 focusable="false" 를 설정한다.
// 색상은 부모의 글자색을 따라가도록 fill="currentColor" 를 사용한다.
export default function Icon({ name, filled = false, size = 20, className = '', ...rest }) {
  // 채움 변형이 있는 아이콘일 경우 _fill 키를 먼저 시도한다.
  const key = filled && `${name}_fill` in ICON_PATH ? `${name}_fill` : name;
  
  // 찾은 키가 ICON_PATH 에 존재하지 않으면 null 을 반환한다.
  if (!(key in ICON_PATH)) {
    return null;
  }
  
  // SVG 요소에 필요한 속성들을 설정한다.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={ICON_VIEWBOX}
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      <path d={ICON_PATH[key]} />
    </svg>
  );
}
