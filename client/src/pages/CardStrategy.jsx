import React, { useState } from 'react';
import { Link } from 'wouter';
import { api } from '../lib/api';
import { localYMD } from '../lib/date';
import { useLoader } from '../hooks/useLoader';
import LoadError from '../components/LoadError';
import { formatWon } from '../lib/format';
import { comparisonView, thresholdLine } from '../lib/cardStrategyView';

// 카드 전략 화면(#277).
//
// 문구는 전부 lib/cardStrategyView.js 에 있다. 여기서 짓지 않는다 — 한곳에
// 모여 있어야 회귀 테스트가 전수로 훑는다.
//
// **이 화면이 지켜야 할 것은 전제다.** 차액은 "지금 카드 정보로 다시 계산한
// 값" 이지 "놓친 돈" 이 아니다. 결과 숫자만 크게 띄우고 단서를 접어 두면
// 사용자는 자기 과거 선택을 잘못 판단한다. 그래서 단서(notices)는 접히지
// 않는다.

const RANGES = [
  { key: 3, label: '최근 3개월' },
  { key: 6, label: '최근 6개월' },
  { key: 12, label: '최근 12개월' },
];

function monthsAgo(n) {
  const d = new Date();
  return localYMD(new Date(d.getFullYear(), d.getMonth() - n, d.getDate()));
}

// 상태 라벨은 색과 **함께** 글자로 낸다(#191). 색만으로 구분하면 색을 구별
// 못 하는 사용자에게는 아무 정보가 없다.
const TONE_STYLE = {
  ok: 'bg-brand-tint text-brand-text',
  warn: 'bg-warn-tint text-warn-text',
  neutral: 'bg-surface-page text-caption',
};

function Section({ title, children }) {
  return (
    <div className="bg-surface shadow-card rounded-card p-5 border border-line">
      <h2 className="text-sm font-semibold text-body mb-4">{title}</h2>
      {children}
    </div>
  );
}

// 전제를 결과 옆에 세운다. 접거나 흐리게 하지 않는다.
function Notices({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="mt-4 space-y-1.5 border-t border-line pt-3" aria-label="계산 전제">
      {items.map((text) => (
        <li key={text} className="text-xs text-caption leading-relaxed">
          {text}
        </li>
      ))}
    </ul>
  );
}

// 빈 상태는 다음 행동을 말한다(VOICE_TONE_GUIDE 원칙 3).
function EmptyState({ headline, notices, action }) {
  return (
    <div className="py-6">
      <p className="text-sm text-body leading-relaxed">{headline}</p>
      {action}
      <Notices items={notices} />
    </div>
  );
}

const settingsLink = (
  <Link
    href="/settings"
    className="inline-block mt-3 text-sm text-brand-text border border-line rounded-control px-4 py-2 hover:bg-surface-page transition-colors"
  >
    설정에서 카드 등록
  </Link>
);

function ThresholdRow({ card }) {
  const line = thresholdLine(card);
  if (!line) return null;

  // 더 안 쓰기로 한 카드(#410). 감추지 않고 흐리게 둔다 — 지난달 그 카드로 쓴
  // 실적이 여기 있는데 목록에서 사라지면 사용자는 숫자가 어디 갔는지 모른다.
  // 대신 "지금 이 카드를 쓰라" 로 읽히지 않게 표시를 붙인다.
  const inactive = card.isActive === false;

  return (
    <li
      className={`py-3 border-b border-line last:border-0${inactive ? ' opacity-60' : ''}`}
      data-testid={inactive ? 'inactive-threshold-row' : undefined}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-sm font-medium ${inactive ? 'text-caption' : 'text-ink'}`}>
          {card.productName}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-control ${TONE_STYLE[line.tone]}`}>
          {line.label}
        </span>
        {inactive && (
          <span className="text-xs px-2 py-0.5 rounded-control bg-surface-sunken text-caption">
            더 안 쓰는 카드
          </span>
        )}
      </div>
      <p className="text-xs text-caption mt-1 leading-relaxed">{line.text}</p>
      {inactive && (
        <p className="text-[11px] text-caption mt-1">
          새 거래에서 고를 수 없어요. 지난 실적은 그대로 보여드려요.
        </p>
      )}
    </li>
  );
}

