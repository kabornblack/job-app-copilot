/**
 * Signup password rules — keep in sync with apps/web/lib/password.ts
 *
 * - min 8 characters
 * - at least one uppercase, one lowercase, one number
 * - special characters NOT required
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_STRONG_LENGTH = 12;

export type PasswordStrength = "weak" | "medium" | "strong";

export type PasswordValidation = {
  ok: boolean;
  errors: string[];
  strength: PasswordStrength;
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
  };
};

export function validatePassword(password: string): PasswordValidation {
  const checks = {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
  };

  const errors: string[] = [];
  if (!checks.minLength) {
    errors.push(`At least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (!checks.hasUppercase) {
    errors.push("At least one uppercase letter");
  }
  if (!checks.hasLowercase) {
    errors.push("At least one lowercase letter");
  }
  if (!checks.hasNumber) {
    errors.push("At least one number");
  }

  const ok = errors.length === 0;
  const strength: PasswordStrength = !ok
    ? "weak"
    : password.length >= PASSWORD_STRONG_LENGTH
      ? "strong"
      : "medium";

  return { ok, errors, strength, checks };
}
