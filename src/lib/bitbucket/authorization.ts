export function basicAuthorization(credentials: { email: string; token: string }): string {
  return `Basic ${btoa(Array.from(new TextEncoder().encode(`${credentials.email}:${credentials.token}`), (byte) => String.fromCharCode(byte)).join(""))}`;
}
