import { describe, it, expect } from 'vitest';
import {
  buildPaymentOptions, optionValue, parseSelection,
  CARD_GROUP_LABEL, UNASSIGNED_LABEL,
} from './paymentOptions';

// 실제 데이터 모양 그대로다 — payment_methods 는 카드사 단위(#302 본문의 실측표).
const METHODS = [
  { id: 1, name: '하나카드', type: '신용' },
  { id: 2, name: '삼성카드', type: '신용' },
  { id: 7, name: '현금', type: '현금성' },
  { id: 9, name: '자동이체', type: '이체' },
];

const PRODUCTS = [
  { id: 11, payment_method_id: 1, issuer: '하나카드', product_name: '하나 A카드' },
  { id: 12, payment_method_id: 1, issuer: '하나카드', product_name: '하나 B카드' },
];

const labelsOf = (groups, label) => groups.find((g) => g.label === label)?.options.map((o) => o.label);
const valuesOf = (groups, label) => groups.find((g) => g.label === label)?.options.map((o) => o.value);

describe('buildPaymentOptions', () => {
  describe('A. 그룹핑', () => {
    it('A-1. 카드·현금성·이체가 각각의 그룹으로 나뉜다', () => {
      const groups = buildPaymentOptions(METHODS, PRODUCTS);
      expect(groups.map((g) => g.label)).toEqual([CARD_GROUP_LABEL, '현금성', '이체']);
    });

    it('A-2. 카드 그룹이 맨 앞이다', () => {
      const groups = buildPaymentOptions(METHODS, PRODUCTS);
      expect(groups[0].label).toBe(CARD_GROUP_LABEL);
    });

    it('A-3. 체크카드도 카드 그룹에 들어간다', () => {
      const groups = buildPaymentOptions([{ id: 3, name: '국민체크', type: '체크' }], []);
      expect(groups.map((g) => g.label)).toEqual([CARD_GROUP_LABEL]);
    });

    it('A-4. 모르는 type 은 기타 그룹으로 남는다 — 목록에서 사라지지 않는다', () => {
      const groups = buildPaymentOptions([{ id: 5, name: '상품권', type: '기프트' }], []);
      expect(labelsOf(groups, '기프트')).toEqual(['상품권']);
    });

    it('A-5. type 이 없는 결제수단도 사라지지 않는다', () => {
      const groups = buildPaymentOptions([{ id: 5, name: '미분류' }], []);
      expect(labelsOf(groups, '기타')).toEqual(['미분류']);
    });

    it('A-6. 카드가 하나도 없으면 카드 그룹 자체가 없다', () => {
      const groups = buildPaymentOptions([{ id: 7, name: '현금', type: '현금성' }], []);
      expect(groups.map((g) => g.label)).toEqual(['현금성']);
    });

    it('A-7. 카드 아닌 수단은 결제수단 목록 순서를 지킨다', () => {
      const groups = buildPaymentOptions(
        [{ id: 9, name: '자동이체', type: '이체' }, { id: 7, name: '현금', type: '현금성' }],
        []
      );
      expect(groups.map((g) => g.label)).toEqual(['이체', '현금성']);
    });
  });

  describe('B. 카드 표기 — 상품명이 주표기', () => {
    it('B-1. 카드상품은 상품명 · 카드사로 표시된다', () => {
      const groups = buildPaymentOptions(METHODS, PRODUCTS);
      expect(labelsOf(groups, CARD_GROUP_LABEL)).toContain('하나 A카드 · 하나카드');
    });

    it('B-2. 같은 카드사의 카드 두 장이 모두 나온다', () => {
      const groups = buildPaymentOptions(METHODS, PRODUCTS);
      const labels = labelsOf(groups, CARD_GROUP_LABEL);
      expect(labels).toContain('하나 A카드 · 하나카드');
      expect(labels).toContain('하나 B카드 · 하나카드');
    });

    it('B-3. 카드상품 값은 cp: 접두사를 쓴다', () => {
      const groups = buildPaymentOptions(METHODS, PRODUCTS);
      expect(valuesOf(groups, CARD_GROUP_LABEL)).toContain('cp:11');
    });

    it('B-4. 상품은 그 카드사의 미지정 항목보다 먼저 나온다', () => {
      const groups = buildPaymentOptions(METHODS, PRODUCTS);
      const values = valuesOf(groups, CARD_GROUP_LABEL);
      expect(values.indexOf('cp:11')).toBeLessThan(values.indexOf('pm:1'));
    });
  });

  describe('C. 미상(카드사만 아는 거래)', () => {
    it('C-1. 상품이 있는 카드사에는 미지정 항목이 함께 나온다', () => {
      const groups = buildPaymentOptions(METHODS, PRODUCTS);
      expect(labelsOf(groups, CARD_GROUP_LABEL)).toContain(`하나카드 · ${UNASSIGNED_LABEL}`);
    });

    it('C-2. 등록된 카드가 없는 카드사는 이름만 나온다', () => {
      const groups = buildPaymentOptions(METHODS, PRODUCTS);
      expect(labelsOf(groups, CARD_GROUP_LABEL)).toContain('삼성카드');
    });

    it('C-3. 카드가 한 장도 없으면 지금과 똑같이 카드사 이름만 나열된다', () => {
      const groups = buildPaymentOptions(METHODS, []);
      expect(labelsOf(groups, CARD_GROUP_LABEL)).toEqual(['하나카드', '삼성카드']);
    });
  });

  describe('D. 비활성 카드사에 달린 상품', () => {
    // /api/payment-methods 는 기본으로 is_active=1 만 준다. 그 카드로 기록된
    // 과거 거래를 수정할 때 선택지가 비면 저장하는 순간 카드가 지워진다.
    const ORPHAN = [{ id: 21, payment_method_id: 99, issuer: '없어진카드사', product_name: '옛날카드' }];

    it('D-1. 카드사 목록에 없어도 상품은 남는다', () => {
      const groups = buildPaymentOptions(METHODS, ORPHAN);
      expect(valuesOf(groups, CARD_GROUP_LABEL)).toContain('cp:21');
    });

    it('D-2. 보조표기는 상품이 들고 있는 issuer 를 쓴다', () => {
      const groups = buildPaymentOptions(METHODS, ORPHAN);
      expect(labelsOf(groups, CARD_GROUP_LABEL)).toContain('옛날카드 · 없어진카드사');
    });

    it('D-3. 활성 카드사의 상품이 중복으로 붙지 않는다', () => {
      const groups = buildPaymentOptions(METHODS, PRODUCTS);
      const values = valuesOf(groups, CARD_GROUP_LABEL);
      expect(values.filter((v) => v === 'cp:11')).toHaveLength(1);
    });
  });

  // 더 안 쓰기로 한 카드(#410). 새 거래에서는 못 고르지만, 그 카드로 지정된
  // 과거 거래를 수정할 때 목록에서 빠지면 저장하는 순간 지정이 지워진다.
  describe('D2. 비활성 카드', () => {
    const WITH_INACTIVE = [
      { id: 11, payment_method_id: 1, issuer: '하나카드', product_name: '하나 A카드', is_active: 1 },
      { id: 12, payment_method_id: 1, issuer: '하나카드', product_name: '하나 B카드', is_active: 0 },
    ];

    it('D2-1. 비활성 카드는 기본적으로 빠진다', () => {
      const groups = buildPaymentOptions(METHODS, WITH_INACTIVE);
      expect(valuesOf(groups, CARD_GROUP_LABEL)).not.toContain('cp:12');
    });

    it('D2-2. 활성 카드는 그대로 나온다', () => {
      const groups = buildPaymentOptions(METHODS, WITH_INACTIVE);
      expect(valuesOf(groups, CARD_GROUP_LABEL)).toContain('cp:11');
    });

    it('D2-3. 지금 지정된 카드면 비활성이어도 남는다', () => {
      const groups = buildPaymentOptions(METHODS, WITH_INACTIVE, { keepCardProductId: 12 });
      expect(valuesOf(groups, CARD_GROUP_LABEL)).toContain('cp:12');
    });

    it('D2-4. 문자열로 넘어온 id 도 같게 본다 — 폼 상태는 문자열이다', () => {
      const groups = buildPaymentOptions(METHODS, WITH_INACTIVE, { keepCardProductId: '12' });
      expect(valuesOf(groups, CARD_GROUP_LABEL)).toContain('cp:12');
    });

    it('D2-5. is_active 가 없는 목록은 전부 활성으로 본다 — 예전 응답 호환', () => {
      const groups = buildPaymentOptions(METHODS, PRODUCTS);
      expect(valuesOf(groups, CARD_GROUP_LABEL)).toContain('cp:12');
    });

    it('D2-6. 비활성만 남은 카드사는 미지정 항목만 남는다', () => {
      const onlyInactive = [{ id: 12, payment_method_id: 1, issuer: '하나카드', product_name: '하나 B카드', is_active: 0 }];
      const groups = buildPaymentOptions(METHODS, onlyInactive);
      const labels = labelsOf(groups, CARD_GROUP_LABEL);
      expect(labels).toContain('하나카드');
      expect(labels).not.toContain('하나 B카드 · 하나카드');
    });
  });

  describe('E. 빈 입력', () => {
    it('E-1. 인자가 없어도 빈 배열을 낸다', () => {
      expect(buildPaymentOptions()).toEqual([]);
    });
  });
});

