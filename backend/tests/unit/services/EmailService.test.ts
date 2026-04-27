import { EmailService, EmailOptions, EmailTemplate } from '../../../services/EmailService';
import nodemailer from 'nodemailer';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

jest.mock('nodemailer');
jest.mock('@aws-sdk/client-ses');
jest.mock('../../../services/logger');

const mockNodemailer = nodemailer as jest.Mocked<typeof nodemailer>;
const mockSES = { SESClient, SendEmailCommand } as jest.Mocked<typeof mockSES>;

describe('EmailService Unit Tests', () => {
  let emailService: EmailService;
  let mockTransporter: jest.Mocked<nodemailer.Transporter>;
  let mockSesClient: jest.Mocked<SESClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock nodemailer transporter
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
      verify: jest.fn().mockResolvedValue(true)
    } as any;
    
    mockNodemailer.createTransport.mockReturnValue(mockTransporter);
    
    // Mock SES client
    mockSesClient = {
      send: jest.fn().mockResolvedValue({ MessageId: 'ses-message-id' })
    } as any;
    
    mockSES.SESClient.mockImplementation(() => mockSesClient);
    
    emailService = EmailService.getInstance();
  });

  describe('sendEmail', () => {
    it('should send email using nodemailer when SES is not configured', async () => {
      const emailOptions: EmailOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>',
        text: 'Test text'
      };

      // Mock environment without SES
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      const result = await emailService.sendEmail(emailOptions);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>',
        text: 'Test text'
      }));
    });

    it('should send email using SES when configured', async () => {
      const emailOptions: EmailOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>'
      };

      // Mock SES environment
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';

      // Create new instance to trigger SES initialization
      emailService = new EmailService();

      const result = await emailService.sendEmail(emailOptions);

      expect(result.success).toBe(true);
      expect(mockSesClient.send).toHaveBeenCalledWith(expect.any(SendEmailCommand));
    });

    it('should handle multiple recipients', async () => {
      const emailOptions: EmailOptions = {
        to: ['test1@example.com', 'test2@example.com'],
        subject: 'Test Subject',
        html: '<p>Test HTML</p>'
      };

      const result = await emailService.sendEmail(emailOptions);

      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        to: ['test1@example.com', 'test2@example.com']
      }));
    });

    it('should handle email sending failures', async () => {
      const emailOptions: EmailOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>'
      };

      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP Error'));

      const result = await emailService.sendEmail(emailOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to send email');
    });

    it('should validate email options', async () => {
      const invalidOptions = {
        subject: 'Test Subject',
        html: '<p>Test HTML</p>'
      } as EmailOptions; // Missing 'to' field

      const result = await emailService.sendEmail(invalidOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid email options');
    });
  });

  describe('sendTemplateEmail', () => {
    it('should send email using template', async () => {
      const template: EmailTemplate = {
        subject: 'Welcome {{name}}',
        html: '<p>Hello {{name}}, welcome to our platform!</p>',
        text: 'Hello {{name}}, welcome to our platform!'
      };

      const templateData = { name: 'John Doe' };
      const emailOptions: EmailOptions = {
        to: 'john@example.com'
      };

      const result = await emailService.sendTemplateEmail(emailOptions, template, templateData);

      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        to: 'john@example.com',
        subject: 'Welcome John Doe',
        html: '<p>Hello John Doe, welcome to our platform!</p>',
        text: 'Hello John Doe, welcome to our platform!'
      }));
    });

    it('should handle template variable replacement', async () => {
      const template: EmailTemplate = {
        subject: 'Order #{{orderId}} Confirmation',
        html: '<p>Your order #{{orderId}} has been {{status}}</p>'
      };

      const templateData = { orderId: '12345', status: 'confirmed' };
      const emailOptions: EmailOptions = {
        to: 'customer@example.com'
      };

      await emailService.sendTemplateEmail(emailOptions, template, templateData);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        subject: 'Order #12345 Confirmation',
        html: '<p>Your order #12345 has been confirmed</p>'
      }));
    });

    it('should handle missing template variables gracefully', async () => {
      const template: EmailTemplate = {
        subject: 'Hello {{name}}',
        html: '<p>Welcome {{name}}!</p>'
      };

      const templateData = {}; // Missing 'name'
      const emailOptions: EmailOptions = {
        to: 'test@example.com'
      };

      const result = await emailService.sendTemplateEmail(emailOptions, template, templateData);

      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        subject: 'Hello {{name}}',
        html: '<p>Welcome {{name}}!</p>'
      }));
    });
  });

  describe('verifyConnection', () => {
    it('should verify nodemailer connection', async () => {
      const result = await emailService.verifyConnection();

      expect(result.success).toBe(true);
      expect(mockTransporter.verify).toHaveBeenCalled();
    });

    it('should handle verification failures', async () => {
      mockTransporter.verify.mockRejectedValue(new Error('Connection failed'));

      const result = await emailService.verifyConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to verify email connection');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = EmailService.getInstance();
      const instance2 = EmailService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Email Validation', () => {
    it('should validate email addresses', async () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org'
      ];

      for (const email of validEmails) {
        const emailOptions: EmailOptions = {
          to: email,
          subject: 'Test',
          html: '<p>Test</p>'
        };

        const result = await emailService.sendEmail(emailOptions);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid email addresses', async () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user..name@domain.com'
      ];

      for (const email of invalidEmails) {
        const emailOptions: EmailOptions = {
          to: email,
          subject: 'Test',
          html: '<p>Test</p>'
        };

        const result = await emailService.sendEmail(emailOptions);
        expect(result.success).toBe(false);
      }
    });
  });
});
