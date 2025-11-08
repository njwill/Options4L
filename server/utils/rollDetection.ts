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

  // Look for BTC/STC + STO patterns on the same day
  byDateSymbol.forEach((txns, key) => {
    const closingTxns = txns.filter((t) => t.transCode === 'BTC' || t.transCode === 'STC');
    const openingTxns = txns.filter((t) => t.transCode === 'STO');

    closingTxns.forEach((closeTxn) => {
      // Find matching opening transaction
      const matchingOpen = openingTxns.find((openTxn) => {
        // Same symbol, same option type (Call/Put)
        const sameType = closeTxn.option.optionType === openTxn.option.optionType;
        // Same quantity (or close enough)
        const sameQty = Math.abs(closeTxn.quantity - openTxn.quantity) < 1;
        
        return sameType && sameQty;
      });

      if (matchingOpen && closeTxn.option.expiration !== matchingOpen.option.expiration) {
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

    const netCredit = openTxn.amount + closeTxn.amount; // STO is positive, BTC is negative

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
