import { useState, useEffect } from 'react';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Upload, ExternalLink, Key } from 'lucide-react';
import Dashboard from '@/pages/Dashboard';
import OpenPositions from '@/pages/OpenPositions';
import ClosedPositions from '@/pages/ClosedPositions';
import TransactionHistory from '@/pages/TransactionHistory';
import AccountSettings from '@/pages/AccountSettings';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { LoginModal } from '@/components/LoginModal';
import { UserMenu } from '@/components/UserMenu';
import { ImportSessionDialog } from '@/components/ImportSessionDialog';
import { useToast } from '@/hooks/use-toast';
import type { Position, Transaction, SummaryStats, RollChain } from '@shared/schema';

type TabType = 'dashboard' | 'open' | 'closed' | 'transactions' | 'account';

function AppContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [positions, setPositions] = useState<Position[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rawTransactions, setRawTransactions] = useState<Transaction[]>([]); // Original parsed transactions for import
  const [rollChains, setRollChains] = useState<RollChain[]>([]);
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
      
      if (data.hasData) {
        setPositions(data.positions);
        setTransactions(data.transactions);
        setRollChains(data.rollChains || []);
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
    
    // Reset when user logs out - always reset counters regardless of load state
    if (!user) {
      if (hasLoadedUserData) {
        setHasLoadedUserData(false);
      }
      if (loadAttempts > 0) {
        setLoadAttempts(0);
      }
    }
  }, [user, rawTransactions.length, hadAnonymousDataBeforeLogin, hasLoadedUserData, isLoadingUserData, loadAttempts]);

  const handleFileUpload = async (file: File) => {
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
      setPositions(data.positions);
      setTransactions(data.transactions);
      setRawTransactions(data.rawTransactions || data.transactions); // Store raw parsed transactions
      setRollChains(data.rollChains || []);
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
    summary: SummaryStats;
    message: string;
  }) => {
    setTransactions(data.transactions);
    setPositions(data.positions);
    setRollChains(data.rollChains);
    setSummary(data.summary);
    setRawTransactions([]); // Clear raw transactions after import
    setActiveTab('dashboard');

    toast({
      title: 'Session Data Imported',
      description: data.message,
    });
  };

  const tabs = [
    { id: 'dashboard' as TabType, label: 'Dashboard', count: null },
    { id: 'open' as TabType, label: 'Open Positions', count: summary.openPositionsCount },
    { id: 'closed' as TabType, label: 'Closed Positions', count: summary.closedPositionsCount },
    { id: 'transactions' as TabType, label: 'Transaction History', count: transactions.length },
    ...(user ? [{ id: 'account' as TabType, label: 'Account', count: null }] : []),
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
                <Button variant="ghost" asChild data-testid="link-main-site">
                  <a href="https://www.options4l.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                    Main Site
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                {positions.length > 0 && (
                  <label htmlFor="file-upload-header">
                    <Button variant="outline" asChild data-testid="button-upload-new">
                      <span className="cursor-pointer">
                        <Upload className="w-4 h-4 mr-2" />
                        Upload New File
                      </span>
                    </Button>
                    <input
                      id="file-upload-header"
                      type="file"
                      className="hidden"
                      accept=".csv,.xlsx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      data-testid="input-file-header"
                    />
                  </label>
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
                  onFileUpload={handleFileUpload}
                  isProcessing={isProcessing}
                  summary={summary}
                />
              )}
              {activeTab === 'open' && <OpenPositions positions={positions} rollChains={rollChains} />}
              {activeTab === 'closed' && <ClosedPositions positions={positions} rollChains={rollChains} />}
              {activeTab === 'transactions' && <TransactionHistory transactions={transactions} />}
              {activeTab === 'account' && <AccountSettings />}
            </div>
          </main>

          {/* Footer */}
          <footer className="border-t bg-card flex-shrink-0">
            <div className="max-w-7xl mx-auto px-4 py-6 space-y-3">
              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                <span className="font-medium text-foreground">Options4L is proudly open source.</span> View the code, contribute, or fork the project on{' '}
                <a 
                  href="https://github.com/njwill/Options4L" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                  data-testid="link-github"
                >
                  GitHub
                </a>.
              </p>
              <p className="text-xs text-muted-foreground text-center leading-relaxed" data-testid="text-disclaimer">
                Options involve a high degree of risk and are not suitable for all investors. Options4L.com is not an investment advisor. The calculations, information, and opinions on this site are for educational purposes only and are not investment advice. Calculations are estimates and do not account for all market conditions and events.
              </p>
            </div>
          </footer>
        </div>
        <LoginModal open={showLoginModal} onOpenChange={setShowLoginModal} />
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

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
