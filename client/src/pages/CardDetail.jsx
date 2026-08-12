import React from 'react';
import { Link } from 'wouter';
import { api } from '../lib/api';
import { useLoader } from '../hooks/useLoader';
import LoadError from '../components/LoadError';
import EmptyState from './../components/EmptyState';
import { formatWon } from '../lib/format';
import { benefitTargetLabel, benefitValueLabel, tierStatusLine } from '../lib/cardDetailView';

// 카드 상세(#563).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 화면이 하나 더 필요한가
//
// 기존 «카드» 화면은 «충족/미달» 과 구간 이름까지만 말한다. 구간이 붙은 뒤로는
// 그것으로 부족해졌다 — **혜택마다 이번 달에 살아 있는지가 달라지기** 때문이다.
//
// 40만원 미만 구간에 걸린 1% 줄과 이상 구간에 걸린 2% 줄이 함께 등록돼 있고,
// 이번 달에는 그중 하나만 적용된다. 설정 화면의 혜택 목록만 보면 **둘 다 있는
// 것처럼** 보이고, 왜 계산이 1% 로 나왔는지 알 방법이 없다.
//
// 그래서 이 화면의 중심은 «등록된 혜택» 이 아니라 **«지금 걸리는 혜택»** 이다.
//
// ─────────────────────────────────────────────────────────────────────────
// 안 걸리는 줄을 숨기지 않는다
//
// 이번 달에 안 걸리는 혜택도 흐리게 남기고 «왜 안 걸리는가» 를 함께 적는다.
// 감추면 "내가 등록한 게 어디 갔지" 가 되고, 그 다음은 같은 혜택을 또 등록하는
// 것이다. 실적 미달로 전부 죽은 카드도 그 사실을 그대로 말한다.

function Badge({ tone, children }) {
  const cls = tone === 'on'
    ? 'bg-brand-fill/15 text-brand-text'
    : tone === 'warn'
      ? 'bg-warn-fill/20 text-warn-text'
      : 'bg-surface-sunken text-caption';
  return <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>{children}</span>;
}

function BenefitRow({ benefit }) {
  const on = benefit.activeNow;
  return (
    <li className={`py-1.5 ${on ? '' : 'opacity-55'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-ink">{benefitTargetLabel(benefit)}</span>
        <span className="text-xs tabular-nums text-body shrink-0">{benefitValueLabel(benefit)}</span>
      </div>
      <div className="flex flex-wrap gap-1 pt-0.5">
        {on ? <Badge tone="on">이번 달 적용</Badge> : <Badge>이번 달 미적용</Badge>}
        {benefit.paymentStyle && <Badge>{benefit.paymentStyle}만</Badge>}
        {benefit.tierLabel && <Badge>{benefit.tierLabel}</Badge>}
        {benefit.minAmount > 0 && <Badge>{formatWon(benefit.minAmount)} 이상</Badge>}
      </div>
    </li>
  );
}

function CardBlock({ card }) {
  const th = card.threshold;
  const status = tierStatusLine(th);
  return (
    <section className={`bg-surface rounded-card border border-line p-4 space-y-3 ${card.isActive ? '' : 'opacity-60'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-ink">{card.productName}</h3>
          <p className="text-[11px] text-caption">{card.issuer} · {card.cardType}</p>
        </div>
        {!card.isActive && <Badge>더 안 씀</Badge>}
      </div>

      {/* 실적은 «얼마 썼나» 가 아니라 «그래서 지금 어느 구간인가» 가 요점이다. */}
      <div className="bg-surface-sunken rounded-card px-3 py-2 space-y-1">
        <p className="text-xs text-body">{status.headline}</p>
        {status.detail && <p className="text-[11px] text-caption">{status.detail}</p>}
        {th.period && (
          <p className="text-[11px] text-caption">
            {th.period.start} ~ {th.period.end} 사용액 {formatWon(th.spend)}
          </p>
        )}
      </div>

      {/* 구간이 여럿이면 전체를 펼쳐 둔다. 지금 구간만 보여주면 «다음에 뭐가
          달라지는지» 를 알 수 없다. */}
      {th.tiers.length > 1 && (
        <div>
          <h4 className="text-[11px] font-medium text-caption mb-1">실적 구간</h4>
          <ul className="space-y-0.5">
            {th.tiers.map((t) => {
              const now = th.tier && th.tier.id === t.id;
              return (
                <li key={t.id} className={`text-[11px] flex justify-between gap-2 ${now ? 'text-ink font-medium' : 'text-caption'}`}>
                  <span>{t.label || `${formatWon(t.min_spend)} 이상`}{now ? ' ← 지금' : ''}</span>
                  <span className="tabular-nums shrink-0">
                    {t.rate === null || t.rate === undefined ? '요율 혜택별' : `${t.rate}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <h4 className="text-[11px] font-medium text-caption mb-1">
          혜택 {card.benefits.length}건 · 이번 달 적용 {card.activeBenefitCount}건
        </h4>
        {card.benefits.length === 0 ? (
          <p className="text-[11px] text-caption">
            등록된 혜택이 없어요. 설정 &gt; 카드 혜택에서 넣으면 이 카드도 비교에 들어와요.
          </p>
        ) : (
          <ul className="divide-y divide-line-faint">
            {card.benefits.map((b) => <BenefitRow key={b.id} benefit={b} />)}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function CardDetail() {
  const [cards, setCards] = React.useState([]);

  const { loading, error, reload } = useLoader(async () => {
    const res = await api.get('/api/card-strategy/detail');
    setCards(res.data || []);
  }, []);

  if (loading) return <div className="text-caption text-center py-20">로딩 중...</div>;
  if (error) return <LoadError error={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">카드 상세</h1>
        <Link href="/analysis/cards" className="text-xs text-brand-text hover:underline">
          카드 전략으로
        </Link>
      </div>

      <p className="text-xs text-caption">
        카드마다 지금 어느 구간이고, 등록한 혜택 중 <strong className="text-body">이번 달에 실제로 걸리는 것</strong>이
        무엇인지 보여줍니다. 안 걸리는 혜택도 지우지 않고 흐리게 남겨 이유를 함께 적습니다.
      </p>

      {/* 이 화면이 말할 수 없는 것을 접지 않고 적는다. 실적은 카드사 제외 항목을
          반영하지 못하므로 여기 숫자가 카드사 앱과 다를 수 있다. */}
      <p className="text-[11px] text-caption bg-surface-sunken rounded-card px-3 py-2">
        실적 금액은 가계부에 기록된 결제로 계산합니다. 카드사가 실적에서 빼는 항목(세금·공과금·상품권 등)은
        반영하지 못하므로 카드사 앱의 숫자와 다를 수 있어요.
      </p>

      {cards.length === 0 ? (
        <EmptyState
          title="등록된 카드가 없어요"
          description="설정 > 보유 카드에서 카드를 먼저 등록하면 여기에 나타나요."
        />
      ) : (
        <div className="space-y-3">
          {cards.map((c) => <CardBlock key={c.cardProductId} card={c} />)}
        </div>
      )}
    </div>
  );
}
