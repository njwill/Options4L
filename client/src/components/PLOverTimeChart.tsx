import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Position } from '@shared/schema';
import { format } from 'date-fns';

interface PLOverTimeChartProps {
  positions: Position[];
}

export function PLOverTimeChart({ positions }: PLOverTimeChartProps) {
  const chartData = useMemo(() => {
    const closedPositions = positions
      .filter((p) => p.status === 'closed' && p.exitDate)
      .sort((a, b) => new Date(a.exitDate!).getTime() - new Date(b.exitDate!).getTime());

    // Calculate total unrealized P/L from open positions
    const openPositions = positions.filter((p) => p.status === 'open');
    const unrealizedPL = openPositions.reduce((sum, p) => sum + p.netPL, 0);

    let cumulativeRealizedPL = 0;
    const dataPoints = closedPositions.map((position) => {
      const pl = position.realizedPL ?? position.netPL;
      cumulativeRealizedPL += pl;
      
      return {
        date: position.exitDate!,
        realizedPL: Number(cumulativeRealizedPL.toFixed(2)),
        totalPL: Number((cumulativeRealizedPL + unrealizedPL).toFixed(2)),
        positionPL: Number(pl.toFixed(2)),
        unrealizedPL: Number(unrealizedPL.toFixed(2)),
        symbol: position.symbol,
        strategy: position.strategyType,
      };
    });

    // Add a "current" data point to show total P/L including unrealized from open positions
    // This ensures the total P/L line extends to show current unrealized gains
    if (openPositions.length > 0) {
      // Use today's date or the most recent open position entry date
      const mostRecentOpenDate = openPositions.reduce((latest, p) => {
        const entryDate = new Date(p.entryDate);
        return entryDate > latest ? entryDate : latest;
      }, new Date(0));

      const currentDate = new Date();
      const displayDate = currentDate > mostRecentOpenDate ? currentDate : mostRecentOpenDate;

      dataPoints.push({
        date: displayDate.toISOString().split('T')[0],
        realizedPL: Number(cumulativeRealizedPL.toFixed(2)),
        totalPL: Number((cumulativeRealizedPL + unrealizedPL).toFixed(2)),
        positionPL: 0,
        unrealizedPL: Number(unrealizedPL.toFixed(2)),
        symbol: 'Open Positions',
        strategy: 'Current Unrealized' as any,
      });
    }

    return dataPoints;
  }, [positions]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  if (chartData.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">P/L Over Time</h3>
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          No closed positions yet
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">P/L Over Time</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            className="text-xs"
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            tickFormatter={formatCurrency}
            className="text-xs"
            stroke="hsl(var(--muted-foreground))"
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-card border rounded-lg shadow-lg p-3">
                    <p className="text-sm font-medium mb-1">{formatDate(data.date)}</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {data.symbol} - {data.strategy}
                    </p>
                    <p className={`text-sm font-semibold ${data.positionPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Trade: {formatCurrency(data.positionPL)}
                    </p>
                    <div className="border-t mt-2 pt-2 space-y-1">
                      <p className={`text-sm font-semibold ${data.realizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        Realized: {formatCurrency(data.realizedPL)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Unrealized: {formatCurrency(data.unrealizedPL)}
                      </p>
                      <p className={`text-sm font-semibold ${data.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        Total: {formatCurrency(data.totalPL)}
                      </p>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend 
            verticalAlign="top" 
            height={36}
            content={({ payload }) => (
              <div className="flex justify-center gap-6 pb-2 text-sm">
                {payload?.map((entry, index) => (
                  <div key={`legend-${index}`} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-muted-foreground">{entry.value}</span>
                  </div>
                ))}
              </div>
            )}
          />
          <Line
            type="monotone"
            dataKey="realizedPL"
            name="Realized P/L"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ fill: 'hsl(var(--primary))', r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="totalPL"
            name="Total P/L (Realized + Unrealized)"
            stroke="hsl(var(--chart-2))"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: 'hsl(var(--chart-2))', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
