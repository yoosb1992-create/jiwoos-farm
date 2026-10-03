import assert from "node:assert/strict";
import { nativePasswordError, normalizeNativeUsername } from "../../server/auth/native";

assert.ok(nativePasswordError("1"), "1자 비밀번호는 거부해야 함");
assert.equal(nativePasswordError("12"), null, "2자 비밀번호는 허용해야 함");
assert.equal(nativePasswordError("한글"), null, "문자 종류 제한을 두면 안 됨");
assert.equal(nativePasswordError(" ".repeat(2)), null, "공백도 비밀번호 문자로 취급해야 함");
assert.equal(nativePasswordError("x".repeat(100_000)), null, "앱 자체 최대 길이 제한을 두면 안 됨");
assert.equal(normalizeNativeUsername(" JiWoo ").displayName, "JiWoo");
console.log("native auth password policy checks: passed");
