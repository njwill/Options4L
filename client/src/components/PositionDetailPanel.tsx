import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { StrategyBadge } from './StrategyBadge';
import type { Position } from '@shared/schema';
import { format } from 'date-fns';

interface PositionDetailPanelProps {
  position: Position | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PositionDetailPanel({ position, isOpen, onClose }: PositionDetailPanelProps) {
  if (!position) return null;

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="dialog-position-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-2xl font-semibold">{position.symbol}</span>
            <StrategyBadge strategy={position.strategyType} />
            <Badge variant={position.status === 'open' ? 'default' : 'secondary'}>
              {position.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-8 mt-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Entry Date</p>
              <p className="font-medium tabular-nums">{formatDate(position.entryDate)}</p>
            </div>
            {position.exitDate && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Exit Date</p>
                <p className="font-medium tabular-nums">{formatDate(position.exitDate)}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Credit</p>
              <p className="font-medium tabular-nums text-green-600">{formatCurrency(position.totalCredit)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Debit</p>
              <p className="font-medium tabular-nums text-red-600">{formatCurrency(Math.abs(position.totalDebit))}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Net P/L</p>
              <p className={`font-semibold tabular-nums ${position.netPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(position.netPL)}
              </p>
            </div>
            {position.maxProfitableDebit !== null && position.status === 'open' && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Max Profitable Debit</p>
                <p className="font-medium tabular-nums">{formatCurrency(Math.abs(position.maxProfitableDebit))}</p>
              </div>
            )}
          </div>

          {/* Option Legs */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Option Legs</h3>
            <div className="space-y-2">
              {position.legs.map((leg) => (
                <div
                  key={leg.id}
                  className="flex items-center justify-between p-4 border rounded-md bg-card"
                  data-testid={`leg-${leg.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{leg.transCode}</span>
                      <Badge variant="outline" className="text-xs">
                        {leg.optionType}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        ${leg.strike} exp {formatDate(leg.expiration)}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {leg.quantity} contracts @ {formatCurrency(leg.price)} on {formatDate(leg.activityDate)}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium tabular-nums ${leg.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(leg.amount)}
                    </p>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {leg.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rolls */}
          {position.rolls.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Roll History</h3>
              <div className="space-y-2">
                {position.rolls.map((roll) => (
                  <div
                    key={roll.id}
                    className="p-4 border rounded-md bg-card"
                    data-testid={`roll-${roll.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Roll on {formatDate(roll.rollDate)}</span>
                      <span className={`font-medium tabular-nums ${roll.netCredit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(roll.netCredit)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                      <div>
                        <p>From: ${roll.fromStrike} exp {formatDate(roll.fromExpiration)}</p>
                      </div>
                      <div>
                        <p>To: ${roll.toStrike} exp {formatDate(roll.toExpiration)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
