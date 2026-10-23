import type { Person } from "../../types/domain";

export function extractMentionNames(raw: string, html: string): Record<string, string> {
  const names: Record<string, string> = {};
  if (!html || !raw.includes("@{") || typeof DOMParser === "undefined") return names;
  const document = new DOMParser().parseFromString(html, "text/html");
  const occurrences = [...raw.matchAll(/@\{([^{}\s]+)\}/g)].map((match) => match[1]);
  const ids = [...new Set(occurrences)];
  for (const anchor of document.querySelectorAll("a")) {
    const name = anchor.textContent?.trim().replace(/^@/, "");
    if (!name) continue;
    const attributes = [anchor.getAttribute("data-account-id"), anchor.getAttribute("data-atlassian-id"), anchor.getAttribute("data-uuid"), anchor.getAttribute("data-user-id")];
    let href: URL | undefined;
    try { href = new URL(anchor.getAttribute("href") ?? "", "https://bitbucket.org"); } catch { /* Malformed remote links cannot identify a mention. */ }
    for (const id of ids) {
      const path = href?.hostname === "bitbucket.org" ? href.pathname.split("/").map((part) => { try { return decodeURIComponent(part); } catch { return part; } }) : [];
      if (attributes.includes(id) || path.includes(id) || path.includes(`{${id}}`)) names[id] = name;
    }
  }
  const mentions = [...document.querySelectorAll("a.mention, a.ap-mention")];
  if (mentions.length === occurrences.length) {
    mentions.forEach((anchor, index) => {
      const name = anchor.textContent?.trim().replace(/^@/, "");
      if (name && !Object.hasOwn(names, occurrences[index])) names[occurrences[index]] = name;
    });
  }
  return names;
}

export function mentionNamesFor(people: Person[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const person of people) {
    for (const id of [person.accountId, person.uuid, person.atlassianAccountId]) {
      if (id) { names[id] = person.displayName; names[id.replace(/^\{|\}$/g, "")] = person.displayName; }
    }
  }
  return names;
}
