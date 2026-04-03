import type { Database } from '../../app/database/database.types';
import type { EventServices } from '../../app/events/events.services';
import type { Config } from '../../config/config.types';
import { safely } from '@corentinth/chisels';
import { createCustomPropertiesRepository } from '../../custom-properties/custom-properties.repository';
import { createLogger } from '../../shared/logger/logger';

const logger = createLogger({ namespace: 'autofill-properties' });

export function registerAutofillPropertiesOnDocumentCreatedHandler({
  eventServices,
  db,
  config,
}: {
  eventServices: EventServices;
  db: Database;
  config: Config;
}) {
  const { isEnabled, openaiApiKey, model, maxContentLength } = config.autofill;

  if (!isEnabled || !openaiApiKey) {
    logger.debug('Autofill properties handler disabled');
    return;
  }

  eventServices.onEvent({
    eventName: 'document.created',
    handlerName: 'autofill-properties-on-document-created',
    async handler({ document }) {
      if (!document.content || document.content.trim().length === 0) {
        return;
      }

      const customPropertiesRepository = createCustomPropertiesRepository({ db });

      const { propertyDefinitions } = await customPropertiesRepository.getOrganizationPropertyDefinitions({
        organizationId: document.organizationId,
      });

      if (propertyDefinitions.length === 0) {
        return;
      }

      const fieldsDescription = propertyDefinitions.map(p =>
        `- "${p.key}" (tipo: ${p.type}): ${p.description || p.name}`,
      ).join('\n');

      const prompt = `Analise o seguinte documento e extraia os metadados solicitados.
Retorne APENAS um JSON válido com as chaves abaixo. Se não encontrar um valor, use null.
Para campos tipo "date", use formato ISO (YYYY-MM-DD).
Para campos tipo "number", retorne apenas o número (sem moeda).
Para campos tipo "boolean", retorne true ou false.

Campos:
${fieldsDescription}

Nome do arquivo: ${document.name}
${document.sourceEmail ? `Remetente do email: ${document.sourceEmail}` : ''}

Texto do documento:
${document.content.slice(0, maxContentLength)}`;

      const [response, fetchError] = await safely(async () => {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
            response_format: { type: 'json_object' },
          }),
        });

        if (!res.ok) {
          throw new Error(`OpenAI API error: ${res.status}`);
        }

        return res.json() as Promise<{ choices: { message: { content: string } }[] }>;
      });

      if (fetchError || !response) {
        logger.error({ error: fetchError, documentId: document.id }, 'Failed to call OpenAI for autofill');
        return;
      }

      const [parsed, parseError] = await safely(async () =>
        JSON.parse(response.choices[0]?.message?.content ?? '{}') as Record<string, unknown>,
      );

      if (parseError || !parsed) {
        logger.error({ error: parseError, documentId: document.id }, 'Failed to parse OpenAI response');
        return;
      }

      const extractedKeys = Object.keys(parsed).filter(k => parsed[k] != null);
      logger.info({ documentId: document.id, extractedKeys }, 'Autofill extracted properties');

      for (const propDef of propertyDefinitions) {
        const value = parsed[propDef.key];
        if (value == null) continue;

        const dbValue = toDbValue(propDef.type, value);
        if (!dbValue) continue;

        const [, setError] = await safely(async () =>
          customPropertiesRepository.setDocumentCustomPropertyValue({
            documentId: document.id,
            propertyDefinitionId: propDef.id,
            values: [dbValue],
          }),
        );

        if (setError) {
          logger.error({ error: setError, documentId: document.id, key: propDef.key }, 'Failed to set custom property');
        }
      }

      logger.info({ documentId: document.id, propsSet: extractedKeys.length }, 'Autofill completed');
    },
  });
}

function toDbValue(type: string, value: unknown): Record<string, unknown> | null {
  switch (type) {
    case 'text':
      return typeof value === 'string' ? { textValue: value } : null;
    case 'number':
      return typeof value === 'number' ? { numberValue: value }
        : typeof value === 'string' ? { numberValue: Number.parseFloat(value) || null } : null;
    case 'boolean':
      return typeof value === 'boolean' ? { booleanValue: value } : null;
    case 'date':
      if (typeof value === 'string') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : { dateValue: d };
      }
      return null;
    default:
      return null;
  }
}
