import { useState, useMemo, Fragment } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import type { Position, RollChain } from '@shared/schema';
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
  Zap
} from 'lucide-react';

type AnalysisType = 'rolls' | 'strategies';

interface AnalysisProps {
  positions: Position[];
  rollChains: RollChain[];
}

interface RollChainWithDetails extends RollChain {
  positions: Position[];
  daysExtended: number;
  currentLivePL?: number | null;
}

export default function Analysis({ positions, rollChains }: AnalysisProps) {
  const [analysisType, setAnalysisType] = useState<AnalysisType>('rolls');
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());
  const [symbolFilter, setSymbolFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  const { getAllCachedPrices, hasCachedPrices, lastRefreshTime } = usePriceCache();

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

  // Get all unique symbols from roll chains
  const uniqueSymbols = useMemo(() => {
    const symbols = new Set(rollChains.map(rc => rc.symbol));
    return Array.from(symbols).sort();
  }, [rollChains]);

  // Enrich roll chains with position data and live prices
  const enrichedRollChains = useMemo((): RollChainWithDetails[] => {
    const allPrices = hasCachedPrices() ? getAllCachedPrices() : {};
    
    return rollChains.map(chain => {
      // Find all positions in this chain
      const chainPositions = positions.filter(p => p.rollChainId === chain.chainId);
      
      // Calculate days extended (dates may be in MM/DD/YYYY format, not ISO)
      const firstDate = new Date(chain.firstEntryDate);
      const lastDate = chain.lastExitDate ? new Date(chain.lastExitDate) : new Date();
      const daysExtended = isNaN(firstDate.getTime()) || isNaN(lastDate.getTime()) 
        ? 0 
        : differenceInDays(lastDate, firstDate);
      
      // Calculate live P/L for open positions in chain
      let currentLivePL: number | null = null;
      if (chain.status === 'open') {
        const openPositions = chainPositions.filter(p => p.status === 'open');
        let hasLiveData = false;
        let totalLivePL = 0;
        
        for (const pos of openPositions) {
          const cachedPrices = allPrices[pos.id];
          const livePL = calculateLivePositionPL(pos, cachedPrices);
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
      
      return {
        ...chain,
        positions: chainPositions,
        daysExtended,
        currentLivePL,
      };
    });
  }, [rollChains, positions, getAllCachedPrices, hasCachedPrices]);

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

    return {
      totalRolls,
      totalChains: filteredRollChains.length,
      profitableChains: profitableChains.length,
      unprofitableChains: unprofitableChains.length,
      openChains: openChains.length,
      closedChains: closedChains.length,
      avgPLPerChain: filteredRollChains.length > 0 ? totalNetPL / filteredRollChains.length : 0,
      totalNetPL,
      avgDaysExtended: filteredRollChains.length > 0 ? totalDays / filteredRollChains.length : 0,
      avgRollsPerChain: filteredRollChains.length > 0 ? totalRolls / filteredRollChains.length : 0,
      successRate: closedChains.length > 0 ? (profitableChains.length / closedChains.length) * 100 : 0,
      totalCredits,
      totalDebits,
    };
  }, [filteredRollChains]);

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

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string>('entryDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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
        case 'netPL':
          aVal = a.currentLivePL ?? a.netPL;
          bVal = b.currentLivePL ?? b.netPL;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
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

  if (rollChains.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Analysis</h1>
          <p className="text-muted-foreground">Deep dive into your trading patterns and performance</p>
        </div>
        
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
      </div>
    );
  }

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
              <SelectItem value="strategies" disabled>Strategy Analysis (Coming Soon)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Roll Analysis Content */}
      {analysisType === 'rolls' && (
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
                <CardTitle className="text-sm font-medium">Total Net P/L</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div 
                  className={`text-2xl font-bold tabular-nums ${rollStats.totalNetPL >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  data-testid="text-total-net-pl"
                >
                  {formatCurrency(rollStats.totalNetPL)}
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
              <CardTitle className="text-base">Premium Flow</CardTitle>
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
                  <div className="text-sm text-muted-foreground mb-1">Net Result</div>
                  <div className={`text-xl font-bold tabular-nums ${rollStats.totalNetPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(rollStats.totalNetPL)}
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
                                  <TableCell colSpan={9} className="p-0">
                                    <div className="bg-muted/30 p-4 border-t">
                                      <h4 className="text-sm font-medium mb-3">Roll History</h4>
                                      <div className="space-y-2">
                                        {chain.segments.map((segment, idx) => {
                                          const position = chain.positions.find(p => p.id === segment.positionId);
                                          const isFirst = idx === 0;
                                          
                                          return (
                                            <div 
                                              key={`${chain.chainId}-seg-${idx}`}
                                              className="flex items-center gap-4 p-3 bg-card rounded-md border"
                                            >
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
                                                  <span className="text-muted-foreground">Net: </span>
                                                  <span className={`tabular-nums font-medium ${segment.netCredit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatCurrency(segment.netCredit)}
                                                  </span>
                                                </div>
                                              </div>
                                              
                                              {position && (
                                                <Badge variant={position.status === 'open' ? 'default' : 'secondary'} className="text-xs">
                                                  {position.status}
                                                </Badge>
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

      {/* Strategy Analysis Placeholder */}
      {analysisType === 'strategies' && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Strategy Analysis Coming Soon</h3>
              <p className="text-muted-foreground">
                Detailed performance breakdown by strategy type will be available in a future update.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
