import { t } from './i18n';

export function normalizeAsciiDigits(raw: string): string {
  return String(raw || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();
}

export function isValidIranMobile(raw: string): boolean {
  const normalized = normalizeAsciiDigits(raw);
  return /^09\d{9}$/.test(normalized);
}

export function isValidPostalCode(raw: string): boolean {
  const normalized = normalizeAsciiDigits(raw);
  if (!normalized) return true;
  return /^\d{10}$/.test(normalized);
}

export function isValidEmail(raw: string): boolean {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned);
}

export function isValidNationalId(raw: string): boolean {
  const code = normalizeAsciiDigits(raw);
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(code[i]) * (10 - i);
  }
  const rem = sum % 11;
  const check = Number(code[9]);
  return rem < 2 ? check === rem : check === 11 - rem;
}

export interface CheckoutFormInput {
  customerName: string;
  customerMobile: string;
  province: string;
  city: string;
  postalCode?: string;
  addressLine: string;
}

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

export function validateCheckoutForm(
  input: CheckoutFormInput
): FieldErrors<'customerName' | 'customerMobile' | 'province' | 'city' | 'postalCode' | 'addressLine'> {
  const errors: FieldErrors<'customerName' | 'customerMobile' | 'province' | 'city' | 'postalCode' | 'addressLine'> = {};

  if (!input.customerName.trim() || input.customerName.trim().length < 2) {
    errors.customerName = t('validation.nameRequired');
  }
  if (!isValidIranMobile(input.customerMobile)) {
    errors.customerMobile = t('validation.mobileInvalid');
  }
  if (!input.province.trim()) {
    errors.province = t('validation.provinceRequired');
  }
  if (!input.city.trim()) {
    errors.city = t('validation.cityRequired');
  }
  if (input.postalCode && input.postalCode.trim() && !isValidPostalCode(input.postalCode)) {
    errors.postalCode = t('validation.postalCodeInvalid');
  }
  if (!input.addressLine.trim() || input.addressLine.trim().length < 6) {
    errors.addressLine = t('validation.addressMinLength');
  }

  return errors;
}
