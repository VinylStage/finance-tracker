'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert');

// 파생 거래를 화면에서 어떻게 말하는가(#270). 문구가 여기서 다 나오므로
// 내부 용어가 새는지도 여기서 잡는다(#231 이 세운 방식).
let isDerived, originLabel, originIcon, originHref, originLinkText, originHint, derivedEndpoint, anchorId;

before(async () => {
  ({ isDerived, originLabel, originIcon, originHref, originLinkText, originHint, derivedEndpoint, anchorId } =
    await import('../client/src/lib/derivedOrigin.js'));
});

const INTERNAL_TERMS = [
  'origin', 'origin_ref_table', 'origin_ref_id', 'origin_seq',
  'installment_id', 'derived', 'manual', 'debt_interest', 'revolving_history',
];

describe('isDerived', () => {
  const cases = [
    { tx: { origin: 'manual' }, expected: false },
    { tx: { origin: 'installment' }, expected: true },
    { tx: { origin: 'revolving' }, expected: true },
    { tx: { origin: 'debt_interest' }, expected: true },
    { tx: { origin: 'debt_repayment' }, expected: true },
    // origin 컬럼이 없던 시절의 행. 사용자가 직접 넣은 것으로 본다(#268 과 같은 기준).
    { tx: {}, expected: false },
    { tx: { origin: null }, expected: false },
    { tx: null, expected: false },
  ];
  for (const c of cases) {
    test(`${JSON.stringify(c.tx)} → ${c.expected}`, () => {
      assert.strictEqual(isDerived(c.tx), c.expected);
    });
  }
});

describe('표식 문구', () => {
  test('할부는 몇 번째 회차인지 말한다', () => {
    assert.strictEqual(
      originLabel({ origin: 'installment', origin_seq: 3, origin_seq_total: 12 }),
      '할부 3/12회차'
    );
  });

  test('조기 완납이면 실제 청구 횟수를 따른다', () => {
    // 12개월짜리를 3회차에 완납했으면 "3/12" 가 아니라 "3/3" 이 사실이다.
    assert.strictEqual(
      originLabel({ origin: 'installment', origin_seq: 3, origin_seq_total: 3 }),
      '할부 3/3회차'
    );
  });

  test('회차 번호가 없으면 종류만 말한다', () => {
    assert.strictEqual(originLabel({ origin: 'installment' }), '할부');
  });

  test('리볼빙·부채이자·상환은 회차 개념이 없다', () => {
    assert.strictEqual(originLabel({ origin: 'revolving' }), '리볼빙 수수료');
    assert.strictEqual(originLabel({ origin: 'debt_interest' }), '대출 이자');
    assert.strictEqual(originLabel({ origin: 'debt_repayment' }), '대출 상환');
  });

  test('수동 거래에는 표식이 없다', () => {
    assert.strictEqual(originLabel({ origin: 'manual' }), '');
    assert.strictEqual(originIcon({ origin: 'manual' }), null);
  });

  test('색 말고 아이콘도 함께 쓴다', () => {
    // 색만으로 구분하면 색을 구분 못 하는 사용자에게 아무 정보가 없다(WCAG 1.4.1).
    for (const origin of ['installment', 'revolving', 'debt_interest', 'debt_repayment']) {
      assert.ok(originIcon({ origin }), `${origin} 아이콘 없음`);
      assert.ok(originLabel({ origin }), `${origin} 텍스트 없음`);
    }
  });
});

describe('고칠 수 있는 곳으로 보내기', () => {
  test('할부는 해당 항목까지 보낸다', () => {
    assert.strictEqual(
      originHref({ origin: 'installment', origin_ref_id: 7 }),
      '/assets/installments#installment-7'
    );
  });

  test('리볼빙도 해당 항목까지 보낸다', () => {
    assert.strictEqual(
      originHref({ origin: 'revolving', origin_ref_id: 4 }),
      '/assets/revolving#revolving-4'
    );
  });

  test('부채 이자는 화면까지만 보낸다', () => {
    // 거래 행이 들고 있는 것은 이자 기록 id 라 부채 항목을 특정할 수 없다.
    // 없는 자리로 보내는 링크보다 화면까지만 보내는 편이 낫다.
    assert.strictEqual(
      originHref({ origin: 'debt_interest', origin_ref_id: 9 }),
      '/assets/debts'
    );
  });

  test('참조 id 가 없어도 화면으로는 갈 수 있다', () => {
    assert.strictEqual(originHref({ origin: 'installment' }), '/assets/installments');
  });

  test('링크 문구가 어디로 가는지 말한다', () => {
    assert.strictEqual(originLinkText({ origin: 'installment' }), '할부 화면에서 수정');
    assert.strictEqual(originLinkText({ origin: 'revolving' }), '리볼빙 화면에서 수정');
    assert.strictEqual(originLinkText({ origin: 'debt_interest' }), '부채 화면에서 수정');
    assert.strictEqual(originLinkText({ origin: 'debt_repayment' }), '부채 화면에서 수정');
  });
});

describe('안내 문구', () => {
  test('무엇을 할 수 있는지로 끝난다', () => {
    // "수정할 수 없습니다" 같은 통보형은 다음 행동이 빠져 있다.
    for (const origin of ['installment', 'revolving', 'debt_interest', 'debt_repayment']) {
      const hint = originHint({ origin });
      assert.ok(hint.includes('고칠 수 있어요'), `다음 행동이 없다: ${hint}`);
      assert.ok(!hint.includes('수정할 수 없습니다'), `통보형 문구: ${hint}`);
    }
  });

  test('사용자에게 보이는 문구에 내부 용어가 없다', () => {
    for (const origin of ['installment', 'revolving', 'debt_interest', 'debt_repayment']) {
      const tx = { origin, origin_ref_id: 1, origin_seq: 2, origin_seq_total: 6 };
      const texts = [originLabel(tx), originLinkText(tx), originHint(tx)];
      for (const t of texts) {
        for (const term of INTERNAL_TERMS) {
          assert.ok(!t.includes(term), `문구에 내부 용어 "${term}" 노출: ${t}`);
        }
      }
    }
  });
});

describe('부채관리 화면 배선', () => {
  test('종류별 조회 주소', () => {
    assert.strictEqual(derivedEndpoint('installment', 3), '/api/installments/3/derived');
    assert.strictEqual(derivedEndpoint('revolving', 3), '/api/revolving/3/derived');
    assert.strictEqual(derivedEndpoint('debt', 3), '/api/debts/3/derived');
    assert.strictEqual(derivedEndpoint('알수없음', 3), null);
  });

  test('앵커 id 가 링크의 해시와 맞는다', () => {
    // 둘이 어긋나면 링크는 걸리는데 아무 데도 안 간다. 같은 규칙에서 나와야 한다.
    const href = originHref({ origin: 'installment', origin_ref_id: 7 });
    assert.ok(href.endsWith(`#${anchorId('installment', 7)}`));
  });
});
