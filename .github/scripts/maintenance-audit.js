#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');

const REPO = process.env.GH_REPO;
const OWNER = REPO.split('/')[0];
const MILESTONE = 'Maintenance — 의존성/기술부채';
const PROJECT_NUMBER = process.env.GH_PROJECT_NUMBER || '9';

function sh(cmd, opts = {}) {
  try {
    const stdout = execSync(cmd, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...opts });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return {
      code: e.status ?? 1,
      stdout: e.stdout ? e.stdout.toString() : '',
      stderr: e.stderr ? e.stderr.toString() : String(e.message || e),
    };
  }
}

function ghIssueExists(title) {
  const { stdout } = sh(`gh issue list --repo ${REPO} --state open --json title --limit 100`);
  try {
    const list = JSON.parse(stdout || '[]');
    return list.some((i) => i.title === title);
  } catch {
    return false;
  }
}

function addToProject(url) {
  const r = sh(`gh project item-add ${PROJECT_NUMBER} --owner ${OWNER} --url ${url}`);
  if (r.code !== 0) {
    console.warn(`[warn] project item-add 실패 (GITHUB_TOKEN은 Projects v2 쓰기 권한이 없어 정상적으로 실패할 수 있음): ${r.stderr}`);
  }
}

function createIssue(title, body, labels) {
  if (ghIssueExists(title)) {
    console.log(`[skip] 이미 열려있는 이슈: ${title}`);
    return { flagged: true, created: false, skipped: true, title };
  }
  const args = [
    'gh issue create',
    `--repo ${REPO}`,
    `--title ${JSON.stringify(title)}`,
    '--body-file -',
    `--label ${JSON.stringify(labels.join(','))}`,
    `--milestone ${JSON.stringify(MILESTONE)}`,
  ].join(' ');
  const result = sh(args, { input: body });
  const url = (result.stdout || '').trim();
  if (result.code === 0 && url) {
    addToProject(url);
    console.log(`[created] ${title} -> ${url}`);
    return { flagged: true, created: true, skipped: false, title, url };
  }
  console.error(`[error] 이슈 생성 실패: ${title}\n${result.stderr}`);
  return { flagged: true, created: false, skipped: false, title, error: true };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── 1. npm audit — high/critical 취약점
function checkAudit(dir, label) {
  const { stdout } = sh('npm audit --json', { cwd: dir });
  let data;
  try {
    data = JSON.parse(stdout);
  } catch {
    console.warn(`[warn] npm audit --json 파싱 실패 (${label})`);
    return { flagged: false };
  }
  const vulns = (data.metadata && data.metadata.vulnerabilities) || {};
  const highCritical = (vulns.high || 0) + (vulns.critical || 0);
  if (highCritical === 0) {
    console.log(`[ok] npm audit 이상 없음 (${label})`);
    return { flagged: false };
  }

  const affected = Object.values(data.vulnerabilities || {})
    .filter((v) => v.severity === 'high' || v.severity === 'critical')
    .map((v) => `- **${v.name}** (${v.severity}) — ${v.range || ''}`)
    .join('\n');

  const title = `[Audit] npm audit — high/critical 취약점 발견 (${label})`;
  const body = `## 자동 감사 결과 (${today()})
high: ${vulns.high || 0}건, critical: ${vulns.critical || 0}건

${affected || '(상세 정보 없음)'}

\`npm audit\`로 재확인 후 조치하고, 해결되면 이 이슈를 close하세요.
_이 이슈는 정기 유지보수 감사 워크플로에 의해 자동 생성되었습니다._`;

  return createIssue(title, body, ['security', 'chore', 'status:triage']);
}

// ── 2. npm outdated — major 버전 지연 패키지
function checkOutdated(dir, label) {
  const { stdout } = sh('npm outdated --json', { cwd: dir });
  let data;
  try {
    data = JSON.parse(stdout || '{}');
  } catch {
    data = {};
  }
  const majorBumps = Object.entries(data).filter(([, info]) => {
    if (!info.current || !info.latest) return false;
    const currMajor = parseInt(String(info.current).split('.')[0], 10);
    const latestMajor = parseInt(String(info.latest).split('.')[0], 10);
    return Number.isFinite(currMajor) && Number.isFinite(latestMajor) && currMajor < latestMajor;
  });
  if (majorBumps.length === 0) {
    console.log(`[ok] major outdated 없음 (${label})`);
    return { flagged: false };
  }

  const lines = majorBumps.map(([name, info]) => `- **${name}**: ${info.current} → ${info.latest}`).join('\n');
  const title = `[Audit] npm outdated — major 버전 지연 패키지 (${label})`;
  const body = `## 자동 감사 결과 (${today()})

${lines}

보안 취약점은 아니지만 major 업그레이드 검토 필요.
_이 이슈는 정기 유지보수 감사 워크플로에 의해 자동 생성되었습니다._`;

  return createIssue(title, body, ['chore', 'status:triage']);
}

// ── 3. 빌드 실패
function checkBuild() {
  const { code, stdout, stderr } = sh('npm run build');
  if (code === 0) {
    console.log('[ok] 빌드 성공');
    return { flagged: false };
  }
  const title = '[Audit] npm run build 실패';
  const log = (stderr || stdout || '').slice(-3000);
  const body = `## 빌드 실패 (${today()})

\`\`\`
${log}
\`\`\`

_이 이슈는 정기 유지보수 감사 워크플로에 의해 자동 생성되었습니다._`;
  return createIssue(title, body, ['bug', 'chore', 'status:triage']);
}

function main() {
  const results = [
    checkAudit('.', 'root'),
    checkAudit('./client', 'client'),
    checkOutdated('.', 'root'),
    checkOutdated('./client', 'client'),
    checkBuild(),
  ];

  const created = results.filter((r) => r.created).length;
  const skipped = results.filter((r) => r.skipped).length;
  const clean = results.filter((r) => r.flagged === false).length;

  console.log(`\n=== 요약: 신규 이슈 ${created}개 / 스킵(중복) ${skipped}개 / 이상없음 ${clean}개 ===`);

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    console.log('[skip] DISCORD_WEBHOOK_URL 미설정 — 알림 생략');
    return;
  }

  const summary = [
    '**정기 유지보수 감사 완료**',
    `신규 이슈: ${created}개`,
    `스킵(중복): ${skipped}개`,
    `이상없음: ${clean}개`,
    `저장소: ${REPO}`,
  ].join('\n');

  fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: summary }),
  })
    .then((r) => console.log(`[discord] webhook status ${r.status}`))
    .catch((e) => console.error('[discord] webhook 전송 실패', e));
}

main();
