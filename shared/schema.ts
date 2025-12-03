import { z } from "zod";
import { pgTable, uuid, varchar, timestamp, integer, text, numeric, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Transaction code types from Robinhood
export const TransCodeEnum = z.enum([
  'Buy',      // buy a stock
  'STO',      // sell to open an option
  'BTO',      // buy to open an option
  'INT',      // interest earned
  'CDIV',     // dividend paid
  'STC',      // sell to close an option
  'BTC',      // buy to close an option
  'GOLD',     // robinhood gold membership fee
  'OEXP',     // option expired
  'Sell',     // sell a stock
  'OASGN',    // option assigned
  'SLIP',     // stock lending earnings
  'ACATI',    // account transfer in
  'ABIP',     // account transfer in bonus
  'MINT',     // margin paid
  'ACH'       // ACH Deposit to robinhood
]);

export type TransCode = z.infer<typeof TransCodeEnum>;

// Raw transaction from CSV
export const rawTransactionSchema = z.object({
  activityDate: z.string(),
  processDate: z.string(),
  settleDate: z.string(),
  instrument: z.string(),
  description: z.string(),
  transCode: TransCodeEnum,
  quantity: z.string(),
  price: z.string(),
  amount: z.string(),
});

export type RawTransaction = z.infer<typeof rawTransactionSchema>;

// Parsed option details
export const parsedOptionSchema = z.object({
  symbol: z.string(),
  expiration: z.string().nullable(),
  strike: z.number().nullable(),
  optionType: z.enum(['Call', 'Put']).nullable(),
  isOption: z.boolean(),
});

export type ParsedOption = z.infer<typeof parsedOptionSchema>;

// Consolidated transaction
export const transactionSchema = z.object({
  id: z.string(),
  activityDate: z.string(),
  instrument: z.string(),
  description: z.string(),
  transCode: TransCodeEnum,
  quantity: z.number(),
  price: z.number(),
  amount: z.number(),
  option: parsedOptionSchema,
  positionId: z.string().nullable(),
  strategyTag: z.string().nullable(),
});

export type Transaction = z.infer<typeof transactionSchema>;

// Strategy types
export const StrategyTypeEnum = z.enum([
  'Covered Call',
  'Cash Secured Put',
  'Put Credit Spread',
  'Call Credit Spread',
  'Put Debit Spread',
  'Call Debit Spread',
  'Iron Condor',
  'Long Straddle',
  'Short Straddle',
  'Long Strangle',
  'Short Strangle',
  'Calendar Spread',
  'Diagonal Spread',
  'Long Call',
  'Long Put',
  'Short Call',
  'Short Put',
  'Long Stock',
  'Short Stock',
  'Unknown'
]);

export type StrategyType = z.infer<typeof StrategyTypeEnum>;

// Option leg (part of a multi-leg position)
export const optionLegSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  expiration: z.string(),
  strike: z.number(),
  optionType: z.enum(['Call', 'Put']),
  transCode: TransCodeEnum,
  quantity: z.number(),
  price: z.number(),
  amount: z.number(),
  activityDate: z.string(),
  transactionId: z.string(),
  status: z.enum(['open', 'closed', 'expired', 'assigned']),
});

export type OptionLeg = z.infer<typeof optionLegSchema>;

// Roll information
export const rollSchema = z.object({
  id: z.string(),
  fromLegId: z.string(),
  toLegId: z.string(),
  rollDate: z.string(),
  fromExpiration: z.string(),
  toExpiration: z.string(),
  fromStrike: z.number(),
  toStrike: z.number(),
  netCredit: z.number(),
});

export type Roll = z.infer<typeof rollSchema>;

// Roll chain segment (one hop in a roll chain)
export const rollChainSegmentSchema = z.object({
  positionId: z.string(),
  rollDate: z.string().nullable(),
  credit: z.number(), // Money received (positive magnitude)
  debit: z.number(), // Money paid (positive magnitude, stored as absolute value)
  netCredit: z.number(), // Net credit/debit for this hop (credit - debit)
  fromExpiration: z.string().nullable(),
  toExpiration: z.string(),
  fromStrike: z.number().nullable(),
  toStrike: z.number(),
});

export type RollChainSegment = z.infer<typeof rollChainSegmentSchema>;

