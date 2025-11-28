import { createHash, randomBytes } from 'crypto';
import { db } from './db';
import { dbTransactions, uploads, comments, positionComments, manualPositionGroupings, users, emailVerificationTokens, type DbTransaction, type Comment, type PositionComment, type ManualPositionGrouping, type User, type EmailVerificationToken } from '@shared/schema';
import { eq, and, count, asc, desc, sql, max, inArray, lt } from 'drizzle-orm';
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
 * Get user's Alpha Vantage API key
 */
export async function getUserAlphaVantageApiKey(userId: string): Promise<string | null> {
  const { users } = await import('@shared/schema');
  const [user] = await db
    .select({ alphaVantageApiKey: users.alphaVantageApiKey })
    .from(users)
    .where(eq(users.id, userId));
  return user?.alphaVantageApiKey || null;
}

/**
 * Update user's Alpha Vantage API key
 */
export async function updateUserAlphaVantageApiKey(userId: string, apiKey: string | null) {
  const { users } = await import('@shared/schema');
  await db
    .update(users)
    .set({ alphaVantageApiKey: apiKey })
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
      inArray(comments.transactionHash, transactionHashes)
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
      inArray(positionComments.positionHash, positionHashes)
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
 * @param originAutoGroupHash - Optional hash of the original auto-grouped position (used for restore feature)
 */
export async function createManualGrouping(
  userId: string,
  transactionHashes: string[],
  strategyType: string,
  originAutoGroupHash?: string
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
      originAutoGroupHash: originAutoGroupHash || null,
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
 * Delete all manual groupings that share the same origin auto-group hash
 * Used to restore auto-grouping after a position was ungrouped
 */
export async function deleteManualGroupingsByOrigin(
  userId: string,
  originAutoGroupHash: string
): Promise<number> {
  const result = await db
    .delete(manualPositionGroupings)
    .where(and(
      eq(manualPositionGroupings.userId, userId),
      eq(manualPositionGroupings.originAutoGroupHash, originAutoGroupHash)
    ))
    .returning();
  
  return result.length;
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

// ============================================================================
// Email Authentication Functions
// ============================================================================

/**
 * Generate a secure random token for email verification
 */
function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create an email verification token
 */
export async function createEmailVerificationToken(
  email: string,
  expiresInMinutes: number = 15
): Promise<string> {
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
  
  await db.insert(emailVerificationTokens).values({
    email: email.toLowerCase(),
    token,
    expiresAt,
  });
  
  return token;
}

/**
 * Verify and consume an email verification token
 * Returns the email if valid, null if invalid/expired/used
 */
export async function verifyEmailToken(
  token: string
): Promise<string | null> {
  const [result] = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.token, token));
  
  if (!result) {
    return null;
  }
  
  if (result.used) {
    return null;
  }
  
  if (new Date() > result.expiresAt) {
    return null;
  }
  
  // Mark token as used
  await db
    .update(emailVerificationTokens)
    .set({ used: true })
    .where(eq(emailVerificationTokens.id, result.id));
  
  return result.email;
}

/**
 * Find or create a user by email
 */
export async function findOrCreateUserByEmail(
  email: string
): Promise<User> {
  const normalizedEmail = email.toLowerCase();
  
  // Check if user already exists
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail));
  
  if (existingUser) {
    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), emailVerified: true })
      .where(eq(users.id, existingUser.id));
    
    return { ...existingUser, lastLoginAt: new Date(), emailVerified: true };
  }
  
  // Create new user
  const [newUser] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      emailVerified: true,
      displayName: normalizedEmail.split('@')[0],
    })
    .returning();
  
  return newUser;
}

/**
 * Clean up expired and used tokens (housekeeping)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await db
    .delete(emailVerificationTokens)
    .where(
      sql`${emailVerificationTokens.expiresAt} < NOW() OR ${emailVerificationTokens.used} = true`
    )
    .returning();
  
  return result.length;
}

/**
 * Check rate limit for email sends (max 3 per hour per email)
 */
export async function checkEmailRateLimit(email: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const normalizedEmail = email.toLowerCase();
  
  const result = await db
    .select({ count: count() })
    .from(emailVerificationTokens)
    .where(and(
      eq(emailVerificationTokens.email, normalizedEmail),
      sql`${emailVerificationTokens.createdAt} > ${oneHourAgo}`
    ));
  
  const tokenCount = result[0]?.count ?? 0;
  return tokenCount < 3;
}

// ============================================================================
// Account Linking Functions
// ============================================================================

/**
 * Find user by NOSTR public key
 */
export async function findUserByNostrPubkey(nostrPubkey: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.nostrPubkey, nostrPubkey))
    .limit(1);
  
  return user || null;
}

/**
 * Find user by email
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const normalizedEmail = email.toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  
  return user || null;
}

/**
 * Link NOSTR pubkey to existing user
 * Returns conflict user if pubkey already belongs to another account
 */
export async function linkNostrToUser(
  userId: string,
  nostrPubkey: string
): Promise<{ success: boolean; conflictUserId?: string }> {
  // Check if this nostrPubkey already belongs to another user
  const existingUser = await findUserByNostrPubkey(nostrPubkey);
  
  if (existingUser && existingUser.id !== userId) {
    // Pubkey belongs to another account - return conflict
    return { success: false, conflictUserId: existingUser.id };
  }
  
  // Link the pubkey to the current user
  await db
    .update(users)
    .set({ nostrPubkey })
    .where(eq(users.id, userId));
  
  return { success: true };
}

