# Architecture

## Overview

Single-process local web app. Express serves both the REST API and the built React frontend.
No authentication, no cloud — runs entirely on local machine via `npm start`.

```
Browser → localhost:3000 → Express
                            ├── /api/*     → SQLite (better-sqlite3)
                            └── /*         → React build (public/)
```

## Database Schema

```sql
CREATE TABLE payment_methods (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,              -- 신용/체크/이체/현금성
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  major_type TEXT NOT NULL,        -- 수입/고정지출/변동필수/부채상환/선택지출/저축
  name TEXT NOT NULL,
  monthly_budget INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  UNIQUE(major_type, name)
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  amount INTEGER NOT NULL,
  payment_method_id INTEGER REFERENCES payment_methods(id),
  payment_style TEXT NOT NULL DEFAULT '일시불',  -- 일시불/할부/리볼빙/해당없음
  merchant TEXT,
  memo TEXT,
  installment_id INTEGER REFERENCES installments(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE installments (
  id INTEGER PRIMARY KEY,
  purchase_date TEXT NOT NULL,
  merchant TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  months INTEGER NOT NULL,
  monthly_amount INTEGER NOT NULL,
  fee_per_month INTEGER DEFAULT 0,
  payment_method_id INTEGER REFERENCES payment_methods(id),
  start_billing_month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '진행중'
);

CREATE TABLE revolving_history (
  id INTEGER PRIMARY KEY,
  month TEXT NOT NULL,
  carried_balance INTEGER DEFAULT 0,
  new_charge INTEGER DEFAULT 0,
  paid_amount INTEGER DEFAULT 0,
  interest INTEGER DEFAULT 0,
  next_carried_balance INTEGER DEFAULT 0,
  payment_method_id INTEGER REFERENCES payment_methods(id)
);

CREATE TABLE debts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  balance INTEGER NOT NULL,
  annual_rate REAL DEFAULT 0,
  memo TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE savings_products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_contribution INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  maturity_date TEXT,
  expected_payout INTEGER,
  status TEXT DEFAULT '진행중'
);
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /api/transactions | List (limit, offset, from, to, category_id) |
| POST | /api/transactions | Create |
| PUT | /api/transactions/:id | Update |
| DELETE | /api/transactions/:id | Delete |
| GET | /api/transactions/summary/dashboard | Monthly dashboard aggregates |
| GET | /api/transactions/suggest/category?merchant= | Category auto-suggest |
| GET | /api/categories | List active |
| POST | /api/categories | Create |
| PUT | /api/categories/:id | Update |
| DELETE | /api/categories/:id | Soft-delete (is_active=0) |
| GET | /api/payment-methods | List active |
| POST | /api/payment-methods | Create |
| PUT | /api/payment-methods/:id | Update |
| DELETE | /api/payment-methods/:id | Soft-delete |
| GET | /api/health | Health check |

## Double-Counting Prevention

Installment purchases are recorded in `installments` table only (not `transactions`).
Monthly billing is calculated at query time from `installments.monthly_amount` where status=진행중.

Available cash formula:
```
SUM(income) - SUM(expense WHERE payment_style NOT IN ('할부','리볼빙'))
           - SUM(installments.monthly_amount WHERE status='진행중' AND billing_due <= thisMonth)
           - SUM(revolving_history.paid_amount WHERE month = thisMonth)
```

## Category Auto-Suggest

```
Input: merchant name
1. Exact match in transactions → return most recent category_id
2. LIKE '%merchant%' → return most frequent category_id
3. No match → return null (user selects manually)
```
