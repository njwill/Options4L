import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { StrategyBadge } from '@/components/StrategyBadge';
import { PositionDetailPanel } from '@/components/PositionDetailPanel';
import { PositionCommentsPanel } from '@/components/PositionCommentsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Position, RollChain } from '@shared/schema';
import { format } from 'date-fns';
import { Link2, MessageSquare, Unlink, RefreshCw, AlertCircle, X, Activity, Redo2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePriceCache, calculateLivePositionPL } from '@/hooks/use-price-cache';
import { computePositionHash } from '@/lib/positionHash';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { 
  calculateGreeks, 
  calculatePositionGreeks, 
  type GreeksResult,
  formatDelta,
  formatGamma,
  formatTheta,
  formatVega
} from '@/lib/blackScholes';

interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: string;
  previousClose: number;
  latestTradingDay: string;
}

interface OptionLegData {
  symbol: string;
  strike: number;
  expiration: string;
  type: string;
  contractId?: string;
  bid: number;
  ask: number;
  last: number;
  mark: number;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  impliedVolatility: number | null;
  volume: number;
  openInterest: number;
  underlyingPrice: number | null;
  error?: string;
}

interface OpenPositionsProps {
  positions: Position[];
  rollChains: RollChain[];
  onUngroupPosition?: (groupId: string) => Promise<void>;
  onDataChange?: () => Promise<boolean>;
}

