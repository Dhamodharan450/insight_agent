import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  listTablesToolTool,
  listColumnsTool,
  runQueryTool,
  saveKPITool,
} from '../tools/db_tools';
import { generateSQLTool } from '../tools/sql_generator';

// Simple workflow without agents - direct user input at each step

const getTablesStep = createStep({
  id: 'get-tables',
  description: 'Fetch available database tables',
  inputSchema: z.object({
    start: z.boolean(),
  }),
  outputSchema: z.object({
    tables: z.array(z.string()),
  }),
  execute: async ({ mastra, runtimeContext }) => {
    const result = await listTablesToolTool.execute({
      context: {},
      mastra,
      runtimeContext,
    });
    return { tables: result.tables };
  },
});

const selectTableStep = createStep({
  id: 'select-table',
  description: 'User selects a table for the KPI',
  inputSchema: z.object({
    tables: z.array(z.string()),
  }),
  resumeSchema: z.object({
    tableName: z.string().describe('The full table name (e.g., public.bitwise_num)'),
  }),
  suspendSchema: z.object({
    tables: z.array(z.string()),
    message: z.string(),
  }),
  outputSchema: z.object({
    tableName: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData?.tableName) {
      return await suspend({
        tables: inputData.tables,
        message: 'Select a table by providing the full table name (e.g., public.bitwise_num)',
      });
    }
    return { tableName: resumeData.tableName };
  },
});

const getColumnsStep = createStep({
  id: 'get-columns',
  description: 'Fetch columns for selected table',
  inputSchema: z.object({
    tableName: z.string(),
  }),
  outputSchema: z.object({
    tableName: z.string(),
    columns: z.array(z.object({
      column_name: z.string(),
      data_type: z.string(),
    })),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const result = await listColumnsTool.execute({
      context: { table: inputData.tableName },
      mastra,
      runtimeContext,
    });
    return {
      tableName: inputData.tableName,
      columns: result.columns,
    };
  },
});

const defineKPIStep = createStep({
  id: 'define-kpi',
  description: 'User defines KPI details and SQL',
  inputSchema: z.object({
    tableName: z.string(),
    columns: z.array(z.object({
      column_name: z.string(),
      data_type: z.string(),
    })),
  }),
  resumeSchema: z.object({
    kpiName: z.string().describe('Name for the KPI'),
    kpiDescription: z.string().describe('Description of the KPI'),
    useAI: z.boolean().describe('true = use AI to generate SQL, false = provide manual SQL'),
    sqlIntent: z.string().optional().describe('If useAI=true: What to calculate (e.g., "count all rows")'),
    manualSQL: z.string().optional().describe('If useAI=false: The SQL query to use'),
  }),
  suspendSchema: z.object({
    tableName: z.string(),
    columns: z.array(z.object({
      column_name: z.string(),
      data_type: z.string(),
    })),
    message: z.string(),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    kpiDescription: z.string(),
    sqlQuery: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend, mastra, runtimeContext }) => {
    if (!resumeData?.kpiName) {
      return await suspend({
        tableName: inputData.tableName,
        columns: inputData.columns,
        message: 'Provide: kpiName, kpiDescription, useAI (true/false), and either sqlIntent OR manualSQL',
      });
    }

    let sqlQuery: string;

    if (resumeData.useAI && resumeData.sqlIntent) {
      // Generate SQL using AI
      const columnNames = inputData.columns.map(c => `${inputData.tableName}.${c.column_name}`);
      const result = await generateSQLTool.execute({
        context: {
          intent: resumeData.sqlIntent,
          tables: [inputData.tableName],
          columns: columnNames,
          limit: 100,
        },
        mastra,
        runtimeContext,
      });
      sqlQuery = result.sql;
    } else if (!resumeData.useAI && resumeData.manualSQL) {
      sqlQuery = resumeData.manualSQL;
    } else {
      throw new Error('Provide either sqlIntent (with useAI=true) or manualSQL (with useAI=false)');
    }

    return {
      kpiName: resumeData.kpiName,
      kpiDescription: resumeData.kpiDescription,
      sqlQuery,
    };
  },
});

const previewKPIStep = createStep({
  id: 'preview-kpi',
  description: 'Preview KPI results',
  inputSchema: z.object({
    kpiName: z.string(),
    kpiDescription: z.string(),
    sqlQuery: z.string(),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    kpiDescription: z.string(),
    sqlQuery: z.string(),
    preview: z.array(z.record(z.string(), z.any())),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const result = await runQueryTool.execute({
      context: { sql: inputData.sqlQuery, limit: 5 },
      mastra,
      runtimeContext,
    });

    return {
      kpiName: inputData.kpiName,
      kpiDescription: inputData.kpiDescription,
      sqlQuery: inputData.sqlQuery,
      preview: result.rows,
    };
  },
});

const saveKPIStep = createStep({
  id: 'save-kpi',
  description: 'Save the KPI to database',
  inputSchema: z.object({
    kpiName: z.string(),
    kpiDescription: z.string(),
    sqlQuery: z.string(),
    preview: z.array(z.record(z.string(), z.any())),
  }),
  resumeSchema: z.object({
    confirmed: z.boolean().describe('Set to true to save the KPI'),
    editedSQL: z.string().optional().describe('Optional: Provide edited SQL if you want to modify it'),
  }),
  suspendSchema: z.object({
    sqlQuery: z.string(),
    preview: z.array(z.record(z.string(), z.any())),
    message: z.string(),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend, mastra, runtimeContext }) => {
    if (!resumeData?.confirmed) {
      return await suspend({
        sqlQuery: inputData.sqlQuery,
        preview: inputData.preview,
        message: 'Review the SQL and preview. Set confirmed=true to save, or provide editedSQL to modify',
      });
    }

    const finalSQL = resumeData.editedSQL || inputData.sqlQuery;

    const result = await saveKPITool.execute({
      context: {
        name: inputData.kpiName,
        description: inputData.kpiDescription,
        formula: finalSQL,
      },
      mastra,
      runtimeContext,
    });

    return {
      kpiName: inputData.kpiName,
      success: result.success,
      message: result.message,
    };
  },
});

export const simpleKpiWorkflow = createWorkflow({
  id: 'simple-kpi-workflow',
  inputSchema: z.object({
    start: z.boolean(),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    success: z.boolean(),
    message: z.string(),
  }),
})
  .then(getTablesStep)
  .then(selectTableStep)
  .then(getColumnsStep)
  .then(defineKPIStep)
  .then(previewKPIStep)
  .then(saveKPIStep)
  .commit();
