import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { organizationIdSchema } from '../organizations/organization.schemas';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { createError } from '../shared/errors/errors';
import { validateJsonBody, validateParams } from '../shared/validation/validation';
import { PDF_PASSWORD_RULE_ID_REGEX } from './pdf-password-rules.constants';
import { createPdfPasswordRulesRepository } from './pdf-password-rules.repository';

const pdfPasswordRuleIdSchema = z.string().regex(PDF_PASSWORD_RULE_ID_REGEX);

const createRuleBodySchema = z.object({
  name: z.string().trim().min(1).max(256),
  subjectPattern: z.string().trim().min(1).max(512),
  password: z.string().min(1).max(256),
  enabled: z.boolean().optional().default(true),
  priority: z.number().int().min(0).optional().default(0),
});

const updateRuleBodySchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  subjectPattern: z.string().trim().min(1).max(512).optional(),
  password: z.string().min(1).max(256).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
});

export function registerPdfPasswordRulesRoutes(context: RouteDefinitionContext) {
  setupListPdfPasswordRulesRoute(context);
  setupCreatePdfPasswordRuleRoute(context);
  setupUpdatePdfPasswordRuleRoute(context);
  setupDeletePdfPasswordRuleRoute(context);
}

function setupListPdfPasswordRulesRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/pdf-password-rules',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const pdfPasswordRulesRepository = createPdfPasswordRulesRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { rules } = await pdfPasswordRulesRepository.listOrganizationPdfPasswordRules({ organizationId });

      return context.json({ rules });
    },
  );
}

function setupCreatePdfPasswordRuleRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/pdf-password-rules',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateJsonBody(createRuleBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { name, subjectPattern, password, enabled, priority } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      const pdfPasswordRulesRepository = createPdfPasswordRulesRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { rule } = await pdfPasswordRulesRepository.createPdfPasswordRule({
        organizationId,
        name,
        subjectPattern,
        password,
        enabled: enabled ? 1 : 0,
        priority,
      });

      return context.json({ rule }, 201);
    },
  );
}

function setupUpdatePdfPasswordRuleRoute({ app, db }: RouteDefinitionContext) {
  app.put(
    '/api/organizations/:organizationId/pdf-password-rules/:ruleId',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      ruleId: pdfPasswordRuleIdSchema,
    })),
    validateJsonBody(updateRuleBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, ruleId } = context.req.valid('param');
      const { name, subjectPattern, password, enabled, priority } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      const pdfPasswordRulesRepository = createPdfPasswordRulesRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { rule } = await pdfPasswordRulesRepository.updatePdfPasswordRule({
        ruleId,
        organizationId,
        name,
        subjectPattern,
        password,
        enabled: enabled !== undefined ? (enabled ? 1 : 0) : undefined,
        priority,
      });

      if (!rule) {
        throw createError({
          message: 'PDF password rule not found',
          code: 'pdf-password-rules.not-found',
          statusCode: 404,
        });
      }

      return context.json({ rule });
    },
  );
}

function setupDeletePdfPasswordRuleRoute({ app, db }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/pdf-password-rules/:ruleId',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      ruleId: pdfPasswordRuleIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, ruleId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const pdfPasswordRulesRepository = createPdfPasswordRulesRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { rule } = await pdfPasswordRulesRepository.getPdfPasswordRuleById({ ruleId, organizationId });

      if (!rule) {
        throw createError({
          message: 'PDF password rule not found',
          code: 'pdf-password-rules.not-found',
          statusCode: 404,
        });
      }

      await pdfPasswordRulesRepository.deletePdfPasswordRule({ ruleId, organizationId });

      return context.body(null, 204);
    },
  );
}
