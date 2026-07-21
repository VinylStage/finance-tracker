# Requirements

## Background

Replace Google Sheets / Excel tracker (v1–v5) with a local web app.
Core problems to solve vs. spreadsheet:
1. Real-time cash flow / expense graphs (daily/weekly/monthly/yearly)
2. Payment method list managed without code changes
3. Category auto-suggest + manual override

Single user, local-only, no auth, no cloud.

## Functional Requirements

### FR-1 Transaction Entry
Fields: date, major_type, category, amount, payment_method, payment_style, merchant, memo.
Payment style = 할부 → redirect to installment registration.
Payment style = 리볼빙 → link to revolving ledger.
Recent categories/methods shown first.

### FR-2 Category Auto-Suggest
On merchant name entry: exact match → most recent category; partial match → most frequent; no match → empty.
Pre-selected but overridable.

### FR-3 Payment Method Management
Settings: add card (name, type: 신용/체크/이체/현금성).
No hard delete — soft-delete (is_active=0).
Seed: 하나/삼성/현대/신한/롯데/농협카드, 현금성결제, 현금, 자동이체, 계좌이체.

### FR-4 Installment Management
Register: merchant, total, months, card, start billing month.
Monthly amount auto-calculated (+ fee if provided).
Dashboard shows this month's due installments.
Auto-complete when remaining months = 0.

### FR-5 Revolving Management
Monthly record: carried balance, new charges, payment, interest.
Interest auto-classified as 대출이자 (separated from spending stats).

### FR-6 Debt Status
Manual entry: loan balance + interest rate → monthly interest auto-calc.
Auto-aggregate: card unpaid + installment remaining + revolving remaining.

### FR-7 Savings / Insurance
Register: name, monthly contribution, start, maturity, expected payout.
Contribution records as 저축 category.
Maturity: principal recovery (저축 negative) + interest-only as 수입.

### FR-8 Dashboard
- Net worth = available cash + investments + accumulated savings − total debts
- This month's scheduled payments (installments + revolving + fixed + debt payments)
- Budget vs actual (by category, this month)
- Simulator: input assumptions → N-month balance projection

### FR-9 Cash Flow / Expense Graphs
Tabs: daily / weekly / monthly / yearly.
Cash flow: line chart (balance over time).
Expense: category stacked bar or line, switchable.
Updates immediately on new transaction (no page refresh).

## Non-Functional

- Runtime: Node.js, `npm start` → localhost:PORT
- Storage: SQLite single file, local
- Backup: file copy only; export button (CSV/JSON)
- Responsive: PC first, mobile input capable
- Performance: 5,000 records, all queries < 1s
