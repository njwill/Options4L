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
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [lastQuoteUpdate, setLastQuoteUpdate] = useState<Date | null>(null);
  
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const { toast } = useToast();

  const openPositions = positions.filter((p) => p.status === 'open');
  
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
  
  // Fetch live quotes for underlying symbols
  const fetchLiveQuotes = async () => {
    if (!isAuthenticated) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in and add your Alpha Vantage API key in Account Settings to fetch live prices.',
        variant: 'destructive',
      });
      return;
    }
    
    const uniqueSymbols = Array.from(new Set(openPositions.map((p) => p.symbol)));
    if (uniqueSymbols.length === 0) return;
    
    setIsLoadingQuotes(true);
    setQuotesError(null);
    
    try {
      // Fetch in batches of 5 (API limit)
      const allQuotes: Record<string, StockQuote> = {};
      
      for (let i = 0; i < uniqueSymbols.length; i += 5) {
        const batch = uniqueSymbols.slice(i, i + 5);
        const response = await apiRequest('POST', '/api/options/quotes', { symbols: batch });
        const data = await response.json();
        
        if (data.success && data.quotes) {
          Object.assign(allQuotes, data.quotes);
        }
        
        if (data.errors && data.errors.length > 0) {
          // Check if it's a rate limit error
          if (data.errors.some((e: string) => e.includes('Rate limit'))) {
            setQuotesError('API rate limit reached. Try again in a minute.');
            break;
          }
        }
        
        if (!data.success && data.message) {
          setQuotesError(data.message);
          break;
        }
        
        // Small delay between batches to avoid rate limiting
        if (i + 5 < uniqueSymbols.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      setLiveQuotes(allQuotes);
      setLastQuoteUpdate(new Date());
      
      if (Object.keys(allQuotes).length > 0) {
        toast({
          title: 'Prices updated',
          description: `Fetched live prices for ${Object.keys(allQuotes).length} symbol(s)`,
        });
      }
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
    '',
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
                  {isLoadingQuotes ? 'Loading...' : 'Live Prices'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Fetch live underlying prices from Alpha Vantage</p>
                {!isAuthenticated && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Sign in and add API key in Account Settings
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
            {lastQuoteUpdate && (
              <span className="text-xs text-muted-foreground">
                Updated {format(lastQuoteUpdate, 'h:mm a')}
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
