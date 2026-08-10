import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { searchCommands } from '../lib/commandSearch';
import Icon from './Icon';

// 메뉴·화면 검색 팔레트(#281 1단계).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 단축키만 두지 않는가
//
// 커맨드 팔레트는 통상 단축키로 연다. 그런데 **이 앱은 모바일 사용 비중이 있고**
// 모바일에는 Cmd+K 가 없다. 단축키만 두면 원래 요청("기능을 못 찾겠다")을 낸
// 상황에서 정작 못 쓰는 기능이 된다.
//
// 그래서 헤더 버튼을 함께 둔다. 단축키는 데스크톱의 지름길이지 유일한 입구가
// 아니다.
//
// ─────────────────────────────────────────────────────────────────────────
// 범위 (착수 시 결정, #281)
//
// **1단계만 한다** — 메뉴·화면 이름 검색.
//
// 2단계(동작 검색)는 동작 레지스트리가 필요해 별건이고, 3단계(데이터 검색)는
// 거래내역 화면의 가맹점·메모 필터와 겹친다. 이슈 본문도 중복 기능을 만들지
// 말라고 적어 뒀다.
// ─────────────────────────────────────────────────────────────────────────

export default function CommandPalette({ open, onClose }) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(() => searchCommands(query), [query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    // 열자마자 칠 수 있어야 한다. 한 번 더 눌러야 하면 단축키의 의미가 없다.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // 결과가 줄면 선택 위치가 목록 밖으로 나간다.
  useEffect(() => {
    setActive((i) => (i >= results.length ? 0 : i));
  }, [results.length]);

  // 선택 항목이 보이게 스크롤한다. 키보드로만 내리면 화면 밖으로 사라진다.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${active}"]`);
    // 옵셔널 호출이다. jsdom 에는 scrollIntoView 가 없고, 스크롤은 있으면 좋은
    // 것이지 없다고 팔레트가 죽을 일은 아니다.
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const go = (target) => {
    if (!target) return;
    navigate(target.path);
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/40"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="메뉴 검색"
        className="w-full max-w-lg bg-surface rounded-card shadow-card border border-line overflow-hidden"
      >
        {/* 돋보기 아이콘을 두지 않는다. icons/paths.js 에 search 가 없고 그 파일은
            "생성된 파일이므로 손으로 고치지 않는다" 로 못박혀 있다. 자리표시자
            문구가 같은 일을 한다. */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line-faint">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="화면 이름 또는 초성으로 찾기"
            aria-label="화면 검색"
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-caption"
          />
          <kbd className="hidden sm:inline text-[10px] text-caption border border-line rounded px-1">ESC</kbd>
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-6 text-sm text-caption text-center">
            찾는 화면이 없어요. 다른 말로 찾아보세요.
          </p>
        ) : (
          <ul ref={listRef} role="listbox" aria-label="검색 결과" className="max-h-72 overflow-y-auto py-1">
            {results.map((r, i) => (
              <li key={r.id} data-index={i}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm ${
                    i === active ? 'bg-brand-tint text-brand-text' : 'text-body hover:bg-surface-sunken'
                  }`}
                >
                  <Icon name={r.icon} size={15} />
                  <span className="flex-1 truncate">{r.label}</span>
                  {/* 어디에 있는 화면인지 함께 보여준다. '할부' 만으로는 위치를 모른다. */}
                  {r.group && <span className="text-[11px] text-caption shrink-0">{r.group}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
