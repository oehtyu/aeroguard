// Password rules for NEW passwords only (first-time setup, reset, change password).
// Login does NOT use this, so existing accounts keep working with their old passwords.
export const PASSWORD_HINT = 'At least 8 characters with an uppercase letter, a lowercase letter, a number, and a symbol (e.g. ! @ # $). No spaces.';

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 72) return 'Password must be 72 characters or fewer.';
  if (/\s/.test(pw)) return 'Password cannot contain spaces.';
  if (!/[A-Z]/.test(pw)) return 'Password needs at least one uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password needs at least one lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password needs at least one number.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password needs at least one symbol (e.g. ! @ # $).';
  return null;
}
