import { ConnectionPoolManager } from './ConnectionPoolManager';

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  timestamp: Date;
}

interface ConnectionStats {
  totalConnections: number;
  userConnections: number;
  utilizationRate: number;
  connectionsPerUser: Array<{ userId: string; count: number }>;
  timestamp: Date;
}

interface HealthMetrics {
  memory: MemoryStats;
  connections: ConnectionStats;
  uptime: number;
  timestamp: Date;
}

interface MemoryAlert {
  type: 'warning' | 'critical' | 'info';
  message: string;
  timestamp: Date;
  threshold?: number;
  currentValue?: number;
  recommendation?: string;
}

interface MemoryLeakReport {
  detected: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Array<{
    type: string;
    description: string;
    evidence: any;
  }>;
  recommendations: string[];
  timestamp: Date;
}

interface OptimizationRecommendation {
  category: 'memory' | 'connections' | 'garbage_collection' | 'configuration';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  action: string;
  impact: string;
}

interface MemoryReport {
  timestamp: Date;
  summary: {
    currentMemory: MemoryStats;
    averageMemoryUsage: number;
    peakMemoryUsage: number;
    memoryGrowthRate: number;
    totalAlerts: number;
    leaksDetected: number;
  };
  alerts: MemoryAlert[];
  leakReport: MemoryLeakReport;
  recommendations: OptimizationRecommendation[];
  trends: {
    memory: Array<{ timestamp: Date; usage: number }>;
    connections: Array<{ timestamp: Date; connections: number }>;
  };
}

