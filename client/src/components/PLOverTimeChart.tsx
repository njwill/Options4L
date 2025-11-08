import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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

    let cumulativePL = 0;
    return closedPositions.map((position) => {
      const pl = position.realizedPL ?? position.netPL;
      cumulativePL += pl;
      
      return {
        date: position.exitDate!,
        cumulativePL: Number(cumulativePL.toFixed(2)),
        positionPL: Number(pl.toFixed(2)),
        symbol: position.symbol,
        strategy: position.strategyType,
      };
    });
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
                    <p className={`text-sm font-semibold ${data.cumulativePL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Total: {formatCurrency(data.cumulativePL)}
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Line
            type="monotone"
            dataKey="cumulativePL"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ fill: 'hsl(var(--primary))', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
