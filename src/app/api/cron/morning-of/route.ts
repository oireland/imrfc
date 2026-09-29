import { db } from "@/db/client";
import { notifyMorningOf } from "@/features/push";
import { getPushSender } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Vercel Cron hits this once a day (see vercel.json) to send the morning-of reminders. */
export async function GET(request: Request) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(null, { status: 401 });
  }
  const result = await notifyMorningOf(db, new Date(), getPushSender());
  return Response.json(result);
}
