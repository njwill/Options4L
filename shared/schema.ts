import { z } from "zod";

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
});

export type Position = z.infer<typeof positionSchema>;

// Summary statistics
export const summaryStatsSchema = z.object({
  totalPL: z.number(),
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
  summary: summaryStatsSchema,
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;
