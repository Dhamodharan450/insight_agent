import 'dotenv/config';
import { Mastra } from '@mastra/core';
import { kpiAgentMastra } from '../agents/kpi_agent_mastra';
import { insightAgentMastra } from '../agents/insight_agent_mastra';
import { sqlQueryAgentMastra } from '../agents/sql_query_agent_mastra';
import { kpiWorkflow } from '../workflows/kpi_workflow';
import { insightWorkflow } from '../workflows/insight_workflow';

export const mastra = new Mastra({
  agents: {
    kpiAgent: kpiAgentMastra,
    insightAgent: insightAgentMastra,
    sqlQueryAgent: sqlQueryAgentMastra,
  },
  workflows: {
    kpiWorkflow,
    insightWorkflow,
  },
  server: {
    port: 4111,
    host: '0.0.0.0',
  },
});
