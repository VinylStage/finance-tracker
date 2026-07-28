# 시각 토큰 · 대비 실측표

`client/src/index.css` 의 토큰이 정본이고, 이 문서는 그 값들의 **WCAG 2.x 대비 실측**을
모아둔 것이다. 결정 배경은 `docs/decisions/0006-visual-token-system.md`.

숫자는 전부 상대휘도 공식으로 계산했다. 외부 handoff 문서(`DESIGN_SPEC.md` 등)에 적혀
있던 수치는 다수가 실측과 달라 채택하지 않았다 — 그 문서를 근거로 인용하지 말 것.

기준: 본문 글자 4.5:1 · 큰 글자와 비텍스트(막대·경계·아이콘) 3:1.

측정 배경이 중요하다. 같은 색도 흰 카드 위와 페이지 위, 가라앉은 면 위에서 비율이 다르다.
아래 표는 각 토큰이 **실제로 얹히는 최악의 배경**을 기준으로 적었다.

## 라이트

배경: 카드 `#FFFFFF` · 페이지 `#F1F5FA` · 가라앉음 `#EDF1F7`

| 토큰 | 값 | 카드 | 페이지 | 가라앉음 | 판정 |
|---|---|---|---|---|---|
| `--color-ink` | `#0F2540` | 15.45 | 14.11 | — | OK |
| `--color-body` | `#45596F` | 7.21 | 6.59 | 6.36 | OK |
| `--color-caption` | `#56697C` | 5.66 | 5.17 | 5.00 | OK |
| `--color-brand-text` | `#1B64DA` | 5.41 | 4.94 | — | OK |
| `--color-loss-text` | `#C0304C` | 5.57 | — | — | OK |
| `--color-loss-strong` | `#9E2440` | 7.55 | — | — | OK |
| `--color-warn-text` | `#B4442A` | 5.52 | 5.05 | — | OK |
| `--color-pending-text` | `#85590C` | 6.12 | — | — | OK |
| `--color-goal-text` | `#0F6B62` | 6.36 | — | — | OK |

### tint 위 글자

| 조합 | 비율 |
|---|---|
| `brand-text` on `brand-tint` `#E6EFFB` | 4.66 |
| `loss-text` on `loss-tint` `#F7E6EA` | 4.63 |
| `loss-strong` on `loss-tint` | 6.28 |
| `warn-text` on `warn-tint` `#FBEDE7` | 4.83 |
| `pending-text` on `pending-tint` `#F8F0DE` | 5.39 |
| `goal-text` on `goal-tint` `#E4F1EE` | 5.49 |

### 막대 채움 · 비텍스트 (트랙 `#EDF1F7` 기준, 3:1)

| 토큰 | 값 | 비율 |
|---|---|---|
| `--color-brand-fill` | `#2E74E8` | 3.88 |
| `--color-loss-fill` | `#CE3852` | 4.30 |
| `--color-warn-fill` | `#CF5A34` | 3.59 |
| `--color-pending-fill` | `#AD7E23` | 3.20 |
| `--color-goal-fill` | `#12857F` | 3.95 |
| `--color-caption` (기타 막대) | `#56697C` | 5.00 |

### 진행바 임계 눈금

눈금은 막대 위아래로 삐져나오므로 **트랙과 채움 양쪽**에서 보여야 한다. `--color-ink` 가
네 배경 모두에서 3:1 을 넘기는 유일한 무채색이다. 흰 눈금은 채워지지 않은 트랙 위에서
1.06 이라 보이지 않는다.

| ink `#0F2540` 위치 | 비율 |
|---|---|
| on 트랙 `#EDF1F7` | 13.63 |
| on `brand-fill` | 3.52 |
| on `warn-fill` | 3.80 |
| on `loss-fill` | 3.17 |
| on `goal-fill` | 3.45 |

### 버튼

| 조합 | 비율 |
|---|---|
| 흰 글자 on `--color-action` `#0F2540` | 15.45 |
| 흰 글자 on `--color-action-hover` `#24405E` | 10.66 |
| 흰 글자 on `--color-danger` `#C0304C` | 5.57 |
| 흰 글자 on `--color-danger-hover` `#9E2440` | 7.55 |
| `body` on 보조버튼 면 `#EDF1F7` | 6.36 |
| 흰 글자 on `--color-brand-fill` | **4.39 미달** — 그래서 액센트를 버튼 배경에 쓰지 않는다 |

