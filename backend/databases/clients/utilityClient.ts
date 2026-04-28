// TODO: Fix missing utility-client Prisma client
// import { PrismaClient as UtilityPrismaClient } from '../../node_modules/.prisma/utility-client';

// Temporarily disabled to get server running
// const utilityClient = new UtilityPrismaClient({
//   datasources: {
//     db: {
//       url: process.env.UTILITY_SERVICE_DATABASE_URL,
//     },
//   },
// });

// Mock utility client for now
const utilityClient = null;

export default utilityClient;
