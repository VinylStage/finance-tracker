const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const migration = require('../migrations/005-add-transactions-approval-index');

let dbPath;
let db;

before(() => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ft-idx-')), 'test.db');
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY, date TEXT NOT NULL, amount INTEGER NOT NULL,
      merchant TEXT, approval_number TEXT
    );
  `);
});

after(() => {
  db.close();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

describe('approval index migration', () => {
  test('A. before migration, no index exists and query plan uses SCAN', () => {
    const indexes = db.prepare(`PRAGMA index_list(transactions)`).all();
    const hasApprovalIndex = indexes.some(idx => idx.name === 'idx_tx_approval');
    assert.ok(!hasApprovalIndex, 'idx_tx_approval should not exist before migration');

    // ? 플레이스홀더가 있으면 EXPLAIN QUERY PLAN 도 바인딩 값을 요구한다.
    // 계획만 뽑는 것이므로 값은 무엇이든 상관없다.
    const plan = db.prepare(
      `EXPLAIN QUERY PLAN SELECT id FROM transactions WHERE approval_number = ?`
    ).all(null);
    const detail = plan.map(row => row.detail).join(' ');
    assert.ok(detail.includes('SCAN'), 'query plan should include SCAN before migration');
  });

  test('B. after migration, query plan uses SEARCH with index', () => {
    migration.up(db);

    const indexes = db.prepare(`PRAGMA index_list(transactions)`).all();
    const hasApprovalIndex = indexes.some(idx => idx.name === 'idx_tx_approval');
    assert.ok(hasApprovalIndex, 'idx_tx_approval should exist after migration');

    const plan = db.prepare(
      `EXPLAIN QUERY PLAN SELECT id FROM transactions WHERE approval_number = ?`
    ).all(null);
    const detail = plan.map(row => row.detail).join(' ');
    assert.ok(detail.includes('SEARCH'), 'query plan should include SEARCH after migration');
    assert.ok(detail.includes('idx_tx_approval'), 'query plan should reference idx_tx_approval');
    assert.ok(!detail.includes('SCAN transactions'), 'query plan should not include SCAN transactions after migration');
  });

  test('C. running migration twice is safe (IF NOT EXISTS)', () => {
    const initialIndexCount = db.prepare(`PRAGMA index_list(transactions)`).all().length;
    
    migration.up(db);
    
    const finalIndexCount = db.prepare(`PRAGMA index_list(transactions)`).all().length;
    assert.strictEqual(finalIndexCount, initialIndexCount, 'index count should not change after second migration run');
  });

  test('D. duplicate detection behavior is unchanged by index', () => {
    // Insert test data
    const insert = db.prepare(`INSERT INTO transactions (date, amount, approval_number) VALUES (?, ?, ?)`);
    insert.run('2023-01-01', 1000, 'AP001');
    insert.run('2023-01-02', 2000, 'AP002');
    insert.run('2023-01-03', 3000, null);

    // Test that correct records are found
    const found1 = db.prepare(`SELECT id FROM transactions WHERE approval_number = 'AP001'`).get();
    assert.ok(found1, 'should find record with approval_number = AP001');
    assert.strictEqual(found1.id, 1);

    const found2 = db.prepare(`SELECT id FROM transactions WHERE approval_number = 'AP999'`).get();
    assert.ok(!found2, 'should not find record with approval_number = AP999');

    // Test that NULL records are not matched
    const found3 = db.prepare(`SELECT id FROM transactions WHERE approval_number = ?`).get(null);
    assert.ok(!found3, 'should not find record with approval_number = NULL');
  });

  test('E. data-integrity query also uses the index', () => {
    const plan = db.prepare(`
      EXPLAIN QUERY PLAN 
      SELECT approval_number, count(*) as cnt FROM transactions
      WHERE approval_number IS NOT NULL AND approval_number != ''
      GROUP BY approval_number HAVING cnt > 1
    `).all();
    
    const detail = plan.map(row => row.detail).join(' ');
    assert.ok(detail.includes('idx_tx_approval'), 'data-integrity query should use idx_tx_approval index');
  });
});
