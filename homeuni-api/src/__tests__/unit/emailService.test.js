import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildStreakReminderEmail, sendEmail } from '../../lib/email.service.js';

describe('buildStreakReminderEmail', () => {
  it('includes first name and streak count in subject', () => {
    const { subject } = buildStreakReminderEmail('Jane Smith', 5);
    expect(subject).toContain('5-day streak');
  });

  it('uses first name only', () => {
    const { html } = buildStreakReminderEmail('Jane Smith', 3);
    expect(html).toContain('Jane');
    expect(html).not.toContain('Smith');
  });

  it('handles null name gracefully', () => {
    const { html } = buildStreakReminderEmail(null, 2);
    expect(html).toContain('there');
  });

  it('includes the streak count in the html body', () => {
    const { html } = buildStreakReminderEmail('Bob', 12);
    expect(html).toContain('12-day streak');
  });

  it('includes a plain text version', () => {
    const { text } = buildStreakReminderEmail('Alice', 4);
    expect(text).toContain('4-day streak');
    expect(typeof text).toBe('string');
  });
});

describe('sendEmail — no SMTP configured', () => {
  beforeEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  it('returns { skipped: true } when SMTP not configured', async () => {
    const result = await sendEmail({ to: 'x@y.com', subject: 'test', html: '<p>hi</p>', text: 'hi' });
    expect(result).toEqual({ skipped: true });
  });

  it('does not throw', async () => {
    await expect(sendEmail({ to: 'x@y.com', subject: 's', html: 'h', text: 't' })).resolves.toBeDefined();
  });
});
