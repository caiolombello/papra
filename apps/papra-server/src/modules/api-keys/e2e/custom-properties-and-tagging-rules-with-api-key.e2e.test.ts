import type { CustomPropertyDefinition } from '../../custom-properties/custom-properties.types';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';

type ApiTaggingRule = {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  conditions: { field: string; operator: string; value: string }[];
  actions: { tagId: string }[];
};

async function createApiKey({
  app,
  permissions,
}: {
  app: ReturnType<typeof createServer>['app'];
  permissions: string[];
}) {
  const response = await app.request(
    '/api/api-keys',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test API Key',
        permissions,
      }),
    },
    { loggedInUserId: USER_ID },
  );

  expect(response.status).toBe(200);

  return (await response.json() as { token: string }).token;
}

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Org 1' }],
    organizationMembers: [{ organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER }],
    tags: [{ id: 'tag_111111111111111111111111', name: 'Invoices', normalizedName: 'invoices', color: '#000000', organizationId: ORG_ID }],
  });

  const { app } = createServer(createTestServerDependencies({
    db,
    config: overrideConfig({ env: 'test' }),
  }));

  return { app };
}

describe('api-key e2e for custom properties and tagging rules', () => {
  test('one can manage custom property definitions with an api key', async () => {
    const { app } = await setupApp();
    const token = await createApiKey({
      app,
      permissions: ['organizations:read', 'organizations:update'],
    });

    const createResponse = await app.request(`/api/organizations/${ORG_ID}/custom-properties`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Invoice Number', type: 'text' }),
    });

    expect(createResponse.status).toBe(200);
    const { propertyDefinition } = await createResponse.json() as { propertyDefinition: CustomPropertyDefinition };

    expect(propertyDefinition).toMatchObject({
      organizationId: ORG_ID,
      name: 'Invoice Number',
      key: 'invoicenumber',
      type: 'text',
    });

    const listResponse = await app.request(`/api/organizations/${ORG_ID}/custom-properties`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(listResponse.status).toBe(200);
    const { propertyDefinitions } = await listResponse.json() as { propertyDefinitions: CustomPropertyDefinition[] };

    expect(propertyDefinitions).toHaveLength(1);
    expect(propertyDefinitions[0]?.id).toBe(propertyDefinition.id);
  });

  test('one can manage tagging rules with an api key', async () => {
    const { app } = await setupApp();
    const token = await createApiKey({
      app,
      permissions: ['organizations:read', 'organizations:update'],
    });

    const createResponse = await app.request(`/api/organizations/${ORG_ID}/tagging-rules`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Invoices',
        description: 'Auto tag invoices',
        conditions: [{ field: 'content', operator: 'contains', value: 'Invoice' }],
        tagIds: ['tag_111111111111111111111111'],
      }),
    });

    expect(createResponse.status).toBe(204);

    const listResponse = await app.request(`/api/organizations/${ORG_ID}/tagging-rules`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(listResponse.status).toBe(200);
    const { taggingRules } = await listResponse.json() as { taggingRules: ApiTaggingRule[] };

    expect(taggingRules).toHaveLength(1);
    expect(taggingRules[0]).toMatchObject({
      organizationId: ORG_ID,
      name: 'Invoices',
      description: 'Auto tag invoices',
    });
    expect(taggingRules[0]?.conditions).toEqual([{ field: 'content', operator: 'contains', value: 'Invoice' }]);
    expect(taggingRules[0]?.actions).toEqual([{ tagId: 'tag_111111111111111111111111' }]);
  });
});
