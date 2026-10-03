import { strict as assert } from "node:assert";
import {
  farmDisplayNameError,
  farmLoginNameError,
  farmPasswordError,
  normalizeFarmLoginName,
} from "../../server/auth/farmSession";

assert.ok(farmPasswordError("a"));
assert.equal(farmPasswordError("ab"), null);
assert.equal(farmPasswordError("가나"), null);
assert.equal(
  farmPasswordError("x".repeat(100_000)),
  null,
  "farm passwords intentionally have no application-level maximum length",
);

assert.equal(normalizeFarmLoginName("  JiWoo_01  "), "jiwoo_01");
assert.equal(farmLoginNameError("a"), "계정 이름은 2~32글자로 입력해 주세요.");
assert.equal(farmLoginNameError("ji woo"), "계정 이름에는 글자, 숫자, ., _, -만 사용할 수 있습니다.");
assert.equal(farmLoginNameError("지우01"), null);
assert.equal(farmDisplayNameError(""), "표시 이름은 1~20글자로 입력해 주세요.");
assert.equal(farmDisplayNameError("지우"), null);

console.log("Farm auth: minimum 2-character password and no app-level maximum verified");
