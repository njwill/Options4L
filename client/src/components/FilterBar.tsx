import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Search, X, Filter, Tags, Check } from 'lucide-react';
import type { StrategyType, Tag } from '@shared/schema';

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
  availableTags?: Tag[];
  selectedTagIds?: string[];
  onTagFilterChange?: (tagIds: string[]) => void;
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
  availableTags = [],
  selectedTagIds = [],
  onTagFilterChange,
}: FilterBarProps) {
  const showTagFilter = availableTags.length > 0 && onTagFilterChange;
  
  const activeFiltersCount = [
    strategyFilter !== 'all',
    symbolFilter !== 'all',
    statusFilter !== 'all',
    searchQuery.length > 0,
    selectedTagIds.length > 0,
  ].filter(Boolean).length;

  const handleTagToggle = (tagId: string) => {
    if (!onTagFilterChange) return;
    if (selectedTagIds.includes(tagId)) {
      onTagFilterChange(selectedTagIds.filter(id => id !== tagId));
    } else {
      onTagFilterChange([...selectedTagIds, tagId]);
    }
  };

  const selectedTags = availableTags.filter(tag => selectedTagIds.includes(tag.id));

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

          {showTagFilter && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[140px] justify-start"
                  data-testid="button-tag-filter"
                >
                  <Tags className="h-4 w-4 mr-2" />
                  {selectedTagIds.length === 0 ? (
                    <span>Tags</span>
                  ) : (
                    <span className="truncate">
                      {selectedTagIds.length} tag{selectedTagIds.length > 1 ? 's' : ''}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-1">
                  <div className="text-sm font-medium mb-2 px-2">Filter by Tags</div>
                  {availableTags.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-1">
                      No tags available. Create tags from the position detail panel.
                    </p>
                  ) : (
                    availableTags.map((tag) => {
                      const isSelected = selectedTagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          onClick={() => handleTagToggle(tag.id)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors ${
                            isSelected
                              ? 'bg-primary/10 text-primary hover:bg-primary/20'
                              : 'hover:bg-muted'
                          }`}
                          data-testid={`filter-tag-${tag.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span>{tag.name}</span>
                          </div>
                          {isSelected && <Check className="h-4 w-4" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
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
          {selectedTags.map((tag) => (
            <Badge 
              key={tag.id} 
              variant="secondary" 
              className="gap-1"
              style={{ 
                backgroundColor: `${tag.color}20`,
                borderColor: tag.color,
                color: tag.color,
              }}
            >
              <div 
                className="w-2 h-2 rounded-full mr-1" 
                style={{ backgroundColor: tag.color }}
              />
              {tag.name}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => handleTagToggle(tag.id)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
