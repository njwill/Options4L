import { createHash } from 'crypto';
import { db } from './db';
import { dbTransactions, uploads, type DbTransaction } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Transaction, RawTransaction } from '@shared/schema';

/**
 * Compute a hash for a transaction to use for deduplication
 */
export function computeTransactionHash(txn: RawTransaction | Transaction): string {
  // Use key fields that uniquely identify a transaction
  const key = [
    ('activityDate' in txn) ? txn.activityDate : '',
    txn.instrument,
    txn.transCode,
    ('quantity' in txn && typeof txn.quantity === 'number') ? txn.quantity.toString() : txn.quantity,
    ('price' in txn && typeof txn.price === 'number') ? txn.price.toString() : txn.price,
    ('amount' in txn && typeof txn.amount === 'number') ? txn.amount.toString() : txn.amount,
  ].join('|');
  
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Save transactions to database for authenticated user
 * Returns count of new vs duplicate transactions
 */
export async function saveTransactionsToDatabase(
  userId: string,
  uploadId: string,
  transactions: Transaction[]
): Promise<{ newCount: number; duplicateCount: number }> {
  let newCount = 0;
  let duplicateCount = 0;
  
  for (const txn of transactions) {
    const transactionHash = computeTransactionHash(txn);
    
    try {
      // Attempt to insert transaction
      await db.insert(dbTransactions).values({
        userId,
        uploadId,
        transactionHash,
        activityDate: txn.activityDate,
        processDate: '',
        settleDate: '',
        instrument: txn.instrument,
        description: txn.description,
        transCode: txn.transCode,
        quantity: txn.quantity.toString(),
        price: txn.price.toString(),
        amount: txn.amount.toString(),
        symbol: txn.option.symbol,
        expiration: txn.option.expiration,
        strike: txn.option.strike?.toString() || null,
        optionType: txn.option.optionType,
      });
      
      newCount++;
    } catch (error: any) {
      // Check if this is a duplicate key error (unique constraint violation)
      if (error.code === '23505' && error.constraint === 'user_transaction_hash_idx') {
        duplicateCount++;
      } else {
        // Re-throw other errors
        throw error;
      }
    }
  }
  
  return { newCount, duplicateCount };
}

/**
 * Load all transactions for a user from database
 */
export async function loadUserTransactions(userId: string): Promise<Transaction[]> {
  const dbTxns = await db
    .select()
    .from(dbTransactions)
    .where(eq(dbTransactions.userId, userId));
  
  // Convert database transactions to Transaction format
  return dbTxns.map((dbTxn): Transaction => ({
    id: dbTxn.id,
    activityDate: dbTxn.activityDate,
    instrument: dbTxn.instrument,
    description: dbTxn.description,
    transCode: dbTxn.transCode as any,
    quantity: parseFloat(dbTxn.quantity),
    price: parseFloat(dbTxn.price),
    amount: parseFloat(dbTxn.amount),
    option: {
      symbol: dbTxn.symbol || '',
      expiration: dbTxn.expiration || null,
      strike: dbTxn.strike ? parseFloat(dbTxn.strike) : null,
      optionType: (dbTxn.optionType as 'Call' | 'Put' | null) || null,
      isOption: !!dbTxn.symbol,
    },
    positionId: null,
    strategyTag: null,
  }));
}

/**
 * Create a new upload record for a user
 */
export async function createUploadRecord(
  userId: string,
  filename: string,
  transactionCount: number
): Promise<string> {
  const result = await db
    .insert(uploads)
    .values({
      userId,
      sourceFilename: filename,
      transactionCount,
    })
    .returning();
  
  return result[0].id;
}

/**
 * Get upload history for a user
 */
export async function getUserUploads(userId: string) {
  return await db
    .select()
    .from(uploads)
    .where(eq(uploads.userId, userId))
    .orderBy(uploads.uploadedAt);
}
