import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { bindScopedCollection } from '../lib/firestoreStore';
import { SEED_B2B_VERIFICATIONS, SEED_TICKETS } from '../data/seed';
import type { B2BVerification, MobileSessionUser, Order, ProformaInvoice, RfqRequest, SupportTicket } from '../types/domain';
import type { StoreContextValue } from './storeTypes';
import { ADMIN_REQUIRED_MSG } from './storeHelpers';
import { useAuth } from './auth';
import { useMobileSessionAndRfq } from './useMobileSessionAndRfq';

export type ProformaCreatedListener = (proforma: ProformaInvoice) => void;

export interface RfqContextValue {
  mobileSession: MobileSessionUser | null;
  mobileSessionToken: string;
  rawMobileOrders: Order[];
  rfqs: RfqRequest[];
  b2bVerifications: B2BVerification[];
  tickets: SupportTicket[];
  sendMobileOtp: StoreContextValue['sendMobileOtp'];
  verifyMobileOtp: StoreContextValue['verifyMobileOtp'];
  logoutMobile: StoreContextValue['logoutMobile'];
  refreshMobileOrders: StoreContextValue['refreshMobileOrders'];
  refreshRfqs: StoreContextValue['refreshRfqs'];
  submitRfq: StoreContextValue['submitRfq'];
  sendRfqMessage: StoreContextValue['sendRfqMessage'];
  quoteRfq: StoreContextValue['quoteRfq'];
  respondRfq: StoreContextValue['respondRfq'];
  convertRfqToProforma: StoreContextValue['convertRfqToProforma'];
  submitB2BVerification: StoreContextValue['submitB2BVerification'];
  reviewB2BVerification: StoreContextValue['reviewB2BVerification'];
  submitTicket: StoreContextValue['submitTicket'];
  replyTicket: StoreContextValue['replyTicket'];
  registerProformaCreatedListener: (listener: ProformaCreatedListener) => void;
}

const RfqContext = createContext<RfqContextValue | null>(null);

