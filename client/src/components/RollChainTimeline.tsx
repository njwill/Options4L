import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { RollChain } from '@shared/schema';
import { format } from 'date-fns';

interface RollChainTimelineProps {
  chain: RollChain;
}

export function RollChainTimeline({ chain }: RollChainTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  return (
    <Card className="p-4" data-testid="roll-chain-timeline">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between hover-elevate active-elevate-2 rounded-md p-2 -m-2"
        data-testid="button-toggle-chain"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <div className="text-left">
            <h4 className="font-semibold">Roll Chain History</h4>
            <p className="text-sm text-muted-foreground">
              {chain.rollCount} {chain.rollCount === 1 ? 'roll' : 'rolls'} • {chain.segments.length} {chain.segments.length === 1 ? 'position' : 'positions'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm text-muted-foreground mb-1">Chain Total P/L</p>
          <p className={`font-bold tabular-nums ${chain.netPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(chain.netPL)}
          </p>
        </div>
      </button>

      {/* Timeline */}
      {isExpanded && (
        <div className="mt-6 space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-md">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Credits</p>
              <p className="font-medium tabular-nums text-green-600">{formatCurrency(chain.totalCredits)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Debits</p>
              <p className="font-medium tabular-nums text-red-600">{formatCurrency(Math.abs(chain.totalDebits))}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Badge variant={chain.status === 'open' ? 'default' : 'secondary'}>{chain.status}</Badge>
            </div>
          </div>

          {/* Timeline Segments */}
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
            <div className="space-y-4">
              {chain.segments.map((segment, index) => {
                const isFirst = index === 0;
                const isLast = index === chain.segments.length - 1;

                return (
                  <div key={segment.positionId} className="relative pl-10" data-testid={`segment-${index}`}>
                    {/* Timeline dot */}
                    <div className={`absolute left-2.5 top-2 w-3 h-3 rounded-full border-2 ${isLast ? 'bg-primary border-primary' : 'bg-background border-border'}`} />

                    {/* Segment card */}
                    <div className="bg-card border rounded-md p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <Badge variant="outline" className="text-xs mb-1">
                            {isFirst ? 'Initial Position' : isLast ? 'Current Position' : `Roll #${index}`}
                          </Badge>
                          <p className="text-sm font-medium">
                            {segment.toExpiration && `Exp ${formatDate(segment.toExpiration)}`}
                            {segment.toStrike && ` • $${segment.toStrike}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold tabular-nums ${segment.netCredit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(segment.netCredit)}
                          </p>
                        </div>
                      </div>

                      {!isFirst && segment.rollDate && (
                        <p className="text-xs text-muted-foreground">
                          Rolled on {formatDate(segment.rollDate)}
                          {segment.fromExpiration && segment.toExpiration && segment.fromExpiration !== segment.toExpiration && 
                            ` (${formatDate(segment.fromExpiration)} → ${formatDate(segment.toExpiration)})`}
                          {segment.fromStrike && segment.toStrike && segment.fromStrike !== segment.toStrike && 
                            ` • Strike: $${segment.fromStrike} → $${segment.toStrike}`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
