# Contributing to Options4L

Thank you for your interest in contributing to Options4L! We welcome contributions from the community and are excited to have you join us.

## Table of Contents
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Code Style](#code-style)
- [Making Changes](#making-changes)
- [Submitting Pull Requests](#submitting-pull-requests)
- [Testing](#testing)
- [Need Help?](#need-help)

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Options4L.git
   cd Options4L
   ```
3. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/njwill/Options4L.git
   ```

## Development Setup

### Prerequisites
- Node.js 18 or higher
- npm or yarn package manager
- Git

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```
   This starts both the Express backend and Vite frontend on `http://localhost:5000`

3. The application will auto-reload when you make changes to the code

### Environment Variables
Currently the application runs with no required environment variables in development mode. For production deployments:
- `DATABASE_URL`: PostgreSQL connection string (optional, for future persistence when database support is added)

## Project Architecture

### Frontend (`client/`)
- **React 18** with TypeScript
- **Component library**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS with custom design tokens
- **State management**: TanStack Query for server state, local React state
- **Routing**: Wouter for client-side navigation

Key directories:
- `client/src/components/` - Reusable UI components
- `client/src/pages/` - Route-level page components
- `client/src/lib/` - Utilities and configuration

### Backend (`server/`)
- **Express.js** with TypeScript
- **In-memory storage** (MemStorage class)
- **File processing pipeline**: CSV/Excel parsing → consolidation → position building → strategy classification → roll detection

Key files:
- `server/routes.ts` - API endpoints
- `server/utils/csvParser.ts` - Parse CSV/Excel files and merge split transactions
- `server/utils/positionBuilder.ts` - FIFO lot tracking, position construction, and roll chain builder
- `server/utils/strategyClassification.ts` - Detect options strategies
- `server/utils/rollDetection.ts` - Roll pattern matching and detection

### Shared (`shared/`)
- `shared/schema.ts` - Zod schemas for type-safe data validation

## Code Style

### TypeScript
- Use strict TypeScript - no `any` types unless absolutely necessary
- Define interfaces and types in `shared/schema.ts` for shared data structures
- Use Zod schemas for runtime validation

### React Components
- Functional components with hooks
- Use TypeScript for prop types
- Add `data-testid` attributes to interactive elements for testing
- Follow shadcn/ui patterns for consistency

### Naming Conventions
- **Files**: camelCase for utilities, PascalCase for components
- **Variables**: camelCase
- **Components**: PascalCase
- **Constants**: UPPER_SNAKE_CASE

### Formatting
- 2 spaces for indentation
- Use Prettier defaults (install the Prettier extension for your editor)
- Single quotes for strings

### Comments
- Document complex business logic
- Explain *why* something is done, not *what* is being done
- Use JSDoc for functions with complex parameters

## Making Changes

### Branch Naming
Create a descriptive branch for your changes:
```bash
git checkout -b feature/add-new-strategy-detection
git checkout -b fix/roll-chain-calculation-bug
git checkout -b docs/update-readme
```

### Commit Messages
Write clear, descriptive commit messages:
```
Add support for butterfly spread detection

- Implement 4-leg strategy classifier
- Add unit tests for butterfly patterns
- Update strategy type enum in schema
```

Format:
- First line: Brief summary (50 chars or less)
- Blank line
- Detailed explanation if needed (wrapped at 72 chars)

## Submitting Pull Requests

1. **Update your fork** with the latest upstream changes:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push your changes** to your fork:
   ```bash
   git push origin your-branch-name
   ```

3. **Open a Pull Request** on GitHub:
   - Go to the [Options4L repository](https://github.com/njwill/Options4L)
   - Click "New Pull Request"
   - Select your fork and branch
   - Fill out the PR template with:
     - Description of changes
     - Related issue numbers (if applicable)
     - Screenshots (for UI changes)
     - Testing steps

4. **Wait for review** - maintainers will review your PR and may request changes

5. **Address feedback** - make requested changes and push updates to your branch

## Testing

### Manual Testing
1. Upload a sample CSV file with various transaction types
2. Verify positions are correctly built and classified
3. Check that roll chains are properly linked
4. Confirm P/L calculations are accurate
5. Test in both light and dark modes

### Test Cases to Verify
- **Strategy Detection**: Upload transactions for different strategies and verify they're correctly classified
- **Roll Chains**: Upload rolled positions and verify the chain links and P/L calculations
- **Transaction Consolidation**: Upload split transactions (same day, same instrument) and verify they merge correctly
- **Edge Cases**: Test with unusual data (missing fields, zero quantities, negative prices)

### Future Testing Infrastructure
We plan to add:
- Unit tests for business logic (position building, strategy classification)
- Integration tests for API endpoints
- E2E tests with Playwright

## Code Areas That Need Contributions

### High Priority
- **Database persistence**: Migrate from in-memory storage to PostgreSQL with Drizzle ORM
- **Strategy detection improvements**: Add support for more exotic strategies (butterflies, ratio spreads, etc.)
- **Performance optimization**: Handle large CSV files (10,000+ transactions)
- **Export functionality**: Allow users to export analysis results

### Good First Issues
- Improve error messages for invalid CSV formats
- Add tooltips to explain metrics and terminology
- Enhance mobile responsiveness
- Add keyboard shortcuts for common actions
- Documentation improvements

## Need Help?

- **Questions**: Open a [GitHub Discussion](https://github.com/njwill/Options4L/discussions)
- **Bugs**: File an [issue](https://github.com/njwill/Options4L/issues)
- **Ideas**: Start a discussion or open a feature request issue

## Code of Conduct

Be respectful and constructive in all interactions. We're all here to build something great together.

---

Thank you for contributing to Options4L! 🚀
