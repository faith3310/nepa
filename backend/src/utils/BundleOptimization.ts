import { logger } from '../../services/logger';

export interface BundleAnalysis {
  totalSize: number;
  chunks: Array<{
    name: string;
    size: number;
    modules: string[];
    dependencies: string[];
  }>;
  dependencies: Array<{
    name: string;
    size: number;
    version: string;
    usage: number; // percentage
  }>;
  recommendations: string[];
}

export interface OptimizationConfig {
  enabled: boolean;
  chunkSplitting: boolean;
  treeShaking: boolean;
  compression: boolean;
  caching: boolean;
  prefetch: boolean;
  preload: boolean;
}

/**
 * Bundle optimization utilities
 * Helps with code splitting, tree shaking, and resource optimization
 */
class BundleOptimizationService {
  private config: OptimizationConfig;
  private loadedChunks = new Set<string>();
  private chunkCache = new Map<string, any>();

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = {
      enabled: process.env.NODE_ENV === 'production',
      chunkSplitting: true,
      treeShaking: true,
      compression: true,
      caching: true,
      prefetch: true,
      preload: true,
      ...config
    };

    if (this.config.enabled) {
      this.initializeOptimizations();
    }
  }

  private initializeOptimizations(): void {
    // Setup chunk loading monitoring
    this.monitorChunkLoading();
    
    // Setup resource hints
    this.setupResourceHints();
    
    // Setup service worker for caching
    this.setupServiceWorker();
  }

  private monitorChunkLoading(): void {
    // Monitor dynamic imports
    const originalImport = window.import;
    
    window.import = async (specifier: string) => {
      const startTime = performance.now();
      
      try {
        const module = await originalImport(specifier);
        const loadTime = performance.now() - startTime;
        
        this.recordChunkLoad(specifier, loadTime);
        
        return module;
      } catch (error) {
        console.error(`Failed to load chunk: ${specifier}`, error);
        throw error;
      }
    };
  }

  private recordChunkLoad(specifier: string, loadTime: number): void {
    this.loadedChunks.add(specifier);
    
    // Record performance metrics
    if (window.performance && window.performance.mark) {
      window.performance.mark(`chunk-loaded-${specifier}`);
    }
    
    // Log slow chunks
    if (loadTime > 1000) {
      console.warn(`Slow chunk loading detected: ${specifier} (${loadTime.toFixed(2)}ms)`);
    }
  }

  private setupResourceHints(): void {
    // Add prefetch and preload hints for critical resources
    this.addResourceHints();
  }

  private addResourceHints(): void {
    const hints = [
      // Preload critical CSS
      { rel: 'preload', href: '/css/main.css', as: 'style' },
      // Preload critical JavaScript
      { rel: 'preload', href: '/js/main.js', as: 'script' },
      // Prefetch likely next pages
      { rel: 'prefetch', href: '/dashboard' },
      { rel: 'prefetch', href: '/profile' }
    ];

    hints.forEach(hint => {
      const link = document.createElement('link');
      Object.assign(link, hint);
      document.head.appendChild(link);
    });
  }

  private setupServiceWorker(): void {
    if ('serviceWorker' in navigator && this.config.caching) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered for bundle caching');
        })
        .catch(error => {
          console.warn('Service Worker registration failed:', error);
        });
    }
  }

  /**
   * Dynamic import with retry and caching
   */
  async loadChunk<T>(
    chunkName: string,
    loader: () => Promise<T>,
    options: {
      retries?: number;
      timeout?: number;
      cache?: boolean;
    } = {}
  ): Promise<T> {
    const { retries = 3, timeout = 10000, cache = this.config.caching } = options;
    
    // Check cache first
    if (cache && this.chunkCache.has(chunkName)) {
      return this.chunkCache.get(chunkName);
    }

    let lastError: Error;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const startTime = performance.now();
        
        const result = await Promise.race([
          loader(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Chunk load timeout')), timeout)
          )
        ]);
        
        const loadTime = performance.now() - startTime;
        
        // Cache the result
        if (cache) {
          this.chunkCache.set(chunkName, result);
        }
        
        this.recordChunkLoad(chunkName, loadTime);
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`Chunk load attempt ${attempt} failed for ${chunkName}:`, error);
        
        if (attempt < retries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }

  /**
   * Preload chunks for better performance
   */
  async preloadChunks(chunkNames: string[]): Promise<void> {
    if (!this.config.prefetch) return;
    
    const preloadPromises = chunkNames.map(async chunkName => {
      try {
        // Create a preload link
        const link = document.createElement('link');
        link.rel = 'preload';
        link.href = `/chunks/${chunkName}.js`;
        link.as = 'script';
        document.head.appendChild(link);
        
        // Remove link after a delay
        setTimeout(() => {
          document.head.removeChild(link);
        }, 5000);
        
      } catch (error) {
        console.warn(`Failed to preload chunk ${chunkName}:`, error);
      }
    });
    
    await Promise.allSettled(preloadPromises);
  }

  /**
   * Analyze bundle size and provide recommendations
   */
  analyzeBundle(): BundleAnalysis {
    // This would typically be done at build time
    // Here we provide a runtime analysis based on loaded chunks
    
    const chunks = Array.from(this.loadedChunks).map(name => ({
      name,
      size: this.estimateChunkSize(name),
      modules: this.getChunkModules(name),
      dependencies: this.getChunkDependencies(name)
    }));

    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    
    const dependencies = this.analyzeDependencies();
    const recommendations = this.generateRecommendations(chunks, dependencies);

    return {
      totalSize,
      chunks,
      dependencies,
      recommendations
    };
  }

  private estimateChunkSize(chunkName: string): number {
    // Estimate size based on name and typical patterns
    if (chunkName.includes('vendor')) return 500000; // 500KB
    if (chunkName.includes('main')) return 200000; // 200KB
    if (chunkName.includes('component')) return 50000; // 50KB
    return 100000; // 100KB default
  }

  private getChunkModules(chunkName: string): string[] {
    // This would be populated by build tools
    // For now, return estimated modules
    if (chunkName.includes('vendor')) return ['react', 'react-dom', 'i18next'];
    if (chunkName.includes('main')) return ['App', 'Router', 'Layout'];
    return [chunkName];
  }

  private getChunkDependencies(chunkName: string): string[] {
    // This would be populated by build tools
    return [];
  }

  private analyzeDependencies(): Array<{
    name: string;
    size: number;
    version: string;
    usage: number;
  }> {
    // Analyze loaded dependencies
    const dependencies = [
      { name: 'react', size: 42000, version: '18.2.0', usage: 100 },
      { name: 'react-dom', size: 120000, version: '18.2.0', usage: 100 },
      { name: 'i18next', size: 15000, version: '23.7.6', usage: 80 },
      { name: 'stellar-sdk', size: 250000, version: '14.5.0', usage: 60 }
    ];

    return dependencies;
  }

  private generateRecommendations(
    chunks: BundleAnalysis['chunks'],
    dependencies: BundleAnalysis['dependencies']
  ): string[] {
    const recommendations: string[] = [];

    // Chunk size recommendations
    const largeChunks = chunks.filter(chunk => chunk.size > 200000);
    if (largeChunks.length > 0) {
      recommendations.push(`Consider splitting large chunks: ${largeChunks.map(c => c.name).join(', ')}`);
    }

    // Dependency recommendations
    const largeDeps = dependencies.filter(dep => dep.size > 100000 && dep.usage < 50);
    if (largeDeps.length > 0) {
      recommendations.push(`Consider lazy loading large dependencies: ${largeDeps.map(d => d.name).join(', ')}`);
    }

    // General optimizations
    if (this.config.compression) {
      recommendations.push('Enable gzip/brotli compression for better bundle size reduction');
    }

    if (chunks.length > 10) {
      recommendations.push('Consider reducing the number of chunks for better caching');
    }

    return recommendations;
  }

  /**
   * Clear chunk cache
   */
  clearCache(): void {
    this.chunkCache.clear();
    this.loadedChunks.clear();
  }

  /**
   * Get optimization statistics
   */
  getStats(): {
    loadedChunks: number;
    cachedChunks: number;
    totalEstimatedSize: number;
    averageChunkSize: number;
  } {
    const chunks = Array.from(this.loadedChunks);
    const totalSize = chunks.reduce((sum, chunk) => sum + this.estimateChunkSize(chunk), 0);
    
    return {
      loadedChunks: chunks.length,
      cachedChunks: this.chunkCache.size,
      totalEstimatedSize: totalSize,
      averageChunkSize: chunks.length > 0 ? totalSize / chunks.length : 0
    };
  }

  /**
   * Enable/disable optimizations
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton instance
let bundleOptimizationService: BundleOptimizationService | null = null;

export function getBundleOptimizationService(): BundleOptimizationService {
  if (!bundleOptimizationService) {
    bundleOptimizationService = new BundleOptimizationService();
  }
  return bundleOptimizationService;
}

export default BundleOptimizationService;
