/**
 * Google Drive backup adapter using OAuth PKCE + REST.
 *
 * Scope: drive.file — the app only ever sees files it created. The backup
 * blob is a single file `markal-backup.json` in the user's Drive root,
 * encrypted with the user's passphrase (the operator never sees the key).
 *
 * Configure the OAuth client_id via PUBLIC_MARKAL_GOOGLE_CLIENT_ID at
 * build time. The redirect URI must match `${origin}/oauth/google/callback`.
 */

import {
  applyPlainBackup,
  decryptAndApplyBackup,
  exportBackupAsBlob,
  parseBackupText,
} from "./backup.ts";
import {
  clearDriveTokens,
  type DriveTokens,
  loadDriveTokens,
  saveDriveTokens,
} from "./tokens.ts";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const BACKUP_FILENAME = "markal-backup.json";
const PKCE_SESSION_KEY = "markal.oauth.pkce";

const CALLBACK_PATH = "/oauth/google/callback";

/**
 * The token exchange and refresh routes live on the signaling server
 * (which carries the client_secret server-side). We derive the HTTP base
 * from the WS signaling URL: wss:// → https://, ws:// → http://.
 */
function tokenProxyBase(): string {
  const env = (import.meta as unknown as {
    env?: Record<string, string | undefined>;
  }).env;
  const ws = env?.PUBLIC_MARKAL_SIGNALING_URL;
  if (typeof ws === "string" && ws.length > 0) {
    if (ws.startsWith("wss://")) return "https://" + ws.slice("wss://".length);
    if (ws.startsWith("ws://")) return "http://" + ws.slice("ws://".length);
    return ws;
  }
  if (env?.DEV) return "http://localhost:8080";
  return "https://signal.markal.app";
}

