import { getRequest } from "@tanstack/react-start/server";

export interface CognitoUser {
  sub: string;
  name: string;
  email: string;
}

export function getAuthenticatedUser(): CognitoUser {
  const request = getRequest();

  const sub = request.headers.get("x-amzn-oidc-identity");
  if (!sub) {
    throw new Error("Unauthenticated: missing x-amzn-oidc-identity");
  }

  const dataHeader = request.headers.get("x-amzn-oidc-data");
  let name = "";
  let email = "";

  if (dataHeader) {
    try {
      const parts = dataHeader.split(".");
      const payloadB64 = parts[1];
      if (payloadB64) {
        const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
          name?: string;
          email?: string;
        };
        name = payload.name ?? "";
        email = payload.email ?? "";
      }
    } catch {
      // Non-fatal: authenticated sub is still available.
    }
  }

  return { sub, name, email };
}
