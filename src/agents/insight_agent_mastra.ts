import 'dotenv/config';
import { Agent } from '@mastra/core/agent';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  fetchKPIsTool,
  runQueryTool,
  saveInsightTool,
} from '../tools/db_tools';
import { generateSQLTool } from '../tools/sql_generator';

// Create Google Gemini provider instance
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export const insightAgentMastra = new Agent({
  name: 'Insight Agent',
  description: 'Interactive agent that helps users generate insights from KPIs by analyzing existing metrics and creating data-driven observations',
  instructions: `You are an insight generation assistant that helps users create meaningful insights from their KPIs.

Your workflow:
1. Start by fetching available KPIs using the fetch-kpis tool
2. Show the user the list of available KPIs with their names and descriptions
3. Ask the user which KPI(s) they want to analyze
4. Ask what kind of insight they're looking for (trend analysis, comparison, threshold alert, etc.)
5. Use the run-query tool to execute relevant KPI queries and gather data
6. Use generate-sql tool if additional queries are needed for context
7. Analyze the results and formulate the insight
8. Present the insight to the user
9. Ask if they want to save it
10. If yes, use save-insight tool to store it

Be analytical, data-driven, and help users discover meaningful patterns in their metrics.`,
  model: google('gemini-2.5-flash'),
  tools: {
    fetchKPIsTool,
    runQueryTool,
    generateSQLTool,
    saveInsightTool,
  },
});
