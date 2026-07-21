# Phase 3~4 Design — Category Auto-Suggest · Cash Flow Graphs

> **Status:** Design complete — pending implementation  
> **Target:** Phase 3, Phase 4 (see ROADMAP.md)

---

## Phase 3: Category Auto-Suggest UX 개선

### 3.1 현재 구현 상태

`GET /api/transactions/suggest/category?merchant=`은 이미 구현됨 (`src/routes/transactions.js` L127–139):

```
1. 동일 가맹점 exact match → 최근 category_id 반환
2. LIKE '%merchant%' partial match → 최빈 category_id 반환
3. 미매칭 → null
```

**한계:**
- confidence 정보 없음 (정확매칭인지 유사매칭인지 UI에서 구분 불가)
- 가맹점 자동완성 없음 (직전 10건 상위 가맹점 목록 미제공)
- 제안 적용 시 시각적 피드백 없음

### 3.2 API 개선

#### 기존 엔드포인트 응답 확장

`GET /api/transactions/suggest/category?merchant=`

**현재 응답:** `{ category_id: 3 }`

**개선 응답:**
```json
{
  "category_id": 3,
  "category_name": "식비",
  "confidence": "exact",
  "match_type": "exact"
}
```

- `confidence`: `"exact"` | `"partial"` | `"none"`
- `match_type`: `"exact"` (동일 가맹점) | `"partial"` (LIKE 매칭) | `"none"`

**서버 코드 수정 위치:** `transactions.js` L127–139

```js
router.get('/suggest/category', (req, res) => {
  const { merchant } = req.query;
  if (!merchant) return res.json({ category_id: null, confidence: 'none', match_type: 'none' });

  const exact = db.prepare(`
    SELECT t.category_id, c.name AS category_name
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.merchant = ?
    ORDER BY t.date DESC LIMIT 1
  `).get(merchant);

  if (exact) return res.json({
    category_id: exact.category_id,
    category_name: exact.category_name,
    confidence: 'exact',
    match_type: 'exact'
  });

  const partial = db.prepare(`
    SELECT t.category_id, c.name AS category_name, COUNT(*) as cnt
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.merchant LIKE ?
    GROUP BY t.category_id
    ORDER BY cnt DESC LIMIT 1
  `).get(`%${merchant}%`);

  res.json({
    category_id: partial ? partial.category_id : null,
    category_name: partial ? partial.category_name : null,
    confidence: partial ? 'partial' : 'none',
    match_type: partial ? 'partial' : 'none'
  });
});
```

#### 신규: 가맹점 자동완성 엔드포인트

`GET /api/transactions/merchants/recent?q=&limit=10`

```js
router.get('/merchants/recent', (req, res) => {
  const { q = '', limit = 10 } = req.query;
  const rows = db.prepare(`
    SELECT merchant, MAX(date) AS last_used, COUNT(*) AS use_count
    FROM transactions
    WHERE merchant IS NOT NULL AND merchant LIKE ?
    GROUP BY merchant
    ORDER BY last_used DESC
    LIMIT ?
  `).all(`%${q}%`, Number(limit));
  res.json({ data: rows });
});
```

**응답:**
```json
{
  "data": [
    { "merchant": "스타벅스", "last_used": "2026-07-20", "use_count": 15 },
    { "merchant": "쿠팡", "last_used": "2026-07-19", "use_count": 8 }
  ]
}
```

### 3.3 UX 흐름 상세

```
[가맹점 입력 필드]
     │
     ├── 타이핑 중 (debounce 300ms)
     │    └── GET /merchants/recent?q=입력값
     │         └── 드롭다운: 최근 가맹점 최대 10개 표시
     │
     ├── 가맹점 선택 또는 입력 완료 (blur/Enter)
     │    └── GET /suggest/category?merchant=가맹점명
     │         ├── confidence: 'exact'
     │         │    └── 카테고리 자동 채워짐 + 🟢 "자동 추천됨" 뱃지
     │         ├── confidence: 'partial'
     │         │    └── 카테고리 자동 채워짐 + 🟡 "유사 추천 (확인 필요)" 뱃지
     │         └── confidence: 'none'
     │              └── 카테고리 미채워짐 + 사용자가 직접 선택
     │
     └── 저장 시
          └── 선택된 category_id로 POST /api/transactions
```

