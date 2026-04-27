import { logger } from '../../services/logger';

export interface PerformanceMetrics {
  // Navigation timing
  navigationStart: number;
  domContentLoaded: number;
  loadComplete: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  firstInputDelay: number;
  cumulativeLayoutShift: number;
  
  // Resource timing
  resourceTiming: Array<{
    name: string;
    duration: number;
    size: number;
    type: string;
  }>;
  
  // Memory usage
  memoryUsage: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  
  // Network performance
  networkInfo: {
    effectiveType: string;
    downlink: number;
    rtt: number;
    saveData: boolean;
  };
  
  // Custom metrics
  componentRenderTimes: Record<string, number>;
  userInteractions: Array<{
    type: string;
    timestamp: number;
    duration: number;
    target: string;
  }>;
}

export interface PerformanceConfig {
  enabled: boolean;
  samplingRate: number;
  endpoint: string;
  apiKey?: string;
  metricsRetention: number; // hours
  alertThresholds: {
    loadTime: number; // ms
    firstContentfulPaint: number; // ms
    largestContentfulPaint: number; // ms
    cumulativeLayoutShift: number;
    memoryUsage: number; // MB
  };
}

/**
 * Comprehensive performance monitoring service
 * Tracks Core Web Vitals, resource loading, and custom metrics
 */
