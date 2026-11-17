import crypto from 'node:crypto';
import type { BloodNeed, Pet } from '../types.ts';
import { emitStructuredLog } from './observability.ts';
import { dispatchWebPushOrFcm, type StoredPushSubscription } from './push.ts';

export interface AlertQueueMessage {
  messageId: string;
  eventType: 'BLOOD_NEED_CREATED';
  need: BloodNeed;
  correlationId: string;
  attempt: number;
  maxAttempts: number;
  enqueuedAt: string;
  nextAttemptAt: number;
  lastError?: string;
}

export interface NotificationRecord {
  id: number;
  needId: number;
  tutorId: number;
  petId: number;
  canal: 'PUSH' | 'WHATSAPP' | 'EMAIL';
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'DLQ';
  tentativas: number;
  mensagem: string;
  correlationId: string;
  errorDetail?: string;
  sentAt: string;
}

export interface DlqEntry {
  messageId: string;
  needId: number;
  especie: string;
  correlationId: string;
  attempts: number;
  reason: string;
  failedAt: string;
  payload: AlertQueueMessage;
}

export interface QueueDependencies {
  getEligiblePetsForSpecies: (especie: 'CANINA' | 'FELINA') => Promise<Pet[]>;
  getTutorUserId: (tutorId: number) => Promise<number | undefined>;
  getSubscriptionsForTutor: (tutorId: number) => Promise<StoredPushSubscription[]>;
  saveNotifications: (records: Omit<NotificationRecord, 'id'>[]) => Promise<void>;
  updateNeedNotifiedCount: (needId: number, count: number) => Promise<void>;
}

const pendingQueue: AlertQueueMessage[] = [];
const dlqEntries: DlqEntry[] = [];
let processedCount = 0;
let isDraining = false;
let depsRef: QueueDependencies | null = null;

export function configureAlertWorker(deps: QueueDependencies): void {
  depsRef = deps;
}

async function publishToAzureServiceBusIfConfigured(msg: AlertQueueMessage): Promise<boolean> {
  const connStr = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
  const queueName = process.env.AZURE_SERVICE_BUS_QUEUE || 'doepet-blood-alerts';
  if (!connStr) return false;

  try {
    // Parse Endpoint & SAS key from Azure Service Bus connection string
    const endpointMatch = connStr.match(/Endpoint=sb:\/\/([^;/]+)/i);
    const keyNameMatch = connStr.match(/SharedAccessKeyName=([^;]+)/i);
    const keyMatch = connStr.match(/SharedAccessKey=([^;]+)/i);
    if (!endpointMatch || !keyNameMatch || !keyMatch) return false;

    const host = endpointMatch[1];
    const keyName = keyNameMatch[1];
    const key = keyMatch[1];
    const targetUri = `https://${host}/${queueName}/messages`;
    const expiry = Math.floor(Date.now() / 1000) + 300;
    const encodedUri = encodeURIComponent(targetUri);
    const sig = crypto
      .createHmac('sha256', key)
      .update(`${encodedUri}\n${expiry}`)
      .digest('base64');
    const sasToken = `SharedAccessSignature sr=${encodedUri}&sig=${encodeURIComponent(sig)}&se=${expiry}&skn=${encodeURIComponent(keyName)}`;

    const resp = await fetch(targetUri, {
      method: 'POST',
      headers: {
        Authorization: sasToken,
        'Content-Type': 'application/json',
        'BrokerProperties': JSON.stringify({
          MessageId: msg.messageId,
          CorrelationId: msg.correlationId,
        }),
      },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(3000),
    });

    if (resp.ok) {
      emitStructuredLog('INFO', 'messaging.service_bus_published', {
        queue: queueName,
        messageId: msg.messageId,
        needId: msg.need.id,
      });
      return true;
    }
    return false;
  } catch (err: any) {
    emitStructuredLog('WARN', 'messaging.service_bus_fallback_local', {
      error: err?.message,
      messageId: msg.messageId,
    });
    return false;
  }
}

export function enqueueBloodNeedAlert(need: BloodNeed, correlationId: string): AlertQueueMessage {
  const msg: AlertQueueMessage = {
    messageId: `msg-${crypto.randomUUID()}`,
    eventType: 'BLOOD_NEED_CREATED',
    need,
    correlationId,
    attempt: 0,
    maxAttempts: 3,
    enqueuedAt: new Date().toISOString(),
    nextAttemptAt: Date.now(),
  };

  pendingQueue.push(msg);

  emitStructuredLog('INFO', 'messaging.alert_enqueued', {
    messageId: msg.messageId,
    needId: need.id,
    especie: need.especie,
    urgencia: need.urgencia,
    broker: process.env.AZURE_SERVICE_BUS_CONNECTION_STRING ? 'azure_service_bus' : 'in_process_async_worker',
  });

  // Trigger non-blocking async processing on next event loop tick
  setTimeout(() => {
    void publishToAzureServiceBusIfConfigured(msg);
    void drainAlertQueue();
  }, 10);

  return msg;
}

