import {
  userClient,
  notificationClient,
  documentClient,
  utilityClient,
  paymentClient,
  billingClient,
  analyticsClient,
  webhookClient,
} from './clients';

export interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  healthCheckIntervalMs: number;
}

export interface PoolStats {
  serviceName: string;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  avgResponseTime: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck: Date;
}

export interface HealthCheckResult {
  serviceName: string;
  isHealthy: boolean;
  responseTime: number;
  error?: string;
}

const DEFAULT_CONFIG: PoolConfig = {
  minConnections: 2,
  maxConnections: 20,
  connectionTimeoutMs: 30000,
  idleTimeoutMs: 300000,
  healthCheckIntervalMs: 60000,
};

export class ConnectionPoolManager {
  private pools = new Map<string, any>();
  private configs = new Map<string, PoolConfig>();
  private healthCheckIntervals = new Map<string, NodeJS.Timeout>();
  private performanceMetrics = new Map<string, number[]>();
  private readonly MAX_METRICS_SAMPLES = 100;

  constructor() {
    this.initializePools();
  }

  private initializePools(): void {
    const services = [
      'user-service',
      'notification-service',
      'document-service',
      'utility-service',
      'payment-service',
      'billing-service',
      'analytics-service',
      'webhook-service',
    ];

    services.forEach(service => {
      this.configs.set(service, { ...DEFAULT_CONFIG });
      this.performanceMetrics.set(service, []);
    });
  }

  async getServiceClient(serviceName: string): Promise<any> {
    const clientMap = {
      'user-service': userClient,
      'notification-service': notificationClient,
      'document-service': documentClient,
      'utility-service': utilityClient,
      'payment-service': paymentClient,
      'billing-service': billingClient,
      'analytics-service': analyticsClient,
      'webhook-service': webhookClient,
    };

    const client = clientMap[serviceName as keyof typeof clientMap];
    if (!client) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    // Record performance metrics
    const startTime = Date.now();
    
    try {
      // Ensure connection is healthy before returning
      await this.performHealthCheck(serviceName);
      return client;
    } finally {
      const responseTime = Date.now() - startTime;
      this.recordPerformanceMetric(serviceName, responseTime);
    }
  }

  private recordPerformanceMetric(serviceName: string, responseTime: number): void {
    const metrics = this.performanceMetrics.get(serviceName) || [];
    metrics.push(responseTime);
    
    // Keep only the last MAX_METRICS_SAMPLES
    if (metrics.length > this.MAX_METRICS_SAMPLES) {
      metrics.shift();
    }
    
    this.performanceMetrics.set(serviceName, metrics);
  }

  async performHealthCheck(serviceName: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let isHealthy = false;
    let error: string | undefined;

    try {
      const client = await this.getServiceClient(serviceName);
      await client.$queryRaw`SELECT 1`;
      isHealthy = true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      isHealthy = false;
    }

    const responseTime = Date.now() - startTime;

    return {
      serviceName,
      isHealthy,
      responseTime,
      error,
    };
  }

  async getAllHealthChecks(): Promise<HealthCheckResult[]> {
    const services = Array.from(this.configs.keys());
    const healthChecks = await Promise.all(
      services.map(service => this.performHealthCheck(service))
    );

    return healthChecks;
  }

