import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING;
const pool = new Pool({ connectionString });

export async function ensureTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS kpi (
        name TEXT PRIMARY KEY,
        description TEXT,
        formula TEXT,
        table_name TEXT,
        columns JSONB,
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

    // Migration safety: add columns if missing
    await client.query(`ALTER TABLE kpi ADD COLUMN IF NOT EXISTS table_name TEXT;`);
    await client.query(`ALTER TABLE kpi ADD COLUMN IF NOT EXISTS columns JSONB;`);
  } finally {
    client.release();
  }
}

export async function insertInsight(data: {
  name: string;
  description?: string;
  kpi_name?: string | null;
  formula: string;
  schedule?: string;
  exec_time?: string;
  alert_high?: number | null;
  alert_low?: number | null;
}) {
  await pool.query(
    `INSERT INTO insight (name, description, kpi_name, formula, schedule, exec_time, alert_high, alert_low) VALUES ($1,$2,$3,$4,$5,$6,$7,$8);`,
    [
      data.name,
      data.description || null,
      data.kpi_name || null,
      data.formula,
      data.schedule || null,
      data.exec_time || null,
      data.alert_high || null,
      data.alert_low || null,
    ]
  );
}

export async function runQuery(sql: string, sample = 5): Promise<any[]> {
  const limitedSql = `${sql.trim().replace(/;$/, '')} LIMIT ${sample};`;
  const res = await pool.query(limitedSql);
  return res.rows;
}

export async function fetchKPIs(): Promise<{ name: string; formula: string; table_name?: string | null; columns?: string[] | null }[]> {
  const res = await pool.query(`SELECT name, formula, table_name, columns FROM kpi ORDER BY name;`);
  return res.rows.map((r) => ({
    name: r.name,
    formula: r.formula,
    table_name: r.table_name ?? undefined,
    columns: r.columns ? (Array.isArray(r.columns) ? r.columns : JSON.parse(r.columns)) : undefined,
  }));
}

export { pool };
