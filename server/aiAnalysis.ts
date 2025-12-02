import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

// Using Replit's AI Integrations service for Anthropic access
const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  timeout: 180000, // 3 minute timeout for API calls
});

// Job status types
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AnalysisJob {
  id: string;
  userId: string;
  status: JobStatus;
  createdAt: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
}

// In-memory job storage with automatic cleanup
const jobs = new Map<string, AnalysisJob>();

// Clean up old jobs every 5 minutes (keep jobs for 30 minutes max)
const JOB_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(jobs.entries());
  for (const [id, job] of entries) {
    if (now - job.createdAt.getTime() > JOB_EXPIRY_MS) {
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000);

export function createJob(userId: string): AnalysisJob {
  const job: AnalysisJob = {
    id: randomUUID(),
    userId,
    status: 'queued',
    createdAt: new Date(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(jobId: string, userId: string): AnalysisJob | null {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) {
    return null;
  }
  return job;
}

export function updateJobStatus(jobId: string, status: JobStatus, result?: string, error?: string) {
  const job = jobs.get(jobId);
  if (job) {
    job.status = status;
    if (result) job.result = result;
    if (error) job.error = error;
    if (status === 'completed' || status === 'failed') {
      job.completedAt = new Date();
    }
  }
}

// Process an analysis job asynchronously (fire-and-forget from the route handler)
// onComplete callback is called with the result for caching
export async function processAnalysisJob(
  jobId: string, 
  input: PortfolioAnalysisInput,
  onComplete?: (result: string) => Promise<void>
): Promise<void> {
  updateJobStatus(jobId, 'running');
  
  try {
    console.log(`[AI Analysis] Job ${jobId} started processing`);
    const result = await generatePortfolioAnalysis(input);
    updateJobStatus(jobId, 'completed', result);
    console.log(`[AI Analysis] Job ${jobId} completed successfully`);
    
    // Call the onComplete callback to save to cache
    if (onComplete) {
      try {
        await onComplete(result);
        console.log(`[AI Analysis] Job ${jobId} result cached successfully`);
      } catch (cacheError) {
        // Log but don't fail the job if caching fails
        console.error(`[AI Analysis] Job ${jobId} failed to cache result:`, cacheError);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[AI Analysis] Job ${jobId} failed:`, errorMessage);
    updateJobStatus(jobId, 'failed', undefined, errorMessage);
  }
}

export interface PositionForAnalysis {
  id: string;
  symbol: string;
  strategyType: string;
  status: 'open' | 'closed';
  netPL: number;
  entryDate: string;
  exitDate?: string | null;
  legs: Array<{
    strike: number;
    expiration: string;
    optionType: 'call' | 'put';
    quantity: number;
    transCode: string;
    premium?: number;
  }>;
  liveData?: {
    underlyingPrice: number;
    livePL: number;
    legs: Array<{
      strike: number;
      expiration: string;
      optionType: string;
      bid?: number;
      ask?: number;
      mark?: number;
      impliedVolatility?: number;
      greeks?: {
        delta: number;
        gamma: number;
        theta: number;
        vega: number;
      };
    }>;
    positionGreeks?: {
      totalDelta: number;
      totalGamma: number;
      totalTheta: number;
      totalVega: number;
    };
  };
}

export interface PortfolioAnalysisInput {
  openPositions: PositionForAnalysis[];
  closedPositions: PositionForAnalysis[];
  summary: {
    totalPL: number;
    realizedPL: number;
    openPositionsCount: number;
    closedPositionsCount: number;
    winRate: number;
    totalWins: number;
    totalLosses: number;
  };
  stockHoldings?: Array<{
    symbol: string;
    quantity: number;
    averageCost: number;
    currentPrice?: number;
  }>;
}

function formatPositionsForPrompt(input: PortfolioAnalysisInput): string {
  const lines: string[] = [];
  
  lines.push("## Portfolio Summary");
  lines.push(`- Total P/L: $${input.summary.totalPL.toFixed(2)}`);
  lines.push(`- Realized P/L: $${input.summary.realizedPL.toFixed(2)}`);
  lines.push(`- Open Positions: ${input.summary.openPositionsCount}`);
  lines.push(`- Closed Positions: ${input.summary.closedPositionsCount}`);
  lines.push(`- Win Rate: ${input.summary.winRate.toFixed(1)}%`);
  lines.push(`- Wins: ${input.summary.totalWins}, Losses: ${input.summary.totalLosses}`);
  lines.push("");
  
  // Stock holdings if any
  if (input.stockHoldings && input.stockHoldings.length > 0) {
    lines.push("## Stock Holdings");
    for (const holding of input.stockHoldings) {
      const currentValue = holding.currentPrice 
        ? `Current: $${holding.currentPrice.toFixed(2)}, P/L: $${((holding.currentPrice - holding.averageCost) * holding.quantity).toFixed(2)}`
        : '';
      lines.push(`- ${holding.symbol}: ${holding.quantity} shares @ $${holding.averageCost.toFixed(2)} avg cost ${currentValue}`);
    }
    lines.push("");
  }
  
  // Open positions with live data
  if (input.openPositions.length > 0) {
    lines.push("## Open Positions (with Live Data)");
    lines.push("");
    
    // Calculate aggregate Greeks
    let totalDelta = 0;
    let totalGamma = 0;
    let totalTheta = 0;
    let totalVega = 0;
    let hasGreeksData = false;
    
    for (const pos of input.openPositions) {
      lines.push(`### ${pos.symbol} - ${pos.strategyType}`);
      lines.push(`- Entry Date: ${pos.entryDate}`);
      lines.push(`- Current P/L: $${pos.liveData?.livePL?.toFixed(2) ?? pos.netPL.toFixed(2)}`);
      
      if (pos.liveData?.underlyingPrice) {
        lines.push(`- Underlying Price: $${pos.liveData.underlyingPrice.toFixed(2)}`);
      }
      
      // Leg details
      lines.push("- Legs:");
      for (const leg of pos.legs) {
        const liveLeg = pos.liveData?.legs.find(l => 
          l.strike === leg.strike && 
          l.expiration === leg.expiration &&
          l.optionType.toLowerCase() === leg.optionType.toLowerCase()
        );
        
        const mark = liveLeg?.mark ? `Mark: $${liveLeg.mark.toFixed(2)}` : '';
        const iv = liveLeg?.impliedVolatility ? `IV: ${(liveLeg.impliedVolatility * 100).toFixed(1)}%` : '';
        
        lines.push(`  - ${leg.quantity > 0 ? '+' : ''}${leg.quantity} ${leg.optionType.toUpperCase()} $${leg.strike} exp ${leg.expiration} ${mark} ${iv}`);
        
        if (liveLeg?.greeks) {
          lines.push(`    Greeks: Δ=${liveLeg.greeks.delta.toFixed(3)}, Γ=${liveLeg.greeks.gamma.toFixed(4)}, Θ=${liveLeg.greeks.theta.toFixed(2)}, V=${liveLeg.greeks.vega.toFixed(2)}`);
        }
      }
      
      // Position-level Greeks (already in share-equivalent units: delta × 100 × quantity × sign)
      if (pos.liveData?.positionGreeks) {
        hasGreeksData = true;
        const pg = pos.liveData.positionGreeks;
        totalDelta += pg.totalDelta;
        totalGamma += pg.totalGamma;
        totalTheta += pg.totalTheta;
        totalVega += pg.totalVega;
        const deltaDirection = pg.totalDelta >= 0 ? 'bullish' : 'bearish';
        lines.push(`- Position Greeks (share-equivalent): Δ=${pg.totalDelta.toFixed(2)} (${deltaDirection}), Γ=${pg.totalGamma.toFixed(4)}, Θ=$${pg.totalTheta.toFixed(2)}/day, V=$${pg.totalVega.toFixed(2)}`);
      }
      
      lines.push("");
    }
    
    // Portfolio-level aggregate Greeks
    // Note: All position-level Greeks are already in share-equivalent units (multiplied by 100 × quantity × sign)
    if (hasGreeksData) {
      lines.push("## Portfolio Aggregate Greeks (Share-Equivalent Units)");
      lines.push(`- Total Delta: ${totalDelta.toFixed(2)} shares (${totalDelta >= 0 ? 'bullish' : 'bearish'} - a $1 move in underlyings results in ~$${Math.abs(totalDelta).toFixed(0)} P/L)`);
      lines.push(`- Total Gamma: ${totalGamma.toFixed(4)} (delta change per $1 underlying move)`);
      lines.push(`- Total Theta: $${totalTheta.toFixed(2)}/day (positive = earning from decay, negative = paying decay)`);
      lines.push(`- Total Vega: $${totalVega.toFixed(2)} (P/L per 1% IV change)`);
      lines.push("");
    }
  }
  
  // Recently closed positions (last 10 for context)
  const recentClosed = input.closedPositions.slice(0, 10);
  if (recentClosed.length > 0) {
    lines.push("## Recently Closed Positions (last 10)");
    for (const pos of recentClosed) {
      const plClass = pos.netPL >= 0 ? 'WIN' : 'LOSS';
      lines.push(`- ${pos.symbol} ${pos.strategyType}: $${pos.netPL.toFixed(2)} (${plClass}) - Closed ${pos.exitDate || 'N/A'}`);
    }
    lines.push("");
  }
  
  return lines.join("\n");
}

export async function generatePortfolioAnalysis(input: PortfolioAnalysisInput): Promise<string> {
  const portfolioData = formatPositionsForPrompt(input);
  
  const systemPrompt = `You are an expert options trading analyst providing portfolio analysis. Your role is to analyze the trader's current positions and provide actionable insights.

IMPORTANT - Understanding the Greeks data:
- Position-level and Portfolio-level Greeks are in SHARE-EQUIVALENT units (already multiplied by 100 × quantity × sign)
- A delta of -1476 means exposure equivalent to being short ~1,476 shares (NOT 147,600)
- Per-leg Greeks (shown with individual legs) are RAW per-contract values (e.g., delta = 0.09)
- Positive delta = bullish (profits when underlying rises), Negative delta = bearish (profits when underlying falls)
- Theta sign convention: POSITIVE theta = earning from time decay (short/sold options), NEGATIVE theta = losing to time decay (long/bought options)

When analyzing, focus on:
1. Overall portfolio risk assessment (directional bias based on delta, volatility exposure based on vega)
2. Greek exposure analysis - interpret delta in share-equivalent terms (delta of -500 = short 500 share exposure)
3. Position-specific observations (positions near expiration, ITM/OTM status, potential assignment risk)
4. Concentration risk (too much exposure to one underlying?)
5. Theta decay implications (positive portfolio theta = net premium seller benefiting from decay)
6. Volatility exposure (positive vega = long volatility, negative vega = short volatility)
7. Suggestions for portfolio management or hedging if appropriate

Be concise but thorough. Use specific numbers from the data. Format your response with clear sections using markdown headers. Do not include disclaimers about not being financial advice - the user understands this is analytical guidance only.`;

  const userPrompt = `Please analyze my options portfolio and provide insights:

${portfolioData}

Provide a comprehensive analysis including:
1. Portfolio Overview & Risk Assessment
2. Greeks Analysis & Implications
3. Position-Specific Observations
4. Theta/Time Decay Analysis
5. Key Risks & Considerations
6. Suggested Actions (if any)`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const content = message.content[0];
  if (content.type === "text") {
    return content.text;
  }
  throw new Error("Unexpected response type from Claude");
}
