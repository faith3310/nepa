// TODO: Fix missing notification-client Prisma client
// import { PrismaClient as NotificationPrismaClient } from '../../node_modules/.prisma/notification-client';

// Temporarily disabled to get server running
// const notificationClient = new NotificationPrismaClient({
//   datasources: {
//     db: {
//       url: process.env.NOTIFICATION_SERVICE_DATABASE_URL,
//     },
//   },
// });

// Mock notification client for now
const notificationClient = null;

export default notificationClient;
