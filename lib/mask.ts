/** justine790@gmail.com -> ju•••••••••0@gmail.com (fixed bullet count so the length isn't leaked) */
export function maskEmail(email: string) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '•••••••••';
  if (local.length <= 3) return `${local[0] ?? ''}•••••••••@${domain}`;
  return `${local.slice(0, 2)}•••••••••${local.slice(-1)}@${domain}`;
}
