import { useState } from 'react';
import { ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { RollChain, Position } from '@shared/schema';
import { format } from 'date-fns';
import { usePriceCache, calculateLivePositionPL } from '@/hooks/use-price-cache';

interface RollChainTimelineProps {
  chain: RollChain;
  chainPositions?: Position[];
}

export function RollChainTimeline({ chain, chainPositions = [] }: RollChainTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { getPositionPrices, cacheVersion } = usePriceCache();

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

  // Calculate live P/L for open chain using cached prices
  const getLiveChainPL = (): { livePL: number | null; hasLiveData: boolean } => {
    if (chain.status !== 'open' || chainPositions.length === 0) {
      return { livePL: null, hasLiveData: false };
    }

    const openPositions = chainPositions.filter(p => p.status === 'open');
    let hasLiveData = false;
    let totalLivePL = 0;

    for (const pos of openPositions) {
      const cachedPrices = getPositionPrices(pos.id);
      const livePL = calculateLivePositionPL(pos as any, cachedPrices as any);
      if (livePL !== null) {
        hasLiveData = true;
        totalLivePL += livePL;
      }
    }

    if (hasLiveData) {
      // Add realized P/L from closed positions in the chain
      const closedPL = chainPositions
        .filter(p => p.status === 'closed')
        .reduce((sum, p) => sum + p.netPL, 0);
      return { livePL: totalLivePL + closedPL, hasLiveData: true };
    }

    return { livePL: null, hasLiveData: false };
  };

  const { livePL, hasLiveData } = getLiveChainPL();
  const displayPL = livePL !== null ? livePL : chain.netPL;

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
          <p className="font-semibold text-sm text-muted-foreground mb-1 flex items-center justify-end gap-1">
            {hasLiveData && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">
                    <Zap className="h-3 w-3 text-yellow-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Live P/L based on current prices</p>
                </TooltipContent>
              </Tooltip>
            )}
            Chain Total P/L
          </p>
          <p className={`font-bold tabular-nums ${displayPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(displayPL)}
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
                const segmentPosition = chainPositions.find(p => p.id === segment.positionId);
                const isOpenSegment = segmentPosition?.status === 'open';
                
                // Calculate live P/L for this segment if it's open
                let segmentLivePL: number | null = null;
                if (isOpenSegment && segmentPosition) {
                  const cachedPrices = getPositionPrices(segmentPosition.id);
                  segmentLivePL = calculateLivePositionPL(segmentPosition as any, cachedPrices as any);
                }

                // For non-first segments, get the roll date from the PREVIOUS segment
                // (previous segment's rollDate = when it was rolled into THIS segment)
                const prevSegment = index > 0 ? chain.segments[index - 1] : null;
                const rolledIntoDate = prevSegment?.rollDate;

                return (
                  <div key={segment.positionId} className="relative pl-10" data-testid={`segment-${index}`}>
                    {/* Timeline dot */}
                    <div className={`absolute left-2.5 top-2 w-3 h-3 rounded-full border-2 ${isLast ? 'bg-primary border-primary' : 'bg-background border-border'}`} />

                    {/* Segment card */}
                    <div className={`bg-card border rounded-md p-3 ${isOpenSegment ? 'border-primary/30' : ''}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {isFirst ? 'Initial Position' : isLast ? 'Current Position' : `Roll #${index}`}
                            </Badge>
                            {isOpenSegment && (
                              <Badge variant="default" className="text-xs">Open</Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium">
                            {segment.toExpiration && `Exp ${formatDate(segment.toExpiration)}`}
                            {segment.toStrike && ` • $${segment.toStrike}`}
                          </p>
                        </div>
                        {/* Show live P/L for open segment */}
                        {segmentLivePL !== null && (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Zap className="h-3 w-3 text-yellow-500" />
                              Live P/L
                            </p>
                            <p className={`font-semibold tabular-nums ${segmentLivePL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(segmentLivePL)}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Credit/Debit breakdown */}
                      <div className="grid grid-cols-3 gap-3 mt-3 mb-2 text-xs">
                        <div>
                          <p className="text-muted-foreground mb-0.5">Credit</p>
                          <p className="font-semibold tabular-nums text-green-600" data-testid={`segment-${index}-credit`}>
                            {formatCurrency(segment.credit ?? 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Debit</p>
                          <p className="font-semibold tabular-nums text-red-600" data-testid={`segment-${index}-debit`}>
                            {formatCurrency(segment.debit ?? 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Net</p>
                          <p className={`font-semibold tabular-nums ${segment.netCredit >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid={`segment-${index}-net`}>
                            {formatCurrency(segment.netCredit)}
                          </p>
                        </div>
                      </div>

                      {/* Show roll details for non-initial positions */}
                      {!isFirst && rolledIntoDate && (
                        <p className="text-xs text-muted-foreground">
                          Rolled on {formatDate(rolledIntoDate)}
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
