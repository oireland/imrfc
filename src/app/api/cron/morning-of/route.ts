import { db } from "@/db/client";
import { markUnconfirmed } from "@/features/duties";
import { notifyMorningOf } from "@/features/push";
import { getPushSender } from "@/lib/messaging/push";

export const dynamic = "force-dynamic";

/** Vercel Cron hits this once a day (see vercel.json) to send the morning-of reminders, and to
 * mark equipment Unconfirmed after Events nobody visited the app since. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }
  await markUnconfirmed(db);
  const result = await notifyMorningOf(db, new Date(), getPushSender());
  return Response.json(result);
}