export function RfqProvider({ children }: { children: React.ReactNode }) {
  const {
    authUser,
    authReady,
    isAdmin,
    userProfile,
    dbSynced,
    connectionChecked,
    pushToast,
    writeAudit,
  } = useAuth();

  const [b2bVerifications, setB2BVerifications] = useState<B2BVerification[]>(SEED_B2B_VERIFICATIONS);
  const [tickets, setTickets] = useState<SupportTicket[]>(SEED_TICKETS);

  const proformaCreatedRef = useRef<ProformaCreatedListener | null>(null);
  const registerProformaCreatedListener = useCallback((listener: ProformaCreatedListener) => {
    proformaCreatedRef.current = listener;
  }, []);

  const mobileAndRfq = useMobileSessionAndRfq({
    authUser,
    authReady,
    isAdmin,
    dbSynced,
    pushToast,
    onProformaCreated: (pf) => proformaCreatedRef.current?.(pf),
  });

  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady || !authUser) return;
    const unsubs = [
      bindScopedCollection<B2BVerification>(
        'b2bVerifications',
        setB2BVerifications,
        isAdmin,
        authUser.uid,
        SEED_B2B_VERIFICATIONS
      ),
      bindScopedCollection<SupportTicket>('tickets', setTickets, isAdmin, authUser.uid, SEED_TICKETS),
    ];
    return () => unsubs.forEach((u) => u());
  }, [connectionChecked, dbSynced, authReady, authUser, isAdmin]);

  const submitB2BVerification: StoreContextValue['submitB2BVerification'] = async (payload) => {
    if (!authUser) {
      pushToast('ابتدا وارد حساب کاربری گوگل شوید.', 'error');
      return;
    }
    const id = `b2b_${Date.now()}`;
    try {
      await setDoc(doc(db, 'b2bVerifications', id), {
        id,
        userId: authUser.uid,
        ...payload,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      pushToast('درخواست احراز هویت حرفه‌ای B2B ارسال شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `b2bVerifications/${id}`);
    }
  };

  const reviewB2BVerification = async (
    id: string,
    status: 'approved' | 'rejected' | 'needs_info',
    rejectReason?: string
  ) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const item = b2bVerifications.find((b) => b.id === id);
    if (!item) return;
    try {
      await updateDoc(doc(db, 'b2bVerifications', id), {
        status,
        ...(rejectReason ? { rejectReason } : {}),
        reviewedBy: authUser?.email ?? 'admin',
        updatedAt: serverTimestamp(),
      });
      if (status === 'approved') {
        await updateDoc(doc(db, 'users', item.userId), {
          customerGroup: item.requestedGroup,
          b2bStatus: 'approved',
          clinicName: item.clinicName,
          medicalCouncilNo: item.medicalCouncilNo,
          updatedAt: serverTimestamp(),
        });
        if (authUser) {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          try {
            const tok = await authUser.getIdToken();
            if (tok) headers.Authorization = `Bearer ${tok}`;
          } catch {
            // Ignore token error
          }
          await fetch('/api/admin/users/group', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              uid: item.userId,
              mobile: item.mobile,
              customerGroup: item.requestedGroup,
              b2bStatus: 'approved',
              displayName: item.applicantName,
            }),
          }).catch(() => {});
        }
      }
      await writeAudit('b2b.review', 'b2bVerification', id, `بررسی حساب B2B (${item.applicantName}): ${status}`);
      pushToast('وضعیت درخواست B2B بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `b2bVerifications/${id}`);
    }
  };

  const submitTicket: StoreContextValue['submitTicket'] = async (payload) => {
    if (!authUser) {
      pushToast('برای ارسال تیکت وارد حساب کاربری شوید.', 'error');
      return;
    }
    const id = `tkt_${Date.now()}`;
    const ticketNo = `TK-1405-${String(Date.now()).slice(-4)}`;
    try {
      await setDoc(doc(db, 'tickets', id), {
        id,
        ticketNo,
        userId: authUser.uid,
        ...(payload.orderNo ? { orderNo: payload.orderNo } : {}),
        subject: payload.subject,
        department: payload.department,
        priority: payload.priority,
        status: 'open',
        messages: [
          {
            authorName: userProfile?.displayName || authUser.displayName || 'مشتری',
            isStaff: false,
            body: payload.body,
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      pushToast(`تیکت ${ticketNo} ایجاد شد.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tickets/${id}`);
    }
  };

  const replyTicket = async (ticketId: string, body: string, isStaff: boolean) => {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    if (isStaff && !isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const nextMessages = [
      ...ticket.messages,
      {
        authorName: isStaff ? 'پشتیبانی دنتال‌مارکت' : userProfile?.displayName || 'مشتری',
        isStaff,
        body,
        createdAt: new Date().toISOString(),
      },
    ];
    const nextStatus: SupportTicket['status'] = isStaff ? 'pending_customer' : 'pending_staff';
    try {
      await updateDoc(doc(db, 'tickets', ticketId), {
        messages: nextMessages,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      pushToast('پاسخ ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticketId}`);
    }
  };

  return (
    <RfqContext.Provider
      value={{
        mobileSession: mobileAndRfq.mobileSession,
        mobileSessionToken: mobileAndRfq.mobileSessionToken,
        rawMobileOrders: mobileAndRfq.mobileOrders,
        rfqs: mobileAndRfq.rfqs,
        b2bVerifications,
        tickets,
        sendMobileOtp: mobileAndRfq.sendMobileOtp,
        verifyMobileOtp: mobileAndRfq.verifyMobileOtp,
        logoutMobile: mobileAndRfq.logoutMobile,
        refreshMobileOrders: mobileAndRfq.refreshMobileOrders,
        refreshRfqs: mobileAndRfq.refreshRfqs,
        submitRfq: mobileAndRfq.submitRfq,
        sendRfqMessage: mobileAndRfq.sendRfqMessage,
        quoteRfq: mobileAndRfq.quoteRfq,
        respondRfq: mobileAndRfq.respondRfq,
        convertRfqToProforma: mobileAndRfq.convertRfqToProforma,
        submitB2BVerification,
        reviewB2BVerification,
        submitTicket,
        replyTicket,
        registerProformaCreatedListener,
      }}
    >
      {children}
    </RfqContext.Provider>
  );
}

export function useRfq() {
  const ctx = useContext(RfqContext);
  if (!ctx) throw new Error('useRfq must be used inside RfqProvider');
  return ctx;
}
