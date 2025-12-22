const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const pad = (value: number) => String(value).padStart(2, "0");

const parseDateValue = (value: string | Date | null | undefined) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isValidDateInput = (value: string) => {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf());
};

export const isValidTimeInput = (value: string) => {
  if (!TIME_PATTERN.test(value)) {
    return false;
  }
  const [hours, minutes] = value.split(":").map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return false;
  }
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

export const isValidDateTimeInput = (value: string) => {
  if (!DATETIME_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf());
};

export const formatDateInput = (value: string | Date | null | undefined) => {
  if (!value) return "";
  if (typeof value === "string" && DATE_PATTERN.test(value)) {
    return value;
  }
  const parsed = parseDateValue(value);
  if (!parsed) return "";
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
};

export const formatTimeInput = (value: string | Date | null | undefined) => {
  if (!value) return "";
  if (typeof value === "string" && DATE_PATTERN.test(value)) {
    return "";
  }
  const parsed = parseDateValue(value);
  if (!parsed) return "";
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

export const formatDateTimeInput = (value: string | Date | null | undefined) => {
  const date = formatDateInput(value);
  if (!date) return "";
  const time = formatTimeInput(value) || "00:00";
  return `${date}T${time}`;
};

export const combineDateTimeInputs = (dateInput?: string, timeInput?: string) => {
  if (!dateInput) return null;
  if (!isValidDateInput(dateInput)) return null;
  if (timeInput && !isValidTimeInput(timeInput)) return null;
  const [year, month, day] = dateInput.split("-").map((part) => Number.parseInt(part, 10));
  const [hour, minute] = timeInput
    ? timeInput.split(":").map((part) => Number.parseInt(part, 10))
    : [0, 0];
  const date = new Date(year, month - 1, day, hour || 0, minute || 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};
