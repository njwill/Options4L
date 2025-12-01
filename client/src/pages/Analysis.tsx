import { useState, useMemo, useEffect, Fragment } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StrategyBadge } from '@/components/StrategyBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePriceCache, calculateLivePositionPL } from '@/hooks/use-price-cache';
import { calculateGreeks, calculatePositionGreeks, calculateIntrinsicExtrinsic, formatDelta, formatGamma, formatTheta, formatVega, type GreeksResult } from '@/lib/blackScholes';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { computePositionHash } from '@/lib/positionHash';
import { AIPortfolioReport } from '@/components/AIPortfolioReport';
import type { Position, RollChain, StockHolding, Tag } from '@shared/schema';
import { format, differenceInDays } from 'date-fns';
import { 
  RotateCcw, 
  Calendar, 
  DollarSign, 
  Target,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Activity,
  RefreshCw,
  Zap,
  Tags,
  TrendingUp,
  Percent,
  BarChart3,
  Filter,
  Sparkles
} from 'lucide-react';

type AnalysisType = 'rolls' | 'tags' | 'ai';

interface AnalysisProps {
  positions: Position[];
  rollChains: RollChain[];
  stockHoldings?: StockHolding[];
}

interface RollChainWithDetails extends RollChain {
  positions: Position[];
  daysExtended: number;
  currentLivePL?: number | null;
  nearestExpiration?: string | null;
  realizedPL?: number; // P/L from closed segments within open chains
}

