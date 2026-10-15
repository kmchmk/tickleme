import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedAdmin, isGrantProduct, looksLikeEmail, parseAdminEmails, sameOrigin } from "../lib/admin-core.ts";

test("admin emails are parsed leniently", () => assert.deepEqual(parseAdminEmails(" A@x.com, b@Y.com;c@z.com\n"), ["a@x.com", "b@y.com", "c@z.com"]));
test("empty / missing env means nobody is admin", () => {
  assert.deepEqual(parseAdminEmails(undefined), []);
  assert.equal(isAllowedAdmin("a@x.com", []), false);
});
test("admin match ignores case and rejects others", () => {
  const allowed = parseAdminEmails("kmchmk@gmail.com");
  assert.equal(isAllowedAdmin("KMCHMK@gmail.com", allowed), true);
  assert.equal(isAllowedAdmin("kmchmk@gmail.com.evil.com", allowed), false);
  assert.equal(isAllowedAdmin(null, allowed), false);
});
test("only known products can be granted", () => {
  for (const p of ["taps", "explicit", "bundle"]) assert.equal(isGrantProduct(p), true);
  for (const p of ["", "admin", "TAPS", 5, null]) assert.equal(isGrantProduct(p), false);
});
test("email check", () => {
  assert.equal(looksLikeEmail("a@b.co"), true);
  for (const e of ["a@b", "a b@c.com", "@c.com", "", null]) assert.equal(looksLikeEmail(e), false);
});
test("origin check", () => {
  assert.equal(sameOrigin("https://tickleme.vercel.app", "tickleme.vercel.app"), true);
  assert.equal(sameOrigin("https://evil.example", "tickleme.vercel.app"), false);
  assert.equal(sameOrigin("not a url", "tickleme.vercel.app"), false);
  assert.equal(sameOrigin(null, "tickleme.vercel.app"), true);
});
