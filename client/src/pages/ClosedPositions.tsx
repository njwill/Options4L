import { useState, useMemo } from 'react';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { StrategyBadge } from '@/components/StrategyBadge';
import { PositionDetailPanel } from '@/components/PositionDetailPanel';
import { Button } from '@/components/ui/button';
import { Eye, TrendingUp, TrendingDown } from 'lucide-react';
import type { Position, RollChain } from '@shared/schema';
import { format } from 'date-fns';

interface ClosedPositionsProps {
  positions: Position[];
  rollChains: RollChain[];
}

export default function ClosedPositions({ positions, rollChains }: ClosedPositionsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [symbolFilter, setSymbolFilter] = useState('all');
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  const closedPositions = positions.filter((p) => p.status === 'closed');

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

  const columns: Column<Position>[] = [
    {
      key: 'symbol',
      header: 'Symbol',
      accessor: (row) => <span className="font-medium">{row.symbol}</span>,
      sortValue: (row) => row.symbol,
    },
    {
      key: 'strategy',
      header: 'Strategy',
      accessor: (row) => <StrategyBadge strategy={row.strategyType} />,
      sortValue: (row) => row.strategyType,
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
      key: 'actions',
      header: 'Actions',
      accessor: (row) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelectedPosition(row)}
          data-testid={`button-view-${row.id}`}
        >
          <Eye className="w-4 h-4 mr-2" />
          View
        </Button>
      ),
      sortable: false,
    },
  ];

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
        data={filteredPositions}
        columns={columns}
        keyExtractor={(row) => row.id}
        emptyMessage="No closed positions found"
        testId="table-closed-positions"
      />

      <PositionDetailPanel
        position={selectedPosition}
        rollChains={rollChains}
        isOpen={selectedPosition !== null}
        onClose={() => setSelectedPosition(null)}
      />
    </div>
  );
}
