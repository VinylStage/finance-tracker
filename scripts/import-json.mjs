#!/usr/bin/env node
// 내보낸 JSON 백업(schema_version 포함)을 빈 SQLite DB로 복원하는 마이그레이션 스크립트.
// 사용법: node scripts/import-json.mjs <export.json> --db <target.db>
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SCHEMA_VERSION = 1; // src/routes/export.js의 SCHEMA_VERSION과 동일해야 함

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db') { args.db = argv[++i]; }
    else args._.push(argv[i]);
  }
  return args;
}

function initSchema(db) {
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
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      type TEXT DEFAULT '일반'
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
}

function insertRows(db, table, columns, rows) {
  if (!rows || rows.length === 0) return 0;
  const placeholders = columns.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
  const insertMany = db.transaction((items) => {
    for (const row of items) stmt.run(...columns.map(c => row[c] ?? null));
  });
  insertMany(rows);
  return rows.length;
}

function importData(db, data) {
  // FK 의존 순서: payment_methods, categories → installments → transactions → revolving_history, debts → debt_interest_log, savings_products
  const counts = {};
  counts.payment_methods = insertRows(db, 'payment_methods',
    ['id', 'name', 'type', 'is_active', 'created_at'], data.payment_methods);
  counts.categories = insertRows(db, 'categories',
    ['id', 'major_type', 'name', 'monthly_budget', 'is_active'], data.categories);
  counts.installments = insertRows(db, 'installments',
    ['id', 'purchase_date', 'merchant', 'total_amount', 'months', 'monthly_amount', 'fee_per_month', 'payment_method_id', 'start_billing_month', 'status'],
    data.installments);
  counts.transactions = insertRows(db, 'transactions',
    ['id', 'date', 'category_id', 'amount', 'payment_method_id', 'payment_style', 'merchant', 'memo', 'installment_id', 'created_at'],
    data.transactions);
  counts.revolving_history = insertRows(db, 'revolving_history',
    ['id', 'month', 'carried_balance', 'new_charge', 'paid_amount', 'interest', 'next_carried_balance', 'payment_method_id'],
    data.revolving_history);
  counts.debts = insertRows(db, 'debts',
    ['id', 'name', 'balance', 'annual_rate', 'memo', 'updated_at', 'type'], data.debts);
  counts.debt_interest_log = insertRows(db, 'debt_interest_log',
    ['id', 'debt_id', 'log_date', 'rate_at_time', 'interest_amount', 'balance_before', 'balance_after', 'memo', 'created_at'],
    data.debt_interest_log);
  counts.savings_products = insertRows(db, 'savings_products',
    ['id', 'name', 'monthly_contribution', 'start_date', 'maturity_date', 'expected_payout', 'category_id', 'status'],
    data.savings_products);
  return counts;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args._[0];
  if (!inputPath || !args.db) {
    console.error('사용법: node scripts/import-json.mjs <export.json> --db <target.db>');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf-8'));
  if (data.schema_version === undefined) {
    console.error('입력 파일에 schema_version 필드가 없습니다. export.js로 내보낸 파일인지 확인하세요.');
    process.exit(1);
  }
  if (data.schema_version !== SCHEMA_VERSION) {
    console.warn(`경고: 파일 schema_version=${data.schema_version}, 스크립트 기대값=${SCHEMA_VERSION}. 계속 진행합니다.`);
  }

  const dbPath = path.resolve(args.db);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  initSchema(db);
  const counts = importData(db, data);
  db.close();

  console.log(`Imported into ${dbPath}`);
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count}`);
  }
}

main();