class PerformanceMonitoringService {
  private config: PerformanceConfig;
  private metrics: PerformanceMetrics;
  private observers: PerformanceObserver[] = [];
  private isSupported = true;
  private startTime = Date.now();

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      enabled: process.env.NODE_ENV === 'production',
      samplingRate: 1.0,
      endpoint: process.env.PERFORMANCE_ENDPOINT || '/api/performance/metrics',
      apiKey: process.env.PERFORMANCE_API_KEY,
      metricsRetention: 24, // 24 hours
      alertThresholds: {
        loadTime: 3000, // 3 seconds
        firstContentfulPaint: 1500, // 1.5 seconds
        largestContentfulPaint: 2500, // 2.5 seconds
        cumulativeLayoutShift: 0.1,
        memoryUsage: 100 // 100MB
      },
      ...config
    };

    this.metrics = this.initializeMetrics();
    this.checkSupport();
    
    if (this.config.enabled && this.isSupported) {
      this.startMonitoring();
    }
  }

  private initializeMetrics(): PerformanceMetrics {
    return {
      navigationStart: 0,
      domContentLoaded: 0,
      loadComplete: 0,
      firstContentfulPaint: 0,
      largestContentfulPaint: 0,
      firstInputDelay: 0,
      cumulativeLayoutShift: 0,
      resourceTiming: [],
      memoryUsage: {
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
        jsHeapSizeLimit: 0
      },
      networkInfo: {
        effectiveType: '4g',
        downlink: 10,
        rtt: 100,
        saveData: false
      },
      componentRenderTimes: {},
      userInteractions: []
    };
  }

  private checkSupport(): void {
    this.isSupported = !!(window.performance && window.PerformanceObserver);
    
    if (!this.isSupported) {
      console.warn('Performance monitoring not supported in this browser');
    }
  }

  private startMonitoring(): void {
    // Navigation timing
    this.observeNavigationTiming();
    
    // Core Web Vitals
    this.observeFirstContentfulPaint();
    this.observeLargestContentfulPaint();
    this.observeFirstInputDelay();
    this.observeCumulativeLayoutShift();
    
    // Resource timing
    this.observeResourceTiming();
    
    // Memory usage
    this.observeMemoryUsage();
    
    // Network information
    this.observeNetworkInfo();
    
    // User interactions
    this.observeUserInteractions();
    
    // Send metrics on page unload
    window.addEventListener('beforeunload', () => {
      this.sendMetrics();
    });

    // Send metrics periodically
    setInterval(() => {
      this.sendMetrics();
    }, 30000); // Every 30 seconds
  }

  private observeNavigationTiming(): void {
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      
      this.metrics.navigationStart = timing.navigationStart;
      this.metrics.domContentLoaded = timing.domContentLoadedEventEnd - timing.navigationStart;
      this.metrics.loadComplete = timing.loadEventEnd - timing.navigationStart;
    }
  }

  private observeFirstContentfulPaint(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.firstContentfulPaint = entry.startTime;
            break;
          }
        }
      });
      
      observer.observe({ type: 'paint', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      console.warn('First Contentful Paint observation not supported:', error);
    }
  }

  private observeLargestContentfulPaint(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.metrics.largestContentfulPaint = lastEntry.startTime;
        }
      });
      
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      console.warn('Largest Contentful Paint observation not supported:', error);
    }
  }

  private observeFirstInputDelay(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.name === 'first-input') {
            this.metrics.firstInputDelay = (entry as any).processingStart - entry.startTime;
            break;
          }
        }
      });
      
      observer.observe({ type: 'first-input', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      console.warn('First Input Delay observation not supported:', error);
    }
  }

  private observeCumulativeLayoutShift(): void {
    try {
      let clsValue = 0;
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        this.metrics.cumulativeLayoutShift = clsValue;
      });
      
      observer.observe({ type: 'layout-shift', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      console.warn('Cumulative Layout Shift observation not supported:', error);
    }
  }

  private observeResourceTiming(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.entryType === 'resource') {
            const resource = entry as PerformanceResourceTiming;
            this.metrics.resourceTiming.push({
              name: resource.name,
              duration: resource.duration,
              size: resource.transferSize || 0,
              type: this.getResourceType(resource.name)
            });
          }
        }
      });
      
      observer.observe({ type: 'resource', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      console.warn('Resource timing observation not supported:', error);
    }
  }

  private getResourceType(url: string): string {
    if (url.includes('.js')) return 'script';
    if (url.includes('.css')) return 'stylesheet';
    if (url.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|eot)$/)) return 'font';
    return 'other';
  }

  private observeMemoryUsage(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      };
    }
  }

  private observeNetworkInfo(): void {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      this.metrics.networkInfo = {
        effectiveType: connection.effectiveType || '4g',
        downlink: connection.downlink || 10,
        rtt: connection.rtt || 100,
        saveData: connection.saveData || false
      };
    }
  }

  private observeUserInteractions(): void {
    const events = ['click', 'touchstart', 'keydown'];
    
    events.forEach(eventType => {
      document.addEventListener(eventType, (event) => {
        const target = (event.target as Element)?.tagName || 'unknown';
        const startTime = performance.now();
        
        // Simple interaction tracking
        this.metrics.userInteractions.push({
          type: eventType,
          timestamp: Date.now(),
          duration: 0, // Would need more complex tracking for actual duration
          target
        });
      }, { passive: true });
    });
  }

  /**
   * Record component render time
   */
  recordComponentRender(componentName: string, renderTime: number): void {
    this.metrics.componentRenderTimes[componentName] = renderTime;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    // Update memory usage
    this.observeMemoryUsage();
    
    return { ...this.metrics };
  }

  /**
   * Get performance score (0-100)
   */
  getPerformanceScore(): {
    overall: number;
    factors: {
      loadTime: number;
      firstContentfulPaint: number;
      largestContentfulPaint: number;
      cumulativeLayoutShift: number;
      memoryUsage: number;
    };
  } {
    const thresholds = this.config.alertThresholds;
    let score = 100;
    
    const factors = {
      loadTime: Math.max(0, 100 - (this.metrics.loadComplete / thresholds.loadTime) * 100),
      firstContentfulPaint: Math.max(0, 100 - (this.metrics.firstContentfulPaint / thresholds.firstContentfulPaint) * 100),
      largestContentfulPaint: Math.max(0, 100 - (this.metrics.largestContentfulPaint / thresholds.largestContentfulPaint) * 100),
      cumulativeLayoutShift: Math.max(0, 100 - (this.metrics.cumulativeLayoutShift / thresholds.cumulativeLayoutShift) * 100),
      memoryUsage: Math.max(0, 100 - ((this.metrics.memoryUsage.usedJSHeapSize / 1024 / 1024) / thresholds.memoryUsage) * 100)
    };
    
    const overall = Object.values(factors).reduce((a, b) => a + b, 0) / Object.keys(factors).length;
    
    return { overall, factors };
  }

  /**
   * Send metrics to monitoring service
   */
  private async sendMetrics(): Promise<void> {
    if (!this.config.enabled || !this.isSupported) {
      return;
    }

    // Apply sampling rate
    if (Math.random() > this.config.samplingRate) {
      return;
    }

    try {
      const metrics = this.getMetrics();
      const score = this.getPerformanceScore();
      
      const payload = {
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        sessionId: this.getSessionId(),
        metrics,
        score,
        config: {
          samplingRate: this.config.samplingRate,
          thresholds: this.config.alertThresholds
        }
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: true
      });

    } catch (error) {
      console.warn('Failed to send performance metrics:', error);
    }
  }

  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('performance_session_id');
    if (!sessionId) {
      sessionId = `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('performance_session_id', sessionId);
    }
    return sessionId;
  }

  /**
   * Get performance recommendations
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    const metrics = this.metrics;
    const thresholds = this.config.alertThresholds;

    if (metrics.loadComplete > thresholds.loadTime) {
      recommendations.push('Page load time is slow. Consider optimizing resources and enabling compression.');
    }

    if (metrics.firstContentfulPaint > thresholds.firstContentfulPaint) {
      recommendations.push('First Contentful Paint is slow. Optimize critical rendering path and reduce server response time.');
    }

    if (metrics.largestContentfulPaint > thresholds.largestContentfulPaint) {
      recommendations.push('Largest Contentful Paint is slow. Optimize images and reduce JavaScript execution time.');
    }

    if (metrics.cumulativeLayoutShift > thresholds.cumulativeLayoutShift) {
      recommendations.push('Layout shift detected. Ensure proper dimensions for images and ads to prevent layout changes.');
    }

    if (metrics.memoryUsage.usedJSHeapSize > thresholds.memoryUsage * 1024 * 1024) {
      recommendations.push('Memory usage is high. Check for memory leaks and optimize data structures.');
    }

    // Slow resources
    const slowResources = metrics.resourceTiming.filter(r => r.duration > 2000);
    if (slowResources.length > 0) {
      recommendations.push(`${slowResources.length} resources are loading slowly. Consider optimizing or caching these resources.`);
    }

    return recommendations;
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (enabled && this.isSupported && this.observers.length === 0) {
      this.startMonitoring();
    } else if (!enabled) {
      this.stop();
    }
  }
}

// Singleton instance
let performanceMonitoringService: PerformanceMonitoringService | null = null;

export function getPerformanceMonitoringService(): PerformanceMonitoringService {
  if (!performanceMonitoringService) {
    performanceMonitoringService = new PerformanceMonitoringService();
  }
  return performanceMonitoringService;
}

export default PerformanceMonitoringService;
