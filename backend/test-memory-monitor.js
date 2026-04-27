/**
 * Memory Monitor Test Script
 * 
 * This script demonstrates the Memory Monitor functionality
 * Run with: node test-memory-monitor.js
 */

// Mock the ConnectionPoolManager for testing
class MockConnectionPoolManager {
  static getInstance() {
    return {
      getConnectionStats: () => ({
        totalConnections: 50,
        userConnections: 30,
        utilizationRate: 0.6,
        connectionsPerUser: [
          { userId: 'user1', count: 5 },
          { userId: 'user2', count: 3 }
        ]
      }),
      disconnectInactiveConnections: () => {
        console.log('Mock: Disconnecting inactive connections');
      }
    };
  }
}

// Mock the ConnectionPoolManager import
const originalRequire = require;
require = function(id) {
  if (id.includes('ConnectionPoolManager')) {
    return { ConnectionPoolManager: MockConnectionPoolManager };
  }
  return originalRequire.apply(this, arguments);
};

// Import MemoryMonitor
const { MemoryMonitor } = require('./MemoryMonitor.ts');

async function testMemoryMonitor() {
  console.log('🧠 Testing Memory Monitor Implementation...\n');

  // Initialize Memory Monitor
  const memoryMonitor = MemoryMonitor.getInstance();
  console.log('✅ Memory Monitor initialized successfully');

  // Test health metrics
  console.log('\n📊 Testing Health Metrics...');
  const healthMetrics = memoryMonitor.getHealthMetrics();
  console.log('Health Metrics:', {
    memory: {
      heapUsed: `${(healthMetrics.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(healthMetrics.memory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      usage: `${((healthMetrics.memory.heapUsed / healthMetrics.memory.heapTotal) * 100).toFixed(2)}%`
    },
    connections: {
      total: healthMetrics.connections.totalConnections,
      utilization: `${(healthMetrics.connections.utilizationRate * 100).toFixed(2)}%`
    },
    uptime: `${(healthMetrics.uptime / 60).toFixed(2)} minutes`
  });

  // Test memory trends
  console.log('\n📈 Testing Memory Trends...');
  const memoryTrend = memoryMonitor.getMemoryTrend();
  const connectionTrend = memoryMonitor.getConnectionTrend();
  console.log(`Memory trend points: ${memoryTrend.length}`);
  console.log(`Connection trend points: ${connectionTrend.length}`);

  // Test memory leak detection
  console.log('\n🔍 Testing Memory Leak Detection...');
  const leakDetection = memoryMonitor.detectMemoryLeaks();
  console.log('Memory leak detection results:', leakDetection);

  // Test detailed leak detection
  console.log('\n🔬 Testing Detailed Memory Leak Detection...');
  const detailedLeakDetection = memoryMonitor.detectMemoryLeaksDetailed();
  console.log('Detailed leak detection:', {
    detected: detailedLeakDetection.detected,
    severity: detailedLeakDetection.severity,
    detailsCount: detailedLeakDetection.details.length,
    recommendationsCount: detailedLeakDetection.recommendations.length
  });

  // Test alerts
  console.log('\n🚨 Testing Alert System...');
  const alerts = memoryMonitor.getAlerts();
  console.log(`Current alerts: ${alerts.length}`);

  // Test memory report generation
  console.log('\n📋 Testing Memory Report Generation...');
  const report = memoryMonitor.generateMemoryReport();
  console.log('Memory report summary:', {
    averageMemoryUsage: `${(report.summary.averageMemoryUsage * 100).toFixed(2)}%`,
    peakMemoryUsage: `${(report.summary.peakMemoryUsage * 100).toFixed(2)}%`,
    memoryGrowthRate: `${report.summary.memoryGrowthRate.toFixed(2)}%`,
    totalAlerts: report.summary.totalAlerts,
    recommendationsCount: report.recommendations.length
  });

  // Test optimization recommendations
  console.log('\n💡 Testing Optimization Recommendations...');
  if (report.recommendations.length > 0) {
    report.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
      console.log(`   Description: ${rec.description}`);
      console.log(`   Action: ${rec.action}`);
      console.log(`   Impact: ${rec.impact}\n`);
    });
  } else {
    console.log('No optimization recommendations at this time.');
  }

  // Test cleanup functionality
  console.log('\n🧹 Testing Cleanup Functionality...');
  memoryMonitor.forceCleanup();
  console.log('✅ Manual cleanup completed');

  // Test alert clearing
  console.log('\n🗑️ Testing Alert Clearing...');
  memoryMonitor.clearAlerts();
  const alertsAfterClear = memoryMonitor.getAlerts();
  console.log(`Alerts after clearing: ${alertsAfterClear.length}`);

  console.log('\n🎉 Memory Monitor test completed successfully!');
  console.log('\n📚 API Endpoints Available:');
  console.log('- GET /api/monitoring/memory - Get memory metrics and trends');
  console.log('- GET /api/monitoring/memory/alerts - Get memory alerts and leak detection');
  console.log('- GET /api/monitoring/memory/report - Get comprehensive memory report');
  console.log('- POST /api/monitoring/memory/cleanup - Force memory cleanup');
  console.log('- DELETE /api/monitoring/memory/alerts - Clear all memory alerts');

  // Shutdown
  memoryMonitor.shutdown();
  console.log('\n👋 Memory Monitor shutdown complete');
}

// Run test if this file is executed directly
if (require.main === module) {
  testMemoryMonitor().catch(console.error);
}

module.exports = { testMemoryMonitor };
