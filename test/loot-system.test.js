import assert from "node:assert/strict";
import test from "node:test";
import { LOOT_CATALOG, LOOT_SLOTS, createDefaultLootState, equippedLoot, lootGearScore, normalizeLootState, rarityForRoll, rollLootDrop } from "../loot-system.js";

test("loot rarity boundaries keep valuable drops uncommon", () => {
  assert.equal(rarityForRoll(0), "common");
  assert.equal(rarityForRoll(0.599999), "common");
  assert.equal(rarityForRoll(0.6), "uncommon");
  assert.equal(rarityForRoll(0.85), "rare");
  assert.equal(rarityForRoll(0.95), "epic");
  assert.equal(rarityForRoll(0.99), "legendary");
  assert.equal(rarityForRoll(1), "legendary");
});

test("a deterministic chest roll selects from the rolled rarity", () => {
  const rolls = [0.991, 0.5];
  const drop = rollLootDrop(() => rolls.shift());
  const legendary = LOOT_CATALOG.filter((item) => item.rarity === "legendary");
  assert.equal(drop.rarity, "legendary");
  assert.deepEqual(drop, legendary[Math.floor(legendary.length * 0.5)]);
});

test("loot state normalization keeps only valid inventory and equipment", () => {
  const state = normalizeLootState({
    pendingBoxes: 2.8,
    rewardedThroughLevel: 4,
    inventory: [
      { instanceId: "valid", itemId: "worldroot-blade", obtainedAt: "2026-08-11T00:00:00.000Z" },
      { instanceId: "unknown", itemId: "not-real" },
    ],
    equipped: { weapon: "valid", head: "unknown" },
    lastDropInstanceId: "valid",
  });
  assert.equal(state.pendingBoxes, 2);
  assert.equal(state.inventory.length, 1);
  assert.equal(equippedLoot(state, "weapon")?.name, "Worldroot Blade");
  assert.equal(state.equipped.head, "");
  assert.equal(lootGearScore(state), 5);
});

test("default loot state exposes every outfit slot", () => {
  const state = createDefaultLootState();
  assert.deepEqual(Object.keys(state.equipped), LOOT_SLOTS.map((slot) => slot.id));
  assert.equal(state.rewardedThroughLevel, 1);
  assert.equal(state.pendingBoxes, 0);
});
