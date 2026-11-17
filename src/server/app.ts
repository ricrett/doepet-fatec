import cookieParser from 'cookie-parser';
import express from 'express';
import type { Request, Response } from 'express';
import {
  configureAlertWorker,
  enqueueBloodNeedAlert,
  getQueueMetrics,
  replayDlqMessages,
} from './messaging.ts';
import {
  emitStructuredLog,
  getTelemetrySnapshot,
  getTraceContext,
  observabilityMiddleware,
} from './observability.ts';
import {
  dispatchWebPushOrFcm,
  getVapidKeys,
  registerSseClient,
} from './push.ts';
import {
  clearRefreshTokenCookie,
  getPublicJwks,
  REFRESH_COOKIE_NAME,
  requireAuth,
  requireRole,
  setRefreshTokenCookie,
  signAccessToken,
  verifyAccessToken,
  type AuthenticatedRequest,
} from './security.ts';
import {
  addInstitutionEmployee,
  addStockMovement,
  authenticateUser,
  confirmDonationScreening,
  createBloodNeed,
  deleteTutorPet,
  discardExpiredBag,
  exportTutorLgpdData,
  expressDonorInterest,
  getBootstrapData,
  getEligiblePetsForSpecies,
  getIdempotentResponse,
  getPersistenceEngineLabel,
  getPushSubscriptionsForTutor,
  getPushSubscriptionsForUser,
  getTutorUserId,
  getUserById,
  issueRefreshTokenRecord,
  recordPasswordResetRequest,
  redeemVoucherCode,
  registerClinicAccount,
  registerTutorAccount,
  registerTutorPet,
  removeInstitutionEmployee,
  revokeRefreshToken,
  rotateRefreshToken,
  saveAlertNotifications,
  saveIdempotentResponse,
  savePushSubscription,
  scheduleInterestAppointment,
  toAuthenticatedUser,
  updateInstitutionEmployee,
  updateNeedNotifiedCount,
} from './store.ts';

