import { useState, useEffect, useRef } from 'react';
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { ExternalLink, Key, RefreshCw, X } from 'lucide-react';
import { Route, Switch, useLocation, useSearch } from 'wouter';
import { format } from 'date-fns';
import Dashboard from '@/pages/Dashboard';
import OpenPositions from '@/pages/OpenPositions';
import ClosedPositions from '@/pages/ClosedPositions';
import TransactionHistory from '@/pages/TransactionHistory';
import Analysis from '@/pages/Analysis';
import AccountSettings from '@/pages/AccountSettings';
import { EmailVerify } from '@/pages/EmailVerify';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfService from '@/pages/TermsOfService';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { LivePriceCacheProvider, usePriceCache } from '@/hooks/use-price-cache';
import { LoginModal } from '@/components/LoginModal';
import { SignupPromptModal } from '@/components/SignupPromptModal';
import { UserMenu } from '@/components/UserMenu';
import { ImportSessionDialog } from '@/components/ImportSessionDialog';
import { useEngagementTracker } from '@/hooks/use-engagement-tracker';
import { useToast } from '@/hooks/use-toast';
import type { Position, Transaction, SummaryStats, RollChain, StockHolding } from '@shared/schema';

type TabType = 'dashboard' | 'open' | 'closed' | 'transactions' | 'analysis' | 'account';

function AppContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [positions, setPositions] = useState<Position[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rawTransactions, setRawTransactions] = useState<Transaction[]>([]); // Original parsed transactions for import
  const [rollChains, setRollChains] = useState<RollChain[]>([]);
  const [stockHoldings, setStockHoldings] = useState<StockHolding[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState<SummaryStats>({
    totalPL: 0,
    realizedPL: 0,
    openPositionsCount: 0,
    closedPositionsCount: 0,
    totalPremiumCollected: 0,
    winRate: 0,
    totalWins: 0,
    totalLosses: 0,
  });
  const [hadAnonymousDataBeforeLogin, setHadAnonymousDataBeforeLogin] = useState(false);
  const [hasLoadedUserData, setHasLoadedUserData] = useState(false);
  const [isLoadingUserData, setIsLoadingUserData] = useState(false);
  const [loadAttempts, setLoadAttempts] = useState(0);
  const MAX_LOAD_ATTEMPTS = 3;
  
  // Live prices state
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const { 
    setPositionPrices, 
    clearAllPrices, 
    hasCachedPrices,
    lastRefreshTime,
    setLastRefreshTime 
  } = usePriceCache();
  
  // Ref to track login state for race condition protection
  const isLoggedInRef = useRef(false);
  // Ref to track previous user for detecting logout transitions
  const prevUserRef = useRef<typeof user>(null);
  
  // Keep refs in sync with user state
  useEffect(() => {
    isLoggedInRef.current = !!user;
  }, [user]);

  // Engagement tracking for anonymous users with data
  const hasAnonymousData = !user && positions.length > 0;
  const { 
    shouldShowPrompt, 
    trackPageChange, 
    markPromptShown, 
    resetTracker 
  } = useEngagementTracker({
    clickThreshold: 5,
    pageChangeThreshold: 2,
    enabled: hasAnonymousData
  });

  // Track tab changes as page changes
  useEffect(() => {
    if (hasAnonymousData) {
      trackPageChange(activeTab);
    }
  }, [activeTab, hasAnonymousData, trackPageChange]);

  // Show signup prompt when engagement threshold is met
  useEffect(() => {
    if (shouldShowPrompt && hasAnonymousData && !showSignupPrompt && !showLoginModal) {
      setShowSignupPrompt(true);
      markPromptShown();
    }
  }, [shouldShowPrompt, hasAnonymousData, showSignupPrompt, showLoginModal, markPromptShown]);

  // Reset engagement tracker when user logs in
  useEffect(() => {
    if (user) {
      resetTracker();
    }
  }, [user, resetTracker]);

  // Load user's saved data from database after login
  const loadUserData = async (): Promise<boolean> => {
    // Prevent concurrent loads
    if (isLoadingUserData) return false;
    
    try {
      setIsLoadingUserData(true);
      setIsProcessing(true);
      const response = await fetch('/api/user/data', {
        credentials: 'include',
      });

      // Guard against race condition - user may have logged out during fetch
      if (!isLoggedInRef.current) {
        console.log('User logged out during data fetch, discarding results');
        return false;
      }

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.log('User data endpoint returned non-JSON response, auth may still be settling');
        // This is likely a transient issue - allow retry
        return false;
      }

      if (!response.ok) {
        // Handle auth errors - user might not be fully logged in yet
        if (response.status === 401) {
          console.log('Auth not ready yet, will retry');
          return false;
        }
        throw new Error('Failed to load user data');
      }

      const data = await response.json();
      
      // Final guard before setting state
      if (!isLoggedInRef.current) {
        console.log('User logged out before data could be applied');
        return false;
      }
      
      if (data.hasData) {
        setPositions(data.positions);
        setTransactions(data.transactions);
        setRollChains(data.rollChains || []);
        setStockHoldings(data.stockHoldings || []);
        setSummary(data.summary);
        setActiveTab('dashboard');
        
        toast({
          title: 'Welcome back!',
          description: `Loaded ${data.transactions.length} transactions and ${data.positions.length} positions`,
        });
      }
      return true; // Successfully loaded (even if no data)
    } catch (error) {
      console.error('Failed to load user data:', error);
      toast({
        title: 'Failed to load data',
        description: 'Could not load your saved data. Please try uploading your file again.',
        variant: 'destructive',
      });
      // Return true on exception to stop retries - show toast and let user upload
      return true;
    } finally {
      setIsProcessing(false);
      setIsLoadingUserData(false);
    }
  };

  // Refresh data without changing tabs or showing welcome toast (for use after actions)
  const refreshData = async (): Promise<boolean> => {
    if (isLoadingUserData) return false;
    
    try {
      setIsLoadingUserData(true);
      const response = await fetch('/api/user/data', {
        credentials: 'include',
      });

      if (!isLoggedInRef.current) {
        return false;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return false;
      }

      if (!response.ok) {
        if (response.status === 401) {
          return false;
        }
        throw new Error('Failed to refresh data');
      }

      const data = await response.json();
      
      if (!isLoggedInRef.current) {
        return false;
      }
      
      if (data.hasData) {
        setPositions(data.positions);
        setTransactions(data.transactions);
        setRollChains(data.rollChains || []);
        setStockHoldings(data.stockHoldings || []);
        setSummary(data.summary);
        // Note: We don't change activeTab here to stay on current tab
      }
      return true;
    } catch (error) {
      console.error('Failed to refresh data:', error);
      toast({
        title: 'Failed to refresh',
        description: 'Could not refresh data. Please try again.',
        variant: 'destructive',
      });
      return true;
    } finally {
      setIsLoadingUserData(false);
    }
  };

  // Monitor user login and either show import dialog or load saved data
  useEffect(() => {
    const handleUserLogin = async () => {
      if (rawTransactions.length > 0 && !hadAnonymousDataBeforeLogin) {
        // User has anonymous session data - show import dialog
        setShowImportDialog(true);
        setHadAnonymousDataBeforeLogin(true);
        setHasLoadedUserData(true);
      } else if (rawTransactions.length === 0 && !isLoadingUserData) {
        // No anonymous data - load user's saved data from database
        const success = await loadUserData();
        if (success) {
          setHasLoadedUserData(true);
        } else {
          // Increment attempt counter - will retry up to MAX_LOAD_ATTEMPTS
          setLoadAttempts(prev => prev + 1);
        }
      }
    };

    // Stop retrying after max attempts
    if (loadAttempts >= MAX_LOAD_ATTEMPTS && !hasLoadedUserData) {
      setHasLoadedUserData(true); // Stop further attempts
      toast({
        title: 'Unable to load data',
        description: 'Please upload your trading data file to get started.',
        variant: 'destructive',
      });
      return;
    }

    if (user && !hasLoadedUserData && !isLoadingUserData) {
      // Add small delay between retry attempts
      if (loadAttempts > 0) {
        const timer = setTimeout(handleUserLogin, 1000);
        return () => clearTimeout(timer);
      } else {
        handleUserLogin();
      }
    }
    
    // Only clear data on actual logout transition (was logged in, now logged out)
    // This prevents clearing data for anonymous users who were never logged in
    const wasLoggedIn = !!prevUserRef.current;
    const isLoggedOut = !user;
    
    if (wasLoggedIn && isLoggedOut) {
      // User just logged out - clear everything
      setHasLoadedUserData(false);
      setLoadAttempts(0);
      setPositions([]);
      setTransactions([]);
      setRawTransactions([]);
      setRollChains([]);
      setStockHoldings([]);
      setSummary({
        totalPL: 0,
        realizedPL: 0,
        openPositionsCount: 0,
        closedPositionsCount: 0,
        totalPremiumCollected: 0,
        winRate: 0,
        totalWins: 0,
        totalLosses: 0,
      });
      setActiveTab('dashboard');
      setShowImportDialog(false);
      setShowLoginModal(false);
      setHadAnonymousDataBeforeLogin(false);
      setIsProcessing(false);
      queryClient.clear();
    }
    
    // Update prev user ref for next comparison
    prevUserRef.current = user;
  }, [user, rawTransactions.length, hadAnonymousDataBeforeLogin, hasLoadedUserData, isLoadingUserData, loadAttempts]);

  const handleFileUpload = async (file: File) => {
    // Capture auth state at invocation to detect logout during upload
    const startedLoggedIn = !!user;
    
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      
      // Guard against setting state if user logged out during upload
      // Only applies if we started logged in - anonymous uploads always proceed
      if (startedLoggedIn && !isLoggedInRef.current) {
        console.log('User logged out during upload, discarding results');
        return;
      }
      
      setPositions(data.positions);
      setTransactions(data.transactions);
      setRawTransactions(data.rawTransactions || data.transactions); // Store raw parsed transactions
      setRollChains(data.rollChains || []);
      setStockHoldings(data.stockHoldings || []);
      setSummary(data.summary);
      setActiveTab('dashboard');

      if (data.message) {
        toast({
          title: 'Success',
          description: data.message,
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to process file',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportComplete = (data: {
    transactions: Transaction[];
    positions: Position[];
    rollChains: RollChain[];
    stockHoldings?: StockHolding[];
    summary: SummaryStats;
    message: string;
  }) => {
    // Guard against setting state if user logged out during import
    if (!isLoggedInRef.current) {
      console.log('User logged out during import, discarding results');
      return;
    }
    
    setTransactions(data.transactions);
    setPositions(data.positions);
    setRollChains(data.rollChains);
    setStockHoldings(data.stockHoldings || []);
    setSummary(data.summary);
    setRawTransactions([]); // Clear raw transactions after import
    setActiveTab('dashboard');

    toast({
      title: 'Session Data Imported',
      description: data.message,
    });
  };

  const handleUngroupPosition = async (groupId: string) => {
    // Only authenticated users can ungroup positions
    if (!user) {
      throw new Error('Authentication required to ungroup positions');
    }

    const response = await fetch(`/api/manual-groupings/${groupId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Failed to ungroup position');
    }

    // Reload user data to reflect the ungrouping (without changing tab)
    await refreshData();
  };

  // Get open positions for live price fetching
  const openPositions = positions.filter(p => p.status === 'open');

  // Build leg requests for options chain API (from all open positions)
  const buildLegRequests = () => {
    const legs: { symbol: string; strike: number; expiration: string; type: 'call' | 'put'; legId: string }[] = [];
    
    for (const pos of openPositions) {
      if (pos.legs && Array.isArray(pos.legs)) {
        for (let i = 0; i < pos.legs.length; i++) {
          const leg = pos.legs[i];
          if (leg && leg.strike && leg.expiration && leg.optionType) {
            legs.push({
              symbol: pos.symbol,
              strike: leg.strike,
              expiration: leg.expiration,
              type: leg.optionType.toLowerCase() as 'call' | 'put',
              legId: `${pos.id}-leg-${i}`,
            });
          }
        }
      }
    }
    
    return legs;
  };

  // Fetch live quotes for all open positions
  const fetchLiveQuotes = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to fetch live option prices.',
        variant: 'destructive',
      });
      return;
    }
    
    if (openPositions.length === 0) {
      toast({
        title: 'No open positions',
        description: 'There are no open positions to fetch prices for.',
      });
      return;
    }
    
    setIsLoadingQuotes(true);
    setQuotesError(null);
    
    try {
      // Build leg requests for options chain
      const legRequests = buildLegRequests();
      
      // Fetch options chain data with Greeks (groups by symbol internally)
      if (legRequests.length > 0) {
        const chainResponse = await apiRequest('POST', '/api/options/chain', { legs: legRequests });
        const chainData = await chainResponse.json();
        
        if (chainData.success && chainData.optionData) {
          // Write prices to shared cache grouped by position ID
          const pricesByPosition: Record<string, Record<string, any>> = {};
          Object.entries(chainData.optionData).forEach(([legId, legData]) => {
            const positionId = legId.split('-leg-')[0];
            if (!pricesByPosition[positionId]) {
              pricesByPosition[positionId] = {};
            }
            pricesByPosition[positionId][legId] = legData;
          });
          
          Object.entries(pricesByPosition).forEach(([positionId, prices]) => {
            setPositionPrices(positionId, prices as any);
          });
          
          setLastRefreshTime(new Date());
          
          toast({
            title: 'Prices Updated',
            description: `Live prices fetched for ${openPositions.length} position${openPositions.length === 1 ? '' : 's'}.`,
          });
        } else {
          throw new Error(chainData.error || 'Failed to fetch option prices');
        }
      }
    } catch (error) {
      console.error('Error fetching live quotes:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch prices';
      setQuotesError(errorMessage);
      toast({
        title: 'Price Fetch Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoadingQuotes(false);
    }
  };

  // Clear all live prices
  const handleClearPrices = () => {
    clearAllPrices();
    setQuotesError(null);
    toast({
      title: 'Prices Cleared',
      description: 'Live price data has been cleared.',
    });
  };

  const tabs = [
    { id: 'dashboard' as TabType, label: 'Dashboard', count: null },
    { id: 'open' as TabType, label: 'Open Positions', count: summary.openPositionsCount },
    { id: 'closed' as TabType, label: 'Closed Positions', count: summary.closedPositionsCount },
    { id: 'transactions' as TabType, label: 'Transaction History', count: transactions.length },
    { id: 'analysis' as TabType, label: 'Analysis', count: rollChains.length > 0 ? rollChains.length : null },
  ];

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background flex flex-col">
          {/* Header */}
          <header className="border-b bg-card flex-shrink-0">
            <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
              <div 
                role="button"
                tabIndex={0}
                onClick={() => setActiveTab('dashboard')} 
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab('dashboard'); } }}
                className="text-left cursor-pointer hover-elevate rounded-md px-2 py-1 -mx-2 -my-1"
                data-testid="link-home"
              >
                <h1 className="text-xl font-semibold">Robinhood Options Analysis</h1>
                <p className="text-xs text-muted-foreground">Track strategies, rolls, and P/L</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" asChild data-testid="link-instructions">
                  <a href="https://youtu.be/W59dDyb_tyw" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                    Instructions
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                {openPositions.length > 0 && (
                  <div className="flex items-center gap-2">
                    {!hasCachedPrices() ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchLiveQuotes}
                            disabled={isLoadingQuotes || !user}
                            data-testid="button-get-prices"
                          >
                            <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingQuotes ? 'animate-spin' : ''}`} />
                            {isLoadingQuotes ? 'Loading...' : 'Get Live Prices'}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Fetch live option prices from Yahoo Finance</p>
                          {!user && (
                            <p className="text-xs text-muted-foreground mt-1">Sign in to fetch prices</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleClearPrices}
                              data-testid="button-clear-prices"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Clear Live Prices
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Clear cached live prices</p>
                          </TooltipContent>
                        </Tooltip>
                        {lastRefreshTime && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            Updated {format(lastRefreshTime, 'h:mm a')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {!user ? (
                  <Button 
                    variant="default" 
                    onClick={() => setShowLoginModal(true)}
                    data-testid="button-sign-in"
                  >
                    <Key className="w-4 h-4 mr-2" />
                    Sign in
                  </Button>
                ) : (
                  <UserMenu onAccountClick={() => setActiveTab('account')} />
                )}
                <ThemeToggle />
              </div>
            </div>

            {/* Tabs */}
            {positions.length > 0 && (
              <div className="max-w-7xl mx-auto px-4">
                <div className="flex gap-1 overflow-x-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap hover-elevate ${
                        activeTab === tab.id
                          ? 'border-primary text-foreground'
                          : 'border-transparent text-muted-foreground'
                      }`}
                      data-testid={`tab-${tab.id}`}
                    >
                      {tab.label}
                      {tab.count !== null && tab.count > 0 && (
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </header>

          {/* Main Content */}
          <main className="flex-1 w-full">
            <div className="max-w-7xl mx-auto px-4 py-8">
              {activeTab === 'dashboard' && (
                <Dashboard
                  positions={positions}
                  transactions={transactions}
                  rollChains={rollChains}
                  stockHoldings={stockHoldings}
                  onFileUpload={handleFileUpload}
                  isProcessing={isProcessing}
                  summary={summary}
                />
              )}
              {activeTab === 'open' && <OpenPositions positions={positions} rollChains={rollChains} stockHoldings={stockHoldings} onUngroupPosition={handleUngroupPosition} onDataChange={refreshData} />}
              {activeTab === 'closed' && <ClosedPositions positions={positions} rollChains={rollChains} stockHoldings={stockHoldings} onUngroupPosition={handleUngroupPosition} onDataChange={refreshData} />}
              {activeTab === 'transactions' && <TransactionHistory transactions={transactions} onGroupCreated={refreshData} />}
              {activeTab === 'analysis' && <Analysis positions={positions} rollChains={rollChains} stockHoldings={stockHoldings} />}
              {activeTab === 'account' && <AccountSettings 
                onDataChange={() => {
                  if (user) {
                    setHasLoadedUserData(false);
                    setLoadAttempts(0);
                  }
                }}
                onFileUpload={handleFileUpload}
              />}
            </div>
          </main>

          {/* Footer */}
          <footer className="border-t bg-card flex-shrink-0">
            <div className="max-w-7xl mx-auto px-4 py-6 space-y-3">
              <p className="text-xs text-muted-foreground text-center leading-relaxed" data-testid="text-disclaimer">
                Options involve a high degree of risk and are not suitable for all investors. Options4L.com is not an investment advisor. The calculations, information, and opinions on this site are for educational purposes only and are not investment advice. Calculations are estimates and do not account for all market conditions and events.
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <a 
                  href="https://www.options4l.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-foreground hover:underline"
                  data-testid="link-main-site"
                >
                  Main Site
                </a>
                <span>·</span>
                <a href="/privacy" className="hover:text-foreground hover:underline" data-testid="link-privacy">
                  Privacy Policy
                </a>
                <span>·</span>
                <a href="/terms" className="hover:text-foreground hover:underline" data-testid="link-terms">
                  Terms of Service
                </a>
                <span>·</span>
                <a 
                  href="https://github.com/njwill/Options4L" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-foreground hover:underline"
                >
                  GitHub
                </a>
              </div>
            </div>
          </footer>
        </div>
        <LoginModal open={showLoginModal} onOpenChange={setShowLoginModal} />
        <SignupPromptModal 
          open={showSignupPrompt} 
          onOpenChange={setShowSignupPrompt}
          onSignUp={() => setShowLoginModal(true)}
        />
        <ImportSessionDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          transactions={rawTransactions}
          onImportComplete={handleImportComplete}
        />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

// Component to handle email verification route
function EmailVerifyRoute() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const token = params.get('token') || '';
  const isLinking = params.get('link') === 'true';
  
  return (
    <EmailVerify 
      token={token}
      isLinking={isLinking}
      onComplete={() => setLocation('/')} 
    />
  );
}

function App() {
  return (
    <AuthProvider>
      <LivePriceCacheProvider>
        <Switch>
          <Route path="/auth/verify" component={EmailVerifyRoute} />
          <Route path="/privacy" component={PrivacyPolicy} />
          <Route path="/terms" component={TermsOfService} />
          <Route path="/" component={AppContent} />
          <Route component={AppContent} />
        </Switch>
      </LivePriceCacheProvider>
    </AuthProvider>
  );
}

export default App;
