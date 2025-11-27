import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageSquare, Layers, X } from 'lucide-react';
import { CommentsPanel } from '@/components/CommentsPanel';
import { GroupPositionModal } from '@/components/GroupPositionModal';
import { useAuth } from '@/hooks/use-auth';
import { computeTransactionHash } from '@/lib/transactionHash';
import { apiRequest } from '@/lib/queryClient';
import type { Transaction, StrategyType } from '@shared/schema';
import { format } from 'date-fns';

interface TransactionHistoryProps {
  transactions: Transaction[];
  onGroupCreated?: () => void; // Callback when a group is created to refresh data
}

export default function TransactionHistory({ transactions, onGroupCreated }: TransactionHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [symbolFilter, setSymbolFilter] = useState('all');
  
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [selectedTxnHash, setSelectedTxnHash] = useState('');
  const [selectedTxnDesc, setSelectedTxnDesc] = useState('');
  const [transactionHashes, setTransactionHashes] = useState<Map<string, string>>(new Map());
  
  // Multi-select state for grouping transactions
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  
  const { user } = useAuth();
  const isAuthenticated = !!user;
  
  useEffect(() => {
    async function computeHashes() {
      const hashMap = new Map<string, string>();
      for (const txn of transactions) {
        const hash = await computeTransactionHash(txn);
        hashMap.set(txn.id, hash);
      }
      setTransactionHashes(hashMap);
    }
    if (transactions.length > 0) {
      computeHashes();
    }
  }, [transactions]);
  
  // Fetch comment counts for all transaction hashes
  const allHashes = useMemo(() => Array.from(transactionHashes.values()), [transactionHashes]);
  
  const { data: commentCountsData } = useQuery<{ success: boolean; counts: Record<string, number> }>({
    queryKey: ['/api/comments/counts', allHashes],
    queryFn: async () => {
      if (allHashes.length === 0) return { success: true, counts: {} };
      const res = await apiRequest('POST', '/api/comments/counts', { transactionHashes: allHashes });
      return res.json();
    },
    enabled: isAuthenticated && allHashes.length > 0,
    staleTime: 30000, // Cache for 30 seconds
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
  
  // Get count for a specific transaction by looking up its hash
  const getCommentCount = (txnId: string): number => {
    const hash = transactionHashes.get(txnId);
    if (!hash) return 0;
    return commentCounts.get(hash) || 0;
  };
  
  const handleOpenComments = (txn: Transaction) => {
    const hash = transactionHashes.get(txn.id);
    if (hash) {
      setSelectedTxnHash(hash);
      setSelectedTxnDesc(`${txn.transCode} ${txn.description} - ${txn.activityDate}`);
      setCommentsPanelOpen(true);
    }
  };
  
  // Multi-select handlers
  const handleSelectTransaction = (txnId: string, checked: boolean) => {
    setSelectedTransactions(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(txnId);
      } else {
        next.delete(txnId);
      }
      return next;
    });
  };
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTransactions(new Set(filteredTransactions.map(t => t.id)));
    } else {
      setSelectedTransactions(new Set());
    }
  };
  
  const clearSelection = () => {
    setSelectedTransactions(new Set());
  };
  
  const getSelectedTransactionHashes = (): string[] => {
    const hashes: string[] = [];
    Array.from(selectedTransactions).forEach(txnId => {
      const hash = transactionHashes.get(txnId);
      if (hash) hashes.push(hash);
    });
    return hashes;
  };
  
  const handleGroupCreated = () => {
    clearSelection();
    setGroupModalOpen(false);
    onGroupCreated?.();
  };

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

  const allSelected = filteredTransactions.length > 0 && 
    filteredTransactions.every(t => selectedTransactions.has(t.id));
  const someSelected = selectedTransactions.size > 0 && !allSelected;

  const columns: Column<Transaction>[] = [
    // Checkbox column for authenticated users (for grouping transactions)
    ...(isAuthenticated ? [{
      key: 'select',
      header: (
        <Checkbox
          checked={allSelected}
          onCheckedChange={handleSelectAll}
          data-testid="checkbox-select-all"
          className={someSelected ? "data-[state=checked]:bg-primary" : ""}
        />
      ),
      accessor: (row: Transaction) => (
        <Checkbox
          checked={selectedTransactions.has(row.id)}
          onCheckedChange={(checked) => handleSelectTransaction(row.id, !!checked)}
          onClick={(e) => e.stopPropagation()}
          data-testid={`checkbox-select-${row.id}`}
        />
      ),
      sortValue: () => 0,
      className: 'w-[40px]',
    }] : []),
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
    ...(isAuthenticated ? [{
      key: 'notes',
      header: 'Notes',
      accessor: (row: Transaction) => {
        const count = getCommentCount(row.id);
        return (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 relative"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenComments(row);
            }}
            data-testid={`button-notes-${row.id}`}
          >
            <MessageSquare className={`h-4 w-4 ${count > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </Button>
        );
      },
      sortValue: () => 0,
      className: 'text-center w-[60px]',
    }] : []),
  ] as Column<Transaction>[];

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
      
      {/* Floating action bar when transactions are selected */}
      {isAuthenticated && selectedTransactions.size >= 2 && (
        <div 
          className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-card border shadow-lg rounded-lg px-4 py-3 flex items-center gap-4"
          data-testid="floating-action-bar"
        >
          <span className="text-sm text-muted-foreground">
            {selectedTransactions.size} transactions selected
          </span>
          <Button
            size="sm"
            onClick={() => setGroupModalOpen(true)}
            data-testid="button-group-as-position"
          >
            <Layers className="w-4 h-4 mr-2" />
            Group as Position
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearSelection}
            data-testid="button-clear-selection"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
      
      {isAuthenticated && (
        <CommentsPanel
          isOpen={commentsPanelOpen}
          onClose={() => setCommentsPanelOpen(false)}
          transactionHash={selectedTxnHash}
          transactionDescription={selectedTxnDesc}
        />
      )}
      
      {isAuthenticated && (
        <GroupPositionModal
          isOpen={groupModalOpen}
          onClose={() => setGroupModalOpen(false)}
          transactionHashes={getSelectedTransactionHashes()}
          selectedTransactions={transactions.filter(t => selectedTransactions.has(t.id))}
          onGroupCreated={handleGroupCreated}
        />
      )}
    </div>
  );
}
