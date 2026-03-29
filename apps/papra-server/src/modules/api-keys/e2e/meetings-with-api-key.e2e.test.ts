import type { MeetingForApi } from '../../meetings/meetings.types';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
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
        name: 'Meetings API Key',
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
  });

  const { app } = createServer(createTestServerDependencies({
    db,
    config: overrideConfig({ env: 'test' }),
  }));

  return { app };
}

describe('meetings api key e2e', () => {
  test('one can create, list, get, and search meetings with an api key', async () => {
    const { app } = await setupApp();
    const token = await createApiKey({
      app,
      permissions: ['documents:create', 'documents:read'],
    });

    const createResponse = await app.request(`/api/organizations/${ORG_ID}/meetings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Meeting ingestion test',
        context: 'tecnologia',
        chunks: [
          { speaker: 'Caio', content: 'OpenAI, MCP e LangChain sao parte dessa stack.' },
        ],
      }),
    });

    expect(createResponse.status).toBe(200);

    const { meeting } = await createResponse.json() as { meeting: MeetingForApi };

    const listResponse = await app.request(`/api/organizations/${ORG_ID}/meetings`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(listResponse.status).toBe(200);
    const { meetings, meetingsCount } = await listResponse.json() as { meetings: MeetingForApi[]; meetingsCount: number };

    expect(meetingsCount).toBe(1);
    expect(meetings[0]?.id).toBe(meeting.id);

    const getResponse = await app.request(`/api/organizations/${ORG_ID}/meetings/${meeting.id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(getResponse.status).toBe(200);
    const { meeting: fullMeeting } = await getResponse.json() as { meeting: MeetingForApi };

    expect(fullMeeting.chunks).toHaveLength(1);
    expect(fullMeeting.chunks?.[0]?.speaker).toBe('Caio');

    const searchResponse = await app.request(`/api/organizations/${ORG_ID}/meetings/search?searchQuery=LangChain`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(searchResponse.status).toBe(200);
    const { meetings: searchedMeetings, totalCount } = await searchResponse.json() as { meetings: MeetingForApi[]; totalCount: number };

    expect(totalCount).toBe(1);
    expect(searchedMeetings[0]?.id).toBe(meeting.id);
    expect(searchedMeetings[0]?.matches?.[0]?.snippet).toContain('LangChain');

    const updateResponse = await app.request(`/api/organizations/${ORG_ID}/meetings/${meeting.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: 'Meeting summary updated through API key',
      }),
    });

    expect(updateResponse.status).toBe(401);

    const privilegedToken = await createApiKey({
      app,
      permissions: ['documents:create', 'documents:read', 'documents:update', 'documents:delete'],
    });

    const privilegedUpdateResponse = await app.request(`/api/organizations/${ORG_ID}/meetings/${meeting.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${privilegedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: 'Meeting summary updated through API key',
      }),
    });

    expect(privilegedUpdateResponse.status).toBe(200);

    const deleteResponse = await app.request(`/api/organizations/${ORG_ID}/meetings/${meeting.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${privilegedToken}`,
      },
    });

    expect(deleteResponse.status).toBe(204);
  });

  test('one can ingest and upsert meetings with an api key', async () => {
    const { app } = await setupApp();
    const token = await createApiKey({
      app,
      permissions: ['documents:create', 'documents:read'],
    });

    const firstResponse = await app.request(`/api/organizations/${ORG_ID}/meetings/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Meeting ingestion test',
        sourceStorageKey: 'uploads/2026-03-29/meeting-ingest.flac',
        chunks: [
          { speaker: 'Caio', content: 'Primeiro chunk.' },
        ],
      }),
    });

    expect(firstResponse.status).toBe(200);
    const firstPayload = await firstResponse.json() as { mode: string; meeting: MeetingForApi };
    expect(firstPayload.mode).toBe('created');

    const secondResponse = await app.request(`/api/organizations/${ORG_ID}/meetings/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Meeting ingestion test refined',
        sourceStorageKey: 'uploads/2026-03-29/meeting-ingest.flac',
        summary: 'Resumo final',
        chunks: [
          { speaker: 'Caio', content: 'Primeiro chunk atualizado.' },
          { speaker: 'Time', content: 'Segundo chunk atualizado.' },
        ],
      }),
    });

    expect(secondResponse.status).toBe(200);
    const secondPayload = await secondResponse.json() as { mode: string; meeting: MeetingForApi };
    expect(secondPayload.mode).toBe('updated');
    expect(secondPayload.meeting.id).toBe(firstPayload.meeting.id);
    expect(secondPayload.meeting.summary).toBe('Resumo final');
  });
});
