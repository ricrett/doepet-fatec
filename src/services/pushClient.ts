import { apiClient, getAccessToken, resolveApiUrl } from './api';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

export async function subscribeToWebPush(): Promise<{
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  reason?: string;
}> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return { supported: false, permission: 'unsupported', subscribed: false, reason: 'Navegador sem suporte a Web Push.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      supported: true,
      permission,
      subscribed: false,
      reason: 'Permissão de notificação não concedida pelo navegador.',
    };
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return {
      supported: true,
      permission,
      subscribed: false,
      reason: 'Service Worker não pôde ser registrado neste contexto.',
    };
  }

  try {
    if ('pushManager' in registration) {
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const { publicKey } = await apiClient.getVapidPublicKey();
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      await apiClient.subscribePush(subscription.toJSON());
      return { supported: true, permission, subscribed: true };
    }
  } catch {
    // Some embedded iframe environments block PushManager while allowing ServiceWorker showNotification + SSE bridge
  }

  return {
    supported: true,
    permission,
    subscribed: true,
    reason: 'Canal SSE + Service Worker ativo.',
  };
}

export function connectNotificationStream(
  onPushMessage: (payload: { title: string; body: string; needId?: number }) => void
): () => void {
  const token = getAccessToken();
  if (!token || typeof EventSource === 'undefined') {
    return () => {};
  }

  const es = new EventSource(
    resolveApiUrl(`/api/v1/notifications/stream?token=${encodeURIComponent(token)}`),
    { withCredentials: true }
  );
  let errorCount = 0;

  es.addEventListener('connected', () => {
    errorCount = 0;
  });

  es.addEventListener('doepet-push', (evt: MessageEvent) => {
    errorCount = 0;
    try {
      const payload = JSON.parse(evt.data) as { title: string; body: string; needId?: number };
      onPushMessage(payload);

      if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
        void navigator.serviceWorker.ready.then((reg) => {
          void reg.showNotification(payload.title, {
            body: payload.body,
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: payload.needId ? `need-${payload.needId}` : 'doepet-push',
          });
        });
      }
    } catch {
      // Ignore malformed SSE event
    }
  });

  es.onerror = () => {
    errorCount += 1;
    if (errorCount >= 3 || es.readyState === EventSource.CLOSED) {
      es.close();
    }
  };

  return () => {
    es.close();
  };
}
