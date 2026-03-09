import type {
  CronRun, ModelPricing, RunCost, JobCostSummary,
  DailyCost, ModelBreakdown, TokenAnomaly, CostSummary,
  WeekOverWeek, CacheSavings, OptimizationInsight, OptimizationScore,
} from '@/lib/types'

// ── Pricing table (per 1M tokens) ────────────────────────────

// Source: https://docs.anthropic.com/en/docs/about-claude/models (March 2026)
// Cache read = 0.1x input, cache write (5min) = 1.25x input, cache write (1hr) = 2x input
const PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-6':     { inputPer1M: 5, outputPer1M: 25 },
  'claude-opus-4-5':     { inputPer1M: 5, outputPer1M: 25 },
  'claude-sonnet-4-6':   { inputPer1M: 3, outputPer1M: 15 },
  'claude-sonnet-4-5':   { inputPer1M: 3, outputPer1M: 15 },
  'claude-sonnet-4':     { inputPer1M: 3, outputPer1M: 15 },
  'claude-haiku-4-5':    { inputPer1M: 1, outputPer1M: 5 },
  'claude-3-5-sonnet':   { inputPer1M: 3, outputPer1M: 15 },
  'claude-3-5-haiku':    { inputPer1M: 0.80, outputPer1M: 4 },
  'claude-3-haiku':      { inputPer1M: 0.25, outputPer1M: 1.25 },
}

// Cache read cost as a fraction of input price (0.1x = 90% savings)
const CACHE_READ_MULTIPLIER = 0.1

const DEFAULT_PRICING: ModelPricing = { inputPer1M: 3, outputPer1M: 15 }

export function getModelPricing(model: string): ModelPricing {
  // Try exact match, then prefix match (e.g. "claude-sonnet-4-6-20250514")
  if (PRICING[model]) return PRICING[model]
  for (const key of Object.keys(PRICING)) {
    if (model.startsWith(key)) return PRICING[key]
  }
  return DEFAULT_PRICING
}

// ── Transform runs to costed runs ────────────────────────────

export function toRunCosts(runs: CronRun[]): RunCost[] {
  const result: RunCost[] = []
  for (const run of runs) {
    if (!run.usage) continue
    const pricing = getModelPricing(run.model ?? '')
    const inputTokens = run.usage.input_tokens
    const outputTokens = run.usage.output_tokens
    const totalTokens = run.usage.total_tokens
    const cacheTokens = Math.max(0, totalTokens - inputTokens - outputTokens)
    const minCost = (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) / 1_000_000

    result.push({
      ts: run.ts,
      jobId: run.jobId,
      model: run.model ?? 'unknown',
      provider: run.provider ?? 'unknown',
      inputTokens,
      outputTokens,
      totalTokens,
      cacheTokens,
      minCost,
    })
  }
  return result
}

// ── Job-level aggregation ────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function computeJobCosts(runCosts: RunCost[]): JobCostSummary[] {
  const map = new Map<string, RunCost[]>()
  for (const rc of runCosts) {
    const arr = map.get(rc.jobId) ?? []
    arr.push(rc)
    map.set(rc.jobId, arr)
  }

  const result: JobCostSummary[] = []
  for (const [jobId, runs] of map) {
    result.push({
      jobId,
      runs: runs.length,
      totalInputTokens: runs.reduce((s, r) => s + r.inputTokens, 0),
      totalOutputTokens: runs.reduce((s, r) => s + r.outputTokens, 0),
      totalCacheTokens: runs.reduce((s, r) => s + r.cacheTokens, 0),
      totalCost: runs.reduce((s, r) => s + r.minCost, 0),
      medianCost: median(runs.map(r => r.minCost)),
    })
  }
  return result.sort((a, b) => b.totalCost - a.totalCost)
}

// ── Daily aggregation ────────────────────────────────────────

