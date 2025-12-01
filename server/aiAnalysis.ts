import Anthropic from "@anthropic-ai/sdk";

// Using Replit's AI Integrations service for Anthropic access
const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

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
      
      // Position-level Greeks
      if (pos.liveData?.positionGreeks) {
        hasGreeksData = true;
        const pg = pos.liveData.positionGreeks;
        totalDelta += pg.totalDelta;
        totalGamma += pg.totalGamma;
        totalTheta += pg.totalTheta;
        totalVega += pg.totalVega;
        lines.push(`- Position Greeks: Δ=${pg.totalDelta.toFixed(2)}, Γ=${pg.totalGamma.toFixed(4)}, Θ=${pg.totalTheta.toFixed(2)}/day, V=${pg.totalVega.toFixed(2)}`);
      }
      
      lines.push("");
    }
    
    // Portfolio-level aggregate Greeks
    if (hasGreeksData) {
      lines.push("## Portfolio Aggregate Greeks");
      lines.push(`- Total Delta: ${totalDelta.toFixed(2)} (equivalent to ${Math.abs(totalDelta * 100).toFixed(0)} shares ${totalDelta >= 0 ? 'long' : 'short'})`);
      lines.push(`- Total Gamma: ${totalGamma.toFixed(4)}`);
      lines.push(`- Total Theta: $${totalTheta.toFixed(2)}/day`);
      lines.push(`- Total Vega: $${totalVega.toFixed(2)} per 1% IV change`);
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

When analyzing, focus on:
1. Overall portfolio risk assessment (directional bias, volatility exposure)
2. Greek exposure analysis (delta, theta, vega) and what it means for the portfolio
3. Position-specific observations (positions near expiration, ITM/OTM status, potential assignment risk)
4. Concentration risk (too much exposure to one underlying?)
5. Theta decay implications (is the portfolio benefiting from or hurt by time decay?)
6. Volatility exposure (is the portfolio long or short volatility?)
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
    model: "claude-3-5-sonnet-latest",
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
