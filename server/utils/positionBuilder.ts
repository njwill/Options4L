import type { Transaction, Position, OptionLeg, Roll, SummaryStats } from '@shared/schema';
import { randomUUID } from 'crypto';
import { classifyStrategy, createOptionLeg } from './strategyClassification';
import { detectRolls, createRollRecords } from './rollDetection';

interface OpenLeg {
  transaction: Transaction;
  remainingQuantity: number;
  legs: OptionLeg[];
}

export function buildPositions(transactions: Transaction[]): { positions: Position[], rolls: Roll[] } {
  // First, detect rolls
  const rollMatches = detectRolls(transactions);
  const rolls = createRollRecords(rollMatches);

  const optionTxns = transactions.filter((t) => t.option.isOption && t.option.expiration && t.option.strike);

  // Track open positions by option key
  const openPositions = new Map<string, OpenLeg[]>();
  const closedPositionGroups: Transaction[][] = [];

  // Process transactions in chronological order
  const sortedTxns = [...optionTxns].sort((a, b) => {
    return new Date(a.activityDate).getTime() - new Date(b.activityDate).getTime();
  });

  sortedTxns.forEach((txn) => {
    const key = `${txn.option.symbol}|${txn.option.expiration}|${txn.option.strike}|${txn.option.optionType}`;
    
    // Opening transactions (STO/BTO)
    if (txn.transCode === 'STO' || txn.transCode === 'BTO') {
      if (!openPositions.has(key)) {
        openPositions.set(key, []);
      }
      
      const legStatus = txn.transCode === 'OEXP' ? 'expired' : txn.transCode === 'OASGN' ? 'assigned' : 'open';
      
      openPositions.get(key)!.push({
        transaction: txn,
        remainingQuantity: txn.quantity,
        legs: [createOptionLeg(txn, legStatus)],
      });
    }
    
    // Closing transactions (STC/BTC) or expirations/assignments
    else if (txn.transCode === 'STC' || txn.transCode === 'BTC' || txn.transCode === 'OEXP' || txn.transCode === 'OASGN') {
      const openLegs = openPositions.get(key) || [];
      let remainingToClose = txn.quantity;
      const matchedTxns: Transaction[] = [];

      // Match with corresponding opening positions (FIFO)
      for (const openLeg of openLegs) {
        if (remainingToClose <= 0) break;
        if (openLeg.remainingQuantity <= 0) continue;

        const closeQty = Math.min(remainingToClose, openLeg.remainingQuantity);
        openLeg.remainingQuantity -= closeQty;
        remainingToClose -= closeQty;

        matchedTxns.push(openLeg.transaction);

        // If fully closed, add to closed groups
        if (openLeg.remainingQuantity === 0) {
          closedPositionGroups.push([openLeg.transaction, txn]);
        }
      }

      // Clean up fully closed positions
      openPositions.set(key, openLegs.filter((leg) => leg.remainingQuantity > 0));
      
      if (openPositions.get(key)!.length === 0) {
        openPositions.delete(key);
      }
    }
  });

  // Now build positions from open and closed groups
  const positions: Position[] = [];

  // Process closed positions
  closedPositionGroups.forEach((txns) => {
    const legs: OptionLeg[] = txns.map((txn) => {
      const isOpen = txn.transCode === 'STO' || txn.transCode === 'BTO';
      return createOptionLeg(txn, isOpen ? 'open' : 'closed');
    });

    let totalCredit = 0;
    let totalDebit = 0;

    txns.forEach((txn) => {
      if (txn.amount > 0) {
        totalCredit += txn.amount;
      } else {
        totalDebit += Math.abs(txn.amount);
      }
    });

    const netPL = totalCredit - totalDebit;
    const strategyType = classifyStrategy(legs);

    const position: Position = {
      id: randomUUID(),
      symbol: txns[0].option.symbol,
      strategyType,
      entryDate: txns[0].activityDate,
      exitDate: txns[txns.length - 1].activityDate,
      status: 'closed',
      legs,
      rolls: [],
      totalCredit,
      totalDebit,
      netPL,
      realizedPL: netPL,
      maxProfitableDebit: null,
      transactionIds: txns.map((t) => t.id),
    };

    positions.push(position);
  });

  // Process open positions
  openPositions.forEach((openLegs) => {
    if (openLegs.length === 0) return;

    const allTxns = openLegs.map((leg) => leg.transaction);
    const allLegs = openLegs.flatMap((leg) => leg.legs);

    let totalCredit = 0;
    let totalDebit = 0;

    allTxns.forEach((txn) => {
      if (txn.amount > 0) {
        totalCredit += txn.amount;
      } else {
        totalDebit += Math.abs(txn.amount);
      }
    });

    const netPL = totalCredit - totalDebit;
    const strategyType = classifyStrategy(allLegs);

    const position: Position = {
      id: randomUUID(),
      symbol: allTxns[0].option.symbol,
      strategyType,
      entryDate: allTxns[0].activityDate,
      exitDate: null,
      status: 'open',
      legs: allLegs,
      rolls: [],
      totalCredit,
      totalDebit,
      netPL,
      realizedPL: null,
      maxProfitableDebit: totalCredit,
      transactionIds: allTxns.map((t) => t.id),
    };

    positions.push(position);
  });

  // Try to identify multi-leg strategies by grouping positions with same symbol and similar entry dates
  const finalPositions = mergeMultiLegPositions(positions);

  // Assign rolls to positions
  finalPositions.forEach((position) => {
    position.rolls = rolls.filter((roll) =>
      position.transactionIds.includes(roll.fromLegId) || position.transactionIds.includes(roll.toLegId)
    );
  });

  return { positions: finalPositions, rolls };
}

