import { todayIso } from "./jalali";
import { toJalaliIsoString } from "./service-date";

/**
 * انواع انتقال رده خدمتی
 *  - «انتقال دائم» : سرباز به‌صورت دائم در رده‌ی مقصد مشغول خدمت می‌شود.
 *  - «مامور»       : سرباز به‌صورت موقت (از تاریخ معرفی تا پایان ماموریت) در رده‌ی مقصد خدمت می‌کند
 *                    و پس از پایان ماموریت باید به یک رده‌ی جدید منتقل شود.
 */
export const TRANSFER_TYPE_PERMANENT = "انتقال دائم";
export const TRANSFER_TYPE_MISSION = "مامور";
export const TRANSFER_TYPES = [TRANSFER_TYPE_PERMANENT, TRANSFER_TYPE_MISSION] as const;

export function normalizeTransferType(t: string | null | undefined): string {
  return t === TRANSFER_TYPE_MISSION ? TRANSFER_TYPE_MISSION : TRANSFER_TYPE_PERMANENT;
}

export function isMission(t: string | null | undefined): boolean {
  return normalizeTransferType(t) === TRANSFER_TYPE_MISSION;
}

export interface TransferLike {
  id: number;
  transferType?: string | null;
  status?: string | null;
  toServiceUnit?: string | null;
  missionStartDate?: string | null;
  missionEndDate?: string | null;
}

export interface CurrentTransferInfo {
  type: string; // انتقال دائم | مامور
  unit: string | null;
  isDraft: boolean;
  missionStartDate: string | null;
  missionEndDate: string | null;
  missionExpired: boolean;
  transferId: number;
}

/** وضعیت انتقال فعلی سرباز (آخرین انتقال تأییدشده؛ در نبود آن، آخرین پیش‌نویس). */
export function pickCurrentTransfer(list: TransferLike[]): CurrentTransferInfo | null {
  const valid = list.filter((t) => t.status !== "لغو شده");
  const confirmed = valid.filter((t) => t.status === "تایید شده");
  const pool = confirmed.length ? confirmed : valid;
  if (!pool.length) return null;
  const last = [...pool].sort((a, b) => a.id - b.id)[pool.length - 1];
  const type = normalizeTransferType(last.transferType);
  const end = last.missionEndDate ? toJalaliIsoString(last.missionEndDate) : null;
  return {
    type,
    unit: last.toServiceUnit ?? null,
    isDraft: !confirmed.length,
    missionStartDate: last.missionStartDate ?? null,
    missionEndDate: last.missionEndDate ?? null,
    missionExpired: type === TRANSFER_TYPE_MISSION && !!end && end < todayIso(),
    transferId: last.id,
  };
}

export interface TransferInput {
  transferType?: unknown;
  missionStartDate?: unknown;
  missionEndDate?: unknown;
}

/**
 * اعتبارسنجی و نرمال‌سازی فیلدهای نوع انتقال.
 * برای «مامور» هر دو تاریخ (معرفی و پایان ماموریت) الزامی است.
 */
export function validateTransferInput(
  body: TransferInput,
  fallback?: { transferType?: string | null; missionStartDate?: string | null; missionEndDate?: string | null },
): { ok: true; transferType: string; missionStartDate: string | null; missionEndDate: string | null } | { ok: false; error: string } {
  const type = normalizeTransferType(
    (typeof body.transferType === "string" ? body.transferType : undefined) ?? fallback?.transferType ?? TRANSFER_TYPE_PERMANENT,
  );
  if (type !== TRANSFER_TYPE_MISSION) {
    return { ok: true, transferType: type, missionStartDate: null, missionEndDate: null };
  }
  const rawStart = (typeof body.missionStartDate === "string" ? body.missionStartDate : undefined) ?? fallback?.missionStartDate;
  const rawEnd = (typeof body.missionEndDate === "string" ? body.missionEndDate : undefined) ?? fallback?.missionEndDate;
  const start = toJalaliIsoString(rawStart);
  const end = toJalaliIsoString(rawEnd);
  if (!start) return { ok: false, error: "برای ماموریت، «تاریخ معرفی» الزامی است" };
  if (!end) return { ok: false, error: "برای ماموریت، «تاریخ پایان ماموریت» الزامی است" };
  if (end < start) return { ok: false, error: "تاریخ پایان ماموریت نمی‌تواند قبل از تاریخ معرفی باشد" };
  return { ok: true, transferType: type, missionStartDate: start, missionEndDate: end };
}
