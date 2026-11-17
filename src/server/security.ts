import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../types.ts';
import { emitStructuredLog, setTraceActor } from './observability.ts';
import { getWritableDataDir } from './storagePath.ts';

export interface AccessTokenPayload {
  sub: number;
  email: string;
  nome: string;
  role: Role;
  documento: string;
  institutionId?: number;
  tutorId?: number;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AccessTokenPayload;
}

function getKeyFiles() {
  const keysDir = path.join(getWritableDataDir(), 'keys');
  return {
    keysDir,
    privateKeyFile: path.join(keysDir, 'rs256-private.pem'),
    publicKeyFile: path.join(keysDir, 'rs256-public.pem'),
  };
}

const ACCESS_TTL_SECONDS = Number(process.env.JWT_ACCESS_TTL_SECONDS || '900'); // 15 min
export const REFRESH_TTL_SECONDS = Number(process.env.JWT_REFRESH_TTL_SECONDS || '604800'); // 7 days
export const REFRESH_COOKIE_NAME = 'doepet_refresh_token';
const JWT_ISSUER = 'doepet-api';
const JWT_AUDIENCE = 'doepet-spa';
const JWT_KID = 'doepet-rs256-v1';

interface RsaKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
  source: 'azure_key_vault' | 'env' | 'local_keystore';
}

let cachedKeyPair: RsaKeyPair | null = null;

function normalizePem(raw: string): string {
  return raw.replace(/\\n/g, '\n').trim();
}

export function getKeyPair(): RsaKeyPair {
  if (cachedKeyPair) return cachedKeyPair;

  // 1. Environment variables (populated by Azure Key Vault CSI Driver / App Service Key Vault Reference)
  if (process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY) {
    cachedKeyPair = {
      privateKeyPem: normalizePem(process.env.JWT_PRIVATE_KEY),
      publicKeyPem: normalizePem(process.env.JWT_PUBLIC_KEY),
      source: process.env.AZURE_KEY_VAULT_URL ? 'azure_key_vault' : 'env',
    };
    return cachedKeyPair;
  }

  // 2. Local persisted RSA-2048 keystore for development / container runtime
  const { keysDir, privateKeyFile, publicKeyFile } = getKeyFiles();
  try {
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }

    if (fs.existsSync(privateKeyFile) && fs.existsSync(publicKeyFile)) {
      cachedKeyPair = {
        privateKeyPem: fs.readFileSync(privateKeyFile, 'utf8'),
        publicKeyPem: fs.readFileSync(publicKeyFile, 'utf8'),
        source: 'local_keystore',
      };
      return cachedKeyPair;
    }
  } catch {
    // Continue with freshly generated in-memory keypair
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  try {
    fs.writeFileSync(privateKeyFile, privateKey, { mode: 0o600 });
    fs.writeFileSync(publicKeyFile, publicKey, { mode: 0o644 });
  } catch {
    // Non-fatal if container storage is ephemeral/read-only
  }

  emitStructuredLog('INFO', 'security.rsa_keypair_initialized', {
    source: 'local_keystore',
    algorithm: 'RS256',
    modulusLength: 2048,
  });

  cachedKeyPair = {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    source: 'local_keystore',
  };
  return cachedKeyPair;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(input: string): Buffer {
  const pad = 4 - (input.length % 4 || 4);
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad === 4 ? 0 : pad);
  return Buffer.from(normalized, 'base64');
}

export function signAccessToken(claims: {
  sub: number;
  email: string;
  nome: string;
  role: Role;
  documento: string;
  institutionId?: number;
  tutorId?: number;
}): { token: string; expiresIn: number; payload: AccessTokenPayload } {
  const { privateKeyPem } = getKeyPair();
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    ...claims,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: now,
    exp: now + ACCESS_TTL_SECONDS,
    jti: crypto.randomUUID(),
  };

  const headerSegment = base64UrlEncode(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: JWT_KID })
  );
  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerSegment}.${payloadSegment}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = base64UrlEncode(signer.sign(privateKeyPem));

  return {
    token: `${signingInput}.${signature}`,
    expiresIn: ACCESS_TTL_SECONDS,
    payload,
  };
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerSeg, payloadSeg, sigSeg] = parts;
    const header = JSON.parse(base64UrlDecode(headerSeg).toString('utf8'));
    if (header.alg !== 'RS256') return null;

    const { publicKeyPem } = getKeyPair();
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerSeg}.${payloadSeg}`);
    verifier.end();

    const sigBuffer = base64UrlDecode(sigSeg);
    if (!verifier.verify(publicKeyPem, sigBuffer)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(payloadSeg).toString('utf8')) as AccessTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== JWT_ISSUER || payload.aud !== JWT_AUDIENCE) return null;
    if (!payload.exp || payload.exp <= now) return null;

    return payload;
  } catch {
    return null;
  }
}

export function getPublicJwks(): { keys: Record<string, unknown>[]; keySource: string } {
  const { publicKeyPem, source } = getKeyPair();
  const keyObj = crypto.createPublicKey(publicKeyPem);
  const jwk = keyObj.export({ format: 'jwk' });
  return {
    keySource: source,
    keys: [
      {
        ...jwk,
        kid: JWT_KID,
        use: 'sig',
        alg: 'RS256',
      },
    ],
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function generateOpaqueRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashRefreshToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function resolveRefreshCookieOptions(res: Response) {
  const req = res.req;
  const forwardedProto = req?.header('x-forwarded-proto') || '';
  const isHttps = Boolean(
    req?.secure || forwardedProto.split(',')[0]?.trim().toLowerCase() === 'https'
  );
  return {
    httpOnly: true,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    secure: isHttps,
    path: '/api/v1/auth',
  };
}

export function setRefreshTokenCookie(res: Response, rawToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    ...resolveRefreshCookieOptions(res),
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, resolveRefreshCookieOptions(res));
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.header('Authorization') || req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Sessão não autenticada. Token RS256 ausente.',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({
      error: 'Token expirado ou assinatura RS256 inválida.',
      code: 'TOKEN_INVALID_OR_EXPIRED',
    });
    return;
  }

  req.auth = payload;
  setTraceActor(payload.sub, payload.role);
  next();
}

export function requireRole(...allowedRoles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Autenticação obrigatória.', code: 'UNAUTHORIZED' });
      return;
    }
    if (!allowedRoles.includes(req.auth.role)) {
      emitStructuredLog('WARN', 'security.rbac_denied', {
        requiredRoles: allowedRoles,
        actualRole: req.auth.role,
        path: req.originalUrl,
      });
      res.status(403).json({
        error: 'Acesso negado: perfil sem permissão para esta operação clínica/administrativa.',
        code: 'FORBIDDEN',
      });
      return;
    }
    next();
  };
}
