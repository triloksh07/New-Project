import dotenv from 'dotenv';
dotenv.config();

import { MailService } from '@sendgrid/mail';

const sendgridApiKey = process.env.SENDGRID_API_KEY || "placeholder_sendgrid_api_key"; // Placeholder for testing

if (!sendgridApiKey) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(sendgridApiKey);

const FROM_EMAIL = 'noreply@example.com'; // Replace with your verified sender email in SendGrid

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string
): Promise<boolean> {
  try {
    await mailService.send({
      to,
      from: FROM_EMAIL,
      subject: 'Password Reset Request',
      text: `Click the following link to reset your password: ${resetLink}\nThis link will expire in 1 hour.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4285F4;">Password Reset Request</h2>
          <p>You've requested to reset your password. Click the button below to set a new password:</p>
          <a href="${resetLink}" 
             style="display: inline-block; background-color: #4285F4; color: white; 
                    padding: 12px 24px; text-decoration: none; border-radius: 4px; 
                    margin: 16px 0;">
            Reset Password
          </a>
          <p style="color: #666; font-size: 14px;">
            This link will expire in 1 hour for security reasons.<br>
            If you didn't request this reset, please ignore this email.
          </p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}
