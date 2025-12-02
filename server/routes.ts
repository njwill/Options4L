import type { Express } from "express";
import { createServer, type Server } from "http";
import { createHash } from "crypto";
import multer from "multer";
import { parseFile, consolidateTransactions } from "./utils/csvParser";
import { buildPositions, calculateSummary } from "./utils/positionBuilder";
import { buildStockHoldings } from "./utils/stockHoldingsBuilder";
import { generatePortfolioAnalysis, createJob, getJob, processAnalysisJob, type PositionForAnalysis, type PortfolioAnalysisInput } from "./aiAnalysis";
import authRoutes from "./authRoutes";
import { 
  createUploadRecord, 
  saveTransactionsToDatabase, 
  loadUserTransactions,
  getUserUploads,
  getUserProfile,
  updateUserDisplayName,
  getUserAlphaVantageApiKey,
  updateUserAlphaVantageApiKey,
  deleteUpload,
  getUserComments,
  getCommentCounts,
  createComment,
  updateComment,
  deleteComment,
  getPositionComments,
  getPositionCommentCounts,
  createPositionComment,
  updatePositionComment,
  deletePositionComment,
  computeTransactionHash,
  getManualGroupings,
  getManualGroupingsByGroupId,
  getManualGroupingsForPositionBuilder,
  createManualGrouping,
  deleteManualGrouping,
  deleteManualGroupingsByOrigin,
  getStrategyOverridesForUser,
  getStrategyOverrideByHash,
  upsertStrategyOverride,
  deleteStrategyOverride,
  getStrategyOverrideCounts,
  getUserTags,
  createTag,
  updateTag,
  deleteTag,
  addTagToPosition,
  removeTagFromPosition,
  getTagsForPosition,
  getTagsForPositions,
  getAiAnalysisCache,
  saveAiAnalysisCache,
} from "./storage";
import { 
  insertCommentSchema, 
  updateCommentSchema,
  insertPositionCommentSchema,
  updatePositionCommentSchema,
  createManualGroupingSchema,
  deleteManualGroupingSchema,
  createStrategyOverrideSchema,
  deleteStrategyOverrideSchema,
  createTagSchema,
  updateTagSchema,
  addPositionTagSchema,
} from "@shared/schema";
import "./types";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Register auth routes
  app.use('/api/auth', authRoutes);
  
  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const { buffer, originalname } = req.file;

      // Step 1: Parse the CSV/Excel file
      const rawTransactions = await parseFile(buffer, originalname);

      // Step 2: Consolidate transactions (handle split transactions with weighted averages)
      const parsedTransactions = consolidateTransactions(rawTransactions);

      // Clone parsed transactions BEFORE enrichment for session import
      // This is the canonical format that saveTransactionsToDatabase expects
      const rawTransactionsForImport = JSON.parse(JSON.stringify(parsedTransactions));

      // Clone again for enrichment so we don't mutate the canonical copy
      let transactions = JSON.parse(JSON.stringify(parsedTransactions));
      let newCount = parsedTransactions.length;
      let duplicateCount = 0;

      // Check if user is authenticated
      if (req.user) {
        // AUTHENTICATED MODE: Save to database with deduplication
        
        // Create upload record
        const uploadId = await createUploadRecord(
          req.user.id,
          originalname,
          parsedTransactions.length
        );
        
        // Save transactions to database (with deduplication)
        const saveResult = await saveTransactionsToDatabase(
          req.user.id,
          uploadId,
          parsedTransactions
        );
        
        newCount = saveResult.newCount;
        duplicateCount = saveResult.duplicateCount;
        
        // Load ALL user transactions from database for analysis
        transactions = await loadUserTransactions(req.user.id);
      }

      // Step 3: Build positions and detect rolls (works on all transactions)
      // For authenticated users, also load manual groupings to override auto-detection
      const manualGroupings = req.user 
        ? await getManualGroupingsForPositionBuilder(req.user.id)
        : [];
      const { positions, rolls, rollChains } = buildPositions(transactions, manualGroupings);

      // Step 3b: Build stock holdings from Buy/Sell transactions
      const stockHoldings = buildStockHoldings(transactions);

      // Step 4: Calculate summary statistics
      const summary = calculateSummary(positions);

      // Step 5: Update transaction strategy tags based on positions
      transactions.forEach((txn: typeof transactions[0]) => {
        const position = positions.find((p) => p.transactionIds.includes(txn.id));
        if (position) {
          txn.positionId = position.id;
          txn.strategyTag = position.strategyType;
        }
      });

      // Sort transactions by date (most recent first)
      transactions.sort((a: typeof transactions[0], b: typeof transactions[0]) => {
        const dateA = new Date(a.activityDate);
        const dateB = new Date(b.activityDate);
        return dateB.getTime() - dateA.getTime();
      });

      // Sort positions by entry date (most recent first)
      positions.sort((a, b) => {
        const dateA = new Date(a.entryDate);
        const dateB = new Date(b.entryDate);
        return dateB.getTime() - dateA.getTime();
      });

      // Build success message
      let message = `Successfully processed ${transactions.length} transactions and identified ${positions.length} positions`;
      if (req.user) {
        message = `Added ${newCount} new transactions${duplicateCount > 0 ? `, skipped ${duplicateCount} duplicates` : ''}. Total: ${transactions.length} transactions, ${positions.length} positions`;
      }

      return res.json({
        success: true,
        message,
        transactions,
        positions,
        rollChains,
        stockHoldings,
        summary,
        deduplication: req.user ? { newCount, duplicateCount, totalCount: transactions.length } : undefined,
        rawTransactions: rawTransactionsForImport, // Include unmodified parsed transactions for session import
      });

    } catch (error) {
      console.error('Upload error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to process file',
      });
    }
  });

  // Import anonymous session data after login
  app.post('/api/import-session', async (req, res) => {
    try {
      // Require authentication
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { transactions: anonymousTransactions } = req.body;

      if (!Array.isArray(anonymousTransactions) || anonymousTransactions.length === 0) {
        return res.status(400).json({ success: false, message: 'No transactions provided' });
      }

      // Frontend now sends the raw parsed transactions, so we can use them directly
      // Create upload record for this import
      const uploadId = await createUploadRecord(
        req.user.id,
        'Imported Session Data',
        anonymousTransactions.length
      );

      // Save transactions to database (with deduplication)
      const saveResult = await saveTransactionsToDatabase(
        req.user.id,
        uploadId,
        anonymousTransactions
      );

      // Load ALL user transactions from database for analysis
      const allTransactions = await loadUserTransactions(req.user.id);

      // Load manual groupings for position building
      const manualGroupings = await getManualGroupingsForPositionBuilder(req.user.id);
      
      // Build positions and detect rolls
      const { positions, rolls, rollChains } = buildPositions(allTransactions, manualGroupings);

      // Build stock holdings
      const stockHoldings = buildStockHoldings(allTransactions);

      // Calculate summary statistics
      const summary = calculateSummary(positions);

      // Update transaction strategy tags
      allTransactions.forEach((txn) => {
        const position = positions.find((p) => p.transactionIds.includes(txn.id));
        if (position) {
          txn.positionId = position.id;
          txn.strategyTag = position.strategyType;
        }
      });

      // Sort transactions and positions by date (most recent first)
      allTransactions.sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime());
      positions.sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime());

      const message = `Imported ${saveResult.newCount} new transactions${saveResult.duplicateCount > 0 ? `, skipped ${saveResult.duplicateCount} duplicates` : ''}. Total: ${allTransactions.length} transactions, ${positions.length} positions`;

      return res.json({
        success: true,
        message,
        transactions: allTransactions,
        positions,
        rollChains,
        stockHoldings,
        summary,
        deduplication: {
          newCount: saveResult.newCount,
          duplicateCount: saveResult.duplicateCount,
          totalCount: allTransactions.length,
        },
      });
    } catch (error) {
      console.error('Import session error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to import session data',
      });
    }
  });

  // Get user profile
  app.get('/api/user/profile', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const profile = await getUserProfile(req.user.id);
      if (!profile) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      return res.json({
        success: true,
        profile: {
          id: profile.id,
          nostrPubkey: profile.nostrPubkey,
          email: profile.email,
          displayName: profile.displayName,
          createdAt: profile.createdAt,
          lastLoginAt: profile.lastLoginAt,
          transactionCount: profile.transactionCount,
          uploadCount: profile.uploadCount,
        },
      });
    } catch (error) {
      console.error('Get profile error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get profile',
      });
    }
  });

  // Get user's saved data (transactions, positions, rollChains, summary)
  // Called automatically on login to restore user's dashboard
  app.get('/api/user/data', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      // Load all user transactions from database
      const transactions = await loadUserTransactions(req.user.id);

      // If no transactions, return empty state
      if (transactions.length === 0) {
        return res.json({
          success: true,
          hasData: false,
          transactions: [],
          positions: [],
          rollChains: [],
          stockHoldings: [],
          summary: {
            totalPL: 0,
            realizedPL: 0,
            openPositionsCount: 0,
            closedPositionsCount: 0,
            totalPremiumCollected: 0,
            winRate: 0,
            totalWins: 0,
            totalLosses: 0,
          },
        });
      }

      // Load manual groupings for position building
      const manualGroupings = await getManualGroupingsForPositionBuilder(req.user.id);
      
      // Build positions and detect rolls
      const { positions, rolls, rollChains } = buildPositions(transactions, manualGroupings);

      // Build stock holdings
      const stockHoldings = buildStockHoldings(transactions);

      // Calculate summary statistics
      const summary = calculateSummary(positions);

      // Update transaction strategy tags
      transactions.forEach((txn) => {
        const position = positions.find((p) => p.transactionIds.includes(txn.id));
        if (position) {
          txn.positionId = position.id;
          txn.strategyTag = position.strategyType;
        }
      });

      // Sort transactions and positions by date (most recent first)
      transactions.sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime());
      positions.sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime());

      return res.json({
        success: true,
        hasData: true,
        transactions,
        positions,
        rollChains,
        stockHoldings,
        summary,
      });
    } catch (error) {
      console.error('Get user data error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to load user data',
      });
    }
  });

  // Update user display name
  app.put('/api/user/display-name', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { displayName } = req.body;
      if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Display name required' });
      }

      if (displayName.length > 100) {
        return res.status(400).json({ success: false, message: 'Display name too long (max 100 characters)' });
      }

      await updateUserDisplayName(req.user.id, displayName.trim());

      return res.json({
        success: true,
        message: 'Display name updated successfully',
      });
    } catch (error) {
      console.error('Update display name error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update display name',
      });
    }
  });

  // Get user's Alpha Vantage API key status (not the key itself for security)
  app.get('/api/user/api-key-status', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const apiKey = await getUserAlphaVantageApiKey(req.user.id);
      
      return res.json({
        success: true,
        hasApiKey: !!apiKey,
        maskedKey: apiKey ? `${apiKey.substring(0, 4)}${'*'.repeat(apiKey.length - 4)}` : null,
      });
    } catch (error) {
      console.error('Get API key status error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get API key status',
      });
    }
  });

  // Save user's Alpha Vantage API key
  app.put('/api/user/api-key', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { apiKey } = req.body;
      
      // Allow null to clear the key
      if (apiKey !== null && (typeof apiKey !== 'string' || apiKey.trim().length === 0)) {
        return res.status(400).json({ success: false, message: 'Valid API key or null required' });
      }

      if (apiKey && apiKey.length > 32) {
        return res.status(400).json({ success: false, message: 'API key too long' });
      }

      await updateUserAlphaVantageApiKey(req.user.id, apiKey ? apiKey.trim() : null);

      return res.json({
        success: true,
        message: apiKey ? 'API key saved successfully' : 'API key removed successfully',
      });
    } catch (error) {
      console.error('Save API key error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save API key',
      });
    }
  });

  // Fetch live stock quotes from Massive.com (for underlying prices)
  app.post('/api/options/quotes', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const apiKey = await getUserAlphaVantageApiKey(req.user.id);
      if (!apiKey) {
        return res.status(400).json({ 
          success: false, 
          message: 'Massive.com API key not configured. Add your API key in Account Settings.' 
        });
      }

      const { symbols } = req.body;
      if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ success: false, message: 'Symbols array required' });
      }

      // Limit to 5 symbols per request to avoid rate limiting
      const limitedSymbols = symbols.slice(0, 5);
      const quotes: Record<string, any> = {};
      const errors: string[] = [];

      // Fetch quotes using Massive.com ticker snapshot API
      // Endpoint: GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
      // Response: { status: "OK", ticker: { ticker, day, prevDay, todaysChange, todaysChangePerc, ... } }
      for (const symbol of limitedSymbols) {
        try {
          // Use api.polygon.io domain - Massive.com rebranded from Polygon.io but keys work on both
          const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?apiKey=${apiKey}`;
          const response = await fetch(url);
          const data = await response.json();

          // Handle rate limiting (HTTP 429)
          if (response.status === 429) {
            errors.push(`Rate limit reached for ${symbol}. Massive.com free tier allows 5 calls/minute.`);
            break;
          }

          // Handle auth errors (HTTP 401/403)
          if (response.status === 401 || response.status === 403) {
            errors.push(`Invalid or expired API key. Please check your Massive.com API key.`);
            break;
          }

          // Check for API-level errors (status: "ERROR" in JSON body with HTTP 200)
          if (data.status === 'ERROR' || data.status === 'NOT_FOUND') {
            const errorMsg = data.error || data.message || `Unable to fetch data for ${symbol}`;
            errors.push(`${symbol}: ${errorMsg}`);
            continue;
          }

          // Successful response with ticker data
          if (data.status === 'OK' && data.ticker) {
            const ticker = data.ticker;
            quotes[symbol] = {
              symbol: ticker.ticker || symbol,
              price: ticker.day?.c || ticker.prevDay?.c || ticker.lastTrade?.p || 0,
              change: ticker.todaysChange || 0,
              changePercent: (ticker.todaysChangePerc || 0).toFixed(2),
              previousClose: ticker.prevDay?.c || 0,
              open: ticker.day?.o || 0,
              high: ticker.day?.h || 0,
              low: ticker.day?.l || 0,
              volume: ticker.day?.v || 0,
              latestTradingDay: ticker.updated 
                ? new Date(ticker.updated / 1000000).toISOString().split('T')[0] 
                : null,
            };
          } else {
            // Fallback: no data returned
            errors.push(`No quote data found for ${symbol}`);
          }
        } catch (err) {
          errors.push(`Failed to fetch ${symbol}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      return res.json({
        success: true,
        quotes,
        errors: errors.length > 0 ? errors : undefined,
        message: errors.length > 0 && Object.keys(quotes).length === 0 
          ? 'Failed to fetch quotes. Check your API key or try again later.' 
          : undefined,
      });
    } catch (error) {
      console.error('Fetch options quotes error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch option quotes',
      });
    }
  });

  // Fetch options prices from Yahoo Finance (free, no API key required)
  interface OptionLegRequest {
    symbol: string;
    strike: number;
    expiration: string; // Format: MM/DD/YYYY or YYYY-MM-DD
    type: 'call' | 'put';
    legId: string; // Unique identifier to match back to frontend
  }

  // Yahoo Finance crumb cache (crumbs typically last a few hours)
  let yahooCrumb: { value: string; cookies: string; timestamp: number } | null = null;
  const CRUMB_TTL = 30 * 60 * 1000; // 30 minutes

  async function getYahooCrumb(): Promise<{ crumb: string; cookies: string } | null> {
    // Return cached crumb if still valid
    if (yahooCrumb && Date.now() - yahooCrumb.timestamp < CRUMB_TTL) {
      return { crumb: yahooCrumb.value, cookies: yahooCrumb.cookies };
    }

    try {
      // Step 1: Get cookies from fc.yahoo.com
      const fcResponse = await fetch('https://fc.yahoo.com', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      
      // Get cookies from response
      const setCookies = fcResponse.headers.get('set-cookie') || '';
      
      // Step 2: Get crumb using the cookies
      const crumbResponse = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': setCookies,
        },
      });
      
      if (!crumbResponse.ok) {
        console.error('[Yahoo] Failed to get crumb:', crumbResponse.status);
        return null;
      }
      
      const crumb = await crumbResponse.text();
      if (!crumb || crumb.includes('<!DOCTYPE')) {
        console.error('[Yahoo] Invalid crumb response');
        return null;
      }
      
      // Cache the crumb
      yahooCrumb = {
        value: crumb.trim(),
        cookies: setCookies,
        timestamp: Date.now(),
      };
      
      console.log('[Yahoo] Got fresh crumb');
      return { crumb: yahooCrumb.value, cookies: yahooCrumb.cookies };
    } catch (err) {
      console.error('[Yahoo] Error getting crumb:', err);
      return null;
    }
  }

  app.post('/api/options/chain', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { legs } = req.body as { legs: OptionLegRequest[] };
      if (!legs || !Array.isArray(legs) || legs.length === 0) {
        return res.status(400).json({ success: false, message: 'Option legs array required' });
      }

      // Helper to extract date components from a date string
      // Handles: MM/DD/YYYY, MM/DD/YY, YYYY-MM-DD, ISO 8601
      const parseDateComponents = (dateStr: string): { year: number; month: number; day: number } | null => {
        if (!dateStr || typeof dateStr !== 'string') return null;
        
        let year: number, month: number, day: number;
        
        if (dateStr.includes('/')) {
          // MM/DD/YYYY or MM/DD/YY format
          const parts = dateStr.split('/');
          if (parts.length !== 3) return null;
          
          month = parseInt(parts[0], 10);
          day = parseInt(parts[1], 10);
          year = parseInt(parts[2], 10);
          
          // Validate parsed values
          if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
          
          // Handle 2-digit years (Robinhood uses MM/DD/YY)
          // Valid range: 00-99 maps to 2000-2099
          if (year >= 0 && year < 100) {
            year += 2000;
          }
          
          // Validate year is reasonable (2000-2099)
          if (year < 2000 || year > 2099) return null;
        } else if (dateStr.includes('T')) {
          // ISO 8601 format: 2024-07-19T00:00:00.000Z
          const datePart = dateStr.split('T')[0];
          const parts = datePart.split('-');
          if (parts.length !== 3) return null;
          
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
          day = parseInt(parts[2], 10);
          
          if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
        } else if (dateStr.includes('-')) {
          // YYYY-MM-DD format
          const parts = dateStr.split('-');
          if (parts.length !== 3) return null;
          
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
          day = parseInt(parts[2], 10);
          
          if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
        } else {
          return null;
        }
        
        // Final validation: check month and day ranges
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        
        return { year, month, day };
      };

      // Helper to find matching Yahoo expiration timestamp by date
      const findMatchingExpiration = (
        targetDate: { year: number; month: number; day: number },
        yahooExpirations: number[]
      ): number | null => {
        if (yahooExpirations.length === 0) return null;
        
        // Find expiration on the same calendar day (Yahoo uses ~4pm ET = 20-21:00 UTC)
        // We compare by UTC date components to match regardless of exact hour
        for (const exp of yahooExpirations) {
          const expDate = new Date(exp * 1000);
          if (expDate.getUTCFullYear() === targetDate.year &&
              expDate.getUTCMonth() === targetDate.month - 1 &&
              expDate.getUTCDate() === targetDate.day) {
            return exp;
          }
        }
        
        return null;
      };

      // Group legs by symbol
      const symbolGroups: Record<string, OptionLegRequest[]> = {};
      for (const leg of legs) {
        if (!symbolGroups[leg.symbol]) {
          symbolGroups[leg.symbol] = [];
        }
        symbolGroups[leg.symbol].push(leg);
      }

      const symbols = Object.keys(symbolGroups);
      const limitedSymbols = symbols.slice(0, 15);
      const optionData: Record<string, any> = {};
      const errors: string[] = [];

      console.log(`[Yahoo] Fetching options for ${limitedSymbols.length} symbols`);

      // Get Yahoo crumb for authentication
      const yahooAuth = await getYahooCrumb();
      if (!yahooAuth) {
        return res.status(503).json({ 
          success: false, 
          message: 'Unable to connect to Yahoo Finance. Please try again in a moment.',
        });
      }

      // Process each symbol
      for (const symbol of limitedSymbols) {
        const legsForSymbol = symbolGroups[symbol];
        
        try {
          // Step 1: Fetch available expirations for this symbol (no date param)
          const baseUrl = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
          console.log(`[Yahoo] Fetching available expirations for ${symbol}`);
          
          const baseResponse = await fetch(`${baseUrl}?crumb=${encodeURIComponent(yahooAuth.crumb)}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Cookie': yahooAuth.cookies,
            },
          });
          
          if (baseResponse.status === 429) {
            errors.push(`Rate limit reached for ${symbol}. Try again in a minute.`);
            for (const leg of legsForSymbol) {
              optionData[leg.legId] = { ...leg, error: 'Rate limited' };
            }
            continue;
          }

          if (!baseResponse.ok) {
            console.error(`[Yahoo] HTTP ${baseResponse.status} for ${symbol}`);
            for (const leg of legsForSymbol) {
              optionData[leg.legId] = { ...leg, error: `HTTP ${baseResponse.status}` };
            }
            continue;
          }
          
          const baseData = await baseResponse.json();
          const baseResult = baseData.optionChain?.result?.[0];
          const yahooExpirations: number[] = baseResult?.expirationDates || [];
          const underlyingPrice = baseResult?.quote?.regularMarketPrice || null;
          
          console.log(`[Yahoo] ${symbol} has ${yahooExpirations.length} available expirations`);
          
          // Step 2: Group legs by their target expiration and find matching Yahoo timestamps
          const expirationToLegs: Record<number, OptionLegRequest[]> = {};
          
          for (const leg of legsForSymbol) {
            const dateComponents = parseDateComponents(leg.expiration);
            if (!dateComponents) {
              optionData[leg.legId] = { ...leg, error: 'Invalid expiration date format' };
              continue;
            }
            
            const matchedExpiration = findMatchingExpiration(dateComponents, yahooExpirations);
            if (!matchedExpiration) {
              optionData[leg.legId] = { ...leg, error: 'Expiration not available - may be expired or delisted' };
              continue;
            }
            
            if (!expirationToLegs[matchedExpiration]) {
              expirationToLegs[matchedExpiration] = [];
            }
            expirationToLegs[matchedExpiration].push(leg);
          }
          
          // Step 3: Fetch options chain for each unique expiration
          for (const [expTimestamp, legsForExp] of Object.entries(expirationToLegs)) {
            const expNum = parseInt(expTimestamp);
            const url = `${baseUrl}?date=${expNum}&crumb=${encodeURIComponent(yahooAuth.crumb)}`;
            console.log(`[Yahoo] Fetching ${symbol} exp ${new Date(expNum * 1000).toISOString().split('T')[0]}`);
            
            const response = await fetch(url, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Cookie': yahooAuth.cookies,
              },
            });
            
            if (!response.ok) {
              for (const leg of legsForExp) {
                optionData[leg.legId] = { ...leg, error: `HTTP ${response.status}` };
              }
              continue;
            }
            
            const data = await response.json();
            const result = data.optionChain?.result?.[0];
            const optionsData = result?.options?.[0];
            
            if (!optionsData) {
              for (const leg of legsForExp) {
                optionData[leg.legId] = { ...leg, error: 'No options data returned' };
              }
              continue;
            }

            const calls = optionsData.calls || [];
            const puts = optionsData.puts || [];

            // Match each leg by strike and type
            for (const leg of legsForExp) {
              const legType = leg.type.toLowerCase();
              const contractList = legType === 'call' ? calls : puts;
              
              const matchedContract = contractList.find((contract: any) => {
                const contractStrike = parseFloat(contract.strike) || 0;
                return Math.abs(contractStrike - leg.strike) < 0.01;
              });

              if (matchedContract) {
                const bid = parseFloat(matchedContract.bid) || 0;
                const ask = parseFloat(matchedContract.ask) || 0;
                const last = parseFloat(matchedContract.lastPrice) || 0;
                
                // Calculate mark price with fallbacks
                let mark = 0;
                if (bid > 0 && ask > 0) {
                  mark = (bid + ask) / 2;
                } else if (last > 0) {
                  mark = last;
                } else if (ask > 0) {
                  mark = ask;
                } else if (bid > 0) {
                  mark = bid;
                }
                
                optionData[leg.legId] = {
                  symbol: leg.symbol,
                  strike: leg.strike,
                  expiration: leg.expiration,
                  type: leg.type,
                  contractId: matchedContract.contractSymbol || null,
                  bid,
                  ask,
                  last,
                  mark,
                  volume: parseInt(matchedContract.volume) || 0,
                  openInterest: parseInt(matchedContract.openInterest) || 0,
                  underlyingPrice: underlyingPrice,
                  impliedVolatility: matchedContract.impliedVolatility 
                    ? parseFloat(matchedContract.impliedVolatility) 
                    : null,
                  delta: null,
                  gamma: null,
                  theta: null,
                  vega: null,
                  rho: null,
                };
              } else {
                optionData[leg.legId] = {
                  symbol: leg.symbol,
                  strike: leg.strike,
                  expiration: leg.expiration,
                  type: leg.type,
                  error: 'Contract not found at this strike',
                };
              }
            }
          }
        } catch (err) {
          console.error(`[Yahoo] Error fetching ${symbol}:`, err);
          errors.push(`Failed to fetch ${symbol}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          for (const leg of legsForSymbol) {
            if (!optionData[leg.legId]) {
              optionData[leg.legId] = { ...leg, error: 'Failed to fetch options data' };
            }
          }
        }
      }

      // Track which symbols were skipped due to limit
      if (symbols.length > limitedSymbols.length) {
        const skipped = symbols.length - limitedSymbols.length;
        errors.push(`Skipped ${skipped} symbol(s) due to request limit`);
      }

      // Fill in any legs that weren't fetched
      for (const leg of legs) {
        if (!optionData[leg.legId]) {
          optionData[leg.legId] = {
            symbol: leg.symbol,
            strike: leg.strike,
            expiration: leg.expiration,
            type: leg.type,
            error: 'Not fetched',
          };
        }
      }

      return res.json({
        success: true,
        optionData,
        symbolsFetched: limitedSymbols.length,
        totalSymbols: symbols.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      console.error('Fetch options chain error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch options chain',
      });
    }
  });

  // Get upload history
  app.get('/api/uploads', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const uploads = await getUserUploads(req.user.id);

      return res.json({
        success: true,
        uploads,
      });
    } catch (error) {
      console.error('Get uploads error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get uploads',
      });
    }
  });

  // Delete an upload and its transactions
  app.delete('/api/uploads/:id', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const uploadId = req.params.id;
      const success = await deleteUpload(req.user.id, uploadId);

      if (!success) {
        return res.status(404).json({ 
          success: false, 
          message: 'Upload not found or you do not have permission to delete it' 
        });
      }

      return res.json({
        success: true,
        message: 'Upload and associated transactions deleted successfully',
      });
    } catch (error) {
      console.error('Delete upload error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete upload',
      });
    }
  });

  // Export user data as CSV
  app.get('/api/user/export', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const transactions = await loadUserTransactions(req.user.id);

      // Build CSV content
      const headers = 'Activity Date,Instrument,Description,Trans Code,Quantity,Price,Amount,Symbol,Expiration,Strike,Option Type\n';
      const rows = transactions.map(txn => {
        return [
          txn.activityDate,
          `"${txn.instrument}"`,
          `"${txn.description}"`,
          txn.transCode,
          txn.quantity,
          txn.price,
          txn.amount,
          txn.option.symbol || '',
          txn.option.expiration || '',
          txn.option.strike || '',
          txn.option.optionType || '',
        ].join(',');
      }).join('\n');

      const csv = headers + rows;

      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="robinhood-trades-export.csv"');
      return res.send(csv);
    } catch (error) {
      console.error('Export error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to export data',
      });
    }
  });

  // ============================================================================
  // Comments API
  // ============================================================================

  // Get comments for a transaction (by hash)
  app.get('/api/comments', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const transactionHash = req.query.transactionHash as string | undefined;
      const comments = await getUserComments(req.user.id, transactionHash);

      return res.json({
        success: true,
        comments,
      });
    } catch (error) {
      console.error('Get comments error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get comments',
      });
    }
  });

  // Get comment counts for multiple transactions (for badges)
  app.post('/api/comments/counts', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { transactionHashes } = req.body;
      if (!Array.isArray(transactionHashes)) {
        return res.status(400).json({ success: false, message: 'transactionHashes must be an array' });
      }

      const counts = await getCommentCounts(req.user.id, transactionHashes);

      // Convert Map to object for JSON response
      const countsObj: Record<string, number> = {};
      counts.forEach((count, hash) => {
        countsObj[hash] = count;
      });

      return res.json({
        success: true,
        counts: countsObj,
      });
    } catch (error) {
      console.error('Get comment counts error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get comment counts',
      });
    }
  });

  // Create a new comment
  app.post('/api/comments', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const validation = insertCommentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          success: false, 
          message: validation.error.errors[0]?.message || 'Invalid request' 
        });
      }

      const { transactionHash, content } = validation.data;
      const comment = await createComment(req.user.id, transactionHash, content);

      return res.json({
        success: true,
        comment,
      });
    } catch (error) {
      console.error('Create comment error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create comment',
      });
    }
  });

  // Update a comment
  app.put('/api/comments/:id', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const validation = updateCommentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          success: false, 
          message: validation.error.errors[0]?.message || 'Invalid request' 
        });
      }

      const commentId = req.params.id;
      const { content } = validation.data;
      const comment = await updateComment(req.user.id, commentId, content);

      if (!comment) {
        return res.status(404).json({ 
          success: false, 
          message: 'Comment not found or you do not have permission to edit it' 
        });
      }

      return res.json({
        success: true,
        comment,
      });
    } catch (error) {
      console.error('Update comment error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update comment',
      });
    }
  });

  // Delete a comment
  app.delete('/api/comments/:id', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const commentId = req.params.id;
      const success = await deleteComment(req.user.id, commentId);

      if (!success) {
        return res.status(404).json({ 
          success: false, 
          message: 'Comment not found or you do not have permission to delete it' 
        });
      }

      return res.json({
        success: true,
        message: 'Comment deleted successfully',
      });
    } catch (error) {
      console.error('Delete comment error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete comment',
      });
    }
  });

  // ============================================================================
  // Position Comments API
  // ============================================================================

  // Get position comments
  app.get('/api/position-comments', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const positionHash = req.query.positionHash as string | undefined;
      const comments = await getPositionComments(req.user.id, positionHash);

      return res.json({
        success: true,
        comments,
      });
    } catch (error) {
      console.error('Get position comments error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get position comments',
      });
    }
  });

  // Get position comment counts for multiple hashes
  app.post('/api/position-comments/counts', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { positionHashes } = req.body;
      if (!Array.isArray(positionHashes)) {
        return res.status(400).json({ success: false, message: 'positionHashes must be an array' });
      }

      const counts = await getPositionCommentCounts(req.user.id, positionHashes);

      // Convert Map to object for JSON response
      const countsObj: Record<string, number> = {};
      counts.forEach((count, hash) => {
        countsObj[hash] = count;
      });

      return res.json({
        success: true,
        counts: countsObj,
      });
    } catch (error) {
      console.error('Get position comment counts error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get position comment counts',
      });
    }
  });

  // Create a new position comment
  app.post('/api/position-comments', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const validation = insertPositionCommentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          success: false, 
          message: validation.error.errors[0]?.message || 'Invalid request' 
        });
      }

      const { positionHash, content } = validation.data;
      const comment = await createPositionComment(req.user.id, positionHash, content);

      return res.json({
        success: true,
        comment,
      });
    } catch (error) {
      console.error('Create position comment error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create position comment',
      });
    }
  });

  // Update a position comment
  app.put('/api/position-comments/:id', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const validation = updatePositionCommentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          success: false, 
          message: validation.error.errors[0]?.message || 'Invalid request' 
        });
      }

      const commentId = req.params.id;
      const { content } = validation.data;
      const comment = await updatePositionComment(req.user.id, commentId, content);

      if (!comment) {
        return res.status(404).json({ 
          success: false, 
          message: 'Comment not found or you do not have permission to edit it' 
        });
      }

      return res.json({
        success: true,
        comment,
      });
    } catch (error) {
      console.error('Update position comment error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update position comment',
      });
    }
  });

  // Delete a position comment
  app.delete('/api/position-comments/:id', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const commentId = req.params.id;
      const success = await deletePositionComment(req.user.id, commentId);

      if (!success) {
        return res.status(404).json({ 
          success: false, 
          message: 'Comment not found or you do not have permission to delete it' 
        });
      }

      return res.json({
        success: true,
        message: 'Comment deleted successfully',
      });
    } catch (error) {
      console.error('Delete position comment error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete position comment',
      });
    }
  });

  // ============================================================================
  // Manual Position Groupings API
  // ============================================================================

  // Get all manual groupings for the user
  app.get('/api/manual-groupings', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const groupings = await getManualGroupings(req.user.id);
      
      // Organize by groupId for frontend consumption
      const groupMap: Record<string, { transactionHashes: string[]; strategyType: string; createdAt: Date }> = {};
      
      for (const g of groupings) {
        if (!groupMap[g.groupId]) {
          groupMap[g.groupId] = {
            transactionHashes: [],
            strategyType: g.strategyType,
            createdAt: g.createdAt,
          };
        }
        groupMap[g.groupId].transactionHashes.push(g.transactionHash);
      }

      return res.json({
        success: true,
        groupings: groupMap,
      });
    } catch (error) {
      console.error('Get manual groupings error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get manual groupings',
      });
    }
  });

  // Create a new manual grouping
  app.post('/api/manual-groupings', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const validation = createManualGroupingSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          success: false, 
          message: validation.error.errors[0]?.message || 'Invalid request' 
        });
      }

      const { transactionHashes, strategyType } = validation.data;
      const groupId = await createManualGrouping(req.user.id, transactionHashes, strategyType);

      return res.json({
        success: true,
        groupId,
        message: `Grouped ${transactionHashes.length} transactions as ${strategyType}`,
      });
    } catch (error) {
      console.error('Create manual grouping error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create manual grouping',
      });
    }
  });

  // Delete a manual grouping
  app.delete('/api/manual-groupings/:groupId', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { groupId } = req.params;
      const success = await deleteManualGrouping(req.user.id, groupId);

      if (!success) {
        return res.status(404).json({ 
          success: false, 
          message: 'Grouping not found or you do not have permission to delete it' 
        });
      }

      return res.json({
        success: true,
        message: 'Grouping removed successfully',
      });
    } catch (error) {
      console.error('Delete manual grouping error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete manual grouping',
      });
    }
  });

  // Ungroup an auto-grouped position by creating individual manual groupings for each leg
  // This forces each leg to be treated as its own position
  app.post('/api/ungroup-position', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { legs, transactionIds } = req.body;
      
      if (!legs || !Array.isArray(legs) || legs.length < 2) {
        return res.status(400).json({ 
          success: false, 
          message: 'At least 2 legs are required to ungroup' 
        });
      }

      if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Transaction IDs are required to ungroup' 
        });
      }

      // Load all user transactions to compute hashes and get details
      const allTransactions = await loadUserTransactions(req.user.id);
      
      // Build transactionId to transaction mapping for the position's transactions
      const positionTxns = allTransactions.filter(txn => transactionIds.includes(txn.id));
      
      if (positionTxns.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Could not find transactions for this position' 
        });
      }

      // Group transactions by leg key (symbol + strike + expiration + optionType)
      // Include ALL transactions (opening and closing) for each leg
      const legGroups = new Map<string, { txns: typeof positionTxns; transCode: string; optionType: string }>();
      
      // First pass: identify leg keys from opening transactions
      for (const txn of positionTxns) {
        const option = txn.option || {};
        if (!option.strike || !option.expiration || !option.optionType) continue;
        
        const legKey = `${option.symbol || txn.instrument}|${option.strike}|${option.expiration}|${option.optionType}`;
        
        // Get the opening transCode if this is an opening transaction
        const isOpening = txn.transCode === 'STO' || txn.transCode === 'BTO';
        
        if (!legGroups.has(legKey)) {
          legGroups.set(legKey, { 
            txns: [], 
            transCode: isOpening ? txn.transCode : 'Unknown',
            optionType: option.optionType 
          });
        } else if (isOpening && legGroups.get(legKey)!.transCode === 'Unknown') {
          // Update transCode if we found the opening transaction
          legGroups.get(legKey)!.transCode = txn.transCode;
        }
        
        // Add ALL transactions (opening, closing, expired, assigned) for this leg
        legGroups.get(legKey)!.txns.push(txn);
      }

      if (legGroups.size < 2) {
        return res.status(400).json({ 
          success: false, 
          message: 'Could not identify multiple legs to ungroup. Need at least 2 distinct option legs.' 
        });
      }

      // Compute origin hash from sorted transaction IDs (for restore feature)
      const sortedTxnIds = [...transactionIds].sort();
      const originAutoGroupHash = createHash('sha256')
        .update(sortedTxnIds.join('|'))
        .digest('hex')
        .slice(0, 64);

      // Create individual manual groupings for each leg group
      const groupIds: string[] = [];
      
      for (const [legKey, group] of Array.from(legGroups.entries())) {
        // Compute hashes for this leg's transactions
        const legHashes = group.txns.map((txn: typeof positionTxns[number]) => computeTransactionHash(txn));
        
        if (legHashes.length === 0) continue;
        
        // Determine single-leg strategy type based on transCode and optionType
        let strategyType = 'Unknown';
        const isBuy = group.transCode === 'BTO';
        const isCall = group.optionType.toLowerCase() === 'call';
        
        if (isBuy && isCall) strategyType = 'Long Call';
        else if (isBuy && !isCall) strategyType = 'Long Put';
        else if (!isBuy && isCall) strategyType = 'Short Call';
        else if (!isBuy && !isCall) strategyType = 'Short Put';
        
        // Pass origin hash so this grouping can be restored later
        const groupId = await createManualGrouping(req.user.id, legHashes, strategyType, originAutoGroupHash);
        groupIds.push(groupId);
      }

      if (groupIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No valid legs found to ungroup' 
        });
      }

      return res.json({
        success: true,
        groupIds,
        originAutoGroupHash, // Return so frontend can track for restore
        message: `Position ungrouped into ${groupIds.length} separate legs`,
      });
    } catch (error) {
      console.error('Ungroup position error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to ungroup position',
      });
    }
  });

  // Restore auto-grouping by deleting manual groupings that were created from an ungroup operation
  app.post('/api/restore-auto-grouping', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { originAutoGroupHash } = req.body;
      
      if (!originAutoGroupHash || typeof originAutoGroupHash !== 'string') {
        return res.status(400).json({ 
          success: false, 
          message: 'Origin auto-group hash is required' 
        });
      }

      const deletedCount = await deleteManualGroupingsByOrigin(req.user.id, originAutoGroupHash);
      
      if (deletedCount === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'No groupings found with this origin hash. The position may have already been restored or was not created from an ungroup operation.' 
        });
      }

      return res.json({
        success: true,
        deletedCount,
        message: `Restored auto-grouping by removing ${deletedCount} manual grouping(s)`,
      });
    } catch (error) {
      console.error('Restore auto-grouping error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to restore auto-grouping',
      });
    }
  });

  // ============================================================================
  // Strategy Override API
  // ============================================================================

  // Get all strategy overrides for the user
  app.get('/api/strategy-overrides', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const overrides = await getStrategyOverridesForUser(req.user.id);

      return res.json({
        success: true,
        overrides,
      });
    } catch (error) {
      console.error('Get strategy overrides error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get strategy overrides',
      });
    }
  });

  // Get strategy override counts for multiple position hashes
  app.post('/api/strategy-overrides/lookup', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { positionHashes } = req.body;
      if (!Array.isArray(positionHashes)) {
        return res.status(400).json({ success: false, message: 'positionHashes must be an array' });
      }

      const overrides = await getStrategyOverrideCounts(req.user.id, positionHashes);

      return res.json({
        success: true,
        overrides,
      });
    } catch (error) {
      console.error('Get strategy override lookup error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to lookup strategy overrides',
      });
    }
  });

  // Create or update a strategy override
  app.post('/api/strategy-overrides', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const validation = createStrategyOverrideSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          success: false, 
          message: validation.error.errors[0]?.message || 'Invalid request' 
        });
      }

      const { positionHash, originalStrategy, overrideStrategy } = validation.data;
      const override = await upsertStrategyOverride(
        req.user.id,
        positionHash,
        originalStrategy,
        overrideStrategy
      );

      return res.json({
        success: true,
        override,
        message: `Strategy updated to ${overrideStrategy}`,
      });
    } catch (error) {
      console.error('Create strategy override error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create strategy override',
      });
    }
  });

  // Delete a strategy override (revert to auto-detected strategy)
  app.delete('/api/strategy-overrides/:positionHash', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { positionHash } = req.params;
      const success = await deleteStrategyOverride(req.user.id, positionHash);

      if (!success) {
        return res.status(404).json({ 
          success: false, 
          message: 'Strategy override not found or you do not have permission to delete it' 
        });
      }

      return res.json({
        success: true,
        message: 'Strategy reverted to auto-detected classification',
      });
    } catch (error) {
      console.error('Delete strategy override error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete strategy override',
      });
    }
  });

  // ========== Tag Routes ==========

  // Get all tags for the authenticated user
  app.get('/api/tags', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const userTags = await getUserTags(req.user.id);
      return res.json({ success: true, tags: userTags });
    } catch (error) {
      console.error('Get tags error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get tags',
      });
    }
  });

  // Create a new tag
  app.post('/api/tags', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const validation = createTagSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: validation.error.errors[0]?.message || 'Invalid request',
        });
      }

      const { name, color } = validation.data;
      const tag = await createTag(req.user.id, name, color);

      return res.json({ success: true, tag });
    } catch (error: any) {
      console.error('Create tag error:', error);
      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          message: 'A tag with this name already exists',
        });
      }
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create tag',
      });
    }
  });

  // Update a tag
  app.patch('/api/tags/:tagId', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { tagId } = req.params;
      const validation = updateTagSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: validation.error.errors[0]?.message || 'Invalid request',
        });
      }

      const updated = await updateTag(req.user.id, tagId, validation.data);
      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Tag not found or you do not have permission to update it',
        });
      }

      return res.json({ success: true, tag: updated });
    } catch (error: any) {
      console.error('Update tag error:', error);
      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          message: 'A tag with this name already exists',
        });
      }
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update tag',
      });
    }
  });

  // Delete a tag
  app.delete('/api/tags/:tagId', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { tagId } = req.params;
      const success = await deleteTag(req.user.id, tagId);

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Tag not found or you do not have permission to delete it',
        });
      }

      return res.json({ success: true, message: 'Tag deleted' });
    } catch (error) {
      console.error('Delete tag error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete tag',
      });
    }
  });

  // ========== Position Tag Routes ==========

  // Add a tag to a position
  app.post('/api/position-tags', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const validation = addPositionTagSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: validation.error.errors[0]?.message || 'Invalid request',
        });
      }

      const { positionHash, tagId } = validation.data;
      const positionTag = await addTagToPosition(req.user.id, positionHash, tagId);

      if (!positionTag) {
        return res.status(404).json({
          success: false,
          message: 'Tag not found or you do not have permission to use it',
        });
      }

      return res.json({ success: true, positionTag });
    } catch (error) {
      console.error('Add position tag error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add tag to position',
      });
    }
  });

  // Remove a tag from a position
  app.delete('/api/position-tags/:positionHash/:tagId', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { positionHash, tagId } = req.params;
      const success = await removeTagFromPosition(req.user.id, positionHash, tagId);

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Position tag not found or you do not have permission to remove it',
        });
      }

      return res.json({ success: true, message: 'Tag removed from position' });
    } catch (error) {
      console.error('Remove position tag error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove tag from position',
      });
    }
  });

  // Get tags for a specific position
  app.get('/api/position-tags/:positionHash', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { positionHash } = req.params;
      const positionTagsList = await getTagsForPosition(req.user.id, positionHash);

      return res.json({ success: true, tags: positionTagsList });
    } catch (error) {
      console.error('Get position tags error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get position tags',
      });
    }
  });

  // Bulk lookup: Get tags for multiple positions
  app.post('/api/position-tags/lookup', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { positionHashes } = req.body;
      if (!Array.isArray(positionHashes)) {
        return res.status(400).json({
          success: false,
          message: 'positionHashes must be an array',
        });
      }

      const tagsMap = await getTagsForPositions(req.user.id, positionHashes);
      return res.json({ success: true, tagsByPosition: tagsMap });
    } catch (error) {
      console.error('Lookup position tags error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to lookup position tags',
      });
    }
  });

  // AI Portfolio Analysis endpoint
  app.post('/api/ai/analyze-portfolio', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { positions, summary, stockHoldings, liveDataMap } = req.body;

      if (!positions || !Array.isArray(positions)) {
        return res.status(400).json({ success: false, message: 'Positions array required' });
      }

      if (!summary) {
        return res.status(400).json({ success: false, message: 'Summary data required' });
      }

      // Transform positions with live data for analysis
      const openPositions: PositionForAnalysis[] = [];
      const closedPositions: PositionForAnalysis[] = [];

      for (const pos of positions) {
        const liveData = liveDataMap?.[pos.id];
        
        const analysisPos: PositionForAnalysis = {
          id: pos.id,
          symbol: pos.symbol,
          strategyType: pos.strategyType || 'Unknown',
          status: pos.status,
          netPL: pos.netPL || 0,
          entryDate: pos.entryDate,
          exitDate: pos.exitDate,
          legs: (pos.legs || []).map((leg: any) => ({
            strike: leg.strike,
            expiration: leg.expiration,
            optionType: (leg.optionType || 'call').toLowerCase() as 'call' | 'put',
            quantity: leg.quantity || 1,
            transCode: leg.transCode || 'BTO',
            premium: leg.premium,
          })),
        };

        // Add live data if available
        if (liveData && pos.status === 'open') {
          analysisPos.liveData = {
            underlyingPrice: liveData.underlyingPrice || 0,
            livePL: liveData.livePL ?? pos.netPL,
            legs: (liveData.legs || []).map((leg: any) => ({
              strike: leg.strike,
              expiration: leg.expiration,
              optionType: leg.optionType || 'call',
              bid: leg.bid,
              ask: leg.ask,
              mark: leg.mark,
              impliedVolatility: leg.impliedVolatility,
              greeks: leg.greeks ? {
                delta: leg.greeks.delta,
                gamma: leg.greeks.gamma,
                theta: leg.greeks.theta,
                vega: leg.greeks.vega,
              } : undefined,
            })),
            positionGreeks: liveData.positionGreeks ? {
              totalDelta: liveData.positionGreeks.totalDelta,
              totalGamma: liveData.positionGreeks.totalGamma,
              totalTheta: liveData.positionGreeks.totalTheta,
              totalVega: liveData.positionGreeks.totalVega,
            } : undefined,
          };
        }

        if (pos.status === 'open') {
          openPositions.push(analysisPos);
        } else {
          closedPositions.push(analysisPos);
        }
      }

      // Sort closed positions by exit date (most recent first)
      closedPositions.sort((a, b) => {
        if (!a.exitDate) return 1;
        if (!b.exitDate) return -1;
        return new Date(b.exitDate).getTime() - new Date(a.exitDate).getTime();
      });

      const analysisInput: PortfolioAnalysisInput = {
        openPositions,
        closedPositions,
        summary: {
          totalPL: summary.totalPL || 0,
          realizedPL: summary.realizedPL || 0,
          openPositionsCount: summary.openPositionsCount || openPositions.length,
          closedPositionsCount: summary.closedPositionsCount || closedPositions.length,
          winRate: summary.winRate || 0,
          totalWins: summary.totalWins || 0,
          totalLosses: summary.totalLosses || 0,
        },
        stockHoldings: stockHoldings?.map((h: any) => ({
          symbol: h.symbol,
          quantity: h.quantity,
          averageCost: h.averageCost,
          currentPrice: h.currentPrice,
        })),
      };

      console.log(`[AI Analysis] Creating job for user ${req.user.id} with ${openPositions.length} open positions`);
      
      // Create job and return immediately
      const job = createJob(req.user.id);
      const userId = req.user.id;
      
      // Start processing in background with cache callback (fire-and-forget)
      processAnalysisJob(job.id, analysisInput, async (result: string) => {
        // Save to cache immediately upon completion
        await saveAiAnalysisCache(userId, result);
      }).catch(err => {
        console.error(`[AI Analysis] Background processing failed for job ${job.id}:`, err);
      });

      // Return 202 Accepted with job ID for polling
      return res.status(202).json({
        success: true,
        jobId: job.id,
        status: 'queued',
        message: 'Analysis job created. Poll /api/ai/job/:jobId for results.',
      });
    } catch (error) {
      console.error('AI Portfolio Analysis error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create analysis job',
      });
    }
  });

  // Job status polling endpoint
  app.get('/api/ai/job/:jobId', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { jobId } = req.params;
      const job = getJob(jobId, req.user.id);

      if (!job) {
        return res.status(404).json({ success: false, message: 'Job not found' });
      }

      // Return job status and result if completed
      const response: any = {
        success: true,
        jobId: job.id,
        status: job.status,
        createdAt: job.createdAt.toISOString(),
      };

      if (job.status === 'completed') {
        response.analysis = job.result;
        response.completedAt = job.completedAt?.toISOString();
      } else if (job.status === 'failed') {
        response.error = job.error;
        response.completedAt = job.completedAt?.toISOString();
      }

      return res.json(response);
    } catch (error) {
      console.error('Job status check error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to check job status',
      });
    }
  });

  // Get cached AI analysis
  app.get('/api/ai/cached-analysis', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const cached = await getAiAnalysisCache(req.user.id);
      
      if (!cached) {
        return res.json({ 
          success: true, 
          hasCachedAnalysis: false,
          analysis: null,
          generatedAt: null,
        });
      }

      return res.json({
        success: true,
        hasCachedAnalysis: true,
        analysis: cached.analysis,
        generatedAt: cached.generatedAt.toISOString(),
      });
    } catch (error) {
      console.error('Get cached analysis error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get cached analysis',
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