describe('optionValue', () => {
  it('A-1. 상품이 있으면 상품이 이긴다', () => {
    expect(optionValue({ payment_method_id: 1, card_product_id: 11 })).toBe('cp:11');
  });

  it('A-2. 카드사만 있으면 카드사다', () => {
    expect(optionValue({ payment_method_id: 1, card_product_id: null })).toBe('pm:1');
  });

  it('A-3. 둘 다 없으면 빈 값이다', () => {
    expect(optionValue({ payment_method_id: null, card_product_id: null })).toBe('');
  });

  it('A-4. 폼 상태의 빈 문자열을 값으로 취급하지 않는다', () => {
    expect(optionValue({ payment_method_id: '', card_product_id: '' })).toBe('');
  });

  it('A-5. 문자열 id 도 그대로 만든다 — 폼 상태는 문자열로 들고 있다', () => {
    expect(optionValue({ payment_method_id: '1', card_product_id: '11' })).toBe('cp:11');
  });

  it('A-6. 인자가 없어도 빈 값이다', () => {
    expect(optionValue()).toBe('');
  });
});

describe('parseSelection', () => {
  it('A-1. 상품을 고르면 그 상품이 달린 카드사가 함께 정해진다', () => {
    expect(parseSelection('cp:12', PRODUCTS)).toEqual({ payment_method_id: 1, card_product_id: 12 });
  });

  it('A-2. 카드사를 고르면 상품은 미상이다', () => {
    expect(parseSelection('pm:2', PRODUCTS)).toEqual({ payment_method_id: 2, card_product_id: null });
  });

  it('A-3. 빈 선택은 둘 다 없음이다', () => {
    expect(parseSelection('', PRODUCTS)).toEqual({ payment_method_id: null, card_product_id: null });
  });

  it('A-4. 목록에 없는 상품 id 는 카드사도 남기지 않는다', () => {
    expect(parseSelection('cp:999', PRODUCTS)).toEqual({ payment_method_id: null, card_product_id: null });
  });

  it('A-5. 접두사가 없는 값은 무시한다', () => {
    expect(parseSelection('12', PRODUCTS)).toEqual({ payment_method_id: null, card_product_id: null });
  });

  it('A-6. 숫자가 아닌 카드사 id 는 무시한다', () => {
    expect(parseSelection('pm:abc', PRODUCTS)).toEqual({ payment_method_id: null, card_product_id: null });
  });

  it('A-7. 상품 목록을 안 줘도 카드사 선택은 동작한다', () => {
    expect(parseSelection('pm:2')).toEqual({ payment_method_id: 2, card_product_id: null });
  });
});
