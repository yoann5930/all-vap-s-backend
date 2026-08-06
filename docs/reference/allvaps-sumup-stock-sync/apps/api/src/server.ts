import Fastify from 'fastify';
import { env } from './config/env.js';
import { healthRoutes } from './modules/health/routes.js';
import { prisma } from './db/prisma.js';

const app = Fastify({ logger: true });
await app.register(healthRoutes);

app.get('/inventory/products', async () => {
  return prisma.product.findMany({ include: { variants: true }, orderBy: { name: 'asc' } });
});

app.post('/jobs/sumup/poll', async (_request, reply) => {
  reply.code(501);
  return {
    ok: false,
    code: 'CURSOR_IMPLEMENTATION_REQUIRED',
    message: 'Le squelette est prêt. Cursor doit implémenter le poller idempotent décrit dans CURSOR_PROMPT.md.'
  };
});

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host: '0.0.0.0', port: env.PORT });
