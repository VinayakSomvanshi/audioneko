/**
 * audioneko: Google Service Account Web Crypto RS256 Token Minter
 * Zero external dependencies: Uses native crypto.subtle (Web Standards)
 */

export interface GoogleServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const GOOGLE_TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const KV_TOKEN_CACHE_KEY = "gdrive_access_token";

/**
 * Base64URL encoding compliant with RFC 7515
 */
export function base64UrlEncode(data: string | Uint8Array): string {
  let base64: string;
  if (typeof data === "string") {
    const bytes = new TextEncoder().encode(data);
    base64 = btoa(String.fromCharCode(...bytes));
  } else {
    base64 = btoa(String.fromCharCode(...data));
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Strips PEM header/footer and decodes PKCS#8 base64 into an ArrayBuffer
 */
export function pemToBinary(pem: string): Uint8Array {
  const cleanPem = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");

  const binaryString = atob(cleanPem);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Imports PKCS#8 RSA private key into CryptoKey
 */
export async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  const binaryDer = pemToBinary(pemKey);
  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer as ArrayBuffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
}

/**
 * Creates and signs an RS256 JWT assertion for Google OAuth2
 */
export async function createSignedJwt(
  clientEmail: string,
  privateKey: CryptoKey,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: clientEmail,
    scope: DRIVE_READONLY_SCOPE,
    aud: GOOGLE_TOKEN_AUDIENCE,
    exp: nowEpochSeconds + 3600, // Valid for 1 hour
    iat: nowEpochSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signatureBuffer));
  return `${signingInput}.${encodedSignature}`;
}

/**
 * Obtains a valid Google OAuth2 access token for Google Drive API v3
 * Reads from Cloudflare KV cache first. On miss, mints RS256 JWT, exchanges with Google, and caches.
 */
export async function getGoogleAccessToken(
  serviceAccountJsonString: string,
  kv?: KVNamespace,
  customFetch: typeof fetch = fetch,
): Promise<string> {
  // 1. Check KV Cache first (Fast path - 0ms network overhead)
  if (kv) {
    try {
      const cached = await kv.get(KV_TOKEN_CACHE_KEY);
      if (cached) {
        return cached;
      }
    } catch {
      // Fallback to fetch on KV read error
    }
  }

  // 2. Parse Google Service Account Key
  let saKey: GoogleServiceAccountKey;
  try {
    saKey = JSON.parse(serviceAccountJsonString) as GoogleServiceAccountKey;
    if (!saKey.client_email || !saKey.private_key) {
      throw new Error("Missing client_email or private_key in Service Account JSON");
    }
  } catch (err) {
    throw new Error(`Invalid Google Service Account Key format: ${(err as Error).message}`);
  }

  // 3. Mint and sign RS256 JWT
  const privateKey = await importPrivateKey(saKey.private_key);
  const jwtAssertion = await createSignedJwt(saKey.client_email, privateKey);

  // 4. Exchange JWT assertion for OAuth2 Bearer token
  const tokenEndpoint = saKey.token_uri || GOOGLE_TOKEN_AUDIENCE;
  const tokenResponse = await customFetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwtAssertion,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`Google OAuth2 Token Exchange failed [${tokenResponse.status}]: ${errorBody}`);
  }

  const tokenData = (await tokenResponse.json()) as { access_token: string; expires_in?: number };
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new Error("Google OAuth2 response did not contain an access_token");
  }

  // 5. Cache token in Cloudflare KV (Default TTL: 3300 seconds / 55 mins)
  if (kv) {
    try {
      await kv.put(KV_TOKEN_CACHE_KEY, accessToken, {
        expirationTtl: 3300,
      });
    } catch {
      // Non-blocking: Proceed even if KV cache write fails
    }
  }

  return accessToken;
}
