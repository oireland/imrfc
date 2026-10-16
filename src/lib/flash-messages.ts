/** What a `?error=<code>` on the URL means. Only these codes show; anything else gets the generic line. */
const ERRORS: Record<string, string> = {
  "already-deleted": "That account has already been deleted.",
  "delete-admin": "You can't delete another admin's account.",
  "admin-only": "Only an admin can delete someone else's account.",
  "invalid-role": "That isn't a Role.",
  "last-admin": "You're the only Admin, so you can't give up the role.",
  "block-self": "You can't block yourself.",
};

const GENERIC_ERROR = "Something went wrong. Please try again.";

export function errorMessage(code: string): string {
  return Object.hasOwn(ERRORS, code) ? ERRORS[code] : GENERIC_ERROR;
}
