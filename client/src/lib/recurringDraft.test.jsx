import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { putRecurringDraft, takeRecurringDraft } from './recurringDraft';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('A. 주고받기', () => {
  it('A-1. 넣은 값을 그대로 꺼낸다', () => {
    putRecurringDraft({ merchant: '넷플릭스', amount: '9900' });
    expect(takeRecurringDraft()).toEqual({ merchant: '넷플릭스', amount: '9900' });
  });

  it('A-2. 한 번 꺼내면 사라진다', () => {
    // 안 지우면 다음에 설정 화면을 그냥 열었을 때 지난 초안이 떠 있다.
    putRecurringDraft({ merchant: '넷플릭스' });
    takeRecurringDraft();
    expect(takeRecurringDraft()).toBe(null);
  });

  it('A-3. 넣은 적 없으면 null 이다', () => {
    expect(takeRecurringDraft()).toBe(null);
  });
});

describe('B. 사생활', () => {
  it('B-1. 값이 주소에 안 남는다', () => {
    // 가계부라 가맹점·메모가 곧 사생활이다. 주소창과 방문 기록에 남으면 안 된다.
    putRecurringDraft({ merchant: '비밀상호', memo: '비밀메모' });
    expect(window.location.href).not.toContain('비밀상호');
    expect(window.location.search).toBe('');
  });
});

describe('C. 망가진 상태', () => {
  it('C-1. 깨진 값이 들어 있으면 없던 것으로 보고 지운다', () => {
    sessionStorage.setItem('recurring-draft', '{깨짐');
    expect(takeRecurringDraft()).toBe(null);
    expect(sessionStorage.getItem('recurring-draft')).toBe(null);
  });

  it('C-2. 객체가 아닌 값은 받지 않는다', () => {
    sessionStorage.setItem('recurring-draft', '"문자열"');
    expect(takeRecurringDraft()).toBe(null);
  });

  it('C-3. 저장소를 못 쓰면 false 를 돌려주고 화면은 죽지 않는다', () => {
    // 사파리 프라이빗 모드에서 setItem 이 던진다.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    expect(putRecurringDraft({ merchant: 'x' })).toBe(false);
  });

  it('C-4. 읽기가 던져도 null 로 넘어간다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(takeRecurringDraft()).toBe(null);
  });
});
