import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import {
  bindPublicCollection,
  fetchPublicCollectionOnce,
  handleListenerError,
} from '../lib/firestoreStore';
import {
  SEED_AGENTS,
  SEED_BLOG_POSTS,
  SEED_BUNDLES,
  SEED_CAMPAIGNS,
  SEED_COUPONS,
  SEED_QUESTIONS,
  SEED_REDIRECTS,
  SEED_REVIEWS,
  SEED_SETTINGS,
} from '../data/seed';
import {
  SEED_BANNERS,
  SEED_FAQS,
  SEED_NEWSLETTER_SUBSCRIBERS,
  SEED_NOT_FOUND_LOGS,
  SEED_PAGES,
} from '../data/expandedCatalog';
import type {
  AgentBranch,
  BannerItem,
  BlogPost,
  Bundle,
  Campaign,
  Coupon,
  FaqItem,
  NewsletterSubscriber,
  NotFoundLog,
  ProductQuestion,
  RedirectRule,
  Review,
  SitePage,
  SiteSettings,
} from '../types/domain';
import type { StoreContextValue } from './storeTypes';
import { ADMIN_REQUIRED_MSG, mergeById, resolveAuthHeaders } from './storeHelpers';
import { useAuth } from './auth';
import { useCatalog } from './catalog';

export type OrderPurchaseChecker = (uid: string, productId: string) => boolean;

export interface ContentContextValue {
  settings: SiteSettings;
  campaigns: Campaign[];
  bundles: Bundle[];
  agents: AgentBranch[];
  blogPosts: BlogPost[];
  coupons: Coupon[];
  reviews: Review[];
  questions: ProductQuestion[];
  redirects: RedirectRule[];
  pages: SitePage[];
  banners: BannerItem[];
  faqs: FaqItem[];
  notFoundLogs: NotFoundLog[];
  newsletterSubscribers: NewsletterSubscriber[];
  registerOrderPurchaseChecker: (checker: OrderPurchaseChecker) => void;
  submitReview: StoreContextValue['submitReview'];
  submitQuestion: StoreContextValue['submitQuestion'];
  subscribeNewsletter: StoreContextValue['subscribeNewsletter'];
  recordNotFoundHit: StoreContextValue['recordNotFoundHit'];
  incrementRedirectHit: StoreContextValue['incrementRedirectHit'];
  upsertBundle: StoreContextValue['upsertBundle'];
  deleteBundle: StoreContextValue['deleteBundle'];
  upsertCampaign: StoreContextValue['upsertCampaign'];
  deleteCampaign: StoreContextValue['deleteCampaign'];
  moderateReview: StoreContextValue['moderateReview'];
  answerQuestion: StoreContextValue['answerQuestion'];
  upsertAgent: StoreContextValue['upsertAgent'];
  deleteAgent: StoreContextValue['deleteAgent'];
  upsertBlogPost: StoreContextValue['upsertBlogPost'];
  deleteBlogPost: StoreContextValue['deleteBlogPost'];
  upsertCoupon: StoreContextValue['upsertCoupon'];
  deleteCoupon: StoreContextValue['deleteCoupon'];
  upsertSitePage: StoreContextValue['upsertSitePage'];
  deleteSitePage: StoreContextValue['deleteSitePage'];
  upsertBanner: StoreContextValue['upsertBanner'];
  deleteBanner: StoreContextValue['deleteBanner'];
  upsertFaq: StoreContextValue['upsertFaq'];
  deleteFaq: StoreContextValue['deleteFaq'];
  upsertRedirect: StoreContextValue['upsertRedirect'];
  deleteRedirect: StoreContextValue['deleteRedirect'];
  updateSettings: StoreContextValue['updateSettings'];
}