interface PkceSession {
  verifier: string;
  challenge: string;
  state: string;
  redirectUri: string;
  returnTo: string;
  startedAt: number;
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

function clientId(): string {
  const env = (import.meta as unknown as {
    env?: Record<string, string | undefined>;
  }).env;
  return env?.PUBLIC_MARKAL_GOOGLE_CLIENT_ID ?? "";
}

export function isDriveConfigured(): boolean {
  return clientId().length > 0;
}

export function callbackPath(): string {
  return CALLBACK_PATH;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(input: string): Promise<Uint8Array> {
  const buffer = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return new Uint8Array(hash);
}

async function buildPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = toBase64Url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = toBase64Url(await sha256(verifier));
  return { verifier, challenge };
}

export async function startDriveOAuth(returnTo: string = "/"): Promise<void> {
  if (!isDriveConfigured()) {
    throw new Error(
      "Drive no está configurado en esta instancia. Define PUBLIC_MARKAL_GOOGLE_CLIENT_ID.",
    );
  }
  const { verifier, challenge } = await buildPkce();
  const state = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const redirectUri = `${location.origin}${CALLBACK_PATH}`;

  const session: PkceSession = {
    verifier,
    challenge,
    state,
    redirectUri,
    returnTo,
    startedAt: Date.now(),
  };
  sessionStorage.setItem(PKCE_SESSION_KEY, JSON.stringify(session));

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");

  location.assign(url.toString());
}

function takePkceSession(): PkceSession | null {
  const raw = sessionStorage.getItem(PKCE_SESSION_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PKCE_SESSION_KEY);
  try {
    return JSON.parse(raw) as PkceSession;
  } catch {
    return null;
  }
}

export async function completeDriveOAuth(): Promise<{ returnTo: string }> {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const stateParam = params.get("state");
  const error = params.get("error");
  if (error) throw new Error(`OAuth error: ${error}`);
  if (!code || !stateParam) throw new Error("Faltan parámetros en el callback");

  const session = takePkceSession();
  if (!session) throw new Error("Sesión OAuth no encontrada");
  if (session.state !== stateParam) {
    throw new Error("State mismatch (posible CSRF)");
  }

  const response = await fetch(`${tokenProxyBase()}/oauth/google/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: session.verifier,
      redirect_uri: session.redirectUri,
    }),
  });
  if (!response.ok) {
    throw new Error(`Token exchange falló: ${await response.text()}`);
  }
  const json = (await response.json()) as TokenResponse;

  const tokens: DriveTokens = {
    provider: "google-drive",
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: Date.now() + ((json.expires_in ?? 3600) * 1000) - 60_000,
    scope: json.scope ?? SCOPE,
    obtainedAt: Date.now(),
  };
  await saveDriveTokens(tokens);
  return { returnTo: session.returnTo ?? "/" };
}

async function refreshAccessToken(refreshToken: string): Promise<DriveTokens> {
  const response = await fetch(`${tokenProxyBase()}/oauth/google/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    throw new Error(`Refresh falló: ${await response.text()}`);
  }
  const json = (await response.json()) as TokenResponse;
  const tokens: DriveTokens = {
    provider: "google-drive",
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: Date.now() + ((json.expires_in ?? 3600) * 1000) - 60_000,
    scope: json.scope ?? SCOPE,
    obtainedAt: Date.now(),
  };
  await saveDriveTokens(tokens);
  return tokens;
}

async function getValidTokens(): Promise<DriveTokens | null> {
  let tokens = await loadDriveTokens();
  if (!tokens) return null;
  if (tokens.expiresAt > Date.now()) return tokens;
  if (!tokens.refreshToken) {
    await clearDriveTokens();
    return null;
  }
  try {
    tokens = await refreshAccessToken(tokens.refreshToken);
    return tokens;
  } catch {
    await clearDriveTokens();
    return null;
  }
}

export async function isDriveConnected(): Promise<boolean> {
  return (await loadDriveTokens()) !== null;
}

export async function disconnectDrive(): Promise<void> {
  const tokens = await loadDriveTokens();
  if (tokens?.refreshToken) {
    try {
      const body = new URLSearchParams();
      body.set("token", tokens.refreshToken);
      await fetch(REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch {
      // Revocation is best-effort; we always clear local tokens.
    }
  }
  await clearDriveTokens();
}

async function driveFetch(
  path: string,
  init?: RequestInit & { upload?: boolean },
): Promise<Response> {
  const tokens = await getValidTokens();
  if (!tokens) throw new Error("Drive no está conectado");
  const base = init?.upload ? DRIVE_UPLOAD : DRIVE_API;
  const headers = new Headers(init?.headers ?? {});
  headers.set("authorization", `Bearer ${tokens.accessToken}`);
  const response = await fetch(base + path, { ...init, headers });
  if (!response.ok) {
    throw new Error(`Drive API ${response.status}: ${await response.text()}`);
  }
  return response;
}

async function findBackupFileId(): Promise<string | null> {
  const query = `name='${BACKUP_FILENAME}' and trashed=false`;
  const url =
    `/files?q=${encodeURIComponent(query)}&fields=files(id,modifiedTime)&pageSize=1`;
  const response = await driveFetch(url);
  const json = await response.json() as {
    files?: Array<{ id: string; modifiedTime: string }>;
  };
  return json.files?.[0]?.id ?? null;
}

export interface DriveSyncInfo {
  fileId: string;
  modifiedTime: string;
}

export async function pushBackupToDrive(
  passphrase: string,
): Promise<DriveSyncInfo> {
  const blob = await exportBackupAsBlob(passphrase);
  const text = await blob.text();
  const existingId = await findBackupFileId();

  if (existingId) {
    const response = await driveFetch(
      `/files/${existingId}?uploadType=media&fields=id,modifiedTime`,
      {
        upload: true,
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: text,
      },
    );
    const json = await response.json() as {
      id: string;
      modifiedTime: string;
    };
    return { fileId: json.id, modifiedTime: json.modifiedTime };
  }

  const boundaryBytes = crypto.getRandomValues(new Uint8Array(8));
  const boundary = "markal-" + Array.from(boundaryBytes, (b) =>
    b.toString(16).padStart(2, "0")).join("");
  const metadata = { name: BACKUP_FILENAME, mimeType: "application/json" };
  const body = `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) + "\r\n" +
    `--${boundary}\r\n` +
    "Content-Type: application/json\r\n\r\n" +
    text + "\r\n" +
    `--${boundary}--`;

  const response = await driveFetch(
    `/files?uploadType=multipart&fields=id,modifiedTime`,
    {
      upload: true,
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const json = await response.json() as { id: string; modifiedTime: string };
  return { fileId: json.id, modifiedTime: json.modifiedTime };
}

export async function pullBackupFromDrive(
  passphrase: string,
): Promise<DriveSyncInfo | null> {
  const fileId = await findBackupFileId();
  if (!fileId) return null;

  const contentResponse = await driveFetch(`/files/${fileId}?alt=media`);
  const text = await contentResponse.text();
  const parsed = await parseBackupText(text);

  if (parsed.kind === "encrypted") {
    await decryptAndApplyBackup(parsed.envelope, passphrase);
  } else {
    await applyPlainBackup(parsed.backup);
  }

  const metaResponse = await driveFetch(`/files/${fileId}?fields=modifiedTime`);
  const meta = await metaResponse.json() as { modifiedTime: string };
  return { fileId, modifiedTime: meta.modifiedTime };
}

export function isOAuthCallbackPath(pathname: string): boolean {
  return pathname.replace(/\/$/, "") === CALLBACK_PATH;
}
