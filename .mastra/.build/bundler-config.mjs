import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { openai } from '@ai-sdk/openai';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Pool } from 'pg';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { createWorkflow, createStep } from '@mastra/core/workflows';

dotenv.config();
let databaseUrl = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || process.env.MYSQL_CONNECTION_STRING || "";
if (databaseUrl.startsWith("mysql+")) {
  databaseUrl = databaseUrl.replace(/^mysql\+[^:]+:/, "mysql:");
}
if (databaseUrl.startsWith("postgresql://")) {
  databaseUrl = databaseUrl.replace(/^postgresql:\/\//, "postgres://");
}
let clientType = (process.env.DATABASE_CLIENT || "").toLowerCase();
if (!clientType) {
  if (databaseUrl.startsWith("mysql://") || databaseUrl.startsWith("mariadb://")) clientType = "mysql";
  else clientType = "postgres";
}
let pool;
if (clientType === "postgres") {
  pool = new Pool({ connectionString: databaseUrl });
} else {
  if (databaseUrl) {
    pool = mysql.createPool(databaseUrl);
  } else {
    pool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASS || "",
      database: process.env.DB_NAME || void 0,
      waitForConnections: true,
      connectionLimit: 10
    });
  }
}
async function ensureTables() {
  if (clientType === "postgres") {
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
      try {
        await conn.execute(`ALTER TABLE kpi ADD COLUMN IF NOT EXISTS table_name TEXT;`);
        await conn.execute(`ALTER TABLE kpi ADD COLUMN IF NOT EXISTS columns JSON;`);
      } catch (err) {
      }
    } finally {
      conn.release();
    }
  }
}
async function insertInsight(data) {
  if (clientType === "postgres") {
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
        data.alert_low || null
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
        data.alert_low || null
      ]
    );
  }
}
async function runQuery(sql, sample = 5) {
  const cleaned = sql.trim().replace(/;$/, "");
  const hasLimit = /\blimit\b/i.test(cleaned);
  const limitedSql = hasLimit ? cleaned : `${cleaned} LIMIT ${sample}`;
  if (clientType === "postgres") {
    const res = await pool.query(limitedSql);
    return res.rows;
  }
  const [rows] = await pool.query(limitedSql);
  return rows;
}
async function fetchKPIs() {
  if (clientType === "postgres") {
    const res = await pool.query(`SELECT name, formula, table_name, columns FROM kpi ORDER BY name;`);
    return res.rows.map((r) => ({
      ...r,
      columns: r.columns ? Array.isArray(r.columns) ? r.columns : JSON.parse(r.columns) : void 0
    }));
  }
  const [rows] = await pool.query(`SELECT name, formula, table_name, columns FROM kpi ORDER BY name;`);
  return rows.map((r) => ({
    ...r,
    columns: r.columns ? r.columns : void 0
  }));
}

