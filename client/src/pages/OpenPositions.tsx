import { useState, useMemo } from 'react';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { StrategyBadge } from '@/components/StrategyBadge';
import { PositionDetailPanel } from '@/components/PositionDetailPanel';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import type { Position } from '@shared/schema';
import { format } from 'date-fns';

interface OpenPositionsProps {
  positions: Position[];
}

export default function OpenPositions({ positions }: OpenPositionsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [symbolFilter, setSymbolFilter] = useState('all');
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  const openPositions = positions.filter((p) => p.status === 'open');

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
      key: 'maxDebit',
      header: 'Max Profitable Debit',
      accessor: (row) => (
        <span className="tabular-nums">
          {row.maxProfitableDebit !== null ? formatCurrency(Math.abs(row.maxProfitableDebit)) : 'N/A'}
        </span>
      ),
      sortValue: (row) => row.maxProfitableDebit ?? 0,
      className: 'text-right',
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
        <h1 className="text-2xl font-semibold mb-2">Open Positions</h1>
        <p className="text-muted-foreground">
          Currently active positions with credit/debit tracking and profitability analysis
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
        emptyMessage="No open positions found"
        testId="table-open-positions"
      />

      <PositionDetailPanel
        position={selectedPosition}
        isOpen={selectedPosition !== null}
        onClose={() => setSelectedPosition(null)}
      />
    </div>
  );
}
