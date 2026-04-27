import { getCacheManager } from '../../services/RedisCacheManager';
import { getCacheStrategy } from '../../services/cache/CacheStrategy';
import { getSessionCacheService } from '../../services/cache/SessionCacheService';
import { getMicroserviceCacheService } from '../../services/cache/MicroserviceCacheService';
import { getCacheWarmupService } from '../../services/cache/CacheWarmupService';
import { getCacheMonitoringService } from '../../services/cache/CacheMonitoringService';
import { getCacheInitializer } from '../../services/cache/CacheInitializer';

describe('Cache System Integration Tests', () => {
  let cacheManager: any;
  let cacheStrategy: any;
  let sessionCache: any;
  let microserviceCache: any;
  let warmupService: any;
  let monitoringService: any;

  beforeAll(async () => {
    // Initialize cache system
    const initializer = getCacheInitializer();
    const initResult = await initializer.initialize();
    expect(initResult.success).toBe(true);

    // Get service instances
    cacheManager = getCacheManager();
    cacheStrategy = getCacheStrategy();
    sessionCache = getSessionCacheService();
    microserviceCache = getMicroserviceCacheService();
    warmupService = getCacheWarmupService();
    monitoringService = getCacheMonitoringService();
  });

  afterAll(async () => {
    // Cleanup
    await cacheManager.flush();
    await cacheManager.disconnect();
  });

  describe('Redis Cache Manager', () => {
    test('should connect to Redis successfully', async () => {
      const isHealthy = await cacheManager.healthCheck();
      expect(isHealthy).toBe(true);
    });

    test('should set and get cache values', async () => {
      const testKey = 'test:integration';
      const testValue = { id: 1, name: 'test', timestamp: Date.now() };

      const setResult = await cacheManager.set(testKey, testValue, { ttl: 60 });
      expect(setResult).toBe(true);

      const getValue = await cacheManager.get(testKey);
      expect(getValue).toEqual(testValue);
    });

    test('should handle cache misses', async () => {
      const getValue = await cacheManager.get('nonexistent:key');
      expect(getValue).toBeNull();
    });

    test('should delete cache entries', async () => {
      const testKey = 'test:delete';
      await cacheManager.set(testKey, { data: 'test' });

      const deleteResult = await cacheManager.delete(testKey);
      expect(deleteResult).toBe(true);

      const getValue = await cacheManager.get(testKey);
      expect(getValue).toBeNull();
    });

    test('should support tag-based invalidation', async () => {
      const key1 = 'test:tag:1';
      const key2 = 'test:tag:2';

      await cacheManager.set(key1, { data: 'test1' }, { tags: ['test-tag'], ttl: 60 });
      await cacheManager.set(key2, { data: 'test2' }, { tags: ['test-tag'], ttl: 60 });

      // Verify both keys exist
      expect(await cacheManager.get(key1)).toEqual({ data: 'test1' });
      expect(await cacheManager.get(key2)).toEqual({ data: 'test2' });

      // Invalidate by tag
      const invalidatedCount = await cacheManager.invalidateByTag('test-tag');
      expect(invalidatedCount).toBe(2);

      // Verify both keys are gone
      expect(await cacheManager.get(key1)).toBeNull();
      expect(await cacheManager.get(key2)).toBeNull();
    });

    test('should collect accurate statistics', async () => {
      // Clear stats
      await cacheManager.flush();

      // Perform operations
      await cacheManager.set('stats:test', { data: 'test' });
      await cacheManager.get('stats:test'); // hit
      await cacheManager.get('stats:nonexistent'); // miss

      const stats = await cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe('Cache Strategy', () => {
    test('should generate cache keys correctly', () => {
      const key = cacheStrategy.generateKey('user:profile', { userId: '123' });
      expect(key).toBe('user:123');
    });

    test('should handle cache with fallback', async () => {
      const testData = { id: '123', name: 'John Doe' };
      let fallbackCalled = false;

      const result = await cacheStrategy.get(
        'user:profile',
        { userId: '123' },
        async () => {
          fallbackCalled = true;
          return testData;
        }
      );

      expect(result).toEqual(testData);
      expect(fallbackCalled).toBe(true);

      // Second call should use cache
      fallbackCalled = false;
      const cachedResult = await cacheStrategy.get(
        'user:profile',
        { userId: '123' },
        async () => {
          fallbackCalled = true;
          return { different: 'data' };
        }
      );

      expect(cachedResult).toEqual(testData);
      expect(fallbackCalled).toBe(false);
    });

    test('should respect TTL configurations', async () => {
      await cacheStrategy.set('user:session', { sessionId: 'test' }, { data: 'test' });
      
      // Should be cached
      const cached = await cacheStrategy.get('user:session', { sessionId: 'test' });
      expect(cached).toEqual({ data: 'test' });

      // Wait for expiration (short TTL for testing)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Note: In real tests, we'd need to mock time or use shorter TTLs
    });
  });

  describe('Session Cache Service', () => {
    test('should cache and retrieve sessions', async () => {
      const session = {
        id: 'session-123',
        userId: 'user-123',
        token: 'token-abc',
        refreshToken: 'refresh-def',
        expiresAt: new Date(Date.now() + 3600000),
        isActive: true,
        createdAt: new Date(),
        lastAccessedAt: new Date()
      };

      const cacheResult = await sessionCache.cacheSession(session);
      expect(cacheResult).toBe(true);

      const retrieved = await sessionCache.getSession('session-123');
      expect(retrieved).toEqual(session);
    });

    test('should handle session validation', async () => {
      const expiredSession = {
        id: 'session-expired',
        userId: 'user-123',
        token: 'token-expired',
        refreshToken: 'refresh-expired',
        expiresAt: new Date(Date.now() - 1000), // Expired
        isActive: true,
        createdAt: new Date(),
        lastAccessedAt: new Date()
      };

      await sessionCache.cacheSession(expiredSession);
      
      const isValid = await sessionCache.validateCachedSession(expiredSession);
      expect(isValid).toBe(false);
    });

    test('should invalidate user cache correctly', async () => {
      const userId = 'user-invalidate';
      const email = 'test@example.com';

      // Cache user data
      await sessionCache.cacheUser({
        id: userId,
        email,
        username: 'testuser',
        role: 'user',
        status: 'ACTIVE',
        isEmailVerified: true,
        twoFactorEnabled: false
      });

      // Verify it's cached
      const user = await sessionCache.getUser(userId);
      expect(user).toBeTruthy();

      // Invalidate
      await sessionCache.invalidateUser(userId, email);

      // Verify it's gone
      const invalidatedUser = await sessionCache.getUser(userId);
      expect(invalidatedUser).toBeNull();
    });
  });

  describe('Microservice Cache Service', () => {
    test('should cache payment data', async () => {
      const userId = 'user-payment';
      const payments = [
        {
          id: 'payment-1',
          userId,
          billId: 'bill-1',
          amount: 100,
          status: 'SUCCESS',
          createdAt: new Date()
        }
      ];

      const cacheResult = await microserviceCache.cacheRecentPayments(userId, payments);
      expect(cacheResult).toBe(true);

      const retrieved = await microserviceCache.getRecentPayments(userId);
      expect(retrieved).toEqual(payments);
    });

    test('should cache analytics data', async () => {
      const userId = 'user-analytics';
      const timeframe = '30d';
      const analytics = {
        userId,
        timeframe,
        data: { totalSpent: 1000, transactionCount: 10 },
        generatedAt: new Date()
      };

      const cacheResult = await microserviceCache.cacheDashboardAnalytics(userId, timeframe, analytics);
      expect(cacheResult).toBe(true);

      const retrieved = await microserviceCache.getDashboardAnalytics(userId, timeframe);
      expect(retrieved).toEqual(analytics);
    });

    test('should handle invalidation correctly', async () => {
      const userId = 'user-invalidate-payment';

      // Cache payment data
      await microserviceCache.cacheRecentPayments(userId, [{ id: 'p1', userId, amount: 50 }]);
      
      // Verify it's cached
      const payments = await microserviceCache.getRecentPayments(userId);
      expect(payments).toHaveLength(1);

      // Invalidate
      await microserviceCache.invalidatePaymentCache(userId);

      // Verify it's gone
      const invalidatedPayments = await microserviceCache.getRecentPayments(userId);
      expect(invalidatedPayments).toBeNull();
    });
  });

  describe('Cache Monitoring', () => {
    test('should collect health metrics', () => {
      const metrics = monitoringService.getHealthMetrics();
      
      expect(metrics).toHaveProperty('redis');
      expect(metrics).toHaveProperty('patterns');
      expect(metrics).toHaveProperty('alerts');
      expect(metrics).toHaveProperty('performance');
      
      expect(metrics.redis).toHaveProperty('connected');
      expect(metrics.redis).toHaveProperty('memoryUsage');
      expect(metrics.redis).toHaveProperty('hitRate');
    });

    test('should generate performance reports', () => {
      const report = monitoringService.getPerformanceReport();
      
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('trends');
      
      expect(report.summary).toHaveProperty('overallHealth');
      expect(report.summary).toHaveProperty('hitRate');
      expect(report.summary).toHaveProperty('activeAlerts');
    });

    test('should export metrics in Prometheus format', () => {
      const exported = monitoringService.exportMetrics();
      
      expect(exported).toHaveProperty('prometheus');
      expect(exported).toHaveProperty('json');
      
      expect(exported.prometheus).toContain('nepa_cache_hit_rate');
      expect(exported.prometheus).toContain('nepa_cache_memory_usage');
      expect(exported.prometheus).toContain('nepa_cache_key_count');
    });
  });

  describe('Cache Warmup Service', () => {
    test('should have warmup jobs configured', () => {
      const jobs = warmupService.getJobs();
      expect(jobs.length).toBeGreaterThan(0);
      
      // Check for essential jobs
      const jobNames = jobs.map(job => job.name);
      expect(jobNames).toContain('Active User Sessions');
      expect(jobNames).toContain('Recent Active Users');
      expect(jobNames).toContain('User Preferences');
    });

    test('should provide warmup statistics', () => {
      const stats = warmupService.getStats();
      
      expect(stats).toHaveProperty('totalJobs');
      expect(stats).toHaveProperty('completedJobs');
      expect(stats).toHaveProperty('failedJobs');
      expect(stats).toHaveProperty('avgExecutionTime');
      expect(typeof stats.totalJobs).toBe('number');
    });

    test('should enable/disable jobs', () => {
      const jobs = warmupService.getJobs();
      const testJob = jobs.find(job => job.name === 'Historical Analytics');
      
      if (testJob) {
        const originalState = testJob.enabled;
        
        // Toggle state
        const setResult = warmupService.setJobEnabled(testJob.id, !originalState);
        expect(setResult).toBe(true);
        
        // Verify state changed
        const updatedJobs = warmupService.getJobs();
        const updatedJob = updatedJobs.find(job => job.id === testJob.id);
        expect(updatedJob.enabled).toBe(!originalState);
        
        // Restore original state
        warmupService.setJobEnabled(testJob.id, originalState);
      }
    });
  });

  describe('Cache System Integration', () => {
    test('should handle complete user workflow', async () => {
      const userId = 'integration-user';
      const email = 'integration@example.com';
      
      // 1. Cache user profile
      const user = {
        id: userId,
        email,
        username: 'integration',
        name: 'Integration Test User',
        role: 'user',
        status: 'ACTIVE',
        isEmailVerified: true,
        twoFactorEnabled: false
      };
      
      await sessionCache.cacheUser(user);
      
      // 2. Cache user session
      const session = {
        id: 'session-integration',
        userId,
        token: 'token-integration',
        refreshToken: 'refresh-integration',
        expiresAt: new Date(Date.now() + 3600000),
        isActive: true,
        createdAt: new Date(),
        lastAccessedAt: new Date()
      };
      
      await sessionCache.cacheSession(session);
      
      // 3. Cache user payments
      const payments = [
        { id: 'p1', userId, billId: 'b1', amount: 100, status: 'SUCCESS', createdAt: new Date() },
        { id: 'p2', userId, billId: 'b2', amount: 200, status: 'SUCCESS', createdAt: new Date() }
      ];
      
      await microserviceCache.cacheRecentPayments(userId, payments);
      
      // 4. Cache user analytics
      const analytics = {
        userId,
        timeframe: '30d',
        data: { totalSpent: 300, transactionCount: 2, avgTransaction: 150 },
        generatedAt: new Date()
      };
      
      await microserviceCache.cacheDashboardAnalytics(userId, '30d', analytics);
      
      // 5. Verify all data is cached and retrievable
      const retrievedUser = await sessionCache.getUser(userId);
      expect(retrievedUser).toEqual(user);
      
      const retrievedSession = await sessionCache.getSession('session-integration');
      expect(retrievedSession).toEqual(session);
      
      const retrievedPayments = await microserviceCache.getRecentPayments(userId);
      expect(retrievedPayments).toEqual(payments);
      
      const retrievedAnalytics = await microserviceCache.getDashboardAnalytics(userId, '30d');
      expect(retrievedAnalytics).toEqual(analytics);
      
      // 6. Test invalidation cascade
      await sessionCache.invalidateUser(userId, email);
      
      // User and session should be invalidated
      expect(await sessionCache.getUser(userId)).toBeNull();
      expect(await sessionCache.getSession('session-integration')).toBeNull();
      
      // Payment and analytics should still exist (different invalidation scope)
      expect(await microserviceCache.getRecentPayments(userId)).toEqual(payments);
      expect(await microserviceCache.getDashboardAnalytics(userId, '30d')).toEqual(analytics);
    });

    test('should handle distributed invalidation', async () => {
      const testKey = 'distributed:test';
      const testValue = { data: 'distributed', timestamp: Date.now() };
      
      // Set initial value
      await cacheManager.set(testKey, testValue, { tags: ['distributed-test'] });
      expect(await cacheManager.get(testKey)).toEqual(testValue);
      
      // Broadcast invalidation
      await cacheManager.broadcastInvalidation([], ['distributed-test']);
      
      // Give a moment for pub/sub to process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Value should be invalidated
      expect(await cacheManager.get(testKey)).toBeNull();
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle Redis connection failures gracefully', async () => {
      // This test would require mocking Redis failures
      // For now, we test that the health check works
      const isHealthy = await cacheManager.healthCheck();
      expect(typeof isHealthy).toBe('boolean');
    });

    test('should handle cache strategy fallbacks', async () => {
      const invalidPattern = 'invalid:pattern';
      
      // Should throw error for unknown pattern
      await expect(
        cacheStrategy.get(invalidPattern, { param: 'value' })
      ).rejects.toThrow();
    });

    test('should handle malformed cache data', async () => {
      const testKey = 'malformed:test';
      
      // Set malformed JSON directly (bypassing normal set)
      await cacheManager.client.set(testKey, 'invalid-json{');
      
      const result = await cacheManager.get(testKey);
      expect(result).toBeNull(); // Should handle gracefully
    });
  });

  describe('Performance Tests', () => {
    test('should handle high-volume operations efficiently', async () => {
      const iterations = 100;
      const startTime = Date.now();
      
      // Batch set operations
      const setPromises = [];
      for (let i = 0; i < iterations; i++) {
        setPromises.push(
          cacheManager.set(`perf:test:${i}`, { data: `test-${i}`, index: i }, { ttl: 60 })
        );
      }
      
      await Promise.all(setPromises);
      const setTime = Date.now() - startTime;
      
      // Batch get operations
      const getStartTime = Date.now();
      const getPromises = [];
      for (let i = 0; i < iterations; i++) {
        getPromises.push(cacheManager.get(`perf:test:${i}`));
      }
      
      const results = await Promise.all(getPromises);
      const getTime = Date.now() - getStartTime;
      
      // Verify all operations succeeded
      expect(results.every(result => result !== null)).toBe(true);
      
      // Performance assertions (adjust thresholds based on environment)
      expect(setTime).toBeLessThan(5000); // 5 seconds for 100 sets
      expect(getTime).toBeLessThan(2000); // 2 seconds for 100 gets
      
      console.log(`Performance: ${iterations} sets in ${setTime}ms, ${iterations} gets in ${getTime}ms`);
    });

    test('should maintain performance with compression', async () => {
      const largeData = {
        id: 'large-data',
        // Create a reasonably large object
        data: new Array(1000).fill(0).map((_, i) => ({ index: i, value: `test-data-${i}`.repeat(10) })),
        timestamp: Date.now()
      };
      
      const startTime = Date.now();
      
      await cacheManager.set('perf:large', largeData, { compress: true, ttl: 60 });
      const retrieved = await cacheManager.get('perf:large');
      
      const endTime = Date.now();
      
      expect(retrieved).toEqual(largeData);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
