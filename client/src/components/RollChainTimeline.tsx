import { useState } from 'react';
import { ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { RollChain, Position } from '@shared/schema';
import type { LegPriceData } from '@/hooks/use-price-cache';
import { format } from 'date-fns';
import { 
  calculateGreeks, 
  calculatePositionGreeks, 
  calculateIntrinsicExtrinsic,
  formatDelta,
  formatGamma,
  formatTheta,
  formatVega,
  type GreeksResult 
} from '@/lib/blackScholes';

interface RollChainTimelineProps {
  chain: RollChain;
  positions?: Position[];
  getPositionPrices?: (positionId: string) => Record<string, LegPriceData> | null;
}

export function RollChainTimeline({ chain, positions, getPositionPrices }: RollChainTimelineProps) {
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

  const getPositionForSegment = (positionId: string): Position | undefined => {
    return positions?.find(p => p.id === positionId);
  };

  const getSegmentLiveData = (positionId: string): {
    legs: {
      legInfo: any;
      data: LegPriceData | null;
      greeks: GreeksResult | null;
      intrinsicExtrinsic: ReturnType<typeof calculateIntrinsicExtrinsic> | null;
    }[];
    positionGreeks: { totalDelta: number; totalGamma: number; totalTheta: number; totalVega: number } | null;
    hasData: boolean;
    underlyingPrice: number | null;
    position: Position;
  } | null => {
    if (!getPositionPrices) return null;
    
    const position = getPositionForSegment(positionId);
    if (!position || position.status !== 'open') return null;
    
    const cachedPrices = getPositionPrices(positionId);
    if (!cachedPrices) return null;
    
    const legs: {
      legInfo: any;
      data: LegPriceData | null;
      greeks: GreeksResult | null;
      intrinsicExtrinsic: ReturnType<typeof calculateIntrinsicExtrinsic> | null;
    }[] = [];
    
    let underlyingPrice: number | null = null;
    
    if (position.legs && Array.isArray(position.legs)) {
      position.legs.forEach((leg: any, i: number) => {
        const legId = `${positionId}-leg-${i}`;
        const data = cachedPrices[legId] || null;
        
        if (data?.underlyingPrice) {
          underlyingPrice = data.underlyingPrice;
        }
        
        let greeks: GreeksResult | null = null;
        let intrinsicExtrinsic = null;
        
        if (data && !data.error && data.underlyingPrice && leg.expiration) {
          const mark = data.mark || (((data.bid || 0) + (data.ask || 0)) / 2);
          
          greeks = calculateGreeks({
            underlyingPrice: data.underlyingPrice,
            strikePrice: leg.strike,
            expirationDate: leg.expiration,
            optionType: (leg.optionType?.toLowerCase() || 'call') as 'call' | 'put',
            impliedVolatility: data.impliedVolatility,
            marketPrice: mark,
          });
          
          if (data.type) {
            intrinsicExtrinsic = calculateIntrinsicExtrinsic(
              data.underlyingPrice,
              data.strike || leg.strike,
              data.type.toLowerCase() as 'call' | 'put',
              mark
            );
          }
        }
        
        legs.push({ legInfo: leg, data, greeks, intrinsicExtrinsic });
      });
    }
    
    const legsWithGreeks = legs.filter(l => l.greeks).map(l => ({
      greeks: l.greeks!,
      quantity: l.legInfo.quantity || 1,
      transCode: l.legInfo.transCode || 'BTO',
    }));
    
    const positionGreeks = legsWithGreeks.length > 0 ? calculatePositionGreeks(legsWithGreeks) : null;
    const hasData = legs.some(l => l.data && !l.data.error);
    
    return { legs, positionGreeks, hasData, underlyingPrice, position };
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
                const liveData = isLast && chain.status === 'open' ? getSegmentLiveData(segment.positionId) : null;

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

                      {!isFirst && segment.rollDate && (
                        <p className="text-xs text-muted-foreground">
                          Rolled on {formatDate(segment.rollDate)}
                          {segment.fromExpiration && segment.toExpiration && segment.fromExpiration !== segment.toExpiration && 
                            ` (${formatDate(segment.fromExpiration)} → ${formatDate(segment.toExpiration)})`}
                          {segment.fromStrike && segment.toStrike && segment.fromStrike !== segment.toStrike && 
                            ` • Strike: $${segment.fromStrike} → $${segment.toStrike}`}
                        </p>
                      )}

                      {/* Live metrics for open positions */}
                      {liveData?.hasData && (
                        <div className="mt-3 pt-3 border-t border-dashed space-y-3">
                          <div className="flex items-center gap-2">
                            <Zap className="w-3 h-3 text-amber-500" />
                            <span className="text-xs font-medium text-amber-600">Live Data</span>
                            {liveData.underlyingPrice && (
                              <span className="text-xs text-muted-foreground ml-auto">
                                {chain.symbol} @ ${liveData.underlyingPrice.toFixed(2)}
                              </span>
                            )}
                          </div>
                          
                          {/* Position Greeks */}
                          {liveData.positionGreeks && (
                            <div className="grid grid-cols-4 gap-2 text-xs">
                              <div>
                                <p className="text-muted-foreground mb-0.5">Delta ($)</p>
                                <p className="font-semibold tabular-nums">{formatDelta(liveData.positionGreeks.totalDelta)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-0.5">Gamma</p>
                                <p className="font-semibold tabular-nums">{formatGamma(liveData.positionGreeks.totalGamma)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-0.5">Theta ($/day)</p>
                                <p className="font-semibold tabular-nums">{formatTheta(liveData.positionGreeks.totalTheta)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-0.5">Vega ($/%)</p>
                                <p className="font-semibold tabular-nums">{formatVega(liveData.positionGreeks.totalVega)}</p>
                              </div>
                            </div>
                          )}
                          
                          {/* Per-leg details */}
                          <div className="space-y-2">
                            {liveData.legs.map((leg, legIndex) => {
                              if (!leg.data || leg.data.error) return null;
                              
                              const mark = leg.data.mark || (((leg.data.bid || 0) + (leg.data.ask || 0)) / 2);
                              const entryPrice = Math.abs(leg.legInfo.amount) / leg.legInfo.quantity / 100;
                              const isSell = leg.legInfo.transCode === 'STO' || leg.legInfo.transCode === 'STC';
                              
                              return (
                                <div key={legIndex} className="bg-muted/30 rounded p-2 text-xs">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium">
                                      {leg.legInfo.transCode} {leg.legInfo.quantity} × ${leg.legInfo.strike} {leg.legInfo.optionType}
                                    </span>
                                    {leg.intrinsicExtrinsic && (
                                      <Badge 
                                        variant="outline" 
                                        className={`text-[10px] ${
                                          leg.intrinsicExtrinsic.isITM ? 'border-green-500 text-green-600' :
                                          leg.intrinsicExtrinsic.isOTM ? 'border-red-500 text-red-600' :
                                          'border-muted-foreground'
                                        }`}
                                      >
                                        {leg.intrinsicExtrinsic.moneyness}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                                    <div>
                                      <span>Entry: </span>
                                      <span className="font-mono tabular-nums">${entryPrice.toFixed(2)}</span>
                                    </div>
                                    <div>
                                      <span>Mark: </span>
                                      <span className="font-mono tabular-nums">${mark.toFixed(2)}</span>
                                    </div>
                                    {leg.intrinsicExtrinsic && (
                                      <div className="flex gap-2">
                                        <span>
                                          Int: <span className={`font-mono tabular-nums ${leg.intrinsicExtrinsic.intrinsicValue > 0 ? 'text-green-600' : ''}`}>
                                            ${leg.intrinsicExtrinsic.intrinsicValue.toFixed(2)}
                                          </span>
                                        </span>
                                        <span>
                                          Ext: <span className="font-mono tabular-nums text-amber-600">
                                            ${leg.intrinsicExtrinsic.extrinsicValue.toFixed(2)}
                                          </span>
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {leg.greeks && (
                                    <div className="mt-1 text-muted-foreground flex gap-3">
                                      <span>Δ {leg.greeks.delta.toFixed(3)}</span>
                                      <span>Γ {leg.greeks.gamma.toFixed(4)}</span>
                                      <span>Θ {leg.greeks.theta.toFixed(3)}</span>
                                      <span>ν {leg.greeks.vega.toFixed(3)}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Prompt to load prices if this is open and no data */}
                      {isLast && chain.status === 'open' && getPositionPrices && !liveData?.hasData && (
                        <div className="mt-3 pt-3 border-t border-dashed">
                          <p className="text-xs text-muted-foreground text-center">
                            Load live prices on Open Positions to see Greeks and metrics
                          </p>
                        </div>
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
