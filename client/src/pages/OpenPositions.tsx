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
import { Link2, MessageSquare, Unlink, RefreshCw, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePriceCache } from '@/hooks/use-price-cache';
import { computePositionHash } from '@/lib/positionHash';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

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
}

export default function OpenPositions({ positions, rollChains, onUngroupPosition }: OpenPositionsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [symbolFilter, setSymbolFilter] = useState('all');
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [selectedPositionHash, setSelectedPositionHash] = useState('');
  const [selectedPositionDesc, setSelectedPositionDesc] = useState('');
  const [positionHashes, setPositionHashes] = useState<Map<string, string>>(new Map());
  const [ungroupingId, setUngroupingId] = useState<string | null>(null);
  
  // Live price state
  const [liveQuotes, setLiveQuotes] = useState<Record<string, StockQuote>>({});
  const [optionData, setOptionData] = useState<Record<string, OptionLegData>>({});
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const { toast } = useToast();
  const { setPositionPrices, getPositionPrices, lastRefreshTime, setLastRefreshTime } = usePriceCache();

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
    if (!pos.manualGroupId || !onUngroupPosition) return;
    
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

  // Helper to get aggregated Greeks for a position's legs
  const getPositionGreeks = (position: Position): {
    legs: { legId: string; data: OptionLegData | null; legInfo: any }[];
    hasData: boolean;
  } => {
    const legsData: { legId: string; data: OptionLegData | null; legInfo: any }[] = [];
    
    if (position.legs && Array.isArray(position.legs)) {
      position.legs.forEach((leg, i) => {
        const legId = `${position.id}-leg-${i}`;
        const data = optionData[legId] || null;
        legsData.push({ legId, data, legInfo: leg });
      });
    }
    
    return {
      legs: legsData,
      hasData: legsData.some(l => l.data && !l.data.error),
    };
  };

  // Helper to calculate live unrealized P/L for a position
  const calculateUnrealizedPL = (position: Position): { 
    currentValue: number | null; 
    unrealizedPL: number | null;
    hasLiveData: boolean;
    isPartialData: boolean;
  } => {
    // No legs means we can't calculate
    if (!position.legs || position.legs.length === 0) {
      return { currentValue: null, unrealizedPL: null, hasLiveData: false, isPartialData: false };
    }
    
    // Calculate from each leg
    // Current value = what we'd receive/pay to close the position right now
    let totalCurrentValue = 0;
    let legsWithValidPrices = 0;
    const totalLegs = position.legs.length;
    
    for (let i = 0; i < position.legs.length; i++) {
      const leg = position.legs[i];
      const legId = `${position.id}-leg-${i}`;
      
      // Check if this is a stock leg (Buy/Sell) or option leg (STO/BTO/STC/BTC)
      const isStockLeg = leg.transCode === 'Buy' || leg.transCode === 'Sell';
      
      let price: number | null = null;
      let multiplier = 1;
      
      if (isStockLeg) {
        // Stock legs: get price from liveQuotes using leg.symbol (shares × stock price)
        // Priority: leg.symbol quote > position.symbol quote > any underlying price from option data
        const quote = liveQuotes[leg.symbol] || liveQuotes[position.symbol];
        if (quote && quote.price > 0) {
          price = quote.price;
          multiplier = 1; // Stock: 1 share = 1 share
        } else {
          // Fallback: try to find underlying price from any cached option leg data
          for (let j = 0; j < position.legs.length; j++) {
            const optLegId = `${position.id}-leg-${j}`;
            const optData = optionData[optLegId];
            if (optData && optData.underlyingPrice && optData.underlyingPrice > 0 && optData.symbol === leg.symbol) {
              price = optData.underlyingPrice;
              multiplier = 1;
              break;
            }
          }
        }
      } else {
        // Option legs: get price from optionData (contracts × mark × 100)
        const data = optionData[legId];
        if (data && !data.error) {
          // Check for actual price data (bid, ask, or mark must be present and valid)
          const hasBidAsk = (data.bid > 0 || data.ask > 0);
          const hasMark = data.mark > 0;
          if (hasBidAsk || hasMark) {
            price = data.mark || ((data.bid + data.ask) / 2);
            multiplier = 100; // Options: 1 contract = 100 shares
          }
        }
      }
      
      // If we couldn't get a valid price for this leg, skip it
      if (price === null) {
        continue;
      }
      
      legsWithValidPrices++;
      
      // Use raw quantity - Robinhood imports already have correct sign
      // positive = long, negative = short
      const quantity = leg.quantity || 0;
      
      // For closing:
      // - Long leg (qty > 0): we sell, so we receive price * qty * multiplier (positive)
      // - Short leg (qty < 0): we buy back, so we pay price * |qty| * multiplier (negative)
      // Since qty is already signed correctly, multiplying gives correct sign
      const legCloseValue = price * quantity * multiplier;
      totalCurrentValue += legCloseValue;
    }
    
    const hasAnyLiveData = legsWithValidPrices > 0;
    const isPartialData = hasAnyLiveData && legsWithValidPrices < totalLegs;
    
    // For partial data, don't calculate P/L to avoid misleading users
    // Only show complete calculations when all legs have prices
    if (!hasAnyLiveData || isPartialData) {
      return { 
        currentValue: null, 
        unrealizedPL: null, 
        hasLiveData: hasAnyLiveData, 
        isPartialData 
      };
    }
    
    // Net entry = credits received minus debits paid
    // IMPORTANT: totalDebit is stored as a POSITIVE absolute value in the database
    // totalCredit is positive (money received), totalDebit is positive (money paid)
    // For credit spread: totalCredit > 0, totalDebit = 0 → netEntry positive (we received money)
    // For debit spread: totalCredit = 0, totalDebit > 0 → netEntry negative (we paid money)
    const netEntry = position.totalCredit - position.totalDebit;
    
    // Unrealized P/L = Net Entry + Current Close Value
    // Credit spread example: received $100 credit (netEntry = 100), 
    //   would pay $60 to close (totalCurrentValue = -60), P/L = 100 + (-60) = $40 profit
    // Debit spread example: paid $50 (netEntry = -50),
    //   would receive $80 to close (totalCurrentValue = 80), P/L = -50 + 80 = $30 profit
    const unrealizedPL = netEntry + totalCurrentValue;
    
    return { 
      currentValue: totalCurrentValue, 
      unrealizedPL, 
      hasLiveData: true,
      isPartialData: false
    };
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
              <div className="flex items-center gap-1 text-xs">
                <span className="tabular-nums">${quote.price.toFixed(2)}</span>
                <span className={`flex items-center ${parseFloat(quote.changePercent) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {parseFloat(quote.changePercent) >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {quote.changePercent}%
                </span>
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
      key: 'currentValue',
      header: 'Close Value',
      accessor: (row) => {
        const result = calculateUnrealizedPL(row);
        
        // Priority 1: Check for partial data first (some legs have prices but not all)
        if (result.isPartialData) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="text-muted-foreground text-xs">Partial</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Some option legs are missing price data. Refresh prices or check if options have expired.
              </TooltipContent>
            </Tooltip>
          );
        }
        
        // Priority 2: No live data at all
        if (!result.hasLiveData) {
          return (
            <span className="text-muted-foreground text-xs">--</span>
          );
        }
        
        // Priority 3: Have complete live data - show the value
        const currentValue = result.currentValue!;
        const isLiability = currentValue < 0;
        
        return (
          <div className="flex items-center gap-1.5 justify-end">
            <span className={`tabular-nums ${isLiability ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(currentValue)}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              </TooltipTrigger>
              <TooltipContent>
                Live market value as of {lastRefreshTime ? format(lastRefreshTime, 'h:mm a') : 'now'}
              </TooltipContent>
            </Tooltip>
          </div>
        );
      },
      sortValue: (row) => {
        const { currentValue } = calculateUnrealizedPL(row);
        return currentValue || 0;
      },
      className: 'text-right',
    },
    {
      key: 'unrealizedPL',
      header: 'Unrealized P/L',
      accessor: (row) => {
        const result = calculateUnrealizedPL(row);
        
        // Priority 1: Check for partial data first (some legs have prices but not all)
        if (result.isPartialData) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="text-muted-foreground text-xs">Partial</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Some option legs are missing price data. Refresh prices or check if options have expired.
              </TooltipContent>
            </Tooltip>
          );
        }
        
        // Priority 2: No live data at all
        if (!result.hasLiveData) {
          return (
            <span className="text-muted-foreground text-xs">--</span>
          );
        }
        
        // Priority 3: Have complete live data - show the value
        const unrealizedPL = result.unrealizedPL!;
        
        return (
          <div className="flex items-center gap-1.5 justify-end">
            <span className={`font-semibold tabular-nums ${unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(unrealizedPL)}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              </TooltipTrigger>
              <TooltipContent>
                Live P/L as of {lastRefreshTime ? format(lastRefreshTime, 'h:mm a') : 'now'}
              </TooltipContent>
            </Tooltip>
          </div>
        );
      },
      sortValue: (row) => {
        const { unrealizedPL } = calculateUnrealizedPL(row);
        return unrealizedPL || 0;
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
          <div className="flex flex-col gap-0.5">
            {greeksInfo.legs.map(({ legId, data, legInfo }) => {
              if (!data || data.error) {
                return null;
              }
              
              const legLabel = `${legInfo.strike}${legInfo.optionType?.[0]?.toUpperCase() || ''}`;
              const mark = data.mark || ((data.bid + data.ask) / 2);
              
              return (
                <Tooltip key={legId}>
                  <TooltipTrigger asChild>
                    <div className="text-xs cursor-help">
                      <span className="text-muted-foreground mr-1">{legLabel}:</span>
                      <span className="tabular-nums font-medium">
                        ${mark.toFixed(2)}
                      </span>
                      {data.impliedVolatility && (
                        <span className="tabular-nums text-muted-foreground ml-1">
                          IV:{(data.impliedVolatility * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="text-sm space-y-1">
                      <div className="font-medium mb-2">
                        {data.symbol} ${data.strike} {data.type?.toUpperCase()} {data.expiration}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div>Bid: <span className="tabular-nums">${(data.bid || 0).toFixed(2)}</span></div>
                        <div>Ask: <span className="tabular-nums">${(data.ask || 0).toFixed(2)}</span></div>
                        <div>Mark: <span className="tabular-nums font-medium">${mark.toFixed(2)}</span></div>
                        <div>Last: <span className="tabular-nums">${(data.last || 0).toFixed(2)}</span></div>
                      </div>
                      {data.impliedVolatility && (
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
            {row.isManuallyGrouped && row.manualGroupId && (
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
                    disabled={ungroupingId === row.manualGroupId}
                    data-testid={`button-ungroup-position-${row.id}`}
                  >
                    <Unlink className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Ungroup this manually grouped position</p>
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

    return {
      totalCredit,
      totalDebit,
      netPL,
    };
  }, [filteredPositions]);

  const footer = [
    <span className="font-semibold">Totals</span>,
    '',
    '',
    <span className="tabular-nums text-green-600">{formatCurrency(totals.totalCredit)}</span>,
    <span className="tabular-nums text-red-600">{formatCurrency(Math.abs(totals.totalDebit))}</span>,
    <span className={`font-semibold tabular-nums ${totals.netPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
      {formatCurrency(totals.netPL)}
    </span>,
    '', // Roll Chain
    '', // Greeks
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
                  {isLoadingQuotes ? 'Loading...' : 'Refresh Prices'}
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
