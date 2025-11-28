# Robinhood Trading Analysis Tool

## Overview

A comprehensive trading analysis application designed to process Robinhood trading data from CSV/Excel files, providing detailed insights into options strategies, position tracking, and performance analytics. The application automates the detection of complex multi-leg strategies, tracks position rolls across time, and calculates profit/loss metrics with win rate statistics. It features dual authentication (NOSTR and Email magic link), account linking/merging, transaction deduplication, and a robust data persistence model for authenticated users. The project aims to offer a powerful, user-friendly tool for detailed options trading analysis.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework:** React 18 with TypeScript and Vite.
**UI Component System:** shadcn/ui with Radix UI primitives, adhering to Carbon Design System principles for data-intensive interfaces. Prioritizes scannable tables, clear data hierarchy, and efficient workflows.
**State Management:** Local React state, TanStack Query for server state, and AuthProvider for authentication context.
**Styling:** Tailwind CSS with a custom design token system for light/dark themes, using IBM Plex Sans font.
**Key Design Decisions:** Client-side data processing post-upload, tabular data presentation with sorting and pagination, filter bars, modal detail views, and interactive charts (Recharts) for performance analysis.
**Dashboard Visualizations:** Includes summary cards (Total P/L, Open Positions, Win Rate, Realized P/L), a P/L Over Time chart (Realized vs. Total P/L), and a Strategy Performance bar chart.

### Backend Architecture

**Server Framework:** Express.js running on Node.js with TypeScript.
**File Processing Pipeline:** Handles file uploads (Multer), parsing (PapaParse for CSV, XLSX for Excel), transaction consolidation, FIFO-based position building, rule-based options strategy classification (20+ strategies), and roll detection.
**Data Flow:** Raw transactions are processed into consolidated transactions, then positions and rolls, finally generating summary statistics. Positions maintain references to constituent transactions, and roll chains link related positions.
**Key Architectural Choices:** Dual-mode storage (in-memory for anonymous users, PostgreSQL for authenticated), NOSTR authentication (NIP-07) with JWT, email magic link authentication, and transaction deduplication using hash-based uniqueness.

### Data Models

**Transaction Schema:** Captures core trading details (date, instrument, type, quantity, price, amount) and parsed option specifics (symbol, expiration, strike, type), with enrichment fields like `positionId` and `strategyTag`.
**Position Schema:** Represents multi-leg structures with `OptionLeg` arrays, tracks status ('open' | 'closed'), and enables FIFO-based P/L calculation and `rollChainId` linkage.
**Roll Detection Logic:** Identifies same-day closing/opening transactions on the same underlying, matching option types, and differing expiration dates or strike prices.
**Strategy Classification:** Supports single-leg, two-leg spreads, multi-leg strategies, and stock positions.

### Session & Storage

**Dual-Mode Implementation:**
- **Anonymous Mode:** Uses in-memory `MemStorage`, offers immediate access without account, data is session-scoped and not persisted.
- **Authenticated Mode:** Utilizes PostgreSQL via Drizzle ORM. Supports NOSTR (NIP-07) and Email (magic link) authentication. Provides persistent data, transaction deduplication, upload history, session import for anonymous data, and account management.
**Authentication Flows:** Both NOSTR (challenge-response with NIP-07 signing) and Email (magic link with secure token) methods issue JWTs.
**Account Linking & Merging:** Users can link both NOSTR and email to a single account, allowing flexible login and account recovery. Merging transfers all data if an authentication method is already associated with another account.
**Deduplication Strategy:** Transactions are deduplicated using a hash derived from key transaction fields, preventing redundant data on re-uploads and maintaining data integrity.
**Comments:** Authenticated users can add notes to individual transactions (linked by `transactionHash`) and positions (linked by `positionHash`), ensuring persistence across re-uploads.

## External Dependencies

### Third-Party Libraries

**File Processing:** `papaparse` (CSV), `xlsx` (Excel).
**Frontend UI:** `@radix-ui/*` (component primitives), `@tanstack/react-query` (server state), `react-hook-form` (form validation), `date-fns` (date utilities), `lucide-react` (icons), `nostr-tools` (NOSTR utilities).
**Authentication:** `jsonwebtoken` (JWTs), `cookie-parser` (cookies), `nodemailer` (email sending).
**Backend:** `multer` (file uploads), `express` (HTTP server).
**Build Tools:** `vite`, `esbuild`, `tailwindcss`, `typescript`.

### Market Data Integration

**Provider:** Yahoo Finance - free options data, no API key required.
**Endpoints Used:**
- `https://query1.finance.yahoo.com/v7/finance/options/{symbol}?date={expirationTimestamp}` - Options chain with quotes, volume, open interest.
**Rate Limits:** Reasonable use, no strict API key requirement.
**User Configuration:** No API key needed - works automatically for authenticated users.
**Data Available:** Price data (bid, ask, last, mark), implied volatility, volume, open interest, underlying price.
**Note:** Greeks (delta, gamma, theta, vega) are not available through Yahoo Finance free API.

### Database Configuration

**ORM:** Drizzle ORM with PostgreSQL dialect via `@neondatabase/serverless` driver.
**Schema:** Defined in `shared/schema.ts`, supporting migrations.
**Active Usage:** Stores authenticated user data across `users`, `uploads`, `transactions`, `comments`, `positionComments`, and `email_verification_tokens` tables. Features user-scoped data isolation, composite unique constraints for deduplication, and indexing for performance.

## Legal Documentation

**Privacy Policy:** Available at `/privacy`. Covers data collection practices (NOSTR pubkey, email, trading data), storage policies, security measures, no data selling commitment, user rights (access, export, deletion), and open-source transparency.

**Terms of Service:** Available at `/terms`. Includes critical financial disclaimers (not financial advice, educational purposes only), service description, user responsibilities, limitation of liability, and MIT license reference.