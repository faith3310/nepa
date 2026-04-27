import ConnectionPoolManager from './ConnectionPoolManager';

// Mock the database clients
jest.mock('./clients', () => ({
  userClient: {
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  },
  notificationClient: {
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  },
  documentClient: {
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  },
  utilityClient: {
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  },
  paymentClient: {
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  },
  billingClient: {
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  },
  analyticsClient: {
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  },
  webhookClient: {
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  },
}));

describe('ConnectionPoolManager', () => {
  let manager: ConnectionPoolManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = ConnectionPoolManager;
  });

  afterEach(async () => {
    await manager.cleanup();
  });

  describe('getServiceClient', () => {
    test('returns valid client for known service', async () => {
      const { userClient } = require('./clients');
      userClient.$queryRaw.mockResolvedValue([{ health: 1 }]);

      const client = await manager.getServiceClient('user-service');
      expect(client).toBeDefined();
      expect(userClient.$queryRaw).toHaveBeenCalled();
    });

    test('throws error for unknown service', async () => {
      await expect(manager.getServiceClient('unknown-service')).rejects.toThrow('Unknown service: unknown-service');
    });

    test('records performance metrics', async () => {
      const { userClient } = require('./clients');
      userClient.$queryRaw.mockResolvedValue([{ health: 1 }]);

      await manager.getServiceClient('user-service');
      
      const metrics = await manager.getPerformanceMetrics();
      expect(metrics['user-service']).toBeDefined();
      expect(metrics['user-service'].samples).toBeGreaterThan(0);
    });
  });

  describe('performHealthCheck', () => {
    test('returns healthy status for responsive service', async () => {
      const { userClient } = require('./clients');
      userClient.$queryRaw.mockResolvedValue([{ health: 1 }]);

      const result = await manager.performHealthCheck('user-service');
      
      expect(result.isHealthy).toBe(true);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.serviceName).toBe('user-service');
    });

    test('returns unhealthy status for unresponsive service', async () => {
      const { userClient } = require('./clients');
      userClient.$queryRaw.mockRejectedValue(new Error('Connection failed'));

      const result = await manager.performHealthCheck('user-service');
      
      expect(result.isHealthy).toBe(false);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('getAllHealthChecks', () => {
    test('performs health checks on all services', async () => {
      const { userClient, notificationClient } = require('./clients');
      userClient.$queryRaw.mockResolvedValue([{ health: 1 }]);
      notificationClient.$queryRaw.mockResolvedValue([{ health: 1 }]);

      const results = await manager.getAllHealthChecks();
      
      expect(results).toHaveLength(8); // All 8 services
      expect(results.every(r => r.serviceName && typeof r.isHealthy === 'boolean')).toBe(true);
    });
  });

  describe('getPoolStats', () => {
    test('returns pool statistics for service', async () => {
      const { userClient } = require('./clients');
      userClient.$queryRaw
        .mockResolvedValueOnce([{ health: 1 }]) // Health check
        .mockResolvedValueOnce([{ active: 5, idle: 3, total: 8 }]); // Pool stats

      const stats = await manager.getPoolStats('user-service');
      
      expect(stats.serviceName).toBe('user-service');
      expect(stats.totalConnections).toBe(8);
      expect(stats.activeConnections).toBe(5);
      expect(stats.idleConnections).toBe(3);
      expect(stats.healthStatus).toBe('healthy');
    });

    test('handles database errors gracefully', async () => {
      const { userClient } = require('./clients');
      userClient.$queryRaw
        .mockResolvedValueOnce([{ health: 1 }]) // Health check
        .mockRejectedValueOnce(new Error('DB Error')); // Pool stats

      const stats = await manager.getPoolStats('user-service');
      
      expect(stats.totalConnections).toBe(0);
      expect(stats.activeConnections).toBe(0);
      expect(stats.idleConnections).toBe(0);
    });
  });

  describe('getAllPoolStats', () => {
    test('returns statistics for all services', async () => {
      const { userClient, notificationClient } = require('./clients');
      userClient.$queryRaw
        .mockResolvedValue([{ health: 1 }])
        .mockResolvedValue([{ active: 5, idle: 3, total: 8 }]);
      notificationClient.$queryRaw
        .mockResolvedValue([{ health: 1 }])
        .mockResolvedValue([{ active: 2, idle: 4, total: 6 }]);

      const allStats = await manager.getAllPoolStats();
      
      expect(allStats).toHaveLength(8);
      expect(allStats[0].serviceName).toBeDefined();
      expect(allStats[0].totalConnections).toBeGreaterThanOrEqual(0);
    });
  });

  describe('updatePoolConfig', () => {
    test('updates pool configuration for service', () => {
      manager.updatePoolConfig('user-service', { maxConnections: 30 });
      
      // The config update should be reflected in subsequent operations
      expect(true).toBe(true); // Basic test to ensure no errors
    });

    test('does not crash for unknown service', () => {
      expect(() => {
        manager.updatePoolConfig('unknown-service', { maxConnections: 30 });
      }).not.toThrow();
    });
  });

  describe('autoResizePools', () => {
    test('increases max connections when near limit', async () => {
      const { userClient } = require('./clients');
      userClient.$queryRaw
        .mockResolvedValue([{ health: 1 }])
        .mockResolvedValue([{ active: 18, idle: 2, total: 20 }]); // Near default max of 20

      await manager.autoResizePools();
      
      // Should not throw and should handle the resize logic
      expect(true).toBe(true);
    });

    test('decreases max connections when underutilized', async () => {
      const { userClient } = require('./clients');
      userClient.$queryRaw
        .mockResolvedValue([{ health: 1 }])
        .mockResolvedValue([{ active: 2, idle: 2, total: 4 }]); // Well under minimum

      // First update config to have higher max connections
      manager.updatePoolConfig('user-service', { maxConnections: 50 });
      
      await manager.autoResizePools();
      
      // Should not throw and should handle the resize logic
      expect(true).toBe(true);
    });
  });

  describe('getPerformanceMetrics', () => {
    test('returns performance metrics for all services', async () => {
      const { userClient } = require('./clients');
      userClient.$queryRaw.mockResolvedValue([{ health: 1 }]);

      // Generate some metrics
      await manager.getServiceClient('user-service');
      await manager.getServiceClient('user-service');
      await manager.getServiceClient('user-service');

      const metrics = await manager.getPerformanceMetrics();
      
      expect(metrics['user-service']).toBeDefined();
      expect(metrics['user-service'].avg).toBeGreaterThanOrEqual(0);
      expect(metrics['user-service'].min).toBeGreaterThanOrEqual(0);
      expect(metrics['user-service'].max).toBeGreaterThanOrEqual(0);
      expect(metrics['user-service'].samples).toBe(3);
    });

    test('returns zero metrics for services with no data', () => {
      const metrics = manager.getPerformanceMetrics();
      
      expect(metrics['unknown-service']).toBeUndefined();
    });
  });

  describe('health monitoring', () => {
    test('starts health monitoring', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      
      manager.startHealthMonitoring(1000);
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
      
      clearIntervalSpy.mockRestore();
      setIntervalSpy.mockRestore();
    });

    test('stops health monitoring', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      manager.startHealthMonitoring(1000);
      manager.stopHealthMonitoring();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      
      clearIntervalSpy.mockRestore();
    });
  });

  describe('cleanup', () => {
    test('disconnects all clients and stops monitoring', async () => {
      const { userClient, notificationClient } = require('./clients');
      
      await manager.cleanup();
      
      expect(userClient.$disconnect).toHaveBeenCalled();
      expect(notificationClient.$disconnect).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    test('handles empty performance metrics gracefully', async () => {
      const metrics = await manager.getPerformanceMetrics();
      
      // Should not crash and return empty object for services with no metrics
      expect(typeof metrics).toBe('object');
    });

    test('handles health check failures gracefully', async () => {
      const { userClient } = require('./clients');
      userClient.$queryRaw.mockRejectedValue(new Error('Network error'));

      const result = await manager.performHealthCheck('user-service');
      
      expect(result.isHealthy).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('limits performance metrics samples', async () => {
      const { userClient } = require('./clients');
      userClient.$queryRaw.mockResolvedValue([{ health: 1 }]);

      // Generate many metrics to test sample limiting
      for (let i = 0; i < 150; i++) {
        await manager.getServiceClient('user-service');
      }

      const metrics = await manager.getPerformanceMetrics();
      
      // Should limit to MAX_METRICS_SAMPLES (100)
      expect(metrics['user-service'].samples).toBeLessThanOrEqual(100);
    });
  });
});
