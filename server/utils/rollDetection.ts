import type { Transaction, Roll } from '@shared/schema';
import { randomUUID } from 'crypto';

export interface RollMatch {
  closeTransactions: Transaction[];
  openTransactions: Transaction[];
  rollDate: string;
}

export function detectRolls(transactions: Transaction[]): RollMatch[] {
  const rolls: RollMatch[] = [];
  const optionTxns = transactions.filter((t) => t.option.isOption && t.option.expiration && t.option.strike);

  // Group by date and symbol
  const byDateSymbol = new Map<string, Transaction[]>();
  
  optionTxns.forEach((txn) => {
    const key = `${txn.activityDate}|${txn.option.symbol}`;
    if (!byDateSymbol.has(key)) {
      byDateSymbol.set(key, []);
    }
    byDateSymbol.get(key)!.push(txn);
  });

  // Look for closing + opening patterns on the same day
  byDateSymbol.forEach((txns, key) => {
    const closingTxns = txns.filter((t) => t.transCode === 'BTC' || t.transCode === 'STC');
    const openingTxns = txns.filter((t) => t.transCode === 'STO' || t.transCode === 'BTO'); // Include BTO!

    closingTxns.forEach((closeTxn) => {
      // Determine expected opening type based on closing type
      const expectedOpeningCode = closeTxn.transCode === 'BTC' ? 'BTO' : 'STO';
      
      // Find matching opening transaction
      const matchingOpen = openingTxns.find((openTxn) => {
        // Must be the correct opening type (BTC→BTO, STC→STO)
        const correctType = openTxn.transCode === expectedOpeningCode;
        // Same option type (Call/Put)
        const sameOptionType = closeTxn.option.optionType === openTxn.option.optionType;
        // Same quantity (or close enough)
        const sameQty = Math.abs(closeTxn.quantity - openTxn.quantity) < 1;
        // Different expiration OR different strike (roll criteria)
        const isDifferent = 
          closeTxn.option.expiration !== openTxn.option.expiration ||
          closeTxn.option.strike !== openTxn.option.strike;
        
        return correctType && sameOptionType && sameQty && isDifferent;
      });

      if (matchingOpen) {
        // This is a roll!
        rolls.push({
          closeTransactions: [closeTxn],
          openTransactions: [matchingOpen],
          rollDate: closeTxn.activityDate,
        });
      }
    });
  });

  return rolls;
}

export function createRollRecords(rollMatches: RollMatch[]): Roll[] {
  return rollMatches.map((match) => {
    const closeTxn = match.closeTransactions[0];
    const openTxn = match.openTransactions[0];

    // Calculate net credit: opening credits minus closing debits
    const netCredit = openTxn.amount + closeTxn.amount;

    return {
      id: randomUUID(),
      fromLegId: closeTxn.id,
      toLegId: openTxn.id,
      rollDate: match.rollDate,
      fromExpiration: closeTxn.option.expiration!,
      toExpiration: openTxn.option.expiration!,
      fromStrike: closeTxn.option.strike!,
      toStrike: openTxn.option.strike!,
      netCredit,
    };
  });
}
