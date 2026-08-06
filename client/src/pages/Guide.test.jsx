import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Guide from './Guide';

// 앱 안에서 보는 사용 설명서. 테스트가 하나도 없었다.
//
// 서버가 docs/GUIDE.md 를 **마크다운 텍스트 그대로** 내려주고 이 화면이 그린다.
// 다른 화면과 달리 JSON 이 아니라 문자열을 받는 유일한 자리라, 응답을 객체로
// 다루는 순간 조용히 빈 화면이 된다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const settled = () => waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());

beforeEach(() => {
  vi.clearAllMocks();
});

describe('문서 표시', () => {
  it('가이드를 받아 마크다운으로 그린다', async () => {
    get.mockResolvedValue('# 시작하기\n\n첫 거래를 넣어 보세요.');
    render(<Guide />);
    await settled();

    expect(get).toHaveBeenCalledWith('/api/guide');
    // 원문 그대로 뿌리면 '# 시작하기' 가 글자로 보인다. 제목으로 그려져야 한다.
    expect(screen.getByRole('heading', { name: '시작하기' })).toBeTruthy();
    expect(screen.getByText('첫 거래를 넣어 보세요.')).toBeTruthy();
  });

  it('목록과 강조도 마크다운으로 처리한다', async () => {
    get.mockResolvedValue('- 첫째\n- 둘째\n\n**중요한 것**');
    render(<Guide />);
    await settled();

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('중요한 것').tagName).toBe('STRONG');
  });

  it('링크는 눌리는 링크로 그린다', async () => {
    get.mockResolvedValue('[설정으로](/settings)');
    render(<Guide />);
    await settled();

    const link = screen.getByRole('link', { name: '설정으로' });
    expect(link.getAttribute('href')).toBe('/settings');
  });

  it('문서가 비어 있어도 화면은 뜬다', async () => {
    get.mockResolvedValue('');
    render(<Guide />);
    await settled();

    // 빈 문자열에서 렌더가 죽으면 가이드 메뉴 자체가 못 쓰게 된다.
    expect(screen.getByRole('heading', { name: '가이드' })).toBeTruthy();
  });
});

describe('불러오기 실패', () => {
  it('사유를 화면에 남긴다', async () => {
    get.mockRejectedValue(new Error('404'));
    render(<Guide />);
    await settled();

    // 로딩만 걷히고 아무것도 없으면 화면이 고장 난 것으로 읽힌다.
    expect(screen.getByText('가이드 문서를 불러오지 못했습니다.')).toBeTruthy();
  });

  it('실패해도 로딩 상태에 갇히지 않는다', async () => {
    get.mockRejectedValue(new Error('네트워크'));
    render(<Guide />);

    // finally 가 빠지면 '로딩 중...' 인 채로 영영 멈춘다.
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    expect(screen.getByRole('heading', { name: '가이드' })).toBeTruthy();
  });

  // '실패하면 본문을 안 그린다' 는 여기서 잠글 수 없다. 성공했을 때만 content 가
  // 채워지므로 실패 경로에서는 content 가 늘 빈 문자열이고, 삼항을 없애 둘을
  // 함께 그려도 화면 결과가 같다. 돌연변이로 확인했다 — 등가 변이다.
  //
  // 마찬가지로 마크다운 링크의 커스텀 컴포넌트를 지워도 안 잡힌다. 지워도
  // ReactMarkdown 이 평범한 <a href> 를 그려서 역할과 주소는 그대로고, 달라지는
  // 것은 className 뿐이다. 스타일까지 테스트로 붙들 자리는 아니라고 봤다.
});
