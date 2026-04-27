import { AuditService } from '../../../services/AuditService';
import { AuditAction, AuditSeverity } from '../../../services/AuditService';
import auditClient from '../../../databases/clients/auditClient';

jest.mock('../../../databases/clients/auditClient');
jest.mock('../../../services/logger');

const mockAuditClient = auditClient as jest.Mocked<typeof auditClient>;

describe('AuditService Unit Tests', () => {
  let auditService: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    auditService = new AuditService();
  });

  describe('logAuditEvent', () => {
    it('should log audit event successfully', async () => {
      const eventData = {
        userId: 'user-123',
        action: AuditAction.USER_LOGIN,
        resource: 'auth',
        severity: AuditSeverity.INFO,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        details: { loginMethod: 'password' }
      };

      mockAuditClient.auditLog.create.mockResolvedValue({
        id: 'audit-1',
        ...eventData,
        timestamp: new Date()
      });

      const result = await auditService.logAuditEvent(eventData);

      expect(result.success).toBe(true);
      expect(mockAuditClient.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining(eventData)
      });
    });

    it('should handle audit logging errors gracefully', async () => {
      const eventData = {
        userId: 'user-123',
        action: AuditAction.USER_LOGIN,
        resource: 'auth',
        severity: AuditSeverity.INFO
      };

      mockAuditClient.auditLog.create.mockRejectedValue(new Error('Database error'));

      const result = await auditService.logAuditEvent(eventData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to log audit event');
    });

    it('should auto-generate trace ID if not provided', async () => {
      const eventData = {
        userId: 'user-123',
        action: AuditAction.USER_LOGIN,
        resource: 'auth',
        severity: AuditSeverity.INFO
      };

      mockAuditClient.auditLog.create.mockResolvedValue({
        id: 'audit-1',
        ...eventData,
        traceId: expect.any(String)
      });

      await auditService.logAuditEvent(eventData);

      expect(mockAuditClient.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          traceId: expect.any(String)
        })
      });
    });
  });

  describe('searchAuditLogs', () => {
    it('should search audit logs with filters', async () => {
      const searchParams = {
        userId: 'user-123',
        action: AuditAction.USER_LOGIN,
        limit: 10,
        offset: 0
      };

      const mockLogs = [
        {
          id: 'audit-1',
          userId: 'user-123',
          action: AuditAction.USER_LOGIN,
          timestamp: new Date()
        }
      ];

      mockAuditClient.auditLog.findMany.mockResolvedValue(mockLogs);
      mockAuditClient.auditLog.count.mockResolvedValue(1);

      const result = await auditService.searchAuditLogs(searchParams);

      expect(result.logs).toEqual(mockLogs);
      expect(result.total).toBe(1);
      expect(mockAuditClient.auditLog.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 'user-123',
          action: AuditAction.USER_LOGIN
        }),
        orderBy: { timestamp: 'desc' },
        take: 10,
        skip: 0
      });
    });

    it('should handle date range filters', async () => {
      const searchParams = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        limit: 10
      };

      mockAuditClient.auditLog.findMany.mockResolvedValue([]);
      mockAuditClient.auditLog.count.mockResolvedValue(0);

      await auditService.searchAuditLogs(searchParams);

      expect(mockAuditClient.auditLog.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          timestamp: {
            gte: new Date('2024-01-01'),
            lte: new Date('2024-01-31')
          }
        }),
        take: 10,
        skip: 0
      });
    });

    it('should handle search errors', async () => {
      const searchParams = { limit: 10 };

      mockAuditClient.auditLog.findMany.mockRejectedValue(new Error('Search error'));

      const result = await auditService.searchAuditLogs(searchParams);

      expect(result.logs).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getAuditStats', () => {
    it('should return audit statistics', async () => {
      const mockStats = [
        { action: AuditAction.USER_LOGIN, count: 100 },
        { action: AuditAction.USER_LOGOUT, count: 95 }
      ];

      mockAuditClient.auditLog.groupBy.mockResolvedValue(mockStats);

      const result = await auditService.getAuditStats();

      expect(result).toEqual(mockStats);
      expect(mockAuditClient.auditLog.groupBy).toHaveBeenCalledWith({
        by: ['action'],
        _count: true
      });
    });

    it('should handle stats errors', async () => {
      mockAuditClient.auditLog.groupBy.mockRejectedValue(new Error('Stats error'));

      const result = await auditService.getAuditStats();

      expect(result).toEqual([]);
    });
  });

  describe('cleanupOldLogs', () => {
    it('should cleanup old audit logs', async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      mockAuditClient.auditLog.deleteMany.mockResolvedValue({ count: 100 });

      const result = await auditService.cleanupOldLogs(90);

      expect(result.deletedCount).toBe(100);
      expect(mockAuditClient.auditLog.deleteMany).toHaveBeenCalledWith({
        where: {
          timestamp: {
            lt: cutoffDate
          }
        }
      });
    });

    it('should handle cleanup errors', async () => {
      mockAuditClient.auditLog.deleteMany.mockRejectedValue(new Error('Cleanup error'));

      const result = await auditService.cleanupOldLogs(90);

      expect(result.deletedCount).toBe(0);
      expect(result.error).toContain('Failed to cleanup old logs');
    });
  });
});
