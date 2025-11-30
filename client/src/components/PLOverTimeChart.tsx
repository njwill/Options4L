import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Cell } from 'recharts';
import type { Position } from '@shared/schema';
import { format, parse } from 'date-fns';

function parseDate(dateStr: string): Date {
  if (dateStr.includes('-')) {
    return new Date(dateStr);
  }
  return parse(dateStr, 'M/d/yyyy', new Date());
}

interface LivePLData {
  liveOpenPL: number;
  liveTotalPL: number;
  realizedPL: number;
  hasLiveData: boolean;
}

interface PLOverTimeChartProps {
  positions: Position[];
  livePLData?: LivePLData | null;
}

interface MonthlyData {
  month: string;
  monthLabel: string;
  realizedPL: number;
  unrealizedPL: number;
  totalPL: number;
  closedCount: number;
  openCount: number;
  isCurrentMonth: boolean;
}

export function PLOverTimeChart({ positions, livePLData }: PLOverTimeChartProps) {
  const currentMonth = format(new Date(), 'yyyy-MM');

  const chartData = useMemo(() => {
    if (positions.length === 0) return [];

    const closedPositions = positions.filter((p) => p.status === 'closed' && p.exitDate);
    const openPositions = positions.filter((p) => p.status === 'open');

    const monthlyMap = new Map<string, MonthlyData>();

    closedPositions.forEach((position) => {
      const exitDate = parseDate(position.exitDate!);
      const monthKey = format(exitDate, 'yyyy-MM');
      const monthLabel = format(exitDate, 'MMM yyyy');
      
      const existing = monthlyMap.get(monthKey) || {
        month: monthKey,
        monthLabel,
        realizedPL: 0,
        unrealizedPL: 0,
        totalPL: 0,
        closedCount: 0,
        openCount: 0,
        isCurrentMonth: monthKey === currentMonth,
      };

      const pl = position.realizedPL ?? position.netPL;
      existing.realizedPL += pl;
      existing.totalPL += pl;
      existing.closedCount += 1;
      
      monthlyMap.set(monthKey, existing);
    });

    const currentMonthLabel = format(new Date(), 'MMM yyyy');
    
    if (openPositions.length > 0) {
      const unrealizedPL = livePLData?.hasLiveData 
        ? livePLData.liveOpenPL 
        : openPositions.reduce((sum, p) => sum + p.netPL, 0);

      const existing = monthlyMap.get(currentMonth) || {
        month: currentMonth,
        monthLabel: currentMonthLabel,
        realizedPL: 0,
        unrealizedPL: 0,
        totalPL: 0,
        closedCount: 0,
        openCount: 0,
        isCurrentMonth: true,
      };

      existing.unrealizedPL = unrealizedPL;
      existing.totalPL = existing.realizedPL + unrealizedPL;
      existing.openCount = openPositions.length;
      
      monthlyMap.set(currentMonth, existing);
    }

    const sortedData = Array.from(monthlyMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(d => ({
        ...d,
        realizedPL: Number(d.realizedPL.toFixed(2)),
        unrealizedPL: Number(d.unrealizedPL.toFixed(2)),
        totalPL: Number(d.totalPL.toFixed(2)),
      }));

    return sortedData;
  }, [positions, livePLData, currentMonth]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatShortMonth = (monthLabel: string) => {
    const parts = monthLabel.split(' ');
    if (parts.length === 2) {
      return parts[0];
    }
    return monthLabel;
  };

  if (chartData.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Monthly P/L Breakdown</h3>
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          No position data yet
        </div>
      </Card>
    );
  }

  const hasUnrealized = chartData.some(d => d.unrealizedPL !== 0);

  return (
    <Card className="p-6" data-testid="card-monthly-pl">
      <h3 className="text-lg font-semibold mb-4">Monthly P/L Breakdown</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} stackOffset="sign">
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          <XAxis
            dataKey="monthLabel"
            tickFormatter={formatShortMonth}
            className="text-xs"
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={formatCurrency}
            className="text-xs"
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
          />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload as MonthlyData;
                return (
                  <div className="bg-card border rounded-lg shadow-lg p-3 min-w-[180px]">
                    <p className="text-sm font-medium mb-2 border-b pb-2">{data.monthLabel}</p>
                    <div className="space-y-1.5">
                      {data.isCurrentMonth ? (
                        <>
                          {data.realizedPL !== 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-muted-foreground">Realized P/L</span>
                              <span className={`text-sm font-medium tabular-nums ${data.realizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(data.realizedPL)}
                              </span>
                            </div>
                          )}
                          {data.unrealizedPL !== 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-muted-foreground">Unrealized P/L</span>
                              <span className={`text-sm font-medium tabular-nums ${data.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(data.unrealizedPL)}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-1.5 border-t">
                            <span className="text-xs font-medium">Total</span>
                            <span className={`text-sm font-semibold tabular-nums ${data.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(data.totalPL)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-medium">P/L</span>
                          <span className={`text-sm font-semibold tabular-nums ${data.realizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(data.realizedPL)}
                          </span>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground pt-1">
                        {data.closedCount > 0 && <span>{data.closedCount} closed</span>}
                        {data.closedCount > 0 && data.openCount > 0 && <span> · </span>}
                        {data.openCount > 0 && <span>{data.openCount} open</span>}
                      </div>
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
            content={() => (
              <div className="flex justify-center gap-6 pb-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(142, 76%, 36%)' }} />
                  <span className="text-muted-foreground">Profit</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(0, 84%, 60%)' }} />
                  <span className="text-muted-foreground">Loss</span>
                </div>
                {hasUnrealized && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(142, 76%, 36%)', opacity: 0.6 }} />
                    <span className="text-muted-foreground">Unrealized (current month)</span>
                  </div>
                )}
              </div>
            )}
          />
          <Bar
            dataKey="realizedPL"
            name="Realized P/L"
            radius={[2, 2, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`realized-${index}`} 
                fill={entry.realizedPL >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'}
              />
            ))}
          </Bar>
          {hasUnrealized && (
            <Bar
              dataKey="unrealizedPL"
              name="Unrealized P/L"
              radius={[2, 2, 0, 0]}
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`unrealized-${index}`} 
                  fill={entry.unrealizedPL >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'}
                  fillOpacity={0.6}
                />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
