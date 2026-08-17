# 커버리지가 더 못 올라가는 자리

분기 커버리지로 파일 순위를 매기면 **같은 파일이 계속 위에 남는다.** 열어 보면
도달 불가 분기라 아무도 못 덮고, 다음 사람이 또 열어 본다. 그 낭비를 없애려고
판정된 자리를 여기 모은다.

**이 목록은 «안 했다» 가 아니라 «할 수 없다» 다.**

원래 #600 이슈에 쌓고 있었는데, 절이 여섯 개로 늘어 저장소로 옮겼다. 새로 판정한
자리는 이 파일에 덧붙인다.

## 먼저 — 두 낱말을 구분한다

섞으면 대응이 흐려진다.

| | 뜻 | 커버리지에 미치는 영향 | 대응 |
|---|---|---|---|
| **도달 불가** | 그 줄이 실행될 수 없다 | 숫자를 **영구히 누른다** | 여기 적고 넘어간다 |
| **관찰 불가** | 실행은 되는데 결과가 같아 돌연변이가 안 죽는다 | 숫자와 **무관**(100% 여도 산다) | 검사 층을 바꾼다 |

## 어떻게 쓰나

- **순위는 후보를 고르는 데만 쓴다.** 고른 뒤 안 도는 분기를 한 줄씩 찍어 보고
  **도달 가능한지 먼저 판정한다**
- 도달 불가로 판정하면 여기 추가한다
- 성과는 커버리지 증가가 아니라 **죽인 돌연변이 수**로 본다

## 실측값 (2026-08-17)

`cd client && npx vitest run --coverage --coverage.reporter=json-summary` 로 다시 뜬다.
전체는 `93.69 / 90.04 / 90.69 / 95.38`(구문/분기/함수/줄), 게이트는 `60/59/52/64` 다.

| 파일 | 구문 | 분기 | 함수 | 줄 | 사유 |
|---|---:|---:|---:|---:|---|
| `hooks/usePeriod.js` | 88 | **50** | 100 | 100 | 2. 서버 렌더 가드 |
| `components/HeatmapCardPicker.jsx` | 100 | **66.66** | 100 | 100 | 3. 언마운트 가드 |
| `components/Modal.jsx` | 91.89 | **73.91** | 100 | 100 | 1. jsdom 레이아웃 없음 + 죽은 가지 |
| `pages/CardStrategy.jsx` | 84.37 | 78.43 | 84.61 | 93.1 | 3-2. 호출부가 값을 안 넘김 |
| `pages/Dashboard.jsx` | 88.39 | 79.24 | 80 | 94.15 | 6. 차트 안에서만 드러남(관찰 불가) |
| `components/UndoSnackbar.jsx` | 91.89 | 85 | 90 | 96.42 | 3. 언마운트 가드 |
| `pages/Transactions.jsx` | 89.59 | 86.02 | 85.54 | 91.86 | 2 · 5 |
| `components/DuplicateCandidates.jsx` | 91.89 | 95 | 100 | 93.75 | 4. 화면으로 도달 불가한 방어 |
| `components/CardTierSection.jsx` | 100 | 95.12 | 100 | 100 | 3. 언마운트 가드 |

`usePeriod.js` 의 분기 50% 는 **PR #590 에서 테스트를 0건 → 11건, 돌연변이 방어를
0건 → 5건으로 올렸는데 한 톨도 움직이지 않았다.** 그 뒤로도 그대로다. 이 표의 값이
안 움직이는 것 자체가 판정의 근거다.

---

## 1. jsdom 이 레이아웃을 안 해서

`components/Modal.jsx` — 분기 73.91%

- `el.offsetParent !== null` 가시성 필터. **jsdom 은 `offsetParent` 가 항상 `null`**
  이라 왼쪽 갈래가 안 돈다
- `(first || panel)?.focus()` 의 `panel` 폴백 — 닫기 버튼이 항상 그려지므로 `first` 가
  언제나 있다
- `if (next < 0) return` — 바로 앞 줄이 `items.length === 0` 을 이미 걸러서
  `trapIndex` 가 `-1` 을 낼 수 없다. **논리적으로 죽은 가지**

덮을 수 있는 것은 `items.length === 0` 하나뿐이다.

## 2. 서버 렌더 가드

`hooks/usePeriod.js` — 분기 50%

`typeof window === 'undefined'` 세 자리. jsdom 에는 `window` 가 항상 있다.
`pages/Transactions.jsx` 의 49·68행도 같은 것이다.

## 3. React 19 가 경고를 안 내서

`if (!cancelled)` 언마운트 가드. `components/CardTierSection.jsx` ·
`components/HeatmapCardPicker.jsx` · `components/UndoSnackbar.jsx` 등.

