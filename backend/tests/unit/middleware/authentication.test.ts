import { Request, Response, NextFunction } from 'express';
import { authenticateToken, requireRole, requirePermission } from '../../../middleware/authentication';
import jwt from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';

jest.mock('jsonwebtoken');
jest.mock('@prisma/client');

const mockJwt = jwt as jest.Mocked<typeof jwt>;
const MockedPrisma = PrismaClient as jest.MockedClass<typeof PrismaClient>;

describe('Authentication Middleware Unit Tests', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;
  let mockPrismaClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      headers: {},
      body: {},
      params: {},
      query: {}
    } as Request;
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as any;
    
    next = jest.fn();

    mockPrismaClient = {
      user: {
        findUnique: jest.fn()
      },
      userSession: {
        findUnique: jest.fn(),
        update: jest.fn()
      }
    };

    MockedPrisma.mockImplementation(() => mockPrismaClient);
  });

  describe('authenticateToken', () => {
    it('should authenticate user with valid token', async () => {
      const mockToken = 'valid-jwt-token';
      const mockPayload = { userId: 'user-1', email: 'test@example.com' };
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        role: UserRole.USER,
        status: 'ACTIVE'
      };

      req.headers.authorization = `Bearer ${mockToken}`;
      mockJwt.verify.mockReturnValue(mockPayload);
      mockPrismaClient.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaClient.userSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        isActive: true
      });

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as any).user).toEqual(mockUser);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject request with missing authorization header', async () => {
      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access token required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token format', async () => {
      req.headers.authorization = 'InvalidFormat token';

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token format'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with expired token', async () => {
      const mockToken = 'expired-jwt-token';
      req.headers.authorization = `Bearer ${mockToken}`;
      
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Token expired');
      });

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Token expired'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request for non-existent user', async () => {
      const mockToken = 'valid-jwt-token';
      const mockPayload = { userId: 'user-1', email: 'test@example.com' };

      req.headers.authorization = `Bearer ${mockToken}`;
      mockJwt.verify.mockReturnValue(mockPayload);
      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'User not found'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request for inactive user', async () => {
      const mockToken = 'valid-jwt-token';
      const mockPayload = { userId: 'user-1', email: 'test@example.com' };
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        role: UserRole.USER,
        status: 'INACTIVE'
      };

      req.headers.authorization = `Bearer ${mockToken}`;
      mockJwt.verify.mockReturnValue(mockPayload);
      mockPrismaClient.user.findUnique.mockResolvedValue(mockUser);

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Account is inactive'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid session', async () => {
      const mockToken = 'valid-jwt-token';
      const mockPayload = { userId: 'user-1', email: 'test@example.com' };
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        role: UserRole.USER,
        status: 'ACTIVE'
      };

      req.headers.authorization = `Bearer ${mockToken}`;
      mockJwt.verify.mockReturnValue(mockPayload);
      mockPrismaClient.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaClient.userSession.findUnique.mockResolvedValue(null);

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid session'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const mockToken = 'valid-jwt-token';
      req.headers.authorization = `Bearer ${mockToken}`;
      
      mockJwt.verify.mockReturnValue({ userId: 'user-1' });
      mockPrismaClient.user.findUnique.mockRejectedValue(new Error('Database error'));

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication error'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should allow access to users with required role', async () => {
      const middleware = requireRole(UserRole.ADMIN);
      (req as any).user = { id: 'user-1', role: UserRole.ADMIN };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access to users without required role', async () => {
      const middleware = requireRole(UserRole.ADMIN);
      (req as any).user = { id: 'user-1', role: UserRole.USER };

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access to unauthenticated users', async () => {
      const middleware = requireRole(UserRole.ADMIN);
      // No user set on request

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow access to users with any of multiple roles', async () => {
      const middleware = requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
      (req as any).user = { id: 'user-1', role: UserRole.SUPER_ADMIN };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access to users with none of the required roles', async () => {
      const middleware = requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
      (req as any).user = { id: 'user-1', role: UserRole.USER };

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requirePermission', () => {
    it('should allow access to users with required permission', async () => {
      const middleware = requirePermission('read_users');
      (req as any).user = { 
        id: 'user-1', 
        role: UserRole.ADMIN,
        permissions: ['read_users', 'write_users']
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access to users without required permission', async () => {
      const middleware = requirePermission('delete_users');
      (req as any).user = { 
        id: 'user-1', 
        role: UserRole.USER,
        permissions: ['read_users']
      };

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access to unauthenticated users', async () => {
      const middleware = requirePermission('read_users');
      // No user set on request

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow access to admin users regardless of specific permissions', async () => {
      const middleware = requirePermission('any_permission');
      (req as any).user = { 
        id: 'user-1', 
        role: UserRole.ADMIN,
        permissions: []
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow access to super admin users regardless of specific permissions', async () => {
      const middleware = requirePermission('any_permission');
      (req as any).user = { 
        id: 'user-1', 
        role: UserRole.SUPER_ADMIN,
        permissions: []
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle users without permissions array', async () => {
      const middleware = requirePermission('read_users');
      (req as any).user = { 
        id: 'user-1', 
        role: UserRole.USER
        // No permissions property
      };

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Token Refresh', () => {
    it('should refresh token when close to expiry', async () => {
      const mockToken = 'valid-jwt-token';
      const mockPayload = { 
        userId: 'user-1', 
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 300 // 5 minutes from now
      };
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        role: UserRole.USER,
        status: 'ACTIVE'
      };

      req.headers.authorization = `Bearer ${mockToken}`;
      mockJwt.verify.mockReturnValue(mockPayload);
      mockPrismaClient.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaClient.userSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        isActive: true
      });

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as any).user).toEqual(mockUser);
      expect((req as any).shouldRefreshToken).toBe(true);
    });

    it('should not refresh token when not close to expiry', async () => {
      const mockToken = 'valid-jwt-token';
      const mockPayload = { 
        userId: 'user-1', 
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      };
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        role: UserRole.USER,
        status: 'ACTIVE'
      };

      req.headers.authorization = `Bearer ${mockToken}`;
      mockJwt.verify.mockReturnValue(mockPayload);
      mockPrismaClient.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaClient.userSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        isActive: true
      });

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as any).user).toEqual(mockUser);
      expect((req as any).shouldRefreshToken).toBeUndefined();
    });
  });
});
