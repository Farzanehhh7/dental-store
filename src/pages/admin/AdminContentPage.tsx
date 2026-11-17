import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatJalaliDate, toPersianDigits } from '../../lib/jalali';
import { AgentBranch, BannerItem, BlogPost, FaqItem, SitePage } from '../../types/domain';

export function AdminContentPage() {
  const {
    blogPosts,
    pages,
    banners,
    faqs,
    agents,
    newsletterSubscribers,
    upsertBlogPost,
    deleteBlogPost,
    upsertSitePage,
    deleteSitePage,
    upsertBanner,
    deleteBanner,
    upsertFaq,
    deleteFaq,
    upsertAgent,
    deleteAgent,
    pushToast,
  } = useStore();

  const [tab, setTab] = useState<'blog' | 'pages' | 'banners' | 'faqs' | 'agents' | 'marketing'>('blog');
  const [postForm, setPostForm] = useState({ id: '', titleFa: '', categoryFa: 'اندودانتیکس', excerptFa: '', bodyFa: '' });
  const [pageForm, setPageForm] = useState({ id: '', slug: '', titleFa: '', bodyFa: '' });
  const [bannerForm, setBannerForm] = useState({ titleFa: '', subtitleFa: '', linkPath: '/category/consumables', slot: 'mid_promo' as BannerItem['slot'] });
  const [faqForm, setFaqForm] = useState({ categoryFa: 'ارسال و اصالت', questionFa: '', answerFa: '' });
  const [agentForm, setAgentForm] = useState({ nameFa: '', province: 'فارس', provinceSlug: 'fars', city: 'شیراز', phone: '071-32300000', address: '' });
  const [smsBody, setSmsBody] = useState('کلینیک گرامی، جشنواره تجهیزات اندو دنتال‌مارکت با ۱۵٪ تخفیف همکار آغاز شد.');

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    const post: BlogPost = {
      id: postForm.id || `blog_${now}`,
      titleFa: postForm.titleFa,
      slug: `post-${now}`,
      categoryFa: postForm.categoryFa,
      excerptFa: postForm.excerptFa,
      bodyFa: postForm.bodyFa,
      imageUrl: '/src/assets/images/hero_dental_clinic_1794921818923.jpg',
      authorName: 'دکتر سارا احمدی',
      authorRole: 'متخصص دندانپزشکی ترمیمی',
      reviewedBy: 'هیئت علمی دنتال‌مارکت',
      readingMinutes: 5,
      productIds: [],
      status: 'published',
      publishedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    await upsertBlogPost(post);
    setPostForm({ id: '', titleFa: '', categoryFa: 'اندودانتیکس', excerptFa: '', bodyFa: '' });
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold">مدیریت محتوا، صفحات، بنرها، نمایندگان و بازاریابی</h1>

      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { id: 'blog', label: `مجله تخصصی (${toPersianDigits(blogPosts.length)})` },
          { id: 'pages', label: `صفحات CMS (${toPersianDigits(pages.length)})` },
          { id: 'banners', label: `بنرهای ویترین (${toPersianDigits(banners.length)})` },
          { id: 'faqs', label: `سوالات متداول (${toPersianDigits(faqs.length)})` },
          { id: 'agents', label: `نمایندگان استانی (${toPersianDigits(agents.length)})` },
          { id: 'marketing', label: `خبرنامه (${toPersianDigits(newsletterSubscribers.length)}) و SMS` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3.5 py-2 rounded-xl font-bold ${tab === t.id ? 'bg-brand text-white' : 'bg-white dark:bg-slate-900 border border-line dark:border-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'blog' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <form onSubmit={handlePublishPost} className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold">{postForm.id ? 'ویرایش مقاله' : 'انتشار مقاله تخصصی جدید'}</h2>
            <input required value={postForm.titleFa} onChange={(e) => setPostForm({ ...postForm, titleFa: e.target.value })} placeholder="عنوان مقاله..." className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={postForm.categoryFa} onChange={(e) => setPostForm({ ...postForm, categoryFa: e.target.value })} placeholder="دسته علمی..." className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input required value={postForm.excerptFa} onChange={(e) => setPostForm({ ...postForm, excerptFa: e.target.value })} placeholder="چکیده..." className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <textarea required rows={4} value={postForm.bodyFa} onChange={(e) => setPostForm({ ...postForm, bodyFa: e.target.value })} placeholder="متن کامل مقاله..." className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <button type="submit" className="px-4 py-2 rounded-xl bg-brand text-white font-bold">ذخیره و انتشار مقاله</button>
          </form>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold">فهرست مقالات</h2>
            {blogPosts.map((bp) => (
              <div key={bp.id} className="p-3 rounded-xl border border-line dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="font-bold">{bp.titleFa}</p>
                  <p className="text-ink/55">{bp.authorName} · {formatJalaliDate(bp.publishedAt)}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPostForm({ id: bp.id, titleFa: bp.titleFa, categoryFa: bp.categoryFa, excerptFa: bp.excerptFa, bodyFa: bp.bodyFa })} className="text-brand font-bold">ویرایش</button>
                  <button type="button" onClick={() => deleteBlogPost(bp.id)} className="text-rose-600 font-bold">حذف</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'pages' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold">ایجاد / ویرایش صفحه ایستا</h2>
            <input value={pageForm.slug} onChange={(e) => setPageForm({ ...pageForm, slug: e.target.value })} placeholder="نامک مسیر (مثلاً warranty)" className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={pageForm.titleFa} onChange={(e) => setPageForm({ ...pageForm, titleFa: e.target.value })} placeholder="عنوان صفحه" className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <textarea rows={4} value={pageForm.bodyFa} onChange={(e) => setPageForm({ ...pageForm, bodyFa: e.target.value })} placeholder="محتوای صفحه..." className="w-full px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <button
              type="button"
              onClick={async () => {
                if (!pageForm.slug || !pageForm.titleFa) return;
                const sp: SitePage = { id: pageForm.id || `pg_${Date.now()}`, slug: pageForm.slug, titleFa: pageForm.titleFa, bodyFa: pageForm.bodyFa, status: 'published', updatedAt: new Date().toISOString() };
                await upsertSitePage(sp);
                setPageForm({ id: '', slug: '', titleFa: '', bodyFa: '' });
              }}
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              ذخیره صفحه
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-2">
            {pages.map((p) => (
              <div key={p.id} className="p-3 rounded-xl border border-line flex justify-between items-center">
                <div>
                  <p className="font-bold">{p.titleFa}</p>
                  <p className="text-ink/55">/page/{p.slug}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPageForm({ id: p.id, slug: p.slug, titleFa: p.titleFa, bodyFa: p.bodyFa })} className="text-brand font-bold">ویرایش</button>
                  <button type="button" onClick={() => deleteSitePage(p.id)} className="text-rose-600 font-bold">حذف</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'banners' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input value={bannerForm.titleFa} onChange={(e) => setBannerForm({ ...bannerForm, titleFa: e.target.value })} placeholder="تیتر بنر" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={bannerForm.subtitleFa} onChange={(e) => setBannerForm({ ...bannerForm, subtitleFa: e.target.value })} placeholder="زیرتیتر" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={bannerForm.linkPath} onChange={(e) => setBannerForm({ ...bannerForm, linkPath: e.target.value })} placeholder="مسیر لینک" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <button
              type="button"
              onClick={async () => {
                if (!bannerForm.titleFa) return;
                await upsertBanner({
                  id: `bn_${Date.now()}`,
                  slot: bannerForm.slot,
                  titleFa: bannerForm.titleFa,
                  subtitleFa: bannerForm.subtitleFa,
                  ctaTextFa: 'مشاهده',
                  linkPath: bannerForm.linkPath,
                  imageUrl: '/src/assets/images/hero_dental_clinic_1794921818923.jpg',
                  isActive: true,
                  sortOrder: banners.length + 1,
                });
                setBannerForm({ titleFa: '', subtitleFa: '', linkPath: '/category/consumables', slot: 'mid_promo' });
              }}
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              افزودن بنر
            </button>
          </div>
          {banners.map((b) => (
            <div key={b.id} className="p-3 rounded-xl border border-line flex justify-between items-center">
              <span>{b.titleFa} ({b.slot}) → {b.linkPath}</span>
              <button type="button" onClick={() => deleteBanner(b.id)} className="text-rose-600 font-bold">حذف</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'faqs' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input value={faqForm.questionFa} onChange={(e) => setFaqForm({ ...faqForm, questionFa: e.target.value })} placeholder="سوال متداول..." className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={faqForm.answerFa} onChange={(e) => setFaqForm({ ...faqForm, answerFa: e.target.value })} placeholder="پاسخ..." className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <button
              type="button"
              onClick={async () => {
                if (!faqForm.questionFa || !faqForm.answerFa) return;
                const f: FaqItem = { id: `faq_${Date.now()}`, ...faqForm, sortOrder: faqs.length + 1, isActive: true };
                await upsertFaq(f);
                setFaqForm({ categoryFa: 'ارسال و اصالت', questionFa: '', answerFa: '' });
              }}
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              افزودن سوال متداول
            </button>
          </div>
          {faqs.map((f) => (
            <div key={f.id} className="p-3 rounded-xl border border-line flex justify-between items-center">
              <div>
                <p className="font-bold">{f.questionFa}</p>
                <p className="text-ink/60">{f.answerFa}</p>
              </div>
              <button type="button" onClick={() => deleteFaq(f.id)} className="text-rose-600 font-bold">حذف</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'agents' && (
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <input value={agentForm.nameFa} onChange={(e) => setAgentForm({ ...agentForm, nameFa: e.target.value })} placeholder="نام شعبه/نمایندگی" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={agentForm.province} onChange={(e) => setAgentForm({ ...agentForm, province: e.target.value })} placeholder="استان" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={agentForm.city} onChange={(e) => setAgentForm({ ...agentForm, city: e.target.value })} placeholder="شهر" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <input value={agentForm.phone} onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })} placeholder="تلفن" className="px-3 py-2 rounded-lg border border-line bg-paper dark:bg-slate-800" />
            <button
              type="button"
              onClick={async () => {
                if (!agentForm.nameFa) return;
                const ag: AgentBranch = {
                  id: `ag_${Date.now()}`,
                  type: 'agent',
                  ...agentForm,
                  mobile: '09170000000',
                  workingHoursFa: 'شنبه تا چهارشنبه ۹ تا ۱۸',
                  brandIds: [],
                  lat: 29.5918,
                  lng: 52.5837,
                  isActive: true,
                  updatedAt: new Date().toISOString(),
                };
                await upsertAgent(ag);
                setAgentForm({ nameFa: '', province: 'فارس', provinceSlug: 'fars', city: 'شیراز', phone: '', address: '' });
              }}
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              افزودن نمایندگی
            </button>
          </div>
          {agents.map((ag) => (
            <div key={ag.id} className="p-3 rounded-xl border border-line flex justify-between items-center">
              <span>{ag.nameFa} ({ag.province} - {ag.city}) · {ag.phone}</span>
              <button type="button" onClick={() => deleteAgent(ag.id)} className="text-rose-600 font-bold">حذف</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'marketing' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold">اعضای خبرنامه ({toPersianDigits(newsletterSubscribers.length)})</h2>
            {newsletterSubscribers.map((sub) => (
              <div key={sub.id} className="p-2.5 rounded-lg border border-line flex justify-between">
                <span>{sub.contact} ({sub.type})</span>
                <span className="tabular-nums text-ink/55">{formatJalaliDate(sub.createdAt)}</span>
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-brand" />
              <span>ارسال کمپین پیامکی هدفمند (SMS Campaign)</span>
            </h2>
            <textarea rows={3} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} className="w-full p-3 rounded-xl border border-line bg-paper dark:bg-slate-800" />
            <button
              type="button"
              onClick={() => pushToast(`کمپین پیامکی برای ${toPersianDigits(newsletterSubscribers.length)} مخاطب در صف ارسال ثبت شد.`, 'success')}
              className="px-4 py-2 rounded-xl bg-brand text-white font-bold"
            >
              ارسال گروهی کمپین
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminContentPage;
