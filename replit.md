# Robinhood Trading Analysis Tool

## Overview

A comprehensive trading analysis application designed to process Robinhood trading data from CSV/Excel files and provide detailed insights into options strategies, position tracking, and performance analytics. The application automatically detects complex multi-leg strategies, tracks position rolls across time, and calculates profit/loss metrics with win rate statistics.

**Core Functionality:**
- File upload and parsing (CSV/XLSX support)
- Automated options strategy classification (spreads, straddles, iron condors, etc.)
- Position tracking with FIFO accounting
- Roll detection and chain linking across related positions
- Real-time P/L calculations and performance metrics
- Interactive dashboard with filtering and detailed position views
- **NEW:** NOSTR authentication for persistent data storage
- **NEW:** Transaction deduplication for authenticated users
- **NEW:** Session import to save anonymous data after login
- **NEW:** Account management with upload history and data export

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework:** React 18 with TypeScript and Vite for fast development and build optimization.

**UI Component System:** shadcn/ui with Radix UI primitives, implementing Carbon Design System principles for data-intensive interfaces. The design prioritizes scannable tables, clear data hierarchy, and efficient workflows over visual decoration.

**State Management:** Local React state with TanStack Query for server state management and AuthProvider context for user authentication. The application uses a single-page architecture with tab-based navigation, maintaining uploaded data in component state to avoid unnecessary re-uploads.

**Styling:** Tailwind CSS with a custom design token system supporting light/dark themes. Uses IBM Plex Sans font family for consistency with Carbon Design System guidelines.

**Key Design Decisions:**
- Client-side data processing after initial upload to minimize server round-trips
- Tabular data presentation with sortable columns and pagination for large datasets
- Filter bars with multi-criteria search (symbol, strategy type, status)
- Modal/dialog-based detail views for deep-diving into positions and roll chains
- Interactive charts for visual performance analysis (Recharts library)

**Dashboard Visualizations:**
- **Summary Cards** - Four key metrics:
  - Total P/L (realized + unrealized): Overall portfolio performance including open positions
  - Open Positions: Count of currently active trades
  - Win Rate: Percentage of profitable closed trades with W/L ratio
  - Total P/L (realized): Locked-in profits/losses from closed positions only
- **P/L Over Time Chart** - Dual-line chart showing:
  - Realized P/L (solid line): Cumulative profit/loss from closed positions over time
  - Total P/L (dashed line): Realized + unrealized P/L including open positions
  - Gap between lines represents current unrealized gains/losses from open positions
  - Includes "current" snapshot point to show present-day total P/L
- **Strategy Performance Chart** - Bar chart comparing total P/L across strategy types
  - Color-coded bars (green for profits, red for losses)
  - Sorted by performance (best to worst)
  - Tooltips show count and average P/L per strategy

### Backend Architecture

**Server Framework:** Express.js running on Node.js with TypeScript for type safety.

**File Processing Pipeline:**
1. **Upload Handler** - Multer middleware for multipart/form-data with in-memory storage
2. **Parser Layer** - Dual support for CSV (PapaParse) and Excel (XLSX) files
3. **Consolidation Engine** - Merges split transactions using weighted averages
4. **Position Builder** - FIFO lot tracking to construct positions from raw transactions
5. **Strategy Classifier** - Rule-based algorithm detecting 20+ options strategies
6. **Roll Detector** - Pattern matching to identify and chain related positions

**Data Flow:**
- Raw transaction data → Parsed transactions → Consolidated transactions → Positions + Rolls → Summary statistics
- Each position maintains references to constituent transactions for audit trail
- Roll chains link positions that are temporally related (closing old position + opening new position on same day)

**Key Architectural Choices:**
- Dual-mode storage: In-memory for anonymous users, PostgreSQL for authenticated users
- NOSTR authentication (NIP-07) with JWT session management via httpOnly cookies
- Transaction deduplication using hash-based uniqueness (user_id + transaction_hash)
- Synchronous processing pipeline to ensure data consistency
- Comprehensive error handling with transaction-level anomaly tracking

### Data Models

**Transaction Schema:**
- Core fields: activityDate, instrument, transCode (Buy/Sell/STO/BTO/etc.), quantity, price, amount
- Parsed option details: symbol, expiration, strike, optionType (Call/Put)
- Enrichment fields: positionId, strategyTag (added after position building)

**Position Schema:**
- Multi-leg structure with OptionLeg array (each leg tracks strike, expiration, quantity, direction)
- Status tracking: 'open' | 'closed'
- FIFO-based P/L calculation with entry/exit pricing
- Roll chain linkage via rollChainId

