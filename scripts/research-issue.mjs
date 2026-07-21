#!/usr/bin/env node
// 사용법: node scripts/research-issue.mjs <issue-number> [model]
// 기본 모델: qwen3-30b-32k
'use strict';

import { execSync } from 'node:child_process';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const DEFAULT_MODEL = 'qwen3-30b-32k';
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

const [, , issueNumberArg, modelArg] = process.argv;
const model = modelArg || DEFAULT_MODEL;

if (!issueNumberArg || !/^\d+$/.test(issueNumberArg)) {
  console.error('사용법: node scripts/research-issue.mjs <issue-number> [model]');
  process.exit(1);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...opts });
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).trim();
}

async function ollamaGenerate(prompt) {
  let res;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: AbortSignal.timeout(180000),
    });
  } catch (e) {
    throw new Error(`Ollama(${OLLAMA_HOST}) 연결 실패: ${e.message}`);
  }
  if (!res.ok) {
    throw new Error(`Ollama 응답 실패: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return (data.response || '').trim();
}

async function braveSearch(query) {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`, {
    headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Brave Search API 실패: ${res.status}`);
  const data = await res.json();
  return (data.web?.results || []).map((r) => ({ title: r.title, url: r.url }));
}

function extractDdgUrl(href) {
  try {
    const full = href.startsWith('//') ? 'https:' + href : href;
    const u = new URL(full);
    const uddg = u.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : full;
  } catch {
    return null;
  }
}

async function duckduckgoSearch(query) {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { ...BROWSER_HEADERS, Referer: 'https://duckduckgo.com/' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo 요청 실패: ${res.status}`);
  const html = await res.text();

  const results = [];
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs;
  let match;
  while ((match = linkRegex.exec(html)) && results.length < 8) {
    const url = extractDdgUrl(match[1]);
    const title = stripTags(match[2]);
    if (url) results.push({ title, url });
  }
  return results;
}

async function fetchPageText(url) {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`fetch 실패: ${res.status}`);
  const html = await res.text();
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
  return text.slice(0, 2000);
}

async function main() {
  // 1. 이슈 정보 조회
  let issue;
  try {
    const raw = sh(`gh issue view ${issueNumberArg} --json title,body,labels`);
    issue = JSON.parse(raw);
  } catch (e) {
    console.error(`[에러] 이슈 #${issueNumberArg} 조회 실패: ${e.message}`);
    process.exit(1);
  }
  console.log(`[이슈 #${issueNumberArg}] ${issue.title}`);

  // 2. 검색 쿼리 추출 (Ollama 경량 호출)
  let query;
  try {
    const queryPrompt = `다음 GitHub 이슈의 제목과 설명을 보고, 웹 검색에 쓸 핵심 검색어를 영어로 한 줄만 출력해. 설명이나 따옴표 없이 검색어만 출력해.

제목: ${issue.title}
설명: ${(issue.body || '').slice(0, 1000)}`;
    const raw = await ollamaGenerate(queryPrompt);
    query = raw.split('\n')[0].replace(/^["']|["']$/g, '').trim();
    if (!query) throw new Error('빈 검색어 반환됨');
  } catch (e) {
    console.error(`[에러] 검색어 추출 실패: ${e.message}`);
    process.exit(1);
  }
  console.log(`[검색어] ${query}`);

  // 3. 웹 검색
  let results;
  try {
    results = BRAVE_API_KEY ? await braveSearch(query) : await duckduckgoSearch(query);
  } catch (e) {
    console.error(`[에러] 웹 검색 실패: ${e.message}`);
    process.exit(1);
  }
  if (!results.length) {
    console.error('[에러] 검색 결과가 없습니다.');
    process.exit(1);
  }
  console.log(`[검색결과] ${results.length}건 (${BRAVE_API_KEY ? 'Brave' : 'DuckDuckGo'})`);

  // 4. 상위 결과 페이지 텍스트 추출
  const pages = await Promise.all(
    results.slice(0, 8).map(async (r) => {
      try {
        const text = await fetchPageText(r.url);
        return { ...r, text };
      } catch (e) {
        console.error(`  [스킵] ${r.url} — ${e.message}`);
        return { ...r, text: '' };
      }
    })
  );
  const usable = pages.filter((p) => p.text);
  if (!usable.length) {
    console.error('[에러] 검색 결과 페이지에서 텍스트를 추출하지 못했습니다.');
    process.exit(1);
  }
  console.log(`[페이지추출] ${usable.length}/${pages.length}건 성공`);

  // 5. Ollama 요약
  const context = usable
    .map((p, i) => `### 출처 ${i + 1}: ${p.title}\nURL: ${p.url}\n${p.text}`)
    .join('\n\n')
    .slice(0, 12000);

  const summaryPrompt = `너는 소프트웨어 엔지니어링 리서치 어시스턴트야. 다음 GitHub 이슈와 웹 검색 결과를 참고해서 한국어로 조사 보고서를 작성해줘.

## 이슈: ${issue.title}
${(issue.body || '').slice(0, 1500)}

## 웹 검색 결과
${context}

다음 형식으로 작성해 (마크다운 헤더 사용):
### 기술 동향
### 유사 구현 사례
### 리스크
### 추천 방향

각 섹션은 2~4문장으로 간결하게, 관련 있으면 출처 번호(예: [출처 1])를 인용해.`;

  let summary;
  try {
    summary = await ollamaGenerate(summaryPrompt);
    if (!summary) throw new Error('빈 응답 반환됨');
  } catch (e) {
    console.error(`[에러] 요약 생성 실패: ${e.message}`);
    process.exit(1);
  }

  // 6. 이슈 코멘트 작성
  const sourcesList = usable.map((p, i) => `${i + 1}. [${p.title || p.url}](${p.url})`).join('\n');
  const commentBody = `## 🔍 자료조사 결과

**검색어**: \`${query}\`
**모델**: \`${model}\`

${summary}

---
**참고 자료**
${sourcesList}

_이 코멘트는 \`scripts/research-issue.mjs\`(로컬 Ollama)로 자동 생성되었습니다._`;

  try {
    sh(`gh issue comment ${issueNumberArg} --body-file -`, { input: commentBody });
  } catch (e) {
    console.error(`[에러] 이슈 코멘트 작성 실패: ${e.message}`);
    process.exit(1);
  }

  console.log(`[완료] 이슈 #${issueNumberArg}에 자료조사 결과 코멘트 작성됨`);
}

main().catch((e) => {
  console.error(`[치명적 에러] ${e.message}`);
  process.exit(1);
});
