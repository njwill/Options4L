# Options4L

A comprehensive Robinhood trading analysis tool that transforms your CSV/Excel trading data into actionable insights. Automatically detect complex options strategies, track position rolls across time, and analyze your trading performance with beautiful visualizations.

**[Try it now at tool.options4l.com](https://tool.options4l.com)**

**Free for the first 100 signups!** Monthly subscription coming soon - early users get lifetime free access.

## Features

### Strategy Detection
Automatically identifies 20+ complex options strategies including:
- **Single-leg**: Covered Calls, Cash Secured Puts, Long/Short Calls/Puts
- **Two-leg spreads**: Credit/Debit Spreads (Call/Put), Straddles, Strangles
- **Multi-leg**: Iron Condors, Calendar Spreads, Diagonal Spreads
- **Stock positions**: Long/Short Stock tracking

### Roll Chain Tracking
- Detects when you roll positions forward (close one position, open another)
- Links related positions into complete roll chains with full history
- Shows detailed credit/debit breakdown for each roll segment
- Calculates net P/L across entire roll chains

### Live Market Data & Greeks
- **Real-time pricing** via Yahoo Finance - no API key required
- **Greeks calculations** using Black-Scholes model (Delta, Gamma, Theta, Vega)
- **Implied Volatility** computed via Newton-Raphson solver
- **Live P/L** updates on open positions
- Works automatically for authenticated users

### Performance Analytics
- **Dashboard metrics**: Total P/L, Win Rate, Open Positions, Realized P/L
- **P/L Over Time**: Dual-line chart showing realized vs total P/L trends
- **Monthly P/L Breakdown**: Stacked bar chart with realized vs unrealized
- **Strategy Performance**: Compare profitability across different strategies

### Position Management
- FIFO-based lot tracking for accurate cost basis
- **Manual position grouping** - organize related positions together
- Separate views for open and closed positions
- Filterable by symbol, strategy type, and status
- Premium per contract display for options

### Notes & Comments
- Add notes to individual transactions for future reference
- Add comments to positions to track your thinking
- Notes persist across file re-uploads
- Available for authenticated users

### Authentication & Data Persistence
- **NOSTR login** (NIP-07) - use your existing NOSTR identity
- **Email magic link** - passwordless, secure email authentication
- **Account linking** - connect both NOSTR and email to one account
- **Smart deduplication** - upload the same file twice without duplicates
- **Upload history** - track all your file uploads and manage data

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and builds
- **shadcn/ui** + Radix UI for accessible components
- **Tailwind CSS** for styling
- **TanStack Query** for server state management
- **Recharts** for data visualization
- **@uqee/black-scholes** for Greeks calculations

### Backend
- **Express.js** on Node.js with TypeScript
- **PostgreSQL** with Drizzle ORM for data persistence
- **PapaParse** for CSV parsing, **XLSX** for Excel
- **JWT** authentication with secure cookies
- **Nodemailer** for magic link emails

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database (optional - works without for anonymous usage)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/njwill/Options4L.git
cd Options4L
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (for full features):
```bash
DATABASE_URL=your_postgres_connection_string
SESSION_SECRET=your_session_secret
SMTP_HOST=your_smtp_host
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_FROM=noreply@yourdomain.com
```

4. Push database schema:
```bash
npm run db:push
```

5. Start the development server:
```bash
npm run dev
```

6. Open your browser to `http://localhost:5000`

## Usage

### 1. Export Your Trading Data from Robinhood
- Log into your Robinhood account
- Navigate to Account → Statements & History
- Download your trading history as CSV

### 2. Upload to Options4L
- Click the upload button on the dashboard
- Select your CSV or Excel file
- The app will automatically parse and analyze your trades

### 3. Explore Your Data
- **Dashboard**: View summary metrics and performance charts
- **Open Positions**: See active trades with live P/L and Greeks
- **Closed Positions**: Analyze completed trades
- **Position Details**: Click any position for full transaction history

### 4. Create an Account (Optional)
- Sign up free to save your data permanently
- Add notes to transactions and positions
- Access live market data and Greeks
- Group related positions together

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Links

- **Live App**: [tool.options4l.com](https://tool.options4l.com)
- **Repository**: [github.com/njwill/Options4L](https://github.com/njwill/Options4L)
- **Issues**: [Report bugs or request features](https://github.com/njwill/Options4L/issues)

---

Made with care for options traders everywhere
