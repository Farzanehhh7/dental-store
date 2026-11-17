import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  Firestore,
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

function createFirestoreDb(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        ignoreUndefinedProperties: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreDb();
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isFirestorePermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code ?? '';
  const msg = (error as { message?: string }).message ?? '';
  return code === 'permission-denied' || msg.includes('Missing or insufficient permissions');
}

export function isFirestoreUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code ?? '';
  const msg = (error as { message?: string }).message ?? '';
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'cancelled' ||
    msg.includes('the client is offline') ||
    msg.includes('Could not reach Cloud Firestore backend') ||
    msg.includes('The operation could not be completed')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let inFlightProbe: Promise<boolean> | null = null;
let lastProbeTime = 0;
let lastProbeResult = false;

export async function testFirestoreConnection(force = false): Promise<boolean> {
  if (
    !firebaseConfig?.projectId ||
    firebaseConfig.projectId === 'remixed-project-id' ||
    !firebaseConfig?.firestoreDatabaseId
  ) {
    console.error('Please check your Firebase configuration.');
    return false;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  if (!force && lastProbeTime > 0 && Date.now() - lastProbeTime < 15000) {
    return lastProbeResult;
  }

  if (inFlightProbe) return inFlightProbe;

  inFlightProbe = (async () => {
    try {
      // Fast CORS REST reachability check (< 3s) before triggering SDK long-poll/10s offline timer
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 3000) : null;
      try {
        const probeUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/test/connection?key=${firebaseConfig.apiKey}`;
        await fetch(probeUrl, { method: 'GET', signal: ctrl?.signal });
      } finally {
        if (timer) clearTimeout(timer);
      }

      await getDocFromServer(doc(db, 'test', 'connection'));
      lastProbeResult = true;
      lastProbeTime = Date.now();
      return true;
    } catch (error) {
      if (isFirestoreUnavailableError(error) || (error instanceof DOMException && error.name === 'AbortError')) {
        lastProbeResult = false;
        lastProbeTime = Date.now();
        return false;
      }
      if (error instanceof TypeError) {
        // Network / fetch failure when browser cannot reach firestore.googleapis.com
        lastProbeResult = false;
        lastProbeTime = Date.now();
        return false;
      }
      // Permission-denied or NotFound still confirms backend IS reachable
      lastProbeResult = true;
      lastProbeTime = Date.now();
      return true;
    } finally {
      inFlightProbe = null;
    }
  })();

  return inFlightProbe;
}
