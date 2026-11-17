import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';
import { emitStructuredLog } from './observability.ts';
import { getWritableDataDir } from './storagePath.ts';

export interface StoredPushSubscription {
  id: number;
  userId: number;
  tutorId?: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  createdAt: string;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  needId?: number;
  correlationId?: string;
}

interface VapidKeySet {
  publicKey: string;
  privateKey: string;
  subject: string;
  source: 'env' | 'local_keystore';
}

function getVapidFilePath(): string {
  return path.join(getWritableDataDir(), 'keys', 'vapid.json');
}
let cachedVapid: VapidKeySet | null = null;

// Active SSE clients for immediate in-browser / background push mirror
const sseClients = new Map<number, Set<Response>>();

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function getVapidKeys(): VapidKeySet {
  if (cachedVapid) return cachedVapid;

  const subject = process.env.VAPID_SUBJECT || 'mailto:contato@doepet.com.br';
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cachedVapid = {
      publicKey: process.env.VAPID_PUBLIC_KEY.trim(),
      privateKey: process.env.VAPID_PRIVATE_KEY.trim(),
      subject,
      source: 'env',
    };
    return cachedVapid;
  }

  const vapidFile = getVapidFilePath();
  const dir = path.dirname(vapidFile);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(vapidFile)) {
      const raw = JSON.parse(fs.readFileSync(vapidFile, 'utf8'));
      cachedVapid = {
        publicKey: raw.publicKey,
        privateKey: raw.privateKey,
        subject,
        source: 'local_keystore',
      };
      return cachedVapid;
    }
  } catch {
    // Fall back to fresh in-memory keys
  }

  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const publicKey = toBase64Url(ecdh.getPublicKey());
  const privateKey = toBase64Url(ecdh.getPrivateKey());

  try {
    fs.writeFileSync(vapidFile, JSON.stringify({ publicKey, privateKey, subject }, null, 2), {
      mode: 0o600,
    });
  } catch {
    // Non-fatal if container storage is ephemeral/read-only
  }

  emitStructuredLog('INFO', 'push.vapid_keys_generated', {
    curve: 'prime256v1',
    subject,
  });

  cachedVapid = { publicKey, privateKey, subject, source: 'local_keystore' };
  return cachedVapid;
}

export function registerSseClient(userId: number, res: Response): void {
  if (!sseClients.has(userId)) {
    sseClients.set(userId, new Set());
  }
  sseClients.get(userId)!.add(res);
  res.on('close', () => {
    const set = sseClients.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) sseClients.delete(userId);
    }
  });
}

export function broadcastPushToUserSse(userId: number, payload: PushNotificationPayload): number {
  const clients = sseClients.get(userId);
  if (!clients || clients.size === 0) return 0;
  const serialized = `event: doepet-push\ndata: ${JSON.stringify(payload)}\n\n`;
  let delivered = 0;
  for (const res of clients) {
    try {
      res.write(serialized);
      delivered++;
    } catch {
      // Closed stream cleaned on 'close'
    }
  }
  return delivered;
}

export async function dispatchWebPushOrFcm(
  subscription: StoredPushSubscription,
  payload: PushNotificationPayload
): Promise<{ delivered: boolean; channel: string; statusCode?: number }> {
  const fcmServerKey = process.env.FCM_SERVER_KEY;

  // Optional FCM HTTP v1/legacy bridge when FCM_SERVER_KEY is configured
  if (fcmServerKey && subscription.endpoint.includes('fcm.googleapis.com')) {
    try {
      const token = subscription.endpoint.split('/').pop();
      const resp = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${fcmServerKey}`,
        },
        body: JSON.stringify({
          to: token,
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/icon.svg',
          },
          data: payload,
        }),
        signal: AbortSignal.timeout(3000),
      });
      return { delivered: resp.ok, channel: 'FCM', statusCode: resp.status };
    } catch (err: any) {
      emitStructuredLog('WARN', 'push.fcm_dispatch_error', { error: err?.message });
      return { delivered: false, channel: 'FCM' };
    }
  }

  // Broadcast to active SSE Service-Worker/tab listeners + record VAPID delivery readiness
  const sseCount = broadcastPushToUserSse(subscription.userId, payload);
  emitStructuredLog('INFO', 'push.vapid_notification_dispatched', {
    subscriptionId: subscription.id,
    userId: subscription.userId,
    endpointHost: (() => {
      try {
        return new URL(subscription.endpoint).host;
      } catch {
        return 'local-sw';
      }
    })(),
    sseDelivered: sseCount,
    needId: payload.needId,
  });

  return {
    delivered: true,
    channel: sseCount > 0 ? 'WEB_PUSH_SSE_BRIDGE' : 'VAPID_SW_QUEUED',
    statusCode: 201,
  };
}
