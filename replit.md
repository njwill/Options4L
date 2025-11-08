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

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework:** React 18 with TypeScript and Vite for fast development and build optimization.

**UI Component System:** shadcn/ui with Radix UI primitives, implementing Carbon Design System principles for data-intensive interfaces. The design prioritizes scannable tables, clear data hierarchy, and efficient workflows over visual decoration.

**State Management:** Local React state with TanStack Query for server state management. The application uses a single-page architecture with tab-based navigation, maintaining uploaded data in component state to avoid unnecessary re-uploads.

**Styling:** Tailwind CSS with a custom design token system supporting light/dark themes. Uses IBM Plex Sans font family for consistency with Carbon Design System guidelines.

**Key Design Decisions:**
- Client-side data processing after initial upload to minimize server round-trips
- Tabular data presentation with sortable columns and pagination for large datasets
- Filter bars with multi-criteria search (symbol, strategy type, status)
- Modal/dialog-based detail views for deep-diving into positions and roll chains

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
- Stateless request processing - each upload is processed independently
- In-memory computation for speed (no database persistence currently)
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

**Current Implementation:** In-memory storage using Map-based user storage (MemStorage class). User authentication schema exists but is not actively used - the application focuses on single-session data analysis.

**Future Consideration:** Drizzle ORM is configured for PostgreSQL migration support, enabling persistent storage of positions and historical analysis if needed.

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

**Note:** Database is provisioned but not actively used in current implementation - all data processing happens in-memory during request lifecycle.

### Development Tools

- `@replit/vite-plugin-*` - Replit-specific development enhancements (error overlay, cartographer, dev banner)
- Custom Vite configuration with path aliases (`@/`, `@shared/`, `@assets/`)
- TypeScript with strict mode enabled and ESNext module resolution