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
**Live P/L Integration:** Dashboard displays live P/L data from cached option prices fetched on the Open Positions page. The LivePriceCacheProvider at App level stores prices by position ID, and Dashboard uses `calculateTotalLivePL()` to compute live values. Visual indicators (Zap icon, timestamp) appear when live data is available. Falls back gracefully to static P/L when no valid live prices exist (e.g., for expired options).

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
**Strategy Overrides:** Authenticated users can manually reclassify positions when auto-detection doesn't capture the full context. For example, a "Short Call" can be reclassified as "Covered Call" when the user owns the underlying shares. Overrides persist across data re-uploads using `positionHash` and are displayed with a "Reclassified" badge in tables and detail views.

## External Dependencies

### Third-Party Libraries

**File Processing:** `papaparse` (CSV), `xlsx` (Excel).
**Frontend UI:** `@radix-ui/*` (component primitives), `@tanstack/react-query` (server state), `react-hook-form` (form validation), `date-fns` (date utilities), `lucide-react` (icons), `nostr-tools` (NOSTR utilities).
**Authentication:** `jsonwebtoken` (JWTs), `cookie-parser` (cookies), `nodemailer` (email sending).
**Admin Notifications:** New user registrations (via email or NOSTR) trigger email notifications to nathan@njwilli.com with user details and registration method.
**Backend:** `multer` (file uploads), `express` (HTTP server).
**Build Tools:** `vite`, `esbuild`, `tailwindcss`, `typescript`.

### Market Data Integration

**Provider:** Yahoo Finance - free options data, no API key required.
**Endpoints Used:**
- `https://query1.finance.yahoo.com/v7/finance/options/{symbol}?date={expirationTimestamp}` - Options chain with quotes, volume, open interest.
**Rate Limits:** Reasonable use, no strict API key requirement.
**User Configuration:** No API key needed - works automatically for authenticated users.
**Data Available:** Price data (bid, ask, last, mark), implied volatility, volume, open interest, underlying price.

### Greeks Calculation

**Library:** `@uqee/black-scholes` for Black-Scholes model calculations.
**Client-side Calculation:** Greeks are calculated in the browser using live price data. Implied volatility is computed via Newton-Raphson solver.
**Utility Module:** `client/src/lib/blackScholes.ts` provides:
- `solveImpliedVolatility()`: Newton-Raphson IV solver from market price (primary source)
- `calculateGreeks()`: Computes per-contract Greeks (delta, gamma, theta, vega, rho, theoretical price)
- `calculatePositionGreeks()`: Aggregates position-level Greeks with scaling (×100 × quantity × sign)
**IV Calculation Priority:**
1. **Calculated (calc):** Newton-Raphson solver using market price, underlying price, strike, time to expiry
2. **Yahoo Fallback:** Normalized Yahoo Finance IV if solver fails
3. **Default Fallback:** 30% IV if no other source available
**Position Greeks Units:**
- Delta ($): Dollar P/L per $1 underlying move
- Gamma: Position delta change per $1 underlying move (in delta units)
- Theta ($/day): Dollar time decay per day
- Vega ($/%IV): Dollar P/L per 1% IV change
**Per-leg Greeks:** Raw Black-Scholes values displayed with Greek symbols (Δ, Γ, Θ, ν)
**Risk-free Rate:** Hardcoded at 4.5% (0.045), may need updating based on market conditions.
**Display Locations:** Open Positions table tooltips, Position Detail panel Greeks section, per-leg Greeks in leg cards.
**IV Source Indicator:** UI shows "(calc)" next to IV when calculated via Newton-Raphson.

### AI Portfolio Analysis

**Model:** Claude Sonnet 4.5 (via Replit AI Integrations)
**Features:**
- Comprehensive portfolio risk assessment with Greeks exposure analysis
- Position-specific observations for open and recently closed positions
- Theta/time decay analysis and volatility exposure insights
- Actionable recommendations for portfolio management

**Async Processing:**
- Uses async job pattern with 3-second polling to handle 30-90+ second analysis times
- Jobs submitted via POST `/api/ai/analyze-portfolio`, status polled via GET `/api/ai/job/:jobId`
- In-memory job storage with 30-minute automatic cleanup

**Analysis Caching:**
- Completed analyses are cached to PostgreSQL immediately upon job completion
- Cached analyses persist across sessions, page refreshes, and browser closures
- Frontend loads cached analysis on component mount via GET `/api/ai/cached-analysis`
- Cache uses upsert pattern (one cached analysis per user)
- Displays relative timestamp ("2 hours ago") with tooltip showing exact generation time

**Greeks Interpretation in AI Prompts:**
- Position-level Greeks are pre-scaled to share-equivalent units (×100 × quantity × sign)
- Theta sign convention: positive = earning from decay (sold options), negative = paying decay (bought options)
- Delta expressed as dollar P/L per $1 underlying move

### Database Configuration

**ORM:** Drizzle ORM with PostgreSQL dialect via `@neondatabase/serverless` driver.
**Schema:** Defined in `shared/schema.ts`, supporting migrations.
**Active Usage:** Stores authenticated user data across `users`, `uploads`, `transactions`, `comments`, `positionComments`, `strategy_overrides`, `email_verification_tokens`, and `ai_analysis_cache` tables. Features user-scoped data isolation, composite unique constraints for deduplication, and indexing for performance.

## Legal Documentation

**Privacy Policy:** Available at `/privacy`. Covers data collection practices (NOSTR pubkey, email, trading data), storage policies, security measures, no data selling commitment, user rights (access, export, deletion), and open-source transparency.

**Terms of Service:** Available at `/terms`. Includes critical financial disclaimers (not financial advice, educational purposes only), service description, user responsibilities, limitation of liability, and MIT license reference.

### Chart Analyzer Feature

**Location:** Analysis page > Chart Analyzer tab (available to authenticated users)
**Model:** Claude Sonnet 4.5 vision (via Replit AI Integrations)

**Input Modes:**
- **Upload:** Drag-and-drop, file picker, or clipboard paste for chart images (PNG, JPG, WebP)
- **Generate:** Enter ticker symbol + timeframe (1D, 5D, 1M, 3M, 6M, 1Y) to generate charts with technical indicators

**Chart Generation:**
- Uses Yahoo Finance for historical price data via `yahoo-finance2` library
- Server-side chart rendering with `chartjs-node-canvas` and Chart.js
- Includes EMA 9/21, Bollinger Bands, VWAP, and price/volume data

**AI Analysis Output:**
- Overall bias (bullish/bearish/neutral) with strength rating
- Technical indicators assessment (trend, momentum, volatility, volume)
- Pattern recognition (chart patterns, divergences)
- Support/resistance level identification
- 2-4 probability-weighted trading scenarios with entry, target, stop-loss
- Key observations and risk factors

**Async Processing:**
- Uses job pattern with 3-second polling (analysis takes 30-60 seconds)
- Jobs submitted via POST `/api/chart/analyze`, status polled via GET `/api/chart/job/:jobId`
- In-memory job storage with 30-minute cleanup

**Files:**
- `server/chartGenerator.ts`: Yahoo Finance data fetching, technical indicator calculation, Chart.js rendering
- `server/chartAnalysis.ts`: Claude vision analysis, prompt engineering, job management
- `client/src/pages/ChartAnalyzer.tsx`: Upload/generate modes, analysis display
- `client/src/components/ChartAnalysisDisplay.tsx`: Structured analysis result rendering