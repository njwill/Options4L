import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import type { RawTransaction, Transaction, ParsedOption, TransCode } from '@shared/schema';

export async function parseFile(file: Buffer, filename: string): Promise<RawTransaction[]> {
  const isExcel = filename.endsWith('.xlsx');

  if (isExcel) {
    return parseExcel(file);
  } else {
    return parseCSV(file);
  }
}

function parseCSV(buffer: Buffer): Promise<RawTransaction[]> {
  return new Promise((resolve, reject) => {
    const csvString = buffer.toString('utf-8');

    Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const transactions = results.data.map((row: any) => ({
          activityDate: row['Activity Date'] || '',
          processDate: row['Process Date'] || '',
          settleDate: row['Settle Date'] || '',
          instrument: row['Instrument'] || '',
          description: row['Description'] || '',
          transCode: (row['Trans Code'] || '') as TransCode,
          quantity: row['Quantity'] || '',
          price: row['Price'] || '',
          amount: row['Amount'] || '',
        }));
        resolve(transactions);
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
}

function parseExcel(buffer: Buffer): Promise<RawTransaction[]> {
  return new Promise((resolve) => {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    const transactions = data.map((row) => ({
      activityDate: row['Activity Date'] || '',
      processDate: row['Process Date'] || '',
      settleDate: row['Settle Date'] || '',
      instrument: row['Instrument'] || '',
      description: row['Description'] || '',
      transCode: (row['Trans Code'] || '') as TransCode,
      quantity: row['Quantity'] || '',
      price: row['Price'] || '',
      amount: row['Amount'] || '',
    }));

    resolve(transactions);
  });
}

export function parseOptionDescription(description: string, instrument: string): ParsedOption {
  // Check if it's an option (contains expiration date pattern)
  const optionPattern = /(\w+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(Call|Put)\s+\$?([\d.]+)/i;
  const match = description.match(optionPattern);

  if (match) {
    const [, symbol, expiration, optionType, strike] = match;
    return {
      symbol: symbol.trim(),
      expiration,
      strike: parseFloat(strike),
      optionType: optionType as 'Call' | 'Put',
      isOption: true,
    };
  }

  // Not an option, just a regular stock/ETF transaction
  return {
    symbol: instrument,
    expiration: null,
    strike: null,
    optionType: null,
    isOption: false,
  };
}

function parseAmount(amountStr: string): number {
  if (!amountStr) return 0;
  // Remove $, commas, and parentheses
  let cleaned = amountStr.replace(/[\$,]/g, '');
  // Parentheses indicate negative (accounting format)
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1);
  }
  return parseFloat(cleaned) || 0;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  return parseFloat(priceStr.replace(/[\$,]/g, '')) || 0;
}

function parseQuantity(qtyStr: string): number {
  if (!qtyStr) return 0;
  // Strip any trailing letters (S for Short, L for Long, etc.)
  const cleaned = qtyStr.replace(/[A-Za-z]+$/, '');
  return parseFloat(cleaned) || 0;
}

export function consolidateTransactions(rawTransactions: RawTransaction[]): Transaction[] {
  const transactions: Transaction[] = rawTransactions.map((raw) => {
    const option = parseOptionDescription(raw.description, raw.instrument);
    
    return {
      id: randomUUID(),
      activityDate: raw.activityDate,
      instrument: raw.instrument,
      description: raw.description,
      transCode: raw.transCode,
      quantity: parseQuantity(raw.quantity),
      price: parsePrice(raw.price),
      amount: parseAmount(raw.amount),
      option,
      positionId: null,
      strategyTag: null,
    };
  });

  // Group by date, symbol, transCode to consolidate split transactions
  const grouped = new Map<string, Transaction[]>();

  transactions.forEach((txn) => {
    if (!txn.option.isOption) {
      return; // Don't consolidate non-option transactions
    }

    const key = `${txn.activityDate}|${txn.instrument}|${txn.option.expiration}|${txn.option.strike}|${txn.option.optionType}|${txn.transCode}`;
    
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(txn);
  });

  // Consolidate transactions with similar prices
  const consolidated: Transaction[] = [];
  const processed = new Set<string>();

  transactions.forEach((txn) => {
    if (processed.has(txn.id)) return;

    if (!txn.option.isOption) {
      consolidated.push(txn);
      processed.add(txn.id);
      return;
    }

    const key = `${txn.activityDate}|${txn.instrument}|${txn.option.expiration}|${txn.option.strike}|${txn.option.optionType}|${txn.transCode}`;
    const relatedTxns = grouped.get(key) || [txn];

    if (relatedTxns.length === 1) {
      consolidated.push(txn);
      processed.add(txn.id);
      return;
    }

    // Check if prices are within $0.02
    const prices = relatedTxns.map((t) => t.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    if (maxPrice - minPrice <= 0.02) {
      // Consolidate: weighted average price
      const totalQuantity = relatedTxns.reduce((sum, t) => sum + t.quantity, 0);
      const totalAmount = relatedTxns.reduce((sum, t) => sum + t.amount, 0);
      const avgPrice = Math.abs(totalAmount) / totalQuantity;

      const consolidatedTxn: Transaction = {
        ...txn,
        quantity: totalQuantity,
        price: avgPrice,
        amount: totalAmount,
      };

      consolidated.push(consolidatedTxn);
      relatedTxns.forEach((t) => processed.add(t.id));
    } else {
      // Don't consolidate if prices differ too much
      relatedTxns.forEach((t) => {
        if (!processed.has(t.id)) {
          consolidated.push(t);
          processed.add(t.id);
        }
      });
    }
  });

  return consolidated;
}
