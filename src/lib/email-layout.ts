// The Clubhouse look for emails: warm off-white page, white rounded card, the crest in a
// white circle, a serif heading and one black button. Email clients ignore CSS variables
// and most <style> rules, so the theme's colours (src/app/globals.css) are inlined here;
// the <style> block only adds web fonts and dark mode where the client supports them.
// Pure, no Next.js. The crest is an inline attachment (cid:crest) added by the mail sender.

const light = {
  background: "#f5f4f0",
  card: "#ffffff",
  foreground: "#111111",
  muted: "#66645d",
  border: "#e6e3dc",
  primary: "#111111",
  primaryForeground: "#ffffff",
  gold: "#f2c400",
};

const dark = {
  background: "#11100f",
  card: "#1b1a18",
  foreground: "#f3f1ec",
  muted: "#a19d93",
  border: "#2d2b28",
  primary: "#f3f1ec",
  primaryForeground: "#11100f",
};

const serif = "'Instrument Serif', Georgia, 'Times New Roman', serif";
const sans = "'Inter Tight', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export type EmailContent = {
  /** The line inbox lists show after the subject. */
  preview: string;
  /** Small caps label above the heading, e.g. "Training". */
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  button: { label: string; href: string };
  /** Small print under the button. */
  footnote?: string;
};

export function emailLayout({ preview, eyebrow, heading, paragraphs, button, footnote }: EmailContent): string {
  const e = escapeHtml;
  const body = paragraphs
    .map((p) => `<p class="fg" style="margin:0 0 14px;font-family:${sans};font-size:16px;line-height:1.5;color:${light.foreground};">${e(p)}</p>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${e(heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter+Tight:wght@400;600&display=swap" rel="stylesheet">
<style>
  @media (prefers-color-scheme: dark) {
    .page { background:${dark.background} !important; }
    .card { background:${dark.card} !important; border-color:${dark.border} !important; }
    .fg { color:${dark.foreground} !important; }
    .muted { color:${dark.muted} !important; }
    .rule { border-color:${dark.border} !important; }
    .button { background:${dark.primary} !important; color:${dark.primaryForeground} !important; }
  }
</style>
</head>
<body class="page" style="margin:0;padding:0;background:${light.background};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(preview)}</div>
<table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" style="background:${light.background};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr>
          <td align="right" style="padding:0 4px 16px;">
            <span style="display:inline-block;width:48px;height:48px;border-radius:24px;background:#ffffff;box-shadow:0 1px 2px rgba(0,0,0,0.06);">
              <img src="cid:crest" width="36" height="36" alt="Imperial Medicals RFC" style="display:block;margin:6px;width:36px;height:36px;border:0;">
            </span>
          </td>
        </tr>
        <tr>
          <td class="card" style="background:${light.card};border:1px solid ${light.border};border-radius:28px;padding:28px 24px;">
            <p class="muted" style="margin:0 0 8px;font-family:${sans};font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${light.muted};">
              <span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${light.gold};margin-right:6px;vertical-align:1px;"></span>${e(eyebrow)}
            </p>
            <h1 class="fg" style="margin:0 0 20px;font-family:${serif};font-size:34px;line-height:1.1;font-weight:400;color:${light.foreground};">${e(heading)}</h1>
            ${body}
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;">
              <tr>
                <td>
                  <a href="${e(button.href)}" class="button" style="display:inline-block;padding:14px 26px;border-radius:999px;background:${light.primary};color:${light.primaryForeground};font-family:${sans};font-size:16px;font-weight:600;text-decoration:none;">${e(button.label)}</a>
                </td>
              </tr>
            </table>
            ${footnote ? `<p class="muted" style="margin:14px 0 0;font-family:${sans};font-size:13px;line-height:1.5;color:${light.muted};">${e(footnote)}</p>` : ""}
          </td>
        </tr>
        <tr>
          <td class="muted" style="padding:18px 8px 0;font-family:${sans};font-size:12px;line-height:1.5;color:${light.muted};text-align:center;">
            Imperial Medicals RFC
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
