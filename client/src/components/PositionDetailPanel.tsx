import { useEffect, useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { StrategyBadge } from './StrategyBadge';
import { RollChainTimeline } from './RollChainTimeline';
import type { Position, RollChain, StockHolding, StrategyType, Tag } from '@shared/schema';
import { format } from 'date-fns';
import { usePriceCache } from '@/hooks/use-price-cache';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown, Minus, Activity, HelpCircle, Package, ChevronDown, RefreshCw, Shield, Undo2, Tags, Plus, X, Check, Loader2 } from 'lucide-react';
import { 
  calculateGreeks, 
  calculatePositionGreeks,
  calculateIntrinsicExtrinsic,
  type GreeksResult,
  formatDelta,
  formatGamma,
  formatTheta,
  formatVega
} from '@/lib/blackScholes';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';

interface PositionDetailPanelProps {
  position: Position | null;
  rollChains: RollChain[];
  stockHoldings?: StockHolding[];
  isOpen: boolean;
  onClose: () => void;
  positionHash?: string;
  strategyOverride?: string | null;
  onStrategyOverrideChange?: () => void;
}

export function PositionDetailPanel({ 
  position, 
  rollChains, 
  stockHoldings = [], 
  isOpen, 
  onClose,
  positionHash,
  strategyOverride,
  onStrategyOverrideChange,
}: PositionDetailPanelProps) {
  const { getPositionPrices } = usePriceCache();
  const { user } = useAuth();
  const { toast } = useToast();
  const [totalUnrealizedPL, setTotalUnrealizedPL] = useState<number | null>(null);
  const [isUpdatingStrategy, setIsUpdatingStrategy] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);

  const legPrices = position ? (getPositionPrices(position.id) || {}) : {};

  // Fetch all user tags
  const { data: userTagsData, isLoading: isLoadingUserTags } = useQuery<{ success: boolean; tags: Tag[] }>({
    queryKey: ['/api/tags'],
    enabled: !!user && isOpen,
  });

  // Fetch tags for this position
  const { data: positionTagsData, isLoading: isLoadingPositionTags } = useQuery<{ success: boolean; tags: Tag[] }>({
    queryKey: ['/api/position-tags', positionHash],
    enabled: !!user && !!positionHash && isOpen,
  });

  const userTags = userTagsData?.tags || [];
  const positionTags = positionTagsData?.tags || [];
  const positionTagIds = new Set(positionTags.map(t => t.id));

  // Create tag mutation
  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      const response = await apiRequest('POST', '/api/tags', data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
        setNewTagName('');
        toast({ title: 'Tag created', description: `"${data.tag.name}" tag created successfully` });
        // Automatically add the new tag to this position
        if (positionHash && data.tag) {
          addTagMutation.mutate({ tagId: data.tag.id });
        }
      }
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to create tag', variant: 'destructive' });
    },
  });

  // Add tag to position mutation
  const addTagMutation = useMutation({
    mutationFn: async (data: { tagId: string }) => {
      const response = await apiRequest('POST', '/api/position-tags', { positionHash, tagId: data.tagId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/position-tags', positionHash] });
      queryClient.invalidateQueries({ queryKey: ['/api/position-tags/lookup'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to add tag', variant: 'destructive' });
    },
  });

  // Remove tag from position mutation
  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      const response = await apiRequest('DELETE', `/api/position-tags/${encodeURIComponent(positionHash!)}/${tagId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/position-tags', positionHash] });
      queryClient.invalidateQueries({ queryKey: ['/api/position-tags/lookup'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to remove tag', variant: 'destructive' });
    },
  });

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    createTagMutation.mutate({ name: newTagName.trim() });
  };

  const handleToggleTag = (tag: Tag) => {
    if (positionTagIds.has(tag.id)) {
      removeTagMutation.mutate(tag.id);
    } else {
      addTagMutation.mutate({ tagId: tag.id });
    }
  };

  // Calculate Greeks for each leg
  const legGreeks = useMemo(() => {
    if (!position) return {};
    
    const greeksMap: Record<string, GreeksResult | null> = {};
    
    position.legs.forEach((leg, index) => {
      const legId = `${position.id}-leg-${index}`;
      const priceData = legPrices[legId];
      
      if (priceData && priceData.underlyingPrice && priceData.impliedVolatility && leg.expiration) {
        const mark = priceData.mark || ((priceData.bid || 0) + (priceData.ask || 0)) / 2;
        const greeks = calculateGreeks({
          underlyingPrice: priceData.underlyingPrice,
          strikePrice: leg.strike,
          expirationDate: leg.expiration,
          optionType: (leg.optionType?.toLowerCase() || 'call') as 'call' | 'put',
          impliedVolatility: priceData.impliedVolatility,
          marketPrice: mark,
        });
        greeksMap[legId] = greeks;
      } else {
        greeksMap[legId] = null;
      }
    });
    
    return greeksMap;
  }, [position, legPrices]);

  // Calculate position-level Greeks
  const positionGreeks = useMemo(() => {
    if (!position) return null;
    
    const legsWithGreeks = position.legs
      .map((leg, index) => {
        const legId = `${position.id}-leg-${index}`;
        const greeks = legGreeks[legId];
        if (!greeks) return null;
        return {
          greeks,
          quantity: leg.quantity || 1,
          transCode: leg.transCode || 'BTO',
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
    
    if (legsWithGreeks.length === 0) return null;
    
    return calculatePositionGreeks(legsWithGreeks);
  }, [position, legGreeks]);

  // Calculate total unrealized P/L from cached prices
  useEffect(() => {
    if (!position || Object.keys(legPrices).length === 0) {
      setTotalUnrealizedPL(null);
      return;
    }
    
    let totalPL = 0;
    let hasValidData = false;
    
    position.legs.forEach((leg, index) => {
      if (leg.status !== 'open') return;
      
      const legId = `${position.id}-leg-${index}`;
      const priceData = legPrices[legId];
      
      if (priceData?.mark && priceData.mark > 0) {
        hasValidData = true;
        const entryPrice = Math.abs(leg.amount) / leg.quantity / 100;
        const currentPrice = priceData.mark;
        const isSell = leg.transCode === 'STO' || leg.transCode === 'STC';
        const unrealizedPL = isSell 
          ? (entryPrice - currentPrice) * leg.quantity * 100
          : (currentPrice - entryPrice) * leg.quantity * 100;
        totalPL += unrealizedPL;
      }
    });
    
    setTotalUnrealizedPL(hasValidData ? totalPL : null);
  }, [legPrices, position]);

  // Find matching stock holding for this position's symbol
  // Note: These useMemo hooks must be before any early returns to avoid React hooks rules violation
  const matchingStockHolding = useMemo(() => {
    if (!position || stockHoldings.length === 0) return null;
    return stockHoldings.find(h => h.symbol.toUpperCase() === position.symbol.toUpperCase());
  }, [position, stockHoldings]);

  // Check if this is a strategy that benefits from stock context
  const showStockContext = useMemo(() => {
    if (!matchingStockHolding || !position) return false;
    // Show context for long positions with shares, or short positions with short shares
    const hasRelevantHolding = matchingStockHolding.totalShares !== 0 || matchingStockHolding.realizedPL !== 0;
    if (!hasRelevantHolding) return false;
    const strategies = ['Covered Call', 'Short Call', 'Cash Secured Put', 'Short Put', 'Long Call', 'Long Put'];
    return strategies.includes(position.strategyType);
  }, [matchingStockHolding, position]);

  // Calculate covered call breakeven if applicable
  const coveredCallBreakeven = useMemo(() => {
    if (!showStockContext || !matchingStockHolding || !position || position.strategyType !== 'Covered Call') return null;
    // Need at least 100 shares (long) for covered call
    if (matchingStockHolding.totalShares < 100) return null;
    
    // Determine actual contracts in the position
    const positionContracts = Math.abs(position.legs?.[0]?.quantity || 1);
    // Max contracts that could be covered by shares
    const maxContractsCoverable = Math.floor(matchingStockHolding.totalShares / 100);
    // Use the lesser of position contracts or coverable contracts
    const contractsCovered = Math.min(positionContracts, maxContractsCoverable);
    
    if (contractsCovered === 0) return null;
    
    const premiumReceived = position.totalCredit;
    // Premium per share based on actual contracts in this position
    const premiumPerShare = premiumReceived / (positionContracts * 100);
    
    return {
      originalCostBasis: matchingStockHolding.avgCostBasis,
      adjustedBreakeven: matchingStockHolding.avgCostBasis - premiumPerShare,
      premiumPerShare,
      contractsCovered,
    };
  }, [showStockContext, matchingStockHolding, position]);

  // Determine the displayed strategy (override takes precedence over original)
  const displayedStrategy = useMemo((): StrategyType => {
    return (strategyOverride || position?.strategyType || 'Unknown') as StrategyType;
  }, [strategyOverride, position]);

  // Calculate if reclassification is relevant for this position
  // Allow reclassifying any Short Call as Covered Call - user may own shares outside the uploaded data
  const canReclassifyAsCoveredCall = useMemo(() => {
    if (!position || !user || !positionHash) return false;
    const currentStrategy = strategyOverride || position.strategyType;
    // Allow reclassifying Short Call to Covered Call (user owns underlying shares)
    return currentStrategy === 'Short Call';
  }, [position, user, positionHash, strategyOverride]);

  const canRevertToOriginal = useMemo(() => {
    return !!strategyOverride && user && positionHash;
  }, [strategyOverride, user, positionHash]);

  // Handler to update strategy override
  const handleStrategyOverride = async (newStrategy: string) => {
    if (!position || !positionHash || !user) return;
    
    setIsUpdatingStrategy(true);
    try {
      await apiRequest('POST', '/api/strategy-overrides', {
        positionHash,
        originalStrategy: position.strategyType,
        overrideStrategy: newStrategy,
      });
      
      toast({
        title: "Strategy Updated",
        description: `Position reclassified as ${newStrategy}`,
      });
      
      // Await the callback to ensure cache is invalidated before state updates
      await onStrategyOverrideChange?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update strategy",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingStrategy(false);
    }
  };

  // Handler to revert to auto-detected strategy
  const handleRevertStrategy = async () => {
    if (!positionHash || !user) return;
    
    setIsUpdatingStrategy(true);
    try {
      await apiRequest('DELETE', `/api/strategy-overrides/${encodeURIComponent(positionHash)}`);
      
      toast({
        title: "Strategy Reverted",
        description: "Position reverted to auto-detected classification",
      });
      
      // Await the callback to ensure cache is invalidated before state updates
      await onStrategyOverrideChange?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to revert strategy",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingStrategy(false);
    }
  };

  if (!position) return null;

  // Find the roll chain this position belongs to
  const chain = position.rollChainId ? rollChains.find(c => c.chainId === position.rollChainId) : null;

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

  // Show reclassify options only if user is authenticated and there are options available
  const showReclassifyOption = canReclassifyAsCoveredCall || canRevertToOriginal;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="dialog-position-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            <span className="text-2xl font-semibold">{position.symbol}</span>
            
            {showReclassifyOption ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="h-auto p-0 hover:bg-transparent"
                    disabled={isUpdatingStrategy}
                    data-testid="button-reclassify-strategy"
                  >
                    <div className="flex items-center gap-1">
                      <StrategyBadge strategy={displayedStrategy} />
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" data-testid="dropdown-strategy-options">
                  {canReclassifyAsCoveredCall && (
                    <DropdownMenuItem 
                      onClick={() => handleStrategyOverride('Covered Call')}
                      className="flex items-center gap-2"
                      data-testid="menu-item-covered-call"
                    >
                      <Shield className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="font-medium">Reclassify as Covered Call</p>
                        <p className="text-xs text-muted-foreground">
                          {matchingStockHolding && matchingStockHolding.totalShares >= 100 
                            ? `You own ${matchingStockHolding.totalShares} shares of ${position.symbol}`
                            : `Mark as covered if you own 100+ shares of ${position.symbol}`
                          }
                        </p>
                      </div>
                    </DropdownMenuItem>
                  )}
                  {canReclassifyAsCoveredCall && canRevertToOriginal && <DropdownMenuSeparator />}
                  {canRevertToOriginal && (
                    <DropdownMenuItem 
                      onClick={handleRevertStrategy}
                      className="flex items-center gap-2"
                      data-testid="menu-item-revert-strategy"
                    >
                      <Undo2 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Revert to Auto-Detected</p>
                        <p className="text-xs text-muted-foreground">
                          Original: {position.strategyType}
                        </p>
                      </div>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <StrategyBadge strategy={displayedStrategy} />
            )}
            
            {strategyOverride && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-xs">
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Override
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>This strategy was manually reclassified from "{position.strategyType}"</p>
                </TooltipContent>
              </Tooltip>
            )}
            
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
            {totalUnrealizedPL !== null && position.status === 'open' && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Live P/L</p>
                <p className={`font-semibold tabular-nums flex items-center gap-1 ${totalUnrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalUnrealizedPL >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {formatCurrency(totalUnrealizedPL)}
                </p>
              </div>
            )}
          </div>

          {/* Tags Section - Only show for authenticated users */}
          {user && positionHash && (
            <div className="p-4 border rounded-md bg-muted/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Tags className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold">Tags</h3>
                </div>
                <Popover open={isTagPopoverOpen} onOpenChange={setIsTagPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      data-testid="button-manage-tags"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Tag
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="end">
                    <div className="space-y-3">
                      <div className="font-medium text-sm">Add Tags</div>
                      
                      {/* Create new tag */}
                      <div className="flex gap-2">
                        <Input
                          placeholder="New tag name..."
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCreateTag();
                            }
                          }}
                          className="h-8 text-sm"
                          data-testid="input-new-tag-name"
                        />
                        <Button 
                          size="sm" 
                          onClick={handleCreateTag}
                          disabled={!newTagName.trim() || createTagMutation.isPending}
                          className="h-8 px-2"
                          data-testid="button-create-tag"
                        >
                          {createTagMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Existing tags list */}
                      {isLoadingUserTags ? (
                        <div className="flex items-center justify-center py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : userTags.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {userTags.map((tag) => {
                            const isSelected = positionTagIds.has(tag.id);
                            const isPending = addTagMutation.isPending || removeTagMutation.isPending;
                            return (
                              <button
                                key={tag.id}
                                onClick={() => handleToggleTag(tag)}
                                disabled={isPending}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors ${
                                  isSelected 
                                    ? 'bg-primary/10 text-primary hover:bg-primary/20' 
                                    : 'hover:bg-muted'
                                }`}
                                data-testid={`tag-option-${tag.id}`}
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
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground py-2">
                          No tags yet. Create your first tag above.
                        </p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Display current position tags */}
              {isLoadingPositionTags ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Loading tags...</span>
                </div>
              ) : positionTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {positionTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant="secondary"
                      className="flex items-center gap-1 pl-2 pr-1 py-1"
                      style={{ 
                        backgroundColor: `${tag.color}20`,
                        borderColor: tag.color,
                        color: tag.color,
                      }}
                      data-testid={`tag-badge-${tag.id}`}
                    >
                      <div 
                        className="w-2 h-2 rounded-full mr-1" 
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                      <button
                        onClick={() => removeTagMutation.mutate(tag.id)}
                        className="ml-1 hover:bg-black/10 rounded p-0.5"
                        data-testid={`button-remove-tag-${tag.id}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No tags applied. Click "Add Tag" to organize this position.
                </p>
              )}
            </div>
          )}

          {/* Stock Context Section */}
          {showStockContext && matchingStockHolding && (
            <div className="p-4 border rounded-md bg-muted/30">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-primary" />
                <h3 className="font-semibold">Underlying Stock Position</h3>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Shares Held</p>
                  <p className="font-semibold tabular-nums">{matchingStockHolding.totalShares.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Avg Cost Basis</p>
                  <p className="font-semibold tabular-nums">{formatCurrency(matchingStockHolding.avgCostBasis)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Cost</p>
                  <p className="font-semibold tabular-nums">{formatCurrency(matchingStockHolding.totalCost)}</p>
                </div>
                {matchingStockHolding.realizedPL !== 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Realized P/L (Stock)</p>
                    <p className={`font-semibold tabular-nums ${matchingStockHolding.realizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(matchingStockHolding.realizedPL)}
                    </p>
                  </div>
                )}
              </div>

              {/* Covered Call Breakeven Analysis */}
              {coveredCallBreakeven && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Covered Call Breakeven Analysis</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Contracts Covered</p>
                      <p className="font-semibold tabular-nums">{coveredCallBreakeven.contractsCovered}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Premium/Share</p>
                      <p className="font-semibold tabular-nums text-green-600">{formatCurrency(coveredCallBreakeven.premiumPerShare)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Adjusted Breakeven</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="font-semibold tabular-nums cursor-help">
                            {formatCurrency(coveredCallBreakeven.adjustedBreakeven)}
                            <span className="text-xs text-muted-foreground ml-1">(was {formatCurrency(coveredCallBreakeven.originalCostBasis)})</span>
                          </p>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">Your effective breakeven is lowered by the premium collected from selling calls.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Position Greeks Section */}
          {positionGreeks && position.status === 'open' && (
            <div className="p-4 border rounded-md bg-muted/30">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-primary" />
                <h3 className="font-semibold">Position Greeks</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Greeks show your position's sensitivity to market changes. Delta/Theta/Vega are in dollars. Gamma shows how delta changes.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground mb-1 cursor-help flex items-center gap-1">
                        Delta ($Δ)
                        <HelpCircle className="w-3 h-3" />
                      </p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">Expected P/L change for a $1 move in the underlying stock. Positive = bullish, Negative = bearish.</p>
                    </TooltipContent>
                  </Tooltip>
                  <p className={`font-semibold tabular-nums ${positionGreeks.totalDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {positionGreeks.totalDelta >= 0 ? '+' : ''}{positionGreeks.totalDelta.toFixed(0)}
                  </p>
                </div>
                
                <div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground mb-1 cursor-help flex items-center gap-1">
                        Gamma
                        <HelpCircle className="w-3 h-3" />
                      </p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">Position delta change per $1 underlying move. E.g., gamma of +5 means delta increases by 5 per $1 up move.</p>
                    </TooltipContent>
                  </Tooltip>
                  <p className="font-semibold tabular-nums">
                    {positionGreeks.totalGamma >= 0 ? '+' : ''}{positionGreeks.totalGamma.toFixed(2)}
                  </p>
                </div>
                
                <div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground mb-1 cursor-help flex items-center gap-1">
                        Theta ($Θ/day)
                        <HelpCircle className="w-3 h-3" />
                      </p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">Daily time decay. Negative = losing money each day, Positive = gaining (if you sold options).</p>
                    </TooltipContent>
                  </Tooltip>
                  <p className={`font-semibold tabular-nums ${positionGreeks.totalTheta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {positionGreeks.totalTheta >= 0 ? '+' : ''}${positionGreeks.totalTheta.toFixed(2)}
                  </p>
                </div>
                
                <div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground mb-1 cursor-help flex items-center gap-1">
                        Vega ($ν)
                        <HelpCircle className="w-3 h-3" />
                      </p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">P/L change per 1% change in implied volatility. Positive = benefits from rising IV.</p>
                    </TooltipContent>
                  </Tooltip>
                  <p className="font-semibold tabular-nums">
                    {positionGreeks.totalVega >= 0 ? '+' : ''}${positionGreeks.totalVega.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Option Legs */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Option Legs</h3>
            <div className="space-y-2">
              {position.legs.map((leg, index) => {
                const legId = `${position.id}-leg-${index}`;
                const priceData = legPrices[legId];
                const greeks = legGreeks[legId];
                const entryPrice = Math.abs(leg.amount) / leg.quantity / 100;
                const currentPrice = priceData?.mark;
                const isSell = leg.transCode === 'STO' || leg.transCode === 'STC';
                
                let unrealizedPL: number | null = null;
                if (currentPrice && currentPrice > 0 && leg.status === 'open') {
                  unrealizedPL = isSell 
                    ? (entryPrice - currentPrice) * leg.quantity * 100
                    : (currentPrice - entryPrice) * leg.quantity * 100;
                }
                
                return (
                  <div
                    key={leg.id}
                    className="p-4 border rounded-md bg-card"
                    data-testid={`leg-${leg.id}`}
                  >
                    <div className="flex items-center justify-between">
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
                          {leg.quantity} contracts @ {formatCurrency(entryPrice)}
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
                    
                    {/* Current price and P/L row for open legs */}
                    {leg.status === 'open' && (
                      <div className="mt-3 py-2 px-3 rounded bg-muted/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>Current:</span>
                            {currentPrice && currentPrice > 0 ? (
                              <span className="font-medium text-foreground">{formatCurrency(currentPrice)}</span>
                            ) : priceData?.error ? (
                              <span className="text-destructive">{priceData.error}</span>
                            ) : (
                              <span>—</span>
                            )}
                            {currentPrice && currentPrice > 0 && (
                              <>
                                <span>vs Entry:</span>
                                <span className="font-medium text-foreground">{formatCurrency(entryPrice)}</span>
                              </>
                            )}
                          </div>
                          {unrealizedPL !== null && (
                            <div className={`flex items-center gap-1 text-sm font-semibold ${unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {unrealizedPL > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : unrealizedPL < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                              <span>{formatCurrency(unrealizedPL)}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Per-leg Greeks */}
                        {greeks && (
                          <div className="mt-2 pt-2 border-t border-border/50">
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                              <Activity className="w-3 h-3" />
                              Greeks
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">
                                    <span className="text-muted-foreground">Δ:</span>{' '}
                                    <span className="font-mono tabular-nums">{formatDelta(greeks.delta)}</span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Delta: Price change per $1 stock move</p>
                                </TooltipContent>
                              </Tooltip>
                              
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">
                                    <span className="text-muted-foreground">Γ:</span>{' '}
                                    <span className="font-mono tabular-nums">{formatGamma(greeks.gamma)}</span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Gamma: Rate of Delta change</p>
                                </TooltipContent>
                              </Tooltip>
                              
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">
                                    <span className="text-muted-foreground">Θ:</span>{' '}
                                    <span className={`font-mono tabular-nums ${greeks.theta < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                      {formatTheta(greeks.theta)}
                                    </span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Theta: Daily time decay per contract</p>
                                </TooltipContent>
                              </Tooltip>
                              
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">
                                    <span className="text-muted-foreground">ν:</span>{' '}
                                    <span className="font-mono tabular-nums">{formatVega(greeks.vega)}</span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Vega: Price change per 1% IV move</p>
                                </TooltipContent>
                              </Tooltip>
                              
                              <span className="text-muted-foreground">|</span>
                              
                              <span>
                                <span className="text-muted-foreground">IV:</span>{' '}
                                <span className="font-mono tabular-nums">{(greeks.impliedVolatility * 100).toFixed(1)}%</span>
                              </span>
                              
                              <span>
                                <span className="text-muted-foreground">DTE:</span>{' '}
                                <span className="font-mono tabular-nums">{Math.round(greeks.daysToExpiration)}</span>
                              </span>
                            </div>
                          </div>
                        )}
                        
                        {/* Intrinsic & Extrinsic Values */}
                        {priceData?.underlyingPrice && currentPrice && currentPrice > 0 && (
                          (() => {
                            const intrinsicExtrinsic = calculateIntrinsicExtrinsic(
                              priceData.underlyingPrice,
                              leg.strike,
                              leg.optionType?.toLowerCase() as 'call' | 'put',
                              currentPrice
                            );
                            return (
                              <div className="mt-2 pt-2 border-t border-border/50">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4 text-xs">
                                    <span>
                                      <span className="text-muted-foreground">Intrinsic:</span>{' '}
                                      <span className={`font-mono tabular-nums font-medium ${intrinsicExtrinsic.intrinsicValue > 0 ? 'text-green-600' : ''}`}>
                                        ${intrinsicExtrinsic.intrinsicValue.toFixed(2)}
                                      </span>
                                    </span>
                                    <span>
                                      <span className="text-muted-foreground">Extrinsic:</span>{' '}
                                      <span className="font-mono tabular-nums font-medium text-amber-600">
                                        ${intrinsicExtrinsic.extrinsicValue.toFixed(2)}
                                      </span>
                                    </span>
                                  </div>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-[10px] ${
                                      intrinsicExtrinsic.isITM ? 'border-green-500 text-green-600' :
                                      intrinsicExtrinsic.isOTM ? 'border-red-500 text-red-600' :
                                      'border-muted-foreground'
                                    }`}
                                  >
                                    {intrinsicExtrinsic.moneyness}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Roll Chain Timeline */}
          {chain && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Complete Roll Chain</h3>
              <RollChainTimeline chain={chain} />
            </div>
          )}

          {/* Individual Position Rolls */}
          {position.rolls.length > 0 && !chain && (
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
