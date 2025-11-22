// Mastra workflows overview: https://mastra.ai/docs/workflows/overview
// Project workflow: Insight generation (insight-generation-workflow)
// See WORKFLOWS.md in project root for mapping and usage notes.
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { fetchKPIsTool, runQueryTool, saveInsightTool } from '../tools';

// Step 1: Fetch available KPIs
const fetchKPIsStep = createStep({
  id: 'fetch-kpis',
  description: 'Fetch all available KPIs',
  inputSchema: z.object({
    start: z.boolean(),
  }),
  outputSchema: z.object({
    kpis: z.array(
      z.object({
        name: z.string(),
        formula: z.string(),
      })
    ),
  }),
  execute: async ({ mastra, runtimeContext }) => {
    const result = await fetchKPIsTool.execute({
      context: {},
      mastra,
      runtimeContext,
    });
    return { kpis: result.kpis };
  },
});

// Step 2: User selects KPI and provides insight details
const selectKPIStep = createStep({
  id: 'select-kpi',
  description: 'User selects KPI and provides insight details',
  inputSchema: z.object({
    kpis: z.array(
      z.object({
        name: z.string(),
        formula: z.string(),
      })
    ),
  }),
  resumeSchema: z.object({
    kpiName: z.string(),
    insightName: z.string(),
    insightDescription: z.string(),
  }),
  suspendSchema: z.object({
    availableKPIs: z.array(
      z.object({
        name: z.string(),
      })
    ),
    message: z.string(),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    kpiFormula: z.string(),
    insightName: z.string(),
    insightDescription: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const { kpis } = inputData;

    if (!resumeData?.kpiName || !resumeData?.insightName) {
      return await suspend({
        availableKPIs: kpis.map((k) => ({ name: k.name })),
        message: 'Select a KPI and provide insight name and description',
      });
    }

    const selectedKPI = kpis.find((k) => k.name === resumeData.kpiName);
    if (!selectedKPI) {
      throw new Error(`KPI '${resumeData.kpiName}' not found`);
    }

    return {
      kpiName: resumeData.kpiName,
      kpiFormula: selectedKPI.formula,
      insightName: resumeData.insightName,
      insightDescription: resumeData.insightDescription,
    };
  },
});

// Step 3: Execute KPI query to gather data
const executeKPIQueryStep = createStep({
  id: 'execute-kpi-query',
  description: 'Execute KPI SQL query to gather data',
  inputSchema: z.object({
    kpiName: z.string(),
    kpiFormula: z.string(),
    insightName: z.string(),
    insightDescription: z.string(),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    kpiData: z.array(z.record(z.string(), z.any())),
    insightName: z.string(),
    insightDescription: z.string(),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { kpiFormula, kpiName, insightName, insightDescription } = inputData;

    const result = await runQueryTool.execute({
      context: { sql: kpiFormula, limit: 10 },
      mastra,
      runtimeContext,
    });

    return {
      kpiName,
      kpiData: result.rows,
      insightName,
      insightDescription,
    };
  },
});

// Step 4: Generate insight using agent
const generateInsightStep = createStep({
  id: 'generate-insight',
  description: 'Generate insight from KPI data using AI',
  inputSchema: z.object({
    kpiName: z.string(),
    kpiData: z.array(z.record(z.string(), z.any())),
    insightName: z.string(),
    insightDescription: z.string(),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    insightText: z.string(),
    insightName: z.string(),
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

    // Prefer passing memory thread/resource if provided via runtimeContext so generated
    // insights can leverage conversation history. Fall back to sensible defaults.
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
    };
  },
});

// Step 5: Confirm and save insight
const confirmAndSaveInsightStep = createStep({
  id: 'confirm-save-insight',
  description: 'User confirms and saves the insight',
  inputSchema: z.object({
    kpiName: z.string(),
    insightText: z.string(),
    insightName: z.string(),
  }),
  resumeSchema: z.object({
    confirmed: z.boolean(),
    editedInsight: z.string().optional(),
  }),
  suspendSchema: z.object({
    insightText: z.string(),
    message: z.string(),
  }),
  outputSchema: z.object({
    insightName: z.string(),
    success: z.boolean(),
  }),
  execute: async ({ inputData, resumeData, suspend, mastra, runtimeContext }) => {
    const { kpiName, insightText, insightName } = inputData;

    if (!resumeData?.confirmed) {
      return await suspend({
        insightText,
        message: 'Review the generated insight. Confirm to save or provide edited version.',
      });
    }

    const finalInsight = resumeData.editedInsight || insightText;

    const result = await saveInsightTool.execute({
      context: {
        name: insightName,
        kpi_name: kpiName,
        formula: finalInsight,
      },
      mastra,
      runtimeContext,
    });

    return {
      insightName,
      success: result.success,
    };
  },
});

// Create the Insight workflow
export const insightWorkflow = createWorkflow({
  id: 'insight-generation-workflow',
  inputSchema: z.object({
    start: z.boolean(),
  }),
  outputSchema: z.object({
    insightName: z.string(),
    success: z.boolean(),
  }),
})
  .then(fetchKPIsStep)
  .then(selectKPIStep)
  .then(executeKPIQueryStep)
  .then(generateInsightStep)
  .then(confirmAndSaveInsightStep)
  .commit();