export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private monitoringInterval?: NodeJS.Timeout;
  private memoryHistory: MemoryStats[] = [];
  private connectionHistory: ConnectionStats[] = [];
  private alerts: MemoryAlert[] = [];
  private readonly MAX_HISTORY_SIZE = 100;
  private readonly MAX_ALERTS_SIZE = 50;
  private readonly MONITORING_INTERVAL = 30000; // 30 seconds
  private readonly MEMORY_THRESHOLD_WARNING = 0.8; // 80% memory usage warning
  private readonly MEMORY_THRESHOLD_CRITICAL = 0.9; // 90% memory usage critical
  private readonly LEAK_DETECTION_SAMPLES = 20; // Number of samples for leak detection

  private constructor() {
    this.startMonitoring();
  }

  public static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  private addAlert(alert: MemoryAlert): void {
    this.alerts.push(alert);
    
    // Keep only recent alerts
    if (this.alerts.length > this.MAX_ALERTS_SIZE) {
      this.alerts.shift();
    }
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectMemoryStats();
      this.collectConnectionStats();
      this.checkMemoryThreshold();
      this.performCleanup();
    }, this.MONITORING_INTERVAL);
  }

  private collectMemoryStats(): void {
    const memUsage = process.memoryUsage();
    const stats: MemoryStats = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      timestamp: new Date()
    };

    this.memoryHistory.push(stats);
    
    // Keep only recent history
    if (this.memoryHistory.length > this.MAX_HISTORY_SIZE) {
      this.memoryHistory.shift();
    }
  }

  private collectConnectionStats(): void {
    try {
      const poolManager = ConnectionPoolManager.getInstance();
      const stats = poolManager.getConnectionStats();
      
      const connectionStats: ConnectionStats = {
        totalConnections: stats.totalConnections,
        userConnections: stats.userConnections,
        utilizationRate: stats.utilizationRate,
        connectionsPerUser: stats.connectionsPerUser,
        timestamp: new Date()
      };

      this.connectionHistory.push(connectionStats);
      
      if (this.connectionHistory.length > this.MAX_HISTORY_SIZE) {
        this.connectionHistory.shift();
      }
    } catch (error) {
      console.error('Failed to collect connection stats:', error);
    }
  }

  private checkMemoryThreshold(): void {
    const currentMemory = this.memoryHistory[this.memoryHistory.length - 1];
    if (!currentMemory) return;

    const memoryUsageRatio = currentMemory.heapUsed / currentMemory.heapTotal;
    
    if (memoryUsageRatio > this.MEMORY_THRESHOLD_CRITICAL) {
      const alert: MemoryAlert = {
        type: 'critical',
        message: `Critical memory usage: ${(memoryUsageRatio * 100).toFixed(2)}%`,
        timestamp: new Date(),
        threshold: this.MEMORY_THRESHOLD_CRITICAL,
        currentValue: memoryUsageRatio,
        recommendation: 'Immediate action required. Consider restarting the application or scaling resources.'
      };
      this.addAlert(alert);
      console.error(`🚨 ${alert.message}`);
      this.handleHighMemoryUsage();
    } else if (memoryUsageRatio > this.MEMORY_THRESHOLD_WARNING) {
      const alert: MemoryAlert = {
        type: 'warning',
        message: `High memory usage detected: ${(memoryUsageRatio * 100).toFixed(2)}%`,
        timestamp: new Date(),
        threshold: this.MEMORY_THRESHOLD_WARNING,
        currentValue: memoryUsageRatio,
        recommendation: 'Monitor closely. Consider cleanup operations if usage continues to increase.'
      };
      this.addAlert(alert);
      console.warn(`⚠️ ${alert.message}`);
    }
  }

  private handleHighMemoryUsage(): void {
    // Force garbage collection if available
    if (global.gc) {
      console.log('🗑️ Forcing garbage collection...');
      global.gc();
    }

    // Disconnect inactive connections
    try {
      const poolManager = ConnectionPoolManager.getInstance();
      poolManager.disconnectInactiveConnections();
    } catch (error) {
      console.error('Failed to disconnect inactive connections:', error);
    }

    // Log current state for debugging
    this.logCurrentState();
  }

  private performCleanup(): void {
    // Clean up old history entries
    const cutoffTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    
    this.memoryHistory = this.memoryHistory.filter(
      stats => stats.timestamp > cutoffTime
    );
    
    this.connectionHistory = this.connectionHistory.filter(
      stats => stats.timestamp && stats.timestamp > cutoffTime
    );
  }

  private logCurrentState(): void {
    const currentMemory = this.memoryHistory[this.memoryHistory.length - 1];
    const currentConnections = this.connectionHistory[this.connectionHistory.length - 1];

    console.log('📊 System Health Report:', {
      memory: currentMemory ? {
        heapUsed: `${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(currentMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        usage: `${((currentMemory.heapUsed / currentMemory.heapTotal) * 100).toFixed(2)}%`
      } : 'N/A',
      connections: currentConnections || 'N/A',
      uptime: `${(process.uptime() / 60).toFixed(2)} minutes`
    });
  }

  public getHealthMetrics(): HealthMetrics {
    const currentMemory = this.memoryHistory[this.memoryHistory.length - 1];
    const currentConnections = this.connectionHistory[this.connectionHistory.length - 1];

    return {
      memory: currentMemory || {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
        timestamp: new Date()
      },
      connections: currentConnections || {
        totalConnections: 0,
        userConnections: 0,
        utilizationRate: 0,
        connectionsPerUser: []
      },
      uptime: process.uptime(),
      timestamp: new Date()
    };
  }

  public getMemoryTrend(): Array<{ timestamp: Date; usage: number }> {
    return this.memoryHistory.map(stats => ({
      timestamp: stats.timestamp,
      usage: stats.heapUsed / stats.heapTotal
    }));
  }

  public getConnectionTrend(): Array<{ timestamp: Date; connections: number }> {
    return this.connectionHistory.map(stats => ({
      timestamp: stats.timestamp,
      connections: stats.totalConnections
    }));
  }

  public forceCleanup(): void {
    console.log('🧹 Performing manual cleanup...');
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }

    // Disconnect inactive connections
    try {
      const poolManager = ConnectionPoolManager.getInstance();
      poolManager.disconnectInactiveConnections();
    } catch (error) {
      console.error('Failed to disconnect inactive connections:', error);
    }

    // Clear history
    this.memoryHistory = [];
    this.connectionHistory = [];

    // Collect fresh stats
    this.collectMemoryStats();
    this.collectConnectionStats();
  }

  public getAlerts(): MemoryAlert[] {
    return [...this.alerts];
  }

  public clearAlerts(): void {
    this.alerts = [];
  }

  public generateMemoryReport(): MemoryReport {
    const currentMemory = this.memoryHistory[this.memoryHistory.length - 1] || {
      heapUsed: 0, heapTotal: 0, external: 0, rss: 0, timestamp: new Date()
    };
    
    const memoryUsages = this.memoryHistory.map(stat => stat.heapUsed / stat.heapTotal);
    const averageMemoryUsage = memoryUsages.reduce((sum, usage) => sum + usage, 0) / memoryUsages.length || 0;
    const peakMemoryUsage = Math.max(...memoryUsages, 0);
    
    // Calculate memory growth rate (percentage change over last 10 samples)
    let memoryGrowthRate = 0;
    if (this.memoryHistory.length >= 10) {
      const recent = this.memoryHistory.slice(-5);
      const older = this.memoryHistory.slice(-10, -5);
      const recentAvg = recent.reduce((sum, stat) => sum + (stat.heapUsed / stat.heapTotal), 0) / recent.length;
      const olderAvg = older.reduce((sum, stat) => sum + (stat.heapUsed / stat.heapTotal), 0) / older.length;
      memoryGrowthRate = ((recentAvg - olderAvg) / olderAvg) * 100;
    }

    const leakReport = this.detectMemoryLeaksDetailed();
    const recommendations = this.generateOptimizationRecommendations();

    return {
      timestamp: new Date(),
      summary: {
        currentMemory,
        averageMemoryUsage,
        peakMemoryUsage,
        memoryGrowthRate,
        totalAlerts: this.alerts.length,
        leaksDetected: leakReport.detected ? 1 : 0
      },
      alerts: [...this.alerts],
      leakReport,
      recommendations,
      trends: {
        memory: this.getMemoryTrend(),
        connections: this.getConnectionTrend()
      }
    };
  }

  public detectMemoryLeaksDetailed(): MemoryLeakReport {
    const details: Array<{ type: string; description: string; evidence: any }> = [];
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Check for memory growth trend
    if (this.memoryHistory.length >= this.LEAK_DETECTION_SAMPLES) {
      const recent = this.memoryHistory.slice(-10);
      const older = this.memoryHistory.slice(-20, -10);
      
      if (older.length > 0) {
        const recentAvg = recent.reduce((sum, stat) => sum + (stat.heapUsed / stat.heapTotal), 0) / recent.length;
        const olderAvg = older.reduce((sum, stat) => sum + (stat.heapUsed / stat.heapTotal), 0) / older.length;
        const growthRate = ((recentAvg - olderAvg) / olderAvg) * 100;
        
        if (growthRate > 20) {
          severity = 'critical';
          details.push({
            type: 'memory_growth',
            description: `Critical memory growth detected: ${growthRate.toFixed(2)}% increase`,
            evidence: { growthRate, recentAvg, olderAvg }
          });
        } else if (growthRate > 10) {
          severity = 'high';
          details.push({
            type: 'memory_growth',
            description: `High memory growth detected: ${growthRate.toFixed(2)}% increase`,
            evidence: { growthRate, recentAvg, olderAvg }
          });
        } else if (growthRate > 5) {
          severity = 'medium';
          details.push({
            type: 'memory_growth',
            description: `Moderate memory growth detected: ${growthRate.toFixed(2)}% increase`,
            evidence: { growthRate, recentAvg, olderAvg }
          });
        }
      }
    }

    // Check for connection leaks
    const currentConnections = this.connectionHistory[this.connectionHistory.length - 1];
    if (currentConnections && currentConnections.totalConnections > 100) {
      severity = severity === 'critical' ? 'critical' : 'high';
      details.push({
        type: 'connection_leak',
        description: `High number of connections: ${currentConnections.totalConnections}`,
        evidence: { totalConnections: currentConnections.totalConnections }
      });
    }

    // Check for external memory growth
    if (this.memoryHistory.length >= 10) {
      const recent = this.memoryHistory.slice(-5);
      const older = this.memoryHistory.slice(-10, -5);
      const recentExternal = recent.reduce((sum, stat) => sum + stat.external, 0) / recent.length;
      const olderExternal = older.reduce((sum, stat) => sum + stat.external, 0) / older.length;
      
      if (recentExternal > olderExternal * 1.5) {
        severity = severity === 'critical' ? 'critical' : 'medium';
        details.push({
          type: 'external_memory_growth',
          description: 'External memory usage growing significantly',
          evidence: { recentExternal, olderExternal }
        });
      }
    }

    const recommendations = this.generateLeakRecommendations(details);

    return {
      detected: details.length > 0,
      severity,
      details,
      recommendations,
      timestamp: new Date()
    };
  }

  private generateLeakRecommendations(details: Array<{ type: string; description: string; evidence: any }>): string[] {
    const recommendations: string[] = [];
    
    details.forEach(detail => {
      switch (detail.type) {
        case 'memory_growth':
          recommendations.push('Review object creation and cleanup patterns');
          recommendations.push('Check for event listeners that are not being removed');
          recommendations.push('Consider implementing object pooling for frequently created objects');
          break;
        case 'connection_leak':
          recommendations.push('Ensure all database connections are properly closed');
          recommendations.push('Review connection pooling configuration');
          recommendations.push('Check for unclosed WebSocket connections');
          break;
        case 'external_memory_growth':
          recommendations.push('Review native module usage');
          recommendations.push('Check for buffer leaks');
          recommendations.push('Monitor file handle usage');
          break;
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('No specific memory leaks detected. Continue monitoring.');
    }

    return recommendations;
  }

  private generateOptimizationRecommendations(): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];
    const currentMemory = this.memoryHistory[this.memoryHistory.length - 1];
    
    if (!currentMemory) return recommendations;

    const memoryUsage = currentMemory.heapUsed / currentMemory.heapTotal;

    // Memory optimization recommendations
    if (memoryUsage > 0.8) {
      recommendations.push({
        category: 'memory',
        priority: 'high',
        title: 'High Memory Usage',
        description: `Current memory usage is ${(memoryUsage * 100).toFixed(2)}%`,
        action: 'Consider scaling up memory or implementing memory optimization strategies',
        impact: 'High - May cause application instability'
      });
    }

    if (memoryUsage > 0.6) {
      recommendations.push({
        category: 'garbage_collection',
        priority: 'medium',
        title: 'Enable Garbage Collection',
        description: 'Manual garbage collection may help free up memory',
        action: 'Run garbage collection during low-traffic periods',
        impact: 'Medium - Can improve memory utilization'
      });
    }

    // Connection optimization recommendations
    const currentConnections = this.connectionHistory[this.connectionHistory.length - 1];
    if (currentConnections && currentConnections.utilizationRate > 0.8) {
      recommendations.push({
        category: 'connections',
        priority: 'medium',
        title: 'High Connection Utilization',
        description: `Connection pool utilization is ${(currentConnections.utilizationRate * 100).toFixed(2)}%`,
        action: 'Consider increasing connection pool size or implementing connection reuse',
        impact: 'Medium - May affect application performance'
      });
    }

    // Configuration recommendations
    if (!global.gc) {
      recommendations.push({
        category: 'configuration',
        priority: 'low',
        title: 'Enable Manual GC',
        description: 'Manual garbage collection is not available',
        action: 'Start Node.js with --expose-gc flag for better memory control',
        impact: 'Low - Provides additional memory management options'
      });
    }

    return recommendations;
  }

  public shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.memoryHistory = [];
    this.connectionHistory = [];
    this.alerts = [];
  }

  // Utility method to get memory leak warnings
  public detectMemoryLeaks(): Array<{ type: string; severity: string; message: string }> {
    const warnings: Array<{ type: string; severity: string; message: string }> = [];

    // Check for memory growth trend
    if (this.memoryHistory.length >= 10) {
      const recent = this.memoryHistory.slice(-10);
      const older = this.memoryHistory.slice(-20, -10);
      
      if (older.length > 0) {
        const recentAvg = recent.reduce((sum, stat) => sum + (stat.heapUsed / stat.heapTotal), 0) / recent.length;
        const olderAvg = older.reduce((sum, stat) => sum + (stat.heapUsed / stat.heapTotal), 0) / older.length;
        
        if (recentAvg > olderAvg + 0.1) { // 10% increase
          warnings.push({
            type: 'memory_growth',
            severity: 'warning',
            message: `Memory usage increased by ${((recentAvg - olderAvg) * 100).toFixed(2)}% over time`
          });
        }
      }
    }

    // Check for connection leaks
    const currentConnections = this.connectionHistory[this.connectionHistory.length - 1];
    if (currentConnections && currentConnections.totalConnections > 100) {
      warnings.push({
        type: 'connection_leak',
        severity: 'warning',
        message: `High number of connections: ${currentConnections.totalConnections}`
      });
    }

    return warnings;
  }
}
