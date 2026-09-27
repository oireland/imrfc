/** A new User still needs onboarding until they've set both a name and a Preferred Position. */
export function needsOnboarding(user: { name: string; preferredPosition: string | null }): boolean {
  return !user.name.trim() || !user.preferredPosition;
}
