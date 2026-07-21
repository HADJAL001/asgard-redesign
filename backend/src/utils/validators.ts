const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d{7,15}$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  return typeof phone === 'string' && PHONE_RE.test(phone.trim());
}

export function isValidUsername(username: string): boolean {
  return typeof username === 'string' && USERNAME_RE.test(username);
}

export function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 8;
}
