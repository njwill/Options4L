import { Badge } from '@/components/ui/badge';
import type { StrategyType } from '@shared/schema';

interface StrategyBadgeProps {
  strategy: StrategyType;
}

const strategyColors: Record<StrategyType, string> = {
  'Covered Call': 'bg-chart-1/20 text-chart-1 border-chart-1/30',
  'Cash Secured Put': 'bg-chart-2/20 text-chart-2 border-chart-2/30',
  'Put Credit Spread': 'bg-chart-3/20 text-chart-3 border-chart-3/30',
  'Call Credit Spread': 'bg-chart-4/20 text-chart-4 border-chart-4/30',
  'Put Debit Spread': 'bg-chart-5/20 text-chart-5 border-chart-5/30',
  'Call Debit Spread': 'bg-accent text-accent-foreground border-accent-border',
  'Iron Condor': 'bg-primary/20 text-primary border-primary/30',
  'Long Straddle': 'bg-chart-1/20 text-chart-1 border-chart-1/30',
  'Short Straddle': 'bg-chart-2/20 text-chart-2 border-chart-2/30',
  'Long Strangle': 'bg-chart-3/20 text-chart-3 border-chart-3/30',
  'Short Strangle': 'bg-chart-4/20 text-chart-4 border-chart-4/30',
  'Calendar Spread': 'bg-chart-5/20 text-chart-5 border-chart-5/30',
  'Diagonal Spread': 'bg-accent text-accent-foreground border-accent-border',
  'Long Call': 'bg-secondary text-secondary-foreground border-secondary-border',
  'Long Put': 'bg-secondary text-secondary-foreground border-secondary-border',
  'Short Call': 'bg-muted text-muted-foreground border-muted-border',
  'Short Put': 'bg-muted text-muted-foreground border-muted-border',
  'Long Stock': 'bg-card text-card-foreground border-card-border',
  'Short Stock': 'bg-card text-card-foreground border-card-border',
  'Unknown': 'bg-muted text-muted-foreground border-muted-border',
};

export function StrategyBadge({ strategy }: StrategyBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={`text-xs font-medium whitespace-nowrap ${strategyColors[strategy]}`}
      data-testid={`badge-strategy-${strategy.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {strategy}
    </Badge>
  );
}
