import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StrategyBadge } from './StrategyBadge';
import { RollChainTimeline } from './RollChainTimeline';
import type { Position, RollChain } from '@shared/schema';
import { format } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface LegPriceData {
  legId: string;
  symbol: string;
  strike: number;
  expiration: string;
  type: string;
  bid?: number;
  ask?: number;
  last?: number;
  mark?: number;
  impliedVolatility?: number;
  underlyingPrice?: number;
  error?: string;
}

interface PositionDetailPanelProps {
  position: Position | null;
  rollChains: RollChain[];
  isOpen: boolean;
  onClose: () => void;
}

export function PositionDetailPanel({ position, rollChains, isOpen, onClose }: PositionDetailPanelProps) {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const [legPrices, setLegPrices] = useState<Record<string, LegPriceData>>({});
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [totalUnrealizedPL, setTotalUnrealizedPL] = useState<number | null>(null);

  const fetchLegPrices = async () => {
    if (!position || !isAuthenticated || position.status !== 'open') return;
    
    const hasOpenLegs = position.legs.some(leg => leg.status === 'open');
    if (!hasOpenLegs) return;
    
    setIsLoadingPrices(true);
    setPriceError(null);
    
    try {
      const legRequests: { symbol: string; strike: number; expiration: string; type: 'call' | 'put'; legId: string }[] = [];
      
      position.legs.forEach((leg, index) => {
        if (leg.status === 'open') {
          legRequests.push({
            symbol: position.symbol,
            strike: leg.strike,
            expiration: leg.expiration,
            type: leg.optionType.toLowerCase() as 'call' | 'put',
            legId: `${position.id}-leg-${index}`,
          });
        }
      });
      
      const response = await apiRequest('POST', '/api/options/chain', { legs: legRequests });
      const data = await response.json();
      
      if (data.success && data.optionData) {
        setLegPrices(data.optionData);
      } else if (data.message) {
        setPriceError(data.message);
      }
    } catch (error) {
      console.error('Failed to fetch leg prices:', error);
      setPriceError('Failed to fetch live prices');
    } finally {
      setIsLoadingPrices(false);
    }
  };

  useEffect(() => {
    if (isOpen && position && position.status === 'open' && isAuthenticated) {
      fetchLegPrices();
    }
  }, [isOpen, position?.id, isAuthenticated]);

  useEffect(() => {
    if (!position || Object.keys(legPrices).length === 0) {
      setTotalUnrealizedPL(null);
      return;
    }
    
    let totalPL = 0;
    let hasValidData = false;
    
    position.legs.forEach((leg, index) => {
      if (leg.status !== 'open') return;
      
      const legId = `${position.id}-leg-${index}`;
      const priceData = legPrices[legId];
      
      if (priceData?.mark && priceData.mark > 0) {
        hasValidData = true;
        const entryPrice = Math.abs(leg.amount) / leg.quantity / 100;
        const currentPrice = priceData.mark;
        const isSell = leg.transCode === 'STO' || leg.transCode === 'STC';
        // Short positions profit when price drops, long positions profit when price rises
        const unrealizedPL = isSell 
          ? (entryPrice - currentPrice) * leg.quantity * 100
          : (currentPrice - entryPrice) * leg.quantity * 100;
        totalPL += unrealizedPL;
      }
    });
    
    setTotalUnrealizedPL(hasValidData ? totalPL : null);
  }, [legPrices, position]);

  if (!position) return null;

  // Find the roll chain this position belongs to
  const chain = position.rollChainId ? rollChains.find(c => c.chainId === position.rollChainId) : null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="dialog-position-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-2xl font-semibold">{position.symbol}</span>
            <StrategyBadge strategy={position.strategyType} />
            <Badge variant={position.status === 'open' ? 'default' : 'secondary'}>
              {position.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-8 mt-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Entry Date</p>
              <p className="font-medium tabular-nums">{formatDate(position.entryDate)}</p>
            </div>
            {position.exitDate && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Exit Date</p>
                <p className="font-medium tabular-nums">{formatDate(position.exitDate)}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Credit</p>
              <p className="font-medium tabular-nums text-green-600">{formatCurrency(position.totalCredit)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Debit</p>
              <p className="font-medium tabular-nums text-red-600">{formatCurrency(Math.abs(position.totalDebit))}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Net P/L</p>
              <p className={`font-semibold tabular-nums ${position.netPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(position.netPL)}
              </p>
            </div>
            {position.maxProfitableDebit !== null && position.status === 'open' && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Max Profitable Debit</p>
                <p className="font-medium tabular-nums">{formatCurrency(Math.abs(position.maxProfitableDebit))}</p>
              </div>
            )}
            {totalUnrealizedPL !== null && position.status === 'open' && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Unrealized P/L</p>
                <p className={`font-semibold tabular-nums flex items-center gap-1 ${totalUnrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalUnrealizedPL >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {formatCurrency(totalUnrealizedPL)}
                </p>
              </div>
            )}
          </div>

          {/* Option Legs */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Option Legs</h3>
              {position.status === 'open' && isAuthenticated && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchLegPrices}
                  disabled={isLoadingPrices}
                  data-testid="button-refresh-leg-prices"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingPrices ? 'animate-spin' : ''}`} />
                  {isLoadingPrices ? 'Loading...' : 'Refresh Prices'}
                </Button>
              )}
            </div>
            {priceError && (
              <p className="text-sm text-destructive mb-2">{priceError}</p>
            )}
            <div className="space-y-2">
              {position.legs.map((leg, index) => {
                const legId = `${position.id}-leg-${index}`;
                const priceData = legPrices[legId];
                const entryPrice = Math.abs(leg.amount) / leg.quantity / 100;
                const currentPrice = priceData?.mark;
                const isSell = leg.transCode === 'STO' || leg.transCode === 'STC';
                
                let unrealizedPL: number | null = null;
                if (currentPrice && currentPrice > 0 && leg.status === 'open') {
                  // Short positions profit when price drops, long positions profit when price rises
                  unrealizedPL = isSell 
                    ? (entryPrice - currentPrice) * leg.quantity * 100
                    : (currentPrice - entryPrice) * leg.quantity * 100;
                }
                
                return (
                  <div
                    key={leg.id}
                    className="p-4 border rounded-md bg-card"
                    data-testid={`leg-${leg.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{leg.transCode}</span>
                          <Badge variant="outline" className="text-xs">
                            {leg.optionType}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            ${leg.strike} exp {formatDate(leg.expiration)}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {leg.quantity} contracts @ {formatCurrency(entryPrice)}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium tabular-nums ${leg.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(leg.amount)}
                        </p>
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {leg.status}
                        </Badge>
                      </div>
                    </div>
                    
                    {/* Current price and P/L row for open legs */}
                    {leg.status === 'open' && (
                      <div className="mt-3 py-2 px-3 rounded bg-muted/50 flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>Current:</span>
                          {isLoadingPrices ? (
                            <span className="animate-pulse">Loading...</span>
                          ) : currentPrice && currentPrice > 0 ? (
                            <span className="font-medium text-foreground">{formatCurrency(currentPrice)}</span>
                          ) : priceData?.error ? (
                            <span className="text-destructive">{priceData.error}</span>
                          ) : (
                            <span>—</span>
                          )}
                          {currentPrice && currentPrice > 0 && (
                            <>
                              <span>vs Entry:</span>
                              <span className="font-medium text-foreground">{formatCurrency(entryPrice)}</span>
                            </>
                          )}
                        </div>
                        {unrealizedPL !== null && (
                          <div className={`flex items-center gap-1 text-sm font-semibold ${unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {unrealizedPL > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : unrealizedPL < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                            <span>{formatCurrency(unrealizedPL)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Roll Chain Timeline */}
          {chain && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Complete Roll Chain</h3>
              <RollChainTimeline chain={chain} />
            </div>
          )}

          {/* Individual Position Rolls */}
          {position.rolls.length > 0 && !chain && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Roll History</h3>
              <div className="space-y-2">
                {position.rolls.map((roll) => (
                  <div
                    key={roll.id}
                    className="p-4 border rounded-md bg-card"
                    data-testid={`roll-${roll.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Roll on {formatDate(roll.rollDate)}</span>
                      <span className={`font-medium tabular-nums ${roll.netCredit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(roll.netCredit)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                      <div>
                        <p>From: ${roll.fromStrike} exp {formatDate(roll.fromExpiration)}</p>
                      </div>
                      <div>
                        <p>To: ${roll.toStrike} exp {formatDate(roll.toExpiration)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