export default function OpenPositions({ positions, rollChains, onUngroupPosition, onDataChange }: OpenPositionsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [symbolFilter, setSymbolFilter] = useState('all');
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [selectedPositionHash, setSelectedPositionHash] = useState('');
  const [selectedPositionDesc, setSelectedPositionDesc] = useState('');
  const [positionHashes, setPositionHashes] = useState<Map<string, string>>(new Map());
  const [ungroupingId, setUngroupingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  
  // Live price state
  const [liveQuotes, setLiveQuotes] = useState<Record<string, StockQuote>>({});
  const [optionData, setOptionData] = useState<Record<string, OptionLegData>>({});
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const { toast } = useToast();
  const { setPositionPrices, getPositionPrices, clearAllPrices, lastRefreshTime, setLastRefreshTime } = usePriceCache();

  const openPositions = positions.filter((p) => p.status === 'open');
  
  // Create stable key from position IDs to trigger hydration on remount
  const openPositionIds = useMemo(
    () => openPositions.map(p => p.id).sort().join(','),
    [openPositions]
  );
  
  // Hydrate prices from cache on mount/remount
  useEffect(() => {
    if (openPositions.length === 0) return;
    
    const cachedOptionData: Record<string, OptionLegData> = {};
    const cachedQuotes: Record<string, StockQuote> = {};
    let hasAnyData = false;
    
    for (const pos of openPositions) {
      const cachedPrices = getPositionPrices(pos.id);
      if (cachedPrices) {
        hasAnyData = true;
        Object.entries(cachedPrices).forEach(([legId, legData]) => {
          cachedOptionData[legId] = legData as unknown as OptionLegData;
          
          // Extract underlying price for stock quotes
          const typedLegData = legData as unknown as OptionLegData;
          if (typedLegData.underlyingPrice && typedLegData.symbol && !cachedQuotes[typedLegData.symbol]) {
            cachedQuotes[typedLegData.symbol] = {
              symbol: typedLegData.symbol,
              price: typedLegData.underlyingPrice,
              change: 0,
              changePercent: '0',
              previousClose: 0,
              latestTradingDay: '',
            };
          }
        });
      }
    }
    
    if (hasAnyData) {
      setOptionData(cachedOptionData);
      setLiveQuotes(cachedQuotes);
    }
  }, [openPositionIds, getPositionPrices]);
  
  useEffect(() => {
    async function computeHashes() {
      const hashMap = new Map<string, string>();
      for (const pos of openPositions) {
        const hash = await computePositionHash(pos);
        hashMap.set(pos.id, hash);
      }
      setPositionHashes(hashMap);
    }
    if (openPositions.length > 0) {
      computeHashes();
    }
  }, [openPositions.length]);
  
  // Fetch comment counts for all position hashes
  const allHashes = useMemo(() => Array.from(positionHashes.values()), [positionHashes]);
  
  const { data: commentCountsData } = useQuery<{ success: boolean; counts: Record<string, number> }>({
    queryKey: ['/api/position-comments/counts', allHashes],
    queryFn: async () => {
      if (allHashes.length === 0) return { success: true, counts: {} };
      const res = await apiRequest('POST', '/api/position-comments/counts', { positionHashes: allHashes });
      return res.json();
    },
    enabled: isAuthenticated && allHashes.length > 0,
    staleTime: 30000,
  });
  
  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (commentCountsData?.counts) {
      Object.entries(commentCountsData.counts).forEach(([hash, count]) => {
        counts.set(hash, count);
      });
    }
    return counts;
  }, [commentCountsData]);
  
  const getCommentCount = (posId: string): number => {
    const hash = positionHashes.get(posId);
    if (!hash) return 0;
    return commentCounts.get(hash) || 0;
  };
  
  const handleOpenComments = (pos: Position) => {
    const hash = positionHashes.get(pos.id);
    if (hash) {
      setSelectedPositionHash(hash);
      setSelectedPositionDesc(`${pos.symbol} - ${pos.strategyType} (${pos.entryDate})`);
      setCommentsPanelOpen(true);
    }
  };
  
  const handleUngroupPosition = async (pos: Position) => {
    // Handle manually grouped positions (use existing API)
    if (pos.manualGroupId && onUngroupPosition) {
      setUngroupingId(pos.manualGroupId);
      try {
        await onUngroupPosition(pos.manualGroupId);
        toast({
          title: 'Position ungrouped',
          description: 'The position has been ungrouped. Transactions will be re-analyzed.',
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to ungroup position',
          variant: 'destructive',
        });
      } finally {
        setUngroupingId(null);
      }
      return;
    }
    
    // Handle auto-grouped positions (use new API)
    if (pos.legs && pos.legs.length >= 2) {
      setUngroupingId(pos.id);
      try {
        const response = await apiRequest('POST', '/api/ungroup-position', {
          legs: pos.legs.map(leg => ({
            transactionId: leg.transactionId,
            transCode: leg.transCode,
            optionType: leg.optionType,
          })),
          transactionIds: pos.transactionIds,
        });
        
        const data = await response.json();
        
        if (data.success) {
          toast({
            title: 'Position ungrouped',
            description: data.message || 'The position has been split into separate legs.',
          });
          // Refresh data to show updated positions
          if (onDataChange) {
            await onDataChange();
          }
        } else {
          throw new Error(data.message || 'Failed to ungroup position');
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to ungroup position',
          variant: 'destructive',
        });
      } finally {
        setUngroupingId(null);
      }
    }
  };

  const handleRestoreAutoGrouping = async (pos: Position) => {
    if (!pos.originAutoGroupHash) {
      toast({
        title: 'Cannot restore',
        description: 'This position was not created from an ungroup operation.',
        variant: 'destructive',
      });
      return;
    }

    setRestoringId(pos.id);
    try {
      const response = await apiRequest('POST', '/api/restore-auto-grouping', {
        originAutoGroupHash: pos.originAutoGroupHash,
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Auto-grouping restored',
          description: data.message || 'The position will be auto-grouped again.',
        });
        // Refresh data to show updated positions
        if (onDataChange) {
          await onDataChange();
        }
      } else {
        throw new Error(data.message || 'Failed to restore auto-grouping');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to restore auto-grouping',
        variant: 'destructive',
      });
    } finally {
      setRestoringId(null);
    }
  };
  
  // Build leg requests from positions for options chain API
  const buildLegRequests = () => {
    const legs: { symbol: string; strike: number; expiration: string; type: 'call' | 'put'; legId: string }[] = [];
    
    for (const pos of openPositions) {
      if (pos.legs && Array.isArray(pos.legs)) {
        for (let i = 0; i < pos.legs.length; i++) {
          const leg = pos.legs[i];
          if (leg && leg.strike && leg.expiration && leg.optionType) {
            legs.push({
              symbol: pos.symbol,
              strike: leg.strike,
              expiration: leg.expiration,
              type: leg.optionType.toLowerCase() as 'call' | 'put',
              legId: `${pos.id}-leg-${i}`,
            });
          }
        }
      }
    }
    
    return legs;
  };

  // Fetch live quotes for underlying symbols and options chain
  const fetchLiveQuotes = async () => {
    if (!isAuthenticated) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to fetch live option prices.',
        variant: 'destructive',
      });
      return;
    }
    
    const uniqueSymbols = Array.from(new Set(openPositions.map((p) => p.symbol)));
    if (uniqueSymbols.length === 0) return;
    
    setIsLoadingQuotes(true);
    setQuotesError(null);
    
    const allErrors: string[] = [];
    
    try {
      // Build leg requests for options chain
      const legRequests = buildLegRequests();
      
      // Fetch options chain data with Greeks (groups by symbol internally)
      if (legRequests.length > 0) {
        const chainResponse = await apiRequest('POST', '/api/options/chain', { legs: legRequests });
        const chainData = await chainResponse.json();
        
        if (chainData.success && chainData.optionData) {
          setOptionData(chainData.optionData);
          
          // Write prices to shared cache grouped by position ID
          const pricesByPosition: Record<string, Record<string, OptionLegData>> = {};
          Object.entries(chainData.optionData as Record<string, OptionLegData>).forEach(([legId, legData]) => {
            const positionId = legId.split('-leg-')[0];
            if (!pricesByPosition[positionId]) {
              pricesByPosition[positionId] = {};
            }
            pricesByPosition[positionId][legId] = legData;
          });
          
          Object.entries(pricesByPosition).forEach(([positionId, prices]) => {
            setPositionPrices(positionId, prices as any);
          });
          
          // Extract underlying prices from options data
          const underlyingPrices: Record<string, StockQuote> = {};
          Object.values(chainData.optionData as Record<string, OptionLegData>).forEach((leg) => {
            if (leg.underlyingPrice && !underlyingPrices[leg.symbol]) {
              underlyingPrices[leg.symbol] = {
                symbol: leg.symbol,
                price: leg.underlyingPrice,
                change: 0,
                changePercent: '0',
                previousClose: 0,
                latestTradingDay: '',
              };
            }
          });
          setLiveQuotes(underlyingPrices);
        }
        
        if (chainData.errors && chainData.errors.length > 0) {
          allErrors.push(...chainData.errors);
          if (chainData.errors.some((e: string) => e.includes('Rate limit'))) {
            setQuotesError('API rate limit reached. Try again in a minute.');
          }
        }
        
        if (!chainData.success && chainData.message) {
          setQuotesError(chainData.message);
        }
      } else {
        // No option legs, just fetch stock quotes for stock positions
        const allQuotes: Record<string, StockQuote> = {};
        
        for (let i = 0; i < uniqueSymbols.length; i += 5) {
          const batch = uniqueSymbols.slice(i, i + 5);
          const response = await apiRequest('POST', '/api/options/quotes', { symbols: batch });
          const data = await response.json();
          
          if (data.success && data.quotes) {
            Object.assign(allQuotes, data.quotes);
          }
          
          if (data.errors && data.errors.length > 0) {
            allErrors.push(...data.errors);
            if (data.errors.some((e: string) => e.includes('Rate limit'))) {
              setQuotesError('API rate limit reached. Try again in a minute.');
              break;
            }
          }
          
          if (!data.success && data.message) {
            setQuotesError(data.message);
            break;
          }
          
          if (i + 5 < uniqueSymbols.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        setLiveQuotes(allQuotes);
      }
      
      setLastRefreshTime(new Date());
      
      const symbolCount = uniqueSymbols.length;
      const legCount = legRequests.length;
      
      toast({
        title: 'Market data updated',
        description: legCount > 0 
          ? `Fetched prices for ${legCount} option leg(s) across ${symbolCount} symbol(s)`
          : `Fetched prices for ${symbolCount} symbol(s)`,
      });
    } catch (error) {
      console.error('Failed to fetch quotes:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch live prices';
      setQuotesError(message);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoadingQuotes(false);
    }
  };

  const symbols = useMemo(() => {
    return Array.from(new Set(openPositions.map((p) => p.symbol))).sort();
  }, [openPositions]);

  const filteredPositions = useMemo(() => {
    return openPositions.filter((position) => {
      const matchesSearch =
        searchQuery === '' ||
        position.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        position.strategyType.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStrategy =
        strategyFilter === 'all' || position.strategyType === strategyFilter;

      const matchesSymbol = symbolFilter === 'all' || position.symbol === symbolFilter;

      return matchesSearch && matchesStrategy && matchesSymbol;
    });
  }, [openPositions, searchQuery, strategyFilter, symbolFilter]);

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

  // Helper to find roll chain for a position
  const getRollChainForPosition = (position: Position): RollChain | null => {
    if (!position.rollChainId) return null;
    return rollChains.find((chain) => chain.chainId === position.rollChainId) || null;
  };

  // Helper to get aggregated Greeks for a position's legs with Black-Scholes calculations
  const getPositionGreeks = (position: Position): {
    legs: { legId: string; data: OptionLegData | null; legInfo: any; greeks: GreeksResult | null }[];
    hasData: boolean;
    positionGreeks: { totalDelta: number; totalGamma: number; totalTheta: number; totalVega: number } | null;
  } => {
    const legsData: { legId: string; data: OptionLegData | null; legInfo: any; greeks: GreeksResult | null }[] = [];
    
    if (position.legs && Array.isArray(position.legs)) {
      position.legs.forEach((leg, i) => {
        const legId = `${position.id}-leg-${i}`;
        const data = optionData[legId] || null;
        
        let greeks: GreeksResult | null = null;
        if (data && !data.error && data.underlyingPrice && data.impliedVolatility && leg.expiration) {
          const mark = data.mark || ((data.bid + data.ask) / 2);
          greeks = calculateGreeks({
            underlyingPrice: data.underlyingPrice,
            strikePrice: leg.strike,
            expirationDate: leg.expiration,
            optionType: (leg.optionType?.toLowerCase() || 'call') as 'call' | 'put',
            impliedVolatility: data.impliedVolatility,
            marketPrice: mark,
          });
        }
        
        legsData.push({ legId, data, legInfo: leg, greeks });
      });
    }
    
    // Calculate position-level Greeks
    let positionGreeks = null;
    const legsWithGreeks = legsData.filter(l => l.greeks).map(l => ({
      greeks: l.greeks!,
      quantity: l.legInfo.quantity || 1,
      transCode: l.legInfo.transCode || 'BTO',
    }));
    
    if (legsWithGreeks.length > 0) {
      positionGreeks = calculatePositionGreeks(legsWithGreeks);
    }
    
    return {
      legs: legsData,
      hasData: legsData.some(l => l.data && !l.data.error),
      positionGreeks,
    };
  };
  
  // Helper to get live P/L for a position using cached prices
  const getLivePositionPL = (position: Position): number | null => {
    // Build cached prices object for this position from optionData
    const positionPrices: Record<string, OptionLegData> = {};
    
    if (position.legs && Array.isArray(position.legs)) {
      position.legs.forEach((_, i) => {
        const legId = `${position.id}-leg-${i}`;
        const data = optionData[legId];
        if (data) {
          positionPrices[legId] = data;
        }
      });
    }
    
    // Only calculate if we have any cached prices
    if (Object.keys(positionPrices).length === 0) {
      return null;
    }
    
    return calculateLivePositionPL(position as any, positionPrices as any);
  };

  const columns: Column<Position>[] = [
    {
      key: 'symbol',
      header: 'Symbol',
      accessor: (row) => {
        const quote = liveQuotes[row.symbol];
        return (
          <div className="flex flex-col">
            <span className="font-medium">{row.symbol}</span>
            {quote && (
              <div className="text-xs text-muted-foreground tabular-nums">
                ${quote.price.toFixed(2)}
              </div>
            )}
          </div>
        );
      },
      sortValue: (row) => row.symbol,
    },
    {
      key: 'strategy',
      header: 'Strategy',
      accessor: (row) => (
        <div className="flex items-center gap-1.5">
          <StrategyBadge strategy={row.strategyType} />
          {row.isManuallyGrouped && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
              Manual
            </Badge>
          )}
        </div>
      ),
      sortValue: (row) => row.strategyType,
    },
    {
      key: 'entryDate',
      header: 'Entry Date',
      accessor: (row) => <span className="tabular-nums">{formatDate(row.entryDate)}</span>,
      sortValue: (row) => new Date(row.entryDate).getTime(),
    },
    {
      key: 'expiration',
      header: 'Expiration',
      accessor: (row) => {
        const openLegs = row.legs.filter(leg => leg.status === 'open' && leg.expiration);
        if (openLegs.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        const expirations = openLegs
          .map(leg => new Date(leg.expiration).getTime())
          .filter(t => Number.isFinite(t));
        if (expirations.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        const nearestExpiration = Math.min(...expirations);
        return <span className="tabular-nums">{formatDate(new Date(nearestExpiration).toISOString())}</span>;
      },
      sortValue: (row) => {
        const openLegs = row.legs.filter(leg => leg.status === 'open' && leg.expiration);
        if (openLegs.length === 0) return Infinity;
        const expirations = openLegs
          .map(leg => new Date(leg.expiration).getTime())
          .filter(t => Number.isFinite(t));
        if (expirations.length === 0) return Infinity;
        return Math.min(...expirations);
      },
    },
    {
      key: 'totalCredit',
      header: 'Total Credit',
      accessor: (row) => (
        <span className="tabular-nums text-green-600">{formatCurrency(row.totalCredit)}</span>
      ),
      sortValue: (row) => row.totalCredit,
      className: 'text-right',
    },
    {
      key: 'totalDebit',
      header: 'Total Debit',
      accessor: (row) => (
        <span className="tabular-nums text-red-600">{formatCurrency(Math.abs(row.totalDebit))}</span>
      ),
      sortValue: (row) => Math.abs(row.totalDebit),
      className: 'text-right',
    },
    {
      key: 'netPL',
      header: 'Net P/L',
      accessor: (row) => (
        <span className={`font-semibold tabular-nums ${row.netPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(row.netPL)}
        </span>
      ),
      sortValue: (row) => row.netPL,
      className: 'text-right',
    },
    {
      key: 'livePL',
      header: 'Live P/L',
      accessor: (row) => {
        const livePL = getLivePositionPL(row);
        const greeksInfo = getPositionGreeks(row);
        
        if (livePL === null) {
          return <span className="text-muted-foreground text-sm" data-testid={`live-pl-${row.id}`}>—</span>;
        }
        
        const plElement = (
          <span 
            className={`font-semibold tabular-nums ${livePL >= 0 ? 'text-green-600' : 'text-red-600'} ${greeksInfo.positionGreeks ? 'cursor-help underline decoration-dotted decoration-muted-foreground/50' : ''}`}
            data-testid={`live-pl-${row.id}`}
          >
            {formatCurrency(livePL)}
          </span>
        );
        
        if (!greeksInfo.positionGreeks) {
          return plElement;
        }
        
        const { totalDelta, totalGamma, totalTheta, totalVega } = greeksInfo.positionGreeks;
        
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1">
                {plElement}
                <Activity className="w-3 h-3 text-muted-foreground" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="w-56 p-3" data-testid="tooltip-position-greeks">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Activity className="w-3 h-3" />
                  Position Greeks
                </div>
                
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Delta ($)</span>
                    <span className={`font-mono tabular-nums ${totalDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {totalDelta >= 0 ? '+' : ''}{totalDelta.toFixed(0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Gamma</span>
                    <span className="font-mono tabular-nums">
                      {totalGamma >= 0 ? '+' : ''}{totalGamma.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Theta ($/day)</span>
                    <span className={`font-mono tabular-nums ${totalTheta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {totalTheta >= 0 ? '+' : ''}${totalTheta.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Vega ($/%IV)</span>
                    <span className="font-mono tabular-nums">
                      {totalVega >= 0 ? '+' : ''}${totalVega.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="border-t pt-2 mt-2 text-[10px] text-muted-foreground">
                  <p>Delta = P/L per $1 move. Gamma = delta change per $1. Theta = daily time decay. Vega = P/L per 1% IV move.</p>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      },
      sortValue: (row) => {
        const livePL = getLivePositionPL(row);
        return livePL ?? 0;
      },
      className: 'text-right',
    },
    {
      key: 'rollChain',
      header: 'Roll Chain',
      accessor: (row) => {
        const chain = getRollChainForPosition(row);
        if (!chain) {
          return <span className="text-muted-foreground">-</span>;
        }
        
        return (
          <div className="flex items-center gap-2" data-testid={`rollchain-${row.id}`}>
            <Badge variant="outline" className="gap-1">
              <Link2 className="w-3 h-3" />
              Rolled ({chain.rollCount})
            </Badge>
            <span className={`tabular-nums font-medium ${chain.netPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(chain.netPL)}
            </span>
          </div>
        );
      },
      sortValue: (row) => {
        const chain = getRollChainForPosition(row);
        return chain ? chain.netPL : 0;
      },
      className: 'text-right',
    },
    {
      key: 'livePrices',
      header: 'Live Prices',
      accessor: (row) => {
        const greeksInfo = getPositionGreeks(row);
        
        if (!greeksInfo.hasData) {
          return <span className="text-muted-foreground text-xs">-</span>;
        }
        
        return (
          <div className="flex flex-col gap-0.5 bg-background rounded px-1 py-0.5">
            {greeksInfo.legs.map(({ legId, data, legInfo, greeks }) => {
              if (!data || data.error) {
                return null;
              }
              
              const legLabel = `${legInfo.strike}${legInfo.optionType?.[0]?.toUpperCase() || ''}`;
              const mark = data.mark || ((data.bid + data.ask) / 2);
              const isShort = legInfo.transCode === 'STO' || legInfo.transCode === 'STC';
              const quantity = legInfo.quantity || 1;
              
              return (
                <Tooltip key={legId}>
                  <TooltipTrigger asChild>
                    <div className="text-xs cursor-help">
                      <span className="text-muted-foreground mr-1">{legLabel}:</span>
                      <span className="tabular-nums font-medium">
                        ${mark.toFixed(2)}
                      </span>
                      {greeks && (
                        <span className="tabular-nums text-muted-foreground ml-1">
                          Δ:{formatDelta(greeks.delta)}
                        </span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="w-72 p-3" data-testid="tooltip-leg-greeks">
                    <div className="space-y-2">
                      <div className="text-xs font-medium mb-2">
                        {data.symbol} ${data.strike} {data.type?.toUpperCase()} {data.expiration}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div>Bid: <span className="tabular-nums">${(data.bid || 0).toFixed(2)}</span></div>
                        <div>Ask: <span className="tabular-nums">${(data.ask || 0).toFixed(2)}</span></div>
                        <div>Mark: <span className="tabular-nums font-medium">${mark.toFixed(2)}</span></div>
                        <div>Last: <span className="tabular-nums">${(data.last || 0).toFixed(2)}</span></div>
                      </div>
                      
                      {greeks && (
                        <div className="border-t pt-2 mt-2">
                          <div className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            Black-Scholes Greeks
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div>
                              <span className="text-muted-foreground text-[10px] block">Per Contract</span>
                              <div className="space-y-0.5 mt-1">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Δ</span>
                                  <span className="font-mono tabular-nums">{formatDelta(greeks.delta)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Γ</span>
                                  <span className="font-mono tabular-nums">{formatGamma(greeks.gamma)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Θ</span>
                                  <span className={`font-mono tabular-nums ${greeks.theta < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                    {formatTheta(greeks.theta)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">ν</span>
                                  <span className="font-mono tabular-nums">{formatVega(greeks.vega)}</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-[10px] block">
                                Position ({isShort ? 'Short' : 'Long'} {quantity})
                              </span>
                              <div className="space-y-0.5 mt-1">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">$Δ</span>
                                  <span className={`font-mono tabular-nums ${(greeks.delta * quantity * 100 * (isShort ? -1 : 1)) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {(greeks.delta * quantity * 100 * (isShort ? -1 : 1)).toFixed(0)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">$Θ/day</span>
                                  <span className={`font-mono tabular-nums ${(greeks.theta * quantity * 100 * (isShort ? -1 : 1)) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    ${(greeks.theta * quantity * 100 * (isShort ? -1 : 1)).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 mt-2 pt-1 border-t text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">IV</span>
                              <span className="font-mono tabular-nums">{(greeks.impliedVolatility * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">DTE</span>
                              <span className="font-mono tabular-nums">{Math.round(greeks.daysToExpiration)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Theo</span>
                              <span className="font-mono tabular-nums">${greeks.theoreticalPrice.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Diff</span>
                              <span className={`font-mono tabular-nums ${greeks.priceDiff > 0 ? 'text-amber-500' : greeks.priceDiff < 0 ? 'text-green-500' : ''}`}>
                                {greeks.priceDiffPercent >= 0 ? '+' : ''}{greeks.priceDiffPercent.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {!greeks && data.impliedVolatility && (
                        <div className="border-t pt-1 mt-1 text-xs">
                          IV: <span className="tabular-nums font-medium">{(data.impliedVolatility * 100).toFixed(1)}%</span>
                        </div>
                      )}
                      
                      <div className="border-t pt-1 mt-1 text-xs text-muted-foreground">
                        Vol: {(data.volume || 0).toLocaleString()} | OI: {(data.openInterest || 0).toLocaleString()}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        );
      },
      sortValue: (row) => {
        const greeksInfo = getPositionGreeks(row);
        const firstLeg = greeksInfo.legs[0]?.data;
        return firstLeg?.mark || 0;
      },
    },
    ...(isAuthenticated ? [{
      key: 'notes',
      header: 'Actions',
      accessor: (row: Position) => {
        const count = getCommentCount(row.id);
        return (
          <div className="flex items-center gap-1 justify-center">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 relative"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenComments(row);
              }}
              data-testid={`button-notes-position-${row.id}`}
            >
              <MessageSquare className={`h-4 w-4 ${count > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </Button>
            {row.legs && row.legs.length >= 2 && !row.originAutoGroupHash && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUngroupPosition(row);
                    }}
                    disabled={(row.manualGroupId && ungroupingId === row.manualGroupId) || ungroupingId === row.id}
                    data-testid={`button-ungroup-position-${row.id}`}
                  >
                    <Unlink className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{row.isManuallyGrouped ? 'Ungroup this manually grouped position' : 'Split this multi-leg position into separate legs'}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {row.originAutoGroupHash && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestoreAutoGrouping(row);
                    }}
                    disabled={restoringId === row.id}
                    data-testid={`button-restore-position-${row.id}`}
                  >
                    <Redo2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Restore auto-grouping (undo ungroup)</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
      sortValue: () => 0,
      className: 'text-center w-[80px]',
    }] : []),
  ] as Column<Position>[];

  const handleClearFilters = () => {
    setSearchQuery('');
    setStrategyFilter('all');
    setSymbolFilter('all');
  };

  // Calculate totals for the footer
  const totals = useMemo(() => {
    const totalCredit = filteredPositions.reduce((sum, p) => sum + p.totalCredit, 0);
    const totalDebit = filteredPositions.reduce((sum, p) => sum + p.totalDebit, 0);
    const netPL = filteredPositions.reduce((sum, p) => sum + p.netPL, 0);
    
    // Calculate total live P/L
    let totalLivePL: number | null = null;
    let hasAnyLiveData = false;
    
    for (const pos of filteredPositions) {
      const livePL = getLivePositionPL(pos);
      if (livePL !== null) {
        hasAnyLiveData = true;
        totalLivePL = (totalLivePL ?? 0) + livePL;
      }
    }

    return {
      totalCredit,
      totalDebit,
      netPL,
      livePL: hasAnyLiveData ? totalLivePL : null,
    };
  }, [filteredPositions, optionData]);

  const footer = [
    <span className="font-semibold">Totals</span>,
    '', // Strategy
    '', // Entry Date
    '', // Expiration
    <span className="tabular-nums text-green-600">{formatCurrency(totals.totalCredit)}</span>,
    <span className="tabular-nums text-red-600">{formatCurrency(Math.abs(totals.totalDebit))}</span>,
    <span className={`font-semibold tabular-nums ${totals.netPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
      {formatCurrency(totals.netPL)}
    </span>,
    totals.livePL !== null ? (
      <span className={`font-semibold tabular-nums ${totals.livePL >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="total-live-pl">
        {formatCurrency(totals.livePL)}
      </span>
    ) : (
      <span className="text-muted-foreground text-sm">—</span>
    ),
    '', // Roll Chain
    '', // Live Prices
    ...(isAuthenticated ? [''] : []),
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Open Positions</h1>
          <p className="text-muted-foreground">
            Currently active positions with credit/debit tracking and profitability analysis
          </p>
        </div>
        
        {openPositions.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchLiveQuotes}
                    disabled={isLoadingQuotes}
                    data-testid="button-refresh-quotes"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingQuotes ? 'animate-spin' : ''}`} />
                    {isLoadingQuotes ? 'Loading...' : lastRefreshTime ? 'Refresh Prices' : 'Get Live Prices'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Fetch live option prices from Yahoo Finance</p>
                  {!isAuthenticated && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Sign in to refresh prices
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
              {lastRefreshTime && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        clearAllPrices();
                        setLiveQuotes({});
                        setOptionData({});
                        setQuotesError(null);
                        setLastRefreshTime(null);
                      }}
                      data-testid="button-clear-prices"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Clear Prices
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clear cached live prices</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {lastRefreshTime && (
              <span className="text-xs text-muted-foreground">
                Updated {format(lastRefreshTime, 'h:mm a')}
              </span>
            )}
            {quotesError && (
              <div className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="w-3 h-3" />
                {quotesError}
              </div>
            )}
          </div>
        )}
      </div>

      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        strategyFilter={strategyFilter}
        onStrategyChange={setStrategyFilter}
        symbolFilter={symbolFilter}
        onSymbolChange={setSymbolFilter}
        statusFilter="all"
        onStatusChange={() => {}}
        onClearFilters={handleClearFilters}
        symbols={symbols}
        showStatusFilter={false}
      />

      <DataTable
        data={filteredPositions}
        columns={columns}
        keyExtractor={(row) => row.id}
        onRowClick={(row) => setSelectedPosition(row)}
        emptyMessage="No open positions found"
        testId="table-open-positions"
        footer={footer}
        defaultSortKey="expiration"
        defaultSortDirection="asc"
      />

      <PositionDetailPanel
        position={selectedPosition}
        rollChains={rollChains}
        isOpen={selectedPosition !== null}
        onClose={() => setSelectedPosition(null)}
      />
      
      {isAuthenticated && (
        <PositionCommentsPanel
          isOpen={commentsPanelOpen}
          onClose={() => setCommentsPanelOpen(false)}
          positionHash={selectedPositionHash}
          positionDescription={selectedPositionDesc}
        />
      )}
    </div>
  );
}
