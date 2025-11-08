import type { Transaction, Position, OptionLeg, Roll, SummaryStats } from '@shared/schema';
import { randomUUID } from 'crypto';
import { classifyStrategy, createOptionLeg } from './strategyClassification';
import { detectRolls, createRollRecords } from './rollDetection';

// Lot entry for FIFO tracking
interface LotEntry {
  id: string;
  transactionId: string;
  quantity: number;
  remainingQuantity: number;
  price: number;
  amount: number;
  activityDate: string;
}

// Ledger for each unique option contract
interface LegLedger {
  legId: string;
  symbol: string;
  expiration: string;
  strike: number;
  optionType: 'Call' | 'Put';
  direction: 'long' | 'short';
  transCode: string;
  openLots: LotEntry[];
  closeLots: Array<LotEntry & { closingCode: string }>;
  totalQuantity: number;
  remainingQuantity: number;
  firstOpenDate: string;
  lastCloseDate: string | null;
}

// Position record
interface PositionRecord {
  id: string;
  symbol: string;
  strategyType: string;
  status: 'open' | 'closed';
  entryDate: string;
  exitDate: string | null;
  legs: LegLedger[];
  cashFlows: { date: string; amount: number; txnId: string }[];
  transactionIds: string[];
}

interface AnomalyRecord {
  transaction: Transaction;
  reason: string;
}

export function buildPositions(transactions: Transaction[]): { positions: Position[], rolls: Roll[] } {
  const optionTxns = transactions.filter((t) => t.option.isOption && t.option.expiration && t.option.strike);

  const sortedTxns = [...optionTxns].sort((a, b) => {
    return new Date(a.activityDate).getTime() - new Date(b.activityDate).getTime();
  });

  const openingTxns = sortedTxns.filter((t) => t.transCode === 'STO' || t.transCode === 'BTO');
  const closingTxns = sortedTxns.filter((t) => 
    t.transCode === 'STC' || t.transCode === 'BTC' || t.transCode === 'OEXP' || t.transCode === 'OASGN'
  );

  // Build leg ledgers
  const legLedgerMap = buildLegLedgers(openingTxns);

  // Match closing transactions
  const anomalies: AnomalyRecord[] = [];
  matchClosingTransactions(closingTxns, legLedgerMap, anomalies);

  // Create one position per leg initially
  const singleLegPositions = createSingleLegPositions(legLedgerMap);

  // Merge multi-leg strategies
  const mergedPositions = mergeMultiLegStrategies(singleLegPositions);

  // Convert to Position objects
  const positions = mergedPositions.map((record) => convertToPosition(record));

  // Detect rolls
  const rollMatches = detectRolls(transactions);
  const rolls = createRollRecords(rollMatches);

  // Assign rolls to positions
  positions.forEach((position) => {
    const positionLegIds = position.legs.map((leg) => leg.id);
    position.rolls = rolls.filter((roll) =>
      positionLegIds.includes(roll.fromLegId) || positionLegIds.includes(roll.toLegId)
    );
  });

  if (anomalies.length > 0) {
    console.warn(`Found ${anomalies.length} unmatched closing transactions:`, anomalies);
  }

  return { positions, rolls };
}

// Build leg ledgers from opening transactions
function buildLegLedgers(openingTxns: Transaction[]): Map<string, LegLedger> {
  const legLedgerMap = new Map<string, LegLedger>();

  openingTxns.forEach((txn) => {
    const direction = txn.transCode === 'BTO' ? 'long' : 'short';
    const legKey = `${txn.option.symbol}|${txn.option.expiration}|${txn.option.strike}|${txn.option.optionType}|${direction}`;

    console.log(`[OPEN] Key: ${legKey}, Date: ${txn.activityDate}, Qty: ${txn.quantity}, Code: ${txn.transCode}`);

    if (!legLedgerMap.has(legKey)) {
      legLedgerMap.set(legKey, {
        legId: randomUUID(),
        symbol: txn.option.symbol,
        expiration: txn.option.expiration!,
        strike: txn.option.strike!,
        optionType: txn.option.optionType!,
        direction,
        transCode: txn.transCode,
        openLots: [],
        closeLots: [],
        totalQuantity: 0,
        remainingQuantity: 0,
        firstOpenDate: txn.activityDate,
        lastCloseDate: null,
      });
    }

    const ledger = legLedgerMap.get(legKey)!;
    const lot: LotEntry = {
      id: randomUUID(),
      transactionId: txn.id,
      quantity: txn.quantity,
      remainingQuantity: txn.quantity,
      price: txn.price,
      amount: txn.amount,
      activityDate: txn.activityDate,
    };

    ledger.openLots.push(lot);
    ledger.totalQuantity += txn.quantity;
    ledger.remainingQuantity += txn.quantity;

    if (new Date(txn.activityDate).getTime() < new Date(ledger.firstOpenDate).getTime()) {
      ledger.firstOpenDate = txn.activityDate;
    }
  });

  return legLedgerMap;
}

