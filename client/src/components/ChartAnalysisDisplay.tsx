import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Activity, 
  Target, 
  AlertTriangle,
  BarChart3,
  Layers,
  ArrowUpCircle,
  ArrowDownCircle,
  Lightbulb,
  Percent
} from 'lucide-react';
import type { ChartAnalysisResult, Scenario } from '@shared/schema';

interface ChartAnalysisDisplayProps {
  analysis: ChartAnalysisResult;
}

function getBiasIcon(bias: 'bullish' | 'bearish' | 'neutral') {
  switch (bias) {
    case 'bullish':
      return <TrendingUp className="h-5 w-5" />;
    case 'bearish':
      return <TrendingDown className="h-5 w-5" />;
    default:
      return <Minus className="h-5 w-5" />;
  }
}

function getBiasColor(bias: 'bullish' | 'bearish' | 'neutral') {
  switch (bias) {
    case 'bullish':
      return 'bg-green-500/20 text-green-500 border-green-500/30';
    case 'bearish':
      return 'bg-red-500/20 text-red-500 border-red-500/30';
    default:
      return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
  }
}

function getStrengthBadge(strength: 'strong' | 'moderate' | 'weak') {
  const colors = {
    strong: 'bg-emerald-500/20 text-emerald-500',
    moderate: 'bg-blue-500/20 text-blue-500',
    weak: 'bg-gray-500/20 text-gray-400',
  };
  return colors[strength];
}

function ScenarioCard({ scenario, index }: { scenario: Scenario; index: number }) {
  return (
    <div 
      className="p-4 rounded-lg border bg-card/50" 
      data-testid={`scenario-card-${index}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h4 className="font-semibold text-sm">{scenario.name}</h4>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
          <Percent className="h-3 w-3 mr-1" />
          {scenario.probability}
        </Badge>
      </div>
      
      <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
        <div>
          <span className="text-muted-foreground block mb-1">Entry</span>
          <span className="font-medium text-green-500">{scenario.entry}</span>
        </div>
        <div>
          <span className="text-muted-foreground block mb-1">Target</span>
          <span className="font-medium text-blue-500">{scenario.target}</span>
        </div>
        <div>
          <span className="text-muted-foreground block mb-1">Stop Loss</span>
          <span className="font-medium text-red-500">{scenario.stopLoss}</span>
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground">{scenario.rationale}</p>
    </div>
  );
}

export function ChartAnalysisDisplay({ analysis }: ChartAnalysisDisplayProps) {
  return (
    <div className="space-y-4" data-testid="chart-analysis-display">
      <Card className={`border-2 ${getBiasColor(analysis.overallBias)}`}>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3 mb-3">
            {getBiasIcon(analysis.overallBias)}
            <div>
              <h3 className="font-bold text-lg capitalize">{analysis.overallBias} Bias</h3>
              <Badge className={getStrengthBadge(analysis.biasStrength)}>
                {analysis.biasStrength}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{analysis.summary}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Technical Indicators
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-xs text-muted-foreground">Trend</span>
              <p className="text-sm">{analysis.indicators.trend}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Momentum</span>
              <p className="text-sm">{analysis.indicators.momentum}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Volatility</span>
              <p className="text-sm">{analysis.indicators.volatility}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Volume</span>
              <p className="text-sm">{analysis.indicators.volume}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Key Levels
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                <ArrowUpCircle className="h-3 w-3 text-red-500" />
                Resistance
              </span>
              <div className="flex flex-wrap gap-1">
                {analysis.resistanceLevels.length > 0 ? (
                  analysis.resistanceLevels.map((level, i) => (
                    <Badge key={i} variant="outline" className="text-red-500 border-red-500/30">
                      {level}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">None identified</span>
                )}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                <ArrowDownCircle className="h-3 w-3 text-green-500" />
                Support
              </span>
              <div className="flex flex-wrap gap-1">
                {analysis.supportLevels.length > 0 ? (
                  analysis.supportLevels.map((level, i) => (
                    <Badge key={i} variant="outline" className="text-green-500 border-green-500/30">
                      {level}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">None identified</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {analysis.patterns.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Chart Patterns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {analysis.patterns.map((pattern, i) => (
                <Badge key={i} variant="secondary">
                  {pattern}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {analysis.divergences.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Divergences
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {analysis.divergences.map((divergence, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-yellow-500 mt-1">•</span>
                  {divergence}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Trading Scenarios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {analysis.scenarios.map((scenario, i) => (
              <ScenarioCard key={i} scenario={scenario} index={i} />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              Key Observations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.keyObservations.map((obs, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  {obs}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Risk Factors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.riskFactors.map((risk, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-red-500 mt-1">•</span>
                  {risk}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
