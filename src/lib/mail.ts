import nodemailer from "nodemailer";

export interface MailSender {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

/** Logs to the console instead of sending — used in tests. */
export const consoleMailSender: MailSender = {
  async send(message) {
    console.log(`[mail] to=${message.to} subject=${message.subject}\n${message.text}`);
  },
};

/** Sends over SMTP — Mailpit in dev, the club Gmail (app password) in production. */
function smtpMailSender(): MailSender {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return {
    async send(message) {
      await transport.sendMail({ from: "IMRFC Club Hub <noreply@imrfc.club>", ...message });
    },
  };
}

/** Picks the mail sender for the current environment: console in tests, SMTP otherwise. */
export function getMailSender(): MailSender {
  if (process.env.NODE_ENV === "test" || !process.env.SMTP_HOST) return consoleMailSender;
  return smtpMailSender();
}
