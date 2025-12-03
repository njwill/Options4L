import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import yahooFinance from 'yahoo-finance2';
import type { ChartConfiguration } from 'chart.js';

interface YahooQuote {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TechnicalIndicators {
  ema9: (number | null)[];
  ema21: (number | null)[];
  macd: (number | null)[];
  macdSignal: (number | null)[];
  macdHistogram: (number | null)[];
  rsi: (number | null)[];
  bollingerUpper: (number | null)[];
  bollingerMiddle: (number | null)[];
  bollingerLower: (number | null)[];
  vwap: (number | null)[];
  atr: (number | null)[];
}

interface ChartData {
  candles: Candle[];
  indicators: TechnicalIndicators;
  metadata: {
    symbol: string;
    timeframe: string;
    startDate: string;
    endDate: string;
  };
}

export type Timeframe = '1D' | '5D' | '1M' | '3M' | '6M' | '1Y';

const timeframeConfig: Record<Timeframe, { interval: '1d' | '1h' | '5m' | '15m' | '1wk'; period: string; description: string }> = {
  '1D': { interval: '5m', period: '1d', description: '1 Day (5min bars)' },
  '5D': { interval: '15m', period: '5d', description: '5 Days (15min bars)' },
  '1M': { interval: '1d', period: '1mo', description: '1 Month (daily bars)' },
  '3M': { interval: '1d', period: '3mo', description: '3 Months (daily bars)' },
  '6M': { interval: '1d', period: '6mo', description: '6 Months (daily bars)' },
  '1Y': { interval: '1wk', period: '1y', description: '1 Year (weekly bars)' },
};

function calculateEMA(data: number[], period: number): (number | null)[] {
  const ema: (number | null)[] = new Array(data.length).fill(null);
  const multiplier = 2 / (period + 1);
  
  let sum = 0;
  for (let i = 0; i < Math.min(period, data.length); i++) {
    sum += data[i];
  }
  
  if (data.length >= period) {
    ema[period - 1] = sum / period;
    
    for (let i = period; i < data.length; i++) {
      ema[i] = (data[i] - (ema[i - 1] ?? 0)) * multiplier + (ema[i - 1] ?? 0);
    }
  }
  
  return ema;
}

function calculateMACD(closes: number[]): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  
  const macdLine: (number | null)[] = new Array(closes.length).fill(null);
  
  for (let i = 25; i < closes.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      macdLine[i] = ema12[i]! - ema26[i]!;
    }
  }
  
  const validMacd = macdLine.filter(v => v !== null) as number[];
  const signalLine = calculateEMA(validMacd, 9);
  
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  const histogram: (number | null)[] = new Array(closes.length).fill(null);
  
  let signalIdx = 0;
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] !== null) {
      if (signalIdx < signalLine.length && signalLine[signalIdx] !== null) {
        signal[i] = signalLine[signalIdx];
        histogram[i] = macdLine[i]! - signalLine[signalIdx]!;
      }
      signalIdx++;
    }
  }
  
  return { macd: macdLine, signal, histogram };
}

function calculateRSI(closes: number[], period: number = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(closes.length).fill(null);
  
  if (closes.length < period + 1) return rsi;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  if (avgLoss === 0) {
    rsi[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    rsi[period] = 100 - (100 / (1 + rs));
  }
  
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }
  
  return rsi;
}

function calculateBollingerBands(closes: number[], period: number = 20, stdDev: number = 2): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const middle: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    middle[i] = avg;
    upper[i] = avg + stdDev * std;
    lower[i] = avg - stdDev * std;
  }
  
  return { upper, middle, lower };
}

function calculateVWAP(candles: Candle[]): (number | null)[] {
  const vwap: (number | null)[] = new Array(candles.length).fill(null);
  
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (let i = 0; i < candles.length; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumulativeTPV += typicalPrice * candles[i].volume;
    cumulativeVolume += candles[i].volume;
    
    if (cumulativeVolume > 0) {
      vwap[i] = cumulativeTPV / cumulativeVolume;
    }
  }
  
  return vwap;
}

function calculateATR(candles: Candle[], period: number = 14): (number | null)[] {
  const atr: (number | null)[] = new Array(candles.length).fill(null);
  
  if (candles.length < period + 1) return atr;
  
  const trueRanges: number[] = [candles[0].high - candles[0].low];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  let sum = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  atr[period - 1] = sum / period;
  
  for (let i = period; i < candles.length; i++) {
    atr[i] = ((atr[i - 1]! * (period - 1)) + trueRanges[i]) / period;
  }
  
  return atr;
}

