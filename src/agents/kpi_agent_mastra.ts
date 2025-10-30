import 'dotenv/config';
import { Agent } from '@mastra/core/agent';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  listTablesToolTool,
  listColumnsTool,
  runQueryTool,
  saveKPITool,
} from '../tools/db_tools';
import { generateSQLTool } from '../tools/sql_generator';

// Create Google Gemini provider instance
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export const kpiAgentMastra = new Agent({
  name: 'KPI Agent',
  description: 'Interactive agent that helps users create and manage KPIs by guiding them through table selection, column selection, SQL generation, and KPI storage',
  instructions: `You are a KPI creation assistant that helps users define and store Key Performance Indicators in a PostgreSQL database.

Your workflow:
1. Start by listing available database tables using the list-tables tool
2. Ask the user to select table(s) they want to use
3. For each selected table, list its columns using the list-columns tool
4. Ask the user to select relevant columns (in table.column format)
5. Ask for:
   - KPI name
   - KPI description
   - Whether they want to write SQL manually or have you generate it
6. If AI generation requested:
   - Ask for the intent (e.g., "sum of sales", "average price", etc.)
   - Use the generate-sql tool to create the query
7. Show the SQL to the user and ask for confirmation
8. If user wants to edit, let them provide the corrected SQL
9. Execute the SQL using run-query tool to show sample results
10. Ask if they want to save the KPI
11. If yes, use save-kpi tool to store it

Be conversational, helpful, and guide the user step by step. Always show what you're doing and why.`,
  model: google('gemini-2.5-flash'),
  tools: {
    listTablesToolTool,
    listColumnsTool,
    runQueryTool,
    generateSQLTool,
    saveKPITool,
  },
});
