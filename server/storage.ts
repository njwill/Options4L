import { createHash } from 'crypto';
import { db } from './db';
import { dbTransactions, uploads, users, type DbTransaction, type User, type UpsertUser } from '@shared/schema';
import { eq, and, count, asc, sql, max } from 'drizzle-orm';
import type { Transaction, RawTransaction } from '@shared/schema';

/**
 * Compute a content-based hash for a transaction to use for deduplication
 */
export function computeTransactionHash(txn: RawTransaction | Transaction): string {
  // Use key fields that uniquely identify a transaction
  // Include option details to distinguish different contracts with same price/qty
  const option = ('option' in txn && txn.option) ? txn.option : {};
  const key = [
    ('activityDate' in txn) ? txn.activityDate : '',
    txn.instrument,
    txn.transCode,
    txn.description || '',
    ('quantity' in txn && typeof txn.quantity === 'number') ? txn.quantity.toString() : txn.quantity,
    ('price' in txn && typeof txn.price === 'number') ? txn.price.toString() : txn.price,
    ('amount' in txn && typeof txn.amount === 'number') ? txn.amount.toString() : txn.amount,
    ('symbol' in option) ? option.symbol || '' : '',
    ('expiration' in option) ? option.expiration || '' : '',
    ('strike' in option) ? option.strike?.toString() || '' : '',
    ('optionType' in option) ? option.optionType || '' : '',
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
  
  // Pre-fetch ALL existing (hash, occurrence) pairs for this user
  // This allows us to detect exact duplicates while allowing same-content transactions
  const existingPairs = await db
    .select({
      transactionHash: dbTransactions.transactionHash,
      occurrence: dbTransactions.occurrence,
    })
    .from(dbTransactions)
    .where(eq(dbTransactions.userId, userId));
  
  // Build a Set of existing "hash:occurrence" pairs for fast lookup
  const existingSet = new Set<string>();
  for (const row of existingPairs) {
    existingSet.add(`${row.transactionHash}:${row.occurrence}`);
  }
  
  // Track local occurrence counts for this batch (for same-content transactions within file)
  const localOccurrenceCount = new Map<string, number>();
  
  for (const txn of transactions) {
    const transactionHash = computeTransactionHash(txn);
    
    // Get local count for this hash in current batch (starts at 0)
    const localCount = localOccurrenceCount.get(transactionHash) ?? 0;
    
    // The occurrence for this transaction is simply localCount
    // (0 for first, 1 for second, etc. within this file)
    const occurrence = localCount;
    
    // Check if this exact (hash, occurrence) already exists in DB
    const pairKey = `${transactionHash}:${occurrence}`;
    if (existingSet.has(pairKey)) {
      // This is a duplicate - same transaction was uploaded before
      duplicateCount++;
      // Still increment local count so next same-hash transaction gets correct occurrence
      localOccurrenceCount.set(transactionHash, localCount + 1);
      continue;
    }
    
    try {
      await db.insert(dbTransactions).values({
        userId,
        uploadId,
        transactionHash,
        occurrence,
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
      // Update local count for next same-hash transaction in this batch
      localOccurrenceCount.set(transactionHash, localCount + 1);
      // Also add to existingSet to prevent constraint errors within batch
      existingSet.add(pairKey);
      
    } catch (error: any) {
      // Check if this is a duplicate key error (unique constraint violation)
      if (error.code === '23505' && error.constraint === 'user_transaction_hash_idx') {
        duplicateCount++;
        localOccurrenceCount.set(transactionHash, localCount + 1);
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
    .where(eq(dbTransactions.userId, userId))
    .orderBy(sql`to_date(${dbTransactions.activityDate}, 'MM/DD/YYYY')`, asc(dbTransactions.id));
  
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

/**
 * Update user display name
 */
export async function updateUserDisplayName(userId: string, displayName: string) {
  const { users } = await import('@shared/schema');
  await db
    .update(users)
    .set({ displayName })
    .where(eq(users.id, userId));
}

/**
 * Delete an upload and all its associated transactions
 * Returns true if successful, false if upload not found or not owned by user
 */
export async function deleteUpload(userId: string, uploadId: string): Promise<boolean> {
  // First verify the upload belongs to this user
  const [upload] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.userId, userId)));
  
  if (!upload) {
    return false;
  }
  
  // Delete all transactions associated with this upload
  await db
    .delete(dbTransactions)
    .where(and(eq(dbTransactions.uploadId, uploadId), eq(dbTransactions.userId, userId)));
  
  // Delete the upload record
  await db
    .delete(uploads)
    .where(eq(uploads.id, uploadId));
  
  return true;
}

/**
 * Get user profile data including transaction count
 */
export async function getUserProfile(userId: string) {
  const { users } = await import('@shared/schema');
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));
  
  if (!user) {
    return null;
  }
  
  // Get transaction count using SQL COUNT()
  const [transactionCountResult] = await db
    .select({ count: count() })
    .from(dbTransactions)
    .where(eq(dbTransactions.userId, userId));
  
  // Get upload count using SQL COUNT()
  const [uploadCountResult] = await db
    .select({ count: count() })
    .from(uploads)
    .where(eq(uploads.userId, userId));
  
  return {
    ...user,
    transactionCount: Number(transactionCountResult.count),
    uploadCount: Number(uploadCountResult.count),
  };
}

// ============================================================================
// Replit Auth Storage Functions
// ============================================================================

/**
 * Upsert a user from Replit Auth
 * Creates or updates a user based on their Replit user ID
 */
export async function upsertReplitUser(userData: {
  replitUserId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}): Promise<User> {
  const displayName = userData.firstName && userData.lastName 
    ? `${userData.firstName} ${userData.lastName}`.trim()
    : userData.firstName || userData.email?.split('@')[0] || 'User';

  const [user] = await db
    .insert(users)
    .values({
      replitUserId: userData.replitUserId,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      profileImageUrl: userData.profileImageUrl,
      displayName,
      lastLoginAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.replitUserId,
      set: {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        displayName,
        updatedAt: new Date(),
        lastLoginAt: new Date(),
      },
    })
    .returning();
  
  return user;
}

/**
 * Get a user by their Replit user ID
 */
export async function getReplitUser(replitUserId: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.replitUserId, replitUserId));
  
  return user;
}
