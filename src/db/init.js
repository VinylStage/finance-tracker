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

  CREATE UNIQUE INDEX IF NOT EXISTS idx_revolving_month_pm
    ON revolving_history(month, payment_method_id);

  CREATE TABLE IF NOT EXISTS debts (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    balance INTEGER NOT NULL,
    annual_rate REAL DEFAULT 0,
    memo TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS debt_interest_log (
    id INTEGER PRIMARY KEY,
    debt_id INTEGER NOT NULL REFERENCES debts(id),
    log_date TEXT NOT NULL,
    rate_at_time REAL NOT NULL,
    interest_amount INTEGER NOT NULL,
    balance_before INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    memo TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_interest_log_debt ON debt_interest_log(debt_id);
  CREATE INDEX IF NOT EXISTS idx_interest_log_date ON debt_interest_log(log_date);

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS savings_products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    monthly_contribution INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    maturity_date TEXT,
    expected_payout INTEGER,
    category_id INTEGER REFERENCES categories(id),
    status TEXT DEFAULT '진행중'
  );
`);

// --- migrations: additive column changes on pre-existing tables ---
const debtsColumns = db.prepare(`PRAGMA table_info(debts)`).all().map(c => c.name);
if (!debtsColumns.includes('type')) {
  db.exec(`ALTER TABLE debts ADD COLUMN type TEXT DEFAULT '일반'`);
}

const savingsColumns = db.prepare(`PRAGMA table_info(savings_products)`).all().map(c => c.name);
if (!savingsColumns.includes('category_id')) {
  db.exec(`ALTER TABLE savings_products ADD COLUMN category_id INTEGER REFERENCES categories(id)`);
}

// --- initial seed: 최초 실행(빈 DB)에서만 범용 카테고리/결제수단 생성 ---
const categoryCount = db.prepare(`SELECT COUNT(*) AS c FROM categories`).get().c;
if (categoryCount === 0) {
  const SEED_CATEGORIES = [
    ['수입', '급여'], ['수입', '부업/프리랜서'], ['수입', '금융수입(이자·배당)'], ['수입', '기타수입'],
    ['고정지출', '주거비(월세·관리비)'], ['고정지출', '통신비'], ['고정지출', '보험료'], ['고정지출', '구독서비스'],
    ['변동필수', '식비'], ['변동필수', '교통비'], ['변동필수', '의료비'], ['변동필수', '생활용품'],
    ['선택지출', '외식·카페'], ['선택지출', '쇼핑·의류'], ['선택지출', '문화·여가'], ['선택지출', '여행'], ['선택지출', '미용·뷰티'], ['선택지출', '교육·자기계발'],
    ['저축', '비상금'], ['저축', '목돈저축'], ['저축', '투자'],
    ['부채상환', '대출상환'], ['부채상환', '카드대금'],
  ];
  const insertCategory = db.prepare(`INSERT INTO categories (major_type, name) VALUES (?, ?)`);
  const seedCategories = db.transaction(() => {
    for (const [majorType, name] of SEED_CATEGORIES) insertCategory.run(majorType, name);
  });
  seedCategories();
}

const paymentMethodCount = db.prepare(`SELECT COUNT(*) AS c FROM payment_methods`).get().c;
if (paymentMethodCount === 0) {
  const SEED_PAYMENT_METHODS = [
    ['신용카드', '신용'], ['체크카드', '체크'], ['현금', '현금성'], ['계좌이체', '이체'], ['간편결제', '간편결제'],
  ];
  const insertPaymentMethod = db.prepare(`INSERT INTO payment_methods (name, type) VALUES (?, ?)`);
  const seedPaymentMethods = db.transaction(() => {
    for (const [name, type] of SEED_PAYMENT_METHODS) insertPaymentMethod.run(name, type);
  });
  seedPaymentMethods();
}

module.exports = db;
