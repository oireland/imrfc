/** Drops this browser's push subscription (server first, then the browser). Never throws, so sign-out can't be blocked. */
export async function unsubscribeThisDevice(unsubscribe: (endpoint: string) => Promise<void>) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await unsubscribe(subscription.endpoint);
    await subscription.unsubscribe();
  } catch {
    // Signing out matters more than tidying up the subscription.
  }
}
