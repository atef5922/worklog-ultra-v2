import crypto from "node:crypto";

export function createOtpCode() {
  return `${crypto.randomInt(100000, 999999)}`;
}

export function hashOtp(secret: string, email: string, role: string, code: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${email.toLowerCase()}:${role}:${code}`)
    .digest("hex");
}

export function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(secret: string, email: string, token: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${email.toLowerCase()}:${token}`)
    .digest("hex");
}
