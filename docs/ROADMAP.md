# Roadmap

## Phase 0 — Foundation ✅
- [x] Express + better-sqlite3 scaffold
- [x] DB schema (7 tables)
- [x] tracker_v5.xlsx → SQLite migration (219 records)
- [x] REST API: transactions, categories, payment-methods CRUD
- [x] Category auto-suggest endpoint

**Done when:** 219 records migrated, API returns correct totals

## Phase 1 — Core UI ✅
- [x] React + Vite client setup
- [x] Dashboard: income/expense/available cash cards, budget vs actual
- [x] Transactions: list + quick-entry form
- [x] Category auto-suggest on merchant blur
- [x] Dark theme (Tailwind gray-900/800)

**Done when:** New transaction saves and dashboard updates immediately

## Phase 2 — Installments · Revolving · Debts
- [ ] Installments registration form + monthly billing aggregation
- [ ] Revolving ledger page (monthly carry-forward tracking)
- [ ] Debt status page (manual entries + auto aggregation)
- [ ] Double-counting validation (design doc §5)

**Done when:** Installment/revolving entries are correctly isolated from expense totals

## Phase 3 — Category Auto-Suggest
- [ ] Auto-suggest polished in transaction form (visual indicator)
- [ ] Bulk re-categorization tool
- [ ] Merchant alias management

**Done when:** Returning merchant fills category in <100ms without user action

## Phase 4 — Cash Flow Graphs
- [ ] Daily/weekly/monthly/yearly aggregation API (`/api/cashflow`)
- [ ] Recharts LineChart (balance trend)
- [ ] Category expense bar chart with period comparison
- [ ] React Query for real-time invalidation

**Done when:** Graph updates without page refresh after any transaction change

## Phase 5 — Simulator · Savings
- [ ] Balance simulator (N-month projection with assumption inputs)
- [ ] Savings/insurance product ledger + maturity handling
- [ ] Maturity payout: principal recovery + interest-only income split

**Done when:** Simulator results match dashboard balance logic

## Phase 6 — Polish
- [ ] CSV / JSON export
- [ ] Settings page (categories, payment methods, budget config)
- [ ] Mobile browser responsive check
- [ ] Performance test (5,000 records, all queries < 1s)