### 3.4 React 컴포넌트 변경

**`TransactionForm.jsx` 수정 항목:**

```jsx
// 1. 가맹점 자동완성 (Combobox 패턴)
const [merchantSuggestions, setMerchantSuggestions] = useState([]);

const handleMerchantChange = useDebouncedCallback(async (value) => {
  if (value.length < 1) return;
  const res = await fetch(`/api/transactions/merchants/recent?q=${encodeURIComponent(value)}`);
  const { data } = await res.json();
  setMerchantSuggestions(data);
}, 300);

// 2. 카테고리 자동제안 + confidence 표시
const [suggestState, setSuggestState] = useState({
  loading: false,
  confidence: null,  // 'exact' | 'partial' | 'none'
  category_name: null
});

const handleMerchantBlur = async (merchant) => {
  if (!merchant) return;
  setSuggestState(s => ({ ...s, loading: true }));
  const res = await fetch(`/api/transactions/suggest/category?merchant=${encodeURIComponent(merchant)}`);
  const data = await res.json();
  setSuggestState({ loading: false, confidence: data.confidence, category_name: data.category_name });
  if (data.category_id) setForm(f => ({ ...f, category_id: data.category_id }));
};

// 3. UI 뱃지 렌더링
const ConfidenceBadge = ({ confidence, name }) => {
  if (!confidence || confidence === 'none') return null;
  return confidence === 'exact'
    ? <span className="text-green-400 text-xs">🟢 자동추천: {name}</span>
    : <span className="text-yellow-400 text-xs">🟡 유사추천: {name} (확인 필요)</span>;
};
```

---

## Phase 4: Cash Flow Graphs

### 4.1 API 설계

#### `GET /api/cashflow`

**파일 위치:** `src/routes/cashflow.js`

server.js에 추가:
```js
app.use('/api/cashflow', require('./routes/cashflow'));
```

**Query params:**
| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `granularity` | `daily`\|`weekly`\|`monthly`\|`yearly` | `monthly` | 집계 단위 |
| `from` | `YYYY-MM-DD` | 6개월 전 | 시작일 |
| `to` | `YYYY-MM-DD` | 오늘 | 종료일 |
| `type` | `income`\|`expense`\|`both` | `both` | 집계 대상 |

**Response:**
```json
{
  "granularity": "monthly",
  "from": "2026-01-01",
  "to": "2026-07-31",
  "data": [
    {
      "period": "2026-01",
      "income": 3500000,
      "expense": 1200000,
      "installments_due": 350000,
      "net": 1950000
    },
    {
      "period": "2026-02",
      "income": 3500000,
      "expense": 980000,
      "installments_due": 350000,
      "net": 2170000
    }
  ]
}
```

### 4.2 SQL 집계 쿼리 (SQLite strftime 기반)

#### granularity별 period 포맷

| granularity | strftime 포맷 | period 예시 |
|---|---|---|
| `daily` | `'%Y-%m-%d'` | `2026-07-15` |
| `weekly` | `'%Y-W%W'` | `2026-W29` |
| `monthly` | `'%Y-%m'` | `2026-07` |
| `yearly` | `'%Y'` | `2026` |

#### 핵심 쿼리 (monthly 기준)

```sql
-- 수입
SELECT strftime('%Y-%m', date) AS period,
       COALESCE(SUM(amount), 0) AS income
FROM transactions t
JOIN categories c ON t.category_id = c.id
WHERE c.major_type = '수입'
  AND date BETWEEN :from AND :to
GROUP BY period
ORDER BY period;

-- 지출 (일시불만, 할부/리볼빙 제외)
SELECT strftime('%Y-%m', date) AS period,
       COALESCE(SUM(amount), 0) AS expense
FROM transactions t
JOIN categories c ON t.category_id = c.id
WHERE c.major_type != '수입'
  AND t.payment_style NOT IN ('할부', '리볼빙')
  AND date BETWEEN :from AND :to
GROUP BY period
ORDER BY period;

-- 할부 이번달 청구 (installments 테이블에서)
SELECT strftime('%Y-%m', 'now') AS period,
       COALESCE(SUM(monthly_amount), 0) AS installments_due
FROM installments
WHERE status = '진행중'
  AND start_billing_month <= strftime('%Y-%m', 'now');
```

