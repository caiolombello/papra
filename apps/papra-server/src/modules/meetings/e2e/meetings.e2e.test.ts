import type { MeetingForApi } from '../meetings.types';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Org 1' }],
    organizationMembers: [{ organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER }],
  });

  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }));

  return { db, app };
}

describe('meetings e2e', () => {
  test('can create and retrieve a meeting with ordered chunks', async () => {
    const { app } = await setupApp();

    const createResponse = await app.request(
      `/api/organizations/${ORG_ID}/meetings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Weekly architecture sync',
          sourceName: 'meeting-1.flac',
          language: 'pt',
          context: 'tecnologia',
          summary: 'Discussao sobre MCP e LangChain',
          chunks: [
            { speaker: 'Caio', startedAtMs: 0, endedAtMs: 3200, content: 'Vamos usar MCP e OpenAI.' },
            { speaker: 'Time', startedAtMs: 3200, endedAtMs: 7200, content: 'Tambem precisamos integrar com LangChain e AWS.' },
          ],
        }),
      },
      { loggedInUserId: USER_ID },
    );

    expect(createResponse.status).toBe(200);

    const { meeting } = await createResponse.json() as { meeting: MeetingForApi };

    expect(meeting).toMatchObject({
      organizationId: ORG_ID,
      title: 'Weekly architecture sync',
      sourceName: 'meeting-1.flac',
      language: 'pt',
      context: 'tecnologia',
      summary: 'Discussao sobre MCP e LangChain',
    });

    const getResponse = await app.request(
      `/api/organizations/${ORG_ID}/meetings/${meeting.id}`,
      { method: 'GET' },
      { loggedInUserId: USER_ID },
    );

    expect(getResponse.status).toBe(200);

    const { meeting: fullMeeting } = await getResponse.json() as { meeting: MeetingForApi };

    expect(fullMeeting.chunks).toHaveLength(2);
    expect(fullMeeting.chunks?.map(chunk => chunk.chunkIndex)).toEqual([0, 1]);
    expect(fullMeeting.chunks?.map(chunk => chunk.speaker)).toEqual(['Caio', 'Time']);
  });

  test('can list and search meetings by transcript chunk content', async () => {
    const { app } = await setupApp();

    await app.request(
      `/api/organizations/${ORG_ID}/meetings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'DevOps review',
          context: 'tecnologia',
          chunks: [
            { speaker: 'Caio', content: 'Vamos revisar Kubernetes, LangChain e AWS.' },
          ],
        }),
      },
      { loggedInUserId: USER_ID },
    );

    const listResponse = await app.request(
      `/api/organizations/${ORG_ID}/meetings?pageIndex=0&pageSize=10`,
      { method: 'GET' },
      { loggedInUserId: USER_ID },
    );

    expect(listResponse.status).toBe(200);

    const { meetings, meetingsCount } = await listResponse.json() as { meetings: MeetingForApi[]; meetingsCount: number };

    expect(meetingsCount).toBe(1);
    expect(meetings[0]).toMatchObject({ title: 'DevOps review' });

    const searchResponse = await app.request(
      `/api/organizations/${ORG_ID}/meetings/search?searchQuery=LangChain`,
      { method: 'GET' },
      { loggedInUserId: USER_ID },
    );

    expect(searchResponse.status).toBe(200);

    const { meetings: searchMeetings, totalCount } = await searchResponse.json() as { meetings: MeetingForApi[]; totalCount: number };

    expect(totalCount).toBe(1);
    expect(searchMeetings[0]).toMatchObject({ title: 'DevOps review', context: 'tecnologia' });
    expect(searchMeetings[0]?.matches).toHaveLength(1);
    expect(searchMeetings[0]?.matches?.[0]).toMatchObject({
      speaker: 'Caio',
      content: 'Vamos revisar Kubernetes, LangChain e AWS.',
    });
    expect(searchMeetings[0]?.matches?.[0]?.snippet).toContain('LangChain');
  });

  test('can update and delete a meeting', async () => {
    const { app } = await setupApp();

    const createResponse = await app.request(
      `/api/organizations/${ORG_ID}/meetings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Meeting to update',
          chunks: [
            { speaker: 'Caio', content: 'Texto inicial' },
          ],
        }),
      },
      { loggedInUserId: USER_ID },
    );

    expect(createResponse.status).toBe(200);
    const { meeting } = await createResponse.json() as { meeting: MeetingForApi };

    const updateResponse = await app.request(
      `/api/organizations/${ORG_ID}/meetings/${meeting.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: 'Resumo atualizado',
          context: 'geral',
        }),
      },
      { loggedInUserId: USER_ID },
    );

    expect(updateResponse.status).toBe(200);
    const { meeting: updatedMeeting } = await updateResponse.json() as { meeting: MeetingForApi };
    expect(updatedMeeting).toMatchObject({
      id: meeting.id,
      summary: 'Resumo atualizado',
      context: 'geral',
    });

    const deleteResponse = await app.request(
      `/api/organizations/${ORG_ID}/meetings/${meeting.id}`,
      { method: 'DELETE' },
      { loggedInUserId: USER_ID },
    );

    expect(deleteResponse.status).toBe(204);

    const getDeletedResponse = await app.request(
      `/api/organizations/${ORG_ID}/meetings/${meeting.id}`,
      { method: 'GET' },
      { loggedInUserId: USER_ID },
    );

    expect(getDeletedResponse.status).toBe(404);
  });

  test('can ingest the same meeting source twice without duplicating records', async () => {
    const { app } = await setupApp();

    const firstIngestResponse = await app.request(
      `/api/organizations/${ORG_ID}/meetings/ingest`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Pipeline ingestion',
          sourceStorageKey: 'uploads/2026-03-29/meeting-1.flac',
          sourceName: 'meeting-1.flac',
          transcriptStorageKey: 'transcripts/meeting-1/transcript.txt',
          chunks: [
            { speaker: 'Caio', content: 'Texto original do chunk.' },
          ],
        }),
      },
      { loggedInUserId: USER_ID },
    );

    expect(firstIngestResponse.status).toBe(200);
    const firstPayload = await firstIngestResponse.json() as { mode: string; meeting: MeetingForApi };
    expect(firstPayload.mode).toBe('created');

    const secondIngestResponse = await app.request(
      `/api/organizations/${ORG_ID}/meetings/ingest`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Pipeline ingestion refined',
          sourceStorageKey: 'uploads/2026-03-29/meeting-1.flac',
          sourceName: 'meeting-1.flac',
          transcriptStorageKey: 'transcripts/meeting-1/transcript-refined.txt',
          summary: 'Resumo refinado',
          chunks: [
            { speaker: 'Caio', content: 'Chunk atualizado.' },
            { speaker: 'Time', content: 'Outro chunk atualizado.' },
          ],
        }),
      },
      { loggedInUserId: USER_ID },
    );

    expect(secondIngestResponse.status).toBe(200);
    const secondPayload = await secondIngestResponse.json() as { mode: string; meeting: MeetingForApi };
    expect(secondPayload.mode).toBe('updated');
    expect(secondPayload.meeting.id).toBe(firstPayload.meeting.id);
    expect(secondPayload.meeting.summary).toBe('Resumo refinado');

    const listResponse = await app.request(
      `/api/organizations/${ORG_ID}/meetings?pageIndex=0&pageSize=10`,
      { method: 'GET' },
      { loggedInUserId: USER_ID },
    );
    const { meetingsCount } = await listResponse.json() as { meetingsCount: number };
    expect(meetingsCount).toBe(1);

    const getResponse = await app.request(
      `/api/organizations/${ORG_ID}/meetings/${firstPayload.meeting.id}`,
      { method: 'GET' },
      { loggedInUserId: USER_ID },
    );
    const { meeting } = await getResponse.json() as { meeting: MeetingForApi };
    expect(meeting.chunks).toHaveLength(2);
    expect(meeting.chunks?.[0]?.content).toBe('Chunk atualizado.');
  });
});
