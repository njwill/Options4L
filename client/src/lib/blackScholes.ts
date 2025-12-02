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
  ivSource: 'calculated' | 'yahoo' | 'fallback';
}

export interface GreeksInput {
  underlyingPrice: number;
  strikePrice: number;
  expirationDate: string;
  optionType: 'call' | 'put';
  impliedVolatility?: number; // Now optional - we can solve for it
  marketPrice: number;
  riskFreeRate?: number;
}

const DEFAULT_RISK_FREE_RATE = 0.045;

// Standard normal cumulative distribution function (CDF)
function normCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

// Standard normal probability density function (PDF)
function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Calculate d1 and d2 for Black-Scholes
function calculateD1D2(S: number, K: number, T: number, r: number, sigma: number): { d1: number; d2: number } {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return { d1, d2 };
}

// Black-Scholes option price calculation
function bsPrice(S: number, K: number, T: number, r: number, sigma: number, optionType: 'call' | 'put'): number {
  if (T <= 0 || sigma <= 0) return 0;
  const { d1, d2 } = calculateD1D2(S, K, T, r, sigma);
  
  if (optionType === 'call') {
    return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
  }
}

// Vega calculation (sensitivity to volatility) - used for Newton-Raphson
function bsVega(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return 0;
  const { d1 } = calculateD1D2(S, K, T, r, sigma);
  return S * normPDF(d1) * Math.sqrt(T);
}

// Newton-Raphson IV solver
export function solveImpliedVolatility(
  marketPrice: number,
  underlyingPrice: number,
  strikePrice: number,
  timeToExpiration: number, // in years
  riskFreeRate: number,
  optionType: 'call' | 'put',
  options: { initialGuess?: number; tolerance?: number; maxIterations?: number } = {}
): number | null {
  const {
    initialGuess = 0.3, // Start at 30% volatility
    tolerance = 1e-6,
    maxIterations = 100
  } = options;

  // Validate inputs
  if (marketPrice <= 0 || underlyingPrice <= 0 || strikePrice <= 0 || timeToExpiration <= 0) {
    return null;
  }

  // Check for intrinsic value - option price must be at least intrinsic value
  const intrinsicValue = optionType === 'call' 
    ? Math.max(0, underlyingPrice - strikePrice)
    : Math.max(0, strikePrice - underlyingPrice);
  
  if (marketPrice < intrinsicValue * 0.95) {
    // Price below intrinsic value is suspicious but could be due to bid/ask spread
    // Allow some tolerance
    return null;
  }

  let sigma = initialGuess;
  
  for (let i = 0; i < maxIterations; i++) {
    const price = bsPrice(underlyingPrice, strikePrice, timeToExpiration, riskFreeRate, sigma, optionType);
    const vegaValue = bsVega(underlyingPrice, strikePrice, timeToExpiration, riskFreeRate, sigma);
    
    const diff = price - marketPrice;
    
    // Check convergence
    if (Math.abs(diff) < tolerance) {
      // Sanity check: IV should be between 1% and 500%
      if (sigma >= 0.01 && sigma <= 5.0) {
        return sigma;
      }
      return null;
    }
    
    // Avoid division by zero or very small vega
    if (Math.abs(vegaValue) < 1e-10) {
      // Try a different initial guess if vega is too small
      if (i === 0) {
        sigma = sigma > 0.5 ? 0.15 : 0.8;
        continue;
      }
      return null;
    }
    
    // Newton-Raphson update
    sigma = sigma - diff / vegaValue;
    
    // Keep sigma in reasonable bounds
    if (sigma <= 0.001) {
      sigma = 0.001;
    } else if (sigma > 10) {
      sigma = 10;
    }
  }
  
  // Failed to converge - return null
  return null;
}

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
      impliedVolatility: yahooIV,
      marketPrice,
      riskFreeRate = DEFAULT_RISK_FREE_RATE,
    } = input;

    if (!underlyingPrice || underlyingPrice <= 0) return null;
    if (!strikePrice || strikePrice <= 0) return null;
    if (!marketPrice || marketPrice <= 0) return null;

    const daysToExpiration = calculateDaysToExpiration(expirationDate);
    
    if (daysToExpiration <= 0) {
      // Expired option - use intrinsic value
      const intrinsicDelta = optionType === 'call' 
        ? (underlyingPrice > strikePrice ? 1 : 0) 
        : (underlyingPrice < strikePrice ? -1 : 0);
      
      return {
        delta: intrinsicDelta,
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
        impliedVolatility: 0,
        ivSource: 'fallback',
      };
    }

    const timeToExpiration = daysToExpiration / 365;

    // Try to solve for IV from market price first (most accurate)
    let iv: number | null = null;
    let ivSource: 'calculated' | 'yahoo' | 'fallback' = 'fallback';

    // First attempt: Calculate IV from market price using Newton-Raphson
    iv = solveImpliedVolatility(
      marketPrice,
      underlyingPrice,
      strikePrice,
      timeToExpiration,
      riskFreeRate,
      optionType
    );

    if (iv !== null) {
      ivSource = 'calculated';
    } else if (yahooIV && yahooIV > 0) {
      // Fallback to Yahoo IV if we couldn't solve it
      // Normalize: Yahoo sometimes returns 0.30 for 30%, sometimes 30 for 30%
      iv = yahooIV > 3 ? yahooIV / 100 : yahooIV;
      ivSource = 'yahoo';
    } else {
      // Last resort: use a default IV of 30%
      iv = 0.30;
      ivSource = 'fallback';
    }

    // Ensure IV is in reasonable bounds
    iv = Math.max(0.01, Math.min(5.0, iv));

    const option = bs.option({
      rate: riskFreeRate,
      sigma: iv,
      strike: strikePrice,
      time: timeToExpiration,
      type: optionType,
      underlying: underlyingPrice,
    });

    const theoreticalPrice = option.price;
    const priceDiff = marketPrice - theoreticalPrice;
    const priceDiffPercent = theoreticalPrice > 0 ? (priceDiff / theoreticalPrice) * 100 : 0;

    // Black-Scholes theta is already negative for long options (lose value over time)
    // Just convert from annual to daily - no sign flip needed
    // Long option theta: negative (paying decay)
    // Short option: signed quantity flips it to positive (earning decay)
    const thetaPerDay = option.theta / 365;

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
      impliedVolatility: iv,
      ivSource,
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
    greeks: GreeksResult;
    quantity: number; // Already signed: negative for short (STO/STC), positive for long (BTO/BTC)
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
    // Quantity is already signed (negative for short positions, positive for long)
    // Multiply by 100 to convert per-contract to share-equivalent units
    const multiplier = leg.quantity * 100;

    // No additional sign flip needed - quantity already handles long/short orientation
    // Short put: negative quantity × negative delta = positive total delta (bullish) ✓
    // Long put: positive quantity × negative delta = negative total delta (bearish) ✓
    // Short call: negative quantity × positive delta = negative total delta (bearish) ✓
    // Long call: positive quantity × positive delta = positive total delta (bullish) ✓
    totalDelta += leg.greeks.delta * multiplier;
    totalGamma += leg.greeks.gamma * multiplier;
    totalTheta += leg.greeks.theta * multiplier;
    totalVega += leg.greeks.vega * multiplier;
  });

  return { totalDelta, totalGamma, totalTheta, totalVega };
}

