import { test } from "node:test";
import assert from "node:assert/strict";
import { actionLock, canBuy, offeredProducts, owns, variantGate } from "../lib/access.ts";
import type { ActionDef, AvatarDef, VariantDef, Viewer } from "../lib/types.ts";

const v = (access: VariantDef["access"]) => ({ access }) as VariantDef;
const viewer = (o: Partial<Viewer> = {}): Viewer => ({ signedIn: false, ageConfirmed: false, owned: [], ...o });
const act = (tier: ActionDef["tier"]) => ({ tier }) as ActionDef;
const avatar = { id: "a1", pricing: { taps: 3, explicit: 7, bundle: 9 } } as AvatarDef;

test("jeans is open to guests", () => assert.deepEqual(variantGate("a1", v("guest"), viewer()), { ok: true }));

test("bikini needs sign-in, then age confirmation", () => {
  assert.deepEqual(variantGate("a1", v("member"), viewer()), { ok: false, reason: "signin" });
  assert.deepEqual(variantGate("a1", v("member"), viewer({ signedIn: true })), { ok: false, reason: "age" });
  assert.deepEqual(variantGate("a1", v("member"), viewer({ signedIn: true, ageConfirmed: true })), { ok: true });
});

test("explicit needs sign-in, age, then the explicit unlock or bundle", () => {
  const base = { signedIn: true, ageConfirmed: true };
  assert.deepEqual(variantGate("a1", v("paid"), viewer()), { ok: false, reason: "signin" });
  assert.deepEqual(variantGate("a1", v("paid"), viewer({ signedIn: true })), { ok: false, reason: "age" });
  assert.deepEqual(variantGate("a1", v("paid"), viewer(base)), { ok: false, reason: "purchase" });
  assert.deepEqual(variantGate("a1", v("paid"), viewer({ ...base, owned: ["taps:a1"] })), { ok: false, reason: "purchase" });
  assert.deepEqual(variantGate("a1", v("paid"), viewer({ ...base, owned: ["explicit:a1"] })), { ok: true });
  assert.deepEqual(variantGate("a1", v("paid"), viewer({ ...base, owned: ["bundle:a1"] })), { ok: true });
  assert.deepEqual(variantGate("a1", v("paid"), viewer({ ...base, owned: ["explicit:other"] })), { ok: false, reason: "purchase" });
});

test("tap locations: free vs taps unlock; bundle covers taps", () => {
  assert.equal(actionLock("a1", act("free"), viewer()), undefined);
  assert.equal(actionLock("a1", act("taps"), viewer()), "taps");
  assert.equal(actionLock("a1", act("taps"), viewer({ owned: ["taps:a1"] })), undefined);
  assert.equal(actionLock("a1", act("taps"), viewer({ owned: ["bundle:a1"] })), undefined);
  assert.equal(actionLock("a1", act("taps"), viewer({ owned: ["taps:a2"] })), "taps"); // other avatar
  assert.equal(actionLock("a1", act("explicit"), viewer()), undefined); // explicit tier is gated at the variant level
});

test("the explicit unlock does not unlock bikini taps", () => assert.equal(owns(viewer({ owned: ["explicit:a1"] }), "a1", "taps"), false));

test("purchase options: bundle only while something is missing", () => {
  assert.deepEqual(offeredProducts(avatar, "taps", viewer()), ["taps", "bundle"]);
  assert.deepEqual(offeredProducts(avatar, "taps", viewer({ owned: ["explicit:a1"] })), ["taps"]);
  assert.deepEqual(offeredProducts(avatar, "explicit", viewer({ owned: ["taps:a1"] })), ["explicit"]);
  assert.equal(canBuy(viewer({ owned: ["taps:a1", "explicit:a1"] }), "a1", "bundle"), false);
  assert.equal(canBuy(viewer({ owned: ["taps:a1"] }), "a1", "bundle"), true);
  assert.equal(canBuy(viewer({ owned: ["bundle:a1"] }), "a1", "taps"), false);
});
