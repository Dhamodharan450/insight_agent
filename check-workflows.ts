import { mastra } from './src/mastra';

console.log('=== Mastra Configuration ===');
console.log('Registered Workflows:');

const workflowNames = Object.keys(mastra['_workflows'] || {});
if (workflowNames.length === 0) {
  console.log('  ❌ No workflows registered!');
} else {
  workflowNames.forEach(name => {
    console.log(`  ✅ ${name}`);
  });
}

console.log('\nRegistered Agents:');
const agentNames = Object.keys(mastra['_agents'] || {});
if (agentNames.length === 0) {
  console.log('  ❌ No agents registered!');
} else {
  agentNames.forEach(name => {
    console.log(`  ✅ ${name}`);
  });
}

console.log('\n=== Testing Workflow Access ===');
try {
  const workflow1 = mastra.getWorkflow('kpiWorkflow');
  console.log('✅ kpiWorkflow accessible');
} catch (e) {
  console.log('❌ kpiWorkflow not found');
}

try {
  const workflow2 = mastra.getWorkflow('insightWorkflow');
  console.log('✅ insightWorkflow accessible');
} catch (e) {
  console.log('❌ insightWorkflow not found');
}

try {
  const workflow3 = mastra.getWorkflow('simpleKpiWorkflow');
  console.log('✅ simpleKpiWorkflow accessible');
} catch (e) {
  console.log('❌ simpleKpiWorkflow not found');
}
