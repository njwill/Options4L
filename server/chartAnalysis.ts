import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  timeout: 180000,
});

export type ChartJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ChartAnalysisJob {
  id: string;
  userId: string;
  status: ChartJobStatus;
  createdAt: Date;
  completedAt?: Date;
  result?: ChartAnalysisResult;
  error?: string;
}

export interface Scenario {
  name: string;
  probability: string;
  entry: string;
  target: string;
  stopLoss: string;
  rationale: string;
}

export interface ChartAnalysisResult {
  overallBias: 'bullish' | 'bearish' | 'neutral';
  biasStrength: 'strong' | 'moderate' | 'weak';
  summary: string;
  indicators: {
    trend: string;
    momentum: string;
    volatility: string;
    volume: string;
  };
  patterns: string[];
  divergences: string[];
  supportLevels: string[];
  resistanceLevels: string[];
  scenarios: Scenario[];
  keyObservations: string[];
  riskFactors: string[];
}

const chartJobs = new Map<string, ChartAnalysisJob>();

const JOB_EXPIRY_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(chartJobs.entries());
  for (const [id, job] of entries) {
    if (now - job.createdAt.getTime() > JOB_EXPIRY_MS) {
      chartJobs.delete(id);
    }
  }
}, 5 * 60 * 1000);

export function createChartJob(userId: string): ChartAnalysisJob {
  const job: ChartAnalysisJob = {
    id: randomUUID(),
    userId,
    status: 'queued',
    createdAt: new Date(),
  };
  chartJobs.set(job.id, job);
  return job;
}

export function getChartJob(jobId: string, userId: string): ChartAnalysisJob | null {
  const job = chartJobs.get(jobId);
  if (!job || job.userId !== userId) {
    return null;
  }
  return job;
}

export function updateChartJobStatus(
  jobId: string, 
  status: ChartJobStatus, 
  result?: ChartAnalysisResult, 
  error?: string
) {
  const job = chartJobs.get(jobId);
  if (job) {
    job.status = status;
    if (result) job.result = result;
    if (error) job.error = error;
    if (status === 'completed' || status === 'failed') {
      job.completedAt = new Date();
    }
  }
}

export async function processChartAnalysisJob(
  jobId: string,
  imageBase64: string,
  symbol?: string
): Promise<void> {
  updateChartJobStatus(jobId, 'running');
  
  try {
    console.log(`[Chart Analysis] Job ${jobId} started processing`);
    const result = await analyzeChartImage(imageBase64, symbol);
    updateChartJobStatus(jobId, 'completed', result);
    console.log(`[Chart Analysis] Job ${jobId} completed successfully`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[Chart Analysis] Job ${jobId} failed:`, errorMessage);
    updateChartJobStatus(jobId, 'failed', undefined, errorMessage);
  }
}

const systemPrompt = `You are an expert technical analyst specializing in stock chart analysis. You analyze chart images to identify patterns, indicators, and generate probability-weighted trading scenarios.

Your analysis must be structured and comprehensive. Focus on:

1. TREND ANALYSIS: Identify the primary trend direction (uptrend, downtrend, sideways) and strength
2. TECHNICAL INDICATORS: Analyze visible indicators like moving averages (EMA, SMA), MACD, RSI, Bollinger Bands, VWAP
3. CHART PATTERNS: Identify classic patterns (head & shoulders, double top/bottom, triangles, flags, wedges, channels)
4. SUPPORT/RESISTANCE: Identify key price levels where the stock has historically found support or resistance
5. DIVERGENCES: Note any bullish or bearish divergences between price and indicators
6. VOLUME ANALYSIS: Comment on volume patterns if visible

For each analysis, provide:
- An overall bias (bullish, bearish, or neutral) with strength (strong, moderate, weak)
- 2-4 probability-weighted trading scenarios with entry, target, and stop-loss levels
- Key observations and risk factors

IMPORTANT: Respond ONLY with valid JSON in the exact format specified. No markdown, no explanations outside JSON.`;

function getAnalysisPrompt(symbol?: string): string {
  return `Analyze this stock chart image and provide a comprehensive technical analysis.

${symbol ? `The chart is for ${symbol}.` : 'Determine the symbol if visible in the chart.'}

Respond with ONLY valid JSON in this exact format (no markdown code blocks, just raw JSON):
{
  "overallBias": "bullish" | "bearish" | "neutral",
  "biasStrength": "strong" | "moderate" | "weak",
  "summary": "Brief 2-3 sentence summary of the chart analysis",
  "indicators": {
    "trend": "Description of the trend direction and strength",
    "momentum": "Analysis of momentum indicators (RSI, MACD if visible)",
    "volatility": "Volatility assessment (Bollinger Bands, ATR if visible)",
    "volume": "Volume analysis if visible, or 'Not visible' if not shown"
  },
  "patterns": ["List of identified chart patterns"],
  "divergences": ["List of any divergences noted, or empty array if none"],
  "supportLevels": ["Key support price levels as strings like '$150.00'"],
  "resistanceLevels": ["Key resistance price levels as strings like '$165.00'"],
  "scenarios": [
    {
      "name": "Scenario name (e.g., 'Bullish Breakout')",
      "probability": "XX%",
      "entry": "Entry price or condition",
      "target": "Price target",
      "stopLoss": "Stop loss level",
      "rationale": "Brief explanation of why this scenario could occur"
    }
  ],
  "keyObservations": ["List of important observations about the chart"],
  "riskFactors": ["List of risks to consider"]
}`;
}

async function analyzeChartImage(imageBase64: string, symbol?: string): Promise<ChartAnalysisResult> {
  const mediaType = imageBase64.startsWith('/9j') ? 'image/jpeg' : 'image/png';
  
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: getAnalysisPrompt(symbol),
          },
        ],
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  let jsonText = content.text.trim();
  
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.slice(7);
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith('```')) {
    jsonText = jsonText.slice(0, -3);
  }
  jsonText = jsonText.trim();

  try {
    const result = JSON.parse(jsonText) as ChartAnalysisResult;
    
    if (!result.overallBias || !result.summary || !result.indicators || !result.scenarios) {
      throw new Error("Invalid analysis structure - missing required fields");
    }
    
    return result;
  } catch (parseError) {
    console.error('[Chart Analysis] Failed to parse JSON:', jsonText.substring(0, 500));
    throw new Error(`Failed to parse analysis result: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
  }
}

export async function analyzeChart(imageBase64: string, symbol?: string): Promise<ChartAnalysisResult> {
  return analyzeChartImage(imageBase64, symbol);
}
