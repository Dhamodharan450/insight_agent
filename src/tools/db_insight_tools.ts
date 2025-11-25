import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { insertInsight, runQuery as sharedRunQuery, fetchKPIs } from './db_shared';

export const saveInsightTool = createTool({
  id: 'save-insight',
  description: 'Saves an insight definition to the database',
  inputSchema: z.object({
    name: z.string(),
    description: z.string().optional(),
    kpi_name: z.string().optional(),
    formula: z.string(),
    schedule: z.string().optional(),
    exec_time: z.string().optional(),
    alert_high: z.number().optional(),
    alert_low: z.number().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    await insertInsight({
      name: context.name,
      description: context.description ?? undefined,
      kpi_name: context.kpi_name ?? undefined,
      formula: context.formula,
      schedule: context.schedule ?? undefined,
      exec_time: context.exec_time ?? undefined,
      alert_high: context.alert_high ?? undefined,
      alert_low: context.alert_low ?? undefined,
    });
    return { success: true, message: `Insight '${context.name}' saved successfully` };
  },
});

export const runQueryTool = createTool({
  id: 'run-query',
  description: 'Executes a SQL query and returns sample results',
  inputSchema: z.object({
    sql: z.string().describe('SQL query to execute'),
    limit: z.number().optional().describe('Number of rows to return').default(5),
  }),
  outputSchema: z.object({
    rows: z.array(z.any()),
  }),
  execute: async ({ context }) => {
    const rows = await sharedRunQuery(context.sql, context.limit ?? 5);
    return { rows };
  },
});

export const fetchKPIsTool = createTool({
  id: 'fetch-kpis',
  description: 'Fetches all KPIs from the database',
  inputSchema: z.object({}),
  outputSchema: z.object({
    kpis: z.array(
      z.object({
        name: z.string(),
        formula: z.string(),
        table_name: z.string().optional(),
        columns: z.array(z.string()).optional(),
      })
    ),
  }),
  execute: async ({ context }) => {
    const kpisRaw = await fetchKPIs();
    // normalize null table_name to undefined
    const kpis = kpisRaw.map((r) => ({
      ...r,
      table_name: r.table_name ?? undefined,
      columns: r.columns ?? undefined,
    }));
    return { kpis };
  },
});
