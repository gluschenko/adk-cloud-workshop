import { startAgentServer } from '@techparts/shared';
import { rootAgent } from './agent.ts';

await startAgentServer({
  agent: rootAgent,
  port: Number(process.env.PORT ?? 8001),
  title: 'TechParts — Inventory Agent',
});