// Roll chain metadata (aggregated across all rolls in a chain)
export const rollChainSchema = z.object({
  chainId: z.string(),
  symbol: z.string(),
  strategyType: StrategyTypeEnum,
  segments: z.array(rollChainSegmentSchema), // Ordered chronologically
  totalCredits: z.number(),
  totalDebits: z.number(),
  netPL: z.number(),
  rollCount: z.number(),
  firstEntryDate: z.string(),
  lastExitDate: z.string().nullable(),
  status: z.enum(['open', 'closed']),
});

export type RollChain = z.infer<typeof rollChainSchema>;

// Position (a complete trading position, potentially multi-leg)
export const positionSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  strategyType: StrategyTypeEnum,
  entryDate: z.string(),
  exitDate: z.string().nullable(),
  status: z.enum(['open', 'closed']),
  legs: z.array(optionLegSchema),
  rolls: z.array(rollSchema),
  totalCredit: z.number(),
  totalDebit: z.number(),
  netPL: z.number(),
  realizedPL: z.number().nullable(),
  maxProfitableDebit: z.number().nullable(), // How much debit can be taken while staying profitable
  transactionIds: z.array(z.string()),
  rollChainId: z.string().nullable(), // Links to roll chain if part of one
  rolledFromPositionId: z.string().nullable(), // Previous position in chain
  rolledToPositionId: z.string().nullable(), // Next position in chain
  isManuallyGrouped: z.boolean().optional(), // True if this position was created via manual grouping
  manualGroupId: z.string().nullable().optional(), // The groupId for manual groupings (used for ungrouping)
  originAutoGroupHash: z.string().nullable().optional(), // Hash of original auto-grouped position (for restore feature)
});

export type Position = z.infer<typeof positionSchema>;

// Stock lot (individual buy lot for FIFO tracking)
export const stockLotSchema = z.object({
  id: z.string(),
  transactionId: z.string(),
  buyDate: z.string(),
  quantity: z.number(),
  remainingQuantity: z.number(),
  pricePerShare: z.number(),
  totalCost: z.number(),
});

export type StockLot = z.infer<typeof stockLotSchema>;

// Stock holding (aggregate of all lots for a symbol)
export const stockHoldingSchema = z.object({
  symbol: z.string(),
  totalShares: z.number(),           // Current shares held
  avgCostBasis: z.number(),          // Weighted average cost per share
  totalCost: z.number(),             // Total invested amount
  realizedPL: z.number(),            // P/L from sold shares
  lots: z.array(stockLotSchema),     // Individual buy lots (for FIFO)
  transactionIds: z.array(z.string()), // All transaction IDs involved
  firstBuyDate: z.string(),
  lastActivityDate: z.string(),
});

export type StockHolding = z.infer<typeof stockHoldingSchema>;

// Summary statistics
export const summaryStatsSchema = z.object({
  totalPL: z.number(),
  realizedPL: z.number(),
  openPositionsCount: z.number(),
  closedPositionsCount: z.number(),
  totalPremiumCollected: z.number(),
  winRate: z.number(),
  totalWins: z.number(),
  totalLosses: z.number(),
});

export type SummaryStats = z.infer<typeof summaryStatsSchema>;

// File upload response
export const uploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  transactions: z.array(transactionSchema),
  positions: z.array(positionSchema),
  rollChains: z.array(rollChainSchema),
  stockHoldings: z.array(stockHoldingSchema).optional(),
  summary: summaryStatsSchema,
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;

// ============================================================================
// Database Tables (Drizzle ORM)
// ============================================================================

// Users table - stores authentication info (NOSTR pubkeys or email)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  nostrPubkey: varchar("nostr_pubkey", { length: 64 }).unique(),
  email: varchar("email", { length: 255 }),  // Unique constraint handled via partial index
  emailVerified: boolean("email_verified").default(false),
  displayName: varchar("display_name", { length: 100 }),
  alphaVantageApiKey: varchar("alpha_vantage_api_key", { length: 32 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Email verification tokens table - for magic link authentication
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  used: boolean("used").default(false),
});

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

// Uploads table - tracks each file upload
export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceFilename: varchar("source_filename", { length: 255 }).notNull(),
  transactionCount: integer("transaction_count").notNull().default(0),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export type Upload = typeof uploads.$inferSelect;
