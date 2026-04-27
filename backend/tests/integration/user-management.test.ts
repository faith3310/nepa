import request from 'supertest';
import app from '../../app';
import { TestHelpers } from '../helpers';
import { prisma } from '../setup';

describe('User Management Integration Tests', () => {
  let testUser: any;
  let adminUser: any;
  let authToken: string;
  let adminToken: string;

  beforeEach(async () => {
    await TestHelpers.cleanupTestData();
    
    // Create test users
    testUser = await TestHelpers.createTestUser({
      email: 'testuser@example.com',
      username: 'testuser',
      role: 'USER'
    });

    adminUser = await TestHelpers.createTestUser({
      email: 'admin@example.com',
      username: 'admin',
      role: 'ADMIN'
    });

    // Get auth tokens
    const userLoginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'testuser@example.com',
        password: 'password123'
      });

    authToken = userLoginResponse.body.token;

    const adminLoginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      });

    adminToken = adminLoginResponse.body.token;
  });

  afterAll(async () => {
    await TestHelpers.cleanupTestData();
  });

  describe('User Registration and Authentication Flow', () => {
    it('should complete full user registration and login flow', async () => {
      const newUserEmail = 'newuser@example.com';
      
      // Step 1: Register new user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: newUserEmail,
          password: 'password123',
          username: 'newuser',
          name: 'New User'
        })
        .expect(201);

      expect(registerResponse.body).toMatchObject({
        message: 'Registration successful. Please verify your email.',
        user: {
          email: newUserEmail,
          username: 'newuser',
          name: 'New User',
          status: 'PENDING_VERIFICATION'
        }
      });

      const userId = registerResponse.body.user.id;

      // Step 2: Verify email (mock verification)
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' }
      });

      // Step 3: Login with verified account
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: newUserEmail,
          password: 'password123'
        })
        .expect(200);

      expect(loginResponse.body).toMatchObject({
        message: 'Login successful',
        token: expect.any(String),
        refreshToken: expect.any(String),
        user: {
          email: newUserEmail,
          username: 'newuser',
          status: 'ACTIVE'
        }
      });

      const userToken = loginResponse.body.token;

      // Step 4: Access protected endpoint
      const profileResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(profileResponse.body).toMatchObject({
        success: true,
        data: {
          email: newUserEmail,
          username: 'newuser',
          name: 'New User'
        }
      });

      // Step 5: Update profile
      const updateResponse = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Updated Name',
          bio: 'Updated bio'
        })
        .expect(200);

      expect(updateResponse.body).toMatchObject({
        success: true,
        data: {
          name: 'Updated Name',
          bio: 'Updated bio'
        }
      });

      // Step 6: Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          refreshToken: loginResponse.body.refreshToken
        })
        .expect(200);

      expect(logoutResponse.body).toMatchObject({
        message: 'Logout successful'
      });
    });

    it('should prevent login with unverified email', async () => {
      const newUserEmail = 'unverified@example.com';
      
      // Register user but don't verify email
      await request(app)
        .post('/api/auth/register')
        .send({
          email: newUserEmail,
          password: 'password123',
          username: 'unverified',
          name: 'Unverified User'
        })
        .expect(201);

      // Try to login without verification
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: newUserEmail,
          password: 'password123'
        })
        .expect(401);

      expect(loginResponse.body).toMatchObject({
        error: 'Please verify your email before logging in'
      });
    });

    it('should handle password reset flow', async () => {
      const resetEmail = 'resetuser@example.com';
      
      // Create user for password reset
      const resetUser = await TestHelpers.createTestUser({
        email: resetEmail,
        username: 'resetuser'
      });

      // Step 1: Request password reset
      const resetRequestResponse = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: resetEmail
        })
        .expect(200);

      expect(resetRequestResponse.body).toMatchObject({
        message: 'Password reset instructions sent to your email'
      });

      // Step 2: Reset password with token (mock token)
      const resetToken = 'mock-reset-token';
      await prisma.user.update({
        where: { id: resetUser.id },
        data: { 
          resetToken: resetToken,
          resetTokenExpiry: new Date(Date.now() + 3600000) // 1 hour from now
        }
      });

      // Step 3: Complete password reset
      const resetCompleteResponse = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'newpassword123'
        })
        .expect(200);

      expect(resetCompleteResponse.body).toMatchObject({
        message: 'Password reset successful'
      });

      // Step 4: Login with new password
      const newLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: resetEmail,
          password: 'newpassword123'
        })
        .expect(200);

      expect(newLoginResponse.body).toMatchObject({
        message: 'Login successful',
        token: expect.any(String)
      });
    });
  });

  describe('Admin User Management', () => {
    it('should allow admin to view all users', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            email: 'testuser@example.com',
            username: 'testuser'
          }),
          expect.objectContaining({
            email: 'admin@example.com',
            username: 'admin'
          })
        ])
      });
    });

    it('should deny regular users access to admin endpoints', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        error: 'Insufficient permissions'
      });
    });

    it('should allow admin to update user roles', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${testUser.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'PREMIUM_USER'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          role: 'PREMIUM_USER'
        }
      });
    });

    it('should allow admin to suspend users', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${testUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'SUSPENDED',
          reason: 'Violation of terms'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'SUSPENDED'
        }
      });

      // Verify suspended user cannot login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'password123'
        })
        .expect(401);

      expect(loginResponse.body).toMatchObject({
        error: 'Account is suspended'
      });
    });
  });

  describe('User Profile Management', () => {
    it('should allow users to update their profile', async () => {
      const updateData = {
        name: 'Updated Name',
        bio: 'This is my updated bio',
        avatar: 'https://example.com/avatar.jpg',
        preferences: {
          theme: 'dark',
          notifications: true
        }
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: updateData
      });
    });

    it('should allow users to change their password', async () => {
      const response = await request(app)
        .post('/api/users/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'newpassword123'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Password changed successfully'
      });

      // Verify login with new password
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'newpassword123'
        })
        .expect(200);

      expect(loginResponse.body).toMatchObject({
        message: 'Login successful'
      });
    });

    it('should reject password change with incorrect current password', async () => {
      const response = await request(app)
        .post('/api/users/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Current password is incorrect'
      });
    });

    it('should allow users to enable two-factor authentication', async () => {
      const response = await request(app)
        .post('/api/users/enable-2fa')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          qrCode: expect.any(String),
          backupCodes: expect.any(Array)
        }
      });
    });
  });

  describe('Session Management', () => {
    it('should allow users to view their active sessions', async () => {
      const response = await request(app)
        .get('/api/users/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            createdAt: expect.any(String),
            isActive: true
          })
        ])
      });
    });

    it('should allow users to revoke specific sessions', async () => {
      // First get sessions
      const sessionsResponse = await request(app)
        .get('/api/users/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const sessionId = sessionsResponse.body.data[0].id;

      // Revoke session
      const revokeResponse = await request(app)
        .delete(`/api/users/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(revokeResponse.body).toMatchObject({
        message: 'Session revoked successfully'
      });
    });

    it('should allow users to revoke all sessions except current', async () => {
      const response = await request(app)
        .post('/api/users/revoke-all-sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'All other sessions revoked successfully'
      });
    });
  });

  describe('Security and Validation', () => {
    it('should prevent duplicate email registration', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'testuser@example.com', // Already exists
          password: 'password123',
          username: 'differentuser'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Email already registered'
      });
    });

    it('should prevent duplicate username registration', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'different@example.com',
          password: 'password123',
          username: 'testuser' // Already exists
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Username already taken'
      });
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
          username: 'testuser2'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid email format'
      });
    });

    it('should validate password strength', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'weak@example.com',
          password: '123', // Too weak
          username: 'weakuser'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Password does not meet security requirements'
      });
    });

    it('should rate limit authentication attempts', async () => {
      // Make multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'testuser@example.com',
            password: 'wrongpassword'
          })
          .expect(401);
      }

      // Sixth attempt should be rate limited
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'wrongpassword'
        })
        .expect(429);

      expect(response.body).toMatchObject({
        error: 'Too many failed login attempts'
      });
    });
  });

  describe('Token Management', () => {
    it('should refresh access token with valid refresh token', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'password123'
        })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;

      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: refreshToken
        })
        .expect(200);

      expect(refreshResponse.body).toMatchObject({
        token: expect.any(String),
        refreshToken: expect.any(String)
      });
    });

    it('should reject token refresh with invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token'
        })
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Invalid refresh token'
      });
    });

    it('should reject access to protected endpoints without token', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Access token required'
      });
    });

    it('should reject access with expired token', async () => {
      // Create an expired token (mock scenario)
      const expiredToken = 'expired-token-mock';

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Token expired'
      });
    });
  });
});
