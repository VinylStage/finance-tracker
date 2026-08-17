// @vitest-environment jsdom
//
// `src/lib` 는 기본이 node 환경이다(#619). 이 파일은 브라우저 API 를 만지므로
// 스스로 jsdom 을 요청한다. 목록으로 빼지 않고 여기 적는 이유는, 목록은 파일이
// 늘거나 성격이 바뀔 때 같이 안 고쳐지기 때문이다.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { putCardEditRequest, takeCardEditRequest } from './cardEditRequest';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('A. 주고받기', () => {
  it('A-1. 넣은 값을 그대로 꺼낸다', () => {
    putCardEditRequest(3);
    expect(takeCardEditRequest()).toBe(3);
  });

  it('A-2. 한 번 꺼내면 사라진다', () => {
    // 안 지우면 다음에 설정 화면을 그냥 열었을 때 지난 요청이 살아나 엉뚱한 카드의 폼이 펼쳐진다.
    putCardEditRequest(3);
    takeCardEditRequest();
    expect(takeCardEditRequest()).toBe(null);
  });

  it('A-3. 넣은 적 없이 꺼내면 null 이다', () => {
    expect(takeCardEditRequest()).toBe(null);
  });
});

describe('B. 입력값 검증', () => {
  it('B-1. 숫자 문자열을 넣어도 숫자로 받는다', () => {
    putCardEditRequest('7');
    expect(takeCardEditRequest()).toBe(7);
  });

  it('B-2. 0 은 유효하지 않은 카드 id 이다', () => {
    expect(putCardEditRequest(0)).toBe(false);
    expect(takeCardEditRequest()).toBe(null);
  });

  it('B-3. 음수는 유효하지 않은 카드 id 이다', () => {
    expect(putCardEditRequest(-1)).toBe(false);
    expect(takeCardEditRequest()).toBe(null);
  });

  it('B-4. 소수는 유효하지 않은 카드 id 이다', () => {
    expect(putCardEditRequest(1.5)).toBe(false);
    expect(takeCardEditRequest()).toBe(null);
  });

  it('B-5. undefined 는 유효하지 않은 카드 id 이다', () => {
    expect(putCardEditRequest(undefined)).toBe(false);
    expect(takeCardEditRequest()).toBe(null);
  });

  it('B-6. 숫자가 아닌 문자열은 유효하지 않은 카드 id 이다', () => {
    expect(putCardEditRequest('abc')).toBe(false);
    expect(takeCardEditRequest()).toBe(null);
  });

  it('B-7. put 성공 시 true 를 돌려준다', () => {
    expect(putCardEditRequest(3)).toBe(true);
  });
});

describe('C. 사생활', () => {
  it('C-1. 값이 주소에 안 남는다', () => {
    // 카드 id 이므로 가계부의 가맹점·메모처럼 사생활은 아니다.
    // putCardEditRequest 는 sessionStorage 에만 저장하므로 URL 은 변경되지 않는다.
    putCardEditRequest(3);
    // 테스트 코드에서 window.location.href 를 확인할 수는 있지만,
    // 실제 동작에서는 URL 이 바뀌지 않음을 확인한다.
    expect(window.location.href).toBe('http://localhost:3000/');
    expect(window.location.search).toBe('');
  });
});

describe('D. 망가진 상태', () => {
  it('D-1. 깨진 값이 들어 있으면 없던 것으로 보고 지운다', () => {
    sessionStorage.setItem('card-edit-request', 'abc');
    expect(takeCardEditRequest()).toBe(null);
    expect(sessionStorage.getItem('card-edit-request')).toBe(null);
  });

  it('D-2. 정수가 아닌 값이 들어 있으면 없던 것으로 보고 지운다', () => {
    sessionStorage.setItem('card-edit-request', '1.5');
    expect(takeCardEditRequest()).toBe(null);
    expect(sessionStorage.getItem('card-edit-request')).toBe(null);
  });

  it('D-3. 읽기가 던져도 null 로 넘어간다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(takeCardEditRequest()).toBe(null);
  });

  it('D-4. 저장소가 고장 났을 때도 깨진 값을 지우려 시도한다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem');
    takeCardEditRequest();
    expect(removeSpy).toHaveBeenCalledWith('card-edit-request');
  });
});
