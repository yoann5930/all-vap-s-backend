import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, service: 'allvaps-sumup-stock-sync', time: new Date().toISOString() };
  });
}
