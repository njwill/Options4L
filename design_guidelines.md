# Robinhood Trading Analysis Tool - Design Guidelines

## Design Approach: Robinhood-Inspired Modern Financial Interface

**Rationale**: Robinhood's design philosophy emphasizes clean, modern aesthetics with a focus on accessibility and clarity. The signature bright green (#00C805) provides high contrast and energetic visual identity, while the pure black dark mode creates an immersive, focused experience for data analysis.

**Core Principles**:
- Data clarity with bold, confident design
- Scannable, structured information hierarchy
- High-contrast dark mode by default (switchable to light)
- Modern, minimal aesthetic with purposeful color accents
- Efficient workflows for active traders

---

## Color System

**Primary Color: Robinhood Green**
- Hex: #00C805
- HSL: 145° 100% 39%
- Usage: Primary buttons, links, positive indicators, chart primary data series
- Contrast: Works on both black (dark mode) and white (light mode) backgrounds

**Dark Mode (Default)**:
- Background: Pure black (hsl(0 0% 0%))
- Card: Very dark gray (hsl(0 0% 4%))
- Border: Dark gray (hsl(0 0% 15%))
- Foreground: Light gray (hsl(0 0% 95%))
- Muted text: Medium gray (hsl(0 0% 65%))

**Light Mode**:
- Background: Pure white (hsl(0 0% 100%))
- Card: Off-white (hsl(0 0% 98%))
- Border: Light gray (hsl(0 0% 90%))
- Foreground: Very dark gray (hsl(0 0% 9%))
- Muted text: Medium gray (hsl(0 0% 40%))

**Semantic Colors**:
- Success/Profit: Robinhood Green (#00C805)
- Danger/Loss: Red (hsl(0 85% 60%) dark, hsl(0 72% 50%) light)
- Warning: Orange (hsl(30 90% 55%))
- Info: Blue (hsl(200 85% 55%))

---

## Typography System

**Font Stack**: System fonts matching Robinhood's modern aesthetic
- Primary: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
- **Headings**: 
  - H1: 2xl (24px), semibold - Page titles (e.g., "Options Analysis Dashboard")
  - H2: xl (20px), semibold - Section headers (e.g., "Open Positions", "Closed Trades")
  - H3: lg (18px), medium - Card/panel titles
- **Body Text**: base (16px), regular - Standard content, table data
- **Data/Numbers**: Font variant tabular-nums for aligned numerical columns
- **Labels**: sm (14px), medium - Form labels, table headers
- **Captions**: xs (12px), regular - Metadata, timestamps, helper text

---

## Layout & Spacing System

**Spacing Primitives**: Use Tailwind units of **2, 4, 8, 12, 16** for consistency
- Component padding: p-4 (cards), p-8 (main containers)
- Section gaps: gap-8 between major sections
- Element spacing: space-y-4 for stacked elements, gap-4 for grids
- Table cell padding: px-4 py-2

**Grid Structure**:
- Main container: max-w-7xl mx-auto px-4
- Two-column dashboard layout (70/30 split): Open positions table (main) + summary stats (sidebar)
- Full-width tables for transaction history
- Responsive: Stack to single column on mobile

---

## Component Library

### 1. File Upload Zone
- Large dropzone area with dashed border
- Icon (upload cloud) centered with clear call-to-action text
- Supported formats displayed (CSV, XLSX)
- After upload: Show filename, file size, parse status

### 2. Data Tables (Primary Interface)
**Table Structure**:
- Sticky header row with sortable columns (↑↓ indicators)
- Alternating row backgrounds for readability
- Dense row height (py-2) to maximize data visibility
- Horizontal scroll on mobile with sticky first column

**Key Tables**:
- **Open Positions Table**: Symbol, Strategy Type, Entry Date, Total Credit, Total Debit, Net P/L, Breakeven Price, Actions (Close/Edit)
- **Closed Positions Table**: Symbol, Strategy, Entry/Exit Dates, Realized P/L, Win/Loss indicator
- **Transaction History**: Date, Symbol, Trans Code, Quantity, Price, Amount, Strategy Tag

**Table Features**:
- Multi-column sorting (click header to toggle)
- Per-column search/filter dropdowns
- Global search bar above table
- Export to CSV button
- Pagination (show 50/100/All options)

### 3. Summary Cards
- Grid of 4 metric cards (grid-cols-4, responsive to grid-cols-2 on tablet, grid-cols-1 on mobile)
- Each card: Large number (text-3xl, tabular-nums), label below (text-sm), trend indicator if applicable
- Examples: Total P/L, Open Positions Count, Win Rate %, Total Premium Collected

### 4. Position Detail Panel
- Expandable accordion rows in table OR modal overlay
- Shows all legs of multi-leg strategies (spreads, condors)
- Roll history with timeline view
- Credit/debit breakdown with running total

### 5. Filters & Controls
- Horizontal filter bar: Dropdowns for Strategy Type, Date Range, Symbol, Status (Open/Closed)
- Clear all filters button
- Active filter chips displayed below with X to remove

### 6. Strategy Classification Badges
- Small pill-shaped badges with strategy names
- Examples: "Covered Call", "Put Credit Spread", "Iron Condor", "Simple Long"
- Used in tables to quickly identify trade types

### 7. Navigation
- Top app bar: Logo/title left, file upload button right
- Horizontal tab navigation below: Dashboard | Open Positions | Closed Positions | Transaction History
- Active tab indicated with underline

---

## Visual Hierarchy & Data Display

**P&L Visualization**:
- Use semantic indicators (no color specified, but prepare for positive/negative states)
- Tabular number formatting: $1,234.56 alignment
- Percentage changes: +12.5% formatting

**Status Indicators**:
- Open/Closed position states
- Profitable/Unprofitable markers
- Expiration proximity warnings (e.g., "Expires in 3 days")

**Density Options**:
- Toggle between comfortable/compact table views
- Compact: Smaller padding, smaller text for power users

---

## Interactions & Animations

**Minimal Motion**:
- Table row hover: Subtle background shift
- Sort indicator rotation: 180deg transition
- Modal/panel entry: Simple fade-in (150ms)
- Loading states: Spinner for file parsing

**No Distracting Animations**: This is a financial tool where data accuracy and speed matter most.

---

## Responsive Behavior

- **Desktop (lg)**: Full multi-column tables, side-by-side layouts
- **Tablet (md)**: Tables remain but with horizontal scroll, summary cards stack to 2 columns
- **Mobile**: 
  - Tables show key columns only (symbol, P/L, actions) with tap to expand for full details
  - Summary cards stack to single column
  - Filters collapse into dropdown menu

---

## Accessibility

- All tables include proper thead/tbody structure
- Sort controls announced to screen readers
- Filter inputs have associated labels
- Keyboard navigation: Tab through table rows, Enter to expand details
- Focus indicators on all interactive elements