import { sql } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { generateDocumentId } from '../../documents/documents.models';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';

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
        name: 'Unified Search API Key',
        permissions,
      }),
    },
    { loggedInUserId: USER_ID },
  );

  expect(response.status).toBe(200);

  return (await response.json() as { token: string }).token;
}

async function setupApp() {
  const documentId = generateDocumentId();
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Org 1' }],
    organizationMembers: [{ organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER }],
    documents: [{
      id: documentId,
      organizationId: ORG_ID,
      createdBy: USER_ID,
      originalName: 'arquitetura.txt',
      originalSize: 128,
      originalStorageKey: 'org_1/originals/arquitetura.txt',
      originalSha256Hash: 'hash-arquitetura-1',
      name: 'Arquitetura MCP',
      mimeType: 'text/plain',
      content: 'Documento sobre MCP, OpenAI e LangChain.',
      isDeleted: false,
    }],
  });

  await db.run(sql`
    INSERT INTO documents_fts(document_id, organization_id, name, content)
    VALUES (${documentId}, ${ORG_ID}, ${'Arquitetura MCP'}, ${'Documento sobre MCP, OpenAI e LangChain.'})
  `);

  const { app } = createServer(createTestServerDependencies({
    db,
    config: overrideConfig({ env: 'test' }),
  }));

  await app.request(
    `/api/organizations/${ORG_ID}/meetings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Weekly architecture sync',
        context: 'tecnologia',
        chunks: [
          { speaker: 'Caio', content: 'Vamos usar MCP, OpenAI e LangChain na arquitetura.' },
        ],
      }),
    },
    { loggedInUserId: USER_ID },
  );

  return { app };
}

describe('unified search api key e2e', () => {
  test('one can search documents and meetings with an api key', async () => {
    const { app } = await setupApp();
    const token = await createApiKey({
      app,
      permissions: ['documents:read'],
    });

    const response = await app.request(`/api/organizations/${ORG_ID}/search?searchQuery=LangChain&scope=all`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);

    const body = await response.json() as {
      documentsCount: number;
      meetingsCount: number;
      totalCount: number;
      meetings: Array<{ matches?: Array<{ snippet: string }> }>;
    };

    expect(body.documentsCount).toBe(1);
    expect(body.meetingsCount).toBe(1);
    expect(body.totalCount).toBe(2);
    expect(body.meetings[0]?.matches?.[0]?.snippet).toContain('LangChain');
  });
});
