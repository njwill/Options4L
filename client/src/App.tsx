import { useState } from 'react';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import Dashboard from '@/pages/Dashboard';
import OpenPositions from '@/pages/OpenPositions';
import ClosedPositions from '@/pages/ClosedPositions';
import TransactionHistory from '@/pages/TransactionHistory';
import type { Position, Transaction, SummaryStats, RollChain } from '@shared/schema';

type TabType = 'dashboard' | 'open' | 'closed' | 'transactions';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [positions, setPositions] = useState<Position[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rollChains, setRollChains] = useState<RollChain[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState<SummaryStats>({
    totalPL: 0,
    openPositionsCount: 0,
    closedPositionsCount: 0,
    totalPremiumCollected: 0,
    winRate: 0,
    totalWins: 0,
    totalLosses: 0,
  });

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setPositions(data.positions);
      setTransactions(data.transactions);
      setRollChains(data.rollChains || []);
      setSummary(data.summary);
      setActiveTab('dashboard');
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  const tabs = [
    { id: 'dashboard' as TabType, label: 'Dashboard', count: null },
    { id: 'open' as TabType, label: 'Open Positions', count: summary.openPositionsCount },
    { id: 'closed' as TabType, label: 'Closed Positions', count: summary.closedPositionsCount },
    { id: 'transactions' as TabType, label: 'Transaction History', count: transactions.length },
  ];

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          {/* Header */}
          <header className="border-b bg-card">
            <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold">Robinhood Options Analysis</h1>
                <p className="text-xs text-muted-foreground">Track strategies, rolls, and P/L</p>
              </div>
              <div className="flex items-center gap-2">
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
          <main className="max-w-7xl mx-auto px-4 py-8">
            {activeTab === 'dashboard' && (
              <Dashboard
                positions={positions}
                transactions={transactions}
                onFileUpload={handleFileUpload}
                isProcessing={isProcessing}
                summary={summary}
              />
            )}
            {activeTab === 'open' && <OpenPositions positions={positions} rollChains={rollChains} />}
            {activeTab === 'closed' && <ClosedPositions positions={positions} rollChains={rollChains} />}
            {activeTab === 'transactions' && <TransactionHistory transactions={transactions} />}
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
