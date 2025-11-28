import { BlackScholes } from '@uqee/black-scholes';

const bs = new BlackScholes();

export interface GreeksResult {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  theoreticalPrice: number;
  marketPrice: number;
  priceDiff: number;
  priceDiffPercent: number;
  daysToExpiration: number;
  impliedVolatility: number;
}

export interface GreeksInput {
  underlyingPrice: number;
  strikePrice: number;
  expirationDate: string;
  optionType: 'call' | 'put';
  impliedVolatility: number;
  marketPrice: number;
  riskFreeRate?: number;
}

const DEFAULT_RISK_FREE_RATE = 0.045;

export function calculateDaysToExpiration(expirationDate: string): number {
  const expDate = new Date(expirationDate);
  const now = new Date();
  const diffTime = expDate.getTime() - now.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return Math.max(0, diffDays);
}

export function calculateGreeks(input: GreeksInput): GreeksResult | null {
  try {
    const {
      underlyingPrice,
      strikePrice,
      expirationDate,
      optionType,
      impliedVolatility,
      marketPrice,
      riskFreeRate = DEFAULT_RISK_FREE_RATE,
    } = input;

    if (!underlyingPrice || underlyingPrice <= 0) return null;
    if (!strikePrice || strikePrice <= 0) return null;
    if (!impliedVolatility || impliedVolatility <= 0) return null;

    const daysToExpiration = calculateDaysToExpiration(expirationDate);
    
    if (daysToExpiration <= 0) {
      return {
        delta: optionType === 'call' ? (underlyingPrice > strikePrice ? 1 : 0) : (underlyingPrice < strikePrice ? -1 : 0),
        gamma: 0,
        theta: 0,
        vega: 0,
        rho: 0,
        theoreticalPrice: Math.max(0, optionType === 'call' 
          ? underlyingPrice - strikePrice 
          : strikePrice - underlyingPrice),
        marketPrice,
        priceDiff: 0,
        priceDiffPercent: 0,
        daysToExpiration: 0,
        impliedVolatility,
      };
    }

    const timeToExpiration = daysToExpiration / 365;

    const option = bs.option({
      rate: riskFreeRate,
      sigma: impliedVolatility,
      strike: strikePrice,
      time: timeToExpiration,
      type: optionType,
      underlying: underlyingPrice,
    });

    const theoreticalPrice = option.price;
    const priceDiff = marketPrice - theoreticalPrice;
    const priceDiffPercent = theoreticalPrice > 0 ? (priceDiff / theoreticalPrice) * 100 : 0;

    const thetaPerDay = -option.theta / 365;

    return {
      delta: option.delta,
      gamma: option.gamma,
      theta: thetaPerDay,
      vega: option.vega / 100,
      rho: option.rho / 100,
      theoreticalPrice,
      marketPrice,
      priceDiff,
      priceDiffPercent,
      daysToExpiration,
      impliedVolatility,
    };
  } catch (error) {
    console.error('Black-Scholes calculation error:', error);
    return null;
  }
}

export function formatGreek(value: number, decimals: number = 4): string {
  if (Math.abs(value) < 0.0001) return '0.0000';
  return value.toFixed(decimals);
}

export function formatPercent(value: number, decimals: number = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function formatDelta(delta: number): string {
  return formatGreek(delta, 2);
}

export function formatGamma(gamma: number): string {
  return formatGreek(gamma, 4);
}

export function formatTheta(theta: number): string {
  const formatted = theta.toFixed(2);
  return theta < 0 ? formatted : `+${formatted}`;
}

export function formatVega(vega: number): string {
  return formatGreek(vega, 2);
}

export function getGreekExplanation(greek: string): string {
  switch (greek.toLowerCase()) {
    case 'delta':
      return 'Price change per $1 move in the underlying. Calls: 0 to 1, Puts: -1 to 0.';
    case 'gamma':
      return 'Rate of change of delta. Higher gamma = delta changes faster.';
    case 'theta':
      return 'Daily time decay. Negative = losing value each day.';
    case 'vega':
      return 'Price change per 1% change in implied volatility.';
    case 'rho':
      return 'Price change per 1% change in interest rates.';
    default:
      return '';
  }
}

export function calculatePositionGreeks(
  legs: Array<{
    greeks: GreeksResult | null;
    quantity: number;
    transCode: string;
  }>
): {
  totalDelta: number;
  totalGamma: number;
  totalTheta: number;
  totalVega: number;
} {
  let totalDelta = 0;
  let totalGamma = 0;
  let totalTheta = 0;
  let totalVega = 0;

  legs.forEach(leg => {
    if (!leg.greeks) return;
    
    const multiplier = leg.quantity * 100;
    const isShort = leg.transCode === 'STO' || leg.transCode === 'STC';
    const sign = isShort ? -1 : 1;

    totalDelta += leg.greeks.delta * multiplier * sign;
    totalGamma += leg.greeks.gamma * multiplier * sign;
    totalTheta += leg.greeks.theta * multiplier * sign;
    totalVega += leg.greeks.vega * multiplier * sign;
  });

  return { totalDelta, totalGamma, totalTheta, totalVega };
}