**cashflow.js 라우터 구현 패턴:**

```js
'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

const GRANULARITY_FORMAT = {
  daily: '%Y-%m-%d',
  weekly: '%Y-W%W',
  monthly: '%Y-%m',
  yearly: '%Y',
};

router.get('/', (req, res) => {
  try {
    const {
      granularity = 'monthly',
      from = getDefaultFrom(),
      to = new Date().toISOString().slice(0, 10),
      type = 'both',
    } = req.query;

    const fmt = GRANULARITY_FORMAT[granularity];
    if (!fmt) return res.status(400).json({ error: 'Invalid granularity' });

    const incomeRows = type !== 'expense'
      ? db.prepare(`
          SELECT strftime(?, date) AS period, COALESCE(SUM(amount),0) AS income
          FROM transactions t
          JOIN categories c ON t.category_id = c.id
          WHERE c.major_type = '수입' AND date BETWEEN ? AND ?
          GROUP BY period ORDER BY period
        `).all(fmt, from, to)
      : [];

    const expenseRows = type !== 'income'
      ? db.prepare(`
          SELECT strftime(?, date) AS period, COALESCE(SUM(amount),0) AS expense
          FROM transactions t
          JOIN categories c ON t.category_id = c.id
          WHERE c.major_type != '수입'
            AND t.payment_style NOT IN ('할부','리볼빙')
            AND date BETWEEN ? AND ?
          GROUP BY period ORDER BY period
        `).all(fmt, from, to)
      : [];

    // 할부 청구는 monthly 단위에서만 의미있게 집계 (period 기준 매핑)
    const installmentRows = db.prepare(`
      SELECT start_billing_month AS period, COALESCE(SUM(monthly_amount),0) AS installments_due
      FROM installments
      WHERE status = '진행중'
      GROUP BY start_billing_month
    `).all();

    const data = mergePeriods(incomeRows, expenseRows, installmentRows);
    res.json({ granularity, from, to, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function getDefaultFrom() {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  return d.toISOString().slice(0, 10);
}

// period 문자열 기준으로 income/expense/installments_due 병합
function mergePeriods(incomeRows, expenseRows, installmentRows) {
  const map = {};
  for (const r of incomeRows) {
    map[r.period] = { period: r.period, income: r.income, expense: 0, installments_due: 0 };
  }
  for (const r of expenseRows) {
    if (!map[r.period]) map[r.period] = { period: r.period, income: 0, expense: 0, installments_due: 0 };
    map[r.period].expense = r.expense;
  }
  for (const r of installmentRows) {
    if (map[r.period]) map[r.period].installments_due = r.installments_due;
  }
  return Object.values(map)
    .sort((a, b) => a.period.localeCompare(b.period))
    .map(r => ({ ...r, net: r.income - r.expense - r.installments_due }));
}

module.exports = router;
```

### 4.3 카테고리별 지출 집계 엔드포인트

`GET /api/cashflow/by-category?from=&to=`

```json
{
  "data": [
    { "category_name": "식비", "major_type": "변동필수", "total": 450000, "pct": 37.5 },
    { "category_name": "교통", "major_type": "변동필수", "total": 150000, "pct": 12.5 }
  ],
  "period_total": 1200000
}
```

SQL:
```sql
SELECT c.name AS category_name, c.major_type,
       COALESCE(SUM(t.amount), 0) AS total
FROM categories c
LEFT JOIN transactions t ON t.category_id = c.id
  AND t.payment_style NOT IN ('할부','리볼빙')
  AND t.date BETWEEN :from AND :to
WHERE c.major_type != '수입' AND c.is_active = 1
GROUP BY c.id
ORDER BY total DESC;
```

### 4.4 Recharts 컴포넌트 구조

**파일:** `client/src/pages/CashFlow.jsx`

```
CashFlow.jsx
├── <PeriodSelector />          # granularity + from/to 날짜 선택
├── <CashFlowLineChart />       # 수입/지출 추이 LineChart
│    ├── Line: income (초록)
│    ├── Line: expense (빨강)
│    └── Line: net (파랑, 점선)
├── <CategoryBarChart />        # 카테고리별 지출 BarChart (수평)
│    └── major_type 색상 그루핑
└── <SummaryCards />            # 기간 합계 수입 / 지출 / 순수지
```

