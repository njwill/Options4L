import { randomUUID } from 'crypto';
import type { Transaction, StockHolding, StockLot } from '@shared/schema';

interface StockLedger {
  symbol: string;
  lots: StockLot[];
  transactionIds: string[];
  realizedPL: number;
  firstBuyDate: string;
  lastActivityDate: string;
}

export function buildStockHoldings(transactions: Transaction[]): StockHolding[] {
  const stockTxns = transactions.filter((t) => 
    !t.option.isOption && 
    (t.transCode === 'Buy' || t.transCode === 'Sell')
  );

  if (stockTxns.length === 0) {
    return [];
  }

  const sortedTxns = [...stockTxns].sort((a, b) => {
    return new Date(a.activityDate).getTime() - new Date(b.activityDate).getTime();
  });

  const ledgerMap = new Map<string, StockLedger>();

  sortedTxns.forEach((txn) => {
    const symbol = txn.option.symbol || txn.instrument;
    
    if (!ledgerMap.has(symbol)) {
      ledgerMap.set(symbol, {
        symbol,
        lots: [],
        transactionIds: [],
        realizedPL: 0,
        firstBuyDate: txn.activityDate,
        lastActivityDate: txn.activityDate,
      });
    }

    const ledger = ledgerMap.get(symbol)!;
    ledger.transactionIds.push(txn.id);
    ledger.lastActivityDate = txn.activityDate;

    if (txn.transCode === 'Buy') {
      const lot: StockLot = {
        id: randomUUID(),
        transactionId: txn.id,
        buyDate: txn.activityDate,
        quantity: txn.quantity,
        remainingQuantity: txn.quantity,
        pricePerShare: txn.price,
        totalCost: Math.abs(txn.amount),
      };
      ledger.lots.push(lot);
      
      if (new Date(txn.activityDate).getTime() < new Date(ledger.firstBuyDate).getTime()) {
        ledger.firstBuyDate = txn.activityDate;
      }
    } else if (txn.transCode === 'Sell') {
      let remainingToSell = txn.quantity;
      const salePrice = txn.price;

      for (const lot of ledger.lots) {
        if (remainingToSell <= 0) break;
        if (lot.remainingQuantity <= 0) continue;

        const sellQty = Math.min(remainingToSell, lot.remainingQuantity);
        const costBasis = lot.pricePerShare * sellQty;
        const saleProceeds = salePrice * sellQty;
        const profit = saleProceeds - costBasis;

        ledger.realizedPL += profit;
        lot.remainingQuantity -= sellQty;
        remainingToSell -= sellQty;
      }
    }
  });

  const holdings: StockHolding[] = [];

  ledgerMap.forEach((ledger) => {
    const activeLots = ledger.lots.filter((lot) => lot.remainingQuantity > 0);
    const totalShares = activeLots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
    
    if (totalShares === 0 && ledger.realizedPL === 0) {
      return;
    }

    const totalCost = activeLots.reduce((sum, lot) => {
      const lotCostPerShare = lot.totalCost / lot.quantity;
      return sum + (lotCostPerShare * lot.remainingQuantity);
    }, 0);

    const avgCostBasis = totalShares > 0 ? totalCost / totalShares : 0;

    holdings.push({
      symbol: ledger.symbol,
      totalShares,
      avgCostBasis,
      totalCost,
      realizedPL: ledger.realizedPL,
      lots: activeLots,
      transactionIds: ledger.transactionIds,
      firstBuyDate: ledger.firstBuyDate,
      lastActivityDate: ledger.lastActivityDate,
    });
  });

  return holdings.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function getStockHoldingForSymbol(
  stockHoldings: StockHolding[], 
  symbol: string
): StockHolding | undefined {
  return stockHoldings.find((h) => h.symbol.toUpperCase() === symbol.toUpperCase());
}

export function calculateCoveredCallBreakeven(
  stockCostBasis: number,
  optionPremiumReceived: number,
  sharesPerContract: number = 100
): number {
  const premiumPerShare = optionPremiumReceived / sharesPerContract;
  return stockCostBasis - premiumPerShare;
}

/**
 * Calculate stock shares available at a specific date using FIFO accounting.
 * This is useful for determining if a short call was covered at the time it was opened.
 */
export function getSharesAtDate(
  transactions: Transaction[],
  symbol: string,
  asOfDate: string
): number {
  const asOfTime = new Date(asOfDate).getTime();
  
  // Filter to stock transactions for this symbol before the given date
  const stockTxns = transactions.filter((t) => 
    !t.option.isOption && 
    (t.transCode === 'Buy' || t.transCode === 'Sell') &&
    (t.option.symbol === symbol || t.instrument === symbol) &&
    new Date(t.activityDate).getTime() <= asOfTime
  );

  if (stockTxns.length === 0) {
    return 0;
  }

  const sortedTxns = [...stockTxns].sort((a, b) => {
    return new Date(a.activityDate).getTime() - new Date(b.activityDate).getTime();
  });

  // Build lots using FIFO
  interface SimpleLot {
    quantity: number;
    remainingQuantity: number;
  }

  const lots: SimpleLot[] = [];

  sortedTxns.forEach((txn) => {
    if (txn.transCode === 'Buy') {
      lots.push({
        quantity: txn.quantity,
        remainingQuantity: txn.quantity,
      });
    } else if (txn.transCode === 'Sell') {
      let remainingToSell = txn.quantity;

      for (const lot of lots) {
        if (remainingToSell <= 0) break;
        if (lot.remainingQuantity <= 0) continue;

        const sellQty = Math.min(remainingToSell, lot.remainingQuantity);
        lot.remainingQuantity -= sellQty;
        remainingToSell -= sellQty;
      }
    }
  });

  return lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
}
