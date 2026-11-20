import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  testFirestoreConnection,
} from '../lib/firebase';
import { handleListenerError, writeAuditRecord } from '../lib/firestoreStore';
import { SEED_AUDIT_LOGS } from '../data/seed';
import type { AdminRoleCode, AuditLogEntry, CustomerGroupCode, UserProfile } from '../types/domain';
import type { AdminStaffRecord, StoreContextValue, ToastMessage } from './storeTypes';
import { ADMIN_REQUIRED_MSG, LS_DELETED_IDS, mergeById, readJsonLS } from './storeHelpers';

export interface AuthContextValue {
  authUser: User | null;
  authReady: boolean;
  isAdmin: boolean;
  actualAdminRole: AdminRoleCode | null;
  activeAdminRole: AdminRoleCode;
  setActiveAdminRole: (role: AdminRoleCode) => void;
  adminsList: AdminStaffRecord[];
  userProfile: UserProfile | null;
  usersList: UserProfile[];
  auditLogs: AuditLogEntry[];
  customerGroup: CustomerGroupCode;
  dbSynced: boolean;
  connectionChecked: boolean;
  toasts: ToastMessage[];
  pushToast: (text: string, tone?: ToastMessage['tone']) => void;
  deletedSet: Set<string>;
  markIdDeleted: (id: string) => void;
  writeAudit: (action: string, entityType: string, entityId: string, summaryFa: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserAdmin: StoreContextValue['updateUserAdmin'];
  updateOwnProfile: StoreContextValue['updateOwnProfile'];
  assignAdminRole: (uid: string, email: string, role: AdminRoleCode, displayName?: string) => Promise<void>;
  removeAdminRole: (uid: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdminDoc, setIsAdminDoc] = useState(false);
  const [actualAdminRole, setActualAdminRole] = useState<AdminRoleCode | null>(null);
  const [activeAdminRole, setActiveAdminRole] = useState<AdminRoleCode>('super_admin');
  const [adminsList, setAdminsList] = useState<AdminStaffRecord[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(SEED_AUDIT_LOGS);
  const [dbSynced, setDbSynced] = useState(false);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>(() => readJsonLS<string[]>(LS_DELETED_IDS, []));
  const deletedSet = useMemo(() => new Set(deletedIds), [deletedIds]);

  const markIdDeleted = useCallback((id: string) => {
    setDeletedIds((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      localStorage.setItem(LS_DELETED_IDS, JSON.stringify(next));
      return next;
    });
  }, []);

  // Strict RBAC check exclusively backed by Firestore admins/{uid} document (no hardcoded email fallback)
  const isAdmin = useMemo(() => {
    if (!authUser || !authUser.emailVerified) return false;
    return isAdminDoc && actualAdminRole !== null;
  }, [authUser, isAdminDoc, actualAdminRole]);

  const customerGroup: CustomerGroupCode = userProfile?.customerGroup ?? 'retail';

  const pushToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3800);
  }, []);

  const writeAudit = useCallback(
    (action: string, entityType: string, entityId: string, summaryFa: string) =>
      writeAuditRecord(authUser, isAdmin, action, entityType, entityId, summaryFa),
    [authUser, isAdmin]
  );

  useEffect(() => {
    let active = true;
    testFirestoreConnection()
      .then((ok) => {
        if (active) setDbSynced(ok);
      })
      .finally(() => {
        if (active) setConnectionChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Auth listener & Firestore admins/{uid} RBAC verification
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        const online = await testFirestoreConnection();
        setDbSynced(online);
        setConnectionChecked(true);

        if (online) {
          try {
            const adminSnap = await getDoc(doc(db, 'admins', user.uid));
            if (adminSnap.exists()) {
              setIsAdminDoc(true);
              const role = (adminSnap.data()?.role as AdminRoleCode) || 'admin';
              setActualAdminRole(role);
              setActiveAdminRole(role);
            } else {
              setIsAdminDoc(false);
              setActualAdminRole(null);
            }
          } catch {
            setIsAdminDoc(false);
            setActualAdminRole(null);
          }

          const userRef = doc(db, 'users', user.uid);
          try {
            const snap = await getDoc(userRef);
            if (!snap.exists() && user.emailVerified) {
              await setDoc(userRef, {
                uid: user.uid,
                email: user.email ?? '',
                displayName: user.displayName ?? 'کاربر دنتال‌مارکت',
                mobile: '',
                customerGroup: 'retail',
                accountType: 'individual',
                b2bStatus: 'none',
                isBlocked: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          } catch (err) {
            console.warn('User profile sync deferred:', err);
          }
        } else {
          setIsAdminDoc(false);
          setActualAdminRole(null);
        }
      } else {
        setIsAdminDoc(false);
        setActualAdminRole(null);
        setUserProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // User profile snapshot listener
  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady || !authUser) return;
    const path = `users/${authUser.uid}`;
    const unsub = onSnapshot(
      doc(db, 'users', authUser.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          setUserProfile({
            uid: String(data.uid ?? authUser.uid),
            email: String(data.email ?? authUser.email ?? ''),
            displayName: String(data.displayName ?? authUser.displayName ?? ''),
            mobile: String(data.mobile ?? ''),
            customerGroup: (data.customerGroup as CustomerGroupCode) ?? 'retail',
            accountType: (data.accountType as UserProfile['accountType']) ?? 'individual',
            clinicName: data.clinicName ? String(data.clinicName) : undefined,
            medicalCouncilNo: data.medicalCouncilNo ? String(data.medicalCouncilNo) : undefined,
            specialty: data.specialty ? String(data.specialty) : undefined,
            legalCompanyName: data.legalCompanyName ? String(data.legalCompanyName) : undefined,
            economicCode: data.economicCode ? String(data.economicCode) : undefined,
            nationalId: data.nationalId ? String(data.nationalId) : undefined,
            registrationNo: data.registrationNo ? String(data.registrationNo) : undefined,
            isBlocked: Boolean(data.isBlocked),
            b2bStatus: (data.b2bStatus as UserProfile['b2bStatus']) ?? 'none',
            addresses: Array.isArray(data.addresses) ? (data.addresses as UserProfile['addresses']) : [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      },
      (err) => handleListenerError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [connectionChecked, dbSynced, authReady, authUser]);

  // Admin-only RBAC, user directory & audit logs listeners
  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady || !authUser || !isAdmin) return;
    const unsubs = [
      onSnapshot(
        collection(db, 'users'),
        (snap) => setUsersList(snap.docs.map((d) => d.data() as UserProfile)),
        (err) => handleListenerError(err, OperationType.LIST, 'users')
      ),
      onSnapshot(
        collection(db, 'admins'),
        (snap) => setAdminsList(snap.docs.map((d) => ({ ...(d.data() as AdminStaffRecord), uid: d.id }))),
        (err) => handleListenerError(err, OperationType.LIST, 'admins')
      ),
      onSnapshot(
        collection(db, 'auditLogs'),
        (snap) => {
          if (!snap.empty) {
            setAuditLogs(
              mergeById(SEED_AUDIT_LOGS, snap.docs.map((d) => ({ ...(d.data() as AuditLogEntry), id: d.id }))).sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )
            );
          }
        },
        (err) => handleListenerError(err, OperationType.LIST, 'auditLogs')
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [connectionChecked, dbSynced, authReady, authUser, isAdmin]);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleAuthProvider);
      pushToast('ورود به حساب کاربری با موفقیت انجام شد.', 'success');
    } catch (err) {
      console.error('Google Sign-In failed:', err);
      pushToast('ورود انجام نشد. لطفاً مجدداً تلاش کنید.', 'error');
    }
  };

  const logout = async () => {
    await signOut(auth);
    pushToast('از حساب گوگل خارج شدید.', 'info');
  };

  const updateUserAdmin: StoreContextValue['updateUserAdmin'] = async (uid, patch) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      await writeAudit('user.admin_update', 'user', uid, `ویرایش کاربری ${uid}`);
      pushToast('اطلاعات کاربر بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const updateOwnProfile: StoreContextValue['updateOwnProfile'] = async (patch) => {
    if (!authUser) {
      pushToast('ابتدا وارد حساب کاربری شوید.', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', authUser.uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      pushToast('اطلاعات پروفایل و حقوقی بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${authUser.uid}`);
    }
  };

  const assignAdminRole = async (uid: string, email: string, role: AdminRoleCode, displayName?: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const rec: AdminStaffRecord = {
      uid: uid.trim(),
      email: email.trim(),
      role,
      displayName: displayName?.trim() || email.trim(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'admins', rec.uid), rec);
      await writeAudit('rbac.assign', 'admin', rec.uid, `تخصیص نقش ${role} به ${rec.email}`);
      pushToast('نقش دسترسی مدیر ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `admins/${rec.uid}`);
    }
  };

  const removeAdminRole = async (uid: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'admins', uid));
      await writeAudit('rbac.revoke', 'admin', uid, `لغو دسترسی مدیریتی ${uid}`);
      pushToast('دسترسی مدیر حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `admins/${uid}`);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        authUser,
        authReady,
        isAdmin,
        actualAdminRole,
        activeAdminRole,
        setActiveAdminRole,
        adminsList,
        userProfile,
        usersList,
        auditLogs,
        customerGroup,
        dbSynced,
        connectionChecked,
        toasts,
        pushToast,
        deletedSet,
        markIdDeleted,
        writeAudit,
        signInWithGoogle,
        logout,
        updateUserAdmin,
        updateOwnProfile,
        assignAdminRole,
        removeAdminRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
