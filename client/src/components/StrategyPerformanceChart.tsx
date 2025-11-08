import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Position } from '@shared/schema';

interface StrategyPerformanceChartProps {
  positions: Position[];
}

export function StrategyPerformanceChart({ positions }: StrategyPerformanceChartProps) {
  const chartData = useMemo(() => {
    const strategyMap = new Map<string, { totalPL: number; count: number }>();

    positions.forEach((position) => {
      const pl = position.realizedPL ?? position.netPL;
      const existing = strategyMap.get(position.strategyType) || { totalPL: 0, count: 0 };
      strategyMap.set(position.strategyType, {
        totalPL: existing.totalPL + pl,
        count: existing.count + 1,
      });
    });

    return Array.from(strategyMap.entries())
      .map(([strategy, data]) => ({
        strategy: strategy,
        totalPL: Number(data.totalPL.toFixed(2)),
        count: data.count,
        avgPL: Number((data.totalPL / data.count).toFixed(2)),
      }))
      .sort((a, b) => b.totalPL - a.totalPL);
  }, [positions]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (chartData.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Strategy Performance</h3>
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          No positions yet
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Strategy Performance</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            type="number"
            tickFormatter={formatCurrency}
            className="text-xs"
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            type="category"
            dataKey="strategy"
            className="text-xs"
            stroke="hsl(var(--muted-foreground))"
            width={90}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-card border rounded-lg shadow-lg p-3">
                    <p className="text-sm font-medium mb-2">{data.strategy}</p>
                    <p className={`text-sm font-semibold ${data.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Total P/L: {formatCurrency(data.totalPL)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {data.count} positions · Avg: {formatCurrency(data.avgPL)}
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="totalPL" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.totalPL >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-5))'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
