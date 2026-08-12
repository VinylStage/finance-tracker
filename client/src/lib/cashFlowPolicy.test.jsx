import { describe, it, expect } from 'vitest';
import { cashFlow, flowColor, FLOW_TYPES, REST_KEY, SOURCE_COLOR } from './cashFlow';
import {
  signatureOf, groupToRanges, rangeLabel, fieldsFor, describePolicy, describePeriod,
  POLICY_FIELDS,
} from './cardPolicyRanges';

describe('cashFlow', () => {
  it('흐름 순서가 고정돼 있다', () => {
    expect(FLOW_TYPES).toEqual(['고정지출', '변동필수', '부채상환', '선택지출', '저축']);
  });

  it('대분류별로 합산한다', () => {
    const rows = [
      { major_type: '고정지출', total: 300 },
      { major_type: '선택지출', total: 200 },
    ];
    const r = cashFlow(rows, 1000);
    expect(r.income).toBe(1000);
    expect(r.spent).toBe(500);
    expect(r.rest).toBe(500);
    expect(r.overspent).toBe(0);
  });

  it('같은 대분류가 여러 줄이면 더한다', () => {
    const rows = [
      { major_type: '고정지출', total: 100 },
      { major_type: '고정지출', total: 250 },
    ];
    expect(cashFlow(rows, 1000).spent).toBe(350);
  });

  it('수입과 미분류는 갈래로 넣지 않는다', () => {
    const rows = [
      { major_type: '고정지출', total: 100 },
      { major_type: '수입', total: 5000 },
      { major_type: '미분류', total: 700 },
    ];
    const r = cashFlow(rows, 1000);
    expect(r.spent).toBe(100);
    expect(r.nodes.map((n) => n.key)).not.toContain('수입');
    expect(r.nodes.map((n) => n.key)).not.toContain('미분류');
  });

  it('값이 0 인 갈래는 그리지 않는다', () => {
    const rows = [
      { major_type: '고정지출', total: 100 },
      { major_type: '저축', total: 0 },
    ];
    expect(cashFlow(rows, 1000).nodes.map((n) => n.key)).not.toContain('저축');
  });

  it('흐름 순서대로 노드가 쌓인다', () => {
    const rows = [
      { major_type: '저축', total: 50 },
      { major_type: '고정지출', total: 100 },
      { major_type: '부채상환', total: 30 },
    ];
    const keys = cashFlow(rows, 1000).nodes.map((n) => n.key);
    expect(keys.slice(0, 3)).toEqual(['고정지출', '부채상환', '저축']);
  });

  it('남은 돈은 마지막 노드다', () => {
    const r = cashFlow([{ major_type: '고정지출', total: 100 }], 1000);
    const keys = r.nodes.map((n) => n.key);
    expect(keys[keys.length - 1]).toBe(REST_KEY);
    expect(r.nodes[keys.length - 1].value).toBe(900);
  });

  it('남은 돈이 0 이면 그 노드를 안 만든다', () => {
    const r = cashFlow([{ major_type: '고정지출', total: 1000 }], 1000);
    expect(r.rest).toBe(0);
    expect(r.nodes.map((n) => n.key)).not.toContain(REST_KEY);
  });

  it('지출이 수입을 넘으면 남은 돈은 음수가 아니라 0 이다', () => {
    const r = cashFlow([{ major_type: '고정지출', total: 1500 }], 1000);
    expect(r.rest).toBe(0);
    expect(r.overspent).toBe(500);
  });

  it('비율의 분모는 수입이 아니라 그려지는 총량이다', () => {
    const r = cashFlow([{ major_type: '고정지출', total: 1500 }], 1000);
    expect(r.nodes[0].share).toBe(1);
  });

  it('비율의 합은 1 이다', () => {
    const rows = [
      { major_type: '고정지출', total: 300 },
      { major_type: '선택지출', total: 200 },
    ];
    const sum = cashFlow(rows, 1000).nodes.reduce((s, n) => s + n.share, 0);
    expect(sum).toBeCloseTo(1);
  });

  it('음수와 숫자 아닌 값은 0 으로 본다', () => {
    const rows = [
      { major_type: '고정지출', total: -500 },
      { major_type: '선택지출', total: 'abc' },
      { major_type: '저축', total: 100 },
    ];
    expect(cashFlow(rows, 1000).spent).toBe(100);
    expect(cashFlow([], -50).income).toBe(0);
  });

  it('그릴 것이 없으면 빈 배열이다', () => {
    expect(cashFlow([], 0).nodes.length).toBe(0);
    expect(cashFlow(null, 0).nodes.length).toBe(0);
  });

  it('색은 갈래마다 다르고 모르는 키에는 기본색을 준다', () => {
    const colors = FLOW_TYPES.map((t) => flowColor(t));
    expect(new Set(colors).size).toBe(colors.length);
    expect(flowColor(REST_KEY)).toBe(flowColor('없는대분류'));
    expect(SOURCE_COLOR).toBeTruthy();
  });
});

