import { environment } from '../../../environments/environment';

export function isLocalFirst(): boolean {
  return environment.dataMode === 'local';
}
