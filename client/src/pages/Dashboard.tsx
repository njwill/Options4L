import { useState, useMemo } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { SummaryCards } from '@/components/SummaryCards';
import { PLOverTimeChart } from '@/components/PLOverTimeChart';
import { StrategyPerformanceChart } from '@/components/StrategyPerformanceChart';
import { DataTable, type Column } from '@/components/DataTable';
import { StrategyBadge } from '@/components/StrategyBadge';
import { PositionDetailPanel } from '@/components/PositionDetailPanel';
import { usePriceCache, calculateTotalLivePL } from '@/hooks/use-price-cache';
import type { Position, Transaction, RollChain, SummaryStats, StockHolding } from '@shared/schema';
import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';

interface DashboardProps {
  positions: Position[];
  transactions: Transaction[];
  rollChains: RollChain[];
  stockHoldings?: StockHolding[];
  onFileUpload: (file: File) => Promise<void>;
  isProcessing: boolean;
  summary: SummaryStats;
}

export default function Dashboard({ positions, transactions, rollChains, stockHoldings = [], onFileUpload, isProcessing, summary }: DashboardProps) {
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const { getAllCachedPrices, hasCachedPrices, lastRefreshTime } = usePriceCache();

  // Calculate live P/L using cached prices when available
  const livePLData = useMemo(() => {
    if (!hasCachedPrices()) {
      return null;
    }
    const allPrices = getAllCachedPrices();
    return calculateTotalLivePL(positions, allPrices);
  }, [positions, getAllCachedPrices, hasCachedPrices]);

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

  const recentPositions = positions.slice(0, 10);
  const recentTransactions = transactions.slice(0, 10);

  const positionColumns: Column<Position>[] = [
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
      key: 'netPL',
      header: 'Net P/L',
      accessor: (row) => (
        <span className={`font-medium tabular-nums ${row.netPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(row.netPL)}
        </span>
      ),
      sortValue: (row) => row.netPL,
      className: 'text-right',
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (row) => (
        <span className={row.status === 'open' ? 'text-primary font-medium' : 'text-muted-foreground'}>
          {row.status}
        </span>
      ),
      sortValue: (row) => row.status,
    },
  ];

  const transactionColumns: Column<Transaction>[] = [
    {
      key: 'date',
      header: 'Date',
      accessor: (row) => <span className="tabular-nums">{formatDate(row.activityDate)}</span>,
      sortValue: (row) => new Date(row.activityDate).getTime(),
    },
    {
      key: 'symbol',
      header: 'Symbol',
      accessor: (row) => <span className="font-medium">{row.instrument}</span>,
      sortValue: (row) => row.instrument,
    },
    {
      key: 'transCode',
      header: 'Type',
      accessor: (row) => <span className="text-sm font-mono">{row.transCode}</span>,
      sortValue: (row) => row.transCode,
    },
    {
      key: 'quantity',
      header: 'Qty',
      accessor: (row) => <span className="tabular-nums">{row.quantity}</span>,
      sortValue: (row) => row.quantity,
      className: 'text-right',
    },
    {
      key: 'amount',
      header: 'Amount',
      accessor: (row) => (
        <span className={`tabular-nums ${row.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(row.amount)}
        </span>
      ),
      sortValue: (row) => row.amount,
      className: 'text-right',
    },
  ];

  if (positions.length === 0 && transactions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold mb-2">Options Analysis Dashboard</h1>
          <p className="text-muted-foreground">
            Upload your Robinhood trading data to get started with comprehensive options analysis
          </p>
        </div>
        <FileUpload onFileUpload={onFileUpload} isProcessing={isProcessing} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your trading performance and recent activity</p>
        </div>
        {lastRefreshTime && livePLData?.hasLiveData && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="w-3 h-3" />
            <span>Live prices from {format(lastRefreshTime, 'h:mm a')}</span>
          </div>
        )}
      </div>

      <SummaryCards stats={summary} livePLData={livePLData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <PLOverTimeChart positions={positions} livePLData={livePLData} />
        <StrategyPerformanceChart positions={positions} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Positions</h2>
          <DataTable
            data={recentPositions}
            columns={positionColumns}
            keyExtractor={(row) => row.id}
            onRowClick={(row) => setSelectedPosition(row)}
            emptyMessage="No positions found"
            testId="table-recent-positions"
            pageSize={10}
          />
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>
          <DataTable
            data={recentTransactions}
            columns={transactionColumns}
            keyExtractor={(row) => row.id}
            emptyMessage="No transactions found"
            testId="table-recent-transactions"
            pageSize={10}
          />
        </div>
      </div>

      <PositionDetailPanel
        position={selectedPosition}
        rollChains={rollChains}
        stockHoldings={stockHoldings}
        allPositions={positions}
        isOpen={selectedPosition !== null}
        onClose={() => setSelectedPosition(null)}
      />
    </div>
  );
}
