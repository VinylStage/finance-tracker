'use strict';

// 라우트·서비스·페이지·컴포넌트·마이그레이션 목록을 코드에서 생성한다.
//
// 왜 자동 생성인가
// ────────────────
// 이 목록을 손으로 유지하다 세 번 낡았다. 감사 FND-17 이 2026-07 에 같은 지적을
// 하며 "문서 목록을 코드에서 생성" 을 첫 권고로 냈는데, 그때는 PR 템플릿
// 체크박스로 갈음했고 **또 낡았다**(라우트 17 → 실제 26).
//
// 사람이 기억해서 갱신하는 방식은 이 저장소에서 반복해 실패했다.
//
//   node scripts/gen-inventory.js          ARCHITECTURE.md 를 고친다
//   node scripts/gen-inventory.js --check   다르면 exit 1 (CI 용)

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TARGET = path.join(ROOT, 'docs/ARCHITECTURE.md');
const START = '<!-- inventory:start -->';
const END = '<!-- inventory:end -->';

function listFiles(dir, ext, exclude) {
  try {
    const files = fs.readdirSync(dir);
    return files
      .filter(f => f.endsWith(ext))
      .map(f => path.basename(f, ext))
      .filter(name => !exclude || !name.includes(exclude))
      .sort();
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function mounts() {
  const serverPath = path.join(ROOT, 'src/server.js');
  const content = fs.readFileSync(serverPath, 'utf8');
  const re = /app\.use\('(\/api\/[a-z-]+)',\s*require\('\.\/routes\/([a-zA-Z]+)'\)\)/g;
  const matches = [...content.matchAll(re)];
  return matches.map(m => ({ mount: m[1], file: `${m[2]}.js` })).sort((a, b) => a.mount.localeCompare(b.mount));
}

function buildBlock() {
  const routes = listFiles(path.join(ROOT, 'src/routes'), '.js');
  const services = listFiles(path.join(ROOT, 'src/services'), '.js');
  const pages = listFiles(path.join(ROOT, 'client/src/pages'), '.jsx', '.test');
  const components = listFiles(path.join(ROOT, 'client/src/components'), '.jsx', '.test');
  const migrations = listFiles(path.join(ROOT, 'migrations'), '.js');

  const routeMounts = mounts();

  let md = '';

  // 백엔드 라우트
  md += `### 백엔드 라우트 (${routes.length}개 파일 / API 마운트 ${routeMounts.length}개)\n\n`;
  md += '| 마운트 | 파일 |\n';
  md += '|---|---|\n';
  for (const { mount, file } of routeMounts) {
    md += `| \`${mount}\` | \`${file}\` |\n`;
  }
  md += '\n';

  // 서비스
  md += `### 서비스 (${services.length}개)\n\n`;
  md += services.map(f => `\`${f}.js\``).join(' · ') + '\n\n';

  // 프론트엔드 페이지
  md += `### 프론트엔드 페이지 (${pages.length}개)\n\n`;
  md += pages.map(f => `\`${f}\``).join(' · ') + '\n\n';

  // 프론트엔드 컴포넌트
  md += `### 프론트엔드 컴포넌트 (${components.length}개)\n\n`;
  md += components.map(f => `\`${f}\``).join(' · ') + '\n\n';

  // 마이그레이션
  md += `### 마이그레이션 (${migrations.length}개)\n\n`;
  if (migrations.length > 0) {
    md += `최신: \`${migrations[migrations.length - 1]}\`\n`;
  }

  return md;
}

function main() {
  const content = fs.readFileSync(TARGET, 'utf8');
  const startIdx = content.indexOf(START);
  const endIdx = content.indexOf(END);

  if (startIdx === -1 || endIdx === -1) {
    console.error('docs/ARCHITECTURE.md 에 <!-- inventory:start --> / <!-- inventory:end --> 표시가 없다.');
    process.exit(1);
  }

  const before = content.substring(0, startIdx + START.length);
  const after = content.substring(endIdx);
  const newContent = before + '\n\n' + buildBlock() + '\n\n' + after;

  if (process.argv.includes('--check')) {
    if (content === newContent) {
      console.log('✔ 인벤토리가 코드와 맞다');
      process.exit(0);
    } else {
      console.error('✖ docs/ARCHITECTURE.md 의 인벤토리가 코드와 다르다.\n   node scripts/gen-inventory.js 를 돌리고 커밋해라.');
      process.exit(1);
    }
  } else {
    fs.writeFileSync(TARGET, newContent);
    console.log('✔ docs/ARCHITECTURE.md 인벤토리 갱신');
  }
}

main();
