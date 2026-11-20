import type React from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  OperationType,
  db,
  handleFirestoreError,
  isFirestorePermissionError,
  isFirestoreUnavailableError,
} from './firebase';
import { mergeById } from '../context/storeHelpers';

export function handleListenerError(error: unknown, operationType: OperationType, path: string): void {
  if (isFirestoreUnavailableError(error) && !isFirestorePermissionError(error)) {
    console.warn(`Firestore listener temporarily unavailable (${path}):`, error);
    return;
  }
  handleFirestoreError(error, operationType, path);
}

export function mapAndMergeCollection<T extends { id: string }>(
  baseline: T[],
  docsList: T[],
  setter: React.Dispatch<React.SetStateAction<T[]>>,
  deletedSet?: Set<string>,
  sanitize?: (item: T) => T
): void {
  const cleanedLive = sanitize ? docsList.map(sanitize) : docsList;
  setter(mergeById(baseline, cleanedLive, deletedSet));
}

export async function fetchPublicCollectionOnce<T extends { id: string }>(
  colName: string,
  setter: React.Dispatch<React.SetStateAction<T[]>>,
  baseline: T[],
  deletedSet: Set<string>,
  isCancelled: () => boolean,
  sanitize?: (item: T) => T
): Promise<void> {
  try {
    const snapshot = await getDocs(collection(db, colName));
    if (isCancelled()) return;
    const liveDocs = snapshot.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
    mapAndMergeCollection(baseline, liveDocs, setter, deletedSet, sanitize);
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      console.warn(`Guest list skip for ${colName}`);
    }
  }
}

export function bindPublicCollection<T extends { id: string }>(
  colName: string,
  setter: React.Dispatch<React.SetStateAction<T[]>>,
  baseline: T[],
  deletedSet: Set<string>,
  sanitize?: (item: T) => T
): () => void {
  return onSnapshot(
    collection(db, colName),
    (snapshot) => {
      const liveDocs = snapshot.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
      mapAndMergeCollection(baseline, liveDocs, setter, deletedSet, sanitize);
    },
    (error) => handleListenerError(error, OperationType.LIST, colName)
  );
}

export function bindScopedCollection<T extends { id: string }>(
  colName: string,
  setter: React.Dispatch<React.SetStateAction<T[]>>,
  isAdmin: boolean,
  uid: string,
  fallbackWhenAdmin?: T[]
): () => void {
  const qRef = isAdmin ? collection(db, colName) : query(collection(db, colName), where('userId', '==', uid));
  return onSnapshot(
    qRef,
    (snap) => {
      const live = snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
      if (isAdmin && fallbackWhenAdmin) {
        setter(mergeById(fallbackWhenAdmin, live));
      } else {
        setter(live);
      }
    },
    (err) => handleListenerError(err, OperationType.LIST, colName)
  );
}

export async function writeAuditRecord(
  authUser: User | null,
  isAdmin: boolean,
  action: string,
  entityType: string,
  entityId: string,
  summaryFa: string
): Promise<void> {
  if (!authUser || !isAdmin) return;
  const id = `aud_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
  try {
    await setDoc(doc(db, 'auditLogs', id), {
      id,
      actorUid: authUser.uid,
      actorEmail: authUser.email ?? '',
      action,
      entityType,
      entityId,
      summaryFa,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Audit write skipped:', err);
  }
}
