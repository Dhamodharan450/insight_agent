/**
 * Simple Demo: Using Mastra Agents Directly
 * 
 * This demo shows how to interact with Mastra agents using the AI SDK's streamText API.
 * Before running this demo, make sure you've:
 * 1. Run `npm install` to install all dependencies
 * 2. Set up your .env file with DATABASE_URL and OPENROUTER_API_KEY
 * 3. Created the database tables (kpi and insight)
 */

import 'dotenv/config';
import { mastra } from './mastra/index';

async function runKPIAgentDemo() {
  console.log('=== KPI Agent Demo ===\n');

  // Get the KPI agent from the Mastra instance
  const kpiAgent = mastra.getAgent('kpiAgent');

  // Example: List tables and create a KPI
  const messages = [
    {
      role: 'user' as const,
      content: 'I want to create a KPI. First, show me the available tables.',
    },
  ];

  // Generate response
  const result = await kpiAgent.generate(messages);

  // Print the agent's response
  console.log('Agent response:', result.text);

  console.log('\n\n=== Demo Complete ===');
}

async function runInsightAgentDemo() {
  console.log('=== Insight Agent Demo ===\n');

  const insightAgent = mastra.getAgent('insightAgent');

  const messages = [
    {
      role: 'user' as const,
      content: 'Show me all available KPIs so I can create an insight.',
    },
  ];

  const result = await insightAgent.generate(messages);

  console.log('Agent response:', result.text);

  console.log('\n\n=== Demo Complete ===');
}

async function runSQLQueryAgentDemo() {
  console.log('=== SQL Query Agent Demo ===\n');

  const sqlAgent = mastra.getAgent('sqlQueryAgent');

  const messages = [
    {
      role: 'user' as const,
      content: 'List all tables in the database.',
    },
  ];

  const result = await sqlAgent.generate(messages);

  console.log('Agent response:', result.text);

  console.log('\n\n=== Demo Complete ===');
}

// Run the demo
const demoType = process.argv[2] || 'kpi';

(async () => {
  try {
    if (demoType === 'kpi') {
      await runKPIAgentDemo();
    } else if (demoType === 'insight') {
      await runInsightAgentDemo();
    } else if (demoType === 'sql') {
      await runSQLQueryAgentDemo();
    } else {
      console.log('Usage: npm start [kpi|insight|sql]');
      console.log('Example: npm start kpi');
    }
  } catch (error) {
    console.error('Error running demo:', error);
  }
})();
