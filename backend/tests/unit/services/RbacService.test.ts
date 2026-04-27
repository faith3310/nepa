import { RbacService } from '../../../services/RbacService';
import { PrismaClient, Role, Permission, UserRoleAssignment, RolePermission, ResourceType, PermissionScope } from '@prisma/client';
import { AuditAction, AuditSeverity } from '../../../services/AuditService';

jest.mock('@prisma/client');
jest.mock('../../../services/AuditService');

const mockPrisma = PrismaClient as jest.MockedClass<typeof PrismaClient>;
const mockAuditService = {
  logAuditEvent: jest.fn().mockResolvedValue({ success: true })
};

describe('RbacService Unit Tests', () => {
  let rbacService: RbacService;
  let mockPrismaClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPrismaClient = {
      role: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn()
      },
      permission: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
      },
      userRoleAssignment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn()
      },
      rolePermission: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn()
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn()
      },
      $transaction: jest.fn()
    };

    mockPrisma.mockImplementation(() => mockPrismaClient);
    rbacService = new RbacService();
  });

  describe('createRole', () => {
    it('should create a new role successfully', async () => {
      const roleData = {
        name: 'Test Role',
        description: 'A test role',
        scope: PermissionScope.GLOBAL,
        isSystem: false
      };

      const mockRole = {
        id: 'role-1',
        ...roleData,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrismaClient.role.create.mockResolvedValue(mockRole);

      const result = await rbacService.createRole(roleData);

      expect(result.success).toBe(true);
      expect(result.role).toEqual(mockRole);
      expect(mockPrismaClient.role.create).toHaveBeenCalledWith({
        data: roleData
      });
      expect(mockAuditService.logAuditEvent).toHaveBeenCalledWith({
        userId: expect.any(String),
        action: AuditAction.ADMIN_SYSTEM_CONFIG,
        resource: 'role',
        severity: AuditSeverity.INFO,
        details: expect.objectContaining({ roleName: roleData.name })
      });
    });

    it('should handle duplicate role names', async () => {
      const roleData = {
        name: 'Existing Role',
        description: 'A test role'
      };

      mockPrismaClient.role.create.mockRejectedValue(new Error('Unique constraint failed'));

      const result = await rbacService.createRole(roleData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Role already exists');
    });
  });

  describe('assignRoleToUser', () => {
    it('should assign role to user successfully', async () => {
      const assignmentData = {
        userId: 'user-1',
        roleId: 'role-1',
        assignedBy: 'admin-1',
        expiresAt: new Date('2024-12-31')
      };

      const mockAssignment = {
        id: 'assignment-1',
        ...assignmentData,
        isActive: true,
        createdAt: new Date()
      };

      mockPrismaClient.userRoleAssignment.create.mockResolvedValue(mockAssignment);
      mockPrismaClient.role.findUnique.mockResolvedValue({ id: 'role-1', name: 'Test Role' });
      mockPrismaClient.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });

      const result = await rbacService.assignRoleToUser(assignmentData);

      expect(result.success).toBe(true);
      expect(result.assignment).toEqual(mockAssignment);
      expect(mockAuditService.logAuditEvent).toHaveBeenCalledWith({
        userId: assignmentData.assignedBy,
        action: AuditAction.ADMIN_UPDATE_USER_ROLE,
        resource: 'user_role',
        severity: AuditSeverity.INFO,
        details: expect.objectContaining({
          userId: assignmentData.userId,
          roleId: assignmentData.roleId
        })
      });
    });

    it('should prevent duplicate role assignments', async () => {
      const assignmentData = {
        userId: 'user-1',
        roleId: 'role-1',
        assignedBy: 'admin-1'
      };

      mockPrismaClient.userRoleAssignment.findFirst.mockResolvedValue({ id: 'existing-assignment' });

      const result = await rbacService.assignRoleToUser(assignmentData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('User already has this role');
    });
  });

  describe('checkPermission', () => {
    it('should return true for user with required permission', async () => {
      const userId = 'user-1';
      const permissionCheck = {
        resource: ResourceType.USER,
        action: 'read',
        scope: PermissionScope.GLOBAL
      };

      // Mock user role assignments
      mockPrismaClient.userRoleAssignment.findMany.mockResolvedValue([
        {
          id: 'assignment-1',
          userId,
          roleId: 'role-1',
          isActive: true
        }
      ]);

      // Mock role permissions
      mockPrismaClient.rolePermission.findMany.mockResolvedValue([
        {
          id: 'role-perm-1',
          roleId: 'role-1',
          permission: {
            id: 'perm-1',
            resource: ResourceType.USER,
            action: 'read',
            scope: PermissionScope.GLOBAL,
            isActive: true
          }
        }
      ]);

      const result = await rbacService.checkPermission(userId, permissionCheck);

      expect(result).toBe(true);
    });

    it('should return false for user without required permission', async () => {
      const userId = 'user-1';
      const permissionCheck = {
        resource: ResourceType.USER,
        action: 'delete',
        scope: PermissionScope.GLOBAL
      };

      mockPrismaClient.userRoleAssignment.findMany.mockResolvedValue([
        {
          id: 'assignment-1',
          userId,
          roleId: 'role-1',
          isActive: true
        }
      ]);

      mockPrismaClient.rolePermission.findMany.mockResolvedValue([
        {
          id: 'role-perm-1',
          roleId: 'role-1',
          permission: {
            id: 'perm-1',
            resource: ResourceType.USER,
            action: 'read', // Different action
            scope: PermissionScope.GLOBAL,
            isActive: true
          }
        }
      ]);

      const result = await rbacService.checkPermission(userId, permissionCheck);

      expect(result).toBe(false);
    });

    it('should handle expired role assignments', async () => {
      const userId = 'user-1';
      const permissionCheck = {
        resource: ResourceType.USER,
        action: 'read',
        scope: PermissionScope.GLOBAL
      };

      mockPrismaClient.userRoleAssignment.findMany.mockResolvedValue([
        {
          id: 'assignment-1',
          userId,
          roleId: 'role-1',
          isActive: true,
          expiresAt: new Date('2023-01-01') // Expired
        }
      ]);

      const result = await rbacService.checkPermission(userId, permissionCheck);

      expect(result).toBe(false);
    });
  });

  describe('createPermission', () => {
    it('should create a new permission successfully', async () => {
      const permissionData = {
        name: 'read_users',
        description: 'Read user data',
        resource: ResourceType.USER,
        action: 'read',
        scope: PermissionScope.GLOBAL,
        isSystem: false
      };

      const mockPermission = {
        id: 'perm-1',
        ...permissionData,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrismaClient.permission.create.mockResolvedValue(mockPermission);

      const result = await rbacService.createPermission(permissionData);

      expect(result.success).toBe(true);
      expect(result.permission).toEqual(mockPermission);
      expect(mockPrismaClient.permission.create).toHaveBeenCalledWith({
        data: permissionData
      });
    });

    it('should handle duplicate permission names', async () => {
      const permissionData = {
        name: 'read_users',
        resource: ResourceType.USER,
        action: 'read'
      };

      mockPrismaClient.permission.create.mockRejectedValue(new Error('Unique constraint failed'));

      const result = await rbacService.createPermission(permissionData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission already exists');
    });
  });

  describe('assignPermissionToRole', () => {
    it('should assign permission to role successfully', async () => {
      const roleId = 'role-1';
      const permissionId = 'perm-1';

      const mockRolePermission = {
        id: 'role-perm-1',
        roleId,
        permissionId,
        createdAt: new Date()
      };

      mockPrismaClient.rolePermission.create.mockResolvedValue(mockRolePermission);
      mockPrismaClient.role.findUnique.mockResolvedValue({ id: roleId, name: 'Test Role' });
      mockPrismaClient.permission.findUnique.mockResolvedValue({ id: permissionId, name: 'read_users' });

      const result = await rbacService.assignPermissionToRole(roleId, permissionId);

      expect(result.success).toBe(true);
      expect(result.rolePermission).toEqual(mockRolePermission);
      expect(mockAuditService.logAuditEvent).toHaveBeenCalledWith({
        userId: expect.any(String),
        action: AuditAction.ADMIN_SYSTEM_CONFIG,
        resource: 'role_permission',
        severity: AuditSeverity.INFO,
        details: expect.objectContaining({
          roleId,
          permissionId
        })
      });
    });

    it('should prevent duplicate permission assignments', async () => {
      const roleId = 'role-1';
      const permissionId = 'perm-1';

      mockPrismaClient.rolePermission.findUnique.mockResolvedValue({ id: 'existing-assignment' });

      const result = await rbacService.assignPermissionToRole(roleId, permissionId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Role already has this permission');
    });
  });

  describe('removeRoleFromUser', () => {
    it('should remove role from user successfully', async () => {
      const userId = 'user-1';
      const roleId = 'role-1';
      const removedBy = 'admin-1';

      const mockAssignment = {
        id: 'assignment-1',
        userId,
        roleId,
        isActive: true
      };

      mockPrismaClient.userRoleAssignment.findFirst.mockResolvedValue(mockAssignment);
      mockPrismaClient.userRoleAssignment.update.mockResolvedValue({ ...mockAssignment, isActive: false });

      const result = await rbacService.removeRoleFromUser(userId, roleId, removedBy);

      expect(result.success).toBe(true);
      expect(mockPrismaClient.userRoleAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { isActive: false }
      });
      expect(mockAuditService.logAuditEvent).toHaveBeenCalledWith({
        userId: removedBy,
        action: AuditAction.ADMIN_UPDATE_USER_ROLE,
        resource: 'user_role',
        severity: AuditSeverity.INFO,
        details: expect.objectContaining({
          userId,
          roleId,
          action: 'removed'
        })
      });
    });

    it('should handle non-existent role assignment', async () => {
      const userId = 'user-1';
      const roleId = 'role-1';
      const removedBy = 'admin-1';

      mockPrismaClient.userRoleAssignment.findFirst.mockResolvedValue(null);

      const result = await rbacService.removeRoleFromUser(userId, roleId, removedBy);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Role assignment not found');
    });
  });

  describe('getUserRoles', () => {
    it('should return all active roles for a user', async () => {
      const userId = 'user-1';

      const mockRoleAssignments = [
        {
          id: 'assignment-1',
          userId,
          roleId: 'role-1',
          isActive: true,
          role: {
            id: 'role-1',
            name: 'Admin',
            description: 'Administrator role',
            isActive: true
          }
        },
        {
          id: 'assignment-2',
          userId,
          roleId: 'role-2',
          isActive: true,
          role: {
            id: 'role-2',
            name: 'User',
            description: 'Regular user role',
            isActive: true
          }
        }
      ];

      mockPrismaClient.userRoleAssignment.findMany.mockResolvedValue(mockRoleAssignments);

      const result = await rbacService.getUserRoles(userId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Admin');
      expect(result[1].name).toBe('User');
    });

    it('should exclude inactive roles', async () => {
      const userId = 'user-1';

      const mockRoleAssignments = [
        {
          id: 'assignment-1',
          userId,
          roleId: 'role-1',
          isActive: true,
          role: {
            id: 'role-1',
            name: 'Admin',
            isActive: true
          }
        },
        {
          id: 'assignment-2',
          userId,
          roleId: 'role-2',
          isActive: false, // Inactive assignment
          role: {
            id: 'role-2',
            name: 'User',
            isActive: true
          }
        }
      ];

      mockPrismaClient.userRoleAssignment.findMany.mockResolvedValue(mockRoleAssignments);

      const result = await rbacService.getUserRoles(userId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Admin');
    });
  });

  describe('getRolePermissions', () => {
    it('should return all permissions for a role', async () => {
      const roleId = 'role-1';

      const mockRolePermissions = [
        {
          id: 'role-perm-1',
          roleId,
          permissionId: 'perm-1',
          permission: {
            id: 'perm-1',
            name: 'read_users',
            resource: ResourceType.USER,
            action: 'read',
            isActive: true
          }
        },
        {
          id: 'role-perm-2',
          roleId,
          permissionId: 'perm-2',
          permission: {
            id: 'perm-2',
            name: 'write_users',
            resource: ResourceType.USER,
            action: 'write',
            isActive: true
          }
        }
      ];

      mockPrismaClient.rolePermission.findMany.mockResolvedValue(mockRolePermissions);

      const result = await rbacService.getRolePermissions(roleId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('read_users');
      expect(result[1].name).toBe('write_users');
    });
  });
});
