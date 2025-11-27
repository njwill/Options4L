import { createHash } from 'crypto';
import { db } from './db';
import { dbTransactions, uploads, comments, positionComments, manualPositionGroupings, type DbTransaction, type Comment, type PositionComment, type ManualPositionGrouping } from '@shared/schema';
import { eq, and, count, asc, desc, sql, max } from 'drizzle-orm';
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
// Comment CRUD Operations
// ============================================================================

/**
 * Get all comments for a user, optionally filtered by transaction hash
 */
export async function getUserComments(
  userId: string,
  transactionHash?: string
): Promise<Comment[]> {
  if (transactionHash) {
    return await db
      .select()
      .from(comments)
      .where(and(eq(comments.userId, userId), eq(comments.transactionHash, transactionHash)))
      .orderBy(desc(comments.createdAt));
  }
  
  return await db
    .select()
    .from(comments)
    .where(eq(comments.userId, userId))
    .orderBy(desc(comments.createdAt));
}

/**
 * Get comment counts for multiple transaction hashes (for displaying badges)
 */
export async function getCommentCounts(
  userId: string,
  transactionHashes: string[]
): Promise<Map<string, number>> {
  if (transactionHashes.length === 0) {
    return new Map();
  }
  
  const results = await db
    .select({
      transactionHash: comments.transactionHash,
      count: count(),
    })
    .from(comments)
    .where(and(
      eq(comments.userId, userId),
      sql`${comments.transactionHash} = ANY(${transactionHashes})`
    ))
    .groupBy(comments.transactionHash);
  
  const countMap = new Map<string, number>();
  for (const row of results) {
    countMap.set(row.transactionHash, Number(row.count));
  }
  return countMap;
}

/**
 * Create a new comment
 */
export async function createComment(
  userId: string,
  transactionHash: string,
  content: string
): Promise<Comment> {
  const [comment] = await db
    .insert(comments)
    .values({
      userId,
      transactionHash,
      content,
    })
    .returning();
  
  return comment;
}

/**
 * Update a comment (only if owned by user)
 */
export async function updateComment(
  userId: string,
  commentId: string,
  content: string
): Promise<Comment | null> {
  const [updated] = await db
    .update(comments)
    .set({
      content,
      updatedAt: new Date(),
    })
    .where(and(eq(comments.id, commentId), eq(comments.userId, userId)))
    .returning();
  
  return updated || null;
}

/**
 * Delete a comment (only if owned by user)
 */
export async function deleteComment(
  userId: string,
  commentId: string
): Promise<boolean> {
  const result = await db
    .delete(comments)
    .where(and(eq(comments.id, commentId), eq(comments.userId, userId)))
    .returning();
  
  return result.length > 0;
}

// ============================================================================
// Position Comments
// ============================================================================

/**
 * Get position comments for a user, optionally filtered by position hash
 */
export async function getPositionComments(
  userId: string,
  positionHash?: string
): Promise<PositionComment[]> {
  if (positionHash) {
    return await db
      .select()
      .from(positionComments)
      .where(and(
        eq(positionComments.userId, userId),
        eq(positionComments.positionHash, positionHash)
      ))
      .orderBy(desc(positionComments.createdAt));
  }
  
  return await db
    .select()
    .from(positionComments)
    .where(eq(positionComments.userId, userId))
    .orderBy(desc(positionComments.createdAt));
}

/**
 * Get position comment counts for multiple position hashes (for displaying badges)
 */
export async function getPositionCommentCounts(
  userId: string,
  positionHashes: string[]
): Promise<Map<string, number>> {
  if (positionHashes.length === 0) {
    return new Map();
  }
  
  const results = await db
    .select({
      positionHash: positionComments.positionHash,
      count: count(),
    })
    .from(positionComments)
    .where(and(
      eq(positionComments.userId, userId),
      sql`${positionComments.positionHash} = ANY(${positionHashes})`
    ))
    .groupBy(positionComments.positionHash);
  
  const countMap = new Map<string, number>();
  for (const row of results) {
    countMap.set(row.positionHash, Number(row.count));
  }
  return countMap;
}

/**
 * Create a new position comment
 */
export async function createPositionComment(
  userId: string,
  positionHash: string,
  content: string
): Promise<PositionComment> {
  const [comment] = await db
    .insert(positionComments)
    .values({
      userId,
      positionHash,
      content,
    })
    .returning();
  
  return comment;
}

/**
 * Update a position comment (only if owned by user)
 */