### 히트맵 (셀 위 날짜 숫자)

| 단계 | 셀 | 숫자색 | 비율 |
|---|---|---|---|
| 1 | `#E6EFFB` | `body` | 6.22 |
| 2 | `#A6C3F4` | `ink` | 8.63 |
| 3 | `#4B84E4` | `#08192F` | 4.80 |
| 4 | `#14498F` | `#FFFFFF` | 8.83 |

## 다크

배경: 카드 `#1A1F27` · 페이지 `#12161C` · 컨트롤 면 `#232A33`

| 토큰 | 값 | 카드 | 페이지 | 컨트롤 면 | 판정 |
|---|---|---|---|---|---|
| `--color-ink` | `#EDF1F7` | 14.60 | — | — | OK |
| `--color-body` | `#A9B6C6` | 8.03 | — | — | OK |
| `--color-caption` | `#8A97A6` | 5.56 | 6.25 | 4.87 | OK |
| `--color-brand-text` | `#5B9BFF` | 5.97 | 6.55 | — | OK |
| `--color-loss-text` | `#F0707F` | 5.77 | — | — | OK |
| `--color-warn-text` | `#F08A5D` | 6.70 | 7.34 | — | OK |
| `--color-pending-text` | `#E0A94A` | 7.83 | — | — | OK |
| `--color-goal-text` | `#3FC08A` | 7.18 | — | — | OK |

| 조합 | 비율 |
|---|---|
| `d-brand` on `brand-tint` `#1B2A42` | 5.20 |
| `d-loss` on `loss-tint` `#3A2226` | 5.10 |
| `d-warn` on `warn-tint` `#3A2118` | 6.02 |
| `d-goal` on `goal-tint` `#14302A` | 6.14 |
| `d-pending` on `pending-tint` `#33291A` | 6.75 |
| `action-on` `#12161C` on `action` `#5B9BFF` | 6.55 |
| `action-on` on `action-hover` `#84AEFF` | 8.19 |
| `danger-on` on `danger` `#F0707F` | 6.33 |
| `warn-fill` `#E97A4E` on 컨트롤 면 | 5.07 |

히트맵은 다크에서 램프 방향이 반대다 — 어두운 바닥에서는 밝아질수록 강한 값이다.
3·4단계 위 숫자는 `#12161C` 로 각각 4.56 / 6.55.

## 알려진 미달 (수정하지 않음)

| 항목 | 값 | 비율 | 사유 |
|---|---|---|---|
| `--color-line-strong` (입력 테두리) | `#C3CEDA` | 흰 위 1.60 | WCAG 1.4.11 은 3:1 을 요구한다. 통과시키려면 `#7E8FA6` 수준까지 내려야 하는데 리뉴얼이 의도한 헤어라인 인상이 무너진다. 교체 전 값(slate-300)이 1.47 이라 **개선이지 퇴행은 아니다.** 별도 판단 필요. |
| `--color-flow-variable` | `#AD7E23` | 흰 위 3.63 | OK. 원안 `#D9A63C` 는 2.22 로 미달이었다. |
| `--color-flow-rest` | `#7E8DA0` | 흰 위 3.38 | OK. 트랙 위로는 2.99 라 막대 용도로는 쓰지 않는다(랭킹 '기타' 막대는 `caption` 사용). |

Sankey 대분류색은 차트 구현이 아직 없어 실사용 검증 전이다. 밴드는 `--flow-band-opacity`
로 채워지므로 실제 대비는 위 값보다 낮아진다 — 구현 시 노드 라벨이 색↔의미 매핑을
완결하는지 함께 확인할 것.

## 재계산 방법

값을 바꿀 때는 추측하지 말고 계산한다. 상대휘도 공식(WCAG 2.x):

```
L = 0.2126·R + 0.7152·G + 0.0722·B
  (각 채널: c/255 ≤ 0.04045 ? c/255/12.92 : ((c/255+0.055)/1.055)^2.4)

대비 = (밝은쪽 L + 0.05) / (어두운쪽 L + 0.05)
```
