import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING;
const pool = new Pool({ connectionString });

// Ensure tables exist
export async function ensureTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS kpi (
        name TEXT PRIMARY KEY,
        description TEXT,
        formula TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS insight (
        id SERIAL PRIMARY KEY,
        name TEXT,
        description TEXT,
        kpi_name TEXT REFERENCES kpi(name) ON DELETE SET NULL,
        formula TEXT,
        schedule TEXT,
        exec_time TEXT,
        alert_high NUMERIC NULL,
        alert_low NUMERIC NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  } finally {
    client.release();
  }
}

export const listTablesToolTool = createTool({
  id: 'list-tables',
  description: 'Lists all tables in the PostgreSQL database',
  inputSchema: z.object({}),
  outputSchema: z.object({
    tables: z.array(z.string()),
  }),
  execute: async () => {
    const res = await pool.query(
      `SELECT table_schema || '.' || table_name as full_name 
       FROM information_schema.tables 
       WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') 
       ORDER BY table_schema, table_name;`
    );
    return { tables: res.rows.map((r) => r.full_name) };
  },
});

export const listColumnsTool = createTool({
  id: 'list-columns',
  description: 'Lists columns and their data types for a given table',
  inputSchema: z.object({
    table: z.string().describe('Table name in format schema.table or just table'),
  }),
  outputSchema: z.object({
    columns: z.array(
      z.object({
        column_name: z.string(),
        data_type: z.string(),
      })
    ),
  }),
  execute: async ({ context }) => {
    let schema = 'public';
    let tableName = context.table;
    if (context.table.includes('.')) {
      const parts = context.table.split('.');
      schema = parts[0];
      tableName = parts[1];
    }
    const res = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position;`,
      [schema, tableName]
    );
    return { columns: res.rows };
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
    const limitedSql = `${context.sql.trim().replace(/;$/, '')} LIMIT ${context.limit};`;
    const res = await pool.query(limitedSql);
    return { rows: res.rows };
  },
});

export const saveKPITool = createTool({
  id: 'save-kpi',
  description: 'Saves a KPI definition to the database',
  inputSchema: z.object({
    name: z.string(),
    description: z.string().optional(),
    formula: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    await pool.query(
      `INSERT INTO kpi (name, description, formula) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, formula = EXCLUDED.formula;`,
      [context.name, context.description || null, context.formula]
    );
    return { success: true, message: `KPI '${context.name}' saved successfully` };
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
      })
    ),
  }),
  execute: async () => {
    const res = await pool.query(`SELECT name, formula FROM kpi ORDER BY name;`);
    return { kpis: res.rows };
  },
});

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
    await pool.query(
      `INSERT INTO insight (name, description, kpi_name, formula, schedule, exec_time, alert_high, alert_low) VALUES ($1,$2,$3,$4,$5,$6,$7,$8);`,
      [
        context.name,
        context.description || null,
        context.kpi_name || null,
        context.formula,
        context.schedule || null,
        context.exec_time || null,
        context.alert_high || null,
        context.alert_low || null,
      ]
    );
    return { success: true, message: `Insight '${context.name}' saved successfully` };
  },
});