const ContentContext = createContext<ContentContextValue | null>(null);

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const {
    authUser,
    authReady,
    isAdmin,
    actualAdminRole,
    activeAdminRole,
    userProfile,
    dbSynced,
    connectionChecked,
    pushToast,
    deletedSet,
    markIdDeleted,
    writeAudit,
  } = useAuth();
  const { categories, brands, products, contractPrices } = useCatalog();

  const [settings, setSettings] = useState<SiteSettings>(SEED_SETTINGS);
  const [campaigns, setCampaigns] = useState<Campaign[]>(SEED_CAMPAIGNS);
  const [bundles, setBundles] = useState<Bundle[]>(SEED_BUNDLES);
  const [agents, setAgents] = useState<AgentBranch[]>(SEED_AGENTS);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>(SEED_BLOG_POSTS);
  const [coupons, setCoupons] = useState<Coupon[]>(SEED_COUPONS);
  const [reviews, setReviews] = useState<Review[]>(SEED_REVIEWS);
  const [questions, setQuestions] = useState<ProductQuestion[]>(SEED_QUESTIONS);
  const [redirects, setRedirects] = useState<RedirectRule[]>(SEED_REDIRECTS);
  const [pages, setPages] = useState<SitePage[]>(SEED_PAGES);
  const [banners, setBanners] = useState<BannerItem[]>(SEED_BANNERS);
  const [faqs, setFaqs] = useState<FaqItem[]>(SEED_FAQS);
  const [notFoundLogs, setNotFoundLogs] = useState<NotFoundLog[]>(SEED_NOT_FOUND_LOGS);
  const [newsletterSubscribers, setNewsletterSubscribers] = useState<NewsletterSubscriber[]>(
    SEED_NEWSLETTER_SUBSCRIBERS
  );

  const orderPurchaseCheckerRef = useRef<OrderPurchaseChecker>(() => false);
  const registerOrderPurchaseChecker = useCallback((checker: OrderPurchaseChecker) => {
    orderPurchaseCheckerRef.current = checker;
  }, []);

  // Authenticated admin-only catalog / pricing / SEO sync to Express server (compact <2MB payload)
  useEffect(() => {
    if (!isAdmin || !authUser) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const headers = await resolveAuthHeaders(authUser);
          if (!headers.Authorization) return;
          await fetch('/api/seo/sync', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              categories,
              brands,
              ...(products.length <= 400 ? { products } : {}),
              campaigns,
              bundles,
              agents,
              blogPosts,
              redirects,
              coupons,
              contractPrices,
              settings,
            }),
          });
        } catch {
          // Non-fatal background sync
        }
      })();
    }, 800);
    return () => clearTimeout(timer);
  }, [
    isAdmin,
    authUser,
    categories,
    brands,
    products,
    campaigns,
    bundles,
    agents,
    blogPosts,
    redirects,
    coupons,
    contractPrices,
    settings,
  ]);

  // Public content sync
  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady) return;

    if (!authUser) {
      let cancelled = false;
      const isCancelled = () => cancelled;
      void Promise.allSettled([
        fetchPublicCollectionOnce<Campaign>('campaigns', setCampaigns, SEED_CAMPAIGNS, deletedSet, isCancelled),
        fetchPublicCollectionOnce<Bundle>('bundles', setBundles, SEED_BUNDLES, deletedSet, isCancelled),
        fetchPublicCollectionOnce<AgentBranch>('agents', setAgents, SEED_AGENTS, deletedSet, isCancelled),
        fetchPublicCollectionOnce<BlogPost>('blogPosts', setBlogPosts, SEED_BLOG_POSTS, deletedSet, isCancelled),
        fetchPublicCollectionOnce<Coupon>('coupons', setCoupons, SEED_COUPONS, deletedSet, isCancelled),
        fetchPublicCollectionOnce<RedirectRule>('redirects', setRedirects, SEED_REDIRECTS, deletedSet, isCancelled),
        fetchPublicCollectionOnce<SitePage>('pages', setPages, SEED_PAGES, deletedSet, isCancelled),
        fetchPublicCollectionOnce<BannerItem>('banners', setBanners, SEED_BANNERS, deletedSet, isCancelled),
        fetchPublicCollectionOnce<FaqItem>('faqs', setFaqs, SEED_FAQS, deletedSet, isCancelled),
        getDoc(doc(db, 'settings', 'site_main')).then((snap) => {
          if (!cancelled && snap.exists()) setSettings(snap.data() as SiteSettings);
        }),
      ]);
      return () => {
        cancelled = true;
      };
    }

    const unsubs = [
      bindPublicCollection<Campaign>('campaigns', setCampaigns, SEED_CAMPAIGNS, deletedSet),
      bindPublicCollection<Bundle>('bundles', setBundles, SEED_BUNDLES, deletedSet),
      bindPublicCollection<AgentBranch>('agents', setAgents, SEED_AGENTS, deletedSet),
      bindPublicCollection<BlogPost>('blogPosts', setBlogPosts, SEED_BLOG_POSTS, deletedSet),
      bindPublicCollection<Coupon>('coupons', setCoupons, SEED_COUPONS, deletedSet),
      bindPublicCollection<RedirectRule>('redirects', setRedirects, SEED_REDIRECTS, deletedSet),
      bindPublicCollection<SitePage>('pages', setPages, SEED_PAGES, deletedSet),
      bindPublicCollection<BannerItem>('banners', setBanners, SEED_BANNERS, deletedSet),
      bindPublicCollection<FaqItem>('faqs', setFaqs, SEED_FAQS, deletedSet),
      onSnapshot(
        doc(db, 'settings', 'site_main'),
        (snap) => {
          if (snap.exists()) setSettings(snap.data() as SiteSettings);
        },
        (err) => handleListenerError(err, OperationType.GET, 'settings/site_main')
      ),
    ];

    return () => unsubs.forEach((u) => u());
  }, [connectionChecked, dbSynced, authReady, authUser, deletedSet]);

  // Moderated Reviews & Questions
  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady) return;

    const revQuery = isAdmin
      ? collection(db, 'reviews')
      : query(collection(db, 'reviews'), where('status', '==', 'approved'));
    const qQuery = isAdmin
      ? collection(db, 'questions')
      : query(collection(db, 'questions'), where('status', '==', 'approved'));

    if (!authUser) {
      let cancelled = false;
      void getDocs(revQuery)
        .then((snap) => {
          if (!cancelled && !snap.empty) {
            setReviews(mergeById(SEED_REVIEWS, snap.docs.map((d) => ({ ...(d.data() as Review), id: d.id }))));
          }
        })
        .catch(() => {});
      void getDocs(qQuery)
        .then((snap) => {
          if (!cancelled && !snap.empty) {
            setQuestions(
              mergeById(SEED_QUESTIONS, snap.docs.map((d) => ({ ...(d.data() as ProductQuestion), id: d.id })))
            );
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }

    const unsubRev = onSnapshot(
      revQuery,
      (snap) => {
        if (!snap.empty) {
          setReviews(mergeById(SEED_REVIEWS, snap.docs.map((d) => ({ ...(d.data() as Review), id: d.id }))));
        }
      },
      (err) => handleListenerError(err, OperationType.LIST, 'reviews')
    );

    const unsubQ = onSnapshot(
      qQuery,
      (snap) => {
        if (!snap.empty) {
          setQuestions(
            mergeById(SEED_QUESTIONS, snap.docs.map((d) => ({ ...(d.data() as ProductQuestion), id: d.id })))
          );
        }
      },
      (err) => handleListenerError(err, OperationType.LIST, 'questions')
    );

    return () => {
      unsubRev();
      unsubQ();
    };
  }, [connectionChecked, dbSynced, authReady, authUser, isAdmin]);

  // Admin-only newsletter & 404 telemetry listeners (Express authoritative + Firestore fallback)
  useEffect(() => {
    if (!connectionChecked || !dbSynced || !authReady || !authUser || !isAdmin) return;
    const unsubs: (() => void)[] = [];
    const roleEffective = actualAdminRole ?? activeAdminRole;
    let cancelled = false;

    if (['super_admin', 'admin', 'content', 'sales_mgr'].includes(roleEffective)) {
      void resolveAuthHeaders(authUser)
        .then((headers) => (headers.Authorization ? fetch('/api/admin/newsletter-subscribers', { headers }) : null))
        .then((res) => (res && res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data?.ok && Array.isArray(data.subscribers)) {
            setNewsletterSubscribers((prev) => mergeById(prev, data.subscribers as NewsletterSubscriber[]));
          }
        })
        .catch(() => {});

      unsubs.push(
        onSnapshot(
          collection(db, 'newsletterSubscribers'),
          (snap) =>
            setNewsletterSubscribers((prev) =>
              mergeById(
                mergeById(SEED_NEWSLETTER_SUBSCRIBERS, prev),
                snap.docs.map((d) => ({ ...(d.data() as NewsletterSubscriber), id: d.id }))
              )
            ),
          (err) => handleListenerError(err, OperationType.LIST, 'newsletterSubscribers')
        )
      );
    }

    if (['super_admin', 'admin', 'content'].includes(roleEffective)) {
      void resolveAuthHeaders(authUser)
        .then((headers) => (headers.Authorization ? fetch('/api/admin/not-found-logs', { headers }) : null))
        .then((res) => (res && res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data?.ok && Array.isArray(data.logs)) {
            setNotFoundLogs((prev) => mergeById(prev, data.logs as NotFoundLog[]));
          }
        })
        .catch(() => {});

      unsubs.push(
        onSnapshot(
          collection(db, 'notFoundLogs'),
          (snap) =>
            setNotFoundLogs((prev) =>
              mergeById(
                mergeById(SEED_NOT_FOUND_LOGS, prev),
                snap.docs.map((d) => ({ ...(d.data() as NotFoundLog), id: d.id }))
              )
            ),
          (err) => handleListenerError(err, OperationType.LIST, 'notFoundLogs')
        )
      );
    }

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [connectionChecked, dbSynced, authReady, authUser, isAdmin, actualAdminRole, activeAdminRole]);

  const submitReview = async (productId: string, rating: number, title: string, body: string) => {
    if (!authUser) {
      pushToast('برای ثبت نظر باید وارد حساب کاربری شوید.', 'error');
      return;
    }
    const id = `rev_${Date.now()}`;
    try {
      await setDoc(doc(db, 'reviews', id), {
        id,
        productId,
        userId: authUser.uid,
        authorName: userProfile?.displayName || authUser.displayName || 'کاربر تاییدشده',
        rating,
        title,
        body,
        status: 'pending',
        isVerifiedPurchase: orderPurchaseCheckerRef.current(authUser.uid, productId),
        createdAt: serverTimestamp(),
      });
      pushToast('دیدگاه شما ثبت شد و پس از بررسی منتشر می‌شود.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `reviews/${id}`);
    }
  };

  const submitQuestion = async (productId: string, body: string) => {
    if (!authUser) {
      pushToast('برای ثبت پرسش وارد حساب کاربری شوید.', 'error');
      return;
    }
    const id = `q_${Date.now()}`;
    try {
      await setDoc(doc(db, 'questions', id), {
        id,
        productId,
        userId: authUser.uid,
        authorName: userProfile?.displayName || authUser.displayName || 'کاربر',
        body,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      pushToast('پرسش شما ثبت شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `questions/${id}`);
    }
  };

  const subscribeNewsletter = async (contact: string) => {
    const trimmed = contact.trim();
    if (!trimmed || trimmed.length < 4) {
      pushToast('ایمیل یا شماره موبایل معتبر وارد کنید.', 'error');
      return;
    }
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data.subscriber) {
        pushToast(data?.message || 'خطا در ثبت اشتراک خبرنامه.', 'error');
        return;
      }
      setNewsletterSubscribers((prev) => mergeById(prev, [data.subscriber as NewsletterSubscriber]));
      pushToast('عضویت شما در خبرنامه تخصصی دنتال‌مارکت ثبت شد.', 'success');
    } catch {
      pushToast('خطا در برقراری ارتباط با سرور برای عضویت خبرنامه.', 'error');
    }
  };

  const recordNotFoundHit = async (pathStr: string) => {
    const cleanPath = pathStr.trim().slice(0, 240);
    if (!cleanPath.startsWith('/')) return;
    try {
      const res = await fetch('/api/telemetry/404', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: cleanPath }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && data.log) {
        const nextDoc = data.log as NotFoundLog;
        setNotFoundLogs((prev) => mergeById(prev, [nextDoc]));
      }
    } catch {
      // Non-fatal 404 telemetry failure
    }
  };

  const incrementRedirectHit = async (redirectId: string) => {
    const rule = redirects.find((r) => r.id === redirectId);
    if (!rule) return;
    const nextCount = (rule.hitCount || 0) + 1;
    setRedirects((prev) => prev.map((r) => (r.id === redirectId ? { ...r, hitCount: nextCount } : r)));
    if (isAdmin && dbSynced) {
      updateDoc(doc(db, 'redirects', redirectId), { hitCount: nextCount }).catch(() => {});
    }
  };

  const upsertBundle = async (bundle: Bundle) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const updated = { ...bundle, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'bundles', updated.id), updated);
      await writeAudit('bundle.upsert', 'bundle', updated.id, `بروزرسانی پکیج «${updated.nameFa}»`);
      pushToast('پکیج / باندل ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bundles/${updated.id}`);
    }
  };

  const deleteBundle = async (bundleId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'bundles', bundleId)).catch(() => {});
      markIdDeleted(bundleId);
      setBundles((prev) => prev.filter((b) => b.id !== bundleId));
      pushToast('پکیج حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `bundles/${bundleId}`);
    }
  };

  const upsertCampaign = async (campaign: Campaign) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const updated = { ...campaign, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'campaigns', updated.id), updated);
      await writeAudit('campaign.upsert', 'campaign', updated.id, `بروزرسانی کمپین «${updated.nameFa}»`);
      pushToast('کمپین ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `campaigns/${updated.id}`);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'campaigns', campaignId)).catch(() => {});
      markIdDeleted(campaignId);
      setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
      await writeAudit('campaign.delete', 'campaign', campaignId, `حذف کمپین ${campaignId}`);
      pushToast('کمپین حذف شد.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `campaigns/${campaignId}`);
    }
  };

  const moderateReview = async (reviewId: string, status: 'approved' | 'rejected') => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'reviews', reviewId), { status });
      await writeAudit('review.moderate', 'review', reviewId, `تغییر وضعیت دیدگاه به ${status}`);
      pushToast('وضعیت دیدگاه بروزرسانی شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reviews/${reviewId}`);
    }
  };

  const answerQuestion = async (questionId: string, answerBody: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'questions', questionId), {
        answerBody,
        answeredBy: 'کارشناس تخصصی دنتال‌مارکت',
        status: 'approved',
      });
      await writeAudit('question.answer', 'question', questionId, 'پاسخ و انتشار پرسش محصول');
      pushToast('پاسخ ثبت و منتشر شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `questions/${questionId}`);
    }
  };

  const upsertAgent = async (agent: AgentBranch) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const next = { ...agent, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'agents', next.id), next);
      await writeAudit('agent.upsert', 'agent', next.id, `ثبت/ویرایش نمایندگی «${next.nameFa}»`);
      pushToast('نمایندگی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `agents/${next.id}`);
    }
  };

  const deleteAgent = async (agentId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(agentId);
    setAgents((prev) => prev.filter((a) => a.id !== agentId));
    await deleteDoc(doc(db, 'agents', agentId)).catch(() => {});
    pushToast('نمایندگی حذف شد.', 'info');
  };

  const upsertBlogPost = async (post: BlogPost) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const next = { ...post, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'blogPosts', next.id), next);
      await writeAudit('blog.upsert', 'blogPost', next.id, `ویرایش مقاله «${next.titleFa}»`);
      pushToast('مقاله ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `blogPosts/${next.id}`);
    }
  };

  const deleteBlogPost = async (postId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(postId);
    setBlogPosts((prev) => prev.filter((p) => p.id !== postId));
    await deleteDoc(doc(db, 'blogPosts', postId)).catch(() => {});
    pushToast('مقاله حذف شد.', 'info');
  };

  const upsertCoupon = async (coupon: Coupon) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'coupons', coupon.id), coupon);
      await writeAudit('coupon.upsert', 'coupon', coupon.id, `ثبت/ویرایش کد تخفیف ${coupon.code}`);
      pushToast('کد تخفیف ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `coupons/${coupon.id}`);
    }
  };

  const deleteCoupon = async (couponId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(couponId);
    setCoupons((prev) => prev.filter((c) => c.id !== couponId));
    await deleteDoc(doc(db, 'coupons', couponId)).catch(() => {});
    pushToast('کد تخفیف حذف شد.', 'info');
  };

  const upsertSitePage = async (page: SitePage) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const next = { ...page, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'pages', next.id), next);
      pushToast('صفحه اطلاع‌رسانی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `pages/${next.id}`);
    }
  };

  const deleteSitePage = async (pageId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(pageId);
    setPages((prev) => prev.filter((p) => p.id !== pageId));
    await deleteDoc(doc(db, 'pages', pageId)).catch(() => {});
    pushToast('صفحه حذف شد.', 'info');
  };

  const upsertBanner = async (banner: BannerItem) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    const cleanBanner = Object.fromEntries(
      Object.entries(banner).filter(([, value]) => value !== undefined)
    ) as BannerItem;
    try {
      await setDoc(doc(db, 'banners', cleanBanner.id), cleanBanner);
      setBanners((prev) => {
        const exists = prev.some((item) => item.id === cleanBanner.id);
        return exists
          ? prev.map((item) => (item.id === cleanBanner.id ? cleanBanner : item))
          : [...prev, cleanBanner];
      });
      pushToast('بنر تبلیغاتی ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `banners/${cleanBanner.id}`);
    }
  };

  const deleteBanner = async (bannerId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(bannerId);
    setBanners((prev) => prev.filter((b) => b.id !== bannerId));
    await deleteDoc(doc(db, 'banners', bannerId)).catch(() => {});
    pushToast('بنر حذف شد.', 'info');
  };

  const upsertFaq = async (faq: FaqItem) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'faqs', faq.id), faq);
      pushToast('سوال متداول ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `faqs/${faq.id}`);
    }
  };

  const deleteFaq = async (faqId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(faqId);
    setFaqs((prev) => prev.filter((f) => f.id !== faqId));
    await deleteDoc(doc(db, 'faqs', faqId)).catch(() => {});
    pushToast('سوال حذف شد.', 'info');
  };

  const upsertRedirect = async (rule: RedirectRule) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'redirects', rule.id), rule);
      await writeAudit('redirect.upsert', 'redirect', rule.id, `ثبت ریدایرکت ${rule.fromPath} -> ${rule.toPath}`);
      pushToast('قانون ریدایرکت ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `redirects/${rule.id}`);
    }
  };

  const deleteRedirect = async (ruleId: string) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    markIdDeleted(ruleId);
    setRedirects((prev) => prev.filter((r) => r.id !== ruleId));
    await deleteDoc(doc(db, 'redirects', ruleId)).catch(() => {});
    pushToast('ریدایرکت حذف شد.', 'info');
  };

  const updateSettings = async (next: SiteSettings) => {
    if (!isAdmin) {
      pushToast(ADMIN_REQUIRED_MSG, 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'settings', 'site_main'), next);
      await writeAudit('settings.update', 'settings', 'site_main', 'بروزرسانی تنظیمات کلان فروشگاه');
      pushToast('تنظیمات فروشگاه ذخیره شد.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/site_main');
    }
  };

  return (
    <ContentContext.Provider
      value={{
        settings,
        campaigns,
        bundles,
        agents,
        blogPosts,
        coupons,
        reviews,
        questions,
        redirects,
        pages,
        banners,
        faqs,
        notFoundLogs,
        newsletterSubscribers,
        registerOrderPurchaseChecker,
        submitReview,
        submitQuestion,
        subscribeNewsletter,
        recordNotFoundHit,
        incrementRedirectHit,
        upsertBundle,
        deleteBundle,
        upsertCampaign,
        deleteCampaign,
        moderateReview,
        answerQuestion,
        upsertAgent,
        deleteAgent,
        upsertBlogPost,
        deleteBlogPost,
        upsertCoupon,
        deleteCoupon,
        upsertSitePage,
        deleteSitePage,
        upsertBanner,
        deleteBanner,
        upsertFaq,
        deleteFaq,
        upsertRedirect,
        deleteRedirect,
        updateSettings,
      }}
    >
      {children}
    </ContentContext.Provider>
  );
}

export function useContent() {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error('useContent must be used inside ContentProvider');
  return ctx;
}
