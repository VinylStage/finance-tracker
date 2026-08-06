import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EXPORT_KINDS, recordExport, readExport, withObjectParticle, formatSince } from './backupStatus';

// 마지막 내보내기 시각(#198). 커버리지가 28.94% 였다.
//
// 이 값은 "데이터가 백업된 시각" 이 아니라 **"이 브라우저에서 내보내기를 누른
// 시각"** 이다. 신뢰를 주려는 화면이라 사실보다 큰 주장을 하면 역효과다.
// 그래서 여기서는 값이 없거나 못 읽는 경우가 정상 경로만큼 중요하다.

describe('내보내기 시각 기록', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('기록하면 읽힌다', () => {
    expect(recordExport('transactions', '2026-08-06T01:00:00.000Z')).toBe(true);
    expect(readExport('transactions')).toBe('2026-08-06T01:00:00.000Z');
  });

  it('종류마다 따로 남는다', () => {
    // 한 칸에 몰아 쓰면 거래내역만 내보냈는데 설정도 내보낸 것처럼 보인다.
    recordExport('transactions', '2026-08-06T01:00:00.000Z');
    recordExport('settings', '2026-08-06T02:00:00.000Z');
    expect(readExport('transactions')).toBe('2026-08-06T01:00:00.000Z');
    expect(readExport('settings')).toBe('2026-08-06T02:00:00.000Z');
  });

  it('모르는 종류는 저장하지 않고 false', () => {
    expect(recordExport('아무거나', '2026-08-06T01:00:00.000Z')).toBe(false);
    expect(window.localStorage.getItem('ft.lastExport.아무거나')).toBeNull();
  });

  it('기록이 없으면 null', () => {
    expect(readExport('data')).toBeNull();
  });
});

describe('localStorage 가 막힌 환경', () => {
  it('저장이 막혀도 false 만 돌려주고 죽지 않는다', () => {
    // 표시가 안 될 뿐 내보내기 자체는 성공한 것이다. 여기서 던지면
    // 내보내기가 실패한 것처럼 보인다.
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(recordExport('data', '2026-08-06T01:00:00.000Z')).toBe(false);
    spy.mockRestore();
  });

  it('읽기가 막히면 null', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readExport('data')).toBeNull();
    spy.mockRestore();
  });
});

// 화면 문구가 `${label}을` 로 하드코딩돼 있어서 '전체 데이터을' 이 실제로 나왔다.
// 라벨이 늘어날 때마다 반복될 문제라 판정을 한 곳에 모았다 — 그 판정을 여기서 잠근다.
describe('withObjectParticle — 받침 판정', () => {
  it('받침이 있으면 을', () => {
    expect(withObjectParticle('설정')).toBe('설정을');
    expect(withObjectParticle('거래내역')).toBe('거래내역을');
  });

  it('받침이 없으면 를', () => {
    expect(withObjectParticle('전체 데이터')).toBe('전체 데이터를');
  });

  it('EXPORT_KINDS 세 라벨이 전부 자연스럽게 붙는다', () => {
    const values = Object.values(EXPORT_KINDS);
    for (const value of values) {
      const result = withObjectParticle(value);
      expect(result).toMatch(/을|를$/);
      expect(result.slice(0, -1)).toBe(value);
    }
  });

  it('한글이 아니거나 비어 있으면 를 (또는 그대로)', () => {
    expect(withObjectParticle('CSV')).toBe('CSV를');
    expect(withObjectParticle('2026')).toBe('2026를');
    expect(withObjectParticle('')).toBe('');
    expect(withObjectParticle(null)).toBe('');
    expect(withObjectParticle(undefined)).toBe('');
  });
});

// 경과 표현. 7일이 넘으면 상대 표현이 오히려 감이 안 와서 날짜로 바뀐다.
// 경계(1분·60분·24시간·7일)가 어긋나면 "60분 전" 과 "1시간 전" 이 같은 시점에
// 다르게 찍힌다.
describe('formatSince — 경과 표현', () => {
  const NOW = Date.parse('2026-08-06T12:00:00.000Z');

  it('1분 미만은 방금', () => {
    expect(formatSince('2026-08-06T12:00:00.000Z', NOW)).toBe('방금');
    expect(formatSince('2026-08-06T11:59:30.000Z', NOW)).toBe('방금');
  });

  it('분·시간·일 단위로 올라간다', () => {
    expect(formatSince('2026-08-06T11:30:00.000Z', NOW)).toBe('30분 전');
    expect(formatSince('2026-08-06T09:00:00.000Z', NOW)).toBe('3시간 전');
    expect(formatSince('2026-08-04T12:00:00.000Z', NOW)).toBe('2일 전');
  });

  it('경계에서 단위가 바뀐다', () => {
    expect(formatSince('2026-08-06T11:01:00.000Z', NOW)).toBe('59분 전');
    expect(formatSince('2026-08-06T11:00:00.000Z', NOW)).toBe('1시간 전');
    expect(formatSince('2026-08-05T13:00:00.000Z', NOW)).toBe('23시간 전');
    expect(formatSince('2026-08-05T12:00:00.000Z', NOW)).toBe('1일 전');
  });

  it('7일까지는 상대 표현, 넘으면 날짜', () => {
    expect(formatSince('2026-07-30T12:00:00.000Z', NOW)).toBe('7일 전');
    expect(formatSince('2026-07-29T12:00:00.000Z', NOW)).toBe('2026-07-29');
  });

  it('미래로 계산되면 방금', () => {
    expect(formatSince('2026-08-06T13:00:00.000Z', NOW)).toBe('방금');
  });

  it('값이 없거나 못 읽으면 null', () => {
    expect(formatSince(null, NOW)).toBeNull();
    expect(formatSince(undefined, NOW)).toBeNull();
    expect(formatSince('', NOW)).toBeNull();
    expect(formatSince('어제', NOW)).toBeNull();
  });
});
