# Insight Agent

Interactive agent that helps users generate insights from KPIs with a simple single-line prompt.

## Features

- Generate insights from existing KPIs
- AI-powered data analysis
- Natural language insight generation
- Preview insights before saving
- Edit insight text and names before saving
- PostgreSQL and MySQL support

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Configure your environment variables:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `DATABASE_URL`: Your database connection string

## Usage

### Development Mode

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Production

```bash
npm start
```

## Quick Start

1. Install dependencies: `npm install`
2. Configure `.env` file with your database and OpenAI credentials
3. Ensure you have KPIs created in the database
4. Run in development mode: `npm run dev`
5. Interact with the Insight agent using single-line prompts

### Example Prompts

- `"total_revenue: analyze monthly trends"`
- `"avg_order_value: identify anomalies"`
- `"customer_count: growth analysis"`

## Workflow

1. Provide a single-line prompt: `"kpi_name: what insight to generate"`
2. System automatically:
   - Fetches the specified KPI
   - Executes the KPI query
   - Uses AI to generate insights
   - Shows preview of analyzed data
3. Review insight details (name, description, KPI association, generated insight)
4. Confirm to save or optionally edit before saving

## Database Schema

The agent creates the following tables:

```sql
CREATE TABLE kpi (
  name TEXT PRIMARY KEY,
  description TEXT,
  formula TEXT,
  table_name TEXT,
  columns JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE insight (
  id SERIAL PRIMARY KEY,
  name TEXT,
  description TEXT,
  kpi_name TEXT REFERENCES kpi(name),
  formula TEXT,
  schedule TEXT,
  exec_time TEXT,
  alert_high NUMERIC,
  alert_low NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Prerequisites

This agent requires existing KPIs in the database. You can create KPIs using the KPI Agent.
