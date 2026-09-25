/** The name to show for a User; magic-link sign-ins start with a blank name, so fall back to the email's local part. */
export function displayName({ name, email }: { name: string; email: string }): string {
  return name.trim() || email.split("@")[0];
}
