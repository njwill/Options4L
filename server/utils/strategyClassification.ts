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

  // Two leg strategies
  if (legs.length === 2) {
    const sorted = [...legs].sort((a, b) => a.strike - b.strike);
    const [lower, higher] = sorted;

    // Check for straddle (same strike, call and put)
    if (lower.strike === higher.strike && lower.expiration === higher.expiration) {
      const call = legs.find(l => l.optionType === 'Call');
      const put = legs.find(l => l.optionType === 'Put');
      
      if (call && put) {
        const bothLong = call.transCode === 'BTO' && put.transCode === 'BTO';
        const bothShort = call.transCode === 'STO' && put.transCode === 'STO';
        
        if (bothLong) return 'Long Straddle';
        if (bothShort) return 'Short Straddle';
      }
    }

    // Check for strangle (different strikes, call and put)
    const call = legs.find(l => l.optionType === 'Call');
    const put = legs.find(l => l.optionType === 'Put');
    
    if (call && put && lower.expiration === higher.expiration && lower.strike !== higher.strike) {
      const bothLong = call.transCode === 'BTO' && put.transCode === 'BTO';
      const bothShort = call.transCode === 'STO' && put.transCode === 'STO';
      
      if (bothLong) return 'Long Strangle';
      if (bothShort) return 'Short Strangle';
    }

    // Vertical spreads
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

    // Calendar spread (same strike, different expiration, opposite directions)
    if (lower.strike === higher.strike && lower.expiration !== higher.expiration) {
      if (lower.optionType === higher.optionType) {
        // Require one long and one short for a true calendar spread
        const oneLongOneShort = 
          (lower.transCode === 'BTO' && higher.transCode === 'STO') ||
          (lower.transCode === 'STO' && higher.transCode === 'BTO');
        
        if (oneLongOneShort) {
          return 'Calendar Spread';
        }
      }
    }

    // Diagonal spread (different strike and expiration, opposite directions)
    if (lower.strike !== higher.strike && lower.expiration !== higher.expiration) {
      if (lower.optionType === higher.optionType) {
        // Require one long and one short for a true diagonal spread
        const oneLongOneShort = 
          (lower.transCode === 'BTO' && higher.transCode === 'STO') ||
          (lower.transCode === 'STO' && higher.transCode === 'BTO');
        
        if (oneLongOneShort) {
          return 'Diagonal Spread';
        }
      }
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