// Match closing transactions to leg ledgers
function matchClosingTransactions(
  closingTxns: Transaction[],
  legLedgerMap: Map<string, LegLedger>,
  anomalies: AnomalyRecord[]
): void {
  closingTxns.forEach((txn) => {
    let direction: 'long' | 'short';
    
    // CRITICAL: BTC closes SHORT positions (STO), STC closes LONG positions (BTO)
    if (txn.transCode === 'BTC') {
      direction = 'short';  // BTC closes a position that was opened with STO (short)
    } else if (txn.transCode === 'STC') {
      direction = 'long';   // STC closes a position that was opened with BTO (long)
    } else {
      // OEXP or OASGN - try both directions
      const longKey = `${txn.option.symbol}|${txn.option.expiration}|${txn.option.strike}|${txn.option.optionType}|long`;
      const shortKey = `${txn.option.symbol}|${txn.option.expiration}|${txn.option.strike}|${txn.option.optionType}|short`;
      
      if (legLedgerMap.has(longKey) && legLedgerMap.get(longKey)!.remainingQuantity > 0) {
        direction = 'long';
      } else if (legLedgerMap.has(shortKey) && legLedgerMap.get(shortKey)!.remainingQuantity > 0) {
        direction = 'short';
      } else {
        anomalies.push({
          transaction: txn,
          reason: 'Cannot determine direction for expiration/assignment',
        });
        return;
      }
    }

    const legKey = `${txn.option.symbol}|${txn.option.expiration}|${txn.option.strike}|${txn.option.optionType}|${direction}`;
    const leg = legLedgerMap.get(legKey);

    console.log(`[CLOSE] Key: ${legKey}, Date: ${txn.activityDate}, Qty: ${txn.quantity}, Code: ${txn.transCode}, Found: ${!!leg}`);

    if (!leg) {
      console.log(`[CLOSE] FAILED TO MATCH. Available keys:`, Array.from(legLedgerMap.keys()).filter(k => k.startsWith(txn.option.symbol)));
      anomalies.push({
        transaction: txn,
        reason: 'No matching open leg found',
      });
      return;
    }

    // Consume lots FIFO
    let remainingToClose = txn.quantity;

    for (const openLot of leg.openLots) {
      if (remainingToClose <= 0) break;
      if (openLot.remainingQuantity <= 0) continue;

      const consumeQty = Math.min(remainingToClose, openLot.remainingQuantity);
      openLot.remainingQuantity -= consumeQty;
      remainingToClose -= consumeQty;

      const closeLot = {
        id: randomUUID(),
        transactionId: txn.id,
        quantity: consumeQty,
        remainingQuantity: 0,
        price: txn.price,
        amount: (txn.amount / txn.quantity) * consumeQty,
        activityDate: txn.activityDate,
        closingCode: txn.transCode,
      };

      leg.closeLots.push(closeLot);
    }

    leg.remainingQuantity -= txn.quantity - remainingToClose;
    leg.lastCloseDate = txn.activityDate;

    console.log(`[CLOSE] Updated leg remainingQty: ${leg.remainingQuantity}, Closed: ${leg.remainingQuantity <= 0}`);

    if (remainingToClose > 0) {
      anomalies.push({
        transaction: txn,
        reason: `Partial match: ${remainingToClose} contracts could not be matched`,
      });
    }
  });
}

