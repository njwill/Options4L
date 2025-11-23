import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { parseFile, consolidateTransactions } from "./utils/csvParser";
import { buildPositions, calculateSummary } from "./utils/positionBuilder";
import authRoutes from "./authRoutes";
import { 
  createUploadRecord, 
  saveTransactionsToDatabase, 
  loadUserTransactions 
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

      let transactions = parsedTransactions;
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
      });

    } catch (error) {
      console.error('Upload error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to process file',
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
