import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, X, Filter } from 'lucide-react';
import type { StrategyType } from '@shared/schema';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  strategyFilter: string;
  onStrategyChange: (strategy: string) => void;
  symbolFilter: string;
  onSymbolChange: (symbol: string) => void;
  statusFilter: string;
  onStatusChange: (status: string) => void;
  onClearFilters: () => void;
  symbols: string[];
  showStatusFilter?: boolean;
}

const strategies: StrategyType[] = [
  'Covered Call',
  'Cash Secured Put',
  'Put Credit Spread',
  'Call Credit Spread',
  'Put Debit Spread',
  'Call Debit Spread',
  'Iron Condor',
  'Long Call',
  'Long Put',
  'Short Call',
  'Short Put',
  'Long Stock',
  'Short Stock',
];

export function FilterBar({
  searchQuery,
  onSearchChange,
  strategyFilter,
  onStrategyChange,
  symbolFilter,
  onSymbolChange,
  statusFilter,
  onStatusChange,
  onClearFilters,
  symbols,
  showStatusFilter = false,
}: FilterBarProps) {
  const activeFiltersCount = [
    strategyFilter !== 'all',
    symbolFilter !== 'all',
    statusFilter !== 'all',
    searchQuery.length > 0,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search positions..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Select value={strategyFilter} onValueChange={onStrategyChange}>
            <SelectTrigger className="w-[180px]" data-testid="select-strategy">
              <SelectValue placeholder="Strategy Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Strategies</SelectItem>
              {strategies.map((strategy) => (
                <SelectItem key={strategy} value={strategy}>
                  {strategy}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={symbolFilter} onValueChange={onSymbolChange}>
            <SelectTrigger className="w-[140px]" data-testid="select-symbol">
              <SelectValue placeholder="Symbol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Symbols</SelectItem>
              {symbols.map((symbol) => (
                <SelectItem key={symbol} value={symbol}>
                  {symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showStatusFilter && (
            <Select value={statusFilter} onValueChange={onStatusChange}>
              <SelectTrigger className="w-[140px]" data-testid="select-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          )}

          {activeFiltersCount > 0 && (
            <Button
              variant="outline"
              size="default"
              onClick={onClearFilters}
              data-testid="button-clear-filters"
            >
              <X className="w-4 h-4 mr-2" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {strategyFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              {strategyFilter}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => onStrategyChange('all')}
              />
            </Badge>
          )}
          {symbolFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              {symbolFilter}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => onSymbolChange('all')}
              />
            </Badge>
          )}
          {showStatusFilter && statusFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              {statusFilter}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => onStatusChange('all')}
              />
            </Badge>
          )}
          {searchQuery && (
            <Badge variant="secondary" className="gap-1">
              Search: {searchQuery}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => onSearchChange('')}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
