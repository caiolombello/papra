import { PluggyClient } from 'pluggy-sdk';

let clientInstance: PluggyClient | null = null;

export function getPluggyClient({ clientId, clientSecret }: { clientId: string; clientSecret: string }): PluggyClient {
  if (!clientInstance) {
    clientInstance = new PluggyClient({ clientId, clientSecret });
  }
  return clientInstance;
}
