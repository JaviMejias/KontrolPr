import type { Person } from "../../types/domain";
import { initials } from "../../lib/formatting";

export function Avatar({ person, size = "md" }: { person: Person; size?: "sm" | "md" | "lg" }) {
  const color = Array.from(person.accountId || person.displayName).reduce((value, char) => value + char.charCodeAt(0), 0) % 5;
  return <span className={`avatar avatar-${size} avatar-color-${color}`} title={person.displayName} aria-label={person.displayName}>{initials(person.displayName)}</span>;
}
