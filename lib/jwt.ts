import { SignJWT, jwtVerify, type JWTPayload } from "jose"
import { randomBytes, createHmac, timingSafeEqual } from "crypto"

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "dev-secret")
const refreshSecret = process.env.NEXTAUTH_SECRET ?? "dev-secret"

export interface AccessTokenPayload extends JWTPayload {
  userId: string
  sessionId: string
  roles: string[]
  employeeId: string
}

export async function signAccessToken(payload: Omit<AccessTokenPayload, keyof JWTPayload>) {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret)
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, secret)
  return payload as AccessTokenPayload
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString("hex")
}

// HMAC-SHA256 is secure for random tokens (no need for key stretching like bcrypt).
// Enables O(1) direct DB lookup via the @unique constraint on refreshTokenHash.
export function hashRefreshToken(token: string): string {
  return createHmac("sha256", refreshSecret).update(token).digest("hex")
}

export function verifyRefreshTokenHash(token: string, hash: string): boolean {
  const expected = hashRefreshToken(token)
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hash, "hex"))
}
