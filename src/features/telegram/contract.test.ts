import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUpdate, telegramUpdateSchema } from "./contract.js";

test("normalizes photo updates with largest photo", () => {
  const update = telegramUpdateSchema.parse({
    update_id: 1,
    message: {
      message_id: 22,
      date: 1,
      chat: { id: 300, type: "private" },
      from: { id: 44, first_name: "Ada" },
      caption: "Vapiano 52,40",
      photo: [
        { file_id: "small", file_unique_id: "a", file_size: 10 },
        { file_id: "large", file_unique_id: "b", file_size: 30 }
      ]
    }
  });

  const normalized = normalizeUpdate(update);
  assert.equal(normalized.photoFileId, "large");
  assert.equal(normalized.text, "Vapiano 52,40");
});
