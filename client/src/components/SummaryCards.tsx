import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, BarChart3, Target, Zap } from 'lucide-react';
import type { SummaryStats } from '@shared/schema';

interface LivePLData {
  liveOpenPL: number;
  liveTotalPL: number;
  realizedPL: number;
  hasLiveData: boolean;
}

interface SummaryCardsProps {
  stats: SummaryStats;
  livePLData?: LivePLData | null;
}

export function SummaryCards({ stats, livePLData }: SummaryCardsProps) {
  const formatCurrency = (value: number) => {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
    return formatted;
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Use live P/L values when available, otherwise fall back to static stats
  const hasLiveData = livePLData?.hasLiveData ?? false;
  const totalPL = hasLiveData ? livePLData!.liveTotalPL : stats.totalPL;
  const realizedPL = hasLiveData ? livePLData!.realizedPL : stats.realizedPL;

  const cards = [
    {
      label: hasLiveData ? 'Total P/L (live)' : 'Total P/L (realized + unrealized)',
      value: formatCurrency(totalPL),
      icon: totalPL >= 0 ? TrendingUp : TrendingDown,
      iconColor: totalPL >= 0 ? 'text-green-600' : 'text-red-600',
      valueColor: totalPL >= 0 ? 'text-green-600' : 'text-red-600',
      testId: 'card-total-pl',
      isLive: hasLiveData,
    },
    {
      label: 'Total P/L (realized)',
      value: formatCurrency(realizedPL),
      icon: realizedPL >= 0 ? TrendingUp : TrendingDown,
      iconColor: realizedPL >= 0 ? 'text-green-600' : 'text-red-600',
      valueColor: realizedPL >= 0 ? 'text-green-600' : 'text-red-600',
      testId: 'card-realized-pl',
      isLive: false,
    },
    {
      label: 'Open Positions',
      value: stats.openPositionsCount.toString(),
      icon: Target,
      iconColor: 'text-primary',
      valueColor: 'text-foreground',
      testId: 'card-open-positions',
      isLive: false,
    },
    {
      label: 'Win Rate',
      value: formatPercent(stats.winRate),
      subtitle: `${stats.totalWins}W / ${stats.totalLosses}L`,
      icon: BarChart3,
      iconColor: 'text-chart-1',
      valueColor: 'text-foreground',
      testId: 'card-win-rate',
      isLive: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="p-4" data-testid={card.testId}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                {card.isLive && (
                  <Zap className="w-3 h-3 text-yellow-500" />
                )}
              </div>
              <p className={`text-3xl font-semibold tabular-nums ${card.valueColor}`} data-testid={`${card.testId}-value`}>
                {card.value}
              </p>
              {card.subtitle && (
                <p className="text-xs text-muted-foreground mt-1" data-testid={`${card.testId}-subtitle`}>
                  {card.subtitle}
                </p>
              )}
            </div>
            <card.icon className={`w-5 h-5 ${card.iconColor} flex-shrink-0`} />
          </div>
        </Card>
      ))}
    </div>
  );
}
