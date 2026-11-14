import crypto from "node:crypto";

export const COOKIE_NAME = "signalcraft_outlook";
export const STATE_COOKIE = "signalcraft_oauth_state";
export const SCOPES = "openid profile email offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send";

export const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

export const configured = () => Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.EMAIL_TOKEN_SECRET && process.env.APP_URL);
export const appUrl = () => String(process.env.APP_URL || "").replace(/\/$/, "");
export const redirectUri = () => `${appUrl()}/api/outlook-callback`;
export const tenant = () => process.env.MS_TENANT_ID || "organizations";

export const parseCookies = (req) => Object.fromEntries(String(req.headers.cookie || "").split(";").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
  const index = entry.indexOf("=");
  return [entry.slice(0, index), decodeURIComponent(entry.slice(index + 1))];
}));

export const setCookie = (res, name, value, options = {}) => {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax"];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  const existing = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [...(Array.isArray(existing) ? existing : existing ? [existing] : []), parts.join("; ")]);
};

const key = () => crypto.createHash("sha256").update(process.env.EMAIL_TOKEN_SECRET).digest();
export const seal = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
};
export const unseal = (value) => {
  try {
    const buffer = Buffer.from(value, "base64url"), iv = buffer.subarray(0, 12), tag = buffer.subarray(12, 28), encrypted = buffer.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
  } catch { return null; }
};

export const tokenRequest = async (params) => {
  const response = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || "Microsoft authentication failed.");
  return payload;
};

export const refreshAccess = async (session) => {
  const token = await tokenRequest({ client_id: process.env.MS_CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: session.refreshToken, scope: SCOPES });
  return { accessToken: token.access_token, session: { ...session, refreshToken: token.refresh_token || session.refreshToken } };
};
export const readSession = (req) => { const cookie = parseCookies(req)[COOKIE_NAME]; return cookie ? unseal(cookie) : null; };
export const saveSession = (res, session) => setCookie(res, COOKIE_NAME, seal(session), { maxAge: 60 * 60 * 24 * 30 });