  async getPoolStats(serviceName: string): Promise<PoolStats> {
    const config = this.configs.get(serviceName);
    const metrics = this.performanceMetrics.get(serviceName) || [];
    const healthCheck = await this.performHealthCheck(serviceName);

    // Calculate average response time
    const avgResponseTime = metrics.length > 0 
      ? metrics.reduce((sum, time) => sum + time, 0) / metrics.length 
      : 0;

    // Get connection statistics from database
    let activeConnections = 0;
    let idleConnections = 0;
    let totalConnections = 0;

    try {
      const client = await this.getServiceClient(serviceName);
      const result = await client.$queryRaw<any[]>`
        SELECT 
          count(*) FILTER (WHERE state = 'active') as active,
          count(*) FILTER (WHERE state = 'idle') as idle,
          count(*) as total
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;

      const stats = result[0];
      activeConnections = Number(stats.active) || 0;
      idleConnections = Number(stats.idle) || 0;
      totalConnections = Number(stats.total) || 0;
    } catch (error) {
      console.error(`Error getting pool stats for ${serviceName}:`, error);
    }

    // Determine health status
    let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!healthCheck.isHealthy) {
      healthStatus = 'unhealthy';
    } else if (avgResponseTime > 1000 || totalConnections > (config?.maxConnections || 20) * 0.8) {
      healthStatus = 'degraded';
    }

    return {
      serviceName,
      totalConnections,
      activeConnections,
      idleConnections,
      waitingRequests: 0, // Would need additional monitoring
      avgResponseTime,
      healthStatus,
      lastHealthCheck: new Date(),
    };
  }

  async getAllPoolStats(): Promise<PoolStats[]> {
    const services = Array.from(this.configs.keys());
    const stats = await Promise.all(
      services.map(service => this.getPoolStats(service))
    );

    return stats;
  }

  updatePoolConfig(serviceName: string, config: Partial<PoolConfig>): void {
    const currentConfig = this.configs.get(serviceName);
    if (currentConfig) {
      this.configs.set(serviceName, { ...currentConfig, ...config });
    }
  }

  async autoResizePools(): Promise<void> {
    const stats = await this.getAllPoolStats();
    
    for (const stat of stats) {
      const config = this.configs.get(stat.serviceName);
      if (!config) continue;

      // Auto-resize logic
      if (stat.totalConnections > config.maxConnections * 0.9) {
        // Consider increasing max connections
        const newMax = Math.min(config.maxConnections * 1.5, 50);
        this.updatePoolConfig(stat.serviceName, { maxConnections: newMax });
        console.log(`🔧 Auto-resized ${stat.serviceName} max connections to ${newMax}`);
      } else if (stat.totalConnections < config.minConnections * 2 && config.maxConnections > DEFAULT_CONFIG.maxConnections) {
        // Consider decreasing max connections
        const newMax = Math.max(config.maxConnections * 0.8, DEFAULT_CONFIG.maxConnections);
        this.updatePoolConfig(stat.serviceName, { maxConnections: newMax });
        console.log(`🔧 Auto-resized ${stat.serviceName} max connections to ${newMax}`);
      }
    }
  }

  startHealthMonitoring(intervalMs: number = 60000): void {
    console.log(`🏥 Starting health monitoring (interval: ${intervalMs}ms)`);
    
    // Clear existing intervals
    this.healthCheckIntervals.forEach(interval => clearInterval(interval));
    this.healthCheckIntervals.clear();

    // Start new health monitoring
    const interval = setInterval(async () => {
      try {
        const healthChecks = await this.getAllHealthChecks();
        const unhealthyServices = healthChecks.filter(check => !check.isHealthy);
        
        if (unhealthyServices.length > 0) {
          console.warn(`⚠️ Unhealthy services detected:`, unhealthyServices);
        }

        // Auto-resize pools based on current load
        await this.autoResizePools();
      } catch (error) {
        console.error('Health monitoring error:', error);
      }
    }, intervalMs);

    this.healthCheckIntervals.set('global', interval);
  }

  stopHealthMonitoring(): void {
    this.healthCheckIntervals.forEach(interval => clearInterval(interval));
    this.healthCheckIntervals.clear();
    console.log('🛑 Health monitoring stopped');
  }

  async getPerformanceMetrics(): Promise<Record<string, { avg: number; min: number; max: number; samples: number }>> {
    const metrics: Record<string, { avg: number; min: number; max: number; samples: number }> = {};

    for (const [serviceName, responseTimes] of this.performanceMetrics.entries()) {
      if (responseTimes.length === 0) {
        metrics[serviceName] = { avg: 0, min: 0, max: 0, samples: 0 };
        continue;
      }

      const avg = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const min = Math.min(...responseTimes);
      const max = Math.max(...responseTimes);

      metrics[serviceName] = {
        avg: Math.round(avg),
        min,
        max,
        samples: responseTimes.length,
      };
    }

    return metrics;
  }

  async logDetailedStats(): Promise<void> {
    const stats = await this.getAllPoolStats();
    const performanceMetrics = await this.getPerformanceMetrics();

    console.log('\n📊 Detailed Connection Pool Statistics:');
    console.table(stats);
    
    console.log('\n⚡ Performance Metrics (response times in ms):');
    console.table(performanceMetrics);
  }

  async cleanup(): Promise<void> {
    this.stopHealthMonitoring();
    
    // Disconnect all clients
    const clients = [
      userClient,
      notificationClient,
      documentClient,
      utilityClient,
      paymentClient,
      billingClient,
      analyticsClient,
      webhookClient,
    ];

    await Promise.all(
      clients.map(client => client ? (client as any).$disconnect().catch(console.error) : Promise.resolve())
    );

    console.log('🧹 Connection pool manager cleaned up');
  }
}

export default new ConnectionPoolManager();
