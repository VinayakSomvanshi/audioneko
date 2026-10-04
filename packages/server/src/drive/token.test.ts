import { describe, expect, it, vi } from "vitest";
import {
  base64UrlEncode,
  createSignedJwt,
  getGoogleAccessToken,
  importPrivateKey,
  pemToBinary,
} from "./token";

describe("Google Service Account Token Minter", () => {
  it("correctly base64url encodes strings and byte arrays", () => {
    expect(base64UrlEncode("hello world")).toBe("aGVsbG8gd29ybGQ");
    expect(base64UrlEncode(new Uint8Array([1, 2, 3, 4]))).toBe("AQIDBA");
    // Ensure padding "=" is stripped and URL-safe chars used
    expect(base64UrlEncode("subjects?_d=1")).not.toContain("+");
    expect(base64UrlEncode("subjects?_d=1")).not.toContain("/");
    expect(base64UrlEncode("subjects?_d=1")).not.toContain("=");
  });

  it("generates a real RSA key, converts to PEM, imports via Web Crypto, and signs JWT", async () => {
    // Generate valid RSA-2048 key pair using Web Crypto API
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );

    // Export private key to PKCS#8 DER
    const exportedDer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const base64Key = btoa(String.fromCharCode(...new Uint8Array(exportedDer)));
    const pemKey = `-----BEGIN PRIVATE KEY-----\n${base64Key}\n-----END PRIVATE KEY-----`;

    // Test pemToBinary
    const binary = pemToBinary(pemKey);
    expect(binary.byteLength).toBe(exportedDer.byteLength);

    // Test importPrivateKey
    const importedKey = await importPrivateKey(pemKey);
    expect(importedKey.type).toBe("private");
    expect(importedKey.algorithm.name).toBe("RSASSA-PKCS1-v1_5");

    // Test createSignedJwt
    const clientEmail = "test-service-account@test-project.iam.gserviceaccount.com";
    const nowEpoch = 1775345600;
    const jwt = await createSignedJwt(clientEmail, importedKey, nowEpoch);

    const parts = jwt.split(".");
    expect(parts.length).toBe(3);

    const [headerPart, payloadPart, signaturePart] = parts;
    expect(headerPart).toBeDefined();
    expect(payloadPart).toBeDefined();
    expect(signaturePart).toBeDefined();

    const header = JSON.parse(atob(headerPart!.replace(/-/g, "+").replace(/_/g, "/")));
    const payload = JSON.parse(atob(payloadPart!.replace(/-/g, "+").replace(/_/g, "/")));

    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(payload.iss).toBe(clientEmail);
    expect(payload.aud).toBe("https://oauth2.googleapis.com/token");
    expect(payload.exp).toBe(nowEpoch + 3600);
    expect(payload.iat).toBe(nowEpoch);
    expect(payload.scope).toBe("https://www.googleapis.com/auth/drive.readonly");

    // Verify signature with public key
    const signingInput = `${headerPart}.${payloadPart}`;
    const signatureBytes = Uint8Array.from(
      atob(signaturePart!.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );

    const isValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      keyPair.publicKey,
      signatureBytes,
      new TextEncoder().encode(signingInput),
    );

    expect(isValid).toBe(true);
  });

  it("reuses cached token from KV when available (0ms fast path)", async () => {
    const mockKv = {
      get: vi.fn().mockResolvedValue("cached_google_bearer_token_xyz"),
      put: vi.fn(),
    } as unknown as KVNamespace;

    const mockFetch = vi.fn();

    const token = await getGoogleAccessToken(
      JSON.stringify({ client_email: "test@sa.com", private_key: "dummy" }),
      mockKv,
      mockFetch as unknown as typeof fetch,
    );

    expect(token).toBe("cached_google_bearer_token_xyz");
    expect(mockKv.get).toHaveBeenCalledWith("gdrive_access_token");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("exchanges JWT with Google OAuth2 on KV miss and stores token in KV", async () => {
    // Generate valid RSA key for realistic test
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign"],
    );
    const exportedDer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const base64Key = btoa(String.fromCharCode(...new Uint8Array(exportedDer)));
    const pemKey = `-----BEGIN PRIVATE KEY-----\n${base64Key}\n-----END PRIVATE KEY-----`;

    const saJson = JSON.stringify({
      client_email: "audioneko-sa@test.iam.gserviceaccount.com",
      private_key: pemKey,
    });

    const mockKv = {
      get: vi.fn().mockResolvedValue(null), // KV cache miss
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "newly_minted_google_token_12345",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    });

    const token = await getGoogleAccessToken(saJson, mockKv, mockFetch as unknown as typeof fetch);

    expect(token).toBe("newly_minted_google_token_12345");
    expect(mockKv.get).toHaveBeenCalledWith("gdrive_access_token");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(mockKv.put).toHaveBeenCalledWith(
      "gdrive_access_token",
      "newly_minted_google_token_12345",
      { expirationTtl: 3300 },
    );
  });
});
