import nodemailer from "nodemailer";

// App email: reminders, alerts and notices. Sign-in links are sent by Supabase Auth.
// Development sends to the local Supabase inbox over SMTP; production uses Resend; tests can
// use the in-memory outbox.

export type Email = { to: string; subject: string; text: string; html?: string };
export type Mailer = { send(email: Email): Promise<void> };

export const memoryOutbox: Email[] = [];

function from() {
  return process.env.EMAIL_FROM || "Course Feedback <feedback@platform.example>";
}

export function mailer(): Mailer {
  const transport = process.env.EMAIL_TRANSPORT || (process.env.RESEND_API_KEY ? "resend" : "smtp");
  if (transport === "memory") {
    return { async send(email) { memoryOutbox.push(email); } };
  }
  if (transport === "resend") {
    return {
      async send(email) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: from(), to: [email.to], subject: email.subject, text: email.text, html: email.html }),
        });
        if (!res.ok) throw new Error(`Resend returned ${res.status}`);
      },
    };
  }
  const smtp = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "127.0.0.1",
    port: Number(process.env.SMTP_PORT || 54325),
    secure: false,
    ignoreTLS: true,
  });
  return {
    async send(email) {
      await smtp.sendMail({ from: from(), to: email.to, subject: email.subject, text: email.text, html: email.html });
    },
  };
}
