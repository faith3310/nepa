// TODO: Fix missing user-client Prisma client
// import { PrismaClient as UserPrismaClient } from '../../node_modules/.prisma/user-client';
// import { PrismaClient } from '@prisma/client';
// import { buildOptimizedDatabaseUrl } from './urlOptimizer';

// Temporarily disabled to get server running
// const userClient = new PrismaClient({
//   datasources: {
//     db: {
//       url: buildOptimizedDatabaseUrl(process.env.USER_SERVICE_DATABASE_URL),
//     },
//   },
// });

// Mock user client for now
const userClient = null;

export default userClient;
