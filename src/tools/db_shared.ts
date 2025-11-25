import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let databaseUrl = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || process.env.MYSQL_CONNECTION_STRING || '';
// Normalize SQLAlchemy-style URLs (e.g. mysql+pymysql://) to a form mysql2 can accept
if (databaseUrl.startsWith('mysql+')) {
  databaseUrl = databaseUrl.replace(/^mysql\+[^:]+:/, 'mysql:');
}
if (databaseUrl.startsWith('postgresql://')) {
  // normalize to postgres protocol
  databaseUrl = databaseUrl.replace(/^postgresql:\/\//, 'postgres://');
}

let clientType = (process.env.DATABASE_CLIENT || '').toLowerCase();
if (!clientType) {
  if (databaseUrl.startsWith('mysql://') || databaseUrl.startsWith('mariadb://')) clientType = 'mysql';
  else clientType = 'postgres';
}

let pool: any;
if (clientType === 'postgres') {
  pool = new PgPool({ connectionString: databaseUrl });
} else {
  // mysql
  if (databaseUrl) {
    pool = mysql.createPool(databaseUrl);
  } else {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || undefined,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
}

export async function ensureTables() {
  if (clientType === 'postgres') {
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
  } else {
    const conn = await pool.getConnection();
    try {
      await conn.execute(`
      CREATE TABLE IF NOT EXISTS kpi (
        name VARCHAR(255) PRIMARY KEY,
        description TEXT,
        formula TEXT,
        table_name TEXT,
        columns JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

      await conn.execute(`
      CREATE TABLE IF NOT EXISTS insight (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255),
        description TEXT,
        kpi_name VARCHAR(255),
        formula TEXT,
        schedule TEXT,
        exec_time TEXT,
        alert_high DOUBLE NULL,
        alert_low DOUBLE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (kpi_name)
      );
    `);

      // Migration safety: add columns if missing (MySQL 8+ supports IF NOT EXISTS in ADD COLUMN)
      try {
        await conn.execute(`ALTER TABLE kpi ADD COLUMN IF NOT EXISTS table_name TEXT;`);
        await conn.execute(`ALTER TABLE kpi ADD COLUMN IF NOT EXISTS columns JSON;`);
      } catch (err) {
        // older MySQL versions may not support IF NOT EXISTS for ADD COLUMN; ignore error
      }
    } finally {
      conn.release();
    }
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
  if (clientType === 'postgres') {
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
  } else {
    await pool.execute(
      `INSERT INTO insight (name, description, kpi_name, formula, schedule, exec_time, alert_high, alert_low) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
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
}

export async function runQuery(sql: string, sample = 5): Promise<any[]> {
  // If the SQL already contains a LIMIT (case-insensitive), don't append another LIMIT.
  const cleaned = sql.trim().replace(/;$/, '');
  const hasLimit = /\blimit\b/i.test(cleaned);
  const limitedSql = hasLimit ? cleaned : `${cleaned} LIMIT ${sample}`;

  if (clientType === 'postgres') {
    const res = await pool.query(limitedSql);
    return res.rows;
  }
  const [rows] = await pool.query(limitedSql);
  return rows as any[];
}

export async function fetchKPIs(): Promise<{ name: string; formula: string; table_name?: string | null; columns?: string[] | null }[]> {
  if (clientType === 'postgres') {
    const res = await pool.query(`SELECT name, formula, table_name, columns FROM kpi ORDER BY name;`);
    return res.rows.map((r: any) => ({
      ...r,
      columns: r.columns ? (Array.isArray(r.columns) ? r.columns : JSON.parse(r.columns)) : undefined,
    }));
  }

  const [rows] = await pool.query(`SELECT name, formula, table_name, columns FROM kpi ORDER BY name;`);
  return (rows as any[]).map((r) => ({
    ...r,
    columns: r.columns ? r.columns : undefined,
  }));
}

export { pool };