function mergeMultiLegPositions(positions: Position[]): Position[] {
  // Group positions by symbol and entry date (within same day)
  const groups = new Map<string, Position[]>();

  positions.forEach((pos) => {
    const dateKey = pos.entryDate.split('T')[0] || pos.entryDate.split(' ')[0] || pos.entryDate;
    const key = `${pos.symbol}|${dateKey}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(pos);
  });

  const mergedPositions: Position[] = [];

  groups.forEach((posGroup) => {
    if (posGroup.length === 1) {
      mergedPositions.push(posGroup[0]);
      return;
    }

    // Check if these could form a multi-leg strategy
    const allLegs = posGroup.flatMap((p) => p.legs);
    const combinedStrategy = classifyStrategy(allLegs);

    // If classification identifies a multi-leg strategy, merge them
    if (
      combinedStrategy !== 'Unknown' &&
      (combinedStrategy.includes('Spread') || combinedStrategy === 'Iron Condor')
    ) {
      const merged: Position = {
        id: randomUUID(),
        symbol: posGroup[0].symbol,
        strategyType: combinedStrategy,
        entryDate: posGroup[0].entryDate,
        exitDate: posGroup.every((p) => p.status === 'closed')
          ? posGroup[posGroup.length - 1].exitDate
          : null,
        status: posGroup.every((p) => p.status === 'closed') ? 'closed' : 'open',
        legs: allLegs,
        rolls: posGroup.flatMap((p) => p.rolls),
        totalCredit: posGroup.reduce((sum, p) => sum + p.totalCredit, 0),
        totalDebit: posGroup.reduce((sum, p) => sum + p.totalDebit, 0),
        netPL: posGroup.reduce((sum, p) => sum + p.netPL, 0),
        realizedPL: posGroup.every((p) => p.status === 'closed')
          ? posGroup.reduce((sum, p) => sum + p.netPL, 0)
          : null,
        maxProfitableDebit: posGroup.every((p) => p.status === 'closed')
          ? null
          : posGroup.reduce((sum, p) => sum + p.totalCredit, 0),
        transactionIds: posGroup.flatMap((p) => p.transactionIds),
      };
      mergedPositions.push(merged);
    } else {
      // Keep as separate positions
      mergedPositions.push(...posGroup);
    }
  });

  return mergedPositions;
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