// Create one position per leg ledger
function createSingleLegPositions(legLedgerMap: Map<string, LegLedger>): PositionRecord[] {
  const positions: PositionRecord[] = [];

  legLedgerMap.forEach((leg) => {
    // Calculate cash flows for this specific leg only
    const cashFlows: Array<{ date: string; amount: number; txnId: string }> = [];
    const transactionIds: string[] = [];

    leg.openLots.forEach((lot) => {
      cashFlows.push({
        date: lot.activityDate,
        amount: lot.amount,
        txnId: lot.transactionId,
      });
      transactionIds.push(lot.transactionId);
    });

    leg.closeLots.forEach((lot) => {
      cashFlows.push({
        date: lot.activityDate,
        amount: lot.amount,
        txnId: lot.transactionId,
      });
      if (!transactionIds.includes(lot.transactionId)) {
        transactionIds.push(lot.transactionId);
      }
    });

    // Create opening leg for classification
    const openingLeg: OptionLeg = {
      id: leg.legId,
      symbol: leg.symbol,
      expiration: leg.expiration,
      strike: leg.strike,
      optionType: leg.optionType,
      transCode: leg.transCode as any,
      quantity: leg.totalQuantity,
      price: leg.openLots[0]?.price || 0,
      amount: leg.openLots.reduce((sum, lot) => sum + lot.amount, 0),
      activityDate: leg.firstOpenDate,
      transactionId: leg.openLots[0]?.transactionId || '',
      status: leg.remainingQuantity > 0 ? 'open' : 'closed',
    };

    const strategyType = classifyStrategy([openingLeg]);
    const status = leg.remainingQuantity > 0 ? 'open' : 'closed';
    const exitDate = status === 'closed' ? leg.lastCloseDate : null;

    const position: PositionRecord = {
      id: randomUUID(),
      symbol: leg.symbol,
      strategyType,
      status,
      entryDate: leg.firstOpenDate,
      exitDate,
      legs: [leg],
      cashFlows,
      transactionIds,
    };

    positions.push(position);
  });

  return positions;
}

