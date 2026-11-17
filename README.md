# DentalMarket (دنتال‌مارکت)

فروشگاه تخصصی تجهیزات و مواد مصرفی دندانپزشکی، پزشکی و آزمایشگاهی با رابط فارسی/RTL، پنل مدیریت ۱۴بخشی و موتور قیمت‌گذاری B2B/B2C.

## معماری فنی و امنیت
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS با مسیرهای Lazy-Loaded (`React.lazy` + `Suspense`) و تقسیم‌بندی باندل‌ها (`manualChunks`) برای Firebase، Recharts و XLSX.
- **Backend (`server.ts` + `server/`):** سرور Express با محاسبه قطعی مبلغ در سمت سرور (`/api/checkout/calculate`, `/api/orders/guest`)، تایید ضدجعل پرداخت (`/api/payments/initiate`, `/api/payments/verify`)، نشست امن موبایل OTP (`/api/auth/otp/*`, `/api/auth/session`, `/api/orders/mobile`)، استعلام قیمت دوطرفه (`/api/rfq/*`) و صفحه‌بندی سروری کاتالوگ (`/api/catalog/products`).
- **ذخیره‌سازی و قواعد امنیتی:** Firebase Firestore + `firestore.rules` (default-deny، `hasOnly(...)`، بدون ایمیل ادمین هاردکدشده، احراز نقش صرفاً از کالکشن `admins/{uid}`) همراه با ذخیره‌سازی اتمیک سروری روی دیسک (`.data/store.json` قابل تنظیم با `DATA_DIR`).

## راه‌اندازی محلی
```bash
npm install
cp .env.example .env
# برای اجرای آزمایشی محلی در فایل .env مقادیر زیر را تنظیم کنید:
# SMS_PROVIDER=sandbox
# PAYMENT_MODE=sandbox
npm run dev
```

## متغیرهای محیطی الزامی (Fail-Closed)
به‌صورت پیش‌فرض، حالت‌های آزمایشی OTP و پرداخت **خاموش** هستند و در محیط `NODE_ENV=production` نیز مسدود می‌شوند مگر با کلیدهای واقعی سرویس‌دهندگان:
- `SMS_PROVIDER`: `sandbox` (تست محلی با کد تصادفی `crypto.randomInt`) یا `live` (کاوه‌نگار با `SMS_API_KEY`)
- `PAYMENT_MODE`: `sandbox` (تست محلی با `sandboxToken` یک‌بارمصرف) یا `live` (زرین‌پال با `ZARINPAL_MERCHANT_ID` یا آیدی‌پی با `IDPAY_API_KEY`)
- `ALLOW_SANDBOX_IN_PROD`: فقط در صورت نیاز صریح به محیط Staging (`false` در حالت عادی)
- `DATA_DIR`: مسیر ذخیره‌سازی اتمیک فایل‌های وضعیت سرور (پیش‌فرض `.data`)

## دستورهای بررسی و تست
```bash
npm test      # اجرای تست‌های واحد و یکپارچه سرور (tests/*.test.ts)
npm run lint  # بررسی TypeScript و قوانین امنیتی Firestore
npm run build # ساخت نسخه نهایی Vite با تقسیم‌بندی کدها
```

## نقشه مسیر مقیاس‌پذیری آینده (Production Scale)
در فایل `ASSUMPTIONS.md` جزئیات انتقال دیتابیس از Firestore/JSON به PostgreSQL و موتور جستجو به Meilisearch/Elasticsearch و مهاجرت SSR به Next.js (برای سئوی پیشرفته ۵۰٬۰۰۰+ کالا) مستند شده است.