export async function fetchStockData(symbol: string, timeframe: Timeframe): Promise<ChartData> {
  const config = timeframeConfig[timeframe];
  
  const endDate = new Date();
  const startDate = new Date();
  
  switch (timeframe) {
    case '1D':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case '5D':
      startDate.setDate(startDate.getDate() - 5);
      break;
    case '1M':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case '3M':
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case '6M':
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case '1Y':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
  }
  
  const result = await yahooFinance.chart(symbol.toUpperCase(), {
    period1: startDate,
    period2: endDate,
    interval: config.interval,
  }) as { quotes: YahooQuote[] };
  
  if (!result.quotes || result.quotes.length === 0) {
    throw new Error(`No data found for symbol ${symbol}`);
  }
  
  const candles: Candle[] = result.quotes
    .filter((q: YahooQuote) => q.open !== null && q.high !== null && q.low !== null && q.close !== null)
    .map((q: YahooQuote) => ({
      date: q.date,
      open: q.open!,
      high: q.high!,
      low: q.low!,
      close: q.close!,
      volume: q.volume || 0,
    }));
  
  if (candles.length === 0) {
    throw new Error(`No valid price data for symbol ${symbol}`);
  }
  
  const closes = candles.map(c => c.close);
  
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const { macd, signal: macdSignal, histogram: macdHistogram } = calculateMACD(closes);
  const rsi = calculateRSI(closes);
  const { upper: bollingerUpper, middle: bollingerMiddle, lower: bollingerLower } = calculateBollingerBands(closes);
  const vwap = calculateVWAP(candles);
  const atr = calculateATR(candles);
  
  return {
    candles,
    indicators: {
      ema9,
      ema21,
      macd,
      macdSignal,
      macdHistogram,
      rsi,
      bollingerUpper,
      bollingerMiddle,
      bollingerLower,
      vwap,
      atr,
    },
    metadata: {
      symbol: symbol.toUpperCase(),
      timeframe: config.description,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    },
  };
}

export async function generateChartImage(chartData: ChartData): Promise<Buffer> {
  const width = 1200;
  const height = 800;
  
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour: '#1a1a2e',
  });
  
  const { candles, indicators, metadata } = chartData;
  
  const labels = candles.map(c => {
    const d = new Date(c.date);
    if (metadata.timeframe.includes('5min') || metadata.timeframe.includes('15min')) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  const opens = candles.map(c => c.open);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  
  const candleColors = candles.map(c => c.close >= c.open ? '#00C805' : '#FF5252');
  
  const config: ChartConfiguration = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Close',
          data: closes,
          type: 'line',
          borderColor: '#00C805',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          order: 1,
        },
        {
          label: 'EMA 9',
          data: indicators.ema9 as any,
          type: 'line',
          borderColor: '#FF9800',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.1,
          order: 2,
        },
        {
          label: 'EMA 21',
          data: indicators.ema21 as any,
          type: 'line',
          borderColor: '#2196F3',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.1,
          order: 3,
        },
        {
          label: 'Bollinger Upper',
          data: indicators.bollingerUpper as any,
          type: 'line',
          borderColor: 'rgba(156, 39, 176, 0.5)',
          backgroundColor: 'transparent',
          borderWidth: 1,
          pointRadius: 0,
          borderDash: [5, 5],
          order: 4,
        },
        {
          label: 'Bollinger Lower',
          data: indicators.bollingerLower as any,
          type: 'line',
          borderColor: 'rgba(156, 39, 176, 0.5)',
          backgroundColor: 'transparent',
          borderWidth: 1,
          pointRadius: 0,
          borderDash: [5, 5],
          order: 5,
        },
        {
          label: 'VWAP',
          data: indicators.vwap as any,
          type: 'line',
          borderColor: 'rgba(255, 193, 7, 0.7)',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          order: 6,
        },
        {
          label: 'High-Low Range',
          data: highs.map((h, i) => h - lows[i]),
          backgroundColor: candleColors.map(c => c + '40'),
          borderColor: candleColors,
          borderWidth: 1,
          order: 10,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `${metadata.symbol} - ${metadata.timeframe}`,
          color: '#ffffff',
          font: { size: 18, weight: 'bold' },
          padding: { top: 10, bottom: 20 },
        },
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#cccccc',
            font: { size: 10 },
            boxWidth: 15,
            padding: 10,
          },
        },
        subtitle: {
          display: true,
          text: `${metadata.startDate} to ${metadata.endDate} | EMA 9/21 | Bollinger Bands (20,2) | VWAP`,
          color: '#888888',
          font: { size: 12 },
          padding: { bottom: 10 },
        },
      },
      scales: {
        x: {
          display: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
          },
          ticks: {
            color: '#888888',
            maxTicksLimit: 20,
            maxRotation: 45,
            minRotation: 0,
          },
        },
        y: {
          display: true,
          position: 'right',
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
          },
          ticks: {
            color: '#888888',
            callback: function(value) {
              return '$' + Number(value).toFixed(2);
            },
          },
        },
      },
    },
  };
  
  const buffer = await chartJSNodeCanvas.renderToBuffer(config);
  return buffer;
}

export async function generateChart(symbol: string, timeframe: Timeframe): Promise<{ buffer: Buffer; chartData: ChartData }> {
  const chartData = await fetchStockData(symbol, timeframe);
  const buffer = await generateChartImage(chartData);
  return { buffer, chartData };
}
