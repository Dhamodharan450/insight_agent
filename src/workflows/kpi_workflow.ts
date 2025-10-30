import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  listTablesToolTool,
  listColumnsTool,
  runQueryTool,
  saveKPITool,
} from '../tools/db_tools';
import { generateSQLTool } from '../tools/sql_generator';

// Step 1: List available tables
const listTablesStep = createStep({
  id: 'list-tables',
  description: 'List all available database tables',
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

// Step 2: Get user to select tables (suspend/resume pattern)
const selectTablesStep = createStep({
  id: 'select-tables',
  description: 'User selects which tables to use for KPI by index',
  inputSchema: z.object({
    tables: z.array(z.string()),
  }),
  resumeSchema: z.object({
    selectedTableIndexes: z.array(z.number()).describe('Array of table indexes to select (e.g., [0, 1])'),
  }),
  suspendSchema: z.object({
    availableTables: z.array(z.object({
      index: z.number(),
      name: z.string(),
    })),
    message: z.string(),
  }),
  outputSchema: z.object({
    selectedTables: z.array(z.string()),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const { tables } = inputData;
    const { selectedTableIndexes } = resumeData ?? {};

    if (!selectedTableIndexes || selectedTableIndexes.length === 0) {
      return await suspend({
        availableTables: tables.map((name, index) => ({ index, name })),
        message: 'Select tables by providing their index numbers. Example: {"selectedTableIndexes": [0]}',
      });
    }

    // Validate indexes
    const invalidIndexes = selectedTableIndexes.filter(i => i < 0 || i >= tables.length);
    if (invalidIndexes.length > 0) {
      throw new Error(`Invalid table indexes: ${invalidIndexes.join(', ')}. Must be between 0 and ${tables.length - 1}`);
    }

    const selectedTables = selectedTableIndexes.map(i => tables[i]);

    return { selectedTables };
  },
});

// Step 3: List columns for selected tables
const listColumnsStep = createStep({
  id: 'list-columns',
  description: 'List columns for selected tables',
  inputSchema: z.object({
    selectedTables: z.array(z.string()),
  }),
  outputSchema: z.object({
    columns: z.record(z.string(), z.array(z.object({
      column_name: z.string(),
      data_type: z.string(),
    }))),
    selectedTables: z.array(z.string()),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { selectedTables } = inputData;
    const columns: Record<string, { column_name: string; data_type: string }[]> = {};

    for (const table of selectedTables) {
      const result = await listColumnsTool.execute({
        context: { table: table },
        mastra,
        runtimeContext,
      });
      columns[table] = result.columns;
    }

    return { columns, selectedTables };
  },
});

// Step 4: Get user to select columns and provide KPI details
const selectColumnsAndDetailsStep = createStep({
  id: 'select-columns-details',
  description: 'User selects columns by index and provides KPI details',
  inputSchema: z.object({
    columns: z.record(z.string(), z.array(z.object({
      column_name: z.string(),
      data_type: z.string(),
    }))),
    selectedTables: z.array(z.string()),
  }),
  resumeSchema: z.object({
    selectedColumnsByTable: z.record(z.string(), z.array(z.number())).describe('Object with table names as keys and array of column indexes as values'),
    kpiName: z.string().describe('Name for your KPI'),
    kpiDescription: z.string().describe('Description of what this KPI measures'),
    useAIGeneration: z.boolean().describe('Set to true to use AI to generate SQL, false to provide manual SQL'),
    sqlIntent: z.string().optional().describe('If using AI: describe what you want to calculate (e.g., "count all rows")'),
    manualSQL: z.string().optional().describe('If not using AI: provide the complete SQL query'),
  }),
  suspendSchema: z.object({
    availableColumns: z.record(z.string(), z.array(z.object({
      index: z.number(),
      column_name: z.string(),
      data_type: z.string(),
    }))),
    message: z.string(),
  }),
  outputSchema: z.object({
    selectedColumns: z.array(z.string()),
    selectedTables: z.array(z.string()),
    kpiName: z.string(),
    kpiDescription: z.string(),
    useAIGeneration: z.boolean(),
    sqlIntent: z.string().optional(),
    manualSQL: z.string().optional(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const { columns, selectedTables } = inputData;

    if (!resumeData?.selectedColumnsByTable || !resumeData?.kpiName) {
      // Prepare columns with indexes
      const columnsWithIndexes: Record<string, Array<{ index: number; column_name: string; data_type: string }>> = {};
      for (const table of selectedTables) {
        columnsWithIndexes[table] = columns[table].map((col, index) => ({
          index,
          column_name: col.column_name,
          data_type: col.data_type,
        }));
      }

      return await suspend({
        availableColumns: columnsWithIndexes,
        message: 'Provide: 1) selectedColumnsByTable (e.g., {"public.bitwise_num": [0, 1]}), 2) kpiName, 3) kpiDescription, 4) useAIGeneration (true/false), 5) sqlIntent OR manualSQL',
      });
    }

    // Convert column indexes to column names in table.column format
    const selectedColumns: string[] = [];
    for (const [table, indexes] of Object.entries(resumeData.selectedColumnsByTable)) {
      if (!columns[table]) {
        throw new Error(`Table '${table}' not found in selected tables`);
      }

      for (const index of indexes) {
        if (index < 0 || index >= columns[table].length) {
          throw new Error(`Invalid column index ${index} for table '${table}'. Must be between 0 and ${columns[table].length - 1}`);
        }
        const columnName = columns[table][index].column_name;
        selectedColumns.push(`${table}.${columnName}`);
      }
    }

    return {
      selectedColumns,
      selectedTables,
      kpiName: resumeData.kpiName,
      kpiDescription: resumeData.kpiDescription,
      useAIGeneration: resumeData.useAIGeneration,
      sqlIntent: resumeData.sqlIntent,
      manualSQL: resumeData.manualSQL,
    };
  },
});

// Step 5: Generate or use manual SQL
const generateSQLStep = createStep({
  id: 'generate-sql',
  description: 'Generate SQL query using AI or use manual SQL',
  inputSchema: z.object({
    selectedColumns: z.array(z.string()),
    selectedTables: z.array(z.string()),
    kpiName: z.string(),
    kpiDescription: z.string(),
    useAIGeneration: z.boolean(),
    sqlIntent: z.string().optional(),
    manualSQL: z.string().optional(),
  }),
  outputSchema: z.object({
    sqlQuery: z.string(),
    kpiName: z.string(),
    kpiDescription: z.string(),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { useAIGeneration, sqlIntent, manualSQL, selectedColumns, selectedTables, kpiName, kpiDescription } = inputData;

    let sqlQuery: string;

    if (useAIGeneration && sqlIntent) {
      const result = await generateSQLTool.execute({
        context: {
          intent: sqlIntent,
          tables: selectedTables,
          columns: selectedColumns,
          limit: 10,
        },
        mastra,
        runtimeContext,
      });
      sqlQuery = result.sql;
    } else if (manualSQL) {
      sqlQuery = manualSQL;
    } else {
      throw new Error('Either AI generation with intent or manual SQL must be provided');
    }

    return {
      sqlQuery,
      kpiName,
      kpiDescription,
    };
  },
});

// Step 6: Execute SQL to preview results
const previewResultsStep = createStep({
  id: 'preview-results',
  description: 'Execute SQL query to show preview',
  inputSchema: z.object({
    sqlQuery: z.string(),
    kpiName: z.string(),
    kpiDescription: z.string(),
  }),
  outputSchema: z.object({
    sqlQuery: z.string(),
    kpiName: z.string(),
    kpiDescription: z.string(),
    previewResults: z.array(z.record(z.string(), z.any())),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { sqlQuery, kpiName, kpiDescription } = inputData;

    const result = await runQueryTool.execute({
      context: { sql: sqlQuery, limit: 5 },
      mastra,
      runtimeContext,
    });

    return {
      sqlQuery,
      kpiName,
      kpiDescription,
      previewResults: result.rows,
    };
  },
});

// Step 7: Confirm and save KPI
const confirmAndSaveStep = createStep({
  id: 'confirm-save',
  description: 'User confirms and saves the KPI',
  inputSchema: z.object({
    sqlQuery: z.string(),
    kpiName: z.string(),
    kpiDescription: z.string(),
    previewResults: z.array(z.record(z.string(), z.any())),
  }),
  resumeSchema: z.object({
    confirmed: z.boolean(),
    editedSQL: z.string().optional(),
  }),
  suspendSchema: z.object({
    sqlQuery: z.string(),
    previewResults: z.array(z.record(z.string(), z.any())),
    message: z.string(),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    success: z.boolean(),
  }),
  execute: async ({ inputData, resumeData, suspend, mastra, runtimeContext }) => {
    const { sqlQuery, kpiName, kpiDescription, previewResults } = inputData;
    const { confirmed, editedSQL } = resumeData ?? {};

    if (!confirmed) {
      return await suspend({
        sqlQuery,
        previewResults,
        message: 'Review the SQL query and results. Confirm to save or provide edited SQL.',
      });
    }

    const finalSQL = editedSQL || sqlQuery;

    const result = await saveKPITool.execute({
      context: {
        name: kpiName,
        description: kpiDescription,
        formula: finalSQL,
      },
      mastra,
      runtimeContext,
    });

    return {
      kpiName: kpiName,
      success: result.success,
    };
  },
});

// Create the KPI workflow
export const kpiWorkflow = createWorkflow({
  id: 'kpi-creation-workflow',
  inputSchema: z.object({
    start: z.boolean(),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    success: z.boolean(),
  }),
})
  .then(listTablesStep)
  .then(selectTablesStep)
  .then(listColumnsStep)
  .then(selectColumnsAndDetailsStep)
  .then(generateSQLStep)
  .then(previewResultsStep)
  .then(confirmAndSaveStep)
  .commit();
