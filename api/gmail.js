import nodemailer from "nodemailer";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const requestBuckets = new Map();

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

const sender = () => String(process.env.GMAIL_USER || "").trim().toLowerCase();
const configured = () => Boolean(sender() && process.env.GMAIL_APP_PASSWORD);

const sendEmail = async (req, res) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (requestBuckets.get(ip) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 3) return json(res, 429, { error: "Too many sends. Wait a minute and try again." });

  const to = String(req.body?.to || "").trim().toLowerCase();
  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();
  if (!emailPattern.test(to)) return json(res, 400, { error: "Enter a valid recipient email address." });
  if (!subject || subject.length > 200) return json(res, 400, { error: "Enter a subject under 200 characters." });
  if (!message || message.length > 10000) return json(res, 400, { error: "Enter a message under 10,000 characters." });

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: sender(), pass: process.env.GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({
      from: `SignalCraft <${sender()}>`,
      to,
      subject,
      text: message,
      replyTo: sender(),
    });
    recent.push(now);
    requestBuckets.set(ip, recent);
    return json(res, 200, { sent: true, from: sender(), to });
  } catch (error) {
    console.error("Gmail send failed", error.message);
    return json(res, 502, { error: "Gmail could not send this email. Check the app password and try again." });
  }
};

export default async function handler(req, res) {
  const action = String(req.query?.action || "status");
  if (action === "status" && req.method === "GET") {
    return json(res, 200, { configured: configured(), connected: configured(), email: configured() ? sender() : "" });
  }
  if (!configured()) return json(res, 503, { error: "Gmail sending is not configured." });
  if (action === "send" && req.method === "POST") return sendEmail(req, res);
  return json(res, 405, { error: "Unsupported Gmail action." });
}