export async function updatePositionComment(
  userId: string,
  commentId: string,
  content: string
): Promise<PositionComment | null> {
  const [updated] = await db
    .update(positionComments)
    .set({
      content,
      updatedAt: new Date(),
    })
    .where(and(eq(positionComments.id, commentId), eq(positionComments.userId, userId)))
    .returning();
  
  return updated || null;
}

/**
 * Delete a position comment (only if owned by user)
 */
export async function deletePositionComment(
  userId: string,
  commentId: string
): Promise<boolean> {
  const result = await db
    .delete(positionComments)
    .where(and(eq(positionComments.id, commentId), eq(positionComments.userId, userId)))
    .returning();
  
  return result.length > 0;
}

// ============================================================================
// Manual Position Groupings
// ============================================================================

/**
 * Get all manual position groupings for a user
 * Returns groupings organized by groupId for easy access
 */
export async function getManualGroupings(userId: string): Promise<ManualPositionGrouping[]> {
  return await db
    .select()
    .from(manualPositionGroupings)
    .where(eq(manualPositionGroupings.userId, userId))
    .orderBy(desc(manualPositionGroupings.createdAt));
}

/**
 * Get manual groupings organized by groupId
 * Returns a Map where key is groupId and value is array of transaction hashes
 */
export async function getManualGroupingsByGroupId(
  userId: string
): Promise<Map<string, { transactionHashes: string[]; strategyType: string }>> {
  const groupings = await getManualGroupings(userId);
  
  const result = new Map<string, { transactionHashes: string[]; strategyType: string }>();
  
  for (const g of groupings) {
    const existing = result.get(g.groupId);
    if (existing) {
      existing.transactionHashes.push(g.transactionHash);
    } else {
      result.set(g.groupId, {
        transactionHashes: [g.transactionHash],
        strategyType: g.strategyType,
      });
    }
  }
  
  return result;
}

/**
 * Get manual groupings in the format expected by positionBuilder
 * Returns an array of { groupId, transactionHashes, strategyType }
 */
export async function getManualGroupingsForPositionBuilder(
  userId: string
): Promise<Array<{ groupId: string; transactionHashes: string[]; strategyType: string }>> {
  const groupingsMap = await getManualGroupingsByGroupId(userId);
  
  const result: Array<{ groupId: string; transactionHashes: string[]; strategyType: string }> = [];
  
  groupingsMap.forEach((value, groupId) => {
    result.push({
      groupId,
      transactionHashes: value.transactionHashes,
      strategyType: value.strategyType,
    });
  });
  
  return result;
}

/**
 * Create a manual position grouping (group multiple transactions together)
 * All transactions in the group share the same groupId
 */
export async function createManualGrouping(
  userId: string,
  transactionHashes: string[],
  strategyType: string
): Promise<string> {
  // Generate a new groupId for this grouping
  const groupId = createHash('sha256')
    .update(`${userId}-${Date.now()}-${Math.random()}`)
    .digest('hex')
    .slice(0, 64);
  
  // First, remove any existing groupings for these transaction hashes
  // (a transaction can only be in one group at a time)
  for (const hash of transactionHashes) {
    await db
      .delete(manualPositionGroupings)
      .where(and(
        eq(manualPositionGroupings.userId, userId),
        eq(manualPositionGroupings.transactionHash, hash)
      ));
  }
  
  // Insert new groupings
  for (const transactionHash of transactionHashes) {
    await db.insert(manualPositionGroupings).values({
      userId,
      groupId,
      transactionHash,
      strategyType,
    });
  }
  
  return groupId;
}

/**
 * Delete a manual grouping by groupId (removes all transactions from the group)
 */
export async function deleteManualGrouping(
  userId: string,
  groupId: string
): Promise<boolean> {
  const result = await db
    .delete(manualPositionGroupings)
    .where(and(
      eq(manualPositionGroupings.userId, userId),
      eq(manualPositionGroupings.groupId, groupId)
    ))
    .returning();
  
  return result.length > 0;
}

/**
 * Check if a transaction is part of a manual grouping
 */
export async function isTransactionGrouped(
  userId: string,
  transactionHash: string
): Promise<{ grouped: boolean; groupId: string | null; strategyType: string | null }> {
  const [result] = await db
    .select()
    .from(manualPositionGroupings)
    .where(and(
      eq(manualPositionGroupings.userId, userId),
      eq(manualPositionGroupings.transactionHash, transactionHash)
    ));
  
  if (result) {
    return {
      grouped: true,
      groupId: result.groupId,
      strategyType: result.strategyType,
    };
  }
  
  return { grouped: false, groupId: null, strategyType: null };
}
