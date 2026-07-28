import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { isOnboardingDone, shouldShowWelcome } from '../lib/onboarding';
import WelcomeFlow from './WelcomeFlow';

// 웰컴을 띄울지만 판정하는 래퍼(#197). App 이 이 한 줄만 알면 되도록 분리했다.
//
// 거래 수를 확인하는 이유: 플래그가 없는 브라우저(데이터 삭제, 새 기기)에서 기존
// 사용자에게 웰컴이 뜨는 걸 막는다. 이미 거래가 있으면 처음 쓰는 사람이 아니다.
//
// 조회에 실패하면 -1 을 넣어 웰컴을 띄우지 않는다. 첫 화면에서 모달이 잘못 뜨는 것보다
// 안 뜨는 쪽의 피해가 작다.
export default function WelcomeGate() {
  const [done, setDone] = useState(() => isOnboardingDone());
  const [total, setTotal] = useState(null);

  useEffect(() => {
    if (done) return undefined;
    let alive = true;
    api.get('/api/transactions?limit=1')
      .then((d) => { if (alive) setTotal(d.total ?? 0); })
      .catch(() => { if (alive) setTotal(-1); });
    return () => { alive = false; };
  }, [done]);

  if (!shouldShowWelcome({ done, transactionTotal: total })) return null;
  return <WelcomeFlow onClose={() => setDone(true)} />;
}
