import type { ServerInstance } from '../server.types';
import { formatPublicErrorPayload, isCustomError } from '../../shared/errors/errors';
import { createLogger } from '../../shared/logger/logger';

const logger = createLogger({ namespace: 'middlewares:error' });

export function registerErrorMiddleware({ app }: { app: ServerInstance }) {
  app.onError((error, context) => {
    logger.error({ error }, error.message ?? 'An error occurred');

    if (isCustomError(error) && !error.isInternal) {
      return context.json(
        formatPublicErrorPayload(error),
        error.statusCode,
      );
    }

    if (error.message === 'Malformed JSON in request body') {
      // Log raw body for debugging malformed JSON issues
      try {
        const rawBody = await context.req.text().catch(() => '<unable to read>');
        const contentType = context.req.header('content-type') ?? '<none>';
        logger.error({ rawBody: rawBody.slice(0, 500), contentType, method: context.req.method, path: context.req.path }, 'Malformed JSON debug');
      } catch { /* ignore logging errors */ }

      return context.json(
        formatPublicErrorPayload({
          message: 'Invalid request body',
          code: 'server.invalid_request.malformed_json',
        }),
        400,
      );
    }

    return context.json(
      formatPublicErrorPayload({
        message: 'An error occurred',
        code: 'internal.error',
      }),
      500,
    );
  });

  app.notFound((context) => {
    return context.json(
      formatPublicErrorPayload({
        message: 'API route not found',
        code: 'api.not-found',
      }),
      404,
    );
  });
}
