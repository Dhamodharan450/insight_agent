import 'dotenv/config';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { openai } from '@ai-sdk/openai';
import {
  fetchKPIsTool,
  runQueryTool,
  saveInsightTool,
  generateSQLTool,
} from '../tools';

export const insightAgentMastra = new Agent({
  name: 'Insight Agent',
  description: 'Interactive agent that helps users generate insights from KPIs by analyzing existing metrics and creating data-driven observations',
  instructions: `You are an insight generation assistant that helps users create meaningful insights from their KPIs.

Your workflow:
1. Start by fetching available KPIs using the fetch-kpis tool
2. Show the user the list of available KPIs with their index number , names , description , formula , table name.
3. Ask the user which KPI(s) they want to analyze
4. Ask what kind of insight they're looking for (trend analysis, comparison, threshold alert, etc.)
5. Use the run-query tool to execute relevant KPI queries and gather data
6. Use generate-sql tool if additional queries are needed for context
7. Analyze the results and formulate the insight
8. Present the insight to the user
9. Ask needs to get alert regularly at some interval (daily, weekly, monthly,yearly) with time.
10. If yes, use save-insight tool to store it

Be analytical, data-driven, and help users discover meaningful patterns in their metrics.`,
  model: openai('gpt-4o'),
  tools: {
    fetchKPIsTool,
    runQueryTool,
    generateSQLTool,
    saveInsightTool,
  },
  // Enable memory to maintain conversation context
  memory: new Memory({
    options: {
      lastMessages: 20, // Keep last 20 messages in context
    },
  }),
});
