import { useState, useMemo } from 'react';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { Badge } from '@/components/ui/badge';
import type { Transaction } from '@shared/schema';
import { format } from 'date-fns';

interface TransactionHistoryProps {
  transactions: Transaction[];
}

export default function TransactionHistory({ transactions }: TransactionHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [symbolFilter, setSymbolFilter] = useState('all');

  const symbols = useMemo(() => {
    return Array.from(new Set(transactions.map((t) => t.instrument).filter(Boolean))).sort();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesSearch =
        searchQuery === '' ||
        transaction.instrument.toLowerCase().includes(searchQuery.toLowerCase()) ||
        transaction.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        transaction.transCode.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStrategy =
        strategyFilter === 'all' || transaction.strategyTag === strategyFilter;

      const matchesSymbol =
        symbolFilter === 'all' || transaction.instrument === symbolFilter;

      return matchesSearch && matchesStrategy && matchesSymbol;
    });
  }, [transactions, searchQuery, strategyFilter, symbolFilter]);

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

  const getTransCodeColor = (code: string) => {
    const creditCodes = ['STO', 'STC', 'Sell', 'CDIV', 'INT', 'SLIP', 'ACATI', 'ABIP', 'ACH'];
    const debitCodes = ['BTO', 'BTC', 'Buy', 'GOLD', 'MINT'];
    
    if (creditCodes.includes(code)) return 'text-green-600';
    if (debitCodes.includes(code)) return 'text-red-600';
    return 'text-muted-foreground';
  };

  const columns: Column<Transaction>[] = [
    {
      key: 'date',
      header: 'Date',
      accessor: (row) => <span className="tabular-nums">{formatDate(row.activityDate)}</span>,
      sortValue: (row) => new Date(row.activityDate).getTime(),
    },
    {
      key: 'instrument',
      header: 'Symbol',
      accessor: (row) => <span className="font-medium">{row.instrument}</span>,
      sortValue: (row) => row.instrument,
    },
    {
      key: 'description',
      header: 'Description',
      accessor: (row) => (
        <span className="text-sm text-muted-foreground max-w-xs truncate block">
          {row.description}
        </span>
      ),
      sortValue: (row) => row.description,
    },
    {
      key: 'transCode',
      header: 'Trans Code',
      accessor: (row) => (
        <span className={`font-mono text-sm font-medium ${getTransCodeColor(row.transCode)}`}>
          {row.transCode}
        </span>
      ),
      sortValue: (row) => row.transCode,
    },
    {
      key: 'quantity',
      header: 'Quantity',
      accessor: (row) => <span className="tabular-nums">{row.quantity}</span>,
      sortValue: (row) => row.quantity,
      className: 'text-right',
    },
    {
      key: 'price',
      header: 'Price',
      accessor: (row) => <span className="tabular-nums">{formatCurrency(row.price)}</span>,
      sortValue: (row) => row.price,
      className: 'text-right',
    },
    {
      key: 'amount',
      header: 'Amount',
      accessor: (row) => (
        <span className={`font-medium tabular-nums ${row.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(row.amount)}
        </span>
      ),
      sortValue: (row) => row.amount,
      className: 'text-right',
    },
    {
      key: 'strategyTag',
      header: 'Strategy Tag',
      accessor: (row) => (
        row.strategyTag ? (
          <Badge variant="outline" className="text-xs">
            {row.strategyTag}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )
      ),
      sortValue: (row) => row.strategyTag || '',
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
        <h1 className="text-2xl font-semibold mb-2">Transaction History</h1>
        <p className="text-muted-foreground">
          Complete record of all trading activity from your Robinhood account
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
        data={filteredTransactions}
        columns={columns}
        keyExtractor={(row) => row.id}
        emptyMessage="No transactions found"
        testId="table-transactions"
        pageSize={100}
      />
    </div>
  );
}
