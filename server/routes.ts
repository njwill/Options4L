import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { parseFile, consolidateTransactions } from "./utils/csvParser";
import { buildPositions, calculateSummary } from "./utils/positionBuilder";
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
} from "./storage";
import { 
  insertCommentSchema, 
  updateCommentSchema,
  insertPositionCommentSchema,
  updatePositionCommentSchema,
  createManualGroupingSchema,
  deleteManualGroupingSchema,
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
          const url = `https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?apiKey=${apiKey}`;
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

  // Fetch options chain with Greeks from Massive.com (formerly Polygon.io)
  interface OptionLegRequest {
    symbol: string;
    strike: number;
    expiration: string; // Format: MM/DD/YYYY or YYYY-MM-DD
    type: 'call' | 'put';
    legId: string; // Unique identifier to match back to frontend
  }

  app.post('/api/options/chain', async (req, res) => {
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

      const { legs } = req.body as { legs: OptionLegRequest[] };
      if (!legs || !Array.isArray(legs) || legs.length === 0) {
        return res.status(400).json({ success: false, message: 'Option legs array required' });
      }

      // Group legs by underlying symbol to minimize API calls
      const symbolGroups: Record<string, OptionLegRequest[]> = {};
      for (const leg of legs) {
        if (!symbolGroups[leg.symbol]) {
          symbolGroups[leg.symbol] = [];
        }
        symbolGroups[leg.symbol].push(leg);
      }

      const uniqueSymbols = Object.keys(symbolGroups);
      
      // Limit symbols to prevent excessive API usage (5 per request for free tier - 5 calls/minute)
      const limitedSymbols = uniqueSymbols.slice(0, 5);
      const optionData: Record<string, any> = {}; // keyed by legId
      const chainCache: Record<string, any[]> = {}; // cache chains by symbol
      const errors: string[] = [];

      // Helper to normalize date format to YYYY-MM-DD for comparison
      const normalizeDate = (dateStr: string): string => {
        if (!dateStr) return '';
        // Handle MM/DD/YYYY format
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            const [month, day, year] = parts;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        }
        // Already YYYY-MM-DD
        return dateStr;
      };

      // Debug: Log requested legs
      console.log('[Greeks DEBUG] Requested legs:', JSON.stringify(legs.map(l => ({
        symbol: l.symbol,
        strike: l.strike,
        expiration: l.expiration,
        type: l.type,
        legId: l.legId
      })), null, 2));

      // Fetch options chain for each unique symbol using Massive.com API
      // Endpoint: GET /v3/snapshot/options/{underlyingAsset}
      // Response: { status: "OK", results: [ { details, greeks, last_quote, underlying_asset, ... } ] }
      for (const symbol of limitedSymbols) {
        try {
          // Massive.com API endpoint for options chain snapshot
          const url = `https://api.massive.com/v3/snapshot/options/${encodeURIComponent(symbol)}?apiKey=${apiKey}&limit=250`;
          console.log(`[Greeks DEBUG] Fetching: ${url.replace(apiKey, '***')}`);
          const response = await fetch(url);
          
          // Check HTTP status codes first (transport-level errors)
          if (response.status === 429) {
            errors.push(`Rate limit reached for ${symbol}. Massive.com free tier allows 5 calls/minute.`);
            break;
          }

          if (response.status === 401 || response.status === 403) {
            errors.push(`Invalid or expired API key. Please check your Massive.com API key in Account Settings.`);
            break;
          }
          
          const data = await response.json();
          
          // Debug: Log raw API response structure
          console.log(`[Greeks DEBUG] ${symbol} HTTP status: ${response.status}`);
          console.log(`[Greeks DEBUG] ${symbol} Response keys:`, Object.keys(data));
          console.log(`[Greeks DEBUG] ${symbol} data.status:`, data.status);
          console.log(`[Greeks DEBUG] ${symbol} results count:`, data.results?.length || 0);
          if (data.results && data.results.length > 0) {
            console.log(`[Greeks DEBUG] ${symbol} First result sample:`, JSON.stringify(data.results[0], null, 2));
          }
          
          // Handle API-level errors (status: "ERROR" in JSON body)
          if (data.status === 'ERROR' || data.status === 'NOT_FOUND' || data.error) {
            const errorMsg = data.error || data.message || 'Unknown API error';
            console.log(`[Greeks] ${symbol} error:`, errorMsg);
            errors.push(`${symbol}: ${errorMsg}`);
            // Mark all legs for this symbol as unavailable
            for (const leg of symbolGroups[symbol]) {
              optionData[leg.legId] = {
                symbol: leg.symbol,
                strike: leg.strike,
                expiration: leg.expiration,
                type: leg.type,
                error: errorMsg,
              };
            }
            continue;
          }

          // Massive.com returns options in 'results' array when status is "OK"
          const optionsChain = data.results || [];
          chainCache[symbol] = optionsChain;
          
          if (optionsChain.length === 0) {
            errors.push(`No options data found for ${symbol}`);
            for (const leg of symbolGroups[symbol]) {
              optionData[leg.legId] = {
                symbol: leg.symbol,
                strike: leg.strike,
                expiration: leg.expiration,
                type: leg.type,
                error: 'No options chain data available',
              };
            }
            continue;
          }

          // Match user's requested contracts from the chain
          const legsForSymbol = symbolGroups[symbol];
          
          for (const leg of legsForSymbol) {
            const normalizedExpiration = normalizeDate(leg.expiration);
            const legType = leg.type.toLowerCase();
            
            console.log(`[Greeks DEBUG] Looking for: exp=${normalizedExpiration}, type=${legType}, strike=${leg.strike}`);
            
            // Find matching contract in chain
            // Massive.com structure: details.strike_price, details.expiration_date, details.contract_type
            const matchedContract = optionsChain.find((contract: any) => {
              const details = contract.details || {};
              const contractExpiration = details.expiration_date || '';
              const contractType = (details.contract_type || '').toLowerCase();
              const contractStrike = parseFloat(details.strike_price) || 0;
              
              return (
                contractExpiration === normalizedExpiration &&
                contractType === legType &&
                Math.abs(contractStrike - leg.strike) < 0.01 // Float comparison tolerance
              );
            });
            
            console.log(`[Greeks DEBUG] Match result for ${leg.legId}:`, matchedContract ? 'FOUND' : 'NOT FOUND');

            if (matchedContract) {
              const details = matchedContract.details || {};
              const greeks = matchedContract.greeks || {};
              const lastQuote = matchedContract.last_quote || {};
              const lastTrade = matchedContract.last_trade || {};
              const underlyingAsset = matchedContract.underlying_asset || {};
              
              optionData[leg.legId] = {
                symbol: leg.symbol,
                strike: leg.strike,
                expiration: leg.expiration,
                type: leg.type,
                contractId: details.ticker || null,
                // Prices from last_quote
                bid: parseFloat(lastQuote.bid) || 0,
                ask: parseFloat(lastQuote.ask) || 0,
                last: parseFloat(lastTrade.price) || 0,
                mark: lastQuote.midpoint ? parseFloat(lastQuote.midpoint) : 
                      ((parseFloat(lastQuote.bid) || 0) + (parseFloat(lastQuote.ask) || 0)) / 2,
                // Greeks from Massive.com
                delta: greeks.delta !== undefined ? parseFloat(greeks.delta) : null,
                gamma: greeks.gamma !== undefined ? parseFloat(greeks.gamma) : null,
                theta: greeks.theta !== undefined ? parseFloat(greeks.theta) : null,
                vega: greeks.vega !== undefined ? parseFloat(greeks.vega) : null,
                rho: null, // Massive.com doesn't provide rho in snapshot
                impliedVolatility: matchedContract.implied_volatility !== undefined 
                  ? parseFloat(matchedContract.implied_volatility) : null,
                // Volume/Interest
                volume: matchedContract.day?.volume || 0,
                openInterest: parseInt(matchedContract.open_interest) || 0,
                // Underlying price
                underlyingPrice: parseFloat(underlyingAsset.price) || null,
                // Additional Massive.com data
                breakEvenPrice: matchedContract.break_even_price 
                  ? parseFloat(matchedContract.break_even_price) : null,
              };
            } else {
              // Contract not found in chain - might be expired or not trading
              optionData[leg.legId] = {
                symbol: leg.symbol,
                strike: leg.strike,
                expiration: leg.expiration,
                type: leg.type,
                error: 'Contract not found in options chain',
              };
            }
          }
        } catch (err) {
          errors.push(`Failed to fetch chain for ${symbol}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Track which symbols were skipped due to limit
      if (uniqueSymbols.length > limitedSymbols.length) {
        const skipped = uniqueSymbols.slice(5);
        errors.push(`Skipped ${skipped.length} symbol(s) due to API limit: ${skipped.join(', ')}`);
      }

      return res.json({
        success: true,
        optionData,
        symbolsFetched: limitedSymbols.length,
        totalSymbols: uniqueSymbols.length,
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

  const httpServer = createServer(app);
  return httpServer;
}
