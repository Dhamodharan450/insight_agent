import 'dotenv/config';
import { Agent } from '@mastra/core/agent';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { listTablesToolTool, listColumnsTool, runQueryTool } from '../tools/db_tools';
import { generateSQLTool } from '../tools/sql_generator';

// Create Google Gemini provider instance
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export const sqlQueryAgentMastra = new Agent({
  name: 'SQL Query Agent',
  description: 'Interactive agent that helps users explore databases and execute SQL queries',
  instructions: `You are a database exploration assistant that helps users navigate and query their PostgreSQL database.

Your workflow:
1. Start by listing available tables using list-tables tool
2. When user asks about specific tables, show their columns using list-columns tool
3. Help users construct SQL queries based on their questions
4. Use generate-sql tool if they want AI assistance writing the query
5. Execute queries using run-query tool and present results clearly
6. Explain the results and suggest follow-up analyses if relevant

Be helpful, explain technical concepts clearly, and ensure users understand their data.`,
  model: google('gemini-2.5-flash'),
  tools: {
    listTablesToolTool,
    listColumnsTool,
    runQueryTool,
    generateSQLTool,
  },
});
