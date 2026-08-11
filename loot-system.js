export const LOOT_SLOTS = [
  { id: "head", label: "Head" },
  { id: "body", label: "Body" },
  { id: "weapon", label: "Weapon" },
  { id: "offhand", label: "Off hand" },
  { id: "boots", label: "Boots" },
  { id: "cloak", label: "Cloak" },
];

export const LOOT_RARITIES = {
  common: { label: "Common", rank: 1, color: "#8f8776", chance: 60 },
  uncommon: { label: "Uncommon", rank: 2, color: "#5f8f68", chance: 25 },
  rare: { label: "Rare", rank: 3, color: "#4f78a8", chance: 10 },
  epic: { label: "Epic", rank: 4, color: "#8b5aa5", chance: 4 },
  legendary: { label: "Legendary", rank: 5, color: "#c57a28", chance: 1 },
};

const names = {
  common: [
    ["pilgrims-hood", "Pilgrim’s Hood", "head", "⌃"],
    ["padded-jack", "Padded Jack", "body", "◇"],
    ["ashwood-sword", "Ashwood Sword", "weapon", "†"],
    ["tin-buckler", "Tin Buckler", "offhand", "◐"],
    ["roadworn-boots", "Roadworn Boots", "boots", "⌁"],
    ["tattered-mantle", "Tattered Mantle", "cloak", "≋"],
  ],
  uncommon: [
    ["rangers-cowl", "Ranger’s Cowl", "head", "⌃"],
    ["verdant-brigandine", "Verdant Brigandine", "body", "◈"],
    ["ironleaf-blade", "Ironleaf Blade", "weapon", "‡"],
    ["oakheart-shield", "Oakheart Shield", "offhand", "⬙"],
    ["mirestep-boots", "Mirestep Boots", "boots", "⌁"],
    ["hunters-cape", "Hunter’s Cape", "cloak", "≋"],
  ],
  rare: [
    ["crown-of-embers", "Crown of Embers", "head", "♜"],
    ["wyvern-scale", "Wyvern Scale", "body", "⬢"],
    ["frostfang", "Frostfang", "weapon", "⚔"],
    ["moonward", "Moonward", "offhand", "◒"],
    ["seven-league-boots", "Seven-League Boots", "boots", "⌁"],
    ["starlit-cloak", "Starlit Cloak", "cloak", "✦"],
  ],
  epic: [
    ["helm-of-the-hollow-king", "Helm of the Hollow King", "head", "♛"],
    ["dragonsworn-plate", "Dragonsworn Plate", "body", "⬢"],
    ["dawncleaver", "Dawncleaver", "weapon", "⚔"],
    ["aegis-of-echoes", "Aegis of Echoes", "offhand", "❖"],
    ["boots-of-the-rift", "Boots of the Rift", "boots", "⌁"],
    ["nightweave-mantle", "Nightweave Mantle", "cloak", "✧"],
  ],
  legendary: [
    ["crown-of-the-last-sun", "Crown of the Last Sun", "head", "♛"],
    ["armour-of-the-first-oath", "Armour of the First Oath", "body", "✺"],
    ["worldroot-blade", "Worldroot Blade", "weapon", "⚔"],
    ["shield-of-endless-dawn", "Shield of Endless Dawn", "offhand", "☼"],
    ["starstrider-greaves", "Starstrider Greaves", "boots", "⌁"],
    ["cloak-of-the-phoenix", "Cloak of the Phoenix", "cloak", "♨"],
  ],
};

export const LOOT_CATALOG = Object.entries(names).flatMap(([rarity, items]) =>
  items.map(([id, name, slot, glyph]) => ({ id, name, slot, glyph, rarity })),
);

export function createDefaultLootState() {
  return {
    pendingBoxes: 0,
    inventory: [],
    equipped: Object.fromEntries(LOOT_SLOTS.map((slot) => [slot.id, ""])),
    rewardedThroughLevel: 1,
    openedBoxes: 0,
    lastDropInstanceId: "",
  };
}

export function lootItem(itemId) {
  return LOOT_CATALOG.find((item) => item.id === itemId) || null;
}

export function normalizeLootState(saved) {
  const fallback = createDefaultLootState();
  if (!saved || typeof saved !== "object") return fallback;
  const inventory = (Array.isArray(saved.inventory) ? saved.inventory : []).filter(
    (entry) => entry && typeof entry.instanceId === "string" && lootItem(entry.itemId),
  );
  const inventoryIds = new Set(inventory.map((entry) => entry.instanceId));
  const equipped = Object.fromEntries(
    LOOT_SLOTS.map((slot) => {
      const instanceId = typeof saved.equipped?.[slot.id] === "string" ? saved.equipped[slot.id] : "";
      const instance = inventory.find((entry) => entry.instanceId === instanceId);
      return [slot.id, instance && lootItem(instance.itemId)?.slot === slot.id ? instanceId : ""];
    }),
  );
  return {
    pendingBoxes: Math.max(0, Math.floor(Number(saved.pendingBoxes) || 0)),
    inventory,
    equipped,
    rewardedThroughLevel: Math.max(1, Math.floor(Number(saved.rewardedThroughLevel) || 1)),
    openedBoxes: Math.max(0, Math.floor(Number(saved.openedBoxes) || 0)),
    lastDropInstanceId: inventoryIds.has(saved.lastDropInstanceId) ? saved.lastDropInstanceId : "",
  };
}

function unitRoll(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(0.999999999, Math.max(0, number));
}

export function rarityForRoll(value) {
  const roll = unitRoll(value);
  if (roll < 0.6) return "common";
  if (roll < 0.85) return "uncommon";
  if (roll < 0.95) return "rare";
  if (roll < 0.99) return "epic";
  return "legendary";
}

export function rollLootDrop(random = Math.random) {
  const rarity = rarityForRoll(random());
  const candidates = LOOT_CATALOG.filter((item) => item.rarity === rarity);
  return candidates[Math.floor(unitRoll(random()) * candidates.length)];
}

export function equippedLoot(lootState, slotId) {
  const instanceId = lootState?.equipped?.[slotId];
  const instance = lootState?.inventory?.find((entry) => entry.instanceId === instanceId);
  const item = instance ? lootItem(instance.itemId) : null;
  return item ? { ...instance, ...item } : null;
}

export function lootGearScore(lootState) {
  return LOOT_SLOTS.reduce((total, slot) => {
    const equipped = equippedLoot(lootState, slot.id);
    return total + (equipped ? LOOT_RARITIES[equipped.rarity].rank : 0);
  }, 0);
}
