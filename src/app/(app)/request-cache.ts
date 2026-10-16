import { cache } from "react";
import { db } from "@/db/client";
import { markUnconfirmed } from "@/features/duties";
import { listTeams } from "@/features/events";

/** Teams, loaded once however many places on the page ask. */
export const teamsForRequest = cache(() => listTeams(db));

/** Marks ended-Event equipment Unconfirmed at most once per request. */
export const markUnconfirmedOnce = cache(() => markUnconfirmed(db));
