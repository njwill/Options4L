import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Save } from 'lucide-react';
import type { Transaction, Position, SummaryStats, RollChain } from '@shared/schema';

interface ImportSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  onImportComplete: (data: {
    transactions: Transaction[];
    positions: Position[];
    rollChains: RollChain[];
    summary: SummaryStats;
    message: string;
  }) => void;
}

export function ImportSessionDialog({
  open,
  onOpenChange,
  transactions,
  onImportComplete,
}: ImportSessionDialogProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);

    try {
      const response = await fetch('/api/import-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ transactions }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to import session data');
      }

      const data = await response.json();
      onImportComplete({
        transactions: data.transactions,
        positions: data.positions,
        rollChains: data.rollChains,
        summary: data.summary,
        message: data.message,
      });
      onOpenChange(false);
    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'Failed to import session data');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-import-session">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Save className="w-5 h-5 text-primary" />
            Save Your Session Data?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              You have <strong>{transactions.length} transactions</strong> from before you signed in.
              Would you like to save this data to your account?
            </p>
            <p className="text-sm">
              This will add these transactions to your account with automatic deduplication.
              You can always upload more files later.
            </p>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isImporting} data-testid="button-cancel-import">
            No, Discard Data
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleImport}
            disabled={isImporting}
            data-testid="button-confirm-import"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Yes, Save to My Account
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