**Roll Detection Logic:**
- Same-day closing + opening transactions on same underlying symbol
- Matching option types (Call-to-Call, Put-to-Put)
- Different expiration dates OR different strike prices
- Supports both debit and credit rolls (BTC→BTO for long positions, STC→STO for short positions)

**Strategy Classification:**
- Single-leg: Covered Call, Cash Secured Put, Long/Short Call/Put
- Two-leg spreads: Vertical spreads (call/put credit/debit), Straddles, Strangles
- Multi-leg: Iron Condor, Calendar Spread, Diagonal Spread
- Stock positions: Long/Short Stock tracking

### Session & Storage

**Dual-Mode Implementation:**

**Anonymous Mode (Default):**
- In-memory storage using Map-based MemStorage class
- No account required - immediate access to all analysis features
- Data exists only during current session
- Privacy-focused - no data persisted to database

**Authenticated Mode (Optional):**
- NOSTR authentication via NIP-07 browser extensions (nos2x, Alby, Flamingo)
- PostgreSQL storage using Drizzle ORM
- Persistent data across sessions
- Transaction deduplication using hash (activityDate, instrument, transCode, quantity, price, amount)
- Upload history tracking with metadata (filename, date, transaction counts)
- Session import feature to save anonymous data after login
- Account management: display name editing, data export to CSV

**Authentication Flow:**
1. User clicks "Sign in with NOSTR"
2. Backend generates challenge (nonce)
3. Frontend creates NOSTR event (kind 27235) with challenge
4. NIP-07 extension signs the event
5. Backend verifies signature and issues JWT in httpOnly cookie
6. User remains authenticated across sessions

**Deduplication Strategy:**
- Hash constructed from 6 transaction fields for uniqueness
- Prevents duplicate data when re-uploading same file
- Provides feedback showing new vs duplicate transaction counts
- Preserves data integrity across multiple uploads

## External Dependencies

### Third-Party Libraries

**File Processing:**
- `papaparse` - CSV parsing with header detection and type inference
- `xlsx` - Excel file reading and sheet-to-JSON conversion

**Frontend UI:**
- `@radix-ui/*` - Accessible component primitives (dialogs, dropdowns, tooltips, etc.)
- `@tanstack/react-query` - Server state management and caching
- `react-hook-form` + `@hookform/resolvers` - Form validation infrastructure
- `date-fns` - Date formatting and manipulation
- `lucide-react` - Icon library
- `nostr-tools` - NOSTR protocol utilities for authentication

**Authentication:**
- `jsonwebtoken` - JWT token generation and verification
- `cookie-parser` - Cookie middleware for Express

**Backend:**
- `multer` - File upload middleware
- `express` - HTTP server framework

**Build Tools:**
- `vite` - Development server and build tool
- `esbuild` - Server-side bundling
- `tailwindcss` - Utility-first CSS framework
- `typescript` - Type checking across full stack

### Database Configuration

**ORM:** Drizzle ORM configured with PostgreSQL dialect via `@neondatabase/serverless` driver.

**Migration Setup:** Schema defined in `shared/schema.ts` with migration output to `./migrations` directory. Database connection via `DATABASE_URL` environment variable.

**Active Usage:** Database is used for authenticated user data with three main tables:
- `users` - NOSTR public keys, display names, creation timestamps
- `uploads` - Upload metadata (filename, date, transaction counts)
- `transactions` - Individual transaction records with deduplication hash

**Schema Highlights:**
- User-scoped data isolation via foreign keys
- Composite unique constraint on (user_id + transaction_hash) for deduplication
- Indexes on user_id and activityDate for query performance

### Development Tools

- `@replit/vite-plugin-*` - Replit-specific development enhancements (error overlay, cartographer, dev banner)
- Custom Vite configuration with path aliases (`@/`, `@shared/`, `@assets/`)
- TypeScript with strict mode enabled and ESNext module resolution

## State Management Patterns

### Race Condition Protection
The application uses refs to guard against race conditions during async operations:
- `isLoggedInRef` - Guards `loadUserData`, `handleFileUpload`, and `handleImportComplete` by checking if user logged out during the async operation
- Guards check `startedLoggedIn && !isLoggedInRef.current` to discard results if logout occurred mid-flight

### Transition-Based Logout Detection
Data clearing on logout uses `prevUserRef` to detect actual logout transitions:
- `wasLoggedIn = !!prevUserRef.current` - Was there a user before?
- `isLoggedOut = !user` - Is there no user now?
- Only clears data when `wasLoggedIn && isLoggedOut`
- Prevents clearing data for anonymous users who were never logged in

### Auto-Load on Login
When authenticated users sign in:
- Retry mechanism with MAX_LOAD_ATTEMPTS=3 and 1000ms delays between attempts
- Handles transient auth settling issues gracefully
- Counters reset on logout for fresh retry budget per session