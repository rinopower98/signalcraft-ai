import crypto from "node:crypto";
import { COOKIE_NAME, STATE_COOKIE, SCOPES, appUrl, configured, json, parseCookies, readSession, refreshAccess, saveSession, setCookie, tenant, tokenRequest } from "./_outlook.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const requestBuckets = new Map();
const callbackUri = () => `${appUrl()}/api/outlook?action=callback`;

const login = (res) => {
  if (!configured()) return res.redirect(`${appUrl()}/?email_error=not_configured#studio`);
  const state = crypto.randomBytes(24).toString("base64url");
  setCookie(res, STATE_COOKIE, state, { maxAge: 600 });
  const authorize = new URL(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`);
  authorize.search = new URLSearchParams({ client_id: process.env.MS_CLIENT_ID, response_type: "code", redirect_uri: callbackUri(), response_mode: "query", scope: SCOPES, state, prompt: "select_account" }).toString();
  return res.redirect(authorize.toString());
};

const callback = async (req, res) => {
  const cookies = parseCookies(req); setCookie(res, STATE_COOKIE, "", { maxAge: 0 });
  if (!req.query?.code || !req.query?.state || req.query.state !== cookies[STATE_COOKIE]) return res.redirect(`${appUrl()}/?email_error=invalid_state#studio`);
  try {
    const token = await tokenRequest({ client_id: process.env.MS_CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET, grant_type: "authorization_code", code: req.query.code, redirect_uri: callbackUri(), scope: SCOPES });
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", { headers: { Authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResponse.json();
    if (!profileResponse.ok) throw new Error("Could not read the connected Microsoft account.");
    const email = String(profile.mail || profile.userPrincipalName || "").toLowerCase(), allowed = String(process.env.ALLOWED_SENDER_EMAIL || "").toLowerCase();
    if (allowed && email !== allowed) { setCookie(res, COOKIE_NAME, "", { maxAge: 0 }); return res.redirect(`${appUrl()}/?email_error=wrong_account#studio`); }
    saveSession(res, { refreshToken: token.refresh_token, email, name: profile.displayName || email });
    return res.redirect(`${appUrl()}/?email_connected=1#studio`);
  } catch (error) { console.error("Outlook callback failed", error.message); return res.redirect(`${appUrl()}/?email_error=oauth_failed#studio`); }
};

const sendEmail = async (req, res) => {
  const session = readSession(req); if (!session?.refreshToken) return json(res, 401, { error: "Connect Outlook before sending." });
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim(), now = Date.now();
  const recent = (requestBuckets.get(ip) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 3) return json(res, 429, { error: "Too many sends. Wait a minute and try again." });
  const to = String(req.body?.to || "").trim().toLowerCase(), subject = String(req.body?.subject || "").trim(), message = String(req.body?.message || "").trim();
  if (!emailPattern.test(to)) return json(res, 400, { error: "Enter a valid recipient email address." });
  if (!subject || subject.length > 200) return json(res, 400, { error: "Enter a subject under 200 characters." });
  if (!message || message.length > 10000) return json(res, 400, { error: "Enter a message under 10,000 characters." });
  try {
    const refreshed = await refreshAccess(session);
    const graph = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", headers: { Authorization: `Bearer ${refreshed.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { subject, body: { contentType: "Text", content: message }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }) });
    if (!graph.ok) { console.error("Microsoft sendMail failed", graph.status, (await graph.text()).slice(0, 500)); return json(res, 502, { error: "Microsoft could not send this email." }); }
    recent.push(now); requestBuckets.set(ip, recent); saveSession(res, refreshed.session); return json(res, 200, { sent: true, from: session.email, to });
  } catch (error) { console.error("Email send failed", error.message); return json(res, 401, { error: "Your Outlook connection expired. Reconnect and try again." }); }
};

export default async function handler(req, res) {
  const action = String(req.query?.action || "status");
  if (action === "status") { const session = configured() ? readSession(req) : null; return json(res, 200, { configured: configured(), connected: Boolean(session?.refreshToken), email: session?.email || "" }); }
  if (!configured()) return json(res, 503, { error: "Outlook sending is not configured." });
  if (action === "login" && req.method === "GET") return login(res);
  if (action === "callback" && req.method === "GET") return callback(req, res);
  if (action === "logout" && req.method === "POST") { setCookie(res, COOKIE_NAME, "", { maxAge: 0 }); return json(res, 200, { connected: false }); }
  if (action === "send" && req.method === "POST") return sendEmail(req, res);
  return json(res, 405, { error: "Unsupported Outlook action." });
}
