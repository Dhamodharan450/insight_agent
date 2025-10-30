import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Generates a SQL query based on tables, columns, intent, and filters.
 * Uses simple logic for mock generation.
 */
export const generateSQLTool = createTool({
  id: 'generate-sql',
  description: 'Generates a SQL query based on tables, columns, intent, and filters',
  inputSchema: z.object({
    tables: z.array(z.string()).describe('List of tables to query'),
    columns: z.array(z.string()).describe('List of columns (table.column format)'),
    intent: z.string().optional().describe('User intent description (sum, average, etc.)'),
    filters: z.string().optional().describe('WHERE clause conditions'),
    limit: z.number().optional().default(100),
  }),
  outputSchema: z.object({
    sql: z.string(),
  }),
  execute: async ({ context }) => {
    const selected = context.columns.length ? context.columns.join(', ') : '*';
    const from = context.tables.length ? context.tables[0] : 'public.table';
    const where = context.filters ? `WHERE ${context.filters}` : '';
    
    // Simple intent parsing
    let selectClause = selected;
    const intent = (context.intent || '').toLowerCase();
    
    if (intent.includes('sum') || intent.includes('total')) {
      const numCol = context.columns.find((c) => /(amount|count|total|price|value|qty|quantity|num)/i.test(c));
      if (numCol) selectClause = `SUM(${numCol}) as total_${numCol.replace(/[^a-zA-Z0-9]/g, '_')}`;
    } else if (intent.includes('avg') || intent.includes('average')) {
      const numCol = context.columns.find((c) => /(amount|price|value|qty|quantity|num)/i.test(c));
      if (numCol) selectClause = `AVG(${numCol}) as avg_${numCol.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
    
    const sql = `SELECT ${selectClause} FROM ${from} ${where} LIMIT ${context.limit};`;
    return { sql };
  },
});