export async function drainAlertQueue(): Promise<void> {
  if (isDraining || !depsRef) return;
  isDraining = true;

  try {
    const now = Date.now();
    const readyIdx = pendingQueue.findIndex((m) => m.nextAttemptAt <= now);
    if (readyIdx === -1) return;

    const [msg] = pendingQueue.splice(readyIdx, 1);
    msg.attempt += 1;

    try {
      // RN07: Match ONLY eligible pets of matching species
      const eligiblePets = await depsRef.getEligiblePetsForSpecies(msg.need.especie);
      const records: Omit<NotificationRecord, 'id'>[] = [];
      const seenTutors = new Set<number>();

      for (const pet of eligiblePets) {
        if (seenTutors.has(pet.tutorId)) continue;
        seenTutors.add(pet.tutorId);

        const mensagem = `DoePet ${msg.need.urgencia}: ${msg.need.institutionNome} precisa de ${msg.need.volumeSolicitadoMl}mL (${msg.need.tipoSanguineo}) para ${msg.need.especie}. Seu pet ${pet.nome} é compatível!`;
        const subscriptions = await depsRef.getSubscriptionsForTutor(pet.tutorId);
        let deliveredViaPush = false;

        for (const sub of subscriptions) {
          const result = await dispatchWebPushOrFcm(sub, {
            title: `🚨 DoePet Urgência ${msg.need.urgencia}`,
            body: mensagem,
            url: '/',
            tag: `need-${msg.need.id}`,
            needId: msg.need.id,
            correlationId: msg.correlationId,
          });
          if (result.delivered) deliveredViaPush = true;
        }

        // Also broadcast via SSE to tutor userId even if browser hasn't created PushManager endpoint yet
        const tutorUserId = await depsRef.getTutorUserId(pet.tutorId);
        if (tutorUserId && subscriptions.length === 0) {
          await dispatchWebPushOrFcm(
            {
              id: 0,
              userId: tutorUserId,
              tutorId: pet.tutorId,
              endpoint: 'sse://in-app-bridge',
              p256dh: '',
              auth: '',
              createdAt: new Date().toISOString(),
            },
            {
              title: `🚨 DoePet Urgência ${msg.need.urgencia}`,
              body: mensagem,
              url: '/',
              tag: `need-${msg.need.id}`,
              needId: msg.need.id,
              correlationId: msg.correlationId,
            }
          );
        }

        records.push({
          needId: msg.need.id,
          tutorId: pet.tutorId,
          petId: pet.id,
          canal: 'PUSH',
          status: deliveredViaPush ? 'DELIVERED' : 'SENT',
          tentativas: msg.attempt,
          mensagem,
          correlationId: msg.correlationId,
          sentAt: new Date().toISOString(),
        });
      }

      if (records.length > 0) {
        await depsRef.saveNotifications(records);
      }
      await depsRef.updateNeedNotifiedCount(msg.need.id, records.length);
      processedCount += 1;

      emitStructuredLog('INFO', 'messaging.alert_worker_processed', {
        messageId: msg.messageId,
        needId: msg.need.id,
        notifiedTutors: records.length,
        attempt: msg.attempt,
      });
    } catch (err: any) {
      const reason = err?.message || 'Worker dispatch failure';
      msg.lastError = reason;

      if (msg.attempt < msg.maxAttempts) {
        const backoffMs = Math.pow(2, msg.attempt) * 500;
        msg.nextAttemptAt = Date.now() + backoffMs;
        pendingQueue.push(msg);
        emitStructuredLog('WARN', 'messaging.alert_worker_retry_scheduled', {
          messageId: msg.messageId,
          attempt: msg.attempt,
          backoffMs,
          reason,
        });
        setTimeout(() => void drainAlertQueue(), backoffMs + 20);
      } else {
        dlqEntries.unshift({
          messageId: msg.messageId,
          needId: msg.need.id,
          especie: msg.need.especie,
          correlationId: msg.correlationId,
          attempts: msg.attempt,
          reason,
          failedAt: new Date().toISOString(),
          payload: msg,
        });
        emitStructuredLog('ERROR', 'messaging.alert_moved_to_dlq', {
          messageId: msg.messageId,
          needId: msg.need.id,
          attempts: msg.attempt,
          reason,
        });
      }
    }
  } finally {
    isDraining = false;
    if (pendingQueue.some((m) => m.nextAttemptAt <= Date.now())) {
      setTimeout(() => void drainAlertQueue(), 20);
    }
  }
}

export function getQueueMetrics(): {
  brokerMode: string;
  pendingCount: number;
  processedCount: number;
  dlqCount: number;
  dlqEntries: DlqEntry[];
} {
  return {
    brokerMode: process.env.AZURE_SERVICE_BUS_CONNECTION_STRING
      ? 'Azure Service Bus'
      : 'Async Event Queue + Retry/DLQ Worker',
    pendingCount: pendingQueue.length,
    processedCount,
    dlqCount: dlqEntries.length,
    dlqEntries: dlqEntries.slice(0, 20),
  };
}

export async function replayDlqMessages(): Promise<number> {
  const count = dlqEntries.length;
  while (dlqEntries.length > 0) {
    const entry = dlqEntries.pop()!;
    entry.payload.attempt = 0;
    entry.payload.nextAttemptAt = Date.now();
    pendingQueue.push(entry.payload);
  }
  if (count > 0) {
    await drainAlertQueue();
  }
  return count;
}
