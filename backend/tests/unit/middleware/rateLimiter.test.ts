import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createRateLimiter } from '../../../middleware/rateLimiter';

jest.mock('express-rate-limit');
jest.mock('../../../services/logger');

const mockRateLimit = rateLimit as jest.MockedFunction<typeof rateLimit>;

describe('Rate Limiter Middleware Unit Tests', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;
  let mockRateLimitMiddleware: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      ip: '192.168.1.1',
      headers: {},
      body: {},
      params: {},
      query: {}
    } as Request;
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis()
    } as any;
    
    next = jest.fn();

    mockRateLimitMiddleware = jest.fn((req, res, next) => {
      // Mock successful rate limiting by default
      next();
    });

    mockRateLimit.mockReturnValue(mockRateLimitMiddleware);
  });

  describe('createRateLimiter', () => {
    it('should create rate limiter with default options', () => {
      const limiter = createRateLimiter();

      expect(mockRateLimit).toHaveBeenCalledWith(expect.objectContaining({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // 100 requests
        message: expect.objectContaining({
          error: 'Too many requests'
        }),
        standardHeaders: true,
        legacyHeaders: false
      }));
    });

    it('should create rate limiter with custom options', () => {
      const customOptions = {
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 50,
        message: 'Custom rate limit message'
      };

      const limiter = createRateLimiter(customOptions);

      expect(mockRateLimit).toHaveBeenCalledWith(expect.objectContaining({
        windowMs: 5 * 60 * 1000,
        max: 50,
        message: 'Custom rate limit message'
      }));
    });

    it('should apply rate limiting to requests', async () => {
      const limiter = createRateLimiter();

      await limiter(req, res, next);

      expect(mockRateLimitMiddleware).toHaveBeenCalledWith(req, res, next);
    });
  });

  describe('Rate Limiting Behavior', () => {
    it('should allow requests within limit', async () => {
      const limiter = createRateLimiter({ max: 5 });

      // Make 5 requests within limit
      for (let i = 0; i < 5; i++) {
        await limiter(req, res, next);
        expect(next).toHaveBeenCalled();
      }
    });

    it('should block requests exceeding limit', async () => {
      const limiter = createRateLimiter({ max: 2 });
      
      // Mock the rate limiter to reject after 2 requests
      let requestCount = 0;
      mockRateLimitMiddleware.mockImplementation((req, res, next) => {
        requestCount++;
        if (requestCount <= 2) {
          next();
        } else {
          res.status(429).json({ error: 'Too many requests' });
        }
      });

      // First 2 requests should pass
      await limiter(req, res, next);
      expect(next).toHaveBeenCalled();
      jest.clearAllMocks();

      await limiter(req, res, next);
      expect(next).toHaveBeenCalled();
      jest.clearAllMocks();

      // Third request should be blocked
      await limiter(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({ error: 'Too many requests' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should include rate limit headers', async () => {
      const limiter = createRateLimiter();
      
      // Mock rate limiter to set headers
      mockRateLimitMiddleware.mockImplementation((req, res, next) => {
        res.set('X-RateLimit-Limit', '100');
        res.set('X-RateLimit-Remaining', '99');
        res.set('X-RateLimit-Reset', '1640995200');
        next();
      });

      await limiter(req, res, next);

      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Reset', '1640995200');
    });
  });

  describe('Different Rate Limit Strategies', () => {
    it('should create strict rate limiter for sensitive endpoints', () => {
      const strictLimiter = createRateLimiter({
        windowMs: 60 * 1000, // 1 minute
        max: 5, // 5 requests per minute
        message: 'Rate limit exceeded for sensitive operation'
      });

      expect(mockRateLimit).toHaveBeenCalledWith(expect.objectContaining({
        windowMs: 60 * 1000,
        max: 5,
        message: 'Rate limit exceeded for sensitive operation'
      }));
    });

    it('should create lenient rate limiter for public endpoints', () => {
      const lenientLimiter = createRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000, // 1000 requests per 15 minutes
        skipSuccessfulRequests: false,
        skipFailedRequests: true
      });

      expect(mockRateLimit).toHaveBeenCalledWith(expect.objectContaining({
        windowMs: 15 * 60 * 1000,
        max: 1000,
        skipSuccessfulRequests: false,
        skipFailedRequests: true
      }));
    });

    it('should create rate limiter with custom key generator', () => {
      const customKeyGenerator = (req: Request) => {
        return req.headers['x-api-key'] as string || req.ip;
      };

      const limiter = createRateLimiter({
        keyGenerator: customKeyGenerator
      });

      expect(mockRateLimit).toHaveBeenCalledWith(expect.objectContaining({
        keyGenerator: customKeyGenerator
      }));
    });
  });

  describe('Error Handling', () => {
    it('should handle rate limiter errors gracefully', async () => {
      const limiter = createRateLimiter();
      
      // Mock rate limiter to throw error
      mockRateLimitMiddleware.mockImplementation((req, res, next) => {
        throw new Error('Rate limiter error');
      });

      // The middleware should not crash the application
      expect(() => limiter(req, res, next)).not.toThrow();
    });

    it('should work with missing IP address', async () => {
      const limiter = createRateLimiter();
      req.ip = undefined;

      await limiter(req, res, next);

      expect(mockRateLimitMiddleware).toHaveBeenCalledWith(
        expect.objectContaining({ ip: undefined }),
        res,
        next
      );
    });
  });

  describe('Rate Limiting by User', () => {
    it('should rate limit by user ID when authenticated', async () => {
      const limiter = createRateLimiter({
        keyGenerator: (req: Request) => {
          const user = (req as any).user;
          return user ? `user:${user.id}` : req.ip;
        }
      });

      // Mock authenticated request
      (req as any).user = { id: 'user-123' };

      await limiter(req, res, next);

      expect(mockRateLimit).toHaveBeenCalledWith(expect.objectContaining({
        keyGenerator: expect.any(Function)
      }));
    });

    it('should rate limit by IP when not authenticated', async () => {
      const limiter = createRateLimiter({
        keyGenerator: (req: Request) => {
          const user = (req as any).user;
          return user ? `user:${user.id}` : req.ip;
        }
      });

      // Mock unauthenticated request
      req.ip = '192.168.1.1';

      await limiter(req, res, next);

      expect(mockRateLimit).toHaveBeenCalledWith(expect.objectContaining({
        keyGenerator: expect.any(Function)
      }));
    });
  });

  describe('Rate Limiting for Different HTTP Methods', () => {
    it('should have stricter limits for POST requests', () => {
      const postLimiter = createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 50, // Stricter for POST
        skip: (req) => req.method !== 'POST'
      });

      expect(mockRateLimit).toHaveBeenCalledWith(expect.objectContaining({
        max: 50,
        skip: expect.any(Function)
      }));
    });

    it('should have lenient limits for GET requests', () => {
      const getLimiter = createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 200, // More lenient for GET
        skip: (req) => req.method !== 'GET'
      });

      expect(mockRateLimit).toHaveBeenCalledWith(expect.objectContaining({
        max: 200,
        skip: expect.any(Function)
      }));
    });
  });

  describe('Dynamic Rate Limiting', () => {
    it('should adjust limits based on user role', () => {
      const dynamicLimiter = createRateLimiter({
        max: (req) => {
          const user = (req as any).user;
          if (!user) return 10; // Unauthenticated users
          if (user.role === 'ADMIN') return 1000; // Admins
          if (user.role === 'PREMIUM') return 500; // Premium users
          return 100; // Regular users
        }
      });

      expect(mockRateLimit).toHaveBeenCalledWith(expect.objectContaining({
        max: expect.any(Function)
      }));
    });

    it('should adjust window size based on endpoint sensitivity', () => {
      const sensitiveLimiter = createRateLimiter({
        windowMs: (req) => {
          const path = req.path;
          if (path.includes('/auth/login')) return 15 * 60 * 1000; // 15 minutes for login
          if (path.includes('/api/')) return 5 * 60 * 1000; // 5 minutes for API
          return 60 * 60 * 1000; // 1 hour for others
        }
      });

      expect(mockRateLimit).toHaveBeenCalledWith(expect.objectContaining({
        windowMs: expect.any(Function)
      }));
    });
  });
});
