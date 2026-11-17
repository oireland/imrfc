import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db/client";
import { account, resolveNewUser, session, user, verification } from "@/features/users";
import { getMailSender } from "./mail";
import { signInEmail } from "./sign-in-email";
import { confirmPageUrl } from "./sign-in-confirm";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await getMailSender().send({ to: email, ...signInEmail(confirmPageUrl(url)) });
      },
    }),
  ],
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "member", input: false },
      accessState: { type: "string", defaultValue: "pending", input: false },
      theme: { type: "string", defaultValue: "system", input: false },
      preferredPosition: { type: "string", required: false, input: false },
      otherPositions: { type: "string[]", defaultValue: [], input: false },
      playing: { type: "boolean", defaultValue: true, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          const { role, accessState } = resolveNewUser(newUser.email, adminEmails());
          return { data: { ...newUser, role, accessState } };
        },
      },
    },
  },
});