export function computeDailyCosts(runCosts: RunCost[]): DailyCost[] {
  const map = new Map<string, { cost: number; runs: number }>()
  for (const rc of runCosts) {
    const date = new Date(rc.ts).toISOString().slice(0, 10)
    const entry = map.get(date) ?? { cost: 0, runs: 0 }
    entry.cost += rc.minCost
    entry.runs += 1
    map.set(date, entry)
  }
  return Array.from(map.entries())
    .map(([date, v]) => ({ date, cost: v.cost, runs: v.runs }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── Model breakdown ──────────────────────────────────────────

export function computeModelBreakdown(runCosts: RunCost[]): ModelBreakdown[] {
  const map = new Map<string, number>()
  let total = 0
  for (const rc of runCosts) {
    map.set(rc.model, (map.get(rc.model) ?? 0) + rc.totalTokens)
    total += rc.totalTokens
  }
  if (total === 0) return []
  return Array.from(map.entries())
    .map(([model, tokens]) => ({ model, tokens, pct: (tokens / total) * 100 }))
    .sort((a, b) => b.tokens - a.tokens)
}

// ── Anomaly detection ────────────────────────────────────────

export function detectAnomalies(runCosts: RunCost[], jobSummaries: JobCostSummary[]): TokenAnomaly[] {
  const medianMap = new Map<string, number>()
  const countMap = new Map<string, number>()
  for (const js of jobSummaries) {
    countMap.set(js.jobId, js.runs)
  }

  // Compute median total_tokens per job
  const tokensByJob = new Map<string, number[]>()
  for (const rc of runCosts) {
    const arr = tokensByJob.get(rc.jobId) ?? []
    arr.push(rc.totalTokens)
    tokensByJob.set(rc.jobId, arr)
  }
  for (const [jobId, tokens] of tokensByJob) {
    medianMap.set(jobId, median(tokens))
  }

  const anomalies: TokenAnomaly[] = []
  for (const rc of runCosts) {
    const count = countMap.get(rc.jobId) ?? 0
    if (count < 3) continue
    const med = medianMap.get(rc.jobId) ?? 0
    if (med === 0) continue
    const ratio = rc.totalTokens / med
    if (ratio > 5) {
      anomalies.push({
        ts: rc.ts,
        jobId: rc.jobId,
        totalTokens: rc.totalTokens,
        medianTokens: med,
        ratio,
      })
    }
  }
  return anomalies.sort((a, b) => b.ratio - a.ratio)
}

// ── Week-over-week comparison ────────────────────────────────

export function computeWeekOverWeek(runCosts: RunCost[]): WeekOverWeek {
  const now = Date.now()
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000
  const thisWeekStart = now - ONE_WEEK
  const lastWeekStart = now - 2 * ONE_WEEK

  let thisWeek = 0
  let lastWeek = 0
  for (const rc of runCosts) {
    if (rc.ts >= thisWeekStart) thisWeek += rc.minCost
    else if (rc.ts >= lastWeekStart) lastWeek += rc.minCost
  }

  const changePct = lastWeek > 0
    ? ((thisWeek - lastWeek) / lastWeek) * 100
    : null

  return { thisWeek, lastWeek, changePct }
}

// ── Cache savings estimation ────────────────────────────────

export function computeCacheSavings(runCosts: RunCost[]): CacheSavings {
  let cacheTokens = 0
  let estimatedSavings = 0
  for (const rc of runCosts) {
    if (rc.cacheTokens > 0) {
      cacheTokens += rc.cacheTokens
      const pricing = getModelPricing(rc.model)
      // Cache reads cost 0.1x input price, so savings = 0.9x input price per cached token
      estimatedSavings += (rc.cacheTokens * pricing.inputPer1M * (1 - CACHE_READ_MULTIPLIER)) / 1_000_000
    }
  }
  return { cacheTokens, estimatedSavings }
}

// ── Optimization insights ────────────────────────────────────

const EXPENSIVE_MODELS = ['claude-opus-4-6', 'claude-opus-4-5']
const ECONOMY_MODELS = ['claude-haiku-4-5', 'claude-3-5-haiku', 'claude-3-haiku']

export function computeOptimizationInsights(
  runCosts: RunCost[],
  jobCosts: JobCostSummary[],
  anomalies: TokenAnomaly[],
  cacheSavings: CacheSavings,
  totalCost: number,
): OptimizationInsight[] {
  const insights: OptimizationInsight[] = []
  let id = 0

  // 1. Cache utilization check
  // Cache reads cost 0.1x input (90% savings). Cache writes cost 1.25x (5-min TTL) or 2x (1-hr TTL).
  // Minimum cacheable tokens: Opus/Haiku 4,096; Sonnet 4.6 2,048; Sonnet 4.5/4/3.7 1,024.
  const totalInputTokens = runCosts.reduce((s, r) => s + r.inputTokens, 0)
  const cacheRatio = totalInputTokens > 0 ? cacheSavings.cacheTokens / (totalInputTokens + cacheSavings.cacheTokens) : 0
  if (cacheRatio < 0.1 && runCosts.length >= 5) {
    // Low or no caching -- potential for significant input savings
    const potentialSavings = totalCost * 0.3
    insights.push({
      id: `opt-${++id}`,
      severity: 'critical',
      title: 'Enable prompt caching',
      description: `Only ${(cacheRatio * 100).toFixed(0)}% of input tokens are cached. Cache reads cost 0.1x input price (90% savings). Write overhead is just 1.25x for 5-min TTL -- breaks even after 1 cache hit. Prompts must be 1,024-4,096+ tokens (model-dependent). Structure prompts: tools first, then system instructions, then messages.`,
      projectedSavings: potentialSavings,
      action: `My prompt cache hit rate is only ${(cacheRatio * 100).toFixed(0)}%. Analyze my cron jobs and recommend which agents would benefit most from enabling prompt caching. Consider minimum token thresholds (Opus/Haiku need 4,096 tokens, Sonnet needs 1,024-2,048). Show specific config changes and projected savings. Recommend whether to use 5-min or 1-hour TTL based on my job schedules.`,
    })
  } else if (cacheRatio >= 0.1 && cacheRatio < 0.4 && runCosts.length >= 5) {
    insights.push({
      id: `opt-${++id}`,
      severity: 'warning',
      title: 'Improve cache hit rate',
      description: `Cache hit rate is ${(cacheRatio * 100).toFixed(0)}%. Structure prompts with static content first (tools > system > messages) so the prefix stays stable. Consider 1-hour TTL (2x write cost) for jobs that run infrequently -- breaks even after 2 cache hits. Target 60%+ cache ratio.`,
      projectedSavings: totalCost * 0.15,
      action: `My cache hit rate is ${(cacheRatio * 100).toFixed(0)}%. How can I restructure my agent prompts to improve caching? Should any jobs switch from 5-min to 1-hour TTL? Show the optimal prompt ordering (tools > system > dynamic content) for each agent.`,
    })
  }

  // 2. Model tiering opportunities
  // Opus $5/$25, Sonnet $3/$15, Haiku $1/$5 per 1M tokens
  // Opus is 1.67x Sonnet on input, 5x Haiku. Sonnet is 3x Haiku.
  const expensiveRuns = runCosts.filter(r =>
    EXPENSIVE_MODELS.some(m => r.model.startsWith(m))
  )
  if (expensiveRuns.length > 0) {
    const expensiveCost = expensiveRuns.reduce((s, r) => s + r.minCost, 0)
    const pct = totalCost > 0 ? (expensiveCost / totalCost * 100) : 0
    // Estimate savings by switching to Sonnet pricing ($3/$15 vs $5/$25)
    const savingsIfDowngraded = expensiveRuns.reduce((s, r) => {
      const opusCost = r.minCost
      const sonnetCost = (r.inputTokens * 3 + r.outputTokens * 15) / 1_000_000
      return s + (opusCost - sonnetCost)
    }, 0)

    insights.push({
      id: `opt-${++id}`,
      severity: pct > 50 ? 'critical' : 'warning',
      title: 'Downgrade from Opus where possible',
      description: `${expensiveRuns.length} runs used Opus (${pct.toFixed(0)}% of total cost). Opus is $5/$25 vs Sonnet at $3/$15 per 1M tokens. Reserve Opus for complex multi-step reasoning; Sonnet handles code generation, analysis, and agentic tool use well.`,
      projectedSavings: savingsIfDowngraded * 0.7, // conservative -- not all jobs can be downgraded
      action: `${expensiveRuns.length} of my cron runs are using Opus ($5/$25 per 1M tokens). Sonnet ($3/$15) handles most tasks well. Analyze which jobs actually need Opus-level reasoning (complex multi-step, big refactors, research) vs which could safely use Sonnet or Haiku. Give me specific model config changes.`,
    })
  }

  // 3. Economy model opportunity for small jobs
  // Haiku 4.5 ($1/$5) is 3x cheaper than Sonnet ($3/$15) and 5x cheaper than Opus ($5/$25)
  const economyEligible = jobCosts.filter(j => {
    const runs = runCosts.filter(r => r.jobId === j.jobId)
    const avgOutput = runs.reduce((s, r) => s + r.outputTokens, 0) / (runs.length || 1)
    const usesExpensive = runs.some(r => !ECONOMY_MODELS.some(m => r.model.startsWith(m)))
    return avgOutput < 500 && usesExpensive && runs.length >= 2
  })
  if (economyEligible.length > 0) {
    const names = economyEligible.slice(0, 3).map(j => j.jobId).join(', ')
    const savings = economyEligible.reduce((s, j) => s + j.totalCost * 0.7, 0)
    insights.push({
      id: `opt-${++id}`,
      severity: 'info',
      title: `Switch ${economyEligible.length} lightweight jobs to Haiku`,
      description: `Jobs with short outputs (${names}${economyEligible.length > 3 ? '...' : ''}) could use Haiku 4.5 ($1/$5 per 1M) -- 3x cheaper than Sonnet. Haiku excels at classification, routing, status checks, and high-volume processing.`,
      projectedSavings: savings,
      action: `These jobs produce short outputs and may not need an expensive model: ${economyEligible.map(j => j.jobId).join(', ')}. For each job, evaluate if switching to Haiku 4.5 ($1/$5 per 1M tokens) would maintain quality. Give me the specific config changes.`,
    })
  }

  // 4. Anomaly alerts
  if (anomalies.length > 0) {
    const worstAnomaly = anomalies[0]
    const anomalyCost = anomalies.reduce((s, a) => {
      const run = runCosts.find(r => r.ts === a.ts && r.jobId === a.jobId)
      return s + (run?.minCost ?? 0)
    }, 0)
    insights.push({
      id: `opt-${++id}`,
      severity: anomalies.length > 3 ? 'critical' : 'warning',
      title: `${anomalies.length} token usage anomalies`,
      description: `${worstAnomaly.jobId} used ${worstAnomaly.ratio.toFixed(1)}x its median tokens. Anomalous runs cost ${fmtCostValue(anomalyCost)}. This often indicates runaway context, retry loops, or uncontrolled tool use.`,
      projectedSavings: anomalyCost * 0.5,
      action: `I have ${anomalies.length} token usage anomalies. The worst is ${worstAnomaly.jobId} at ${worstAnomaly.ratio.toFixed(1)}x its median. Diagnose what's causing these spikes and recommend fixes to prevent token waste.`,
    })
  }

  // 5. High output-to-input ratio (verbose responses)
  // Output costs 5x input across all Claude models ($15 vs $3 for Sonnet, $25 vs $5 for Opus, $5 vs $1 for Haiku)
  // Extended thinking tokens are also billed as output and can be significant
  const totalOutputTokens = runCosts.reduce((s, r) => s + r.outputTokens, 0)
  const outputRatio = totalInputTokens > 0 ? totalOutputTokens / totalInputTokens : 0
  if (outputRatio > 1.5 && runCosts.length >= 5) {
    const excessOutputCost = runCosts.reduce((s, r) => {
      const pricing = getModelPricing(r.model)
      const excessTokens = Math.max(0, r.outputTokens - r.inputTokens)
      return s + (excessTokens * pricing.outputPer1M) / 1_000_000
    }, 0)
    insights.push({
      id: `opt-${++id}`,
      severity: 'warning',
      title: 'Output tokens exceed input',
      description: `Output is ${outputRatio.toFixed(1)}x input tokens. Output costs 5x more per token across all models. Set max_tokens limits, request concise responses, or use structured JSON output. Note: extended thinking tokens are billed as output -- use effort: "low" or "medium" for simple tasks.`,
      projectedSavings: excessOutputCost * 0.3,
      action: `My agents are generating ${outputRatio.toFixed(1)}x more output tokens than input tokens, and output costs 5x more per token. How can I reduce output? Should I set max_tokens limits? Are any jobs using extended thinking unnecessarily? Which jobs are most verbose? Consider switching to effort: "low" for simple tasks.`,
    })
  }

  // 6. Batch API opportunity for cron jobs
  // Batch API gives 50% discount on input + output, processes within 24 hours, no minimum volume
  // Cron jobs are ideal candidates since they're already asynchronous
  if (runCosts.length >= 3 && totalCost > 0.05) {
    insights.push({
      id: `opt-${++id}`,
      severity: 'info',
      title: 'Use Batch API for scheduled jobs',
      description: `Batch API provides a flat 50% discount on all tokens with no minimum volume. Cron jobs that don't need real-time responses are ideal candidates. Stacks with prompt caching -- combined savings up to 95% on input costs.`,
      projectedSavings: totalCost * 0.5,
      action: `I have ${runCosts.length} cron runs. The Batch API offers a 50% discount on all tokens and processes within 24 hours. Which of my cron jobs could use the Batch API instead of real-time calls? How do I configure this in OpenClaw? Can I combine Batch API with prompt caching for maximum savings?`,
    })
  }

  // 7. Extended thinking cost awareness
  // Thinking tokens are billed as output (5x input price) and can be very large
  // Check for jobs with unusually high output relative to their input
  const highThinkingJobs = jobCosts.filter(j => {
    return j.totalOutputTokens > j.totalInputTokens * 3 && j.runs >= 2
  })
  if (highThinkingJobs.length > 0) {
    const names = highThinkingJobs.slice(0, 3).map(j => j.jobId).join(', ')
    const thinkingExcessCost = highThinkingJobs.reduce((s, j) => {
      // Estimate: output beyond 1:1 ratio may be thinking tokens
      const excessOutput = Math.max(0, j.totalOutputTokens - j.totalInputTokens)
      return s + (excessOutput * 15) / 1_000_000 * 0.3 // conservative at Sonnet rates
    }, 0)
    insights.push({
      id: `opt-${++id}`,
      severity: 'warning',
      title: 'Review extended thinking usage',
      description: `Jobs with 3x+ output-to-input ratio (${names}) may be using extended thinking heavily. Thinking tokens are billed as output (5x input price) and the full internal thinking is billed, not just the summary. Use effort: "low" or "medium" for simpler tasks.`,
      projectedSavings: thinkingExcessCost,
      action: `These jobs have very high output relative to input: ${highThinkingJobs.map(j => j.jobId).join(', ')}. Are they using extended thinking? If so, which ones could use effort: "low" or "medium" instead of "high"? For simple classification or routing tasks, disable thinking entirely. Show me the config changes.`,
    })
  }

  // 8. Healthy system acknowledgment
  if (insights.length === 0) {
    insights.push({
      id: `opt-${++id}`,
      severity: 'info',
      title: 'System is well-optimized',
      description: `Good cache utilization, appropriate model selection, and no anomalies detected. Keep monitoring for changes as your workload evolves.`,
      projectedSavings: null,
      action: 'My cost optimization looks healthy. What advanced techniques could I explore next? Consider Batch API (50% discount), longer cache TTLs, context window truncation, or model routing based on task complexity.',
    })
  }

  return insights.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 }
    return sev[a.severity] - sev[b.severity]
  })
}

