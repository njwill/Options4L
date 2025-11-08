import type { Transaction, StrategyType, OptionLeg, Position } from '@shared/schema';
import { randomUUID } from 'crypto';

export function classifyStrategy(legs: OptionLeg[], stockHoldings?: number): StrategyType {
  if (legs.length === 0) return 'Unknown';

  // Single leg strategies
  if (legs.length === 1) {
    const leg = legs[0];
    
    if (leg.transCode === 'STO' && leg.optionType === 'Call' && stockHoldings && stockHoldings >= leg.quantity * 100) {
      return 'Covered Call';
    }
    
    if (leg.transCode === 'STO' && leg.optionType === 'Put') {
      return 'Cash Secured Put';
    }
    
    if (leg.transCode === 'STO' && leg.optionType === 'Call') {
      return 'Short Call';
    }
    
    if (leg.transCode === 'STO' && leg.optionType === 'Put') {
      return 'Short Put';
    }
    
    if (leg.transCode === 'BTO' && leg.optionType === 'Call') {
      return 'Long Call';
    }
    
    if (leg.transCode === 'BTO' && leg.optionType === 'Put') {
      return 'Long Put';
    }
  }

  // Two leg strategies (vertical spreads)
  if (legs.length === 2) {
    const sorted = [...legs].sort((a, b) => a.strike - b.strike);
    const [lower, higher] = sorted;

    // Put Credit Spread (sell higher strike put, buy lower strike put)
    if (
      lower.optionType === 'Put' &&
      higher.optionType === 'Put' &&
      lower.transCode === 'BTO' &&
      higher.transCode === 'STO' &&
      lower.expiration === higher.expiration
    ) {
      return 'Put Credit Spread';
    }

    // Put Debit Spread (buy higher strike put, sell lower strike put)
    if (
      lower.optionType === 'Put' &&
      higher.optionType === 'Put' &&
      lower.transCode === 'STO' &&
      higher.transCode === 'BTO' &&
      lower.expiration === higher.expiration
    ) {
      return 'Put Debit Spread';
    }

    // Call Credit Spread (sell lower strike call, buy higher strike call)
    if (
      lower.optionType === 'Call' &&
      higher.optionType === 'Call' &&
      lower.transCode === 'STO' &&
      higher.transCode === 'BTO' &&
      lower.expiration === higher.expiration
    ) {
      return 'Call Credit Spread';
    }

    // Call Debit Spread (buy lower strike call, sell higher strike call)
    if (
      lower.optionType === 'Call' &&
      higher.optionType === 'Call' &&
      lower.transCode === 'BTO' &&
      higher.transCode === 'STO' &&
      lower.expiration === higher.expiration
    ) {
      return 'Call Debit Spread';
    }
  }

  // Four leg strategies (Iron Condor)
  if (legs.length === 4) {
    const puts = legs.filter((l) => l.optionType === 'Put').sort((a, b) => a.strike - b.strike);
    const calls = legs.filter((l) => l.optionType === 'Call').sort((a, b) => a.strike - b.strike);

    if (puts.length === 2 && calls.length === 2) {
      const [lowerPut, higherPut] = puts;
      const [lowerCall, higherCall] = calls;

      // Iron Condor: sell put spread + sell call spread
      const isPutCreditSpread = lowerPut.transCode === 'BTO' && higherPut.transCode === 'STO';
      const isCallCreditSpread = lowerCall.transCode === 'STO' && higherCall.transCode === 'BTO';

      if (isPutCreditSpread && isCallCreditSpread) {
        return 'Iron Condor';
      }
    }
  }

  return 'Unknown';
}

export function createOptionLeg(transaction: Transaction, status: 'open' | 'closed' | 'expired' | 'assigned'): OptionLeg {
  return {
    id: transaction.id,
    symbol: transaction.option.symbol,
    expiration: transaction.option.expiration!,
    strike: transaction.option.strike!,
    optionType: transaction.option.optionType!,
    transCode: transaction.transCode,
    quantity: transaction.quantity,
    price: transaction.price,
    amount: transaction.amount,
    activityDate: transaction.activityDate,
    transactionId: transaction.id,
    status,
  };
}
