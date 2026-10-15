import { test } from "node:test";
import assert from "node:assert/strict";
import { blurAmount, planTransition } from "../lib/transition-plan.ts";
import type { TransitionSet } from "../lib/types.ts";

const clip = (n: string) => ({ key: n, url: n });
const pairA: TransitionSet = { version: 1, up: [clip("01"), clip("02")], down: [clip("b02"), clip("b01")] };
const pairB: TransitionSet = { version: 1, up: [clip("03"), clip("04")], down: [clip("b04"), clip("b03")] };
const names = (p: { steps: { clip: { key: string } }[] }) => p.steps.map((s) => s.clip.key);

test("jeans -> bikini plays 01, 02", () => assert.deepEqual(names(planTransition("jeans", "bikini", { jeans: pairA, bikini: pairB }, false)), ["01", "02"]));
test("bikini -> explicit plays 03, 04", () => assert.deepEqual(names(planTransition("bikini", "explicit", { jeans: pairA, bikini: pairB }, false)), ["03", "04"]));
test("jeans -> explicit chains both pairs", () => assert.deepEqual(names(planTransition("jeans", "explicit", { jeans: pairA, bikini: pairB }, false)), ["01", "02", "03", "04"]));
test("going back plays the reversed clips, last pair first", () => {
  assert.deepEqual(names(planTransition("bikini", "jeans", { jeans: pairA, bikini: pairB }, false)), ["b02", "b01"]);
  assert.deepEqual(names(planTransition("explicit", "jeans", { jeans: pairA, bikini: pairB }, false)), ["b04", "b03", "b02", "b01"]);
});
test("a guest only gets the first pair, then the rest cross-fades", () => {
  const p = planTransition("jeans", "explicit", { jeans: pairA }, true);
  assert.deepEqual(names(p), ["01", "02"]);
  assert.equal(p.complete, false);
  assert.equal(p.steps.some((s) => s.ramp), false);
});
test("going back from a pair the viewer cannot play is a plain cross-fade", () => {
  const p = planTransition("explicit", "jeans", { jeans: pairA }, true);
  assert.deepEqual(names(p), []);
  assert.equal(p.complete, false);
});
test("blur ramps only on the bikini <-> explicit pair, and only while explicit is blurred", () => {
  const up = planTransition("jeans", "explicit", { jeans: pairA, bikini: pairB }, true);
  assert.deepEqual(up.steps.map((s) => s.ramp), [undefined, undefined, "in", "in"]);
  const down = planTransition("explicit", "bikini", { jeans: pairA, bikini: pairB }, true);
  assert.deepEqual(down.steps.map((s) => s.ramp), ["out", "out"]);
  assert.deepEqual(planTransition("bikini", "explicit", { bikini: pairB }, false).steps.map((s) => s.ramp), [undefined, undefined]);
});
test("blur amount goes 0 -> 1 across 03+04 and 1 -> 0 across the reversed clips", () => {
  const up = planTransition("bikini", "explicit", { bikini: pairB }, true);
  const d = [2, 2];
  assert.equal(blurAmount(up.steps, 0, 0, d), 0);
  assert.equal(blurAmount(up.steps, 0, 2, d), 0.5);
  assert.equal(blurAmount(up.steps, 1, 2, d), 1);
  const down = planTransition("explicit", "bikini", { bikini: pairB }, true);
  assert.equal(blurAmount(down.steps, 0, 0, d), 1);
  assert.equal(blurAmount(down.steps, 1, 2, d), 0);
});