// Merge positions that form multi-leg strategies
function mergeMultiLegStrategies(positions: PositionRecord[]): PositionRecord[] {
  // Single-leg strategy types that should NOT be merged
  const singleLegStrategies = new Set([
    'Long Call',
    'Long Put',
    'Short Call',
    'Short Put',
    'Covered Call',
    'Cash Secured Put',
    'Long Stock',
    'Short Stock',
    'Unknown',
  ]);

  // Group by symbol and entry timestamp (within 5 minutes)
  const groups = new Map<string, PositionRecord[]>();

  positions.forEach((pos) => {
    const entryTime = new Date(pos.entryDate).getTime();
    const fiveMinuteBucket = Math.floor(entryTime / 300000); // 5-minute buckets
    const key = `${pos.symbol}|${fiveMinuteBucket}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(pos);
  });

  const mergedPositions: PositionRecord[] = [];

  groups.forEach((group) => {
    if (group.length === 1) {
      mergedPositions.push(group[0]);
      return;
    }

    // Try to classify as multi-leg strategy
    const allLegs = group.flatMap((p) => p.legs);
    
    // For classification, use the quantity from the FIRST opening lot
    // This represents the original trade size and works for both open and closed positions
    const openingLegs: OptionLeg[] = allLegs.map((leg) => ({
      id: leg.legId,
      symbol: leg.symbol,
      expiration: leg.expiration,
      strike: leg.strike,
      optionType: leg.optionType,
      transCode: leg.transCode as any,
      quantity: leg.openLots[0]?.quantity || 0, // Use first opening lot quantity
      price: leg.openLots[0]?.price || 0,
      amount: leg.openLots[0]?.amount || 0,
      activityDate: leg.firstOpenDate,
      transactionId: leg.openLots[0]?.transactionId || '',
      status: 'open',
    }));

    const combinedStrategy = classifyStrategy(openingLegs);

    // Merge if:
    // 1. Strategy classification succeeded (not Unknown)
    // 2. It's a multi-leg strategy (not a single-leg strategy)
    // 
    // Note: We don't check quantity matching because:
    // - Staggered fills can have different lot sizes
    // - The combination of time window + strategy classification is sufficient
    // - Over-constraining causes legitimate multi-leg strategies to fragment

    if (combinedStrategy !== 'Unknown' && 
        !singleLegStrategies.has(combinedStrategy)) {
      const merged: PositionRecord = {
        id: randomUUID(),
        symbol: group[0].symbol,
        strategyType: combinedStrategy,
        entryDate: group[0].entryDate,
        exitDate: group.every((p) => p.status === 'closed') 
          ? group[group.length - 1].exitDate 
          : null,
        status: group.every((p) => p.status === 'closed') ? 'closed' : 'open',
        legs: allLegs,
        cashFlows: group.flatMap((p) => p.cashFlows),
        transactionIds: group.flatMap((p) => p.transactionIds),
      };
      mergedPositions.push(merged);
    } else {
      // Keep as separate positions
      mergedPositions.push(...group);
    }
  });

  return mergedPositions;
}

// Convert position record to Position object
function convertToPosition(record: PositionRecord): Position {
  let totalCredit = 0;
  let totalDebit = 0;

  record.cashFlows.forEach((cf) => {
    if (cf.amount > 0) {
      totalCredit += cf.amount;
    } else {
      totalDebit += Math.abs(cf.amount);
    }
  });

  const netPL = totalCredit - totalDebit;
  const realizedPL = record.status === 'closed' ? netPL : null;
  const maxProfitableDebit = record.status === 'open' ? totalCredit : null;

  // Create display legs
  const displayLegs: OptionLeg[] = [];

  record.legs.forEach((leg) => {
    leg.openLots.forEach((lot) => {
      displayLegs.push({
        id: lot.id,
        symbol: leg.symbol,
        expiration: leg.expiration,
        strike: leg.strike,
        optionType: leg.optionType,
        transCode: leg.transCode as any,
        quantity: lot.quantity,
        price: lot.price,
        amount: lot.amount,
        activityDate: lot.activityDate,
        transactionId: lot.transactionId,
        status: lot.remainingQuantity > 0 ? 'open' : 'closed',
      });
    });

    leg.closeLots.forEach((lot) => {
      displayLegs.push({
        id: lot.id,
        symbol: leg.symbol,
        expiration: leg.expiration,
        strike: leg.strike,
        optionType: leg.optionType,
        transCode: lot.closingCode as any,
        quantity: lot.quantity,
        price: lot.price,
        amount: lot.amount,
        activityDate: lot.activityDate,
        transactionId: lot.transactionId,
        status: lot.closingCode === 'OEXP' ? 'expired' : 
                lot.closingCode === 'OASGN' ? 'assigned' : 'closed',
      });
    });
  });

  return {
    id: record.id,
    symbol: record.symbol,
    strategyType: record.strategyType,
    entryDate: record.entryDate,
    exitDate: record.exitDate,
    status: record.status,
    legs: displayLegs,
    rolls: [],
    totalCredit,
    totalDebit,
    netPL,
    realizedPL,
    maxProfitableDebit,
    transactionIds: record.transactionIds,
  };
}

export function calculateSummary(positions: Position[]): SummaryStats {
  const openPositions = positions.filter((p) => p.status === 'open');
  const closedPositions = positions.filter((p) => p.status === 'closed');

  const totalPL = positions.reduce((sum, p) => sum + p.netPL, 0);
  const totalPremiumCollected = positions.reduce((sum, p) => sum + p.totalCredit, 0);

  const wins = closedPositions.filter((p) => (p.realizedPL ?? p.netPL) > 0).length;
  const losses = closedPositions.filter((p) => (p.realizedPL ?? p.netPL) < 0).length;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;

  return {
    totalPL,
    openPositionsCount: openPositions.length,
    closedPositionsCount: closedPositions.length,
    totalPremiumCollected,
    winRate,
    totalWins: wins,
    totalLosses: losses,
  };
}