export type InsertUpload = typeof uploads.$inferInsert;

// Transactions table - stores raw transaction data with deduplication
export const dbTransactions = pgTable("transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  uploadId: uuid("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
  
  // Transaction hash for deduplication (computed from key fields)
  transactionHash: varchar("transaction_hash", { length: 64 }).notNull(),
  
  // Occurrence number for handling multiple transactions with same content
  // (e.g., two identical option trades on same day at same price)
  occurrence: integer("occurrence").notNull().default(0),
  
  // Raw transaction fields
  activityDate: varchar("activity_date", { length: 50 }).notNull(),
  processDate: varchar("process_date", { length: 50 }),
  settleDate: varchar("settle_date", { length: 50 }),
  instrument: varchar("instrument", { length: 100 }).notNull(),
  description: text("description").notNull(),
  transCode: varchar("trans_code", { length: 20 }).notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
  price: numeric("price", { precision: 18, scale: 8 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  
  // Parsed option details (nullable for non-option transactions)
  symbol: varchar("symbol", { length: 20 }),
  expiration: varchar("expiration", { length: 50 }),
  strike: numeric("strike", { precision: 18, scale: 2 }),
  optionType: varchar("option_type", { length: 10 }),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Unique constraint includes occurrence to allow multiple same-content transactions
  userTransactionHashIdx: uniqueIndex("user_transaction_hash_idx").on(table.userId, table.transactionHash, table.occurrence),
}));

export type DbTransaction = typeof dbTransactions.$inferSelect;
export type InsertDbTransaction = typeof dbTransactions.$inferInsert;

// Comments table - stores user comments on transactions (linked by hash for persistence)
export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  transactionHash: varchar("transaction_hash", { length: 64 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

// Zod schemas for comment validation
export const insertCommentSchema = z.object({
  transactionHash: z.string().min(1),
  content: z.string().min(1).max(2000),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export type InsertCommentInput = z.infer<typeof insertCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

// Position Comments table - stores user comments on positions (linked by hash for persistence)
export const positionComments = pgTable("position_comments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  positionHash: varchar("position_hash", { length: 128 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PositionComment = typeof positionComments.$inferSelect;
export type InsertPositionComment = typeof positionComments.$inferInsert;

// Zod schemas for position comment validation
export const insertPositionCommentSchema = z.object({
  positionHash: z.string().min(1),
  content: z.string().min(1).max(2000),
});

export const updatePositionCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export type InsertPositionCommentInput = z.infer<typeof insertPositionCommentSchema>;
export type UpdatePositionCommentInput = z.infer<typeof updatePositionCommentSchema>;

// Manual Position Groupings table - stores user-defined transaction groupings
// When auto-detection fails to group transactions correctly (e.g., credit spreads shown as separate trades),
// users can manually select transactions and group them as a specific strategy type
export const manualPositionGroupings = pgTable("manual_position_groupings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  groupId: varchar("group_id", { length: 64 }).notNull(), // UUID for the custom position group
  transactionHash: varchar("transaction_hash", { length: 64 }).notNull(), // Links to specific transaction
  strategyType: varchar("strategy_type", { length: 50 }).notNull(), // The strategy type chosen by user
  originAutoGroupHash: varchar("origin_auto_group_hash", { length: 64 }), // Hash of original auto-grouped position (for restore)
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Unique constraint: each transaction can only belong to one manual group per user
  userTransactionGroupIdx: uniqueIndex("user_txn_group_idx").on(table.userId, table.transactionHash),
}));

export type ManualPositionGrouping = typeof manualPositionGroupings.$inferSelect;
export type InsertManualPositionGrouping = typeof manualPositionGroupings.$inferInsert;

// Zod schemas for manual grouping validation
export const createManualGroupingSchema = z.object({
  transactionHashes: z.array(z.string().min(1)).min(2, "At least 2 transactions required"),
  strategyType: StrategyTypeEnum,
});

export const deleteManualGroupingSchema = z.object({
  groupId: z.string().min(1),
});

export type CreateManualGroupingInput = z.infer<typeof createManualGroupingSchema>;
export type DeleteManualGroupingInput = z.infer<typeof deleteManualGroupingSchema>;

// Strategy Overrides table - stores user-specified strategy reclassifications
// When auto-detection classifies incorrectly (e.g., Short Call instead of Covered Call),
// users can manually override the strategy type for a specific position
export const strategyOverrides = pgTable("strategy_overrides", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  positionHash: varchar("position_hash", { length: 128 }).notNull(), // Hash of the position
  originalStrategy: varchar("original_strategy", { length: 50 }).notNull(), // What it was classified as
  overrideStrategy: varchar("override_strategy", { length: 50 }).notNull(), // What user wants it to be
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Only one override per position per user
  userPositionIdx: uniqueIndex("user_position_override_idx").on(table.userId, table.positionHash),
}));

export type StrategyOverride = typeof strategyOverrides.$inferSelect;
export type InsertStrategyOverride = typeof strategyOverrides.$inferInsert;

// Zod schema for strategy override validation
export const createStrategyOverrideSchema = z.object({
  positionHash: z.string().min(1),
  originalStrategy: StrategyTypeEnum,
  overrideStrategy: StrategyTypeEnum,
});

export const deleteStrategyOverrideSchema = z.object({
  positionHash: z.string().min(1),
});

export type CreateStrategyOverrideInput = z.infer<typeof createStrategyOverrideSchema>;
export type DeleteStrategyOverrideInput = z.infer<typeof deleteStrategyOverrideSchema>;

// Tags table - stores user-defined custom tags for organizing positions
export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 7 }).notNull().default("#6b7280"), // Hex color, default gray
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Each user can only have one tag with a given name
  userTagNameIdx: uniqueIndex("user_tag_name_idx").on(table.userId, table.name),
}));

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