/**
 * Link email to existing user
 * Returns conflict user if email already belongs to another account
 */
export async function linkEmailToUser(
  userId: string,
  email: string
): Promise<{ success: boolean; conflictUserId?: string }> {
  const normalizedEmail = email.toLowerCase();
  
  // Check if this email already belongs to another user
  const existingUser = await findUserByEmail(normalizedEmail);
  
  if (existingUser && existingUser.id !== userId) {
    // Email belongs to another account - return conflict
    return { success: false, conflictUserId: existingUser.id };
  }
  
  // Link the email to the current user
  await db
    .update(users)
    .set({ email: normalizedEmail, emailVerified: true })
    .where(eq(users.id, userId));
  
  return { success: true };
}

/**
 * Merge all data from one user account to another and delete the source account
 * Used when account linking detects a conflict and user wants to merge
 */
export async function mergeUserAccounts(
  fromUserId: string,
  toUserId: string
): Promise<{ 
  success: boolean; 
  merged: { uploads: number; transactions: number; comments: number; positionComments: number } 
}> {
  // Transfer all uploads
  const uploadResult = await db
    .update(uploads)
    .set({ userId: toUserId })
    .where(eq(uploads.userId, fromUserId))
    .returning();
  
  // Transfer all transactions
  const transactionResult = await db
    .update(dbTransactions)
    .set({ userId: toUserId })
    .where(eq(dbTransactions.userId, fromUserId))
    .returning();
  
  // Transfer all transaction comments
  const commentResult = await db
    .update(comments)
    .set({ userId: toUserId })
    .where(eq(comments.userId, fromUserId))
    .returning();
  
  // Transfer all position comments
  const positionCommentResult = await db
    .update(positionComments)
    .set({ userId: toUserId })
    .where(eq(positionComments.userId, fromUserId))
    .returning();
  
  // Transfer manual position groupings
  await db
    .update(manualPositionGroupings)
    .set({ userId: toUserId })
    .where(eq(manualPositionGroupings.userId, fromUserId));
  
  // Copy over any auth methods from the source user that target doesn't have
  const [fromUser] = await db.select().from(users).where(eq(users.id, fromUserId));
  const [toUser] = await db.select().from(users).where(eq(users.id, toUserId));
  
  if (fromUser && toUser) {
    const updates: Partial<User> = {};
    const clearFromSource: Partial<User> = {};
    
    // Copy NOSTR pubkey if target doesn't have one
    if (fromUser.nostrPubkey && !toUser.nostrPubkey) {
      updates.nostrPubkey = fromUser.nostrPubkey;
      clearFromSource.nostrPubkey = null;
    }
    
    // Copy email if target doesn't have one
    if (fromUser.email && !toUser.email) {
      updates.email = fromUser.email;
      updates.emailVerified = fromUser.emailVerified;
      clearFromSource.email = null;
      clearFromSource.emailVerified = null;
    }
    
    // Copy display name if target doesn't have one
    if (fromUser.displayName && !toUser.displayName) {
      updates.displayName = fromUser.displayName;
    }
    
    // First, clear the auth methods from source user to avoid unique constraint violations
    if (Object.keys(clearFromSource).length > 0) {
      await db.update(users).set(clearFromSource).where(eq(users.id, fromUserId));
    }
    
    // Now we can safely set them on the target user
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, toUserId));
    }
  }
  
  // Delete the source user account
  await db.delete(users).where(eq(users.id, fromUserId));
  
  return {
    success: true,
    merged: {
      uploads: uploadResult.length,
      transactions: transactionResult.length,
      comments: commentResult.length,
      positionComments: positionCommentResult.length,
    },
  };
}

/**
 * Get user by ID (for linking verification)
 */
export async function getUserByIdFromStorage(userId: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  return user || null;
}

/**
 * Unlink an authentication method from a user account
 * Requires that the user has at least one other auth method to fall back on
 */
export async function unlinkAuthMethod(
  userId: string,
  method: 'nostr' | 'email'
): Promise<{ success: boolean; error?: string; user?: User }> {
  // Get the current user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  // Check that user has at least 2 auth methods before unlinking
  const hasNostr = !!user.nostrPubkey;
  const hasEmail = !!user.email;
  const authMethodCount = (hasNostr ? 1 : 0) + (hasEmail ? 1 : 0);
  
  if (authMethodCount < 2) {
    return { 
      success: false, 
      error: 'Cannot unlink - you must keep at least one authentication method' 
    };
  }
  
  // Check that the method being unlinked actually exists
  if (method === 'nostr' && !hasNostr) {
    return { success: false, error: 'NOSTR is not linked to this account' };
  }
  if (method === 'email' && !hasEmail) {
    return { success: false, error: 'Email is not linked to this account' };
  }
  
  // Perform the unlink
  const updates: Partial<User> = {};
  if (method === 'nostr') {
    updates.nostrPubkey = null;
  } else {
    updates.email = null;
    updates.emailVerified = null;
  }
  
  const [updatedUser] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning();
  
  return { success: true, user: updatedUser };
}
