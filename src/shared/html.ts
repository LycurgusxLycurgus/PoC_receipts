export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f1e8;
        --ink: #1f1d1a;
        --muted: #6f6a63;
        --panel: #fffaf0;
        --line: #d7c7aa;
        --accent: #155eef;
        --accent-2: #0b6e4f;
        --warn: #9f3a2f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top left, rgba(21,94,239,.08), transparent 32%),
          linear-gradient(180deg, #fbf6ec 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main { max-width: 1080px; margin: 0 auto; padding: 24px; }
      a { color: var(--accent); }
      nav { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
      .panel {
        background: rgba(255,250,240,.88);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 18px;
        box-shadow: 0 10px 30px rgba(31,29,26,.06);
      }
      .grid { display: grid; gap: 16px; }
      .grid.two { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
      .badge {
        display: inline-block;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        background: #e7efff;
        color: #12368f;
      }
      .badge.ready { background: #ddf7ea; color: #0b6e4f; }
      .badge.needs_clarification { background: #fae2d6; color: #9f3a2f; }
      form { display: grid; gap: 12px; }
      input, select, textarea, button {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px 12px;
        font: inherit;
        background: white;
      }
      button {
        cursor: pointer;
        background: var(--accent);
        color: white;
        border: none;
        width: auto;
        min-width: 160px;
      }
      .muted { color: var(--muted); }
      .hero { display: grid; gap: 8px; margin-bottom: 24px; }
      .stat { font-size: 28px; font-weight: bold; }
      .error { color: var(--warn); }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
