# 스타일 가이드 — 디자인 토큰

Tailwind v4의 기본 팔레트를 직접 사용하던 방식은 다크모드나 화이트라벨 확장을 고려할 때 전면 치환해야 할 부분이 많아, `client/src/index.css` 의 `@theme` 블록에 시맨틱 토큰을 정의해 컴포넌트가 그걸 참조하도록 변경했다. (이슈 #190)

## 토큰 목록

### 의미 색상 — 수입/지출/경고/강조

| 토큰 | 값 | 대체한 유틸리티 |
|---|---|---|
| --color-income | oklch(59.6% 0.145 163.225) | = emerald-600 |
| --color-income-strong | oklch(50.8% 0.118 165.612) | = emerald-700 |
| --color-income-soft | oklch(97.9% 0.021 166.113) | = emerald-50 |
| --color-expense | oklch(58.6% 0.253 17.585) | = rose-600 |
| --color-expense-bar | oklch(64.5% 0.246 16.439) | = rose-500 |
| --color-expense-soft | oklch(96.9% 0.015 12.422) | = rose-50 |
| --color-warning | oklch(55.5% 0.163 48.998) | = amber-700 |
| --color-warning-bar | oklch(76.9% 0.188 70.08) | = amber-500 |
| --color-warning-soft | oklch(98.7% 0.022 95.277) | = amber-50 |
| --color-accent | oklch(51.1% 0.262 276.966) | = indigo-600 |
| --color-accent-strong | oklch(45.7% 0.24 277.023) | = indigo-700 |
| --color-accent-bar | oklch(58.5% 0.233 277.117) | = indigo-500 |
| --color-accent-soft | oklch(96.2% 0.018 272.314) | = indigo-50 |

### 카테고리 대분류 6종

| 토큰 | 값 | 대체한 유틸리티 |
|---|---|---|
| --color-cat-income | oklch(59.6% 0.145 163.225) | 수입 = emerald-600 |
| --color-cat-fixed | oklch(58.6% 0.253 17.585) | 고정지출 = rose-600 |
| --color-cat-needs | oklch(64.6% 0.222 41.116) | 변동필수 = orange-600 |
| --color-cat-debt | oklch(57.7% 0.245 27.325) | 부채상환 = red-600 |
| --color-cat-wants | oklch(68.1% 0.162 75.834) | 선택지출 = yellow-600 |
| --color-cat-savings | oklch(54.6% 0.245 262.881) | 저축 = blue-600 |

### 표면·경계

| 토큰 | 값 | 대체한 유틸리티 |
|---|---|---|
| --color-surface | #ffffff | — |
| --color-surface-muted | oklch(98.4% 0.003 247.858) | = slate-50 |
| --color-surface-sunken | oklch(96.8% 0.007 247.896) | = slate-100 |
| --color-line-soft | oklch(96.8% 0.007 247.896) | = slate-100 |
| --color-line | oklch(92.9% 0.013 255.508) | = slate-200 |
| --color-line-strong | oklch(86.9% 0.022 252.894) | = slate-300, 입력 필드 테두리 |

### 텍스트

| 토큰 | 값 | 대체한 유틸리티 |
|---|---|---|
| --color-ink | oklch(27.9% 0.041 260.031) | = slate-800 |
| --color-ink-body | oklch(37.2% 0.044 257.287) | = slate-700 |
| --color-ink-muted | oklch(44.6% 0.043 257.281) | = slate-600 |
| --color-ink-subtle | oklch(55.4% 0.046 257.417) | = slate-500 |
| --color-ink-faint | oklch(70.4% 0.04 256.788) | = slate-400 |
| --color-ink-ghost | oklch(86.9% 0.022 252.894) | = slate-300, 빈 값 표시용 |

### 형태

| 토큰 | 값 | 대체한 유틸리티 |
|---|---|---|
| --radius-card | 0.75rem | = rounded-xl |
| --shadow-card | 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1) | = shadow-sm |

## 사용법

Tailwind v4는 `@theme` 블록에 정의된 CSS 변수(`--color-xxx`)로부터 자동으로 `text-xxx` / `bg-xxx` / `border-xxx` 유틸리티를 생성한다. 또한 `--radius-card` 는 `rounded-card`, `--shadow-card` 는 `shadow-card` 유틸리티로 대응된다.

```jsx
// Before — 팔레트 직접 참조
<div className="bg-white shadow-sm rounded-xl border border-slate-200">
  <span className="text-emerald-600">+120,000원</span>
</div>

// After — 시맨틱 토큰 참조
<div className="bg-surface shadow-card rounded-card border border-line">
  <span className="text-income">+120,000원</span>
</div>
```

`hover:` / `focus:` 접두사와 `/50` 같은 불투명도 접미사는 토큰 클래스에도 그대로 붙는다. 예: `hover:bg-surface-muted`, `bg-accent-soft/60`.

## 규칙

1. 새 컴포넌트에서 `text-slate-500` 같은 팔레트 클래스를 직접 쓰지 않는다 — 토큰을 쓴다.  
   → 팔레트 변경 시 모든 컴포넌트를 일일이 수정하지 않아도 되기 때문
2. 필요한 의미의 토큰이 없으면 컴포넌트에 색을 하드코딩하지 말고 `index.css` 에 토큰을 추가한다.  
   → 토큰이 없는 색상은 시맨틱한 의미를 전달할 수 없어 유지보수성 저하
3. `border`(두께)와 `border-line`(색)은 별개 클래스다. 토큰은 색만 대체하므로 `border` 는 그대로 둔다.  
   → 두 가지 속성을 분리하여 유연한 스타일링이 가능하도록 하기 위함
4. 값이 같아도 역할이 다르면 토큰을 분리한다 — 예: `--color-line-strong` 과 `--color-ink-ghost` 는 둘 다 slate-300 이지만 테두리와 글자는 다크모드에서 다른 밝기로 가야 한다.  
   → 같은 색상 값이라도 사용 목적에 따라 다르게 처리해야 하는 경우가 있어 분리 필요

## 카테고리 대분류 색상 대응

| 대분류 | 토큰 클래스 |
|---|---|
| 수입 | `text-cat-income` |
| 고정지출 | `text-cat-fixed` |
| 변동필수 | `text-cat-needs` |
| 부채상환 | `text-cat-debt` |
| 선택지출 | `text-cat-wants` |
| 저축 | `text-cat-savings` |

