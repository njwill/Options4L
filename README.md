# Options4L 📊

A comprehensive Robinhood trading analysis tool that transforms your CSV/Excel trading data into actionable insights. Automatically detect complex options strategies, track position rolls across time, and analyze your trading performance with beautiful visualizations.

**🚀 [Try it now at tool.options4l.com](https://tool.options4l.com)**

## ✨ Features

### 🎯 Strategy Detection
Automatically identifies 20+ complex options strategies including:
- **Single-leg**: Covered Calls, Cash Secured Puts, Long/Short Calls/Puts
- **Two-leg spreads**: Credit/Debit Spreads (Call/Put), Straddles, Strangles
- **Multi-leg**: Iron Condors, Calendar Spreads, Diagonal Spreads
- **Stock positions**: Long/Short Stock tracking

### 🔄 Roll Chain Tracking
- Detects when you roll positions forward (close one position, open another)
- Links related positions into complete roll chains with full history
- Shows detailed credit/debit breakdown for each roll segment
- Calculates net P/L across entire roll chains
- Supports both long rolls (BTC→STO) and short rolls (STC→BTO)

### 📈 Performance Analytics
- **Total P/L**: Realized + unrealized gains/losses
- **Win Rate**: Success percentage with wins/losses ratio
- **P/L Over Time**: Dual-line chart showing realized vs total P/L trends
- **Strategy Performance**: Compare profitability across different strategies
- Interactive charts with Recharts library

### 💼 Position Management
- FIFO-based lot tracking for accurate cost basis
- Separate views for open and closed positions
- Filterable by symbol, strategy type, and status
- Sortable tables for easy analysis
- Premium per contract display for options

### 🎨 Robinhood-Inspired Design
- Clean, modern interface with Robinhood's signature green (#00C805)
- Dark mode by default with optional light mode toggle
- IBM Plex Sans typography for excellent readability
- Responsive design optimized for data-intensive workflows

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript for type safety
- **Vite** for lightning-fast development and builds
- **shadcn/ui** + Radix UI for accessible components
- **Tailwind CSS** for styling
- **TanStack Query** for server state management
- **Wouter** for client-side routing
- **Recharts** for data visualization

### Backend
- **Express.js** on Node.js
- **TypeScript** throughout
- **PapaParse** for CSV parsing
- **XLSX** for Excel file support
- **Drizzle ORM** (configured for future database persistence)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

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

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:5000`

## 📖 Usage

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
- **Open Positions**: See currently active trades with unrealized P/L
- **Closed Positions**: Analyze completed trades and historical performance
- **Position Details**: Click any position to see full transaction history and roll chains

### Understanding Roll Chains
When you roll an option position (close one, open another on the same day), Options4L automatically:
- Links the positions together into a chain
- Tracks each roll segment with detailed credit/debit breakdown
- Calculates cumulative P/L across the entire chain
- Shows expiration and strike changes over time

## 📁 Project Structure

```
Options4L/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Route pages (Dashboard, Open/Closed Positions)
│   │   ├── lib/           # Utilities and query client
│   │   └── App.tsx        # Main app component
├── server/                # Backend Express server
│   ├── routes.ts          # API endpoints
│   ├── utils/             # Business logic
│   │   ├── csvParser.ts             # CSV/Excel parsing & transaction merging
│   │   ├── positionBuilder.ts       # FIFO position tracking & roll chain builder
│   │   ├── strategyClassification.ts # Strategy detection
│   │   └── rollDetection.ts         # Roll pattern matching
│   └── storage.ts         # In-memory storage interface
├── shared/                # Shared types and schemas
│   └── schema.ts          # Zod schemas for type safety
└── package.json
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on:
- Setting up your development environment
- Code style and conventions
- Submitting pull requests
- Testing guidelines

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by Robinhood's clean, accessible design
- Built with the amazing shadcn/ui component library
- Powered by the React and TypeScript ecosystems

## 📧 Contact

- **GitHub**: [@njwill](https://github.com/njwill)
- **Issues**: [Report bugs or request features](https://github.com/njwill/Options4L/issues)

## 🔗 Links

- **Live App**: [tool.options4l.com](https://tool.options4l.com)
- **Repository**: [github.com/njwill/Options4L](https://github.com/njwill/Options4L)

---

Made with ❤️ for options traders everywhere