// Zod schemas for tag validation
export const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const updateTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

// Position Tags junction table - links positions to tags
export const positionTags = pgTable("position_tags", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  positionHash: varchar("position_hash", { length: 128 }).notNull(),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Each position can only have each tag once
  positionTagIdx: uniqueIndex("position_tag_idx").on(table.userId, table.positionHash, table.tagId),
}));

export type PositionTag = typeof positionTags.$inferSelect;
export type InsertPositionTag = typeof positionTags.$inferInsert;

// Zod schemas for position tag validation
export const addPositionTagSchema = z.object({
  positionHash: z.string().min(1),
  tagId: z.string().uuid(),
});

export const removePositionTagSchema = z.object({
  positionHash: z.string().min(1),
  tagId: z.string().uuid(),
});

export type AddPositionTagInput = z.infer<typeof addPositionTagSchema>;
export type RemovePositionTagInput = z.infer<typeof removePositionTagSchema>;

// AI Analysis Cache table - stores cached AI portfolio analysis reports
export const aiAnalysisCache = pgTable("ai_analysis_cache", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  analysis: text("analysis").notNull(),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

export type AiAnalysisCache = typeof aiAnalysisCache.$inferSelect;
export type InsertAiAnalysisCache = typeof aiAnalysisCache.$inferInsert;

// ============================================================================
// Chart Analysis Types (for frontend use)
// ============================================================================

export const chartTimeframeEnum = z.enum(['1D', '5D', '1M', '3M', '6M', '1Y']);
export type ChartTimeframe = z.infer<typeof chartTimeframeEnum>;

export const scenarioSchema = z.object({
  name: z.string(),
  probability: z.string(),
  entry: z.string(),
  target: z.string(),
  stopLoss: z.string(),
  rationale: z.string(),
});

export type Scenario = z.infer<typeof scenarioSchema>;

export const chartAnalysisResultSchema = z.object({
  overallBias: z.enum(['bullish', 'bearish', 'neutral']),
  biasStrength: z.enum(['strong', 'moderate', 'weak']),
  summary: z.string(),
  indicators: z.object({
    trend: z.string(),
    momentum: z.string(),
    volatility: z.string(),
    volume: z.string(),
  }),
  patterns: z.array(z.string()),
  divergences: z.array(z.string()),
  supportLevels: z.array(z.string()),
  resistanceLevels: z.array(z.string()),
  scenarios: z.array(scenarioSchema),
  keyObservations: z.array(z.string()),
  riskFactors: z.array(z.string()),
});

export type ChartAnalysisResult = z.infer<typeof chartAnalysisResultSchema>;
