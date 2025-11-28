import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { 
  GreeksResult, 
  formatDelta, 
  formatGamma, 
  formatTheta, 
  formatVega,
  formatPercent 
} from '@/lib/blackScholes';
import { TrendingUp, TrendingDown, Clock, Activity, Zap } from 'lucide-react';

interface GreeksTooltipProps {
  greeks: GreeksResult;
  children: React.ReactNode;
  showTheoreticalComparison?: boolean;
}

export function GreeksTooltip({ 
  greeks, 
  children, 
  showTheoreticalComparison = true 
}: GreeksTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent 
        side="top" 
        className="w-64 p-3"
        data-testid="tooltip-greeks"
      >
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Activity className="w-3 h-3" />
            Black-Scholes Greeks
          </div>
          
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Delta (Δ)</span>
              <span className="font-mono tabular-nums">{formatDelta(greeks.delta)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Gamma (Γ)</span>
              <span className="font-mono tabular-nums">{formatGamma(greeks.gamma)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Theta (Θ)</span>
              <span className={`font-mono tabular-nums ${greeks.theta < 0 ? 'text-red-500' : 'text-green-500'}`}>
                {formatTheta(greeks.theta)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Vega (ν)</span>
              <span className="font-mono tabular-nums">{formatVega(greeks.vega)}</span>
            </div>
          </div>

          <div className="border-t pt-2 mt-2 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Days to Exp
              </span>
              <span className="font-mono tabular-nums">{Math.round(greeks.daysToExpiration)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Zap className="w-3 h-3" />
                IV
                {greeks.ivSource === 'calculated' && (
                  <span className="text-[9px] text-green-500">(calc)</span>
                )}
              </span>
              <span className="font-mono tabular-nums">{(greeks.impliedVolatility * 100).toFixed(1)}%</span>
            </div>
          </div>

          {showTheoreticalComparison && (
            <div className="border-t pt-2 mt-2 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Market Price</span>
                <span className="font-mono tabular-nums">${greeks.marketPrice.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Theoretical</span>
                <span className="font-mono tabular-nums">${greeks.theoreticalPrice.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Difference</span>
                <span className={`font-mono tabular-nums flex items-center gap-1 ${
                  greeks.priceDiff > 0 ? 'text-amber-500' : greeks.priceDiff < 0 ? 'text-green-500' : ''
                }`}>
                  {greeks.priceDiff > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : greeks.priceDiff < 0 ? (
                    <TrendingDown className="w-3 h-3" />
                  ) : null}
                  {formatPercent(greeks.priceDiffPercent)}
                </span>
              </div>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface PositionGreeksTooltipProps {
  totalDelta: number;
  totalGamma: number;
  totalTheta: number;
  totalVega: number;
  children: React.ReactNode;
}

export function PositionGreeksTooltip({
  totalDelta,
  totalGamma,
  totalTheta,
  totalVega,
  children,
}: PositionGreeksTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent 
        side="top" 
        className="w-56 p-3"
        data-testid="tooltip-position-greeks"
      >
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Activity className="w-3 h-3" />
            Position Greeks
          </div>
          
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Delta ($)</span>
              <span className={`font-mono tabular-nums ${totalDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {totalDelta >= 0 ? '+' : ''}{totalDelta.toFixed(0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Gamma</span>
              <span className="font-mono tabular-nums">
                {totalGamma >= 0 ? '+' : ''}{totalGamma.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Theta ($/day)</span>
              <span className={`font-mono tabular-nums ${totalTheta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {totalTheta >= 0 ? '+' : ''}${totalTheta.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Vega ($/%IV)</span>
              <span className="font-mono tabular-nums">
                {totalVega >= 0 ? '+' : ''}${totalVega.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="border-t pt-2 mt-2 text-[10px] text-muted-foreground">
            <p>Delta/Theta/Vega in dollars. Gamma = delta change per $1.</p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface LegGreeksTooltipProps {
  greeks: GreeksResult;
  legDescription: string;
  quantity: number;
  isShort: boolean;
  children: React.ReactNode;
}

export function LegGreeksTooltip({
  greeks,
  legDescription,
  quantity,
  isShort,
  children,
}: LegGreeksTooltipProps) {
  const multiplier = quantity * 100;
  const sign = isShort ? -1 : 1;

  const dollarDelta = greeks.delta * multiplier * sign;
  const dollarTheta = greeks.theta * multiplier * sign;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent 
        side="top" 
        className="w-72 p-3"
        data-testid="tooltip-leg-greeks"
      >
        <div className="space-y-2">
          <div className="text-xs font-medium mb-2">
            {legDescription}
          </div>
          
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <div className="text-muted-foreground text-[10px] mb-0.5">Per Contract</div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Δ</span>
                  <span className="font-mono">{formatDelta(greeks.delta)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Γ</span>
                  <span className="font-mono">{formatGamma(greeks.gamma)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Θ</span>
                  <span className={`font-mono ${greeks.theta < 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {formatTheta(greeks.theta)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ν</span>
                  <span className="font-mono">{formatVega(greeks.vega)}</span>
                </div>
              </div>
            </div>
            
            <div>
              <div className="text-muted-foreground text-[10px] mb-0.5">
                Position ({isShort ? 'Short' : 'Long'} {quantity})
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">$Δ</span>
                  <span className={`font-mono ${dollarDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {dollarDelta >= 0 ? '+' : ''}{dollarDelta.toFixed(0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">$Θ/day</span>
                  <span className={`font-mono ${dollarTheta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {dollarTheta >= 0 ? '+' : ''}${dollarTheta.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-2 mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-0.5">
                IV
                {greeks.ivSource === 'calculated' && (
                  <span className="text-[8px] text-green-500">(calc)</span>
                )}
              </span>
              <span className="font-mono">{(greeks.impliedVolatility * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">DTE</span>
              <span className="font-mono">{Math.round(greeks.daysToExpiration)}</span>
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
