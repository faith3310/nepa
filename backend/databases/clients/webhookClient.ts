// TODO: Fix missing webhook-client Prisma client
// import { PrismaClient as WebhookPrismaClient } from '../../node_modules/.prisma/webhook-client';

// Temporarily disabled to get server running
// const webhookClient = new WebhookPrismaClient({
//   datasources: {
//     db: {
//       url: process.env.WEBHOOK_SERVICE_DATABASE_URL,
//     },
//   },
// });

// Mock webhook client for now
const webhookClient = null;

export default webhookClient;
