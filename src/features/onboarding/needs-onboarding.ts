/**
 * A User needs onboarding until they've set a name and a Preferred Position — and, while
 * they're Playing, a Mobile number.
 */
export function needsOnboarding(user: {
  name: string;
  preferredPosition: string | null;
  playing: boolean;
  hasMobileNumber: boolean;
}): boolean {
  return !user.name.trim() || !user.preferredPosition || (user.playing && !user.hasMobileNumber);
}
