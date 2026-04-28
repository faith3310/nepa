// TODO: Fix missing billing-client Prisma client
// import { PrismaClient as BillingPrismaClient } from '../../node_modules/.prisma/billing-client';
import { buildOptimizedDatabaseUrl } from './urlOptimizer';

// Temporarily disabled to get server running
// const billingClient = new BillingPrismaClient({
//   datasources: {
//     db: {
//       url: buildOptimizedDatabaseUrl(process.env.BILLING_SERVICE_DATABASE_URL),
//     },
//   },
// });

// Mock billing client for now
const billingClient = null;

export default billingClient;
