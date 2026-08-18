import { describe, it, expect } from 'vitest';
import { capsToRows, rowsToCaps, datesToText, textToDates } from './benefitRuleForm';

describe('benefitRuleForm', () => {
  describe('capsToRows', () => {
    it('null과 빈 객체는 빈 배열을 반환한다', () => {
      expect(capsToRows(null)).toEqual([]);
      expect(capsToRows({})).toEqual([]);
    });

    it('값을 문자열로 반환한다', () => {
      const result = capsToRows({ caps: [{ window: 'month', amount: 5000 }] });
      expect(result).toEqual([{ window: 'month', amount: '5000', count: '' }]);
    });

    it('금액과 횟수를 같이 반환한다', () => {
      const result = capsToRows({ caps: [{ window: 'month', amount: 10000, count: 1 }] });
      expect(result).toEqual([{ window: 'month', amount: '10000', count: '1' }]);
    });
  });

  describe('rowsToCaps', () => {
    it('빈 줄을 버린다', () => {
      const result = rowsToCaps([
        { window: '', amount: '', count: '' },
        { window: 'month', amount: '5000', count: '' }
      ]);
      expect(result).toEqual({
        caps: [{ window: 'month', amount: 5000 }],
        error: null
      });
    });

    it('모두 비면 null을 반환한다', () => {
      expect(rowsToCaps([])).toEqual({ caps: null, error: null });
      expect(rowsToCaps([{ window: '', amount: '', count: '' }])).toEqual({ caps: null, error: null });
    });

    it('금액도 횟수도 없는 줄은 오류를 반환한다', () => {
      const result = rowsToCaps([{ window: 'month', amount: '', count: '' }]);
      expect(result.caps).toBeNull();
      expect(typeof result.error).toBe('string');
    });

    it('모르는 창은 오류를 반환한다', () => {
      const result = rowsToCaps([{ window: 'weekly', amount: '5000', count: '' }]);
      expect(typeof result.error).toBe('string');
    });

    it('잘못된 횟수는 오류를 반환한다', () => {
      const result1 = rowsToCaps([{ window: 'month', amount: '5000', count: '0' }]);
      expect(typeof result1.error).toBe('string');

      const result2 = rowsToCaps([{ window: 'month', amount: '5000', count: '1.5' }]);
      expect(typeof result2.error).toBe('string');
    });

    it('같은 창이 두 번이면 오류를 반환한다', () => {
      const result = rowsToCaps([
        { window: 'month', amount: '5000', count: '' },
        { window: 'month', amount: '3000', count: '' }
      ]);
      expect(typeof result.error).toBe('string');
      expect(result.error).toContain('month');
    });

    it('횟수를 저장 형식에 실어 낸다', () => {
      const result1 = rowsToCaps([{ window: 'month', amount: '10000', count: '1' }]);
      expect(result1).toEqual({
        caps: [{ window: 'month', amount: 10000, count: 1 }],
        error: null
      });

      const result2 = rowsToCaps([{ window: 'day', amount: '', count: '2' }]);
      expect(result2).toEqual({
        caps: [{ window: 'day', count: 2 }],
        error: null
      });
    });
  });

  describe('datesToText', () => {
    it('날짜를 문자열로 연결한다', () => {
      const result = datesToText({ when: { dates: ['10-01', '06-06'] } });
      expect(result).toBe('10-01, 06-06');
    });

    it('없으면 빈 문자열을 반환한다', () => {
      expect(datesToText(null)).toBe('');
    });
  });

  describe('textToDates', () => {
    it('공백과 빈 조각을 버린다', () => {
      const result = textToDates(' 10-01 ,, 06-06 ');
      expect(result).toEqual({ dates: ['10-01', '06-06'], error: null });
      
      expect(textToDates('')).toEqual({ dates: null, error: null });
      expect(textToDates('  ')).toEqual({ dates: null, error: null });
    });

    it('틀린 날짜를 막는다', () => {
      const result1 = textToDates('10/1');
      expect(typeof result1.error).toBe('string');

      const result2 = textToDates('13-01');
      expect(typeof result2.error).toBe('string');

      const result3 = textToDates('02-30');
      expect(typeof result3.error).toBe('string');

      const result4 = textToDates('02-29'); // 윤년
      expect(result4.error).toBeNull();

      const result5 = textToDates('10-01, 10-01');
      expect(typeof result5.error).toBe('string');
    });
  });
});
