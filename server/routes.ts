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
  deleteUpload,
} from "./storage";
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
      const { positions, rolls, rollChains } = buildPositions(transactions);

      // Step 4: Calculate summary statistics
      const summary = calculateSummary(positions);

      // Step 5: Update transaction strategy tags based on positions
      transactions.forEach((txn) => {
        const position = positions.find((p) => p.transactionIds.includes(txn.id));
        if (position) {
          txn.positionId = position.id;
          txn.strategyTag = position.strategyType;
        }
      });

      // Sort transactions by date (most recent first)
      transactions.sort((a, b) => {
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

      // Build positions and detect rolls
      const { positions, rolls, rollChains } = buildPositions(allTransactions);

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

      // Build positions and detect rolls
      const { positions, rolls, rollChains } = buildPositions(transactions);

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

  const httpServer = createServer(app);
  return httpServer;
}