function fmtCostValue(v: number): string {
  if (v < 0.01 && v > 0) return '<$0.01'
  return `$${v.toFixed(2)}`
}

// ── Optimization score ──────────────────────────────────────

export function computeOptimizationScore(
  runCosts: RunCost[],
  anomalies: TokenAnomaly[],
  cacheSavings: CacheSavings,
): OptimizationScore {
  if (runCosts.length === 0) return { overall: 100, cacheScore: 100, tieringScore: 100, anomalyScore: 100, efficiencyScore: 100 }

  // Cache score: 100 if >40% cache ratio, scales down linearly
  const totalInput = runCosts.reduce((s, r) => s + r.inputTokens, 0)
  const cacheRatio = totalInput > 0 ? cacheSavings.cacheTokens / (totalInput + cacheSavings.cacheTokens) : 0
  const cacheScore = Math.min(100, Math.round(cacheRatio * 250)) // 40% cache ratio = 100

  // Tiering score: penalize for expensive model overuse
  const expensiveCount = runCosts.filter(r => EXPENSIVE_MODELS.some(m => r.model.startsWith(m))).length
  const expensivePct = expensiveCount / runCosts.length
  const tieringScore = Math.round(Math.max(0, 100 - expensivePct * 200)) // >50% expensive = 0

  // Anomaly score: 100 if no anomalies, drops per anomaly
  const anomalyScore = Math.max(0, 100 - anomalies.length * 20)

  // Efficiency: output/input ratio -- ideal is < 1.0
  const totalOutput = runCosts.reduce((s, r) => s + r.outputTokens, 0)
  const outputRatio = totalInput > 0 ? totalOutput / totalInput : 0
  const efficiencyScore = Math.min(100, Math.round(Math.max(0, 100 - (outputRatio - 0.5) * 50)))

  const overall = Math.round((cacheScore + tieringScore + anomalyScore + efficiencyScore) / 4)

  return { overall, cacheScore, tieringScore, anomalyScore, efficiencyScore }
}

