export const TICKET_TIME_PERIOD_OPTIONS = [
  { value: "morning", label: "上午" },
  { value: "afternoon", label: "下午" },
];

export const TICKET_SLOT_TIMES = {
  start: { morning: "09:00:00", afternoon: "14:00:00" },
  end: { morning: "12:00:00", afternoon: "18:00:00" },
};

export function parseTicketDatePart(iso) {
  if (!iso) return "";
  const raw = String(iso).trim();
  if (!raw) return "";
  return raw.slice(0, 10);
}

export function inferTicketTimePeriod(iso, kind = "start") {
  if (!iso) return "";
  const raw = String(iso).replace("T", " ");
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  const hour = d.getHours();
  if (kind === "start") {
    if (hour === 9) return "morning";
    if (hour === 14) return "afternoon";
    return hour < 14 ? "morning" : "afternoon";
  }
  if (hour === 12) return "morning";
  if (hour === 18) return "afternoon";
  return hour < 14 ? "morning" : "afternoon";
}

export function composeTicketDateTime(datePart, period, kind) {
  if (!datePart || !period) return "";
  const time = TICKET_SLOT_TIMES[kind]?.[period];
  if (!time) return "";
  return `${datePart}T${time}`;
}

export function splitTicketTimeSlot(iso, kind) {
  return {
    date: parseTicketDatePart(iso),
    period: inferTicketTimePeriod(iso, kind),
  };
}

export function applyTicketTimeSlotFields(target) {
  if (!target || typeof target !== "object") return;
  const start = splitTicketTimeSlot(target.start_time, "start");
  target.start_date = start.date;
  target.start_period = start.period;
  const end = splitTicketTimeSlot(target.end_time, "end");
  target.end_date = end.date;
  target.end_period = end.period;
}

export function serializeTicketTimePayload(form) {
  const startDate = form.start_date || "";
  const startPeriod = form.start_period || "";
  const endDate = form.end_date || "";
  const endPeriod = form.end_period || "";
  if (!!startDate !== !!startPeriod) {
    throw new Error("开始时间请同时选择日期和上午/下午");
  }
  if (!!endDate !== !!endPeriod) {
    throw new Error("截止时间请同时选择日期和上午/下午");
  }
  const payload = { ...form };
  payload.start_time = composeTicketDateTime(startDate, startPeriod, "start") || null;
  payload.end_time = composeTicketDateTime(endDate, endPeriod, "end") || null;
  delete payload.start_date;
  delete payload.start_period;
  delete payload.end_date;
  delete payload.end_period;
  return payload;
}

export function formatTicketTimeSlot(iso, kind = "end") {
  if (!iso) return "";
  const datePart = parseTicketDatePart(iso);
  if (!datePart) return "";
  const period = inferTicketTimePeriod(iso, kind);
  if (!period) return datePart;
  const label = period === "morning" ? "上午" : "下午";
  return `${datePart} ${label}`;
}

export function formatDeadlineSlot(iso) {
  return formatTicketTimeSlot(iso, "end");
}
