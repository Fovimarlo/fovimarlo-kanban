const MAX_MINUTES = 24 * 60;

/**
 * Parses a free-form duration into minutes.
 * Accepts "90", "90m", "1.5", "1,5h", "2h", "1h 30m", "1:30".
 * A bare number is read as hours when it has a decimal part or is <= 12,
 * otherwise as minutes ("8" -> 8h, "45" -> 45m).
 * Returns null for empty input and undefined for invalid input.
 */
export function parseDuration(input: string): number | null | undefined {
  const value = input.trim().toLowerCase().replace(",", ".");
  if (!value) return null;

  let minutes: number | undefined;

  const clock = /^(\d{1,2}):(\d{2})$/.exec(value);
  const units =
    /^(?:(\d+(?:\.\d+)?)\s*(?:h|sa|saat))?\s*(?:(\d+)\s*(?:m|min|dk|dakika))?$/.exec(
      value,
    );
  const bare = /^\d+(?:\.\d+)?$/.exec(value);

  if (clock) {
    const mins = Number(clock[2]);
    if (mins < 60) minutes = Number(clock[1]) * 60 + mins;
  } else if (bare) {
    const num = Number(value);
    minutes = value.includes(".") || num <= 12 ? num * 60 : num;
  } else if (units && (units[1] || units[2])) {
    minutes = Number(units[1] ?? 0) * 60 + Number(units[2] ?? 0);
  }

  if (minutes === undefined) return undefined;
  minutes = Math.round(minutes);
  if (minutes < 1 || minutes > MAX_MINUTES) return undefined;
  return minutes;
}

/** Formats minutes as "1h 30m", "45m" or "2h". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/** Formats a local Date as "YYYY-MM-DD" without timezone conversion. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses "YYYY-MM-DD" into a local Date at midnight. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
