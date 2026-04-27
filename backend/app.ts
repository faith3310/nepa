import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { apiLimiter, ddosDetector, checkBlockedIP, ipRestriction, progressiveLimiter, authLimiter } from './middleware/rateLimiter';
import { configureSecurity } from './middleware/security';
import { apiKeyAuth } from './src/config/auth';
import { authenticate, authorize, optionalAuth } from './middleware/authentication';
import { loggingMiddleware, setupGlobalErrorHandling, errorTracker, logger } from './middleware/logger';
import { errorTracker as abuseDetector } from './middleware/abuseDetection';
import { sanitizeInput } from './middleware/inputSanitization';
import { captureAuditContext, auditRateLimit, auditAuth, auditAdmin, auditPayment, auditDocument } from './middleware/audit';
import { auditRoutes, fraudRoutes } from './routes/auditRoutes';
import { swaggerSpec, getVersionedSwaggerSpec } from './swagger';
import { apiVersioningConfig } from './config/api-versioning';
import { authController } from './controllers/AuthenticationController';
import { userController } from './controllers/UserController';
import { initializeCacheSystem } from './services/cache/CacheManager';
import { upload } from './middleware/upload';
import { uploadDocument } from './controllers/DocumentController';
import { getDashboardData, generateReport, exportData } from './controllers/AnalyticsController';
import { applyPaymentSecurity, processPayment, getPaymentHistory, validatePayment } from './controllers/PaymentController';
import exportRoutes from './routes/export';
import { setupRateLimitRoutes } from './routes/rateLimitRoutes';
import { performanceMonitor } from './services/performanceMonitoring';
import analyticsService from './services/analytics';
import { appConfig } from './src/config/environment';
import ConnectionPoolMonitor from './databases/monitoring/ConnectionPoolMonitor';
import DatabaseHealthCheck from './databases/monitoring/DatabaseHealthCheck';
import { MemoryMonitor } from './MemoryMonitor';
import { UserRole } from '@prisma/client';

const app = express();

// Initialize cache system on startup
initializeCacheSystem().then(result => {
  if (result.success) {
    logger.info('Cache system initialized successfully', {
      initializationTime: result.metrics.initializationTime,
      services: result.services
    });
  } else {
    logger.error('Cache system initialization failed', {
      errors: result.errors,
      warnings: result.warnings
    });
  }
}).catch(error => {
  logger.error('Cache system initialization error:', error);
});

// Initialize logging and monitoring
logger.info('Application starting up', {
  nodeEnv: appConfig.nodeEnv,
  version: process.env.npm_package_version,
  enablePerformanceMetrics: appConfig.enablePerformanceMetrics,
  enableDbPoolMonitoring: appConfig.enableDbPoolMonitoring,
});

// Initialize error tracking if DSN is provided
if (appConfig.sentryDsn) {
  errorTracker.initialize({
    dsn: appConfig.sentryDsn,
    environment: appConfig.nodeEnv,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    release: process.env.npm_package_version
  });
}

if (appConfig.enableDbPoolMonitoring) {
  ConnectionPoolMonitor.startMonitoring(appConfig.dbPoolMonitoringInterval);
  logger.info('Database connection pool monitoring enabled', {
    intervalMs: appConfig.dbPoolMonitoringInterval
  });
}

// 1. Comprehensive logging middleware (should be first)
app.use(...loggingMiddleware);

// 2. DDoS Protection and IP Blocking
app.use(ddosDetector);
app.use(checkBlockedIP);
app.use(ipRestriction);

// 3. Security Headers & CORS
configureSecurity(app);

// 4. Body Parsing
app.use(express.json({ limit: '10kb' })); // Limit body size for security

// 5. Input Sanitization
app.use('/api', sanitizeInput);

// 6. Progressive Rate Limiting
app.use('/api', progressiveLimiter);

// 6. Audit Context Capture (before rate limiting to capture all requests)
app.use('/api', captureAuditContext);

// 7. Advanced rate limiting is applied by setupRateLimitRoutes(app)

// 8. Audit rate limit breaches
app.use('/api', auditRateLimit);

// 9. Error tracking for abuse detection
app.use(abuseDetector);

// 10. Setup rate limiting routes
setupRateLimitRoutes(app);

// 11. Audit Routes
app.use('/api/audit', auditRoutes);

// 13. Fraud detection API (ML scoring 0-100, manual review workflow, adaptive learning)
app.use('/api/fraud', fraudRoutes);

// 14. API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api-docs/v1', swaggerUi.serve, swaggerUi.setup(getVersionedSwaggerSpec('v1')));
app.use('/api-docs/v2', swaggerUi.serve, swaggerUi.setup(getVersionedSwaggerSpec('v2')));

// 15. Enhanced Health Check
app.get('/health', (req, res) => {
  const healthStatus = performanceMonitor.getHealthStatus();
  const memoryUsage = performanceMonitor.getMemoryUsage();

  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    performance: healthStatus,
    memory: {
      used: memoryUsage.heapUsed,
      total: memoryUsage.heapTotal,
      external: memoryUsage.external
    },
    analytics: {
      totalEvents: analyticsService.getAnalyticsData().userEvents.length,
      activeUsers: analyticsService.getAnalyticsData().activeUsers
    }
  });
});

// 10. Monitoring endpoints (unversioned)
app.get('/api/monitoring/metrics', apiKeyAuth, async (req, res) => {
  const analytics = analyticsService.getAnalyticsData();
  const performance = performanceMonitor.getHealthStatus();
  const dbPoolMetrics = await ConnectionPoolMonitor.getAllPoolMetrics();
  const databaseHealth = await DatabaseHealthCheck.getHealthReport();

  res.json({
    analytics,
    performance,
    requestMetrics: performanceMonitor.getRequestMetrics(100),
    customMetrics: performanceMonitor.getCustomMetrics(100),
    dbPoolMetrics,
    databaseHealth
  });
});

