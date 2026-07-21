'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'finance.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    major_type TEXT NOT NULL,
    name TEXT NOT NULL,
    monthly_budget INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    UNIQUE(major_type, name)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    amount INTEGER NOT NULL,
    payment_method_id INTEGER REFERENCES payment_methods(id),
    payment_style TEXT NOT NULL DEFAULT '일시불',
    merchant TEXT,
    memo TEXT,
    installment_id INTEGER REFERENCES installments(id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
  CREATE INDEX IF NOT EXISTS idx_tx_merchant ON transactions(merchant);

  CREATE TABLE IF NOT EXISTS installments (
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

  CREATE TABLE IF NOT EXISTS revolving_history (
    id INTEGER PRIMARY KEY,
    month TEXT NOT NULL,
    carried_balance INTEGER DEFAULT 0,
    new_charge INTEGER DEFAULT 0,
    paid_amount INTEGER DEFAULT 0,
    interest INTEGER DEFAULT 0,
    next_carried_balance INTEGER DEFAULT 0,
    payment_method_id INTEGER REFERENCES payment_methods(id)
  );

  CREATE TABLE IF NOT EXISTS debts (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    balance INTEGER NOT NULL,
    annual_rate REAL DEFAULT 0,
    memo TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS savings_products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    monthly_contribution INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    maturity_date TEXT,
    expected_payout INTEGER,
    status TEXT DEFAULT '진행중'
  );
`);

module.exports = db;
