import { describe, it, expect } from 'vitest';
import { fieldName, FIELD_LABELS } from './auditFormat';
import { formatSince } from './backupStatus';
import { ruleToForm } from './recurringForm';

describe('감사 로그 필드 이름', () => {
  it('아는 키는 사람 말로 바꾼다', () => {
    expect(fieldName('amount')).toBe('금액');
    expect(fieldName('merchant')).toBe('가맹점');
  });

  it('모르는 키는 키 그대로 보여준다', () => {
    expect(FIELD_LABELS.some_new_column).toBeUndefined();
    expect(fieldName('some_new_column')).toBe('some_new_column');
  });
});

describe('마지막 내보내기 경과 시간', () => {
  it('시각이 미래여도 «방금» 으로 말한다', () => {
    const now = Date.parse('2026-03-10T12:00:00Z');
    const future = new Date(now + 30 * 60 * 1000).toISOString();
    expect(formatSince(future, now)).toBe('방금');
  });

  it('1분이 안 됐으면 «방금» 이다', () => {
    const now = Date.parse('2026-03-10T12:00:00Z');
    const justNow = new Date(now - 30 * 1000).toISOString();
    expect(formatSince(justNow, now)).toBe('방금');
  });
});

describe('반복 규칙 폼 기본값', () => {
  it('간격이 없으면 1 로 채운다', () => {
    const form = ruleToForm({ merchant: '넷플릭스' });
    expect(form.interval).toBe('1');
  });

  it('주기가 없으면 monthly 로 채운다', () => {
    const form = ruleToForm({ merchant: '넷플릭스' });
    expect(form.freq).toBe('monthly');
  });

  it('결제방식이 없으면 일시불로 채운다', () => {
    const form = ruleToForm({ merchant: '넷플릭스' });
    expect(form.payment_style).toBe('일시불');
  });
});
