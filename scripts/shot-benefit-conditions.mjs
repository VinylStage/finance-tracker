// 혜택 조건 화면 스크린샷(#638 · #636 · #648).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 스크립트로 두나
//
// 화면이 바뀌는 PR 은 스크린샷을 붙인다. 손으로 찍으면 다음 사람이 같은 화면을
// 다시 만들지 못하고, «어떤 데이터로 찍은 것인가» 가 남지 않는다.
//
// **실 데이터로 찍지 않는다.** 이 저장소는 public 이라 보유 카드 상품명이 그대로
// 올라가면 안 된다. 그래서 이 스크립트가 쓰는 서버는 반드시 더미 DB 여야 하고,
// 찍기 전에 화면에 실제 상품명이 없는지 **기계로 확인한다**(아래 assertDummy).
//
// 더미 이름은 «예시카드사 / 예시 조건 카드» 처럼 역할이 드러나게 짓는다. 그러면
// 스크린샷 자체가 «이 화면이 어떤 상태를 다루는가» 를 설명한다.
//
// 쓰는 법 — 더미 DB 로 서버를 띄운 뒤:
//
//   DB_PATH=/tmp/dummy.db PORT=3321 NODE_ENV=production node src/server.js &
//   node scripts/shot-benefit-conditions.mjs http://localhost:3321 /tmp/shots
//
// 카드와 혜택은 이 스크립트가 직접 넣는다 — 서버만 비어 있으면 된다.

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3321';
const OUT = process.argv[3] || '.';

// 화면에 떠서는 안 되는 말. 실 DB 를 잘못 물고 찍는 사고를 막는다.
// 실제 카드사 이름이 하나라도 보이면 즉시 멈춘다.
const FORBIDDEN = ['하나', '신한', '삼성', '국민', 'KB', '현대', '롯데카드', '우리', '토스', '네이버페이'];

const api = async (path, options) => {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) });

// 화면이 다루는 상태를 **전부** 드러내는 더미. 조건마다 한 줄씩이다.
async function seed() {
  const pm = (await post('/api/payment-methods', { name: '예시 체크카드', type: '체크' })).body.id;
  const card = (await post('/api/card-products', {
    payment_method_id: pm,
    issuer: '예시카드사',
    product_name: '예시 조건 카드',
    card_type: '체크',
    prev_month_threshold: 100000,
  })).body.id;

  await api(`/api/card-strategy/tiers/${card}`, {
    method: 'PUT',
    body: JSON.stringify({
      tiers: [
        { min_spend: 0, label: '기본', monthly_cap: 5000 },
        { min_spend: 300000, label: '30만', monthly_cap: 30000 },
      ],
    }),
  });

  const rows = [
    // 건당 상한(#638)
    {
      merchant_pattern: '군마트', benefit_type: '적립', rate: 30, max_amount: 100000,
      threshold_exempt: true, memo: '건당 10만원 미만',
      rule: { kind: 'rate', rate: 30, caps: [{ window: 'month', amount: 5000 }] },
    },
    // 건당 하한 + 창별 한도 둘
    {
      merchant_pattern: '군마트', benefit_type: '적립', rate: 20, min_amount: 100000,
      threshold_exempt: true, memo: '건당 10만원 이상',
      rule: { kind: 'rate', rate: 20, caps: [{ window: 'month', amount: 100000 }, { window: 'day', amount: 20000 }] },
    },
    // 날짜 조건(#638)
    {
      merchant_pattern: '편의점', benefit_type: '적립', rate: 30,
      threshold_exempt: true, memo: '기념일 한정',
      rule: { kind: 'rate', rate: 30, when: { dates: ['10-01', '06-06'] }, caps: [{ window: 'day', amount: 50000 }] },
    },
    // 횟수 한도(#638) + 통합 한도 밖(#648)
    {
      merchant_pattern: '놀이공원', benefit_type: '할인', rate: 50,
      unified_cap_exempt: true, memo: '현장할인',
      rule: { kind: 'rate', rate: 50, caps: [{ window: 'month', count: 1 }] },
    },
  ];
  for (const r of rows) await post('/api/card-benefits', { card_product_id: card, ...r });
  return card;
}

// 실 데이터를 물고 찍는 사고를 막는 마지막 관문. 찍기 **전에** 부른다.
function assertDummy(text) {
  const hit = FORBIDDEN.filter((w) => text.includes(w));
  if (hit.length) {
    throw new Error(`실 카드사 이름이 화면에 있다: ${hit.join(', ')} — 더미 DB 가 맞는지 확인한다`);
  }
}

const existing = await api('/api/card-benefits');
if ((existing.body?.data || []).length === 0) await seed();

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 1400 } });
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });

  // 첫 방문 안내가 클릭을 가로막는다.
  const skip = page.getByRole('button', { name: '건너뛰기' });
  if (await skip.count()) await skip.first().click();

  await page.waitForSelector('#benefit-card');
  const value = await page.locator('#benefit-card option', { hasText: '예시 조건 카드' }).first().getAttribute('value');
  await page.selectOption('#benefit-card', value);
  await page.waitForSelector('#card-benefit li, #card-benefit [data-benefit-row]', { timeout: 3000 }).catch(() => {});

  const section = page.locator('#card-benefit');
  assertDummy(await section.innerText());

  await section.screenshot({ path: `${OUT}/638-benefit-list.png` });
  console.log(`목록 → ${OUT}/638-benefit-list.png`);

  await page.getByRole('button', { name: '혜택 추가' }).click();
  await page.waitForSelector('#benefit-max');
  assertDummy(await section.innerText());

  await section.screenshot({ path: `${OUT}/638-benefit-form.png` });
  console.log(`입력 폼 → ${OUT}/638-benefit-form.png`);

  // 이미지가 PR 본문에 못 붙는 동안에도 대조할 수 있게 문구를 같이 남긴다.
  console.log('\n--- 목록 문구 ---');
  console.log(await section.innerText());
} finally {
  await browser.close();
}
