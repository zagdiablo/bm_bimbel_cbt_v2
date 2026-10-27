import type { NextResponse } from "next/server";

export type AuthPayload = {
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    classroom?: string | null;
  };
  code?: string;
  message?: string;
} & Record<string, unknown>;

export async function readJsonResponse(
  response: Response,
): Promise<AuthPayload | null> {
  try {
    const data: unknown = await response.json();

    if (typeof data !== "object" || data === null) {
      return null;
    }

    return data as AuthPayload;
  } catch {
    return null;
  }
}

/**
 * better-auth sets the session token and the session-data cache through
 * `Set-Cookie`. Copy both cookies onto the response we return to the browser
 * so the session survives the wrapper endpoint.
 */
export function copySetCookies(from: Response, to: NextResponse): NextResponse {
  for (const cookie of from.headers.getSetCookie()) {
    to.headers.append("set-cookie", cookie);
  }

  return to;
}
