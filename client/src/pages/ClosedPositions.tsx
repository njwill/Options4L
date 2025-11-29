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
import { TrendingUp, TrendingDown, Link2, MessageSquare, Unlink, Redo2 } from 'lucide-react';
import type { Position, RollChain, StockHolding } from '@shared/schema';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { computePositionHash } from '@/lib/positionHash';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ClosedPositionsProps {
  positions: Position[];
  rollChains: RollChain[];
  stockHoldings?: StockHolding[];
  onUngroupPosition?: (groupId: string) => Promise<void>;
  onDataChange?: () => Promise<boolean>;
}

export default function ClosedPositions({ positions, rollChains, stockHoldings = [], onUngroupPosition, onDataChange }: ClosedPositionsProps) {
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
  
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const { toast } = useToast();

  const closedPositions = positions.filter((p) => p.status === 'closed');
  
  useEffect(() => {
    async function computeHashes() {
      const hashMap = new Map<string, string>();
      for (const pos of closedPositions) {
        const hash = await computePositionHash(pos);
        hashMap.set(pos.id, hash);
      }
      setPositionHashes(hashMap);
    }
    if (closedPositions.length > 0) {
      computeHashes();
    }
  }, [closedPositions.length]);
  
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
  
  // Fetch strategy overrides for all positions
  const { data: strategyOverridesData, refetch: refetchStrategyOverrides } = useQuery<{ success: boolean; overrides: Record<string, string> }>({
    queryKey: ['/api/strategy-overrides/lookup', allHashes],
    queryFn: async () => {
      if (allHashes.length === 0) return { success: true, overrides: {} };
      const res = await apiRequest('POST', '/api/strategy-overrides/lookup', { positionHashes: allHashes });
      return res.json();
    },
    enabled: isAuthenticated && allHashes.length > 0,
    staleTime: 30000,
  });
  
  // Create a version key that changes when overrides content changes
  // Don't use useMemo here - we want this to be recomputed on every render
  // so that any change in override data triggers column recreation
  const overridesVersion = JSON.stringify(strategyOverridesData?.overrides || {});
  
  const getStrategyOverride = (posId: string): string | null => {
    const hash = positionHashes.get(posId);
    if (!hash || !strategyOverridesData?.overrides) return null;
    return strategyOverridesData.overrides[hash] || null;
  };
  
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

  const symbols = useMemo(() => {
    return Array.from(new Set(closedPositions.map((p) => p.symbol))).sort();
  }, [closedPositions]);

  const filteredPositions = useMemo(() => {
    return closedPositions.filter((position) => {
      const matchesSearch =
        searchQuery === '' ||
        position.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        position.strategyType.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStrategy =
        strategyFilter === 'all' || position.strategyType === strategyFilter;

      const matchesSymbol = symbolFilter === 'all' || position.symbol === symbolFilter;

      return matchesSearch && matchesStrategy && matchesSymbol;
    });
  }, [closedPositions, searchQuery, strategyFilter, symbolFilter]);

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

  const columns: Column<Position>[] = useMemo(() => [
    {
      key: 'symbol',
      header: 'Symbol',
      accessor: (row: Position) => <span className="font-medium">{row.symbol}</span>,
      sortValue: (row: Position) => row.symbol,
    },
    {
      key: 'strategy',
      header: 'Strategy',
      accessor: (row: Position) => {
        const override = getStrategyOverride(row.id);
        const displayStrategy = override || row.strategyType;
        return (
          <div className="flex items-center gap-1.5">
            <StrategyBadge strategy={displayStrategy as import('@shared/schema').StrategyType} />
            {override && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 border-green-300 text-green-600 dark:border-green-700 dark:text-green-400">
                Reclassified
              </Badge>
            )}
            {!override && row.isManuallyGrouped && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
                Manual
              </Badge>
            )}
          </div>
        );
      },
      sortValue: (row: Position) => getStrategyOverride(row.id) || row.strategyType,
    },
    {
      key: 'entryDate',
      header: 'Entry Date',
      accessor: (row) => <span className="tabular-nums">{formatDate(row.entryDate)}</span>,
      sortValue: (row) => new Date(row.entryDate).getTime(),
    },
    {
      key: 'exitDate',
      header: 'Exit Date',
      accessor: (row) => (
        <span className="tabular-nums">{row.exitDate ? formatDate(row.exitDate) : 'N/A'}</span>
      ),
      sortValue: (row) => row.exitDate ? new Date(row.exitDate).getTime() : 0,
    },
    {
      key: 'realizedPL',
      header: 'Realized P/L',
      accessor: (row) => {
        const pl = row.realizedPL ?? row.netPL;
        return (
          <div className="flex items-center gap-2">
            {pl >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-600" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-600" />
            )}
            <span className={`font-semibold tabular-nums ${pl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(pl)}
            </span>
          </div>
        );
      },
      sortValue: (row) => row.realizedPL ?? row.netPL,
      className: 'text-right',
    },
    {
      key: 'winLoss',
      header: 'Result',
      accessor: (row) => {
        const pl = row.realizedPL ?? row.netPL;
        return (
          <span className={`font-medium ${pl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {pl >= 0 ? 'Win' : 'Loss'}
          </span>
        );
      },
      sortValue: (row) => (row.realizedPL ?? row.netPL) >= 0 ? 'Win' : 'Loss',
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
    }] as Column<Position>[] : []),
  ] as Column<Position>[], [overridesVersion, isAuthenticated, commentCountsData, rollChains, ungroupingId, restoringId]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setStrategyFilter('all');
    setSymbolFilter('all');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Closed Positions</h1>
        <p className="text-muted-foreground">
          Historical positions with realized profit and loss
        </p>
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
        key={overridesVersion}
        data={filteredPositions}
        columns={columns}
        keyExtractor={(row) => row.id}
        onRowClick={(row) => setSelectedPosition(row)}
        emptyMessage="No closed positions found"
        testId="table-closed-positions"
      />

      <PositionDetailPanel
        position={selectedPosition}
        rollChains={rollChains}
        stockHoldings={stockHoldings}
        isOpen={selectedPosition !== null}
        onClose={() => setSelectedPosition(null)}
        positionHash={selectedPosition ? positionHashes.get(selectedPosition.id) : undefined}
        strategyOverride={selectedPosition ? getStrategyOverride(selectedPosition.id) : null}
        onStrategyOverrideChange={() => {
          refetchStrategyOverrides();
          if (onDataChange) onDataChange();
        }}
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
