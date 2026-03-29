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

describe('search e2e', () => {
  test('can search documents and meetings together', async () => {
    const { app } = await setupApp();

    const response = await app.request(
      `/api/organizations/${ORG_ID}/search?searchQuery=LangChain&scope=all`,
      { method: 'GET' },
      { loggedInUserId: USER_ID },
    );

    expect(response.status).toBe(200);

    const body = await response.json() as {
      scope: string;
      documents: Array<{ name: string }>;
      documentsCount: number;
      meetings: Array<{ title: string; matches?: Array<{ snippet: string }> }>;
      meetingsCount: number;
      totalCount: number;
    };

    expect(body.scope).toBe('all');
    expect(body.documentsCount).toBe(1);
    expect(body.meetingsCount).toBe(1);
    expect(body.totalCount).toBe(2);
    expect(body.documents[0]?.name).toBe('Arquitetura MCP');
    expect(body.meetings[0]?.title).toBe('Weekly architecture sync');
    expect(body.meetings[0]?.matches?.[0]?.snippet).toContain('LangChain');
  });

  test('can restrict unified search to meetings only', async () => {
    const { app } = await setupApp();

    const response = await app.request(
      `/api/organizations/${ORG_ID}/search?searchQuery=LangChain&scope=meetings`,
      { method: 'GET' },
      { loggedInUserId: USER_ID },
    );

    expect(response.status).toBe(200);

    const body = await response.json() as {
      documents: unknown[];
      documentsCount: number;
      meetings: Array<{ title: string }>;
      meetingsCount: number;
      totalCount: number;
    };

    expect(body.documentsCount).toBe(0);
    expect(body.documents).toHaveLength(0);
    expect(body.meetingsCount).toBe(1);
    expect(body.meetings[0]?.title).toBe('Weekly architecture sync');
    expect(body.totalCount).toBe(1);
  });

  test('can find meetings by title through unified search', async () => {
    const { app } = await setupApp();

    const response = await app.request(
      `/api/organizations/${ORG_ID}/search?searchQuery=architecture&scope=meetings`,
      { method: 'GET' },
      { loggedInUserId: USER_ID },
    );

    expect(response.status).toBe(200);

    const body = await response.json() as {
      meetings: Array<{ title: string; matches?: Array<{ snippet: string }> }>;
      meetingsCount: number;
      totalCount: number;
    };

    expect(body.meetingsCount).toBe(1);
    expect(body.totalCount).toBe(1);
    expect(body.meetings[0]?.title).toBe('Weekly architecture sync');
    expect(body.meetings[0]?.matches?.[0]?.snippet).toBe('Weekly architecture sync');
  });
});
