// 구간 교체가 참조를 막는지 잠근다(#656).
//
// 구간 교체는 **통째로 지우고 다시 넣는다.** 혜택이 `card_threshold_tier_id` 로 그 구간을
// 가리키고 있으면 FK 가 DELETE 를 막는데, 예전에는 그게 **500** 으로 나갔고 화면에는
// «잠시 후 다시 시도해 주세요» 만 떴다 — **다시 시도해도 영원히 같은 결과다.**
// 구조적 거부인데 문구가 일시적 오류처럼 말했다.
//
// 실측: 나라사랑카드 재투입(#620) 중 혜택 151줄 중 145줄이 구간을 가리키고 있었다.
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21502 는 다른 테스트가 안 쓴다.
const PORT = 21502;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// 카드 한 장 + 구간 둘. **id 는 전부 응답에서 읽는다** — 테스트마다 카드를 새로 만들어
// 번호가 매번 다르다. 숫자로 적으면 그 순간은 통과하고 다음 테스트에서 깨진다.
async function cardWithTiers(name) {
  const pm = await req('POST', '/api/payment-methods', { name, type: '신용' });
  const cp = await req('POST', '/api/card-products', {
    payment_method_id: pm.body.id,
    issuer: '가상카드사',
    product_name: `${name} 상품`,
    card_type: '신용',
  });
  const cardId = cp.body.id;

  const put = await req('PUT', `/api/card-strategy/tiers/${cardId}`, {
    tiers: [
      { min_spend: 0, rate: 1, label: 'A' },
      { min_spend: 100000, rate: 2, label: 'B' },
    ],
  });
  assert.strictEqual(put.status, 200, '구간을 못 넣었다');
  return { cardId, tiers: put.body.data };
}

async function tiersOf(cardId) {
  const r = await req('GET', `/api/card-strategy/tiers/${cardId}`);
  return r.body.data || r.body;
}

// 첫 구간을 가리키는 혜택 하나.
async function benefitOnTier(cardId, tierId) {
  const r = await req('POST', '/api/card-benefits', {
    card_product_id: cardId,
    benefit_type: '적립',
    rate: 5,
    card_threshold_tier_id: tierId,
  });
  assert.ok(r.body.id, '혜택이 안 만들어졌다 — 구간 id 를 확인해라');
  return r.body.id;
}

test('참조가 없으면 구간을 교체할 수 있다', async () => {
  const { cardId } = await cardWithTiers('프로브구간A');

  const resp = await req('PUT', `/api/card-strategy/tiers/${cardId}`, {
    tiers: [{ min_spend: 0, rate: 9, label: 'X' }],
  });

  assert.strictEqual(resp.status, 200);
  assert.strictEqual((await tiersOf(cardId)).length, 1);
});

test('혜택이 구간을 가리키면 409 로 막는다', async () => {
  const { cardId, tiers } = await cardWithTiers('프로브구간B');
  await benefitOnTier(cardId, tiers[0].id);

  const resp = await req('PUT', `/api/card-strategy/tiers/${cardId}`, {
    tiers: [{ min_spend: 0, rate: 9, label: 'X' }],
  });

  assert.strictEqual(resp.status, 409);
  assert.ok(
    resp.body.error.includes('구간을 가리키고 있어요'),
    `안내 문구가 아니다: ${resp.body.error}`
  );
  assert.strictEqual(resp.body.referencingBenefits, 1);
  // 500 시절의 문구가 다시 나오면 «다시 시도하면 된다» 로 읽힌다.
  assert.ok(!resp.body.error.includes('잠시 후 다시 시도'), '일시적 오류처럼 말하고 있다');
});

test('막힌 뒤에도 구간이 그대로 남는다', async () => {
  const { cardId, tiers } = await cardWithTiers('프로브구간C');
  await benefitOnTier(cardId, tiers[0].id);

  await req('PUT', `/api/card-strategy/tiers/${cardId}`, {
    tiers: [{ min_spend: 0, rate: 9, label: 'X' }],
  });

  // 거부가 DELETE **전에** 일어나야 한다. 뒤에 일어나면 구간이 사라진 카드가 남는다.
  const after = await tiersOf(cardId);
  assert.strictEqual(after.length, 2);
  assert.deepStrictEqual(after.map((t) => t.label).sort(), ['A', 'B']);
});

test('구간 지정을 풀면 다시 교체할 수 있다', async () => {
  const { cardId, tiers } = await cardWithTiers('프로브구간D');
  const benefitId = await benefitOnTier(cardId, tiers[0].id);

  const unlink = await req('PUT', `/api/card-benefits/${benefitId}`, {
    card_product_id: cardId,
    benefit_type: '적립',
    rate: 5,
    card_threshold_tier_id: null,
  });
  assert.strictEqual(unlink.status, 200, '구간 지정을 못 풀었다');

  // **이 자리가 안내가 참인지 보는 곳이다.** 「먼저 구간 지정을 풀어 주세요」 라고 말해
  // 놓고 풀어도 안 되면 그 안내가 거짓이 된다.
  const resp = await req('PUT', `/api/card-strategy/tiers/${cardId}`, {
    tiers: [{ min_spend: 0, rate: 9, label: 'X' }],
  });
  assert.strictEqual(resp.status, 200);
  assert.strictEqual((await tiersOf(cardId)).length, 1);
});