// ── Cost analysis prompt builder ─────────────────────────────

export function buildCostAnalysisPrompt(summary: CostSummary, jobNames: Record<string, string>): string {
  const jn = (id: string) => jobNames[id] || id

  const jobsSummary = summary.jobCosts.slice(0, 10).map(j =>
    `  ${jn(j.jobId)}: ${j.runs} runs, $${j.totalCost.toFixed(2)} total, ${j.totalCacheTokens > 0 ? `${Math.round(j.totalCacheTokens / (j.totalInputTokens + j.totalCacheTokens) * 100)}% cached` : 'no caching'}`
  ).join('\n')

  const modelSummary = summary.modelBreakdown.map(m =>
    `  ${m.model}: ${m.pct.toFixed(0)}% of tokens`
  ).join('\n')

  const anomalySummary = summary.anomalies.length > 0
    ? summary.anomalies.slice(0, 5).map(a =>
        `  ${jn(a.jobId)}: ${a.ratio.toFixed(1)}x median (${a.totalTokens} tokens)`
      ).join('\n')
    : '  None detected'

  return `You are a cost optimization advisor for an AI agent pipeline system using Claude models via OpenClaw. Analyze the following cost data and provide actionable recommendations.

## Pricing Reference (per 1M tokens)
| Model | Input | Output | Cache Read (0.1x) | Cache Write 5-min (1.25x) | Cache Write 1-hr (2x) |
|-------|-------|--------|-------------------|---------------------------|------------------------|
| Opus 4.6 | $5 | $25 | $0.50 | $6.25 | $10 |
| Sonnet 4.6 | $3 | $15 | $0.30 | $3.75 | $6 |
| Haiku 4.5 | $1 | $5 | $0.10 | $1.25 | $2 |
- Batch API: 50% discount on all tokens (no minimum, processed within 24h)
- Extended thinking: billed as output tokens (full internal thinking, not summary)
- Minimum cacheable tokens: Opus/Haiku 4,096; Sonnet 4.6 2,048; Sonnet 4.5 1,024

## Key Metrics
- Total estimated cost: $${summary.totalCost.toFixed(2)}
- This week: $${summary.weekOverWeek.thisWeek.toFixed(2)} (last week: $${summary.weekOverWeek.lastWeek.toFixed(2)})
- Cache savings so far: $${summary.cacheSavings.estimatedSavings.toFixed(2)} (${summary.cacheSavings.cacheTokens} cache tokens, 90% savings on reads)
- Optimization score: ${summary.optimizationScore.overall}/100
- Anomalies: ${summary.anomalies.length}

## Top Jobs by Cost
${jobsSummary || '  No job data'}

## Model Distribution
${modelSummary || '  No model data'}

## Anomalies
${anomalySummary}

## Optimization Scores
- Cache: ${summary.optimizationScore.cacheScore}/100
- Model tiering: ${summary.optimizationScore.tieringScore}/100
- Anomaly: ${summary.optimizationScore.anomalyScore}/100
- Efficiency: ${summary.optimizationScore.efficiencyScore}/100

Provide a concise assessment covering:
1. **Biggest Savings Opportunity** -- the single highest-impact change with dollar estimate
2. **Cache Strategy** -- is caching configured? Recommend TTL (5-min vs 1-hr), prompt structure (tools > system > messages), and minimum token thresholds
3. **Model Selection** -- which jobs should use Opus vs Sonnet vs Haiku? Consider task complexity
4. **Batch API** -- which cron jobs could use Batch API for 50% savings?
5. **Quick Wins** -- 2-3 specific config changes that can be made today

Be specific with job names and dollar amounts. Include OpenClaw config snippets where relevant. Keep it under 400 words.`
}

// ── Master function ──────────────────────────────────────────

export function computeCostSummary(runs: CronRun[]): CostSummary {
  const runCosts = toRunCosts(runs)
  const jobCosts = computeJobCosts(runCosts)
  const dailyCosts = computeDailyCosts(runCosts)
  const modelBreakdown = computeModelBreakdown(runCosts)
  const anomalies = detectAnomalies(runCosts, jobCosts)

  const totalCost = jobCosts.reduce((s, j) => s + j.totalCost, 0)
  const topSpender = jobCosts.length > 0
    ? { jobId: jobCosts[0].jobId, cost: jobCosts[0].totalCost }
    : null
  const weekOverWeek = computeWeekOverWeek(runCosts)
  const cacheSavings = computeCacheSavings(runCosts)
  const optimizationScore = computeOptimizationScore(runCosts, anomalies, cacheSavings)
  const insights = computeOptimizationInsights(runCosts, jobCosts, anomalies, cacheSavings, totalCost)

  return { totalCost, topSpender, anomalies, jobCosts, dailyCosts, modelBreakdown, runCosts, weekOverWeek, cacheSavings, optimizationScore, insights }
}