export function createApiApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.header('Origin');
    if (origin) {
      const allowed = process.env.CORS_ORIGIN;
      if (!allowed || allowed === '*' || allowed.split(',').map((s) => s.trim()).includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type,Authorization,X-Correlation-ID,Idempotency-Key,traceparent'
        );
      }
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(observabilityMiddleware);

  // Wire asynchronous Service Bus / Queue worker dependencies (DT-03)
  configureAlertWorker({
    getEligiblePetsForSpecies,
    getTutorUserId,
    getSubscriptionsForTutor: getPushSubscriptionsForTutor,
    saveNotifications: saveAlertNotifications,
    updateNeedNotifiedCount,
  });

  // ===========================================================================
  // HEALTH & WELL-KNOWN JWKS
  // ===========================================================================
  app.get('/api/v1/health', (_req: Request, res: Response) => {
    const queue = getQueueMetrics();
    res.json({
      status: 'healthy',
      service: 'doepet-api',
      persistence: getPersistenceEngineLabel(),
      auth: 'OAuth2 / JWT RS256 (15m) + HttpOnly Refresh Cookie',
      messaging: queue.brokerMode,
      queuePending: queue.pendingCount,
      queueProcessed: queue.processedCount,
      queueDlq: queue.dlqCount,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/auth/jwks.json', (_req: Request, res: Response) => {
    res.json(getPublicJwks());
  });

  // ===========================================================================
  // DT-04: AUTHENTICATION (RS256 JWT 15m + HttpOnly Refresh Token Cookie)
  // ===========================================================================
  app.post('/api/v1/auth/login', async (req: Request, res: Response) => {
    const result = await authenticateUser({
      identifier: req.body?.identifier,
      password: req.body?.password,
      demoRole: req.body?.demoRole,
      socialProvider: req.body?.socialProvider,
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const { user } = result;
    const { token, expiresIn } = signAccessToken({
      sub: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role,
      documento: user.documento,
      institutionId: user.institutionId,
      tutorId: user.tutorId,
    });

    const { rawToken } = await issueRefreshTokenRecord(user.id);
    setRefreshTokenCookie(res, rawToken);

    res.json({
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn,
      user: toAuthenticatedUser(user),
    });
  });

  app.post('/api/v1/auth/register/tutor', async (req: Request, res: Response) => {
    const result = await registerTutorAccount({
      tutor: req.body?.tutor || {},
      email: req.body?.email,
      password: req.body?.password,
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const { user, tutor } = result;
    const { token, expiresIn } = signAccessToken({
      sub: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role,
      documento: user.documento,
      tutorId: tutor.id,
    });

    const { rawToken } = await issueRefreshTokenRecord(user.id);
    setRefreshTokenCookie(res, rawToken);

    res.status(201).json({
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn,
      user: toAuthenticatedUser(user),
      tutor,
    });
  });

  app.post('/api/v1/auth/register/clinic', async (req: Request, res: Response) => {
    const result = await registerClinicAccount({
      clinic: req.body?.clinic || {},
      password: req.body?.password,
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const { user, institution } = result;
    const { token, expiresIn } = signAccessToken({
      sub: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role,
      documento: user.documento,
      institutionId: institution.id,
    });

    const { rawToken } = await issueRefreshTokenRecord(user.id);
    setRefreshTokenCookie(res, rawToken);

    res.status(201).json({
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn,
      user: toAuthenticatedUser(user),
      institution,
    });
  });

  app.get('/api/v1/auth/session', async (req: Request, res: Response) => {
    const cookieToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!cookieToken) {
      res.json({ authenticated: false, user: null });
      return;
    }

    const rotated = await rotateRefreshToken(cookieToken);
    if ('error' in rotated) {
      clearRefreshTokenCookie(res);
      res.json({ authenticated: false, user: null });
      return;
    }

    const { user, newRawToken } = rotated;
    setRefreshTokenCookie(res, newRawToken);

    const { token, expiresIn } = signAccessToken({
      sub: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role,
      documento: user.documento,
      institutionId: user.institutionId,
      tutorId: user.tutorId,
    });

    res.json({
      authenticated: true,
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn,
      user: toAuthenticatedUser(user),
    });
  });

  app.post('/api/v1/auth/refresh', async (req: Request, res: Response) => {
    const cookieToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!cookieToken) {
      res.status(401).json({ error: 'Sessão não encontrada.', code: 'NO_REFRESH_COOKIE' });
      return;
    }

    const rotated = await rotateRefreshToken(cookieToken);
    if ('error' in rotated) {
      clearRefreshTokenCookie(res);
      res.status(rotated.status).json({ error: rotated.error });
      return;
    }

    const { user, newRawToken } = rotated;
    setRefreshTokenCookie(res, newRawToken);

    const { token, expiresIn } = signAccessToken({
      sub: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role,
      documento: user.documento,
      institutionId: user.institutionId,
      tutorId: user.tutorId,
    });

    res.json({
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn,
      user: toAuthenticatedUser(user),
    });
  });

  app.post('/api/v1/auth/logout', async (req: Request, res: Response) => {
    const cookieToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    await revokeRefreshToken(cookieToken);
    clearRefreshTokenCookie(res);
    res.json({ success: true });
  });

  app.get('/api/v1/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = await getUserById(req.auth!.sub);
    if (!user) {
      res.status(404).json({ error: 'Usuário não localizado.' });
      return;
    }
    res.json({ user: toAuthenticatedUser(user), claims: req.auth });
  });

  app.post('/api/v1/auth/forgot-password', async (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    await recordPasswordResetRequest(email);
    res.json({
      success: true,
      message: 'Se o e-mail estiver cadastrado, as instruções de redefinição foram enviadas.',
    });
  });

  // ===========================================================================
  // BOOTSTRAP INITIAL STATE (ROLE-ISOLATED)
  // ===========================================================================
  app.get('/api/v1/bootstrap', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const data = await getBootstrapData(req.auth!);
    res.json(data);
  });

  // ===========================================================================
  // INSTITUTION OPERATIONS (RN03, RN04, RN05, RN08, RN09, RN13, RN15, RN19, RN20)
  // ===========================================================================
  app.post(
    '/api/v1/inventory/movements',
    requireAuth,
    requireRole('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE'),
    async (req: AuthenticatedRequest, res: Response) => {
      const institutionId = req.auth!.institutionId || 1;
      const result = await addStockMovement({
        actorId: req.auth!.sub,
        actorRole: req.auth!.role,
        actorName: req.auth!.nome,
        institutionId,
        inventoryId: Number(req.body?.inventoryId),
        tipo: req.body?.tipo,
        delta: Number(req.body?.delta),
        motivo: String(req.body?.motivo || ''),
        dataColeta: req.body?.dataColeta,
        targetBagId: req.body?.targetBagId ? Number(req.body.targetBagId) : undefined,
      });

      if (!result.success) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json(result);
    }
  );

  app.post(
    '/api/v1/blood-bags/:id/discard',
    requireAuth,
    requireRole('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE'),
    async (req: AuthenticatedRequest, res: Response) => {
      const institutionId = req.auth!.institutionId || 1;
      const result = await discardExpiredBag({
        actorId: req.auth!.sub,
        actorRole: req.auth!.role,
        actorName: req.auth!.nome,
        institutionId,
        bagId: Number(req.params.id),
      });

      if (!result.success) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.json(result);
    }
  );

  app.post(
    '/api/v1/needs',
    requireAuth,
    requireRole('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE'),
    async (req: AuthenticatedRequest, res: Response) => {
      const institutionId = req.auth!.institutionId || 1;
      const result = await createBloodNeed({
        actorId: req.auth!.sub,
        actorRole: req.auth!.role,
        institutionId,
        especie: req.body?.especie,
        tipoSanguineo: String(req.body?.tipoSanguineo || ''),
        volumeSolicitadoMl: Number(req.body?.volumeSolicitadoMl),
        urgencia: req.body?.urgencia || 'ALTA',
        descricao: String(req.body?.descricao || ''),
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      // DT-03: Offload notifications to asynchronous queue + retry/DLQ worker
      const { correlationId } = getTraceContext();
      const queuedMsg = enqueueBloodNeedAlert(result.need, correlationId);

      res.status(201).json({
        need: result.need,
        asyncDispatch: {
          messageId: queuedMsg.messageId,
          status: 'QUEUED',
        },
      });
    }
  );

  app.post(
    '/api/v1/appointments/schedule',
    requireAuth,
    requireRole('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE'),
    async (req: AuthenticatedRequest, res: Response) => {
      const institutionId = req.auth!.institutionId || 1;
      const result = await scheduleInterestAppointment({
        actorId: req.auth!.sub,
        actorRole: req.auth!.role,
        institutionId,
        interestId: Number(req.body?.interestId),
        slotHora: String(req.body?.slotHora || 'Amanhã às 10:00'),
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json(result);
    }
  );

  app.post(
    '/api/v1/appointments/:id/confirm-donation',
    requireAuth,
    requireRole('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE'),
    async (req: AuthenticatedRequest, res: Response) => {
      const idempotencyKey = req.header('Idempotency-Key');
      const endpoint = `/api/v1/appointments/${req.params.id}/confirm-donation`;
      const cached = await getIdempotentResponse(idempotencyKey, endpoint);
      if (cached) {
        res.status(cached.statusCode).json(cached.body);
        return;
      }

      const institutionId = req.auth!.institutionId || 1;
      const result = await confirmDonationScreening({
        actorId: req.auth!.sub,
        actorRole: req.auth!.role,
        actorName: req.auth!.nome,
        institutionId,
        appointmentId: Number(req.params.id),
        veterinarioCrmv: String(req.body?.veterinarioCrmv || ''),
        volumeColetado: Number(req.body?.volumeColetado),
        hematocrito: Number(req.body?.hematocrito),
        pesoAferido: Number(req.body?.pesoAferido),
        tipoConfirmado: String(req.body?.tipoConfirmado || 'DEA 1.1 Negativo'),
      });

      if (!result.success) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      await saveIdempotentResponse(idempotencyKey, endpoint, 200, result);
      res.json(result);
    }
  );

  app.post(
    '/api/v1/vouchers/redeem',
    requireAuth,
    requireRole('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE'),
    async (req: AuthenticatedRequest, res: Response) => {
      const idempotencyKey = req.header('Idempotency-Key');
      const endpoint = '/api/v1/vouchers/redeem';
      const cached = await getIdempotentResponse(idempotencyKey, endpoint);
      if (cached) {
        res.status(cached.statusCode).json(cached.body);
        return;
      }

      const institutionId = req.auth!.institutionId || 1;
      const result = await redeemVoucherCode({
        actorId: req.auth!.sub,
        actorRole: req.auth!.role,
        institutionId,
        codigo: String(req.body?.codigo || ''),
      });

      if (result.success) {
        await saveIdempotentResponse(idempotencyKey, endpoint, result.status, result);
      }

      res.status(result.status).json(result);
    }
  );

  app.post(
    '/api/v1/employees',
    requireAuth,
    requireRole('INSTITUTION_ADMIN'),
    async (req: AuthenticatedRequest, res: Response) => {
      const institutionId = req.auth!.institutionId || 1;
      const employee = await addInstitutionEmployee({
        actorId: req.auth!.sub,
        actorRole: req.auth!.role,
        institutionId,
        nome: String(req.body?.nome || ''),
        cpf: String(req.body?.cpf || ''),
        cargo: String(req.body?.cargo || ''),
        crmv: req.body?.crmv ? String(req.body.crmv) : undefined,
        email: req.body?.email ? String(req.body.email) : undefined,
      });
      res.status(201).json({ employee });
    }
  );

  app.patch(
    '/api/v1/employees/:id',
    requireAuth,
    requireRole('INSTITUTION_ADMIN'),
    async (req: AuthenticatedRequest, res: Response) => {
      const institutionId = req.auth!.institutionId || 1;
      const result = await updateInstitutionEmployee({
        actorId: req.auth!.sub,
        actorRole: req.auth!.role,
        institutionId,
        employeeId: Number(req.params.id),
        data: req.body || {},
      });

      if (!result.success) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result);
    }
  );

  app.delete(
    '/api/v1/employees/:id',
    requireAuth,
    requireRole('INSTITUTION_ADMIN'),
    async (req: AuthenticatedRequest, res: Response) => {
      const institutionId = req.auth!.institutionId || 1;
      const result = await removeInstitutionEmployee({
        actorId: req.auth!.sub,
        actorRole: req.auth!.role,
        institutionId,
        employeeId: Number(req.params.id),
      });

      if (!result.success) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result);
    }
  );

  // ===========================================================================
  // TUTOR OPERATIONS (US03, US07, LGPD ART. 18)
  // ===========================================================================
  app.post(
    '/api/v1/pets',
    requireAuth,
    requireRole('TUTOR'),
    async (req: AuthenticatedRequest, res: Response) => {
      const tutorId = req.auth!.tutorId || 1;
      const pet = await registerTutorPet({
        actorId: req.auth!.sub,
        tutorId,
        petData: req.body,
      });
      res.status(201).json({ pet });
    }
  );

  app.delete(
    '/api/v1/pets/:id',
    requireAuth,
    requireRole('TUTOR'),
    async (req: AuthenticatedRequest, res: Response) => {
      const tutorId = req.auth!.tutorId || 1;
      const result = await deleteTutorPet({
        actorId: req.auth!.sub,
        tutorId,
        petId: Number(req.params.id),
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ success: true, deleted: result.deleted });
    }
  );

  app.post(
    '/api/v1/needs/:id/interest',
    requireAuth,
    requireRole('TUTOR'),
    async (req: AuthenticatedRequest, res: Response) => {
      const tutorId = req.auth!.tutorId || 1;
      const result = await expressDonorInterest({
        actorId: req.auth!.sub,
        tutorId,
        needId: Number(req.params.id),
        petId: Number(req.body?.petId),
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json(result);
    }
  );

  app.get(
    '/api/v1/tutor/export-lgpd',
    requireAuth,
    requireRole('TUTOR'),
    async (req: AuthenticatedRequest, res: Response) => {
      const tutorId = req.auth!.tutorId || 1;
      const payload = await exportTutorLgpdData(tutorId, req.auth!.email);
      if (!payload) {
        res.status(404).json({ error: 'Titular não encontrado.' });
        return;
      }
      res.json(payload);
    }
  );

  // ===========================================================================
  // DT-06: WEB PUSH (VAPID) + SSE STREAM
  // ===========================================================================
  app.get('/api/v1/push/vapid-public-key', (_req: Request, res: Response) => {
    const { publicKey, source } = getVapidKeys();
    res.json({ publicKey, source });
  });

  app.post('/api/v1/push/subscribe', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      res.status(400).json({ error: 'PushSubscription inválida.' });
      return;
    }

    const saved = await savePushSubscription({
      userId: req.auth!.sub,
      tutorId: req.auth!.tutorId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: req.header('user-agent')?.slice(0, 250),
    });

    res.status(201).json({ subscription: saved });
  });

  app.post('/api/v1/push/test', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const subs = await getPushSubscriptionsForUser(req.auth!.sub);
    const { correlationId } = getTraceContext();
    const payload = {
      title: '🐾 DoePet — Push Verificado',
      body: 'Notificações em tempo real ativadas com VAPID & Service Worker.',
      url: '/',
      tag: 'doepet-push-test',
      correlationId,
    };

    if (subs.length === 0) {
      await dispatchWebPushOrFcm(
        {
          id: 0,
          userId: req.auth!.sub,
          tutorId: req.auth!.tutorId,
          endpoint: 'sse://in-app-bridge',
          p256dh: '',
          auth: '',
          createdAt: new Date().toISOString(),
        },
        payload
      );
    } else {
      for (const s of subs) {
        await dispatchWebPushOrFcm(s, payload);
      }
    }

    res.json({ dispatched: true, subscriptionCount: subs.length });
  });

  app.get('/api/v1/notifications/stream', (req: Request, res: Response) => {
    const token = String(req.query.token || '');
    const claims = verifyAccessToken(token);
    if (!claims) {
      res.status(401).json({ error: 'Token inválido para stream SSE.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ userId: claims.sub })}\n\n`);

    registerSseClient(claims.sub, res);
  });

  // ===========================================================================
  // DT-03 & DT-05: OBSERVABILITY & QUEUE DIAGNOSTICS (PROTECTED)
  // ===========================================================================
  app.get('/api/v1/observability/telemetry', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    res.json(getTelemetrySnapshot());
  });

  app.get('/api/v1/messaging/queue', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    res.json(getQueueMetrics());
  });

  app.post(
    '/api/v1/messaging/retry-dlq',
    requireAuth,
    requireRole('INSTITUTION_ADMIN', 'PLATFORM_ADMIN'),
    async (_req: AuthenticatedRequest, res: Response) => {
      const replayed = await replayDlqMessages();
      emitStructuredLog('INFO', 'messaging.dlq_replayed', { replayed });
      res.json({ replayed });
    }
  );

  // Clean JSON 404 for unknown /api/* paths
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint REST não encontrado.' });
  });

  return app;
}
