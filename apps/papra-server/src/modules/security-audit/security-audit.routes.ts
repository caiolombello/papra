import type { RouteDefinitionContext } from '../app/server.types';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { organizationIdSchema } from '../organizations/organization.schemas';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { validateParams, validateQuery } from '../shared/validation/validation';
import { securityAuditLogTable } from './security-audit.table';

export function registerSecurityAuditRoutes({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/audit-log',
    requireAuthentication(),
    validateParams(z.object({ organizationId: organizationIdSchema })),
    validateQuery(z.object({
      pageIndex: z.coerce.number().int().min(0).default(0),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
      action: z.string().optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { pageIndex, pageSize, action } = context.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const conditions = [eq(securityAuditLogTable.organizationId, organizationId)];
      if (action) {
        conditions.push(eq(securityAuditLogTable.action, action));
      }

      const [entries, countResult] = await Promise.all([
        db.select()
          .from(securityAuditLogTable)
          .where(sql`${sql.join(conditions, sql` AND `)}`)
          .orderBy(desc(securityAuditLogTable.createdAt))
          .limit(pageSize)
          .offset(pageIndex * pageSize),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(securityAuditLogTable)
          .where(sql`${sql.join(conditions, sql` AND `)}`),
      ]);

      return context.json({
        entries: entries.map(e => ({
          ...e,
          details: e.details ? JSON.parse(e.details) : null,
        })),
        totalCount: countResult[0]?.count ?? 0,
      });
    },
  );
}