const saveInsightTool = createTool({
  id: "save-insight",
  description: "Saves an insight definition to the database",
  inputSchema: z.object({
    name: z.string(),
    description: z.string().optional(),
    kpi_name: z.string().optional(),
    formula: z.string(),
    schedule: z.string().optional(),
    exec_time: z.string().optional(),
    alert_high: z.number().optional(),
    alert_low: z.number().optional()
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    await insertInsight({
      name: context.name,
      description: context.description ?? void 0,
      kpi_name: context.kpi_name ?? void 0,
      formula: context.formula,
      schedule: context.schedule ?? void 0,
      exec_time: context.exec_time ?? void 0,
      alert_high: context.alert_high ?? void 0,
      alert_low: context.alert_low ?? void 0
    });
    return { success: true, message: `Insight '${context.name}' saved successfully` };
  }
});
const runQueryTool = createTool({
  id: "run-query",
  description: "Executes a SQL query and returns sample results",
  inputSchema: z.object({
    sql: z.string().describe("SQL query to execute"),
    limit: z.number().optional().describe("Number of rows to return").default(5)
  }),
  outputSchema: z.object({
    rows: z.array(z.any())
  }),
  execute: async ({ context }) => {
    const rows = await runQuery(context.sql, context.limit ?? 5);
    return { rows };
  }
});
const fetchKPIsTool = createTool({
  id: "fetch-kpis",
  description: "Fetches all KPIs from the database",
  inputSchema: z.object({}),
  outputSchema: z.object({
    kpis: z.array(
      z.object({
        name: z.string(),
        formula: z.string(),
        table_name: z.string().optional(),
        columns: z.array(z.string()).optional()
      })
    )
  }),
  execute: async ({ context }) => {
    const kpisRaw = await fetchKPIs();
    const kpis = kpisRaw.map((r) => ({
      ...r,
      table_name: r.table_name ?? void 0,
      columns: r.columns ?? void 0
    }));
    return { kpis };
  }
});

const generateSQLTool = createTool({
  id: "generate-sql",
  description: "Generates a SQL query based on tables, columns, intent, and filters",
  inputSchema: z.object({
    tables: z.array(z.string()).describe("List of tables to query"),
    columns: z.array(z.string()).describe("List of columns (table.column format)"),
    intent: z.string().optional().describe("User intent description (sum, average, etc.)"),
    filters: z.string().optional().describe("WHERE clause conditions"),
    limit: z.number().optional().default(100)
  }),
  outputSchema: z.object({
    sql: z.string()
  }),
  execute: async ({ context }) => {
    const selected = context.columns.length ? context.columns.join(", ") : "*";
    const from = context.tables.length ? context.tables[0] : "public.table";
    const where = context.filters ? `WHERE ${context.filters}` : "";
    let selectClause = selected;
    let isAggregation = false;
    const intent = (context.intent || "").toLowerCase();
    if (intent.includes("sum") || intent.includes("total")) {
      const numCol = context.columns.find((c) => /(amount|count|total|price|value|qty|quantity|num)/i.test(c));
      if (numCol) {
        selectClause = `SUM(${numCol}) as total_${numCol.replace(/[^a-zA-Z0-9]/g, "_")}`;
        isAggregation = true;
      }
    } else if (intent.includes("avg") || intent.includes("average")) {
      const numCol = context.columns.find((c) => /(amount|price|value|qty|quantity|num)/i.test(c));
      if (numCol) {
        selectClause = `AVG(${numCol}) as avg_${numCol.replace(/[^a-zA-Z0-9]/g, "_")}`;
        isAggregation = true;
      }
    } else if (intent.includes("count")) {
      selectClause = "COUNT(*) as total_count";
      isAggregation = true;
    }
    const sql = isAggregation ? `SELECT ${selectClause} FROM ${from} ${where};` : `SELECT ${selectClause} FROM ${from} ${where};`;
    return { sql };
  }
});

const insightAgentMastra = new Agent({
  name: "Insight Agent",
  description: "Interactive agent that helps users generate insights from KPIs with a simple single-line prompt",
  instructions: `You are an insight generation assistant that helps users create meaningful insights from their KPIs.

Simplified workflow:
1. First, fetch and show available KPIs using fetchKPIsTool
   Display format: Index | KPI Name | Description | Formula | Table Name

2. Ask user for a single-line prompt in format: "kpi_name: what insight to generate"
   Examples:
   - "total_revenue: analyze monthly trends"
   - "avg_order_value: identify anomalies"
   - "customer_retention: compare by region"
   
3. The workflow will automatically:
   - Fetch the specified KPI
   - Execute the KPI query using runQueryTool to gather data
   - Use generateSQLTool if additional queries needed
   - Generate data-driven insights using AI
   - Show preview of the data analyzed (5 rows)

4. Present the insight to user:
   - Insight Name (auto-generated or custom)
   - Description
   - Associated KPI
   - Generated insight text
   - Sample data used
   - Key findings and patterns

5. Ask about scheduling:
   "Would you like to receive this insight regularly?"
   If yes, collect:
   - Execution Schedule: daily, weekly, monthly, quarterly, yearly
   - Execution Time: e.g., "9:00 AM", "18:00"
   - Alert Threshold (optional): e.g., "Alert if revenue drops >10%"

6. Allow user to edit insight text or name if needed

7. Confirm and save using saveInsightTool

Be analytical, data-driven, and help users discover meaningful patterns with minimal effort.`,
  model: openai("gpt-4o"),
  tools: {
    fetchKPIsTool,
    runQueryTool,
    generateSQLTool,
    saveInsightTool
  },
  // Enable memory to maintain conversation context
  memory: new Memory({
    options: {
      lastMessages: 20
      // Keep last 20 messages in context
    }
  })
});

const parsePromptAndFetchKPIStep = createStep({
  id: "parse-fetch-kpi",
  description: "Parse user prompt and fetch KPI data",
  inputSchema: z.object({
    prompt: z.string().describe('Single line: "kpi_name: what insight to generate"'),
    insightName: z.string().optional().describe("Optional insight name, auto-generated if not provided")
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    kpiFormula: z.string(),
    insightDescription: z.string(),
    insightName: z.string()
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { prompt, insightName } = inputData;
    const parts = prompt.split(":").map((p) => p.trim());
    if (parts.length < 2) {
      throw new Error('Invalid prompt format. Expected: "kpi_name: insight description"');
    }
    const kpiName = parts[0];
    const description = parts.slice(1).join(":").trim();
    const kpisResult = await fetchKPIsTool.execute({
      context: {},
      mastra,
      runtimeContext
    });
    const selectedKPI = kpisResult.kpis.find((k) => k.name === kpiName);
    if (!selectedKPI) {
      const availableKPIs = kpisResult.kpis.map((k) => k.name).join(", ");
      throw new Error(`KPI '${kpiName}' not found. Available KPIs: ${availableKPIs}`);
    }
    const generatedInsightName = insightName || `insight_${kpiName}_${Date.now()}`;
    return {
      kpiName,
      kpiFormula: selectedKPI.formula,
      insightDescription: description,
      insightName: generatedInsightName
    };
  }
});
const executeKPIQueryStep = createStep({
  id: "execute-kpi-query",
  description: "Execute KPI SQL query to gather data automatically",
  inputSchema: z.object({
    kpiName: z.string(),
    kpiFormula: z.string(),
    insightDescription: z.string(),
    insightName: z.string()
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    kpiData: z.array(z.record(z.string(), z.any())),
    insightDescription: z.string(),
    insightName: z.string()
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { kpiFormula, kpiName, insightDescription, insightName } = inputData;
    const result = await runQueryTool.execute({
      context: { sql: kpiFormula, limit: 10 },
      mastra,
      runtimeContext
    });
    return {
      kpiName,
      kpiData: result.rows,
      insightDescription,
      insightName
    };
  }
});
const generateInsightStep = createStep({
  id: "generate-insight",
  description: "Automatically generate insight from KPI data using AI",
  inputSchema: z.object({
    kpiName: z.string(),
    kpiData: z.array(z.record(z.string(), z.any())),
    insightDescription: z.string(),
    insightName: z.string()
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    insightText: z.string(),
    insightName: z.string(),
    kpiData: z.array(z.record(z.string(), z.any())),
    insightDescription: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    const { kpiName, kpiData, insightName, insightDescription } = inputData;
    const insightAgent = mastra.getAgent("insightAgent");
    const prompt = `
Analyze the following KPI data and generate an insight:

KPI: ${kpiName}
Description: ${insightDescription}

Data:
${JSON.stringify(kpiData.slice(0, 5), null, 2)}

Provide a clear, data-driven insight that is actionable and based on the actual numbers.
`;
    const runtimeContext = mastra?.runtimeContext;
    const memoryOpt = runtimeContext ? {
      memory: {
        thread: runtimeContext.get?.("thread") ?? "default-thread",
        resource: runtimeContext.get?.("resource") ?? "default-resource"
      }
    } : { memory: { thread: "default-thread", resource: "default-resource" } };
    const response = await insightAgent.generate(prompt, memoryOpt);
    return {
      kpiName,
      insightText: response.text,
      insightName,
      kpiData,
      insightDescription
    };
  }
});
const confirmAndSaveInsightStep = createStep({
  id: "confirm-save-insight",
  description: "Show all insight details and ask for save confirmation",
  inputSchema: z.object({
    kpiName: z.string(),
    insightText: z.string(),
    insightName: z.string(),
    kpiData: z.array(z.record(z.string(), z.any())),
    insightDescription: z.string()
  }),
  resumeSchema: z.object({
    confirmed: z.boolean().describe("Set to true to save the insight"),
    editedInsight: z.string().optional().describe("Optional: provide edited insight text"),
    editedName: z.string().optional().describe("Optional: provide edited insight name")
  }),
  suspendSchema: z.object({
    insightDetails: z.object({
      name: z.string(),
      description: z.string(),
      kpiName: z.string(),
      generatedInsight: z.string(),
      sampleData: z.array(z.record(z.string(), z.any()))
    }),
    message: z.string()
  }),
  outputSchema: z.object({
    insightName: z.string(),
    success: z.boolean(),
    message: z.string()
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
          sampleData: kpiData.slice(0, 5)
        },
        message: "Review the insight details above. Set confirmed=true to save, or provide editedInsight/editedName to modify."
      });
    }
    const finalInsight = resumeData.editedInsight || insightText;
    const finalName = resumeData.editedName || insightName;
    const result = await saveInsightTool.execute({
      context: {
        name: finalName,
        description: insightDescription,
        kpi_name: kpiName,
        formula: finalInsight
      },
      mastra,
      runtimeContext
    });
    return {
      insightName: finalName,
      success: result.success,
      message: `Insight '${finalName}' saved successfully! Based on KPI: ${kpiName}`
    };
  }
});
const insightWorkflow = createWorkflow({
  id: "insight-generation-workflow",
  inputSchema: z.object({
    prompt: z.string().describe('Single line: "kpi_name: what insight to generate"'),
    insightName: z.string().optional().describe("Optional insight name")
  }),
  outputSchema: z.object({
    insightName: z.string(),
    success: z.boolean(),
    message: z.string()
  })
}).then(parsePromptAndFetchKPIStep).then(executeKPIQueryStep).then(generateInsightStep).then(confirmAndSaveInsightStep).commit();

ensureTables().catch((err) => {
  console.error("Failed to initialize database tables:", err);
});
const mastra = new Mastra({
  agents: {
    insightAgent: insightAgentMastra
  },
  workflows: {
    insightWorkflow
  },
  // Add storage provider to enable agent memory
  storage: new LibSQLStore({
    url: "file:./mastra-memory.db"
    // Persistent storage for conversation history
  })
});
if (process.argv.includes("init-db")) {
  (async () => {
    try {
      console.log("Initializing database tables (via mastra CLI)...");
      await ensureTables();
      console.log("Database initialized successfully.");
      process.exit(0);
    } catch (err) {
      console.error("Database initialization failed:", err);
      process.exit(1);
    }
  })();
}

const bundler = {};

export { bundler, mastra };
