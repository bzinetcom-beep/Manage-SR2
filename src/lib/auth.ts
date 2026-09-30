import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || "soldier-resource-management-dev-secret-key-change-me",
);

export const COOKIE_NAME = "srm_session";

export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  role: "admin" | "operator" | "viewer";
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      id: payload.id as number,
      username: payload.username as string,
      fullName: payload.fullName as string,
      role: payload.role as SessionUser["role"],
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export function canWrite(role?: string): boolean {
  return role === "admin" || role === "operator";
}

export function isAdmin(role?: string): boolean {
  return role === "admin";
}