언마운트 뒤 `setState` 경고는 **React 18 에서 제거**됐고 이 저장소는 19.2.8 이다.
콘솔 스파이로도 원본과 돌연변이가 구분되지 않는다(#561 · #586 에서 각각 실측).

## 3-2. 호출부가 그 값을 안 넘겨서

`pages/CardStrategy.jsx` — 194행 `view.state === 'error'`

```js
const view = comparisonView({ loading, data: comparison });
```

`comparisonView` 는 `error` 를 받아야 `'error'` 상태를 내는데 **이 호출은 그 칸을
안 넘긴다.** 최초 실패는 그 위 135행에서 전면 오류로 이미 갈라져 나간다.
같은 파일 85행 `if (!line) return null` 도 목록 항목이 언제나 객체라 참이 안 된다.

## 4. 화면을 통해 도달할 수 없는 방어

`components/DuplicateCandidates.jsx` 의 `handleDelete` · `handleKeep` 의
`if (!ids.length) return`.

두 버튼은 **선택이 있을 때만 그려진다.** 방어로는 옳지만 UI 로는 못 만든다.

## 5. 자료형 때문에 관찰되지 않는 것 (관찰 불가)

`pages/Transactions.jsx` 의 `filters.minAmount !== ''`.

`EMPTY_FILTERS` 가 `''` 이고 입력칸이 문자열만 주므로 `'0'` 이 truthy 다.
`if (filters.minAmount)` 로 바꿔도 결과가 같다. 나중에 이 값이 숫자로 바뀌면 그때 갈린다.

## 6. 차트 안에서만 드러나는 것 (관찰 불가)

`pages/Dashboard.jsx` 의 `periodConfig` — `case '주'` · `case '연'` 을 통째로 지워도
DOM 이 똑같다.

그 함수가 고른 자료는 **recharts 차트로만** 드러나는데, jsdom 에는 레이아웃이 없어
차트가 SVG 껍데기만 만든다(`client/vitest.setup.js` 참고). 실행은 되므로 커버리지에는
잡히지만 돌연변이가 안 죽는다.

**대응은 화면 테스트가 아니라 함수를 떼어내는 것이다.** 순수 계산을 화면 파일 안에
두면 이렇게 검사가 막힌다 — #616 에 그 논의가 있다.

---

## 2-2. 서버 렌더 가드 — `theme.applyTheme` (2026-08-18 판정)

`lib/theme.js` 분기 **83.33%** 에서 안 도는 두 갈래다.

```js
const el = root || (typeof document !== 'undefined' ? document.documentElement : null);
if (!el) return DEFAULT_THEME;
```

- `typeof document !== 'undefined'` 의 **false** 갈래 — jsdom 에는 `document` 가 있다
- `!el` 의 **true** 갈래 — 위가 false 여야 도달하므로 같은 이유로 못 온다

`root` 를 주는 경로와 안 주는 경로는 **둘 다 이미 검사한다**(`pureFallbacks.test.jsx`).
돌연변이로도 확인했다 — `root` 폴백을 지우면 3건이 죽는다. 즉 **테스트가 그 줄을 실제로
지나가는데도 숫자가 안 움직인다.** 남은 것은 SSR 전용 갈래이고 이 저장소는 SSR 을 하지 않는다.

같은 판정이 `hooks/usePeriod.js`(2번)에 이미 있다. 서버 렌더 가드는 **일관되게 도달 불가**다.

---

## 관찰 불가로 판정된 것들 (커버리지 100% 여도 돌연변이가 산다)

- `asInt('')` 가 `null` 이라 빈 값 검사가 **중복 방어**가 된다 (#485)
- `undefined` 와 `null` 이 둘 다 falsy 라 폴백 제거가 안 드러난다 (#561)
- `String(c.id)` 제거 — React 가 DOM 속성으로 문자열화한다 (#575)
- 조회 실패 시 `.catch` 제거 — 초기 상태가 이미 `[]` 라 화면이 같다 (#575)
- `minAmount !== ''` — 자료형이 문자열뿐이라 같다 (위 5번)
- `periodConfig` 의 `case '주'`·`case '연'` — 차트 안에서만 드러난다 (위 6번)

## 이 목록에서 빠진 것 (덮어서 해결됨)

- **`lib/categoryChart.js`** — 분기 85.71% 였고 남은 두 갈래(배열 아님 · `total` 폴백)가
  **도달 가능했다.** `pureFallbacks.test.jsx` 로 덮어 **100%** 가 됐다(2026-08-18).
  이 파일이 «후보를 고르는 데만 쓴다» 의 성공 사례다 — 순위에 올라온 것을 열어 보니
  도달 불가가 아니라 그냥 안 덮인 자리였다
- **`lib/auditFormat.js`** — `describeAction` 이 함수 전체 미실행이었다(42.85%).
  덮어서 함수 100% 가 됐다(#649)

## 관련

- **#600** — 이 목록이 자란 곳. 새 판정은 이 파일에 적는다
- **#630** — 샤딩과 커버리지. 샤드마다 값이 내려가므로 게이트는 병합 단계에서만 본다
- `client/vite.config.js` 주석 — 게이트 값을 왜 실측 2%p 아래로 잡는지. 한 번
  **48% 에서 7% 로 떨어져도 CI 가 초록이었다**
