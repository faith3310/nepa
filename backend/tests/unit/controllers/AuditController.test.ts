import { Request, Response } from 'express';
import { AuditController } from '../../../controllers/AuditController';
import { auditService, AuditAction, AuditSeverity } from '../../../services/AuditService';
import { mockRequest, mockResponse, mockNext } from '../mocks';

jest.mock('../../../services/AuditService');
jest.mock('../../../services/logger');

const MockedAuditService = auditService as jest.Mocked<typeof auditService>;

describe('AuditController Unit Tests', () => {
  let req: Request;
  let res: Response;
  let next: any;

  beforeEach(() => {
    jest.clearAllMocks();
    req = mockRequest();
    res = mockResponse();
    next = mockNext();
  });

  describe('searchLogs', () => {
    it('should allow admin to search all audit logs', async () => {
      // Mock admin user
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };
      
      req.query = {
        userId: 'user-1',
        action: AuditAction.USER_LOGIN,
        limit: '50',
        offset: '0'
      };

      const mockSearchResult = {
        logs: [
          {
            id: 'audit-1',
            userId: 'user-1',
            action: AuditAction.USER_LOGIN,
            timestamp: new Date()
          }
        ],
        total: 1
      };

      MockedAuditService.searchAuditLogs.mockResolvedValue(mockSearchResult);

      await AuditController.searchLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockSearchResult,
        pagination: {
          limit: 50,
          offset: 0,
          total: 1
        }
      });
      expect(MockedAuditService.searchAuditLogs).toHaveBeenCalledWith({
        userId: 'user-1',
        action: AuditAction.USER_LOGIN,
        limit: 50,
        offset: 0
      });
    });

    it('should restrict non-admin users to their own logs', async () => {
      // Mock regular user
      (req as any).user = { id: 'user-1', role: 'USER' };
      
      req.query = {
        userId: 'user-2', // Should be ignored for non-admin
        action: AuditAction.USER_LOGIN
      };

      const mockSearchResult = {
        logs: [
          {
            id: 'audit-1',
            userId: 'user-1',
            action: AuditAction.USER_LOGIN,
            timestamp: new Date()
          }
        ],
        total: 1
      };

      MockedAuditService.searchAuditLogs.mockResolvedValue(mockSearchResult);

      await AuditController.searchLogs(req, res);

      expect(MockedAuditService.searchAuditLogs).toHaveBeenCalledWith({
        userId: 'user-1', // Should be the current user's ID
        action: AuditAction.USER_LOGIN,
        limit: 100,
        offset: 0
      });
    });

    it('should handle search errors', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };
      
      MockedAuditService.searchAuditLogs.mockRejectedValue(new Error('Search failed'));

      await AuditController.searchLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to search audit logs'
      });
    });

    it('should validate limit parameter', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };
      
      req.query = { limit: '2000' }; // Exceeds max limit

      const mockSearchResult = { logs: [], total: 0 };
      MockedAuditService.searchAuditLogs.mockResolvedValue(mockSearchResult);

      await AuditController.searchLogs(req, res);

      expect(MockedAuditService.searchAuditLogs).toHaveBeenCalledWith({
        limit: 1000, // Should be capped at 1000
        offset: 0
      });
    });
  });

  describe('getAuditStats', () => {
    it('should return audit statistics for admin', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };

      const mockStats = [
        { action: AuditAction.USER_LOGIN, count: 100 },
        { action: AuditAction.USER_LOGOUT, count: 95 }
      ];

      MockedAuditService.getAuditStats.mockResolvedValue(mockStats);

      await AuditController.getAuditStats(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockStats
      });
      expect(MockedAuditService.getAuditStats).toHaveBeenCalled();
    });

    it('should deny access to non-admin users', async () => {
      (req as any).user = { id: 'user-1', role: 'USER' };

      await AuditController.getAuditStats(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied'
      });
      expect(MockedAuditService.getAuditStats).not.toHaveBeenCalled();
    });

    it('should handle stats errors', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };

      MockedAuditService.getAuditStats.mockRejectedValue(new Error('Stats failed'));

      await AuditController.getAuditStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get audit statistics'
      });
    });
  });

  describe('exportLogs', () => {
    it('should export logs for admin users', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };
      
      req.query = {
        format: 'csv',
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      };

      const mockExportData = 'id,userId,action,timestamp\naudit-1,user-1,USER_LOGIN,2024-01-15T10:00:00Z';
      
      MockedAuditService.exportAuditLogs.mockResolvedValue(mockExportData);

      await AuditController.exportLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="audit-logs.csv"');
      expect(res.send).toHaveBeenCalledWith(mockExportData);
    });

    it('should deny export access to non-admin users', async () => {
      (req as any).user = { id: 'user-1', role: 'USER' };

      await AuditController.exportLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied'
      });
      expect(MockedAuditService.exportAuditLogs).not.toHaveBeenCalled();
    });

    it('should validate export format', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };
      
      req.query = { format: 'xml' }; // Invalid format

      await AuditController.exportLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid export format'
      });
    });

    it('should handle export errors', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };
      
      req.query = { format: 'csv' };

      MockedAuditService.exportAuditLogs.mockRejectedValue(new Error('Export failed'));

      await AuditController.exportLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to export audit logs'
      });
    });
  });

  describe('cleanupOldLogs', () => {
    it('should cleanup old logs for admin users', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };
      
      req.body = { retentionDays: 90 };

      const mockCleanupResult = { deletedCount: 100 };
      MockedAuditService.cleanupOldLogs.mockResolvedValue(mockCleanupResult);

      await AuditController.cleanupOldLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockCleanupResult,
        message: 'Successfully cleaned up 100 old audit logs'
      });
      expect(MockedAuditService.cleanupOldLogs).toHaveBeenCalledWith(90);
    });

    it('should deny cleanup access to non-admin users', async () => {
      (req as any).user = { id: 'user-1', role: 'USER' };

      await AuditController.cleanupOldLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied'
      });
      expect(MockedAuditService.cleanupOldLogs).not.toHaveBeenCalled();
    });

    it('should validate retention days', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };
      
      req.body = { retentionDays: 30 }; // Too short

      await AuditController.cleanupOldLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Retention period must be at least 90 days'
      });
    });

    it('should handle cleanup errors', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };
      
      req.body = { retentionDays: 90 };

      MockedAuditService.cleanupOldLogs.mockRejectedValue(new Error('Cleanup failed'));

      await AuditController.cleanupOldLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to cleanup old audit logs'
      });
    });
  });

  describe('getComplianceReport', () => {
    it('should generate compliance report for admin users', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };
      
      req.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        reportType: 'summary'
      };

      const mockReport = {
        summary: {
          totalEvents: 1000,
          criticalEvents: 5,
          userActions: 800,
          adminActions: 200
        },
        details: []
      };

      MockedAuditService.generateComplianceReport.mockResolvedValue(mockReport);

      await AuditController.getComplianceReport(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockReport
      });
      expect(MockedAuditService.generateComplianceReport).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        reportType: 'summary'
      });
    });

    it('should deny compliance report access to non-admin users', async () => {
      (req as any).user = { id: 'user-1', role: 'USER' };

      await AuditController.getComplianceReport(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied'
      });
      expect(MockedAuditService.generateComplianceReport).not.toHaveBeenCalled();
    });

    it('should validate report parameters', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };
      
      req.query = {
        reportType: 'invalid'
      };

      await AuditController.getComplianceReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid report type'
      });
    });

    it('should handle compliance report errors', async () => {
      (req as any).user = { id: 'admin-1', role: 'ADMIN' };
      
      req.query = {
        reportType: 'summary'
      };

      MockedAuditService.generateComplianceReport.mockRejectedValue(new Error('Report generation failed'));

      await AuditController.getComplianceReport(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to generate compliance report'
      });
    });
  });

  describe('logAuditEvent', () => {
    it('should log audit event successfully', async () => {
      (req as any).user = { id: 'user-1', role: 'USER' };
      
      req.body = {
        action: AuditAction.USER_LOGIN,
        resource: 'auth',
        severity: AuditSeverity.INFO,
        details: { loginMethod: 'password' }
      };

      const mockLogResult = {
        success: true,
        auditLog: {
          id: 'audit-1',
          userId: 'user-1',
          action: AuditAction.USER_LOGIN,
          timestamp: new Date()
        }
      };

      MockedAuditService.logAuditEvent.mockResolvedValue(mockLogResult);

      await AuditController.logAuditEvent(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockLogResult.auditLog
      });
      expect(MockedAuditService.logAuditEvent).toHaveBeenCalledWith({
        userId: 'user-1',
        action: AuditAction.USER_LOGIN,
        resource: 'auth',
        severity: AuditSeverity.INFO,
        ipAddress: expect.any(String),
        userAgent: expect.any(String),
        details: { loginMethod: 'password' }
      });
    });

    it('should handle audit log errors', async () => {
      (req as any).user = { id: 'user-1', role: 'USER' };
      
      req.body = {
        action: AuditAction.USER_LOGIN,
        resource: 'auth'
      };

      MockedAuditService.logAuditEvent.mockRejectedValue(new Error('Log failed'));

      await AuditController.logAuditEvent(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to log audit event'
      });
    });

    it('should validate required fields', async () => {
      (req as any).user = { id: 'user-1', role: 'USER' };
      
      req.body = {}; // Missing required fields

      await AuditController.logAuditEvent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required fields: action, resource'
      });
    });
  });
});
