import test from "node:test";
import assert from "node:assert/strict";
import { createContextService } from "./compose-context.js";

test("context composer keeps stable prefix and message ordering", async () => {
  const calls: string[] = [];
  const db = Object.assign(
    async (strings: TemplateStringsArray) => {
      const sql = strings.join("");
      calls.push(sql);
      if (sql.includes("from context_fragments")) {
        return [{ kind: "AGENTS", title: "Base", body_markdown: "Do the work." }];
      }
      if (sql.includes("from messages")) {
        return [{ role: "assistant", content: "old" }, { role: "user", content: "new" }];
      }
      return [{ label: "setting:business_type", value: "Freelancer" }];
    },
    { json: JSON.stringify }
  ) as never;

  const service = createContextService(db);
  const result = await service.compose("user-1", "conversation-1", "full");

  assert.match(result.systemPrefix, /Stable system prefix/);
  assert.match(result.fragmentText, /Base/);
  assert.equal(result.recentMessages, "user: new\nassistant: old");
  assert.ok(calls.length >= 3);
});