app.get('/api/monitoring/db-pools', apiKeyAuth, async (_req, res) => {
  const dbPoolMetrics = await ConnectionPoolMonitor.getAllPoolMetrics();
  res.json({ status: 'ok', dbPoolMetrics });
});

app.get('/api/monitoring/db-health', apiKeyAuth, async (_req, res) => {
  const databaseHealth = await DatabaseHealthCheck.getHealthReport();
  res.json({ status: 'ok', databaseHealth });
});

// Memory monitoring endpoints
app.get('/api/monitoring/memory', apiKeyAuth, (_req, res) => {
  const memoryMonitor = MemoryMonitor.getInstance();
  const healthMetrics = memoryMonitor.getHealthMetrics();
  const memoryTrend = memoryMonitor.getMemoryTrend();
  const connectionTrend = memoryMonitor.getConnectionTrend();
  const leakDetection = memoryMonitor.detectMemoryLeaks();

  res.json({
    status: 'ok',
    healthMetrics,
    memoryTrend,
    connectionTrend,
    leakDetection,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/monitoring/memory/cleanup', apiKeyAuth, (_req, res) => {
  const memoryMonitor = MemoryMonitor.getInstance();
  memoryMonitor.forceCleanup();
  
  res.json({
    status: 'ok',
    message: 'Memory cleanup completed',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/monitoring/memory/alerts', apiKeyAuth, (_req, res) => {
  const memoryMonitor = MemoryMonitor.getInstance();
  const alerts = memoryMonitor.getAlerts();
  const leakDetection = memoryMonitor.detectMemoryLeaks();
  
  res.json({
    status: 'ok',
    alerts,
    leakDetection,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/monitoring/memory/report', apiKeyAuth, (_req, res) => {
  const memoryMonitor = MemoryMonitor.getInstance();
  const report = memoryMonitor.generateMemoryReport();
  
  res.json({
    status: 'ok',
    report,
    timestamp: new Date().toISOString()
  });
});

app.delete('/api/monitoring/memory/alerts', apiKeyAuth, (_req, res) => {
  const memoryMonitor = MemoryMonitor.getInstance();
  memoryMonitor.clearAlerts();
  
  res.json({
    status: 'ok',
    message: 'Memory alerts cleared',
    timestamp: new Date().toISOString()
  });
});

// 11. API version discovery (no auth required for discovery)
app.get('/api/versions', (_req, res) => {
  res.json({
    defaultVersion: apiVersioningConfig.defaultVersion,
    latestVersion: apiVersioningConfig.latestVersion,
    supportedVersions: apiVersioningConfig.supportedVersions,
    lifecycle: apiVersioningConfig.lifecycle,
  });
});

// 12. Authentication endpoints with comprehensive audit logging
app.post('/api/auth/register',
  authLimiter,
  auditAuth(AuditAction.USER_REGISTER),
  authController.register.bind(authController)
);
app.post('/api/auth/login',
  authLimiter,
  auditAuth(AuditAction.USER_LOGIN),
  authController.login.bind(authController)
);
app.post('/api/auth/logout',
  authenticate,
  auditAuth(AuditAction.USER_LOGOUT),
  authController.logout.bind(authController)
);

// 13. User profile endpoints with audit logging
app.get('/api/user/profile', authenticate, authController.getProfile.bind(authController));
app.put('/api/user/profile',
  authenticate,
  auditAuth(AuditAction.USER_UPDATE_PROFILE),
  userController.updateProfile.bind(userController)
);
app.post('/api/user/change-password',
  authenticate,
  auditAuth(AuditAction.USER_CHANGE_PASSWORD),
  userController.changePassword.bind(userController)
);

// 14. Admin user management endpoints with audit logging
app.get('/api/admin/users',
  authenticate,
  authorize(UserRole.ADMIN),
  auditAdmin(AuditAction.ADMIN_VIEW_USER_DATA, 'user'),
  userController.getAllUsers.bind(userController)
);
app.put('/api/admin/users/:id/role',
  authenticate,
  authorize(UserRole.ADMIN),
  auditAdmin(AuditAction.ADMIN_UPDATE_USER_ROLE, 'user'),
  userController.updateUserRole.bind(userController)
);
app.delete('/api/admin/users/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  auditAdmin(AuditAction.ADMIN_DELETE_USER, 'user'),
  userController.deleteUser.bind(userController)
);

// 15. Payment endpoints with comprehensive audit logging
app.post('/api/payment/process',
  ...applyPaymentSecurity,
  auditPayment(AuditAction.PAYMENT_INITIATE),
  processPayment
);

// 16. Document upload with audit logging
app.post('/api/documents/upload',
  apiKeyAuth,
  upload.single('file'),
  auditDocument(AuditAction.DOCUMENT_UPLOAD),
  uploadDocument
);

// Analytics Routes
/**
 * @openapi
 * /api/documents/upload:
 *   post:
 *     summary: Upload a document
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               userId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 */
app.get('/api/analytics/dashboard', apiKeyAuth, getDashboardData);

/**
 * @openapi
 * /api/analytics/reports:
 *   post:
 *     summary: Generate and save a custom report
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       201:
 *         description: Report created
 */
app.post('/api/analytics/reports', apiKeyAuth, generateReport);
app.get('/api/analytics/export', apiKeyAuth, exportData);

// 17. Export endpoints
app.use('/api/export', exportRoutes);

// Setup global error handling
setupGlobalErrorHandling(app);

export default app;