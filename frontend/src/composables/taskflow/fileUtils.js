export function formatDynamicTime(iso) {
  if (!iso) return "";
  const s = String(iso);
  return s.length >= 19 ? s.slice(0, 19).replace("T", " ") : s.replace("T", " ");
}

export function formatDeadlineSlot(iso) {
  if (!iso) return "";
  const raw = String(iso).replace("T", " ");
  const datePart = raw.slice(0, 10);
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) {
    return datePart || raw;
  }
  const hour = d.getHours();
  const period = hour < 12 ? "上午" : hour < 18 ? "下午" : "晚上";
  return `${datePart} ${period}`;
}

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
