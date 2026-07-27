import React from 'react';

// 빈 상태 공통 컴포넌트(#197).
//
// 기존 빈 화면은 전부 "~없습니다." 로 사용자가 이미 아는 사실만 반복했다.
// docs/VOICE_TONE_GUIDE.md 원칙 3에 따라 상태가 아니라 다음 행동을 말한다.
//
// filtered 는 "필터 결과가 비어 있는" 경우다. 이때는 행동을 강요하지 않는다 —
// 조건에 맞는 게 없는 건 정상이고, 여기서 "추가해 보세요"는 엉뚱한 제안이다.
export default function EmptyState({ icon, title, description, action, filtered = false }) {
  return (
    <div className="py-12 px-4 text-center">
      {icon && (
        <div aria-hidden="true" className="text-3xl mb-3 opacity-70">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-ink-body">{title}</p>
      {description && !filtered && (
        <p className="mt-1.5 text-xs text-ink-subtle max-w-sm mx-auto leading-relaxed">{description}</p>
      )}
      {action && !filtered && <div className="mt-4">{action}</div>}
    </div>
  );
}
