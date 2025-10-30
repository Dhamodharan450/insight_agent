// ❌ OLD FILE - NOT USED ANYMORE
// This file is from the old non-Mastra implementation
// Kept for reference only - DO NOT IMPORT OR USE
// 
// The new Mastra-style implementation is in:
// - src/agents/kpi_agent_mastra.ts
// - src/agents/insight_agent_mastra.ts
// - src/agents/sql_query_agent_mastra.ts
// - src/mastra.ts

/*
// src/super_agent.ts
import { SuperAgent } from "mastra";
import { kpiAgent } from "./agents/kpi_agent";
import { insightAgent } from "./agents/insight_agent";

export const superAgent = new SuperAgent({
  name: "Mastra KPI & Insight Bot",
  description: "A rule-based chatbot to create KPI and Insight entries.",
  agents: {
    kpiAgent,
    insightAgent,
  },
  router: async (input: string) => {
    if (/create kpi/i.test(input)) return "kpiAgent";
    if (/create insight/i.test(input)) return "insightAgent";
    return "default";
  },
});

// Example usage:
(async () => {
  console.log(await superAgent.run("create kpi", {
    table: "sales",
    column: "profit",
    name: "Profit Margin",
    description: "Tracks profit margin over time",
    formula: "profit / revenue * 100",
  }));

  console.log(await superAgent.run("create insight", {
    kpi: "Profit Margin",
    topic: "Quarterly Performance",
    description: "Analyze profit trends quarterly",
    schedule: "Quarterly",
  }));
})();
*/
