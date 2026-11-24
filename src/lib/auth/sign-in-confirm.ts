// Mail scanners (Outlook Safe Links, Defender) GET every link in an email, and Better Auth's
// verify endpoint spends the one-time token on that GET. So the email links to a page that
// only spends it when the person presses a button — scanners fetch the page but don't press.

/** The emailed link: our /sign-in/confirm page carrying the token and where to land afterwards. */
export function confirmPageUrl(verifyUrl: string): string {
  const verify = new URL(verifyUrl);
  const confirm = new URL("/sign-in/confirm", verify.origin);
  for (const key of ["token", "callbackURL", "newUserCallbackURL", "errorCallbackURL"]) {
    const value = verify.searchParams.get(key);
    if (value) confirm.searchParams.set(key, value);
  }
  return confirm.toString();
}

/** The same-origin verify path the confirm page's button goes to, or null if there's no token. */
export function verifyUrlFromConfirmParams(params: URLSearchParams): string | null {
  const token = params.get("token");
  if (!token) return null;
  const verify = new URLSearchParams({ token });
  for (const key of ["callbackURL", "newUserCallbackURL", "errorCallbackURL"]) {
    const value = params.get(key);
    if (value) verify.set(key, value);
  }
  return `/api/auth/magic-link/verify?${verify}`;
}
