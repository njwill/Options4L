import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePriceCache, calculateLivePositionPL } from '@/hooks/use-price-cache';
import { calculateGreeks, calculatePositionGreeks, type GreeksResult } from '@/lib/blackScholes';
import { useAuth } from '@/hooks/use-auth';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { Position, StockHolding } from '@shared/schema';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  Sparkles, 
  RefreshCw, 
  AlertCircle, 
  Clock,
  Zap,
  Brain,
  TrendingUp,
  BarChart3,
  Loader2,
  History
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface AIPortfolioReportProps {
  positions: Position[];
  summary: {
    totalPL: number;
    realizedPL: number;
    openPositionsCount: number;
    closedPositionsCount: number;
    winRate: number;
    totalWins: number;
    totalLosses: number;
  };
  stockHoldings?: StockHolding[];
}

interface JobSubmitResponse {
  success: boolean;
  jobId?: string;
  status?: string;
  message?: string;
}

interface JobStatusResponse {
  success: boolean;
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  analysis?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

interface CachedAnalysisResponse {
  success: boolean;
  hasCachedAnalysis: boolean;
  analysis: string | null;
  generatedAt: string | null;
}

type PollingState = 'idle' | 'polling' | 'completed' | 'failed';

export function AIPortfolioReport({ positions, summary, stockHoldings = [] }: AIPortfolioReportProps) {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const { getPositionPrices, hasCachedPrices, lastRefreshTime, cacheVersion } = usePriceCache();
  
  const [report, setReport] = useState<string | null>(null);
  const [reportMeta, setReportMeta] = useState<{ openPositionsAnalyzed: number; closedPositionsAnalyzed: number; generatedAt: string } | null>(null);
  
  // Polling state
  const [pollingState, setPollingState] = useState<PollingState>('idle');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const openPositions = useMemo(() => positions.filter(p => p.status === 'open'), [positions]);
  const closedPositions = useMemo(() => positions.filter(p => p.status === 'closed'), [positions]);

  const hasLiveData = hasCachedPrices();
  
  // Load cached analysis on mount
  const { data: cachedData, isLoading: isLoadingCached } = useQuery<CachedAnalysisResponse>({
    queryKey: ['/api/ai/cached-analysis'],
    enabled: isAuthenticated,
    staleTime: Infinity, // Don't refetch automatically - only refresh when user regenerates
    refetchOnWindowFocus: false,
  });
  
  // Initialize report from cache when data loads
  useEffect(() => {
    if (cachedData?.hasCachedAnalysis && cachedData.analysis && !report) {
      setReport(cachedData.analysis);
      setReportMeta({
        openPositionsAnalyzed: openPositions.length,
        closedPositionsAnalyzed: Math.min(closedPositions.length, 10),
        generatedAt: cachedData.generatedAt || new Date().toISOString(),
      });
    }
  }, [cachedData, report, openPositions.length, closedPositions.length]);
  
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);
  
  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);
  
  // Poll for job status
  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/ai/job/${jobId}`, {
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Failed to check job status');
      }
      
      const data: JobStatusResponse = await res.json();
      
      if (data.status === 'completed' && data.analysis) {
        stopPolling();
        setReport(data.analysis);
        setReportMeta({
          openPositionsAnalyzed: openPositions.length,
          closedPositionsAnalyzed: Math.min(closedPositions.length, 10),
          generatedAt: data.completedAt || new Date().toISOString(),
        });
        setPollingState('completed');
        setCurrentJobId(null);
      } else if (data.status === 'failed') {
        stopPolling();
        setPollingError(data.error || 'Analysis failed');
        setPollingState('failed');
        setCurrentJobId(null);
      }
      // If queued or running, continue polling
    } catch (error) {
      console.error('Poll error:', error);
      // Don't stop polling on transient errors, but log them
    }
  }, [stopPolling, openPositions.length, closedPositions.length]);
  
  // Start polling for a job
  const startPolling = useCallback((jobId: string) => {
    setCurrentJobId(jobId);
    setPollingState('polling');
    setPollingError(null);
    setElapsedTime(0);
    startTimeRef.current = Date.now();
    
    // Update elapsed time every second
    timerIntervalRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    
    // Poll every 3 seconds
    pollingIntervalRef.current = setInterval(() => {
      pollJobStatus(jobId);
    }, 3000);
    
    // Also poll immediately
    pollJobStatus(jobId);
  }, [pollJobStatus]);

  const buildLiveDataMap = () => {
    const liveDataMap: Record<string, any> = {};
    
    for (const pos of openPositions) {
      const cachedPrices = getPositionPrices(pos.id);
      if (!cachedPrices) continue;
      
      const livePL = calculateLivePositionPL(pos as any, cachedPrices as any);
      
      const legs: any[] = [];
      let underlyingPrice = 0;
      
      if (pos.legs && Array.isArray(pos.legs)) {
        pos.legs.forEach((leg: any, i: number) => {
          const legId = `${pos.id}-leg-${i}`;
          const data = cachedPrices?.[legId];
          
          if (data && !data.error) {
            underlyingPrice = data.underlyingPrice || underlyingPrice;
            const mark = data.mark || (((data.bid || 0) + (data.ask || 0)) / 2);
            
            let greeks: GreeksResult | null = null;
            if (data.underlyingPrice && leg.expiration) {
              greeks = calculateGreeks({
                underlyingPrice: data.underlyingPrice,
                strikePrice: leg.strike,
                expirationDate: leg.expiration,
                optionType: (leg.optionType?.toLowerCase() || 'call') as 'call' | 'put',
                impliedVolatility: data.impliedVolatility,
                marketPrice: mark,
              });
            }
            
            legs.push({
              strike: leg.strike,
              expiration: leg.expiration,
              optionType: leg.optionType || 'call',
              bid: data.bid,
              ask: data.ask,
              mark,
              impliedVolatility: data.impliedVolatility,
              quantity: leg.quantity || 1,
              transCode: leg.transCode || 'BTO',
              greeks: greeks ? {
                delta: greeks.delta,
                gamma: greeks.gamma,
                theta: greeks.theta,
                vega: greeks.vega,
              } : undefined,
            });
          }
        });
      }
      
      const legsWithGreeks = legs.filter(l => l.greeks).map(l => {
        const absQuantity = Math.abs(l.quantity);
        const signedQuantity = l.transCode?.startsWith('S') ? -absQuantity : absQuantity;
        return {
          greeks: l.greeks!,
          quantity: signedQuantity,
          transCode: l.transCode,
        };
      });
      
      let positionGreeks = null;
      const totalLegsCount = pos.legs?.length || 0;
      const hasCompleteGreeksData = legsWithGreeks.length === totalLegsCount && totalLegsCount > 0;
      
      if (hasCompleteGreeksData) {
        positionGreeks = calculatePositionGreeks(legsWithGreeks as any);
      }
      
      liveDataMap[pos.id] = {
        underlyingPrice,
        livePL,
        legs,
        positionGreeks,
      };
    }
    
    return liveDataMap;
  };

  const submitJobMutation = useMutation({
    mutationFn: async () => {
      const liveDataMap = buildLiveDataMap();
      
      const trimmedPositions = positions.map(pos => ({
        id: pos.id,
        symbol: pos.symbol,
        strategyType: pos.strategyType,
        status: pos.status,
        entryDate: pos.entryDate,
        exitDate: pos.exitDate,
        totalCredit: pos.totalCredit,
        totalDebit: pos.totalDebit,
        netPL: pos.netPL,
        realizedPL: pos.realizedPL,
        rollChainId: pos.rollChainId,
        legs: pos.legs?.map((leg: any) => ({
          strike: leg.strike,
          expiration: leg.expiration,
          optionType: leg.optionType,
          quantity: leg.quantity,
          transCode: leg.transCode,
          premium: leg.premium,
        })),
      }));
      
      const res = await apiRequest('POST', '/api/ai/analyze-portfolio', {
        positions: trimmedPositions,
        summary,
        stockHoldings,
        liveDataMap,
      });
      
      return res.json() as Promise<JobSubmitResponse>;
    },
    onSuccess: (data) => {
      if (data.success && data.jobId) {
        // Start polling for job completion
        startPolling(data.jobId);
      } else {
        setPollingError(data.message || 'Failed to submit analysis job');
        setPollingState('failed');
      }
    },
    onError: (error) => {
      setPollingError(error instanceof Error ? error.message : 'Failed to submit analysis job');
      setPollingState('failed');
    },
  });
  
  const isProcessing = submitJobMutation.isPending || pollingState === 'polling';

  const handleGenerateReport = () => {
    // Reset state and submit new job
    setPollingState('idle');
    setPollingError(null);
    submitJobMutation.mutate();
  };

  if (!isAuthenticated) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Sign In Required</h3>
            <p className="text-muted-foreground">
              AI Portfolio Analysis is available for signed-in users. Sign in to get personalized insights about your portfolio.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (positions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Position Data</h3>
            <p className="text-muted-foreground">
              Upload your trading data to generate an AI portfolio analysis report.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Portfolio Analysis
              </CardTitle>
              <CardDescription className="mt-1">
                Get AI-powered insights about your portfolio, including risk analysis, Greeks exposure, and actionable recommendations.
              </CardDescription>
            </div>
            
            <div className="flex items-center gap-3 flex-wrap">
              {hasLiveData && lastRefreshTime && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Zap className="w-3 h-3 text-yellow-500" />
                  <span>Live data from {format(lastRefreshTime, 'h:mm a')}</span>
                </div>
              )}
              
              <Button 
                onClick={handleGenerateReport}
                disabled={isProcessing}
                data-testid="button-generate-ai-report"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {pollingState === 'polling' 
                      ? `Analyzing... (${elapsedTime}s)` 
                      : 'Submitting...'}
                  </>
                ) : report ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Regenerate Report
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Report
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1">Open Positions</div>
              <div className="text-lg font-semibold tabular-nums" data-testid="text-ai-open-positions">
                {openPositions.length}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1">Closed Positions</div>
              <div className="text-lg font-semibold tabular-nums" data-testid="text-ai-closed-positions">
                {closedPositions.length}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
              <div className="text-lg font-semibold tabular-nums" data-testid="text-ai-win-rate">
                {summary.winRate.toFixed(1)}%
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                Live Data
                {hasLiveData && <Zap className="w-3 h-3 text-yellow-500" />}
              </div>
              <div className="text-lg font-semibold" data-testid="text-ai-live-data-status">
                {hasLiveData ? (
                  <Badge variant="default" className="bg-green-600 hover:bg-green-700">Available</Badge>
                ) : (
                  <Badge variant="secondary">Not Loaded</Badge>
                )}
              </div>
            </div>
          </div>
          
          {!hasLiveData && openPositions.length > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-6">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-sm">Live pricing data not loaded</div>
                <p className="text-sm text-muted-foreground">
                  For the most accurate analysis, refresh live prices on your open positions before generating the report. 
                  The AI will still analyze your portfolio using available data.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {(pollingState === 'failed' || submitJobMutation.isError) && (
        <Card className="border-destructive">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-destructive">Failed to Generate Analysis</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {pollingError || 
                    (submitJobMutation.error instanceof Error 
                      ? submitJobMutation.error.message 
                      : 'An unexpected error occurred. Please try again.')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {pollingState === 'polling' && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center text-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <h3 className="text-lg font-medium mb-2">Analyzing Your Portfolio</h3>
              <p className="text-muted-foreground text-sm max-w-md">
                Claude is analyzing your {openPositions.length} open positions with live pricing data, 
                Greeks exposure, and historical performance. This typically takes 30-90 seconds.
              </p>
              <div className="mt-4 text-sm text-muted-foreground tabular-nums">
                Elapsed: {elapsedTime}s
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card data-testid="card-ai-report">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Portfolio Analysis Report
              </CardTitle>
              
              {reportMeta && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 cursor-help">
                        <History className="w-3 h-3" />
                        {formatDistanceToNow(new Date(reportMeta.generatedAt), { addSuffix: true })}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Generated {format(new Date(reportMeta.generatedAt), 'MMM d, yyyy h:mm a')}</p>
                    </TooltipContent>
                  </Tooltip>
                  <span>
                    {reportMeta.openPositionsAnalyzed} open, {reportMeta.closedPositionsAnalyzed} closed analyzed
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="text-ai-report-content">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-xl font-bold mt-6 mb-3 first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-semibold mt-5 mb-2 text-foreground">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-medium mt-4 mb-2 text-foreground">{children}</h3>,
                  p: ({ children }) => <p className="mb-3 text-foreground/90 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="text-foreground/90">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                  code: ({ children }) => (
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">{children}</code>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground my-4">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {report}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
