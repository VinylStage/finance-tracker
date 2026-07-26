# 성능 기준선 (Performance Baseline)

`docs/audit/AUDIT_REPORT_2026-07.md` C1~C3 대응(#153). 감사보고서 6.2절 권고 중
(B)안 — "p75 RUM" 대신 **Lighthouse 실험실 측정 3회 중앙값**을 성능 판정 근거로
채택한다. 이유: 이 앱은 사실상 단일 사용자 로컬 앱이라 RUM(실사용자 계측)의
이점이 크지 않고, 별도 수집 인프라 없이 로컬/CI에서 바로 재현 가능한 랩 측정이
더 적합하다는 것이 감사보고서의 논지.

## 측정 방법

- 스크립트: `scripts/lighthouse-baseline.mjs`, 실행: `npm run perf:baseline`
- `npm run build`로 프로덕션 클라이언트 빌드 → 서버를 별도 포트(3099)로 기동 →
  헤드리스 Chrome으로 대시보드(`/`) 최초 로드를 3회 측정 → 중앙값 산출
- Lighthouse desktop preset(`lighthouse/core/config/desktop-config.js`) 사용 —
  이 앱이 로컬 데스크톱에서 쓰인다는 실사용 조건에 맞춤
- **INP(Interaction to Next Paint)는 측정 대상에서 제외**: 실사용자 상호작용이
  있어야 산출되는 필드 전용 지표라 랩(단발성 페이지 로드) 환경에서는 애초에
  측정이 불가능하다(Google 공식 문서 기준). 대신 랩에서 쓰는 대체 지표인
  총 차단 시간(TBT, Total Blocking Time)을 기록한다.

## 측정 대상의 구조적 한계

이 앱은 React Router 없이 `App.jsx`의 `useState`로 탭을 전환하는 순수 클라이언트
상태 기반 SPA다(탭별 URL이 없음). Lighthouse는 매 실행마다 실제 페이지 내비게이션을
하므로 **최초 진입 페이지(대시보드)만 측정 가능**하고, 거래입력·설정 등 다른 탭은
URL로 직접 진입할 수 없어 이 방법으로는 측정 대상이 아니다. (감사보고서도 같은
이유로 "판정 근거 없음"이라고 밝힌 것과 동일한 제약.)

## 기준선 수치 (2026-07-26, 최초 측정)

3회 측정 원본 및 중앙값: [`lighthouse-baseline.json`](./lighthouse-baseline.json)

| 지표 | 중앙값 | 참고 기준(Google "Good") |
|------|--------|---------------------------|
| 성능 점수 | 97/100 | - |
| LCP (Largest Contentful Paint) | 1,045ms | ≤ 2,500ms |
| CLS (Cumulative Layout Shift) | 0.000 | ≤ 0.1 |
| TBT (Total Blocking Time, INP 랩 대체) | 0ms | ≤ 200ms |
| FCP (First Contentful Paint) | 922ms | ≤ 1,800ms |
| Speed Index | 922ms | ≤ 3,400ms |

3회 편차는 LCP 기준 1ms대로, 로컬 측정 환경(네트워크 변동 없음, SQLite 로컬
디스크)에서는 재현성이 매우 높다.

## 구조적 CLS 리스크(로딩 패턴)에 대한 판단

감사보고서가 지목한 리스크: `loading ? '로딩 중...' : <content>` 패턴이 공간
예약 없이 교체되고, 차트가 데이터 도착 후 마운트됨(`Transactions.jsx`,
`Dashboard.jsx` 등).

**측정 결과 CLS = 0.000 (3회 모두)** — 현재 로컬 환경에서는 이 패턴이 실제
레이아웃 시프트로 이어지지 않는다. 따라서 이번 이슈 범위에서는 **로딩 패턴
자체를 고치는 작업은 진행하지 않는다.**

다만 이 결론에는 명확한 전제 조건이 있다 — 신뢰도를 낮추는 요인을 그대로 남긴다:
- 측정에 쓰인 SQLite 쿼리(대시보드 이번 달 집계)가 로컬 디스크에서 수십 ms
  내로 끝나, "로딩 중..." 상태가 사실상 화면에 보이지도 않을 만큼 짧다.
  거래량이 훨씬 많아지거나(수만 건 이상), 원격 배포·네트워크 지연이 생기는
  환경에서는 로딩 상태 노출 시간이 늘어나 결과가 달라질 수 있다.
- 이번 측정은 SPA 구조상 대시보드 진입 1회만 가능했다 — 감사가 함께 지목한
  `Transactions.jsx`의 로딩 패턴은 이 방법으로 검증되지 않았다.

**재측정 트리거**: 거래 데이터가 크게 늘거나, 원격/공유 환경으로 배포하거나,
사용자가 탭 전환 시 체감 흔들림을 보고하면 그때 다시 측정하고 필요 시 로딩
패턴(스켈레톤 UI, 고정 높이 컨테이너 등)을 개선한다.

## 재측정 방법

```bash
npm run perf:baseline
```

`docs/audit/lighthouse-baseline.json`을 덮어쓴다. 회귀 감시가 필요해지면 이
값을 CI에 임계값으로 넣는 방안도 고려할 수 있으나, 현재는 로컬 1회성 기준선
기록이 목적이라 CI 게이트화는 하지 않는다.
