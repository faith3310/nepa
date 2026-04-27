import React, { Suspense, lazy, ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

interface LazyLoadProps {
  componentLoader: () => Promise<{ default: ComponentType<any> }>;
  fallback?: React.ReactNode;
  error?: ComponentType<{ error: Error; retry: () => void }>;
  delay?: number;
  timeout?: number;
}

const DefaultFallback: React.FC = () => {
  const { t } = useTranslation();
  
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '2rem',
      minHeight: '200px'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #007bff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem'
        }} />
        <div style={{ color: '#666' }}>
          {t('loading', 'Loading...')}
        </div>
      </div>
    </div>
  );
};

const ErrorFallback: React.FC<{ error: Error; retry: () => void }> = ({ error, retry }) => {
  const { t } = useTranslation();
  
  return (
    <div style={{
      padding: '2rem',
      textAlign: 'center',
      backgroundColor: '#fee',
      border: '1px solid #fcc',
      borderRadius: '8px',
      margin: '1rem 0'
    }}>
      <h3 style={{ color: '#c33', marginBottom: '1rem' }}>
        {t('errors.load_failed', 'Failed to load component')}
      </h3>
      <p style={{ color: '#666', marginBottom: '1rem' }}>
        {t('errors.load_retry', 'Please try again or refresh the page.')}
      </p>
      <button
        onClick={retry}
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        {t('errors.retry', 'Retry')}
      </button>
    </div>
  );
};

/**
 * Higher-order component for lazy loading with error handling
 */
export const LazyLoad: React.FC<LazyLoadProps> = ({
  componentLoader,
  fallback = <DefaultFallback />,
  error: ErrorComponent = ErrorFallback,
  delay = 200,
  timeout = 10000
}) => {
  const LazyComponent = lazy(componentLoader);
  
  return (
    <Suspense fallback={fallback}>
      <LazyComponent />
    </Suspense>
  );
};

/**
 * Create a lazy-loaded component with retry functionality
 */
export const createLazyComponent = <T extends ComponentType<any>>(
  componentLoader: () => Promise<{ default: T }>,
  options: {
    fallback?: React.ReactNode;
    error?: ComponentType<{ error: Error; retry: () => void }>;
    delay?: number;
    timeout?: number;
  } = {}
) => {
  return React.forwardRef<any, any>((props, ref) => {
    const [retryKey, setRetryKey] = React.useState(0);
    
    const retry = () => {
      setRetryKey(prev => prev + 1);
    };

    const LazyComponent = lazy(() => 
      componentLoader().catch(error => {
        console.error('Component loading failed:', error);
        throw error;
      })
    );

    return (
      <Suspense fallback={options.fallback || <DefaultFallback />}>
        <LazyComponent key={retryKey} ref={ref} {...props} />
      </Suspense>
    );
  });
};

/**
 * Lazy load images with intersection observer
 */
export const LazyImage: React.FC<{
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  onLoad?: () => void;
  onError?: () => void;
  style?: React.CSSProperties;
}> = ({ src, alt, className, placeholder, onLoad, onError, style }) => {
  const [imageSrc, setImageSrc] = React.useState(placeholder || '');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = new Image();
            img.onload = () => {
              setImageSrc(src);
              setIsLoading(false);
              onLoad?.();
            };
            img.onerror = () => {
              setError(true);
              setIsLoading(false);
              onError?.();
            };
            img.src = src;
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      if (imgRef.current) {
        observer.unobserve(imgRef.current);
      }
    };
  }, [src, onLoad, onError]);

  return (
    <div
      ref={imgRef}
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...style
      }}
    >
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666'
          }}
        >
          <div style={{
            width: '20px',
            height: '20px',
            border: '2px solid #f3f3f3',
            borderTop: '2px solid #007bff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
        </div>
      )}
      
      {error ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#fee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#c33',
            fontSize: '0.875rem'
          }}
        >
          Failed to load image
        </div>
      ) : (
        <img
          src={imageSrc}
          alt={alt}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: isLoading ? 0 : 1,
            transition: 'opacity 0.3s ease'
          }}
        />
      )}
    </div>
  );
};

/**
 * Lazy load component with prefetching
 */
export const LazyLoadWithPrefetch: React.FC<{
  componentLoader: () => Promise<{ default: ComponentType<any> }>;
  prefetch?: boolean;
  fallback?: React.ReactNode;
}> = ({ componentLoader, prefetch = false, fallback }) => {
  const [Component, setComponent] = React.useState<ComponentType<any> | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (prefetch) {
      // Prefetch the component
      componentLoader()
        .then(module => {
          setComponent(() => module.default);
        })
        .catch(prefetchError => {
          console.warn('Component prefetch failed:', prefetchError);
        });
    }
  }, [componentLoader, prefetch]);

  const loadComponent = React.useCallback(() => {
    if (Component) return;

    setIsLoading(true);
    setError(null);

    componentLoader()
      .then(module => {
        setComponent(() => module.default);
        setIsLoading(false);
      })
      .catch(loadError => {
        setError(loadError);
        setIsLoading(false);
      });
  }, [Component, componentLoader]);

  if (error) {
    return <ErrorFallback error={error} retry={loadComponent} />;
  }

  if (Component) {
    return <Component />;
  }

  return (
    <div ref={prefetch ? undefined : loadComponent}>
      {fallback || <DefaultFallback />}
    </div>
  );
};

// Add CSS animation for spinner
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

export default LazyLoad;