describe('cardPolicyRanges', () => {
  const base = {
    id: 1, payment_method_id: 9, months: 2, policy_type: '무이자',
    annual_rate: 0, free_from_sequence: 0,
    effective_from: '2026-01-01', effective_to: null, memo: null,
  };

  it('이어지는 개월수는 한 구간으로 묶인다', () => {
    const ranges = groupToRanges([
      { ...base, id: 1, months: 2 },
      { ...base, id: 2, months: 3 },
      { ...base, id: 3, months: 4 },
    ]);
    expect(ranges.length).toBe(1);
    expect(ranges[0].from_month).toBe(2);
    expect(ranges[0].to_month).toBe(4);
    expect(ranges[0].ids).toEqual([1, 2, 3]);
  });

  it('개월수가 끊기면 구간도 끊는다', () => {
    const ranges = groupToRanges([
      { ...base, id: 1, months: 2 },
      { ...base, id: 2, months: 3 },
      { ...base, id: 3, months: 7 },
    ]);
    expect(ranges.length).toBe(2);
    expect(ranges[0].to_month).toBe(3);
    expect(ranges[1].from_month).toBe(7);
  });

  it('내용이 다르면 이어져도 안 묶인다', () => {
    const ranges = groupToRanges([
      { ...base, id: 1, months: 2, policy_type: '무이자' },
      { ...base, id: 2, months: 3, policy_type: '유이자', annual_rate: 15 },
    ]);
    expect(ranges.length).toBe(2);
  });

  it('적용 기간이 다르면 개월수가 이어져도 별개 구간이다', () => {
    const ranges = groupToRanges([
      { ...base, id: 1, months: 3, effective_from: '2026-01-01' },
      { ...base, id: 2, months: 2, effective_from: '2026-06-01' },
    ]);
    expect(ranges.length).toBe(2);

    const merged = groupToRanges([
      { ...base, id: 1, months: 3, effective_from: '2026-01-01' },
      { ...base, id: 2, months: 2, effective_from: '2026-01-01' },
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].from_month).toBe(2);
    expect(merged[0].to_month).toBe(3);
  });

  it('지문은 묶임을 결정하는 값만 본다', () => {
    expect(signatureOf({ ...base, id: 1 })).toEqual(signatureOf({ ...base, id: 99 }));
    expect(signatureOf({ ...base, memo: 'a' })).not.toEqual(signatureOf({ ...base, memo: 'b' }));
  });

  it('빈 입력을 견딘다', () => {
    expect(groupToRanges([]).length).toBe(0);
    expect(groupToRanges(null).length).toBe(0);
  });

  it('구간 이름은 한 달일 때와 여러 달일 때가 다르다', () => {
    expect(rangeLabel({ from_month: 3, to_month: 3 })).toBe('3개월');
    expect(rangeLabel({ from_month: 2, to_month: 6 })).toBe('2~6개월');
  });

  it('정책 종류마다 의미 있는 입력이 다르고 설명도 다르다', () => {
    expect(fieldsFor('무이자')).toEqual({ rate: false, free: false });
    expect(fieldsFor('부분무이자')).toEqual({ rate: true, free: true });
    expect(fieldsFor('유이자')).toEqual({ rate: true, free: false });
    expect(fieldsFor('없는종류')).toEqual({ rate: false, free: false });

    expect(describePolicy({ policy_type: '무이자', annual_rate: 0 })).toBe('무이자');
    expect(describePolicy({ policy_type: '유이자', annual_rate: 15 })).toBe('연 15%');
    expect(describePolicy({ policy_type: '부분무이자', annual_rate: 12, free_from_sequence: 4 })).toBe('4회차부터 면제, 그 전은 연 12%');

    expect(describePeriod({ effective_from: '2026-01-01', effective_to: '2026-12-31' })).toBe('2026-01-01 ~ 2026-12-31');
    expect(describePeriod({ effective_from: '2026-01-01', effective_to: null })).toBe('2026-01-01부터');
  });
});
