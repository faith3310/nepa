// TODO: Fix missing analytics-client Prisma client
// import { PrismaClient as AnalyticsPrismaClient } from '../../node_modules/.prisma/analytics-client';

// Temporarily disabled to get server running
// const analyticsClient = new AnalyticsPrismaClient({
//   datasources: {
//     db: {
//       url: process.env.ANALYTICS_SERVICE_DATABASE_URL,
//     },
//   },
// });

// Mock analytics client for now
const analyticsClient = null;

export default analyticsClient;