/**
 * Calculate intrinsic and extrinsic value for an option
 * Intrinsic = the "real" value if exercised now
 * Extrinsic = time value (premium above intrinsic)
 */
export interface IntrinsicExtrinsicResult {
  intrinsicValue: number;
  extrinsicValue: number;
  isITM: boolean; // In The Money
  isATM: boolean; // At The Money (within 1% of strike)
  isOTM: boolean; // Out of The Money
  moneyness: string; // "ITM", "ATM", or "OTM"
}

export function calculateIntrinsicExtrinsic(
  underlyingPrice: number,
  strikePrice: number,
  optionType: 'call' | 'put',
  optionPrice: number
): IntrinsicExtrinsicResult {
  // Calculate intrinsic value
  let intrinsicValue: number;
  if (optionType === 'call') {
    // Call intrinsic = max(0, underlying - strike)
    intrinsicValue = Math.max(0, underlyingPrice - strikePrice);
  } else {
    // Put intrinsic = max(0, strike - underlying)
    intrinsicValue = Math.max(0, strikePrice - underlyingPrice);
  }
  
  // Extrinsic value = option price - intrinsic value
  // Can be slightly negative due to bid/ask spread, floor at 0
  const extrinsicValue = Math.max(0, optionPrice - intrinsicValue);
  
  // Determine moneyness
  const priceDiff = underlyingPrice - strikePrice;
  const percentFromStrike = Math.abs(priceDiff / strikePrice) * 100;
  
  // ATM if within 1% of strike
  const isATM = percentFromStrike < 1;
  
  let isITM: boolean;
  let isOTM: boolean;
  
  if (optionType === 'call') {
    isITM = priceDiff > 0 && !isATM;
    isOTM = priceDiff < 0 && !isATM;
  } else {
    isITM = priceDiff < 0 && !isATM;
    isOTM = priceDiff > 0 && !isATM;
  }
  
  const moneyness = isATM ? 'ATM' : isITM ? 'ITM' : 'OTM';
  
  return {
    intrinsicValue,
    extrinsicValue,
    isITM,
    isATM,
    isOTM,
    moneyness,
  };
}
