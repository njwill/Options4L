import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Zap, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { RollChain, Position } from '@shared/schema';
import { format, differenceInDays } from 'date-fns';
import { usePriceCache, calculateLivePositionPL, type LegPriceData } from '@/hooks/use-price-cache';
import { 
  calculateGreeks, 
  calculateIntrinsicExtrinsic,
  formatDelta,
  formatGamma,
  formatTheta,
  formatVega,
  type GreeksResult
} from '@/lib/blackScholes';

function getBestPriceFromData(priceData: LegPriceData): { price: number; isValid: boolean } {
  if (priceData.mark && priceData.mark > 0) {
    return { price: priceData.mark, isValid: true };
  }
  
  const bid = priceData.bid || 0;
  const ask = priceData.ask || 0;
  if (bid > 0 && ask > 0) {
    return { price: (bid + ask) / 2, isValid: true };
  }
  
  const last = priceData.last || 0;
  if (last > 0) {
    return { price: last, isValid: true };
  }
  
  if (ask > 0) return { price: ask, isValid: true };
  if (bid > 0) return { price: bid, isValid: true };
  
  const hasAnyPriceData = priceData.mark !== undefined || 
                          priceData.bid !== undefined || 
                          priceData.ask !== undefined;
  
  return { price: 0, isValid: hasAnyPriceData };
}

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

  // Calculate chain P/L breakdown: realized (closed) + live (open)
  const getChainPLBreakdown = (): { 
    realizedPL: number; 
    liveOpenPL: number | null; 
    totalPL: number;
    hasLiveData: boolean;
  } => {
    // Realized P/L from closed positions in the chain
    const closedPositions = chainPositions.filter(p => p.status === 'closed');
    const realizedPL = closedPositions.reduce((sum, p) => sum + p.netPL, 0);
    
    // For closed chains, total is just the static netPL
    if (chain.status !== 'open' || chainPositions.length === 0) {
      return { 
        realizedPL, 
        liveOpenPL: null, 
        totalPL: chain.netPL,
        hasLiveData: false 
      };
    }

    // Calculate live P/L for open positions
    const openPositions = chainPositions.filter(p => p.status === 'open');
    let hasLiveData = false;
    let liveOpenPL = 0;
    let staticOpenPL = 0;

    for (const pos of openPositions) {
      staticOpenPL += pos.netPL; // Static value from position
      const cachedPrices = getPositionPrices(pos.id);
      const livePL = calculateLivePositionPL(pos as any, cachedPrices as any);
      if (livePL !== null) {
        hasLiveData = true;
        liveOpenPL += livePL;
      } else {
        liveOpenPL += pos.netPL; // Fall back to static if no live data
      }
    }

    // Total = realized from closed + live from open
    const totalPL = realizedPL + liveOpenPL;

    return { 
      realizedPL, 
      liveOpenPL: hasLiveData ? liveOpenPL : null, 
      totalPL,
      hasLiveData 
    };
  };

  const { realizedPL, liveOpenPL, totalPL, hasLiveData } = getChainPLBreakdown();

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
                  <p>Includes live prices for open position</p>
                </TooltipContent>
              </Tooltip>
            )}
            Chain Total P/L
          </p>
          <p className={`font-bold tabular-nums ${totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(totalPL)}
          </p>
        </div>
      </button>

      {/* Timeline */}
      {isExpanded && (
        <div className="mt-6 space-y-4">
          {/* P/L Breakdown - Clear explanation of chain value */}
          <div className="p-4 bg-muted/30 rounded-md space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-xs text-muted-foreground mb-1 cursor-help underline decoration-dotted">
                      Realized P/L (Closed)
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">P/L from positions that have been rolled or closed</p>
                  </TooltipContent>
                </Tooltip>
                <p className={`font-semibold tabular-nums ${realizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(realizedPL)}
                </p>
              </div>
              <div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-xs text-muted-foreground mb-1 cursor-help underline decoration-dotted flex items-center gap-1">
                      {liveOpenPL !== null && <Zap className="h-3 w-3 text-yellow-500" />}
                      Open Position P/L
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {liveOpenPL !== null 
                        ? 'Current unrealized P/L based on live prices' 
                        : 'Unrealized P/L on current open position'}
                    </p>
                  </TooltipContent>
                </Tooltip>
                <p className={`font-semibold tabular-nums ${(liveOpenPL ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(liveOpenPL ?? (chain.status === 'open' ? chainPositions.filter(p => p.status === 'open').reduce((sum, p) => sum + p.netPL, 0) : 0))}
                </p>
              </div>
            </div>
            
            <div className="border-t border-border/50 pt-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium">Chain Total P/L</p>
                <p className={`text-lg font-bold tabular-nums ${totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totalPL)}
                </p>
              </div>
              <Badge variant={chain.status === 'open' ? 'default' : 'secondary'} className="text-xs">
                {chain.status === 'open' ? 'Open Chain' : 'Closed Chain'}
              </Badge>
            </div>

            {/* Credits/Debits detail */}
            <div className="border-t border-border/50 pt-3 grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground mb-0.5">Total Credits Collected</p>
                <p className="font-medium tabular-nums text-green-600">{formatCurrency(chain.totalCredits)}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Total Debits Paid</p>
                <p className="font-medium tabular-nums text-red-600">{formatCurrency(Math.abs(chain.totalDebits))}</p>
              </div>
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
                
                // Get cached prices for this position
                const cachedPrices = segmentPosition ? getPositionPrices(segmentPosition.id) : null;
                
                // Calculate live P/L for this segment if it's open
                let segmentLivePL: number | null = null;
                if (isOpenSegment && segmentPosition && cachedPrices) {
                  segmentLivePL = calculateLivePositionPL(segmentPosition as any, cachedPrices as any);
                }

                // For non-first segments, get the roll date from the PREVIOUS segment
                // (previous segment's rollDate = when it was rolled into THIS segment)
                const prevSegment = index > 0 ? chain.segments[index - 1] : null;
                const rolledIntoDate = prevSegment?.rollDate;

                // Calculate option details for open segments with live data
                const legDetails = isOpenSegment && segmentPosition?.legs && cachedPrices ? segmentPosition.legs.map((leg, legIndex) => {
                  const legId = `${segmentPosition.id}-leg-${legIndex}`;
                  const priceData = cachedPrices[legId];
                  
                  // Skip if no price data at all
                  if (!priceData) return null;
                  
                  // Use the helper to get the best available price
                  const { price: currentPrice, isValid } = getBestPriceFromData(priceData);
                  
                  const entryPrice = Math.abs(leg.amount) / leg.quantity / 100;
                  const isSell = leg.transCode === 'STO' || leg.transCode === 'STC';
                  
                  // Calculate unrealized P/L - use isValid to determine if data exists
                  // even if price is 0 (worthless options)
                  const unrealizedPL = isValid ? (isSell 
                    ? (entryPrice - currentPrice) * leg.quantity * 100
                    : (currentPrice - entryPrice) * leg.quantity * 100) : null;
                  
                  // Calculate Greeks
                  let greeks: GreeksResult | null = null;
                  if (isValid && priceData.underlyingPrice && priceData.impliedVolatility && leg.expiration) {
                    greeks = calculateGreeks({
                      underlyingPrice: priceData.underlyingPrice,
                      strikePrice: leg.strike,
                      expirationDate: leg.expiration,
                      optionType: (leg.optionType?.toLowerCase() || 'call') as 'call' | 'put',
                      impliedVolatility: priceData.impliedVolatility,
                      marketPrice: currentPrice,
                    });
                  }
                  
                  // Calculate intrinsic/extrinsic
                  const intrinsicExtrinsic = (isValid && priceData.underlyingPrice) ? calculateIntrinsicExtrinsic(
                    priceData.underlyingPrice,
                    leg.strike,
                    (leg.optionType?.toLowerCase() || 'call') as 'call' | 'put',
                    currentPrice
                  ) : null;
                  
                  // Calculate DTE
                  const dte = leg.expiration ? differenceInDays(new Date(leg.expiration), new Date()) : null;
                  
                  return {
                    leg,
                    legIndex,
                    legKey: leg.id || `${segmentPosition.id}-leg-${legIndex}`,
                    priceData,
                    currentPrice,
                    entryPrice,
                    unrealizedPL,
                    greeks,
                    intrinsicExtrinsic,
                    dte,
                    isSell,
                    hasValidPrice: isValid,
                  };
                }).filter(Boolean) : [];
                
                // Show message when no leg data available for open segments
                const hasLiveCacheForPosition = cachedPrices && Object.keys(cachedPrices).length > 0;

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
                        <p className="text-xs text-muted-foreground mb-2">
                          Rolled on {formatDate(rolledIntoDate)}
                          {segment.fromExpiration && segment.toExpiration && segment.fromExpiration !== segment.toExpiration && 
                            ` (${formatDate(segment.fromExpiration)} → ${formatDate(segment.toExpiration)})`}
                          {segment.fromStrike && segment.toStrike && segment.fromStrike !== segment.toStrike && 
                            ` • Strike: $${segment.fromStrike} → $${segment.toStrike}`}
                        </p>
                      )}
                      
                      {/* Option Details for open segments with live data */}
                      {isOpenSegment && hasLiveCacheForPosition && legDetails.length === 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-xs text-muted-foreground">
                            Live data unavailable for this position
                          </p>
                        </div>
                      )}
                      {isOpenSegment && legDetails.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                          {legDetails.map((detail) => {
                            if (!detail) return null;
                            const { leg, legIndex, legKey, currentPrice, entryPrice, unrealizedPL, greeks, intrinsicExtrinsic, dte, priceData, hasValidPrice } = detail;
                            
                            return (
                              <div key={legKey} className="bg-muted/30 rounded-md p-2.5">
                                {/* Leg header */}
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium">{leg.transCode}</span>
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                      {leg.optionType}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      ${leg.strike} • {leg.quantity} contracts
                                    </span>
                                    {dte !== null && (
                                      <span className="text-xs text-muted-foreground">
                                        ({dte} DTE)
                                      </span>
                                    )}
                                  </div>
                                  {intrinsicExtrinsic && (
                                    <Badge 
                                      variant="outline" 
                                      className={`text-[10px] ${
                                        intrinsicExtrinsic.isITM ? 'border-green-500 text-green-600' :
                                        intrinsicExtrinsic.isOTM ? 'border-red-500 text-red-600' :
                                        'border-muted-foreground'
                                      }`}
                                    >
                                      {intrinsicExtrinsic.moneyness}
                                    </Badge>
                                  )}
                                </div>
                                
                                {/* Current vs Entry - show N/A if no valid price */}
                                <div className="flex items-center justify-between text-xs mb-2">
                                  <div className="flex items-center gap-3 text-muted-foreground">
                                    <span>Current: <span className="font-medium text-foreground">{hasValidPrice ? formatCurrency(currentPrice) : 'N/A'}</span></span>
                                    <span>vs Entry: <span className="font-medium text-foreground">{formatCurrency(entryPrice)}</span></span>
                                  </div>
                                  {unrealizedPL !== null ? (
                                    <div className={`flex items-center gap-1 font-semibold ${unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {unrealizedPL > 0 ? <TrendingUp className="h-3 w-3" /> : unrealizedPL < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                      <span>{formatCurrency(unrealizedPL)}</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">P/L: N/A</span>
                                  )}
                                </div>
                                
                                {/* Greeks */}
                                {greeks && (
                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-2">
                                    <Activity className="w-3 h-3" />
                                    <span>Greeks:</span>
                                    <div className="flex flex-wrap gap-2 ml-1">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="cursor-help">
                                            <span className="text-muted-foreground">Δ:</span>{' '}
                                            <span className="font-mono tabular-nums text-foreground">{formatDelta(greeks.delta)}</span>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">Delta: Price change per $1 stock move</p>
                                        </TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="cursor-help">
                                            <span className="text-muted-foreground">Γ:</span>{' '}
                                            <span className="font-mono tabular-nums text-foreground">{formatGamma(greeks.gamma)}</span>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">Gamma: Rate of Delta change</p>
                                        </TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="cursor-help">
                                            <span className="text-muted-foreground">Θ:</span>{' '}
                                            <span className={`font-mono tabular-nums ${greeks.theta < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                              {formatTheta(greeks.theta)}
                                            </span>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">Theta: Daily time decay per contract</p>
                                        </TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="cursor-help">
                                            <span className="text-muted-foreground">ν:</span>{' '}
                                            <span className="font-mono tabular-nums text-foreground">{formatVega(greeks.vega)}</span>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">Vega: Price change per 1% IV move</p>
                                        </TooltipContent>
                                      </Tooltip>
                                      {priceData.impliedVolatility && (
                                        <span className="ml-1">
                                          <span className="text-muted-foreground">IV:</span>{' '}
                                          <span className="font-mono tabular-nums text-foreground">{(priceData.impliedVolatility * 100).toFixed(1)}%</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Intrinsic/Extrinsic */}
                                {intrinsicExtrinsic && (
                                  <div className="flex items-center gap-4 text-xs">
                                    <span>
                                      <span className="text-muted-foreground">Intrinsic:</span>{' '}
                                      <span className={`font-mono tabular-nums font-medium ${intrinsicExtrinsic.intrinsicValue > 0 ? 'text-green-600' : ''}`}>
                                        ${intrinsicExtrinsic.intrinsicValue.toFixed(2)}
                                      </span>
                                    </span>
                                    <span>
                                      <span className="text-muted-foreground">Extrinsic:</span>{' '}
                                      <span className="font-mono tabular-nums font-medium text-amber-600">
                                        ${intrinsicExtrinsic.extrinsicValue.toFixed(2)}
                                      </span>
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
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