export default function Analysis({ positions, rollChains, stockHoldings = [] }: AnalysisProps) {
  const [analysisType, setAnalysisType] = useState<AnalysisType>('rolls');
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());
  const [symbolFilter, setSymbolFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagSymbolFilter, setTagSymbolFilter] = useState<string>('all');
  const [positionHashes, setPositionHashes] = useState<Map<string, string>>(new Map());
  
  const { getPositionPrices, hasCachedPrices, lastRefreshTime, cacheVersion } = usePriceCache();
  const { user } = useAuth();
  const isAuthenticated = !!user;

  // Compute position hashes for tag lookups - use useEffect for side effects
  useEffect(() => {
    async function computeHashes() {
      const hashMap = new Map<string, string>();
      for (const pos of positions) {
        const hash = await computePositionHash(pos);
        hashMap.set(pos.id, hash);
      }
      setPositionHashes(hashMap);
    }
    if (positions.length > 0) {
      computeHashes();
    }
  }, [positions]);

  // Fetch user's tags
  const { data: tagsData } = useQuery<{ success: boolean; tags: Tag[] }>({
    queryKey: ['/api/tags'],
    enabled: isAuthenticated,
  });

  const availableTags = tagsData?.tags || [];

  // Fetch position-tag mappings
  const allHashes = useMemo(() => Array.from(positionHashes.values()), [positionHashes]);
  
  const { data: positionTagsData } = useQuery<{ success: boolean; tagsByPosition: Record<string, Tag[]> }>({
    queryKey: ['/api/position-tags/lookup', allHashes],
    queryFn: async () => {
      if (allHashes.length === 0) return { success: true, tagsByPosition: {} };
      const res = await apiRequest('POST', '/api/position-tags/lookup', { positionHashes: allHashes });
      return res.json();
    },
    enabled: isAuthenticated && allHashes.length > 0,
    staleTime: 30000,
  });

  // Helper to get tags for a position
  const getPositionTags = (posId: string): Tag[] => {
    const hash = positionHashes.get(posId);
    if (!hash || !positionTagsData?.tagsByPosition) return [];
    return positionTagsData.tagsByPosition[hash] || [];
  };

  // Toggle tag selection
  const toggleTagSelection = (tagId: string) => {
    setSelectedTagIds(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

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

  // Helper to get live data for an open position in a roll chain
  interface PositionLiveData {
    livePL: number | null;
    legs: Array<{
      legId: string;
      legInfo: any;
      data: any;
      greeks: GreeksResult | null;
      intrinsicExtrinsic: { intrinsicValue: number; extrinsicValue: number; moneyness: string; isITM: boolean; isOTM: boolean; isATM: boolean } | null;
    }>;
    positionGreeks: { totalDelta: number; totalGamma: number; totalTheta: number; totalVega: number } | null;
    hasData: boolean;
  }

  const getPositionLiveData = (position: Position): PositionLiveData => {
    // Use getPositionPrices to get cached data directly for this position
    const cachedPrices = getPositionPrices(position.id);
    const livePL = calculateLivePositionPL(position as any, cachedPrices as any);
    
    const legs: PositionLiveData['legs'] = [];
    
    if (position.legs && Array.isArray(position.legs)) {
      position.legs.forEach((leg: any, i: number) => {
        const legId = `${position.id}-leg-${i}`;
        const data = cachedPrices?.[legId] || null;
        
        let greeks: GreeksResult | null = null;
        let intrinsicExtrinsic = null;
        
        if (data && !data.error && data.underlyingPrice && leg.expiration) {
          const mark = data.mark || (((data.bid || 0) + (data.ask || 0)) / 2);
          
          // Calculate Greeks
          greeks = calculateGreeks({
            underlyingPrice: data.underlyingPrice,
            strikePrice: leg.strike,
            expirationDate: leg.expiration,
            optionType: (leg.optionType?.toLowerCase() || 'call') as 'call' | 'put',
            impliedVolatility: data.impliedVolatility,
            marketPrice: mark,
          });
          
          // Calculate intrinsic/extrinsic
          if (data.type) {
            intrinsicExtrinsic = calculateIntrinsicExtrinsic(
              data.underlyingPrice,
              data.strike || leg.strike,
              data.type.toLowerCase() as 'call' | 'put',
              mark
            );
          }
        }
        
        legs.push({ legId, legInfo: leg, data, greeks, intrinsicExtrinsic });
      });
    }
    
    // Calculate position-level Greeks
    let positionGreeks = null;
    const legsWithGreeks = legs.filter(l => l.greeks).map(l => ({
      greeks: l.greeks!,
      quantity: l.legInfo.quantity || 1,
      transCode: l.legInfo.transCode || 'BTO',
    }));
    
    if (legsWithGreeks.length > 0) {
      positionGreeks = calculatePositionGreeks(legsWithGreeks);
    }
    
    return {
      livePL,
      legs,
      positionGreeks,
      hasData: legs.some(l => l.data && !l.data.error),
    };
  };

  // Get all unique symbols from roll chains
  const uniqueSymbols = useMemo(() => {
    const symbols = new Set(rollChains.map(rc => rc.symbol));
    return Array.from(symbols).sort();
  }, [rollChains]);

  // Get all unique symbols from positions (for tag analysis)
  const uniquePositionSymbols = useMemo(() => {
    const symbols = new Set(positions.map(p => p.symbol));
    return Array.from(symbols).sort();
  }, [positions]);

  // Enrich roll chains with position data and live prices
  const enrichedRollChains = useMemo((): RollChainWithDetails[] => {
    return rollChains.map(chain => {
      // Find all positions in this chain
      const chainPositions = positions.filter(p => p.rollChainId === chain.chainId);
      
      // Calculate days extended (dates may be in MM/DD/YYYY format, not ISO)
      const firstDate = new Date(chain.firstEntryDate);
      const lastDate = chain.lastExitDate ? new Date(chain.lastExitDate) : new Date();
      const daysExtended = isNaN(firstDate.getTime()) || isNaN(lastDate.getTime()) 
        ? 0 
        : differenceInDays(lastDate, firstDate);
      
      // Calculate live P/L for open positions in chain using getPositionPrices
      let currentLivePL: number | null = null;
      if (chain.status === 'open') {
        const openPositions = chainPositions.filter(p => p.status === 'open');
        let hasLiveData = false;
        let totalLivePL = 0;
        
        for (const pos of openPositions) {
          // Use getPositionPrices for consistent cache access pattern
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
          currentLivePL = totalLivePL + closedPL;
        }
      }
      
      // Calculate nearest expiration from the current/latest position's legs or last segment
      let nearestExpiration: string | null = null;
      
      // First try to get from open position legs (most accurate)
      const openPos = chainPositions.find(p => p.status === 'open');
      if (openPos && openPos.legs && Array.isArray(openPos.legs)) {
        const expirations = openPos.legs
          .map((leg: any) => leg.expiration)
          .filter((exp: string) => exp)
          .map((exp: string) => new Date(exp))
          .filter((d: Date) => !isNaN(d.getTime()))
          .sort((a: Date, b: Date) => a.getTime() - b.getTime());
        
        if (expirations.length > 0) {
          nearestExpiration = expirations[0].toISOString().split('T')[0];
        }
      }
      
      // Fallback to last segment's toExpiration
      if (!nearestExpiration && chain.segments && chain.segments.length > 0) {
        const lastSegment = chain.segments[chain.segments.length - 1];
        if (lastSegment.toExpiration) {
          nearestExpiration = lastSegment.toExpiration;
        }
      }
      
      // Calculate realized P/L from closed segments (useful for open chains)
      // Defensive: ensure netPL is a valid number, default to 0 if not
      const realizedPL = chainPositions
        .filter(p => p.status === 'closed')
        .reduce((sum, p) => sum + (typeof p.netPL === 'number' && !isNaN(p.netPL) ? p.netPL : 0), 0);
      
      return {
        ...chain,
        positions: chainPositions,
        daysExtended,
        currentLivePL,
        nearestExpiration,
        realizedPL,
      };
    });
  }, [rollChains, positions, getPositionPrices, cacheVersion]);

  // Filter roll chains
  const filteredRollChains = useMemo(() => {
    return enrichedRollChains.filter(chain => {
      if (symbolFilter !== 'all' && chain.symbol !== symbolFilter) return false;
      if (statusFilter !== 'all' && chain.status !== statusFilter) return false;
      return true;
    });
  }, [enrichedRollChains, symbolFilter, statusFilter]);

  // Calculate roll statistics
  const rollStats = useMemo(() => {
    if (filteredRollChains.length === 0) {
      return {
        totalRolls: 0,
        totalChains: 0,
        profitableChains: 0,
        unprofitableChains: 0,
        openChains: 0,
        closedChains: 0,
        avgPLPerChain: 0,
        totalNetPL: 0,
        totalLiveNetPL: 0,
        hasLiveData: false,
        avgDaysExtended: 0,
        avgRollsPerChain: 0,
        successRate: 0,
        totalCredits: 0,
        totalDebits: 0,
      };
    }

    const closedChains = filteredRollChains.filter(c => c.status === 'closed');
    const openChains = filteredRollChains.filter(c => c.status === 'open');
    const profitableChains = closedChains.filter(c => c.netPL > 0);
    const unprofitableChains = closedChains.filter(c => c.netPL <= 0);

    const totalRolls = filteredRollChains.reduce((sum, c) => sum + c.rollCount, 0);
    const totalNetPL = filteredRollChains.reduce((sum, c) => sum + c.netPL, 0);
    const totalCredits = filteredRollChains.reduce((sum, c) => sum + c.totalCredits, 0);
    const totalDebits = filteredRollChains.reduce((sum, c) => sum + c.totalDebits, 0);
    const totalDays = filteredRollChains.reduce((sum, c) => sum + c.daysExtended, 0);
    
    // Calculate live-adjusted total P/L (uses currentLivePL for open chains when available)
    let hasLiveData = false;
    const totalLiveNetPL = filteredRollChains.reduce((sum, c) => {
      if (c.currentLivePL !== null && c.currentLivePL !== undefined) {
        hasLiveData = true;
        return sum + c.currentLivePL;
      }
      return sum + c.netPL;
    }, 0);

    return {
      totalRolls,
      totalChains: filteredRollChains.length,
      profitableChains: profitableChains.length,
      unprofitableChains: unprofitableChains.length,
      openChains: openChains.length,
      closedChains: closedChains.length,
      avgPLPerChain: filteredRollChains.length > 0 ? totalNetPL / filteredRollChains.length : 0,
      totalNetPL,
      totalLiveNetPL,
      hasLiveData,
      avgDaysExtended: filteredRollChains.length > 0 ? totalDays / filteredRollChains.length : 0,
      avgRollsPerChain: filteredRollChains.length > 0 ? totalRolls / filteredRollChains.length : 0,
      successRate: closedChains.length > 0 ? (profitableChains.length / closedChains.length) * 100 : 0,
      totalCredits,
      totalDebits,
    };
  }, [filteredRollChains]);

  // Tag Analysis calculations
  interface TagStats {
    tag: Tag;
    positions: Position[];
    totalPL: number;
    realizedPL: number;
    unrealizedPL: number;
    openCount: number;
    closedCount: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    totalPremium: number;
    strategyBreakdown: Record<string, number>;
  }

  const tagAnalytics = useMemo((): TagStats[] => {
    if (!isAuthenticated || availableTags.length === 0) return [];
    
    // Get tags to analyze (selected or all if none selected)
    const tagsToAnalyze = selectedTagIds.length > 0
      ? availableTags.filter(t => selectedTagIds.includes(t.id))
      : availableTags;
    
    return tagsToAnalyze.map(tag => {
      // Find positions that have this tag (and match symbol filter)
      const taggedPositions = positions.filter(pos => {
        // Apply symbol filter
        if (tagSymbolFilter !== 'all' && pos.symbol !== tagSymbolFilter) return false;
        const posTags = getPositionTags(pos.id);
        return posTags.some(t => t.id === tag.id);
      });
      
      // Calculate metrics
      const openPositions = taggedPositions.filter(p => p.status === 'open');
      const closedPositions = taggedPositions.filter(p => p.status === 'closed');
      
      // Realized P/L from closed positions
      const realizedPL = closedPositions.reduce((sum, p) => sum + p.netPL, 0);
      
      // Unrealized P/L from open positions (with live prices if available)
      let unrealizedPL = 0;
      for (const pos of openPositions) {
        // Use getPositionPrices for consistent cache access pattern
        const cachedPrices = getPositionPrices(pos.id);
        const livePL = calculateLivePositionPL(pos as any, cachedPrices as any);
        unrealizedPL += livePL ?? pos.netPL;
      }
      
      // Win/Loss counts (from closed positions)
      const winCount = closedPositions.filter(p => p.netPL > 0).length;
      const lossCount = closedPositions.filter(p => p.netPL <= 0).length;
      const winRate = closedPositions.length > 0 ? (winCount / closedPositions.length) * 100 : 0;
      
      // Total premium (sum of all credits received)
      const totalPremium = taggedPositions.reduce((sum, p) => {
        // For credit strategies, netPL when positive represents premium collected
        return sum + Math.max(0, p.netPL);
      }, 0);
      
      // Strategy breakdown
      const strategyBreakdown: Record<string, number> = {};
      taggedPositions.forEach(p => {
        const strategy = p.strategyType || 'Unknown';
        strategyBreakdown[strategy] = (strategyBreakdown[strategy] || 0) + 1;
      });
      
      return {
        tag,
        positions: taggedPositions,
        totalPL: realizedPL + unrealizedPL,
        realizedPL,
        unrealizedPL,
        openCount: openPositions.length,
        closedCount: closedPositions.length,
        winCount,
        lossCount,
        winRate,
        totalPremium,
        strategyBreakdown,
      };
    });
  }, [isAuthenticated, availableTags, selectedTagIds, tagSymbolFilter, positions, positionTagsData, getPositionPrices, cacheVersion]);

  // Aggregate stats when multiple tags are selected
  const aggregateTagStats = useMemo(() => {
    if (tagAnalytics.length === 0) return null;
    
    const totalPL = tagAnalytics.reduce((sum, t) => sum + t.totalPL, 0);
    const realizedPL = tagAnalytics.reduce((sum, t) => sum + t.realizedPL, 0);
    const unrealizedPL = tagAnalytics.reduce((sum, t) => sum + t.unrealizedPL, 0);
    const totalPositions = tagAnalytics.reduce((sum, t) => sum + t.positions.length, 0);
    const totalOpen = tagAnalytics.reduce((sum, t) => sum + t.openCount, 0);
    const totalClosed = tagAnalytics.reduce((sum, t) => sum + t.closedCount, 0);
    const totalWins = tagAnalytics.reduce((sum, t) => sum + t.winCount, 0);
    const totalLosses = tagAnalytics.reduce((sum, t) => sum + t.lossCount, 0);
    const winRate = totalClosed > 0 ? (totalWins / totalClosed) * 100 : 0;
    
    return {
      totalPL,
      realizedPL,
      unrealizedPL,
      totalPositions,
      totalOpen,
      totalClosed,
      totalWins,
      totalLosses,
      winRate,
    };
  }, [tagAnalytics]);

  // Get all positions matching selected tags for the filtered list
  const tagFilteredPositions = useMemo(() => {
    if (selectedTagIds.length === 0) return [];
    
    return positions.filter(pos => {
      const posTags = getPositionTags(pos.id);
      return posTags.some(t => selectedTagIds.includes(t.id));
    });
  }, [positions, selectedTagIds, positionTagsData]);

  const toggleChainExpanded = (chainId: string) => {
    setExpandedChains(prev => {
      const next = new Set(prev);
      if (next.has(chainId)) {
        next.delete(chainId);
      } else {
        next.add(chainId);
      }
      return next;
    });
  };

  // Sorting state - default to status+expiration compound sort (open chains with nearest expiration first)
  const [sortColumn, setSortColumn] = useState<string>('statusExpiration');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort the filtered roll chains
  const sortedRollChains = useMemo(() => {
    return [...filteredRollChains].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      
      switch (sortColumn) {
        case 'symbol':
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case 'strategy':
          aVal = a.strategyType;
          bVal = b.strategyType;
          break;
        case 'entryDate':
          aVal = new Date(a.firstEntryDate).getTime();
          bVal = new Date(b.firstEntryDate).getTime();
          break;
        case 'expiration':
          aVal = a.nearestExpiration ? new Date(a.nearestExpiration).getTime() : Infinity;
          bVal = b.nearestExpiration ? new Date(b.nearestExpiration).getTime() : Infinity;
          break;
        case 'daysHeld':
          aVal = a.daysExtended;
          bVal = b.daysExtended;
          break;
        case 'credits':
          aVal = a.totalCredits;
          bVal = b.totalCredits;
          break;
        case 'debits':
          aVal = a.totalDebits;
          bVal = b.totalDebits;
          break;
        case 'realizedPL':
          // Defensive: handle NaN and undefined values
          aVal = typeof a.realizedPL === 'number' && !isNaN(a.realizedPL) ? a.realizedPL : 0;
          bVal = typeof b.realizedPL === 'number' && !isNaN(b.realizedPL) ? b.realizedPL : 0;
          break;
        case 'netPL':
          aVal = a.currentLivePL ?? a.netPL;
          bVal = b.currentLivePL ?? b.netPL;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'statusExpiration':
          // Compound sort: open chains first, then by nearest expiration
          // Status priority: open = 0, closed = 1
          const aStatusPriority = a.status === 'open' ? 0 : 1;
          const bStatusPriority = b.status === 'open' ? 0 : 1;
          
          if (aStatusPriority !== bStatusPriority) {
            const statusComparison = aStatusPriority - bStatusPriority;
            return sortDirection === 'asc' ? statusComparison : -statusComparison;
          }
          
          // Same status, sort by expiration (nearest first = ascending)
          // Chains with null expiration come after chains with valid expiration within same status group
          const aHasExp = !!a.nearestExpiration;
          const bHasExp = !!b.nearestExpiration;
          
          if (aHasExp !== bHasExp) {
            // Chains with expiration come first within their status group
            return aHasExp ? -1 : 1;
          }
          
          if (!aHasExp && !bHasExp) {
            // Both have no expiration, keep original order
            return 0;
          }
          
          const aExp = new Date(a.nearestExpiration!).getTime();
          const bExp = new Date(b.nearestExpiration!).getTime();
          const expComparison = aExp - bExp;
          return sortDirection === 'asc' ? expComparison : -expComparison;
        default:
          return 0;
      }
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comparison = aVal.localeCompare(bVal);
        return sortDirection === 'asc' ? comparison : -comparison;
      }
      
      const comparison = (aVal as number) - (bVal as number);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredRollChains, sortColumn, sortDirection]);

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) {
      return <ChevronsUpDown className="w-4 h-4 text-muted-foreground" />;
    }
    return sortDirection === 'asc' 
      ? <ChevronUp className="w-4 h-4 text-primary" />
      : <ChevronDown className="w-4 h-4 text-primary" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Analysis</h1>
          <p className="text-muted-foreground">Deep dive into your trading patterns and performance</p>
        </div>
        
        <div className="flex items-center gap-4">
          {lastRefreshTime && hasCachedPrices() && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="w-3 h-3" />
              <span>Live prices from {format(lastRefreshTime, 'h:mm a')}</span>
            </div>
          )}
          
          <Select value={analysisType} onValueChange={(v) => setAnalysisType(v as AnalysisType)}>
            <SelectTrigger className="w-[180px]" data-testid="select-analysis-type">
              <SelectValue placeholder="Select analysis type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rolls">Roll Analysis</SelectItem>
              <SelectItem value="tags" disabled={!isAuthenticated}>
                Tag Analysis {!isAuthenticated && '(Sign in)'}
              </SelectItem>
              <SelectItem value="ai">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  AI Report
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Roll Analysis Content */}
      {analysisType === 'rolls' && rollChains.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <RotateCcw className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Roll Data Available</h3>
              <p className="text-muted-foreground">
                Upload your trading data to see roll analysis. Rolls are detected when you close and re-open 
                similar positions on the same underlying.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {analysisType === 'rolls' && rollChains.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Roll Chains</CardTitle>
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums" data-testid="text-total-chains">
                  {rollStats.totalChains}
                </div>
                <p className="text-xs text-muted-foreground">
                  {rollStats.totalRolls} total rolls ({rollStats.avgRollsPerChain.toFixed(1)} avg/chain)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums" data-testid="text-success-rate">
                  {rollStats.successRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {rollStats.profitableChains} profitable / {rollStats.closedChains} closed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1">
                  Total Net P/L
                  {rollStats.hasLiveData && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">
                          <Zap className="h-3 w-3 text-yellow-500" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Includes live prices for open positions</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div 
                  className={`text-2xl font-bold tabular-nums ${rollStats.totalLiveNetPL >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  data-testid="text-total-net-pl"
                >
                  {formatCurrency(rollStats.totalLiveNetPL)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(rollStats.avgPLPerChain)} avg per chain
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Days Held</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums" data-testid="text-avg-days">
                  {Math.round(rollStats.avgDaysExtended)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {rollStats.openChains} open / {rollStats.closedChains} closed
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Credits vs Debits Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Premium Flow
                {rollStats.hasLiveData && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        <Zap className="h-4 w-4 text-yellow-500" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Net Result includes live prices for open positions</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </CardTitle>
              <CardDescription>Total credits collected vs debits paid across all roll chains</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-8">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Total Credits</div>
                  <div className="text-xl font-bold tabular-nums text-green-600">
                    {formatCurrency(rollStats.totalCredits)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Total Debits</div>
                  <div className="text-xl font-bold tabular-nums text-red-600">
                    {formatCurrency(-rollStats.totalDebits)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                    Net Result
                    {rollStats.hasLiveData && (
                      <Zap className="h-3 w-3 text-yellow-500" />
                    )}
                  </div>
                  <div className={`text-xl font-bold tabular-nums ${rollStats.totalLiveNetPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(rollStats.totalLiveNetPL)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <div className="flex items-center gap-4">
            <Select value={symbolFilter} onValueChange={setSymbolFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-symbol-filter">
                <SelectValue placeholder="Filter by symbol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Symbols</SelectItem>
                {uniqueSymbols.map(symbol => (
                  <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            {(symbolFilter !== 'all' || statusFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSymbolFilter('all');
                  setStatusFilter('all');
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            )}
          </div>

          {/* Roll Chains Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Roll Chains</CardTitle>
              <CardDescription>
                Click on a row to expand and see the full roll history
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sortedRollChains.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No roll chains match your filters
                </div>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table data-testid="table-roll-chains">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-10"></TableHead>
                          <TableHead>
                            <button
                              onClick={() => handleSort('symbol')}
                              className="flex items-center gap-2 hover-elevate active-elevate-2 px-2 py-1 -mx-2 -my-1 rounded"
                              data-testid="button-sort-symbol"
                            >
                              Symbol
                              <SortIcon column="symbol" />
                            </button>
                          </TableHead>
                          <TableHead>
                            <button
                              onClick={() => handleSort('strategy')}
                              className="flex items-center gap-2 hover-elevate active-elevate-2 px-2 py-1 -mx-2 -my-1 rounded"
                              data-testid="button-sort-strategy"
                            >
                              Strategy
                              <SortIcon column="strategy" />
                            </button>
                          </TableHead>
                          <TableHead>
                            <button
                              onClick={() => handleSort('entryDate')}
                              className="flex items-center gap-2 hover-elevate active-elevate-2 px-2 py-1 -mx-2 -my-1 rounded"
                              data-testid="button-sort-entry-date"
                            >
                              Entry Date
                              <SortIcon column="entryDate" />
                            </button>
                          </TableHead>
                          <TableHead>
                            <button
                              onClick={() => handleSort('expiration')}
                              className="flex items-center gap-2 hover-elevate active-elevate-2 px-2 py-1 -mx-2 -my-1 rounded"
                              data-testid="button-sort-expiration"
                            >
                              Expiration
                              <SortIcon column="expiration" />
                            </button>
                          </TableHead>
                          <TableHead className="text-right">
                            <button
                              onClick={() => handleSort('daysHeld')}
                              className="flex items-center gap-2 hover-elevate active-elevate-2 px-2 py-1 -mx-2 -my-1 rounded ml-auto"
                              data-testid="button-sort-days-held"
                            >
                              Days
                              <SortIcon column="daysHeld" />
                            </button>
                          </TableHead>
                          <TableHead className="text-right">
                            <button
                              onClick={() => handleSort('credits')}
                              className="flex items-center gap-2 hover-elevate active-elevate-2 px-2 py-1 -mx-2 -my-1 rounded ml-auto"
                              data-testid="button-sort-credits"
                            >
                              Credits
                              <SortIcon column="credits" />
                            </button>
                          </TableHead>
                          <TableHead className="text-right">
                            <button
                              onClick={() => handleSort('debits')}
                              className="flex items-center gap-2 hover-elevate active-elevate-2 px-2 py-1 -mx-2 -my-1 rounded ml-auto"
                              data-testid="button-sort-debits"
                            >
                              Debits
                              <SortIcon column="debits" />
                            </button>
                          </TableHead>
                          <TableHead className="text-right">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleSort('realizedPL')}
                                  className="flex items-center gap-2 hover-elevate active-elevate-2 px-2 py-1 -mx-2 -my-1 rounded ml-auto"
                                  data-testid="button-sort-realized-pl"
                                >
                                  Realized
                                  <SortIcon column="realizedPL" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">P/L from closed segments (for open chains with prior rolls)</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableHead>
                          <TableHead className="text-right">
                            <button
                              onClick={() => handleSort('netPL')}
                              className="flex items-center gap-2 hover-elevate active-elevate-2 px-2 py-1 -mx-2 -my-1 rounded ml-auto"
                              data-testid="button-sort-net-pl"
                            >
                              Net P/L
                              <SortIcon column="netPL" />
                            </button>
                          </TableHead>
                          <TableHead>
                            <button
                              onClick={() => handleSort('status')}
                              className="flex items-center gap-2 hover-elevate active-elevate-2 px-2 py-1 -mx-2 -my-1 rounded"
                              data-testid="button-sort-status"
                            >
                              Status
                              <SortIcon column="status" />
                            </button>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedRollChains.map((chain) => {
                          const isExpanded = expandedChains.has(chain.chainId);
                          const displayPL = chain.currentLivePL ?? chain.netPL;
                          const isLive = chain.currentLivePL !== null && chain.currentLivePL !== undefined;
                          
                          return (
                            <Fragment key={chain.chainId}>
                              <TableRow
                                className="hover-elevate active-elevate-2 cursor-pointer"
                                onClick={() => toggleChainExpanded(chain.chainId)}
                                data-testid={`row-chain-${chain.chainId}`}
                              >
                                <TableCell className="py-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleChainExpanded(chain.chainId);
                                    }}
                                    data-testid={`button-expand-chain-${chain.chainId}`}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TableCell>
                                <TableCell className="py-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{chain.symbol}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {chain.rollCount} roll{chain.rollCount !== 1 ? 's' : ''}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="py-2">
                                  <StrategyBadge strategy={chain.strategyType} />
                                </TableCell>
                                <TableCell className="py-2">
                                  <span className="tabular-nums">{formatDate(chain.firstEntryDate)}</span>
                                </TableCell>
                                <TableCell className="py-2">
                                  {chain.nearestExpiration ? (
                                    (() => {
                                      const expDate = new Date(chain.nearestExpiration);
                                      const today = new Date();
                                      today.setHours(0, 0, 0, 0);
                                      const daysToExp = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                      const isNearTerm = daysToExp <= 7 && daysToExp >= 0;
                                      const isExpired = daysToExp < 0;
                                      
                                      return (
                                        <div className="flex items-center gap-1">
                                          <span className={`tabular-nums ${isExpired ? 'text-muted-foreground' : isNearTerm ? 'text-orange-500 font-medium' : ''}`}>
                                            {formatDate(chain.nearestExpiration)}
                                          </span>
                                          {chain.status === 'open' && !isExpired && (
                                            <span className={`text-xs ${isNearTerm ? 'text-orange-500' : 'text-muted-foreground'}`}>
                                              ({daysToExp}d)
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  <span className="tabular-nums text-muted-foreground">{chain.daysExtended}</span>
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  <span className="tabular-nums text-green-600">{formatCurrency(chain.totalCredits)}</span>
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  <span className="tabular-nums text-red-600">{formatCurrency(-chain.totalDebits)}</span>
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  {/* Show realized P/L for open chains with closed segments */}
                                  {(() => {
                                    const hasClosedSegments = chain.positions.some(p => p.status === 'closed');
                                    // Ensure we always have a valid number for formatCurrency
                                    const safeRealizedPL = typeof chain.realizedPL === 'number' && !isNaN(chain.realizedPL) ? chain.realizedPL : 0;
                                    const safeNetPL = typeof chain.netPL === 'number' && !isNaN(chain.netPL) ? chain.netPL : 0;
                                    
                                    if (chain.status === 'open') {
                                      // For open chains, show realized P/L from closed segments (even if $0)
                                      if (hasClosedSegments) {
                                        return (
                                          <span className={`tabular-nums ${safeRealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {formatCurrency(safeRealizedPL)}
                                          </span>
                                        );
                                      } else {
                                        return <span className="text-muted-foreground">-</span>;
                                      }
                                    } else {
                                      // For closed chains, show total realized P/L (netPL)
                                      return (
                                        <span className={`tabular-nums ${safeNetPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {formatCurrency(safeNetPL)}
                                        </span>
                                      );
                                    }
                                  })()}
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {isLive && (
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
                                    <span className={`font-medium tabular-nums ${displayPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {formatCurrency(displayPL)}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-2">
                                  <Badge variant={chain.status === 'open' ? 'default' : 'secondary'}>
                                    {chain.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                              
                              {/* Expanded row with roll history */}
                              {isExpanded && (
                                <TableRow key={`${chain.chainId}-segments`} className="hover:bg-transparent">
                                  <TableCell colSpan={11} className="p-0">
                                    <div className="bg-muted/30 p-4 border-t">
                                      <h4 className="text-sm font-medium mb-3">Roll History</h4>
                                      <div className="space-y-2">
                                        {chain.segments.map((segment, idx) => {
                                          const position = chain.positions.find(p => p.id === segment.positionId);
                                          const isFirst = idx === 0;
                                          const isOpenPosition = position?.status === 'open';
                                          const isClosed = position?.status === 'closed';
                                          const liveData = isOpenPosition && position ? getPositionLiveData(position) : null;
                                          
                                          // Calculate opening/closing amounts for closed segments with defensive checks
                                          // Skip legs without proper transCode or amount to prevent NaN
                                          const openingAmount = position?.legs
                                            ?.filter(leg => 
                                              leg && 
                                              typeof leg.transCode === 'string' &&
                                              (leg.transCode === 'STO' || leg.transCode === 'BTO') && 
                                              typeof leg.amount === 'number' && 
                                              !isNaN(leg.amount)
                                            )
                                            .reduce((sum, leg) => sum + leg.amount, 0) ?? 0;
                                          const closingAmount = position?.legs
                                            ?.filter(leg => 
                                              leg && 
                                              typeof leg.transCode === 'string' &&
                                              (leg.transCode === 'STC' || leg.transCode === 'BTC') && 
                                              typeof leg.amount === 'number' && 
                                              !isNaN(leg.amount)
                                            )
                                            .reduce((sum, leg) => sum + leg.amount, 0) ?? 0;
                                          const positionNet = openingAmount + closingAmount;
                                          
                                          return (
                                            <div 
                                              key={`${chain.chainId}-seg-${idx}`}
                                              className={`p-3 bg-card rounded-md border ${isOpenPosition ? 'border-primary/30' : ''}`}
                                            >
                                              {/* Header row */}
                                              <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                  {!isFirst && (
                                                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                                                  )}
                                                  <span className="text-xs font-mono text-muted-foreground">
                                                    {isFirst ? 'OPEN' : `ROLL ${idx}`}
                                                  </span>
                                                </div>
                                              
                                                <div className="flex-1 grid grid-cols-4 gap-4 text-sm">
                                                  <div>
                                                    <span className="text-muted-foreground">Date: </span>
                                                    <span className="tabular-nums">
                                                      {segment.rollDate ? formatDate(segment.rollDate) : formatDate(chain.firstEntryDate)}
                                                    </span>
                                                  </div>
                                                  <div>
                                                    <span className="text-muted-foreground">Expiration: </span>
                                                    <span className="tabular-nums">{formatDate(segment.toExpiration)}</span>
                                                  </div>
                                                  <div>
                                                    <span className="text-muted-foreground">Strike: </span>
                                                    <span className="tabular-nums">${segment.toStrike}</span>
                                                  </div>
                                                  <div>
                                                    <span className="text-muted-foreground">Entry: </span>
                                                    <span className={`tabular-nums font-medium ${segment.netCredit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                      {formatCurrency(segment.netCredit)}
                                                    </span>
                                                  </div>
                                                </div>
                                              
                                                <div className="flex items-center gap-2">
                                                  {/* Show realized P/L for closed segments */}
                                                  {isClosed && (
                                                    <div className="text-right">
                                                      <span className="text-xs text-muted-foreground mr-1">Realized:</span>
                                                      <span className={`text-sm font-semibold tabular-nums ${positionNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {formatCurrency(positionNet)}
                                                      </span>
                                                    </div>
                                                  )}
                                                  {position && (
                                                    <Badge variant={position.status === 'open' ? 'default' : 'secondary'} className="text-xs">
                                                      {position.status}
                                                    </Badge>
                                                  )}
                                                </div>
                                              </div>
                                              
                                              {/* Opening/Closing breakdown for closed positions */}
                                              {isClosed && (
                                                <div className="grid grid-cols-3 gap-3 mt-3 text-xs bg-muted/30 rounded-md p-2">
                                                  <div>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <p className="text-muted-foreground mb-0.5 cursor-help underline decoration-dotted">Opened</p>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        <p className="text-xs">Amount received/paid when opening this position</p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                    <p className={`font-semibold tabular-nums ${openingAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                      {openingAmount >= 0 ? '+' : ''}{formatCurrency(openingAmount)}
                                                    </p>
                                                  </div>
                                                  <div>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <p className="text-muted-foreground mb-0.5 cursor-help underline decoration-dotted">Closed</p>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        <p className="text-xs">Amount received/paid when closing (rolling) this position</p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                    <p className={`font-semibold tabular-nums ${closingAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                      {closingAmount >= 0 ? '+' : ''}{formatCurrency(closingAmount)}
                                                    </p>
                                                  </div>
                                                  <div>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <p className="text-muted-foreground mb-0.5 cursor-help underline decoration-dotted font-medium">Position Net</p>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        <p className="text-xs">Realized profit/loss from this segment</p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                    <p className={`font-semibold tabular-nums ${positionNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                      {positionNet >= 0 ? '+' : ''}{formatCurrency(positionNet)}
                                                    </p>
                                                  </div>
                                                </div>
                                              )}
                                              
                                              {/* Live Data Section for Open Positions */}
                                              {isOpenPosition && liveData && liveData.hasData && (
                                                <div className="mt-3 pt-3 border-t border-border/50">
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <Zap className="h-3 w-3 text-yellow-500" />
                                                    <span className="text-xs font-medium text-muted-foreground">Live Data</span>
                                                  </div>
                                                  
                                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    {/* Live P/L */}
                                                    {liveData.livePL !== null && (
                                                      <div className="bg-muted/30 rounded-md p-2">
                                                        <div className="text-[10px] text-muted-foreground mb-1">Live P/L</div>
                                                        <div className={`text-sm font-semibold tabular-nums ${liveData.livePL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                          {formatCurrency(liveData.livePL)}
                                                        </div>
                                                      </div>
                                                    )}
                                                    
                                                    {/* Position Greeks */}
                                                    {liveData.positionGreeks && (
                                                      <div className="bg-muted/30 rounded-md p-2">
                                                        <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                                                          <Activity className="h-3 w-3" />
                                                          Position Greeks
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                                                          <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Δ</span>
                                                            <span className={`font-mono tabular-nums ${liveData.positionGreeks.totalDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                              ${liveData.positionGreeks.totalDelta.toFixed(0)}
                                                            </span>
                                                          </div>
                                                          <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Γ</span>
                                                            <span className="font-mono tabular-nums">
                                                              {liveData.positionGreeks.totalGamma.toFixed(2)}
                                                            </span>
                                                          </div>
                                                          <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Θ</span>
                                                            <span className={`font-mono tabular-nums ${liveData.positionGreeks.totalTheta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                              ${liveData.positionGreeks.totalTheta.toFixed(2)}
                                                            </span>
                                                          </div>
                                                          <div className="flex justify-between">
                                                            <span className="text-muted-foreground">ν</span>
                                                            <span className="font-mono tabular-nums">
                                                              ${liveData.positionGreeks.totalVega.toFixed(2)}
                                                            </span>
                                                          </div>
                                                        </div>
                                                      </div>
                                                    )}
                                                    
                                                    {/* Leg Details with Intrinsic/Extrinsic */}
                                                    {liveData.legs.map(({ legId, legInfo, data, greeks, intrinsicExtrinsic }) => {
                                                      if (!data || data.error) return null;
                                                      const mark = data.mark || (((data.bid || 0) + (data.ask || 0)) / 2);
                                                      const isShort = legInfo.transCode === 'STO' || legInfo.transCode === 'STC';
                                                      
                                                      return (
                                                        <div key={legId} className="bg-muted/30 rounded-md p-2 col-span-2">
                                                          <div className="flex items-center justify-between mb-1">
                                                            <span className="text-[10px] text-muted-foreground">
                                                              ${legInfo.strike} {legInfo.optionType?.toUpperCase()} • {isShort ? 'Short' : 'Long'} {legInfo.quantity || 1}
                                                            </span>
                                                            {intrinsicExtrinsic && (
                                                              <Badge 
                                                                variant="outline" 
                                                                className={`text-[10px] px-1.5 py-0 ${
                                                                  intrinsicExtrinsic.isITM ? 'border-green-500 text-green-600' :
                                                                  intrinsicExtrinsic.isOTM ? 'border-red-500 text-red-600' :
                                                                  'border-muted-foreground'
                                                                }`}
                                                              >
                                                                {intrinsicExtrinsic.moneyness}
                                                              </Badge>
                                                            )}
                                                          </div>
                                                          
                                                          <div className="grid grid-cols-3 gap-2 text-xs">
                                                            <div>
                                                              <span className="text-muted-foreground text-[10px] block">Mark</span>
                                                              <span className="font-semibold tabular-nums">${mark.toFixed(2)}</span>
                                                            </div>
                                                            {intrinsicExtrinsic && (
                                                              <>
                                                                <div>
                                                                  <span className="text-muted-foreground text-[10px] block">Intrinsic</span>
                                                                  <span className={`font-medium tabular-nums ${intrinsicExtrinsic.intrinsicValue > 0 ? 'text-green-600' : ''}`}>
                                                                    ${intrinsicExtrinsic.intrinsicValue.toFixed(2)}
                                                                  </span>
                                                                </div>
                                                                <div>
                                                                  <span className="text-muted-foreground text-[10px] block">Extrinsic</span>
                                                                  <span className="font-medium tabular-nums text-amber-600">
                                                                    ${intrinsicExtrinsic.extrinsicValue.toFixed(2)}
                                                                  </span>
                                                                </div>
                                                              </>
                                                            )}
                                                          </div>
                                                          
                                                          {greeks && (
                                                            <div className="mt-1.5 pt-1.5 border-t border-border/30 grid grid-cols-4 gap-1 text-[10px]">
                                                              <div className="flex justify-between">
                                                                <span className="text-muted-foreground">Δ</span>
                                                                <span className="font-mono">{formatDelta(greeks.delta)}</span>
                                                              </div>
                                                              <div className="flex justify-between">
                                                                <span className="text-muted-foreground">Γ</span>
                                                                <span className="font-mono">{formatGamma(greeks.gamma)}</span>
                                                              </div>
                                                              <div className="flex justify-between">
                                                                <span className="text-muted-foreground">Θ</span>
                                                                <span className={`font-mono ${greeks.theta < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                                  {formatTheta(greeks.theta)}
                                                                </span>
                                                              </div>
                                                              <div className="flex justify-between">
                                                                <span className="text-muted-foreground">IV</span>
                                                                <span className="font-mono">{(greeks.impliedVolatility * 100).toFixed(0)}%</span>
                                                              </div>
                                                            </div>
                                                          )}
                                                          
                                                          {data.underlyingPrice && (
                                                            <div className="mt-1 text-[10px] text-muted-foreground">
                                                              {chain.symbol} @ ${data.underlyingPrice.toFixed(2)}
                                                            </div>
                                                          )}
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                </div>
                                              )}
                                              
                                              {/* Prompt to load prices if open but no data */}
                                              {isOpenPosition && (!liveData || !liveData.hasData) && (
                                                <div className="mt-2 pt-2 border-t border-border/30 text-xs text-muted-foreground flex items-center gap-2">
                                                  <Activity className="h-3 w-3" />
                                                  <span>Load live prices from Open Positions page to see Greeks &amp; live data</span>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Tag Analysis Content */}
      {analysisType === 'tags' && isAuthenticated && (
        <>
          {/* Tag Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Select Tags to Analyze
              </CardTitle>
              <CardDescription>
                Choose one or more tags to see performance metrics. Leave empty to see all tags.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableTags.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Tags className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No tags created yet.</p>
                  <p className="text-sm">Go to Open Positions or Closed Positions and add tags to your positions.</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableTags.map(tag => {
                    const isSelected = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleTagSelection(tag.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-colors ${
                          isSelected 
                            ? 'border-primary bg-primary/10' 
                            : 'border-border hover-elevate'
                        }`}
                        data-testid={`button-tag-${tag.id}`}
                      >
                        <Checkbox 
                          checked={isSelected} 
                          className="pointer-events-none"
                        />
                        <Badge
                          variant="secondary"
                          className="text-xs"
                          style={{ 
                            backgroundColor: `${tag.color}20`,
                            borderColor: tag.color,
                            color: tag.color,
                          }}
                        >
                          {tag.name}
                        </Badge>
                      </button>
                    );
                  })}
                  {selectedTagIds.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTagIds([])}
                      className="text-muted-foreground"
                      data-testid="button-clear-tag-selection"
                    >
                      Clear Selection
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Symbol Filter */}
          <div className="flex items-center gap-4">
            <Select value={tagSymbolFilter} onValueChange={setTagSymbolFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-tag-symbol-filter">
                <SelectValue placeholder="Filter by symbol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Symbols</SelectItem>
                {uniquePositionSymbols.map(symbol => (
                  <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tagSymbolFilter !== 'all' && (
              <span className="text-sm text-muted-foreground">
                Filtering by {tagSymbolFilter}
              </span>
            )}
          </div>

          {/* Summary Cards - Show when tags exist */}
          {aggregateTagStats && tagAnalytics.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total P/L</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div 
                    className={`text-2xl font-bold tabular-nums ${aggregateTagStats.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    data-testid="text-tag-total-pl"
                  >
                    {formatCurrency(aggregateTagStats.totalPL)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(aggregateTagStats.realizedPL)} realized / {formatCurrency(aggregateTagStats.unrealizedPL)} unrealized
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                  <Percent className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums" data-testid="text-tag-win-rate">
                    {aggregateTagStats.winRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {aggregateTagStats.totalWins} wins / {aggregateTagStats.totalLosses} losses
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Positions</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums" data-testid="text-tag-positions">
                    {aggregateTagStats.totalPositions}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {aggregateTagStats.totalOpen} open / {aggregateTagStats.totalClosed} closed
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Tags Analyzed</CardTitle>
                  <Tags className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums" data-testid="text-tags-count">
                    {tagAnalytics.length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedTagIds.length === 0 ? 'All tags' : `${selectedTagIds.length} selected`}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tag Comparison Table */}
          {tagAnalytics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tag Performance Comparison</CardTitle>
                <CardDescription>
                  Side-by-side metrics for each tag
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table data-testid="table-tag-comparison">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Tag</TableHead>
                          <TableHead className="text-right">Total P/L</TableHead>
                          <TableHead className="text-right">Win Rate</TableHead>
                          <TableHead className="text-right">Wins</TableHead>
                          <TableHead className="text-right">Losses</TableHead>
                          <TableHead className="text-right">Open</TableHead>
                          <TableHead className="text-right">Closed</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tagAnalytics.map(stats => (
                          <TableRow key={stats.tag.id} data-testid={`row-tag-${stats.tag.id}`}>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                style={{ 
                                  backgroundColor: `${stats.tag.color}20`,
                                  borderColor: stats.tag.color,
                                  color: stats.tag.color,
                                }}
                              >
                                {stats.tag.name}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`font-medium tabular-nums ${stats.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(stats.totalPL)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="tabular-nums">{stats.winRate.toFixed(1)}%</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="tabular-nums text-green-600">{stats.winCount}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="tabular-nums text-red-600">{stats.lossCount}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="tabular-nums">{stats.openCount}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="tabular-nums">{stats.closedCount}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="tabular-nums font-medium">{stats.positions.length}</span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Strategy Breakdown per Tag */}
          {tagAnalytics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Strategy Distribution by Tag</CardTitle>
                <CardDescription>
                  Which option strategies are used within each tag
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {tagAnalytics.map(stats => (
                    <div 
                      key={stats.tag.id} 
                      className="border rounded-lg p-4"
                      data-testid={`card-strategy-breakdown-${stats.tag.id}`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Badge
                          variant="secondary"
                          style={{ 
                            backgroundColor: `${stats.tag.color}20`,
                            borderColor: stats.tag.color,
                            color: stats.tag.color,
                          }}
                        >
                          {stats.tag.name}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {stats.positions.length} position{stats.positions.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(stats.strategyBreakdown)
                          .sort((a, b) => b[1] - a[1])
                          .map(([strategy, count]) => {
                            const percentage = (count / stats.positions.length) * 100;
                            return (
                              <div key={strategy} className="flex items-center gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center justify-between text-sm mb-1">
                                    <StrategyBadge strategy={strategy as any} />
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                      {count} ({percentage.toFixed(0)}%)
                                    </span>
                                  </div>
                                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-primary rounded-full" 
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filtered Positions List */}
          {selectedTagIds.length > 0 && tagFilteredPositions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Positions with Selected Tags</CardTitle>
                <CardDescription>
                  {tagFilteredPositions.length} position{tagFilteredPositions.length !== 1 ? 's' : ''} matching your selected tags
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table data-testid="table-filtered-positions">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Symbol</TableHead>
                          <TableHead>Strategy</TableHead>
                          <TableHead>Tags</TableHead>
                          <TableHead className="text-right">P/L</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tagFilteredPositions.slice(0, 20).map(pos => {
                          const posTags = getPositionTags(pos.id);
                          return (
                            <TableRow key={pos.id} data-testid={`row-position-${pos.id}`}>
                              <TableCell className="font-medium">{pos.symbol}</TableCell>
                              <TableCell>
                                <StrategyBadge strategy={pos.strategyType || 'Unknown'} />
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {posTags.map(tag => (
                                    <Badge
                                      key={tag.id}
                                      variant="secondary"
                                      className="text-xs"
                                      style={{ 
                                        backgroundColor: `${tag.color}20`,
                                        borderColor: tag.color,
                                        color: tag.color,
                                      }}
                                    >
                                      {tag.name}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={`font-medium tabular-nums ${pos.netPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatCurrency(pos.netPL)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant={pos.status === 'open' ? 'default' : 'secondary'}>
                                  {pos.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {tagFilteredPositions.length > 20 && (
                    <div className="p-3 text-center text-sm text-muted-foreground border-t">
                      Showing 20 of {tagFilteredPositions.length} positions
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Tag Analysis - Not authenticated */}
      {analysisType === 'tags' && !isAuthenticated && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Tags className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Sign In Required</h3>
              <p className="text-muted-foreground">
                Tag analysis is available for signed-in users. Sign in to create tags and analyze your positions by tag.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Report */}
      {analysisType === 'ai' && (
        <AIPortfolioReport 
          positions={positions}
          summary={{
            totalPL: positions.reduce((sum, p) => sum + p.netPL, 0),
            realizedPL: positions.filter(p => p.status === 'closed').reduce((sum, p) => sum + p.netPL, 0),
            openPositionsCount: positions.filter(p => p.status === 'open').length,
            closedPositionsCount: positions.filter(p => p.status === 'closed').length,
            winRate: positions.filter(p => p.status === 'closed').length > 0
              ? (positions.filter(p => p.status === 'closed' && p.netPL > 0).length / positions.filter(p => p.status === 'closed').length) * 100
              : 0,
            totalWins: positions.filter(p => p.status === 'closed' && p.netPL > 0).length,
            totalLosses: positions.filter(p => p.status === 'closed' && p.netPL <= 0).length,
          }}
          stockHoldings={stockHoldings}
        />
      )}
    </div>
  );
}
