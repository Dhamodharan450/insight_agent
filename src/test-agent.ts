import 'dotenv/config';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { Agent } from '@mastra/core/agent';

// Create OpenRouter provider
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Simple test agent without database tools
const testAgent = new Agent({
  name: 'Test Agent',
  description: 'Simple test agent to verify Mastra is working',
  instructions: 'You are a helpful assistant. Answer questions briefly and clearly.',
  model: openrouter(process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free'),
});

async function main() {
  console.log('=== Testing Mastra Agent ===\n');
  
  try {
    const result = await testAgent.generate('Hello! Can you tell me what 2+2 is?');
    
    console.log('Agent response:', result.text);
    console.log('\n✅ Mastra is working correctly!');
    console.log('\nNext steps:');
    console.log('1. Set up PostgreSQL database');
    console.log('2. Create the kpi and insight tables');
    console.log('3. Run: npm start');
  } catch (error) {
    console.error('❌ Error:', error);
    console.log('\nTroubleshooting:');
    console.log('1. Check your .env file exists');
    console.log('2. Verify OPENROUTER_API_KEY is set');
    console.log('3. Ensure you have internet connection');
  }
}

main();
