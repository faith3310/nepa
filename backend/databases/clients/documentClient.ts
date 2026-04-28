// TODO: Fix missing document-client Prisma client
// import { PrismaClient as DocumentPrismaClient } from '../../node_modules/.prisma/document-client';

// Temporarily disabled to get server running
// const documentClient = new DocumentPrismaClient({
//   datasources: {
//     db: {
//       url: process.env.DOCUMENT_SERVICE_DATABASE_URL,
//     },
//   },
// });

// Mock document client for now
const documentClient = null;

export default documentClient;
