import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartAnalysisDisplay } from '@/components/ChartAnalysisDisplay';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { ChartAnalysisResult, ChartTimeframe } from '@shared/schema';
import { 
  Upload, 
  BarChart3, 
  Loader2, 
  ImageIcon, 
  Sparkles,
  X,
  RefreshCw,
  Lock
} from 'lucide-react';

interface ChartData {
  image: string;
  symbol?: string;
  metadata?: {
    symbol: string;
    timeframe: string;
    startDate: string;
    endDate: string;
  };
}

export default function ChartAnalyzer() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'upload' | 'generate'>('upload');
  
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [analysis, setAnalysis] = useState<ChartAnalysisResult | null>(null);
  
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('3M');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setChartData({ image: base64 });
        setAnalysis(null);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
    },
    maxFiles: 1,
    disabled: !user,
  });

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!user) return;
    
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            setChartData({ image: base64 });
            setAnalysis(null);
          };
          reader.readAsDataURL(file);
        }
        break;
      }
    }
  }, [user]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const generateChart = async () => {
    if (!symbol.trim()) {
      toast({
        title: 'Symbol required',
        description: 'Please enter a stock ticker symbol.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await apiRequest('POST', '/api/chart/generate', {
        symbol: symbol.trim().toUpperCase(),
        timeframe,
      });
      const data = await response.json();

      if (data.success) {
        setChartData({
          image: `data:image/png;base64,${data.image}`,
          symbol: data.metadata.symbol,
          metadata: data.metadata,
        });
        setAnalysis(null);
        toast({
          title: 'Chart generated',
          description: `Generated ${data.metadata.timeframe} chart for ${data.metadata.symbol}`,
        });
      } else {
        throw new Error(data.message || 'Failed to generate chart');
      }
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Failed to generate chart',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const response = await apiRequest('GET', `/api/chart/job/${jobId}`);
      const data = await response.json();

      if (data.status === 'completed' && data.analysis) {
        setAnalysis(data.analysis);
        setAnalysisJobId(null);
        setIsAnalyzing(false);
        toast({
          title: 'Analysis complete',
          description: 'Chart analysis has been completed.',
        });
      } else if (data.status === 'failed') {
        setAnalysisJobId(null);
        setIsAnalyzing(false);
        toast({
          title: 'Analysis failed',
          description: data.error || 'Chart analysis failed',
          variant: 'destructive',
        });
      } else {
        setTimeout(() => pollJobStatus(jobId), 3000);
      }
    } catch (error) {
      setAnalysisJobId(null);
      setIsAnalyzing(false);
      toast({
        title: 'Error',
        description: 'Failed to check analysis status',
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    if (analysisJobId) {
      pollJobStatus(analysisJobId);
    }
  }, [analysisJobId, pollJobStatus]);

  const analyzeChart = async () => {
    if (!chartData?.image) {
      toast({
        title: 'No chart',
        description: 'Please upload or generate a chart first.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const response = await apiRequest('POST', '/api/chart/analyze', {
        image: chartData.image,
        symbol: chartData.symbol || chartData.metadata?.symbol,
      });
      const data = await response.json();

      if (data.success && data.jobId) {
        setAnalysisJobId(data.jobId);
        toast({
          title: 'Analysis started',
          description: 'Analyzing chart with AI. This may take 30-60 seconds...',
        });
      } else {
        throw new Error(data.message || 'Failed to start analysis');
      }
    } catch (error) {
      setIsAnalyzing(false);
      toast({
        title: 'Analysis failed',
        description: error instanceof Error ? error.message : 'Failed to analyze chart',
        variant: 'destructive',
      });
    }
  };

  const clearChart = () => {
    setChartData(null);
    setAnalysis(null);
    setAnalysisJobId(null);
    setIsAnalyzing(false);
  };

  if (!user) {
    return (
      <Card className="max-w-lg mx-auto mt-8">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Lock className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Sign In Required</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              Chart Analyzer uses Claude AI to analyze stock charts and identify patterns, support/resistance levels, and generate trading scenarios.
            </p>
            <p className="text-sm text-muted-foreground">
              Click the <span className="font-medium text-primary">Sign In</span> button in the header to access this feature.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Chart Analyzer</h2>
        <p className="text-muted-foreground">
          Upload a chart image or generate one from a ticker symbol, then get AI-powered technical analysis.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'upload' | 'generate')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="upload" data-testid="tab-upload">
            <Upload className="h-4 w-4 mr-2" />
            Upload Chart
          </TabsTrigger>
          <TabsTrigger value="generate" data-testid="tab-generate">
            <BarChart3 className="h-4 w-4 mr-2" />
            Generate Chart
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upload Chart Image</CardTitle>
              <CardDescription>
                Drag and drop an image, paste from clipboard, or click to browse
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
                `}
                data-testid="dropzone"
              >
                <input {...getInputProps()} data-testid="input-file" />
                <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                {isDragActive ? (
                  <p className="text-primary">Drop the chart here...</p>
                ) : (
                  <>
                    <p className="text-muted-foreground mb-1">
                      Drag & drop a chart image here
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG, or WebP • Or paste from clipboard (Ctrl+V)
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="generate" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Generate Chart</CardTitle>
              <CardDescription>
                Enter a ticker symbol to generate a chart with technical indicators
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label htmlFor="symbol">Ticker Symbol</Label>
                  <Input
                    id="symbol"
                    placeholder="AAPL, TSLA, SPY..."
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    data-testid="input-symbol"
                  />
                </div>
                <div className="w-full sm:w-40">
                  <Label>Timeframe</Label>
                  <Select value={timeframe} onValueChange={(v) => setTimeframe(v as ChartTimeframe)}>
                    <SelectTrigger data-testid="select-timeframe">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1D">1 Day</SelectItem>
                      <SelectItem value="5D">5 Days</SelectItem>
                      <SelectItem value="1M">1 Month</SelectItem>
                      <SelectItem value="3M">3 Months</SelectItem>
                      <SelectItem value="6M">6 Months</SelectItem>
                      <SelectItem value="1Y">1 Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button 
                onClick={generateChart} 
                disabled={isGenerating || !symbol.trim()}
                className="w-full sm:w-auto"
                data-testid="button-generate-chart"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Generate Chart
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {chartData && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-lg">
                {chartData.metadata?.symbol || 'Uploaded Chart'}
              </CardTitle>
              {chartData.metadata && (
                <CardDescription>
                  {chartData.metadata.timeframe} • {chartData.metadata.startDate} to {chartData.metadata.endDate}
                </CardDescription>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearChart}
                data-testid="button-clear-chart"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
              <Button
                onClick={analyzeChart}
                disabled={isAnalyzing}
                data-testid="button-analyze-chart"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analyze with AI
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg overflow-hidden border bg-black/5">
              <img 
                src={chartData.image} 
                alt="Stock chart" 
                className="w-full h-auto"
                data-testid="chart-image"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {isAnalyzing && !analysis && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <h3 className="font-semibold mb-2">Analyzing Chart</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Claude Sonnet 4.5 is analyzing the chart for patterns, indicators, support/resistance levels, and generating trading scenarios. This typically takes 30-60 seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {analysis && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Analysis Results</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={analyzeChart}
              disabled={isAnalyzing}
              data-testid="button-reanalyze"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Re-analyze
            </Button>
          </div>
          <ChartAnalysisDisplay analysis={analysis} />
        </div>
      )}
    </div>
  );
}
