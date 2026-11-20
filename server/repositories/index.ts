import type { ServerStore } from '../persistence';
import { createFileRepositories } from './fileRepositories';
import { createFirestoreRepositories } from './firestoreRepositories';
import type { RepositoryBundle } from './interfaces';

export * from './interfaces';
export * from './dateUtils';
export { filterAndPaginateOrders } from './fileRepositories';

export function createRepositories(store: ServerStore): RepositoryBundle {
  const driver = (process.env.STORAGE_DRIVER || 'file').trim().toLowerCase();
  if (driver === 'firestore') {
    return createFirestoreRepositories(store);
  }
  return createFileRepositories(store);
}
