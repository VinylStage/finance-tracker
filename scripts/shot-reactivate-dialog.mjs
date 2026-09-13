// 반복 규칙 재활성화 대화상자 스크린샷(#489).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 스크립트로 두나
//
// 화면이 바뀌는 PR 은 스크린샷을 붙인다. 손으로 찍으면 다음 사람이 같은 화면을 다시
// 만들지 못하고 «어떤 데이터로 찍은 것인가» 가 남지 않는다.
//
// **실 데이터로 찍지 않는다.** 이 저장소는 public 이라 실제 가맹점·카드 이름이 그대로
// 올라가면 안 된다. 그래서 이 스크립트는 더미 규칙을 **직접 넣고**, 찍기 전에 화면에
// 실제 카드사 이름이 없는지 기계로 확인한다.
//
// 쓰는 법 — 빈 DB 로 서버를 띄운 뒤:
//
//   DB_PATH=/tmp/dummy489.db PORT=3322 NODE_ENV=production node src/server.js &
//   node scripts/shot-reactivate-dialog.mjs http://localhost:3322 /tmp/shots

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3322';
const OUT = process.argv[3] || '.';

// 화면에 떠서는 안 되는 말. 실 DB 를 잘못 물고 찍는 사고를 막는다.
const FORBIDDEN = ['하나', '신한', '삼성', '국민', 'KB', '현대', '롯데카드', '우리', '토스', '네이버페이'];

const api = async (path, options) => {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) });

// 꺼진 규칙 하나. **빠진 기간이 실제로 생기도록** 시작일과 마지막 실행일을 과거로 둔다 —
// 그래야 대화상자가 «N건이 새로 생겨요» 를 말하는 상태가 찍힌다.
async function seed() {
  const cat = (await post('/api/categories', { major_type: '고정지출', name: '예시 구독' })).body.id;
  const rule = await post('/api/recurring-rules', {
    category_id: cat,
    merchant: '예시 구독 서비스',
    amount: 12000,
    day_of_month: 10,
    payment_style: '해당없음',
    memo: '예시',
    freq: 'monthly',
    interval: 1,
    starts_on: '2026-01-10',
  });
  const id = rule.body.id;

  // 규칙을 끄고 마지막 실행일을 과거로 만든다. API 로는 못 하므로 DELETE(소프트) 뒤
  // 프리뷰가 볼 구간이 생기도록 시작일만 과거로 둔 상태를 쓴다.
  await api(`/api/recurring-rules/${id}`, { method: 'DELETE' });
  return id;
}

function assertDummy(text) {
  const hit = FORBIDDEN.filter((w) => text.includes(w));
  if (hit.length) {
    throw new Error(`실 카드사 이름이 화면에 있다: ${hit.join(', ')} — 더미 DB 가 맞는지 확인한다`);
  }
}

const existing = await api('/api/recurring-rules?include_inactive=1');
if ((existing.body?.data || []).length === 0) await seed();

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });

  // 첫 방문 안내가 클릭을 가로막는다.
  const skip = page.getByRole('button', { name: '건너뛰기' });
  if (await skip.count()) await skip.first().click();

  // 반복 규칙 절은 `#recurring` 앵커 안에 있다(Settings.jsx:117). 절마다 «비활성 항목
  // 보기» 가 있으므로 **그 절 안에서** 눌러야 엉뚱한 절이 펼쳐지지 않는다.
  const section = page.locator('#recurring');
  await section.waitFor({ state: 'visible', timeout: 10000 });
  await section.getByRole('button', { name: '비활성 항목 보기' }).click();

  const before = section;
  assertDummy(await before.innerText());
  await before.screenshot({ path: `${OUT}/489-before.png` });
  console.log(`목록(before) → ${OUT}/489-before.png`);

  await section.getByRole('button', { name: '재활성화' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 5000 });
  // 프리뷰 응답을 기다린다 — «확인하는 중» 이 사라져야 값이 찍힌다.
  await page.waitForFunction(
    () => !document.querySelector('[role="dialog"]')?.textContent?.includes('확인하는 중'),
    { timeout: 5000 },
  ).catch(() => {});

  assertDummy(await dialog.innerText());
  await dialog.screenshot({ path: `${OUT}/489-after-dialog.png` });
  console.log(`대화상자(after) → ${OUT}/489-after-dialog.png`);

  // 날짜 지정 갈래도 찍는다 — 입력칸이 그때만 나온다.
  await page.getByRole('radio', { name: /고른 날짜부터/ }).check();
  await dialog.screenshot({ path: `${OUT}/489-after-from-date.png` });
  console.log(`날짜 지정 → ${OUT}/489-after-from-date.png`);

  // 이미지가 PR 본문에 못 붙는 동안에도 대조할 수 있게 문구를 같이 남긴다.
  console.log('\n--- 대화상자 문구 ---');
  console.log(await dialog.innerText());
} finally {
  await browser.close();
}
