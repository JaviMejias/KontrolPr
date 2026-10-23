export function formatRelativeTime(timestamp: string, now = new Date()): string {
  const value = new Date(timestamp).getTime();
  const deltaMinutes = Math.round((now.getTime() - value) / 60000);
  if (deltaMinutes < 1) return "ahora";
  if (deltaMinutes < 60) return `hace ${deltaMinutes} min`;
  const hours = Math.round(deltaMinutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short" }).format(new Date(timestamp));
}

export function formatDateTime(timestamp?: string): string {
  if (!timestamp) return "Sin sincronizar";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return [parts[0], parts.length >= 4 ? parts[parts.length - 2] : parts[1]]
    .filter((part): part is string => Boolean(part))
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