**CashFlowLineChart 구현 핵심:**

```jsx
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer } from 'recharts';

export function CashFlowLineChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="period" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
        <YAxis tickFormatter={v => `${(v/10000).toFixed(0)}만`} tick={{ fill: '#9CA3AF' }} />
        <Tooltip formatter={(v) => `${v.toLocaleString()}원`} contentStyle={{ background: '#1F2937' }} />
        <Legend />
        <Line type="monotone" dataKey="income" stroke="#10B981" name="수입" dot={false} />
        <Line type="monotone" dataKey="expense" stroke="#EF4444" name="지출" dot={false} />
        <Line type="monotone" dataKey="net" stroke="#3B82F6" name="순수지" strokeDasharray="4 2" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**CategoryBarChart 구현 핵심:**

```jsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const MAJOR_TYPE_COLOR = {
  '고정지출': '#6366F1',
  '변동필수': '#F59E0B',
  '부채상환': '#EF4444',
  '선택지출': '#8B5CF6',
  '저축': '#10B981',
};

export function CategoryBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical">
        <XAxis type="number" tickFormatter={v => `${(v/10000).toFixed(0)}만`} tick={{ fill: '#9CA3AF' }} />
        <YAxis type="category" dataKey="category_name" tick={{ fill: '#9CA3AF', fontSize: 11 }} width={80} />
        <Tooltip formatter={(v) => `${v.toLocaleString()}원`} contentStyle={{ background: '#1F2937' }} />
        <Bar dataKey="total" name="지출">
          {data.map((entry, i) => (
            <Cell key={i} fill={MAJOR_TYPE_COLOR[entry.major_type] || '#6B7280'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### 4.5 CashFlow.jsx 페이지 레이아웃

```
┌─────────────────────────────────────────────────────────┐
│  현금흐름 분석                                           │
├─────────────────────────────────────────────────────────┤
│  기간: [6개월 ▼]  [월간 ▼]   [2026-01-01] ~ [2026-07-31]│
├──────────┬──────────┬──────────────────────────────────┤
│ 수입합계  │ 지출합계  │ 순수지 합계                       │
│21,000,000│ 7,200,000│    13,800,000원                   │
├──────────┴──────────┴──────────────────────────────────┤
│                                                         │
│  [수입/지출 추이 LineChart]                              │
│                                                         │
│  2026-01  -02   -03   -04   -05   -06   -07             │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [카테고리별 지출 BarChart (수평)]                        │
│  식비         ████████ 450,000                           │
│  교통         ███ 150,000                                │
│  구독서비스   ██ 100,000                                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.6 React Query 통합 (선택, Phase 4 후반)

```jsx
import { useQuery, useQueryClient } from '@tanstack/react-query';

// cashflow 데이터 fetch
const { data, isLoading } = useQuery({
  queryKey: ['cashflow', granularity, from, to],
  queryFn: () => fetch(`/api/cashflow?granularity=${granularity}&from=${from}&to=${to}`)
                   .then(r => r.json()),
  staleTime: 30_000,
});

// 거래 저장 후 invalidate
const qc = useQueryClient();
const handleSave = async () => {
  await saveTransaction();
  qc.invalidateQueries({ queryKey: ['cashflow'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
};
```

---

## 구현 파일 목록 요약

### Phase 3
| 파일 | 변경 유형 | 내용 |
|---|---|---|
| `src/routes/transactions.js` | 수정 | suggest/category 응답 확장, merchants/recent 추가 |
| `client/src/components/TransactionForm.jsx` | 수정 | 자동완성 드롭다운, confidence 뱃지 |

### Phase 4
| 파일 | 변경 유형 | 내용 |
|---|---|---|
| `src/routes/cashflow.js` | 신규 | cashflow 집계 API |
| `src/server.js` | 수정 | cashflow 라우터 등록 |
| `client/src/pages/CashFlow.jsx` | 신규 | 현금흐름 분석 페이지 |
| `client/src/components/CashFlowLineChart.jsx` | 신규 | 추이 LineChart |
| `client/src/components/CategoryBarChart.jsx` | 신규 | 카테고리 BarChart |
