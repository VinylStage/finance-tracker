#!/usr/bin/env node
'use strict';

// docs/ERD.md 를 스키마에서 만든다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 실거래 DB 를 안 보나
//
// 스키마는 `migrations/` 가 정본이다. 실거래 DB 는 그 결과물일 뿐이고, 사용자가
// 앱을 안 열었으면 최신 마이그레이션이 아직 안 붙어 있다 — 그 상태를 그려 두면
// **코드보다 오래된 ERD** 가 커밋된다.
//
// 그래서 임시 DB 에 마이그레이션을 전부 적용해 스키마를 세우고, 그것을 그린다.
// 실거래 데이터에는 닿지 않는다.
//
// ─────────────────────────────────────────────────────────────────────────
// --check 는 mermerd 없이도 돈다
//
// 그리는 데는 mermerd(Go 바이너리)가 필요하지만, **CI 에 Go 를 깔고 싶지 않다.**
// 그래서 스키마 지문을 ERD.md 안에 심어 두고, `--check` 는 그 지문만 다시 계산해
// 비교한다. 스키마가 바뀌었는데 ERD 를 안 다시 그렸으면 그 자리에서 걸린다.
//
// 지문은 테이블·컬럼·타입·NOT NULL·PK 로 만든다. 인덱스와 트리거는 뺐다 —
// ERD 에 안 그려지므로 지문에 넣으면 그림과 무관한 변경에도 실패한다.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO = path.resolve(__dirname, '..');
const OUT = path.join(REPO, 'docs', 'ERD.md');
const MARKER = '<!-- schema-fingerprint:';

// audit_log 계열은 그리지 않는다. 모든 표를 참조하지 않는 부속 표라 선을 그으면
// ERD 가 읽히지 않고, 스키마 이해에도 도움이 안 된다.
const IGNORE = ['audit_log', '_audit_context', 'schema_migrations', 'sqlite_sequence'];

function buildSchemaDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erd-'));
  const dbPath = path.join(dir, 'schema.db');
  // init.js 가 기본 스키마를 만들고 runMigrations 로 체인을 전부 적용한다.
  const prev = process.env.DB_PATH;
  process.env.DB_PATH = dbPath;
  // require 캐시를 타지 않게 자식 프로세스로 돌린다 — 같은 프로세스에서 두 번
  // 열면 앞선 연결이 그대로 재사용된다.
  execFileSync(process.execPath, ['-e', "require('./src/db/init.js');"], {
    cwd: REPO,
    env: { ...process.env, DB_PATH: dbPath },
    stdio: 'pipe',
  });
  if (prev === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = prev;
  return { dir, dbPath };
}

function fingerprint(dbPath) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name
  `).all().map((r) => r.name).filter((n) => !IGNORE.includes(n));

  const parts = [];
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info("${t}")`).all()
      .map((c) => `${c.name}:${c.type}:${c.notnull}:${c.pk}`)
      .sort();
    parts.push(`${t}(${cols.join(',')})`);
  }
  db.close();
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

function readRecordedFingerprint() {
  if (!fs.existsSync(OUT)) return null;
  const m = new RegExp(`${MARKER}\\s*([0-9a-f]+)`).exec(fs.readFileSync(OUT, 'utf-8'));
  return m ? m[1] : null;
}

function runMermerd(dbPath) {
  const bin = process.env.MERMERD_BIN
    || path.join(os.homedir(), 'go', 'bin', 'mermerd');
  const args = [
    '-c', `sqlite3://${dbPath}`,
    '--useAllTables',
    '--outputMode', 'stdout',
    '--showDescriptions', 'notNull',
    '--ignoreTables', IGNORE.join(','),
  ];
  try {
    return execFileSync(bin, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const hint = [
      'mermerd 를 찾지 못했거나 실행에 실패했다.',
      '',
      '  go install github.com/KarnerTh/mermerd@latest',
      '',
      '설치 위치가 다르면 MERMERD_BIN 으로 지정한다.',
      '`--check` 는 mermerd 없이도 돈다 — CI 는 그쪽만 쓴다.',
    ].join('\n');
    console.error(`✖ ${hint}\n\n${e.stderr || e.message}`);
    process.exit(1);
  }
}

function main() {
  const check = process.argv.includes('--check');
  const { dir, dbPath } = buildSchemaDb();

  try {
    const fp = fingerprint(dbPath);

    if (check) {
      const recorded = readRecordedFingerprint();
      if (recorded === null) {
        console.error('✖ docs/ERD.md 가 없거나 지문이 없다. `npm run docs:erd` 를 돌려라.');
        process.exit(1);
      }
      if (recorded !== fp) {
        console.error(
          `✖ 스키마가 ERD 와 다르다.\n    문서: ${recorded}\n    코드: ${fp}\n`
          + '  → `npm run docs:erd` 를 돌리고 커밋해라.'
        );
        process.exit(1);
      }
      console.log(`✔ ERD 가 스키마와 맞다 (${fp})`);
      return;
    }

    const diagram = runMermerd(dbPath).trim();
    const body = [
      '# 데이터 모델 ERD',
      '',
      '`migrations/` 에서 세운 스키마를 [mermerd](https://github.com/KarnerTh/mermerd) 로 그린 것이다.',
      '**손으로 고치지 않는다** — `npm run docs:erd` 가 다시 만든다.',
      '',
      '실거래 DB 가 아니라 마이그레이션을 전부 적용한 임시 DB 를 그린다. 사용자가 앱을',
      '안 열었으면 실거래 DB 는 아직 옛 스키마라, 그것을 그리면 코드보다 오래된 ERD 가',
      '커밋된다.',
      '',
      `감사 로그 계열(\`${IGNORE.slice(0, 2).join('`, `')}\`)과 \`schema_migrations\` 는 뺐다.`,
      '모든 표를 참조하는 부속 표라 선을 그으면 그림이 읽히지 않는다.',
      '',
      '컬럼 설명의 `{NOT_NULL}` 은 NOT NULL 제약이다.',
      '',
      `${MARKER} ${fp} -->`,
      '',
      '```mermaid',
      diagram.replace(/^```mermaid\n/, '').replace(/\n```$/, ''),
      '```',
      '',
    ].join('\n');

    fs.writeFileSync(OUT, body);
    console.log(`✔ docs/ERD.md 갱신 (지문 ${fp})`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main();
