// Shared date formatting. All inputs may be null/undefined/invalid → "—".

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ka-GE", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ka-GE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 0) return fmtDate(iso);
  if (sec < 60) return "ახლახან";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} წთ წინ`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} სთ წინ`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} დღის წინ`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} თვის წინ`;
  const yr = Math.floor(mo / 12);
  return `${yr} წლის წინ`;
}

// True only when the timestamp is a valid date in the future.
export function isFuture(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d.getTime() > Date.now();
}
