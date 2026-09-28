import { emailLayout } from "./email-layout";

/** The magic-link email, in the Clubhouse layout. The link works once, for 5 minutes (Better Auth's default). */
export function signInEmail(url: string): { subject: string; text: string; html: string } {
  return {
    subject: "Sign in to IMRFC",
    text: [`Sign in here: ${url}`, "", "The link works once, for the next 5 minutes. If you didn't ask to sign in, ignore this email."].join("\n"),
    html: emailLayout({
      preview: "Your sign-in link for the club app",
      eyebrow: "Sign in",
      heading: "Here's your link",
      paragraphs: ["Tap the button to sign in to the club app."],
      button: { label: "Sign in", href: url },
      footnote: "The link works once, for the next 5 minutes. If you didn't ask to sign in, ignore this email.",
    }),
  };
}
