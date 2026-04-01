import type { EmailServices } from '../emails/emails.types';
import { createLogger } from '../shared/logger/logger';

const logger = createLogger({ namespace: 'notifications' });

export type NotificationServices = ReturnType<typeof createNotificationServices>;

export function createNotificationServices({ emailServices, notifyEmail }: { emailServices: EmailServices; notifyEmail?: string }) {
  const sendNotification = async ({ to, subject, body }: { to?: string; subject: string; body: string }) => {
    const recipient = to ?? notifyEmail;
    if (!recipient) {
      logger.debug({ subject }, 'No notification recipient configured, skipping');
      return;
    }

    try {
      await emailServices.sendEmail({
        to: recipient,
        subject: `[Papra] ${subject}`,
        html: renderEmail({ subject, body }),
      });
      logger.info({ to: recipient, subject }, 'Notification sent');
    } catch (error) {
      logger.error({ error, to: recipient, subject }, 'Failed to send notification');
    }
  };

  return {
    notifyDocumentReceived: async ({ documentName, fromAddress, subject: emailSubject }: { documentName: string; fromAddress?: string; subject?: string }) => {
      await sendNotification({
        subject: 'Document received',
        body: `
          <p>A new document has been received and stored in Papra.</p>
          <table style="margin:16px 0">
            <tr><td style="padding:4px 12px 4px 0;color:#666">Document</td><td><strong>${escapeHtml(documentName)}</strong></td></tr>
            ${fromAddress ? `<tr><td style="padding:4px 12px 4px 0;color:#666">From</td><td>${escapeHtml(fromAddress)}</td></tr>` : ''}
            ${emailSubject ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Subject</td><td>${escapeHtml(emailSubject)}</td></tr>` : ''}
          </table>
        `,
      });
    },

    notifyTranscriptionCompleted: async ({ meetingTitle, durationMinutes }: { meetingTitle: string; durationMinutes?: number }) => {
      await sendNotification({
        subject: 'Transcription completed',
        body: `
          <p>A meeting transcription has been completed.</p>
          <table style="margin:16px 0">
            <tr><td style="padding:4px 12px 4px 0;color:#666">Meeting</td><td><strong>${escapeHtml(meetingTitle)}</strong></td></tr>
            ${durationMinutes ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Duration</td><td>${durationMinutes} minutes</td></tr>` : ''}
          </table>
        `,
      });
    },

    notifyTranscriptionFailed: async ({ meetingTitle, error }: { meetingTitle: string; error?: string }) => {
      await sendNotification({
        subject: 'Transcription failed',
        body: `
          <p>A meeting transcription has failed.</p>
          <table style="margin:16px 0">
            <tr><td style="padding:4px 12px 4px 0;color:#666">Meeting</td><td><strong>${escapeHtml(meetingTitle)}</strong></td></tr>
            ${error ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Error</td><td style="color:#dc2626">${escapeHtml(error)}</td></tr>` : ''}
          </table>
        `,
      });
    },
  };
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderEmail({ subject, body }: { subject: string; body: string }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a">
  <div style="border-bottom:2px solid #0066cc;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">${escapeHtml(subject)}</h2>
  </div>
  ${body}
  <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#999">
    Sent by Papra &middot; <a href="https://docs.lombello.com" style="color:#0066cc">Open Papra</a>
  </div>
</body>
</html>`.trim();
}
