// TODO: Fix missing payment-client Prisma client
// import { PrismaClient as PaymentPrismaClient } from '../../node_modules/.prisma/payment-client';
import { buildOptimizedDatabaseUrl } from './urlOptimizer';

// Temporarily disabled to get server running
// const paymentClient = new PaymentPrismaClient({
//   datasources: {
//     db: {
//       url: buildOptimizedDatabaseUrl(process.env.PAYMENT_SERVICE_DATABASE_URL),
//     },
//   },
// });

// Mock payment client for now
const paymentClient = null;

export default paymentClient;
