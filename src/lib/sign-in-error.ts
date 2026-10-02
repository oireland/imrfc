/** Why a sign-in failed, in words for the person: Better Auth's error code arrives as ?error= on the sign-in page. */
export function signInErrorMessage(error: string | undefined): string | null {
  if (!error) return null;
  if (error === "INVALID_TOKEN") return "That sign-in link has expired or already been used. Ask for a new one below.";
  return "Something went wrong signing you in. Try again, or ask for a new link below.";
}
