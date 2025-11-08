import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, BarChart3, Target } from 'lucide-react';
import type { SummaryStats } from '@shared/schema';

interface SummaryCardsProps {
  stats: SummaryStats;
}

export function SummaryCards({ stats }: SummaryCardsProps) {
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

  const cards = [
    {
      label: 'Total P/L (realized + unrealized)',
      value: formatCurrency(stats.totalPL),
      icon: stats.totalPL >= 0 ? TrendingUp : TrendingDown,
      iconColor: stats.totalPL >= 0 ? 'text-green-600' : 'text-red-600',
      valueColor: stats.totalPL >= 0 ? 'text-green-600' : 'text-red-600',
      testId: 'card-total-pl'
    },
    {
      label: 'Open Positions',
      value: stats.openPositionsCount.toString(),
      icon: Target,
      iconColor: 'text-primary',
      valueColor: 'text-foreground',
      testId: 'card-open-positions'
    },
    {
      label: 'Win Rate',
      value: formatPercent(stats.winRate),
      subtitle: `${stats.totalWins}W / ${stats.totalLosses}L`,
      icon: BarChart3,
      iconColor: 'text-chart-1',
      valueColor: 'text-foreground',
      testId: 'card-win-rate'
    },
    {
      label: 'Total P/L (realized)',
      value: formatCurrency(stats.realizedPL),
      icon: stats.realizedPL >= 0 ? TrendingUp : TrendingDown,
      iconColor: stats.realizedPL >= 0 ? 'text-green-600' : 'text-red-600',
      valueColor: stats.realizedPL >= 0 ? 'text-green-600' : 'text-red-600',
      testId: 'card-realized-pl'
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="p-4" data-testid={card.testId}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground mb-1">{card.label}</p>
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
