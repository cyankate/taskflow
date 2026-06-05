export function formatDynamicTime(iso) {
  if (!iso) return "";
  const s = String(iso);
  return s.length >= 19 ? s.slice(0, 19).replace("T", " ") : s.replace("T", " ");
}

export { formatDeadlineSlot, formatTicketTimeSlot } from "./ticketTimeSlot";

export function toDateInputFormat(value) {
  if (!value) return "";
  const s = String(value);
  return s.length >= 19 ? s.slice(0, 19) : s;
}

export function normalizeAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item, idx) => {
      if (typeof item === "string") {
        const guessedType = item.includes(".mp4") || item.includes("video/") ? "video/*" : "image/*";
        return {
          name: `附件${idx + 1}`,
          type: guessedType,
          url: item,
        };
      }
      if (item && item.url) {
        const rawType = String(item.type || item.mime || "").trim().toLowerCase();
        let normalizedType = rawType || (item.url.includes("video/") ? "video/*" : "image/*");
        if (normalizedType === "image") normalizedType = "image/*";
        if (normalizedType === "video") normalizedType = "video/*";
        return {
          name: item.name || `附件${idx + 1}`,
          type: normalizedType,
          url: item.url,
        };
      }
      return null;
    })
    .filter(Boolean);
}

export function isImageAttachment(item) {
  return (item?.type || "").startsWith("image") || item?.type === "image";
}

export function isVideoAttachment(item) {
  return (item?.type || "").startsWith("video") || item?.type === "video";
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** 统计 (from, to] 区间内的 weekdays 数量（不含 from 当天，含 to 当天） */
function countWeekdaysExclusiveStart(from, to) {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (end <= start) return 0;
  let count = 0;
  let cursor = addDays(start, 1);
  while (cursor <= end) {
    if (!isWeekend(cursor)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/**
 * 相对今天的剩余/逾期工作日（不含周六日）。
 * 正数：剩余工作日；0：今天为截止日；负数：已逾期的工作日数。
 */
export function diffBusinessDaysToDeadline(endTime) {
  const end = startOfDay(endTime);
  const today = startOfDay(new Date());
  if (end < today) {
    return -countWeekdaysExclusiveStart(end, today);
  }
  if (end.getTime() === today.getTime()) {
    return 0;
  }
  return countWeekdaysExclusiveStart(today, end);
}
