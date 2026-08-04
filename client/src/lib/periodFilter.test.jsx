import { describe, it, expect } from 'vitest';
import {
  PRESETS, MAX_FUTURE_DAYS, rangeForPreset, rangeForMonth, validateRange,
  parsePeriodQuery, toPeriodQuery, periodLabel, monthShorthand,
} from './periodFilter';

// 전역 기간 필터(#272).
//
// **이 파일이 지키는 것은 두 가지다.**
//
//   1. 프리셋이 전부 달 경계에 맞는다 — 반쪽짜리 달이 집계에 섞이면 사용자는
//      6월 합계가 왜 작은지 알 수 없다
//   2. URL 왕복이 손실 없다 — 새로고침·뒤로가기·북마크가 다 여기에 걸려 있다
//
// 오늘을 인자로 받는다. 실제 오늘에 의존하면 8월 31일에만 깨지는 테스트가 된다.

const TODAY = '2026-08-04';

describe('A. 프리셋은 달 경계에 맞는다', () => {
  it('A-1. 이번 달은 1일부터 말일까지다', () => {
    expect(rangeForPreset('this-month', TODAY)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('A-2. 지난 달', () => {
    expect(rangeForPreset('last-month', TODAY)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('A-3. 최근 3개월은 이번 달을 포함한다', () => {
    // 이번 달을 빼면 오늘 쓴 돈이 "최근 3개월" 에 안 잡힌다.
    expect(rangeForPreset('last-3-months', TODAY)).toEqual({ from: '2026-06-01', to: '2026-08-31' });
  });

  it('A-4. 올해', () => {
    expect(rangeForPreset('this-year', TODAY)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('A-5. 직접 지정과 모르는 키는 범위를 안 만든다', () => {
    expect(rangeForPreset('custom', TODAY)).toBeNull();
    expect(rangeForPreset('nope', TODAY)).toBeNull();
  });

  it('A-6. 모든 프리셋이 목록에 있다', () => {
    // 목록과 구현이 갈라지면 화면에 버튼은 있는데 눌러도 아무 일이 없다.
    for (const p of PRESETS) {
      if (p.key === 'custom') continue;
      expect(rangeForPreset(p.key, TODAY), p.key).not.toBeNull();
    }
  });
});

describe('B. 달 경계 — 말일·윤년·연말', () => {
  it('B-1. 2월 말일이 그 해에 맞는다', () => {
    expect(rangeForPreset('this-month', '2026-02-10').to).toBe('2026-02-28');
    expect(rangeForPreset('this-month', '2028-02-10').to).toBe('2028-02-29');
  });

  it('B-2. 31일에 지난 달을 물어도 30일 달이 안 깨진다', () => {
    // 5/31 의 지난 달은 4/1~4/30 이다. 날짜를 그대로 빼면 4/31 이 나온다.
    expect(rangeForPreset('last-month', '2026-05-31')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('B-3. 3/31 의 지난 달은 2월 말일로 접힌다', () => {
    expect(rangeForPreset('last-month', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('B-4. 연초에 지난 달·최근 3개월이 전년으로 넘어간다', () => {
    expect(rangeForPreset('last-month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(rangeForPreset('last-3-months', '2026-01-15')).toEqual({ from: '2025-11-01', to: '2026-01-31' });
  });

  it('B-5. 12월 31일에도 이번 달이 그 달 안에 있다', () => {
    expect(rangeForPreset('this-month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('B-6. 잘못된 오늘은 던진다', () => {
    // 조용히 오늘로 떨어지면 호출부 버그가 안 보인다.
    expect(() => rangeForPreset('this-month', '2026-8-4')).toThrow(TypeError);
  });
});

describe('C. 월 단축형', () => {
  it('C-1. YYYY-MM 을 그 달 전체로 편다', () => {
    expect(rangeForMonth('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(rangeForMonth('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('C-2. 형식이 아니거나 없는 달은 null 이다', () => {
    for (const bad of ['2026-13', '2026-00', '2026-1', '202602', '', null, undefined]) {
      expect(rangeForMonth(bad), String(bad)).toBeNull();
    }
  });

  it('C-3. 달 전체와 정확히 같을 때만 단축형으로 줄인다', () => {
    expect(monthShorthand({ from: '2026-02-01', to: '2026-02-28' })).toBe('2026-02');
    expect(monthShorthand({ from: '2026-02-01', to: '2026-02-27' })).toBeNull();
    expect(monthShorthand({ from: '2026-02-02', to: '2026-02-28' })).toBeNull();
    expect(monthShorthand({ from: '2026-01-01', to: '2026-12-31' })).toBeNull();
  });
});

describe('D. 검증 — 문구는 사용자 말로', () => {
  it('D-1. 시작이 종료보다 뒤면 막는다', () => {
    const msg = validateRange('2026-08-31', '2026-08-01', TODAY);
    expect(msg).toContain('시작일이 종료일보다 뒤');
    // 무엇을 해야 하는지 준다(VOICE_TONE_GUIDE 원칙 1).
    expect(msg).toContain('바꿔 주세요');
  });

  it('D-2. 형식 오류는 예시를 준다', () => {
    const msg = validateRange('2026-8-4', '2026-08-31', TODAY);
    expect(msg).toContain('2026-08-04 처럼');
  });

  it('D-3. 미래를 너무 멀리 잡으면 상한을 알려준다', () => {
    const msg = validateRange('2026-08-01', '2099-12-31', TODAY);
    expect(msg).toContain('2027-08-05');
  });

  it('D-4. 상한 안쪽 미래는 통과한다', () => {
    // 할부·반복거래가 미래로 뻗는다. 미래 자체는 정상이다.
    expect(validateRange('2026-08-01', '2027-01-31', TODAY)).toBeNull();
  });

  it('D-5. 같은 날 하루짜리는 통과한다', () => {
    expect(validateRange('2026-08-04', '2026-08-04', TODAY)).toBeNull();
  });

  it('D-6. 문구에 내부 값이 없다', () => {
    for (const args of [['2026-08-31', '2026-08-01'], ['x', 'y'], ['2026-08-01', '2099-01-01']]) {
      const msg = validateRange(args[0], args[1], TODAY);
      expect(msg).toMatch(/[가-힣]/);
      expect(msg).not.toMatch(/from|to|Invalid|undefined/);
    }
  });
});

describe('E. URL 왕복', () => {
  it('E-1. 비면 이번 달이다', () => {
    const p = parsePeriodQuery('', TODAY);
    expect(p).toEqual({ from: '2026-08-01', to: '2026-08-31', preset: 'this-month', includeDerived: true, invalid: null });
  });

  it('E-2. from/to 를 그대로 읽는다', () => {
    const p = parsePeriodQuery('?from=2026-03-05&to=2026-04-10', TODAY);
    expect(p.from).toBe('2026-03-05');
    expect(p.to).toBe('2026-04-10');
    expect(p.preset).toBe('custom');
  });

  it('E-3. 프리셋과 같은 기간이면 그 버튼이 눌린 것으로 본다', () => {
    // URL 로 들어온 기간이 "지난 달" 과 같으면 버튼이 눌려 있어야 한다.
    const p = parsePeriodQuery('?from=2026-07-01&to=2026-07-31', TODAY);
    expect(p.preset).toBe('last-month');
  });

  it('E-4. month 단축형을 편다', () => {
    const p = parsePeriodQuery('?month=2026-02', TODAY);
    expect(p.from).toBe('2026-02-01');
    expect(p.to).toBe('2026-02-28');
  });

  it('E-5. 주소창을 손으로 고쳐도 안 깨진다', () => {
    // 던지면 화면이 통째로 죽는다. 기본값으로 떨어지고 이유를 싣는다.
    for (const bad of ['?from=말도안됨&to=x', '?from=2026-12-01&to=2026-01-01', '?month=2026-99']) {
      const p = parsePeriodQuery(bad, TODAY);
      expect(p.from, bad).toBe('2026-08-01');
      expect(p.preset, bad).toBe('this-month');
    }
  });

  it('E-6. 잘못된 기간은 이유를 함께 준다', () => {
    const p = parsePeriodQuery('?from=2026-12-01&to=2026-01-01', TODAY);
    expect(p.invalid).toContain('시작일이 종료일보다 뒤');
  });

  it('E-7. 파생 거래 기본값은 포함이다', () => {
    // #269 가 B안 확정 — 파생 행이 실제 지출 기록 그 자체다. 빼면 할부 지출이
    // 합계에서 통째로 사라진다.
    expect(parsePeriodQuery('', TODAY).includeDerived).toBe(true);
    expect(parsePeriodQuery('?derived=on', TODAY).includeDerived).toBe(true);
    expect(parsePeriodQuery('?derived=off', TODAY).includeDerived).toBe(false);
  });

  it('E-8. 기본 기간이면 URL 을 더럽히지 않는다', () => {
    expect(toPeriodQuery({ from: '2026-08-01', to: '2026-08-31' }, TODAY)).toBe('');
  });

  it('E-9. 프리셋도 from/to 로 환원해 싣는다', () => {
    // ?preset=this-month 만 실으면 어제 북마크한 링크가 오늘 다른 기간을 가리킨다.
    const q = toPeriodQuery(rangeForPreset('last-month', TODAY), TODAY);
    expect(q).toBe('?from=2026-07-01&to=2026-07-31');
    expect(q).not.toContain('preset');
  });

  it('E-10. 쓴 것을 다시 읽으면 같은 값이 나온다', () => {
    for (const state of [
      { from: '2026-03-05', to: '2026-04-10', includeDerived: true },
      { from: '2026-07-01', to: '2026-07-31', includeDerived: false },
      { from: '2026-08-01', to: '2026-08-31', includeDerived: false },
    ]) {
      const back = parsePeriodQuery(toPeriodQuery(state, TODAY), TODAY);
      expect({ from: back.from, to: back.to, includeDerived: back.includeDerived }, JSON.stringify(state))
        .toEqual(state);
    }
  });

  it('E-11. 앞의 ? 가 있든 없든 읽는다', () => {
    expect(parsePeriodQuery('from=2026-03-05&to=2026-04-10', TODAY).from).toBe('2026-03-05');
  });
});

describe('F. 라벨', () => {
  it('F-1. 프리셋은 이름으로 보인다', () => {
    expect(periodLabel({ preset: 'this-month', from: '2026-08-01', to: '2026-08-31' })).toBe('이번 달');
  });

  it('F-2. 직접 지정은 날짜 범위로 보인다', () => {
    expect(periodLabel({ preset: 'custom', from: '2026-03-05', to: '2026-04-10' }))
      .toBe('2026-03-05 ~ 2026-04-10');
  });

  it('F-3. 모르는 프리셋도 날짜로 떨어진다', () => {
    expect(periodLabel({ preset: 'nope', from: '2026-03-05', to: '2026-04-10' }))
      .toBe('2026-03-05 ~ 2026-04-10');
  });
});

describe('G. 상한 상수', () => {
  it('G-1. 미래 상한이 1년쯤이다', () => {
    // 할부가 보통 최장 36개월이지만, 조회 기본 상한은 1년으로 둔다.
    // 이 값이 조용히 0 이나 100000 이 되면 D-3·D-4 의 뜻이 사라진다.
    expect(MAX_FUTURE_DAYS).toBeGreaterThanOrEqual(365);
    expect(MAX_FUTURE_DAYS).toBeLessThanOrEqual(400);
  });
});
