# Changelog

All notable changes to Options4L will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-11

### Added
- **Core Trading Analysis Features**
  - CSV and Excel file upload support for Robinhood trading data
  - Automatic parsing and validation of transaction data
  - Transaction consolidation with weighted averages for split fills (within $0.02)
  - FIFO-based position tracking and lot management

- **Strategy Detection (20+ Strategies)**
  - Single-leg: Covered Calls, Cash Secured Puts, Long/Short Calls/Puts
  - Two-leg spreads: Vertical Credit/Debit Spreads (Call/Put), Straddles, Strangles
  - Multi-leg: Iron Condors, Calendar Spreads, Diagonal Spreads
  - Stock positions: Long/Short Stock tracking
  - Automatic strategy classification based on leg configuration

- **Roll Chain Tracking**
  - Automatic detection of position rolls (close + open on same day)
  - Support for both long rolls (STC→BTO) and short rolls (BTC→STO)
  - Complete roll chain history linking related positions over time
  - Detailed credit/debit breakdown for each roll segment
  - Credit, Debit, and Net display showing how net P/L was calculated
  - Cumulative P/L tracking across entire roll chains
  - Visual timeline showing expiration and strike changes

- **Performance Analytics**
  - Total P/L calculation (realized + unrealized)
  - Realized P/L tracking (closed positions only)
  - Win rate percentage with wins/losses ratio
  - Open positions count and tracking
  - Interactive P/L Over Time chart showing both realized and total P/L trends
  - Strategy Performance bar chart comparing profitability across strategies
  - Summary cards with key metrics

- **User Interface**
  - Robinhood-inspired design with signature green (#00C805) primary color
  - Dark mode by default with pure black backgrounds
  - Optional light mode with theme toggle
  - IBM Plex Sans typography for excellent readability
  - Three-tab navigation: Dashboard, Open Positions, Closed Positions
  - Sortable and filterable position tables
  - Search by symbol, strategy type, and status
  - Position detail modal with full transaction history
  - Roll chain timeline component with expandable segments
  - Premium per contract display for options
  - Responsive layout optimized for data-intensive workflows

- **Data Visualization**
  - Recharts integration for performance charts
  - P/L Over Time dual-line chart (realized vs total)
  - Strategy Performance bar chart with color-coded profitability
  - Summary cards with formatted currency and percentages
  - Current snapshot point on charts showing present-day totals

- **Header & Footer**
  - "Main Site" link to options4l.com in header
  - Theme toggle (light/dark mode) in header
  - Disclaimer footer on all pages

### Technical Infrastructure
- React 18 with TypeScript and Vite
- Express.js backend with TypeScript
- shadcn/ui component library with Radix UI primitives
- Tailwind CSS with custom design token system
- TanStack Query for server state management
- Wouter for client-side routing
- PapaParse for CSV parsing
- XLSX library for Excel file support
- Drizzle ORM configured for future database persistence
- In-memory storage for current session-based analysis
- Comprehensive error handling and transaction anomaly tracking
- Type-safe API with Zod schema validation

### Fixed
- Debit values now stored as positive magnitudes consistently across roll segments and chain totals
- Credit/debit normalization ensures consistent semantics between segment values and chain totals
- Net P/L calculation correctly uses credit - debit (both positive magnitudes)
- Roll detection properly captures cashflows from both closing and opening transactions

[1.0.0]: https://github.com/njwill/Options4L/releases/tag/v1.0.0
