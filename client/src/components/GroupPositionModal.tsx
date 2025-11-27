import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { Transaction, StrategyType } from '@shared/schema';
import { format } from 'date-fns';
import { Layers, AlertTriangle, AlertCircle } from 'lucide-react';

interface GroupPositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionHashes: string[];
  selectedTransactions: Transaction[];
  onGroupCreated: () => void;
}

const STRATEGY_TYPES: StrategyType[] = [
  'Covered Call',
  'Cash Secured Put',
  'Put Credit Spread',
  'Call Credit Spread',
  'Put Debit Spread',
  'Call Debit Spread',
  'Iron Condor',
  'Long Straddle',
  'Short Straddle',
  'Long Strangle',
  'Short Strangle',
  'Calendar Spread',
  'Diagonal Spread',
  'Long Call',
  'Long Put',
  'Short Call',
  'Short Put',
  'Long Stock',
  'Short Stock',
];

export function GroupPositionModal({
  isOpen,
  onClose,
  transactionHashes,
  selectedTransactions,
  onGroupCreated,
}: GroupPositionModalProps) {
  const [strategyType, setStrategyType] = useState<StrategyType | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const handleSubmit = async () => {
    if (!strategyType || transactionHashes.length < 2) {
      toast({
        title: 'Error',
        description: 'Please select a strategy type and at least 2 transactions',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/manual-groupings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transactionHashes,
          strategyType,
        }),
      });
      
      const response = await res.json();

      if (response.success) {
        toast({
          title: 'Success',
          description: `Grouped ${transactionHashes.length} transactions as ${strategyType}`,
        });
        onGroupCreated();
      } else {
        throw new Error(response.message || 'Failed to create grouping');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create grouping',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStrategyType('');
    onClose();
  };

  // Calculate totals for preview
  const totals = selectedTransactions.reduce(
    (acc, txn) => ({
      credit: acc.credit + (txn.amount > 0 ? txn.amount : 0),
      debit: acc.debit + (txn.amount < 0 ? Math.abs(txn.amount) : 0),
      net: acc.net + txn.amount,
    }),
    { credit: 0, debit: 0, net: 0 }
  );

  // Get unique symbols
  const symbols = Array.from(new Set(selectedTransactions.map(t => t.instrument)));

  // Check if transactions can form valid positions
  // Opening transactions (STO/BTO) are required to create positions
  const transactionAnalysis = useMemo(() => {
    const openingCodes = ['STO', 'BTO'];
    const closingCodes = ['STC', 'BTC', 'OEXP', 'OASGN'];
    const stockCodes = ['Buy', 'Sell'];
    
    const opening = selectedTransactions.filter(t => openingCodes.includes(t.transCode));
    const closing = selectedTransactions.filter(t => closingCodes.includes(t.transCode));
    const stock = selectedTransactions.filter(t => stockCodes.includes(t.transCode));
    
    const hasOpening = opening.length > 0;
    const hasOnlyClosing = !hasOpening && closing.length > 0;
    const hasOnlyStock = !hasOpening && !hasOnlyClosing && stock.length > 0;
    
    // Error message based on what was selected
    let errorMessage = '';
    if (hasOnlyStock) {
      errorMessage = 'Stock transactions (Buy/Sell) cannot be grouped into option positions. Manual grouping is for options only.';
    } else if (hasOnlyClosing) {
      errorMessage = "You've selected only closing transactions (STC/BTC). Positions require at least one opening transaction (STO/BTO). This usually means the opening trades are missing from your uploaded file.";
    }
    
    return {
      openingCount: opening.length,
      closingCount: closing.length,
      stockCount: stock.length,
      hasOpening,
      hasOnlyClosing,
      hasOnlyStock,
      canFormPosition: hasOpening, // Need at least one opening transaction
      errorMessage,
    };
  }, [selectedTransactions]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[600px]" data-testid="group-position-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Group Transactions as Position
          </DialogTitle>
          <DialogDescription>
            Combine {selectedTransactions.length} transactions into a single position with your chosen strategy type.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Strategy Type Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Strategy Type</label>
            <Select
              value={strategyType}
              onValueChange={(value) => setStrategyType(value as StrategyType)}
            >
              <SelectTrigger data-testid="select-strategy-type">
                <SelectValue placeholder="Select a strategy type..." />
              </SelectTrigger>
              <SelectContent>
                {STRATEGY_TYPES.map((type) => (
                  <SelectItem key={type} value={type} data-testid={`option-${type.replace(/\s+/g, '-').toLowerCase()}`}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected Transactions Preview */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Selected Transactions</label>
            <div className="border rounded-md max-h-[200px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Description</th>
                    <th className="text-left px-3 py-2">Code</th>
                    <th className="text-right px-3 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTransactions.map((txn) => (
                    <tr key={txn.id} className="border-t">
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                        {formatDate(txn.activityDate)}
                      </td>
                      <td className="px-3 py-2 truncate max-w-[200px]" title={txn.description}>
                        {txn.description}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs">
                          {txn.transCode}
                        </Badge>
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${txn.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(txn.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Position Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h4 className="text-sm font-medium">Position Summary</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Symbols:</span>{' '}
                <span className="font-medium">{symbols.join(', ')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Transactions:</span>{' '}
                <span className="font-medium">{selectedTransactions.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Credit:</span>{' '}
                <span className="font-medium text-green-600">{formatCurrency(totals.credit)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Debit:</span>{' '}
                <span className="font-medium text-red-600">{formatCurrency(totals.debit)}</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Net P/L:</span>{' '}
                <span className={`font-medium ${totals.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totals.net)}
                </span>
              </div>
            </div>
          </div>

          {/* Error: Cannot form valid position */}
          {!transactionAnalysis.canFormPosition && transactionAnalysis.errorMessage && (
            <div className="flex items-start gap-2 text-sm bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md p-3">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-700 dark:text-red-400">Cannot group these transactions</p>
                <p className="text-red-600 dark:text-red-400 mt-1">
                  {transactionAnalysis.errorMessage}
                </p>
              </div>
            </div>
          )}

          {/* Warning about re-upload behavior */}
          {transactionAnalysis.canFormPosition && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p>
                Manual groupings persist across file re-uploads. To undo, you can remove the grouping from the position view.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!strategyType || isSubmitting || !transactionAnalysis.canFormPosition}
            data-testid="button-confirm-group"
          >
            {isSubmitting ? 'Creating...' : 'Create Position'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
