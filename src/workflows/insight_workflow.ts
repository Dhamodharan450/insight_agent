// Mastra workflows overview: https://mastra.ai/docs/workflows/overview
// Project workflow: Automated insight generation (insight-generation-workflow)
// Accepts single-line prompt: "kpi_name: what insight to generate"
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { fetchKPIsTool, runQueryTool, saveInsightTool } from '../tools';

// Step 1: Parse prompt and fetch KPI data
const parsePromptAndFetchKPIStep = createStep({
  id: 'parse-fetch-kpi',
  description: 'Parse user prompt and fetch KPI data',
  inputSchema: z.object({
    prompt: z.string().describe('Single line: "kpi_name: what insight to generate"'),
    insightName: z.string().optional().describe('Optional insight name, auto-generated if not provided'),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    kpiFormula: z.string(),
    insightDescription: z.string(),
    insightName: z.string(),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { prompt, insightName } = inputData;
    
    // Parse prompt: expect format "kpi_name: description"
    const parts = prompt.split(':').map(p => p.trim());
    if (parts.length < 2) {
      throw new Error('Invalid prompt format. Expected: "kpi_name: insight description"');
    }
    
    const kpiName = parts[0];
    const description = parts.slice(1).join(':').trim();
    
    // Fetch all KPIs to find the requested one
    const kpisResult = await fetchKPIsTool.execute({
      context: {},
      mastra,
      runtimeContext,
    });
    
    const selectedKPI = kpisResult.kpis.find((k: any) => k.name === kpiName);
    if (!selectedKPI) {
      const availableKPIs = kpisResult.kpis.map((k: any) => k.name).join(', ');
      throw new Error(`KPI '${kpiName}' not found. Available KPIs: ${availableKPIs}`);
    }
    
    const generatedInsightName = insightName || `insight_${kpiName}_${Date.now()}`;
    
    return {
      kpiName,
      kpiFormula: selectedKPI.formula,
      insightDescription: description,
      insightName: generatedInsightName,
    };
  },
});

// Step 2: Execute KPI query to gather data
const executeKPIQueryStep = createStep({
  id: 'execute-kpi-query',
  description: 'Execute KPI SQL query to gather data automatically',
  inputSchema: z.object({
    kpiName: z.string(),
    kpiFormula: z.string(),
    insightDescription: z.string(),
    insightName: z.string(),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    kpiData: z.array(z.record(z.string(), z.any())),
    insightDescription: z.string(),
    insightName: z.string(),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { kpiFormula, kpiName, insightDescription, insightName } = inputData;

    const result = await runQueryTool.execute({
      context: { sql: kpiFormula, limit: 10 },
      mastra,
      runtimeContext,
    });

    return {
      kpiName,
      kpiData: result.rows,
      insightDescription,
      insightName,
    };
  },
});

// Step 3: Generate insight using agent
const generateInsightStep = createStep({
  id: 'generate-insight',
  description: 'Automatically generate insight from KPI data using AI',
  inputSchema: z.object({
    kpiName: z.string(),
    kpiData: z.array(z.record(z.string(), z.any())),
    insightDescription: z.string(),
    insightName: z.string(),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    insightText: z.string(),
    insightName: z.string(),
    kpiData: z.array(z.record(z.string(), z.any())),
    insightDescription: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { kpiName, kpiData, insightName, insightDescription } = inputData;

    // Use the insight agent to generate meaningful insights
    const insightAgent = mastra.getAgent('insightAgent');

    const prompt = `
Analyze the following KPI data and generate an insight:

KPI: ${kpiName}
Description: ${insightDescription}

Data:
${JSON.stringify(kpiData.slice(0, 5), null, 2)}

Provide a clear, data-driven insight that is actionable and based on the actual numbers.
`;

    const runtimeContext = (mastra as any)?.runtimeContext;
    const memoryOpt = runtimeContext
      ? {
          memory: {
            thread: runtimeContext.get?.('thread') ?? 'default-thread',
            resource: runtimeContext.get?.('resource') ?? 'default-resource',
          },
        }
      : { memory: { thread: 'default-thread', resource: 'default-resource' } };

    const response = await insightAgent.generate(prompt, memoryOpt);

    return {
      kpiName,
      insightText: response.text,
      insightName,
      kpiData,
      insightDescription,
    };
  },
});

// Step 4: Show insight details and confirm save
const confirmAndSaveInsightStep = createStep({
  id: 'confirm-save-insight',
  description: 'Show all insight details and ask for save confirmation',
  inputSchema: z.object({
    kpiName: z.string(),
    insightText: z.string(),
    insightName: z.string(),
    kpiData: z.array(z.record(z.string(), z.any())),
    insightDescription: z.string(),
  }),
  resumeSchema: z.object({
    confirmed: z.boolean().describe('Set to true to save the insight'),
    editedInsight: z.string().optional().describe('Optional: provide edited insight text'),
    editedName: z.string().optional().describe('Optional: provide edited insight name'),
  }),
  suspendSchema: z.object({
    insightDetails: z.object({
      name: z.string(),
      description: z.string(),
      kpiName: z.string(),
      generatedInsight: z.string(),
      sampleData: z.array(z.record(z.string(), z.any())),
    }),
    message: z.string(),
  }),
  outputSchema: z.object({
    insightName: z.string(),
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend, mastra, runtimeContext }) => {
    const { kpiName, insightText, insightName, kpiData, insightDescription } = inputData;

    if (!resumeData?.confirmed) {
      return await suspend({
        insightDetails: {
          name: insightName,
          description: insightDescription,
          kpiName,
          generatedInsight: insightText,
          sampleData: kpiData.slice(0, 5),
        },
        message: 'Review the insight details above. Set confirmed=true to save, or provide editedInsight/editedName to modify.',
      });
    }

    const finalInsight = resumeData.editedInsight || insightText;
    const finalName = resumeData.editedName || insightName;

    const result = await saveInsightTool.execute({
      context: {
        name: finalName,
        description: insightDescription,
        kpi_name: kpiName,
        formula: finalInsight,
      },
      mastra,
      runtimeContext,
    });

    return {
      insightName: finalName,
      success: result.success,
      message: `Insight '${finalName}' saved successfully! Based on KPI: ${kpiName}`,
    };
  },
});

// Create the automated Insight workflow
export const insightWorkflow = createWorkflow({
  id: 'insight-generation-workflow',
  inputSchema: z.object({
    prompt: z.string().describe('Single line: "kpi_name: what insight to generate"'),
    insightName: z.string().optional().describe('Optional insight name'),
  }),
  outputSchema: z.object({
    insightName: z.string(),
    success: z.boolean(),
    message: z.string(),
  }),
})
  .then(parsePromptAndFetchKPIStep)
  .then(executeKPIQueryStep)
  .then(generateInsightStep)
  .then(confirmAndSaveInsightStep)
  .commit();