export default function CardStrategy() {
  const [months, setMonths] = useState(3);
  const [comparison, setComparison] = useState(null);
  const [thresholds, setThresholds] = useState([]);

  const { loading, error, reload } = useLoader(async () => {
    const [c, t] = await Promise.all([
      api.get(`/api/card-strategy/comparison?from=${monthsAgo(months)}&to=${localYMD()}`),
      api.get('/api/card-strategy/thresholds'),
    ]);
    setComparison(c);
    setThresholds(t.data || []);
  }, [months]);

  // 최초 로드 실패만 전면 에러다(useLoader 계약).
  if (error) return <LoadError error={error} onRetry={reload} />;

  const view = comparisonView({ loading, data: comparison });

  return (
    <div className="space-y-4">
      <Section title="전월 실적">
        {loading && <p className="text-sm text-caption py-4">불러오는 중</p>}
        {!loading && thresholds.length === 0 && (
          <EmptyState
            headline="아직 등록한 카드가 없어요. 카드를 등록하면 어느 카드가 유리한지 비교할 수 있어요."
            action={settingsLink}
          />
        )}
        {!loading && thresholds.length > 0 && (
          <ul>
            {/* 쓰는 카드를 위로 모은다. 섞여 있으면 지금 고를 수 있는 카드가
                무엇인지 매번 읽어야 한다. 순서만 바꾸고 감추지는 않는다. */}
            {[...thresholds]
              .sort((a, b) => (a.isActive === false ? 1 : 0) - (b.isActive === false ? 1 : 0))
              .map((c) => (
                <ThresholdRow key={c.cardProductId} card={c} />
              ))}
          </ul>
        )}
      </Section>

      <Section title="지난 결제 다시 계산">
        <div className="flex gap-2 mb-4" role="group" aria-label="기간 선택">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setMonths(r.key)}
              aria-pressed={months === r.key}
              className={`text-xs px-3 py-1.5 rounded-control border transition-colors ${
                months === r.key
                  ? 'border-brand-text text-brand-text bg-brand-tint'
                  : 'border-line text-caption hover:bg-surface-page'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {view.state === 'loading' && <p className="text-sm text-caption py-4">불러오는 중</p>}

        {view.state === 'error' && <p className="text-sm text-loss-text py-4">{view.headline}</p>}

        {['single-card', 'unknown-cards', 'no-transactions'].includes(view.state) && (
          <EmptyState
            headline={view.headline}
            notices={view.notices}
            action={view.state === 'single-card' || view.state === 'unknown-cards' ? settingsLink : null}
          />
        )}

        {view.state === 'ok' && (
          <div>
            {/* 금액은 꾸미지 않는다(원칙 5). 감탄사·이모지를 붙이지 않는다. */}
            <p className="text-lg font-semibold text-ink leading-relaxed">{view.headline}</p>

            {/* 카드가 하나면 헤드라인이 이미 그 카드를 말했다. 같은 문장을
                두 번 읽히면 정보가 아니라 잡음이다. */}
            {view.byCard.length > 1 && (
              <ul className="mt-4 space-y-2">
                {view.byCard.map((c) => (
                  <li key={c.cardId} className="flex justify-between items-baseline gap-3">
                    <span className="text-sm text-body">{c.text}</span>
                    <span className="text-sm font-medium text-ink tabular-nums whitespace-nowrap">
                      {formatWon(c.gapIfUsed)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {comparison && comparison.period && (
              <p className="text-xs text-caption mt-4">
                {comparison.period.from} ~ {comparison.period.to}
              </p>
            )}

            <Notices items={view.notices} />
          </div>
        )}
      </Section>
    </div>
  );
}
