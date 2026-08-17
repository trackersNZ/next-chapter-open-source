import { boundedNotificationTime, concreteMedicationReminderId, finiteIntervalOccurrences, finiteIntervalReminderOccurrences, inclusiveCourseEndDate, medicationDoseLabel, medicationOccurrences, medicationScheduleLabel, medicationWasTakenRecently, nextIntervalOccurrence, weeklyOccurrences, weeklyScheduleLabel } from "./medication-schedule.js";
import { buildWeightChartGeometry, calculateWeightSummary, convertWaistMeasurement, escapeSvgAttribute, filterWeightEntriesByRange, normalizeWaistUnit, normalizeWeightEntries, waistInputRange, waistInputWithinBounds, waistToCanonicalCentimetres } from "./weight-tracker.js";
import { LOOT_RARITIES, LOOT_SLOTS, createDefaultLootState, equippedLoot, lootGearScore, lootItem, normalizeLootState, rollLootDrop } from "./loot-system.js";

const STORAGE_KEY = "next-chapter-state-v1";

const levels = [
  { level: 1, min: 0, title: "The Starter", reward: "Daily field notes" },
  { level: 2, min: 180, title: "The Navigator", reward: "Career compass" },
  { level: 3, min: 420, title: "The Storyteller", reward: "Executive story bank" },
  { level: 4, min: 720, title: "The Strategist", reward: "Opportunity scorecard" },
  { level: 5, min: 1080, title: "The Connector", reward: "Network map" },
  { level: 6, min: 1500, title: "The Influencer", reward: "Boardroom briefing" },
  { level: 7, min: 1980, title: "The Contender", reward: "Interview campaign" },
  { level: 8, min: 2520, title: "The Executive", reward: "The next chapter" },
];

const questPool = {
  presence: [
    {
      title: "Name your executive value",
      detail: "Write one sentence that links what you do best to a business outcome.",
      xp: 35,
      minutes: 6,
      icon: "compass",
    },
    {
      title: "Take the room",
      detail: "In your next conversation, speak in the first five minutes and make one clear recommendation.",
      xp: 55,
      minutes: 10,
      icon: "chair",
    },
    {
      title: "Rewrite the inner script",
      detail: "Turn one self-doubt into a factual statement about what you have already handled.",
      xp: 30,
      minutes: 5,
      icon: "pen",
    },
    {
      title: "Practise the pause",
      detail: "Answer three questions today with a two-second pause before you begin.",
      xp: 40,
      minutes: 8,
      icon: "pause",
    },
  ],
  speaking: [
    {
      title: "Speak before you feel ready",
      detail: "Record a 90-second answer to “Tell me about yourself.” Listen back once, with curiosity.",
      xp: 50,
      minutes: 8,
      icon: "mic",
    },
    {
      title: "Land the headline",
      detail: "Explain a complex idea in one sentence, then support it with three crisp points.",
      xp: 45,
      minutes: 10,
      icon: "headline",
    },
    {
      title: "Tell one leadership story",
      detail: "Rehearse a two-minute story with a clear tension, decision, and measurable result.",
      xp: 60,
      minutes: 12,
      icon: "story",
    },
    {
      title: "Remove the softener",
      detail: "Catch and replace “just”, “maybe”, or “I think” in one important message.",
      xp: 35,
      minutes: 5,
      icon: "edit",
    },
  ],
  momentum: [
    {
      title: "Map an opportunity",
      detail: "Choose one organisation and note its current priority, pressure, and where you could help.",
      xp: 45,
      minutes: 12,
      icon: "map",
    },
    {
      title: "Reach out with intent",
      detail: "Send one thoughtful message to a recruiter, sponsor, or leader in your target field.",
      xp: 60,
      minutes: 10,
      icon: "send",
    },
    {
      title: "Sharpen one proof point",
      detail: "Rewrite one CV bullet as: action, scale, outcome. Put the number near the front.",
      xp: 40,
      minutes: 8,
      icon: "spark",
    },
    {
      title: "Study the market",
      detail: "Read one executive role description and capture the three capabilities it signals.",
      xp: 35,
      minutes: 10,
      icon: "search",
    },
  ],
};

const stretchPool = [
  {
    title: "Ask for useful discomfort",
    detail: "Ask someone you trust: “What is one way I could show up with more authority?”",
    xp: 75,
    minutes: 15,
    track: "presence",
    icon: "bolt",
  },
  {
    title: "Publish a point of view",
    detail: "Share a short perspective on a business problem you understand deeply.",
    xp: 90,
    minutes: 25,
    track: "speaking",
    icon: "broadcast",
  },
  {
    title: "Create a warm introduction",
    detail: "Connect two people who would genuinely benefit from knowing each other.",
    xp: 80,
    minutes: 15,
    track: "momentum",
    icon: "link",
  },
];

const dailyCues = [
  {
    title: "Confidence arrives after the action, not before it.",
    note: "Make one move today that your future executive self would consider ordinary.",
  },
  {
    title: "Clarity is a form of leadership.",
    note: "Say the headline first today. Let your reasoning support it, not hide it.",
  },
  {
    title: "Visibility is not vanity when it helps others find your value.",
    note: "Let one person outside your usual circle see how you think.",
  },
  {
    title: "Your evidence is stronger than your nerves.",
    note: "Anchor today’s brave move in something difficult you have already done.",
  },
  {
    title: "The room does not need perfection. It needs your point of view.",
    note: "Offer a recommendation before every caveat has been resolved.",
  },
  {
    title: "Reputation grows in specific moments.",
    note: "Choose one interaction today and make it unusually useful.",
  },
  {
    title: "A career is built twice: first in intention, then in action.",
    note: "Protect twenty focused minutes for the role you want, not only the role you have.",
  },
];

const capabilityMeta = {
  presence: { label: "Executive presence", short: "Presence", color: "#c96542" },
  speaking: { label: "Public speaking", short: "Speaking", color: "#d39a36" },
  momentum: { label: "Search momentum", short: "Momentum", color: "#447d6a" },
};

function localDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function daySeed(dateKey = localDateKey()) {
  return [...dateKey].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function buildDailyQuests(dateKey = localDateKey(), extraQuestIndex = null) {
  const seed = daySeed(dateKey);
  const order = ["presence", "speaking", "momentum"];
  const quests = order.map((track, index) => {
    const source = questPool[track][(seed + index * 2) % questPool[track].length];
    return { ...source, track, id: `${dateKey}-${track}-${source.title}` };
  });
  const focusTrack = order[seed % order.length];
  const focusSource = questPool[focusTrack][(seed + 3) % questPool[focusTrack].length];
  if (!quests.some((quest) => quest.title === focusSource.title)) {
    quests.push({ ...focusSource, track: focusTrack, id: `${dateKey}-${focusTrack}-${focusSource.title}` });
  } else {
    const fallbackTrack = order[(seed + 1) % order.length];
    const fallback = questPool[fallbackTrack][(seed + 1) % questPool[fallbackTrack].length];
    quests.push({ ...fallback, track: fallbackTrack, id: `${dateKey}-${fallbackTrack}-${fallback.title}` });
  }
  if (extraQuestIndex !== null) {
    const stretch = stretchPool[extraQuestIndex % stretchPool.length];
    quests.push({ ...stretch, id: `${dateKey}-stretch-${extraQuestIndex}` });
  }
  return quests;
}

const defaultState = {
  xp: 0,
  completions: {},
  trackXp: { presence: 0, speaking: 0, momentum: 0 },
  reflections: {},
  profile: { name: "", targetRole: "", focus: "presence" },
  streak: 0,
  lastActiveDate: null,
  extraQuestByDate: {},
  todosByDate: {},
  books: [],
  medications: [],
  medLog: [],
  activityLog: [],
  weightEntries: [],
  waistUnit: "cm",
  notificationPrefs: { enabled: false, leadMinutes: 30, lastAlerts: {} },
  hasPersonalised: false,
  loot: createDefaultLootState(),
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      ...defaultState,
      ...saved,
      trackXp: { ...defaultState.trackXp, ...saved?.trackXp },
      profile: { ...defaultState.profile, ...saved?.profile },
      completions: saved?.completions || {},
      reflections: saved?.reflections || {},
      extraQuestByDate: saved?.extraQuestByDate || {},
      todosByDate: saved?.todosByDate || {},
      books: Array.isArray(saved?.books) ? saved.books : [],
      medications: Array.isArray(saved?.medications) ? saved.medications : [],
      medLog: Array.isArray(saved?.medLog) ? saved.medLog : [],
      activityLog: Array.isArray(saved?.activityLog) ? saved.activityLog : [],
      weightEntries: normalizeWeightEntries(saved?.weightEntries),
      waistUnit: normalizeWaistUnit(saved?.waistUnit),
      notificationPrefs: { ...defaultState.notificationPrefs, ...saved?.notificationPrefs, lastAlerts: saved?.notificationPrefs?.lastAlerts || {} },
      loot: normalizeLootState(saved?.loot),
    };
  } catch {
    return structuredClone(defaultState);
  }
}

let state = loadState();
let toastTimer;
let selectedTodoDate = localDateKey();
let selectedTodoCategory = "all";
let selectedWeightRange = "3m";
let pushApiBase = "";
let pushSyncTimer;
let editingMedicationId = null;
let correctingMedicationId = null;
let lootOpening = false;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (state.notificationPrefs.deviceId) schedulePushSync();
}

function currentLevel(xp = state.xp) {
  return [...levels].reverse().find((item) => xp >= item.min) || levels[0];
}

function nextLevel(xp = state.xp) {
  return levels.find((item) => item.min > xp) || null;
}

function grantLootBoxesThroughLevel(levelNumber) {
  const reachedLevel = Math.max(1, Math.floor(Number(levelNumber) || 1));
  const rewardedLevel = Math.max(1, state.loot.rewardedThroughLevel);
  const boxesEarned = Math.max(0, reachedLevel - rewardedLevel);
  if (!boxesEarned) return 0;
  state.loot.pendingBoxes += boxesEarned;
  state.loot.rewardedThroughLevel = reachedLevel;
  return boxesEarned;
}

function awardLifeXp(amount, title, detail, type) {
  if (!amount) return null;
  const previousLevel = currentLevel().level;
  state.xp += amount;
  state.activityLog.unshift({
    id: makeId("activity"),
    type,
    title,
    xp: amount,
    completedAt: new Date().toISOString(),
  });
  showToast(title, `+${amount} XP · ${detail}`);
  const reachedLevel = currentLevel();
  if (reachedLevel.level <= previousLevel) return null;
  return { ...reachedLevel, lootBoxesEarned: grantLootBoxesThroughLevel(reachedLevel.level) };
}

function daysBetween(dateA, dateB) {
  const a = new Date(`${dateA}T12:00:00`);
  const b = new Date(`${dateB}T12:00:00`);
  return Math.round((b - a) / 86400000);
}

function updateStreak(dateKey) {
  if (state.lastActiveDate === dateKey) return;
  const gap = state.lastActiveDate ? daysBetween(state.lastActiveDate, dateKey) : null;
  state.streak = gap === 1 ? state.streak + 1 : 1;
  state.lastActiveDate = dateKey;
}

function getTodayQuests() {
  const key = localDateKey();
  return buildDailyQuests(key, state.extraQuestByDate[key] ?? null);
}

function completedToday() {
  return getTodayQuests().filter((quest) => state.completions[quest.id]);
}

function icon(name) {
  const paths = {
    compass: '<circle cx="12" cy="12" r="8"/><path d="m15 9-2 4-4 2 2-4 4-2Z"/>',
    chair: '<path d="M6 12h12v7H6zM8 12V8a4 4 0 0 1 8 0v4M4 19h16M8 19v2M16 19v2"/>',
    pen: '<path d="m4 20 4-1 10-10-3-3L5 16l-1 4ZM13 8l3 3M14 5l2-2 3 3-2 2"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
    headline: '<path d="M4 5h16M4 10h11M4 15h16M4 20h8"/>',
    story: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z"/><path d="M8 9h8M8 13h6M8 17h8"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4M4 12V5h7"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15"/>',
    send: '<path d="m3 11 18-8-8 18-2-8-8-2ZM11 13l5-5"/>',
    spark: '<path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3ZM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    bolt: '<path d="M13 2 5 14h7l-1 8 8-12h-7l1-8Z"/>',
    broadcast: '<path d="M8.5 8.5a5 5 0 0 0 0 7M5.5 5.5a9 9 0 0 0 0 13M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/><circle cx="12" cy="12" r="2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.compass}</svg>`;
}

function formatDate() {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(new Date())
    .toUpperCase();
}

function renderHeader() {
  document.querySelector("#today-date").textContent = formatDate();
  document.querySelector("#streak-count").textContent = state.streak;
  document.querySelector("#streak-button").setAttribute(
    "aria-label",
    `${state.streak} day streak. View the quests for today.`,
  );
  const name = state.profile.name.trim();
  document.querySelector("#avatar-initials").textContent = name
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
    : "ME";
  document.querySelector("#hero-intro").textContent = name
    ? `${name}, here’s a calm view of what matters today.`
    : "Tasks, health, reading and growth — one calm view of what matters today.";
}

function renderLevel() {
  const level = currentLevel();
  const next = nextLevel();
  const range = next ? next.min - level.min : 1;
  const progress = next ? Math.min(100, ((state.xp - level.min) / range) * 100) : 100;
  document.querySelector("#level-number").textContent = String(level.level).padStart(2, "0");
  document.querySelector("#ring-level").textContent = level.level;
  document.querySelector("#level-title").textContent = level.title;
  document.querySelector("#current-xp").textContent = state.xp;
  document.querySelector("#xp-progress").style.width = `${progress}%`;
  document.querySelector("#xp-ring").style.strokeDashoffset = 270 - (270 * progress) / 100;
  document.querySelector("#xp-to-next").textContent = next ? next.min - state.xp : 0;
  document.querySelector(".xp-copy span:last-child").innerHTML = next
    ? `<span id="xp-to-next">${next.min - state.xp}</span> XP to Level ${next.level}`
    : "Highest level reached";
  document.querySelector("#next-unlock").textContent = next ? next.reward : "Your next chapter";
}

function renderCue() {
  const cue = dailyCues[daySeed() % dailyCues.length];
  document.querySelector("#coach-title").textContent = cue.title;
  document.querySelector("#coach-note").textContent = cue.note;
}

function renderQuests() {
  const quests = getTodayQuests();
  const list = document.querySelector("#quest-list");
  const doneCount = quests.filter((quest) => state.completions[quest.id]).length;
  document.querySelector("#quest-completed").textContent = doneCount;
  document.querySelector("#quest-total").textContent = quests.length;
  list.innerHTML = quests
    .map((quest, index) => {
      const done = Boolean(state.completions[quest.id]);
      const meta = capabilityMeta[quest.track];
      return `
        <article class="quest-card ${done ? "complete" : ""}" style="--quest-color:${meta.color}">
          <div class="quest-icon">${icon(quest.icon)}</div>
          <div class="quest-body">
            <div class="quest-meta">
              <span>${meta.short}</span>
              <span>${quest.minutes} min</span>
            </div>
            <h3>${quest.title}</h3>
            <p>${quest.detail}</p>
          </div>
          <div class="quest-reward">
            <span>+${quest.xp} XP</span>
            <button
              class="complete-button"
              data-quest-index="${index}"
              aria-label="${done ? "Mark incomplete" : "Complete"}: ${quest.title}"
              aria-pressed="${done}"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>
            </button>
          </div>
        </article>`;
    })
    .join("");

  list.querySelectorAll(".complete-button").forEach((button) => {
    button.addEventListener("click", () => toggleQuest(quests[Number(button.dataset.questIndex)]));
  });

  const addButton = document.querySelector("#add-quest");
  addButton.disabled = state.extraQuestByDate[localDateKey()] !== undefined;
  addButton.innerHTML = addButton.disabled
    ? '<span aria-hidden="true">✓</span> Stretch quest added'
    : '<span aria-hidden="true">＋</span> Add a stretch quest';
}

function toggleQuest(quest) {
  const wasLevel = currentLevel().level;
  const wasComplete = Boolean(state.completions[quest.id]);
  if (wasComplete) {
    delete state.completions[quest.id];
    state.xp = Math.max(0, state.xp - quest.xp);
    state.trackXp[quest.track] = Math.max(0, state.trackXp[quest.track] - quest.xp);
    showToast("Quest reopened", `${quest.xp} XP removed. The practice is ready when you are.`, false);
  } else {
    state.completions[quest.id] = {
      completedAt: new Date().toISOString(),
      xp: quest.xp,
      track: quest.track,
      title: quest.title,
    };
    state.xp += quest.xp;
    state.trackXp[quest.track] += quest.xp;
    updateStreak(localDateKey());
    showToast("Quest complete", `+${quest.xp} XP · ${capabilityMeta[quest.track].label}`);
  }
  const reachedLevel = currentLevel();
  const lootBoxesEarned = !wasComplete && reachedLevel.level > wasLevel ? grantLootBoxesThroughLevel(reachedLevel.level) : 0;
  saveState();
  renderAll();
  if (!wasComplete && reachedLevel.level > wasLevel) showLevelUp({ ...reachedLevel, lootBoxesEarned });
}

function renderCapabilities() {
  const total = Object.values(state.trackXp).reduce((sum, value) => sum + value, 0);
  const focus = state.profile.focus;
  document.querySelector("#capability-list").innerHTML = Object.entries(capabilityMeta)
    .map(([key, meta]) => {
      const baseline = focus === key ? 12 : 5;
      const percentage = total ? Math.round((state.trackXp[key] / Math.max(total, 1)) * 70) + baseline : baseline;
      const capped = Math.min(100, percentage);
      return `
        <div class="capability">
          <div class="capability-copy">
            <span><i style="--dot-color:${meta.color}"></i>${meta.label}</span>
            <strong>${capped}%</strong>
          </div>
          <div class="capability-track"><span style="width:${capped}%;--bar-color:${meta.color}"></span></div>
        </div>`;
    })
    .join("");
}

function startOfWeek(date = new Date()) {
  const result = new Date(date);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  result.setHours(12, 0, 0, 0);
  return result;
}

function getWeeklyData() {
  const start = startOfWeek();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDateKey(date);
    const entries = [...Object.values(state.completions), ...state.activityLog].filter(
      (completion) => localDateKey(new Date(completion.completedAt)) === key,
    );
    return { date, key, xp: entries.reduce((sum, item) => sum + item.xp, 0), count: entries.length };
  });
  return { days, xp: days.reduce((sum, day) => sum + day.xp, 0) };
}

function renderWeek() {
  const weekly = getWeeklyData();
  const today = localDateKey();
  document.querySelector("#weekly-xp").textContent = weekly.xp;
  document.querySelector("#week-badge").textContent =
    weekly.xp >= 300 ? "On fire" : weekly.xp >= 150 ? "Building" : weekly.xp > 0 ? "In motion" : "Begin";
  document.querySelector("#weekly-message").textContent =
    weekly.xp >= 300
      ? "Strong rhythm. Protect it with one meaningful action tomorrow."
      : weekly.xp > 0
        ? "Momentum is visible. A small move tomorrow keeps it alive."
        : "Your first completed quest starts the rhythm.";
  document.querySelector("#week-days").innerHTML = weekly.days
    .map((day) => {
      const label = new Intl.DateTimeFormat("en-NZ", { weekday: "narrow" }).format(day.date);
      const future = day.key > today;
      return `
        <div class="week-day ${day.count ? "done" : ""} ${day.key === today ? "today" : ""} ${future ? "future" : ""}">
          <span>${label}</span>
          <i>${day.count ? "✓" : day.date.getDate()}</i>
        </div>`;
    })
    .join("");
}

function renderReflection() {
  document.querySelector("#reflection-input").value = state.reflections[localDateKey()] || "";
}

function renderJourney() {
  const activeLevel = currentLevel().level;
  document.querySelector("#journey-map").innerHTML = levels
    .map((item, index) => {
      const status = item.level < activeLevel ? "complete" : item.level === activeLevel ? "active" : "locked";
      return `
        <article class="journey-level ${status}">
          <div class="journey-node">
            <span>${status === "complete" ? "✓" : String(item.level).padStart(2, "0")}</span>
          </div>
          <div class="journey-copy">
            <p>LEVEL ${String(item.level).padStart(2, "0")} · ${item.min} XP</p>
            <h2>${item.title}</h2>
            <span>${status === "locked" ? "Unlocks" : status === "active" ? "Working toward" : "Unlocked"}: ${item.reward}</span>
          </div>
          ${index < levels.length - 1 ? '<div class="journey-line"></div>' : ""}
        </article>`;
    })
    .join("");
}

function renderInsights() {
  const completionEntries = Object.values(state.completions);
  const strongest = Object.entries(state.trackXp).sort((a, b) => b[1] - a[1])[0];
  const avgXp = state.streak ? Math.round(state.xp / state.streak) : 0;
  const recentWins = completionEntries
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 4);
  document.querySelector("#insight-grid").innerHTML = `
    <article class="insight-stat">
      <p class="eyebrow">TOTAL PRACTICE</p>
      <strong>${completionEntries.length}</strong>
      <span>quests completed</span>
    </article>
    <article class="insight-stat">
      <p class="eyebrow">STRONGEST SIGNAL</p>
      <strong class="word-stat">${strongest[1] ? capabilityMeta[strongest[0]].short : "Unwritten"}</strong>
      <span>${strongest[1] ? `${strongest[1]} XP invested` : "Complete a quest to reveal it"}</span>
    </article>
    <article class="insight-stat">
      <p class="eyebrow">DAILY INTENSITY</p>
      <strong>${avgXp}</strong>
      <span>XP per active day</span>
    </article>
    <article class="insight-journal">
      <p class="eyebrow">RECENT EVIDENCE</p>
      <h2>The actions you can point to.</h2>
      <div class="evidence-list">
        ${
          recentWins.length
            ? recentWins
                .map(
                  (win) => `
                    <div>
                      <span>✓</span>
                      <p><strong>${win.title}</strong><small>${capabilityMeta[win.track].label} · +${win.xp} XP</small></p>
                    </div>`,
                )
                .join("")
            : "<p class='empty-evidence'>Your completed quests will become a record of deliberate growth.</p>"
        }
      </div>
    </article>`;
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function formatMeasurement(value, unit) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ${unit}` : "—";
}

function formatMeasurementDate(dateKey) {
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${dateKey}T12:00:00`));
}

function formatMeasurementChange(value, unit) {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return `No change ${unit}`;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} ${unit}`;
}

function currentWaistUnit() {
  return normalizeWaistUnit(state.waistUnit);
}

function waistUnitLabel(unit = currentWaistUnit()) {
  return unit === "in" ? "inches" : "centimetres";
}

function waistInputBounds(unit = currentWaistUnit()) {
  const { min, max } = waistInputRange(unit);
  return { min: String(min), max: String(max), placeholder: unit === "in" ? "e.g. 32.5" : "e.g. 82.5" };
}

function waistForDisplay(value) {
  return value === null ? null : convertWaistMeasurement(value, "cm", currentWaistUnit());
}

function formatWaist(value) {
  const displayValue = waistForDisplay(value);
  return displayValue === null ? "—" : formatMeasurement(displayValue, currentWaistUnit());
}

function formatWaistChange(value) {
  const displayValue = convertWaistMeasurement(value, "cm", currentWaistUnit());
  return displayValue === null ? "—" : formatMeasurementChange(displayValue, currentWaistUnit());
}

function configureWaistInput() {
  const unit = currentWaistUnit();
  const bounds = waistInputBounds(unit);
  const input = document.querySelector("#waist-value");
  document.querySelector("#waist-unit").value = unit;
  document.querySelector("#waist-unit-copy").textContent = "(" + unit + ", optional)";
  document.querySelector("#waist-input-help").textContent = "Optional waist measurement in " + waistUnitLabel(unit) + ".";
  input.min = bounds.min;
  input.max = bounds.max;
  input.step = "0.1";
  input.placeholder = bounds.placeholder;
}

function convertCurrentWaistInput(fromUnit, toUnit) {
  const input = document.querySelector("#waist-value");
  const rawValue = input.value.trim();
  if (!rawValue) return;
  const converted = convertWaistMeasurement(rawValue, fromUnit, toUnit);
  if (converted !== null) input.value = String(Number(converted.toFixed(1)));
}

function measurementDetail(entry) {
  if (!entry) return "Add measurements to see the chart.";
  return formatMeasurementDate(entry.date) + ": " + formatMeasurement(entry.weight, "kg") + (entry.waist === null ? "" : " · " + formatWaist(entry.waist)) + (entry.note ? " · " + entry.note : "");
}
function pointAriaLabel(entry, waistIsDisplay = false) {
  const waist = entry.waist === null ? "" : " · " + (waistIsDisplay ? formatMeasurement(entry.waist, currentWaistUnit()) : formatWaist(entry.waist));
  return formatMeasurementDate(entry.date) + ": " + formatMeasurement(entry.weight, "kg") + waist;
}

function renderWeightChart(entries) {
  const chart = document.querySelector("#weight-chart");
  const detail = document.querySelector("#weight-chart-detail");
  if (!entries.length) {
    chart.innerHTML = '<div class="weight-chart-empty"><span aria-hidden="true">◒</span><p>No measurements in this period yet.</p></div>';
    chart.setAttribute("aria-label", "No measurements in the selected period.");
    detail.textContent = "Add measurements to see the chart.";
    return;
  }
  const unit = currentWaistUnit();
  const displayEntries = entries.map((entry) => ({ ...entry, waist: waistForDisplay(entry.waist) }));
  const geometry = buildWeightChartGeometry(displayEntries);
  const labels = geometry.grid.map((grid) => `
    <g class="weight-grid-line"><line x1="${geometry.margin.left}" y1="${grid.y.toFixed(2)}" x2="${(geometry.width - geometry.margin.right).toFixed(2)}" y2="${grid.y.toFixed(2)}" /><text x="${geometry.margin.left - 9}" y="${(grid.y + 3).toFixed(2)}" text-anchor="end">${grid.weight.toFixed(1)}</text>${grid.waist === null ? "" : `<text x="${geometry.width - geometry.margin.right + 9}" y="${(grid.y + 3).toFixed(2)}">${grid.waist.toFixed(1)}</text>`}</g>`).join("");
  const dates = geometry.xTicks.map((tick) => `<text class="weight-axis-date" x="${tick.x.toFixed(2)}" y="${geometry.height - 15}" text-anchor="middle">${formatMeasurementDate(tick.date)}</text>`).join("");
  const weightPoints = geometry.weightPoints.map((point) => `<circle class="weight-point" data-weight-point="${point.date}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="5" tabindex="0" role="button" aria-label="${escapeSvgAttribute(pointAriaLabel(point, true))}" />`).join("");
  const waistPoints = geometry.waistPoints.map((point) => `<circle class="waist-point" data-weight-point="${point.date}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4" tabindex="0" role="button" aria-label="${escapeSvgAttribute(pointAriaLabel(point, true))}" />`).join("");
  const chartLabel = entries.length + " measurement" + (entries.length === 1 ? "" : "s") + ". Weight is shown in kilograms" + (geometry.waistPoints.length ? "; waist is shown in " + waistUnitLabel(unit) + "." : ".");
  const waistLegend = '<span><i class="weight-legend-waist"></i>Waist · ' + unit + '</span>';
  chart.innerHTML = `
    <svg viewBox="0 0 ${geometry.width} ${geometry.height}" role="group" aria-label="${chartLabel}" aria-describedby="weight-chart-detail" focusable="false">
      <defs><linearGradient id="weight-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#c96542" stop-opacity=".32"/><stop offset="100%" stop-color="#c96542" stop-opacity=".015"/></linearGradient></defs>
      <g class="weight-grid">${labels}</g>
      <path class="weight-area" d="${geometry.areaPath}" />
      <path class="weight-line" d="${geometry.weightPath}" />
      ${geometry.waistPath ? `<path class="waist-line" d="${geometry.waistPath}" />` : ""}
      <g class="weight-points">${weightPoints}${waistPoints}</g>
      <g class="weight-axis">${dates}<text x="${geometry.margin.left}" y="17">KG</text>${geometry.waistPoints.length ? `<text x="${geometry.width - geometry.margin.right}" y="17" text-anchor="end">${unit.toUpperCase()}</text>` : ""}</g>
    </svg>
    <div class="weight-legend"><span><i class="weight-legend-weight"></i>Weight · kg</span>${geometry.waistPoints.length ? waistLegend : ""}</div>`;
  const latest = entries.at(-1);
  detail.textContent = measurementDetail(latest);
  chart.querySelectorAll("[data-weight-point]").forEach((point) => {
    const updateDetail = () => {
      const entry = entries.find((candidate) => candidate.date === point.dataset.weightPoint);
      detail.textContent = measurementDetail(entry);
    };
    point.addEventListener("mouseenter", updateDetail);
    point.addEventListener("focus", updateDetail);
    point.addEventListener("click", updateDetail);
  });
}

function renderWeightTracker() {
  configureWaistInput();
  const allEntries = normalizeWeightEntries(state.weightEntries);
  state.weightEntries = allEntries;
  const entries = filterWeightEntriesByRange(allEntries, selectedWeightRange);
  const summary = calculateWeightSummary(entries);
  document.querySelectorAll(".weight-range").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.weightRange === selectedWeightRange)));
  document.querySelector("#weight-latest").textContent = summary.latest ? formatMeasurement(summary.latest.weight, "kg") : "—";
  document.querySelector("#weight-latest-date").textContent = summary.latest ? formatMeasurementDate(summary.latest.date) : "No measurements yet";
  document.querySelector("#weight-change").textContent = entries.length > 1 ? formatMeasurementChange(summary.weightChange, "kg") : "—";
  document.querySelector("#weight-change-note").textContent = entries.length > 1 ? `Across ${entries.length} selected measurements` : "Add two entries to compare";
  document.querySelector("#waist-latest").textContent = summary.latestWaist ? formatWaist(summary.latestWaist.waist) : "—";
  document.querySelector("#waist-change-note").textContent = summary.latestWaist ? (summary.waistChange === null ? formatMeasurementDate(summary.latestWaist.date) : `${formatWaistChange(summary.waistChange)} across selected waist entries`) : "Optional measurement";
  renderWeightChart(entries);
  document.querySelector("#weight-history-count").textContent = `${allEntries.length} ${allEntries.length === 1 ? "entry" : "entries"}`;
  const history = document.querySelector("#weight-history-list");
  history.innerHTML = allEntries.length ? [...allEntries].reverse().map((entry) => `
    <article class="weight-history-entry">
      <div><time datetime="${entry.date}">${formatMeasurementDate(entry.date)}</time><strong>${formatMeasurement(entry.weight, "kg")}</strong>${entry.waist === null ? "" : `<span>${formatWaist(entry.waist)}</span>`}${entry.note ? `<small>${escapeHtml(entry.note)}</small>` : ""}</div>
      <button class="row-delete weight-delete" type="button" data-weight-delete="${entry.id}" aria-label="Delete measurement from ${formatMeasurementDate(entry.date)}">×</button>
    </article>`).join("") : '<div class="admin-empty weight-history-empty"><span>◒</span><h3>Your record starts here.</h3><p>Add a dated measurement to build a private, useful history.</p></div>';
  history.querySelectorAll("[data-weight-delete]").forEach((button) => button.addEventListener("click", () => {
    state.weightEntries = state.weightEntries.filter((entry) => entry.id !== button.dataset.weightDelete);
    saveState();
    renderWeightTracker();
    renderLifeSnapshot();
    document.querySelector("#weight-form-status").textContent = "Measurement deleted.";
  }));
}
const todoPriority = {
  high: { label: "High", rank: 0 },
  normal: { label: "Normal", rank: 1 },
  low: { label: "Low", rank: 2 },
};

const todoCategory = {
  personal: "Personal",
  work: "Work",
  home: "Home",
  health: "Health",
  errands: "Errands",
};

const todoRepeat = {
  daily: "Every day",
  weekdays: "Weekdays",
  weekly: "Every week",
};

function recurrenceAppliesOn(todo, dateKey) {
  if (!todo.repeat || todo.repeat === "none" || !todo.repeatStartDate || dateKey <= todo.repeatStartDate) return false;
  const date = new Date(`${dateKey}T12:00:00`);
  if (todo.repeat === "daily") return true;
  if (todo.repeat === "weekdays") return date.getDay() > 0 && date.getDay() < 6;
  if (todo.repeat === "weekly") return date.getDay() === new Date(`${todo.repeatStartDate}T12:00:00`).getDay();
  return false;
}

function materializeRecurringTodos(dateKey) {
  const list = state.todosByDate[dateKey] || [];
  const instances = new Set(list.map((todo) => todo.parentId));
  const templates = Object.values(state.todosByDate).flat().filter((todo) => !todo.parentId && recurrenceAppliesOn(todo, dateKey));
  const additions = templates.filter((todo) => !instances.has(todo.id)).map((todo) => ({
    ...todo,
    id: `${todo.id}::${dateKey}`,
    parentId: todo.id,
    done: false,
    createdAt: todo.createdAt,
  }));
  if (additions.length) state.todosByDate[dateKey] = [...list, ...additions];
  return state.todosByDate[dateKey] || [];
}

function nextRecurringTodoDueAt(todo, now = Date.now()) {
  const startAt = new Date(`${todo.repeatStartDate}T${todo.time}:00`).getTime();
  if (!Number.isFinite(startAt)) return null;
  if (todo.repeat === "daily" || todo.repeat === "weekly") {
    const interval = todo.repeat === "daily" ? 86400000 : 604800000;
    return startAt + Math.max(0, Math.ceil((now - startAt) / interval)) * interval;
  }
  if (todo.repeat === "weekdays") {
    const cursor = new Date(Math.max(startAt, now));
    const [hours, minutes] = todo.time.split(":").map(Number);
    cursor.setHours(hours, minutes, 0, 0);
    if (cursor.getTime() < now) cursor.setDate(cursor.getDate() + 1);
    for (let index = 0; index < 8; index += 1) {
      if (cursor.getDay() > 0 && cursor.getDay() < 6) return cursor.getTime();
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(...todo.time.split(":").map(Number), 0, 0);
    }
  }
  return null;
}

function upcomingWeekdayTodoDueAts(todo, now = Date.now(), count = 8) {
  const first = nextRecurringTodoDueAt(todo, now);
  if (!first) return [];
  const occurrences = [];
  const cursor = new Date(first);
  while (occurrences.length < count) {
    if (cursor.getDay() > 0 && cursor.getDay() < 6) occurrences.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  return occurrences;
}

function todoTiming(dateKey, todo, now = Date.now()) {
  if (!todo.time) return { dueAt: null, overdue: !todo.done && dateKey < localDateKey(), label: dateKey < localDateKey() ? "Overdue" : "" };
  const dueAt = new Date(`${dateKey}T${todo.time}:00`).getTime();
  const overdue = !todo.done && dueAt < now;
  return {
    dueAt,
    overdue,
    label: overdue ? "Overdue" : new Intl.DateTimeFormat("en-NZ", { hour: "numeric", minute: "2-digit" }).format(new Date(dueAt)),
  };
}

function renderTodos() {
  const dateInput = document.querySelector("#todo-date");
  dateInput.value = selectedTodoDate;
  const categoryFilter = document.querySelector("#todo-category-filter");
  categoryFilter.value = selectedTodoCategory;
  const allTodos = [...materializeRecurringTodos(selectedTodoDate)];
  const todos = allTodos.filter((todo) => selectedTodoCategory === "all" || (todo.category || "personal") === selectedTodoCategory).sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (todoPriority[a.priority]?.rank ?? 1) - (todoPriority[b.priority]?.rank ?? 1);
  });
  const completed = allTodos.filter((todo) => todo.done).length;
  const percent = allTodos.length ? Math.round((completed / allTodos.length) * 100) : 0;
  document.querySelector("#todo-progress-copy").textContent = todos.length
    ? `${completed} of ${allTodos.length} complete${selectedTodoCategory === "all" ? "" : ` · ${todoCategory[selectedTodoCategory]}`}`
    : selectedTodoCategory === "all" ? "Nothing on the list yet" : `No ${todoCategory[selectedTodoCategory].toLowerCase()} tasks today`;
  document.querySelector("#todo-progress-bar").style.width = `${percent}%`;
  const clearButton = document.querySelector("#clear-completed");
  clearButton.hidden = completed === 0;
  document.querySelector("#todo-list").innerHTML = todos.length
    ? todos.map((todo) => {
        const timing = todoTiming(selectedTodoDate, todo);
        const priority = todoPriority[todo.priority] || todoPriority.normal;
        const category = todo.category || "personal";
        return `
          <article class="todo-item priority-${todo.priority || "normal"} ${todo.done ? "done" : ""} ${timing.overdue ? "overdue" : ""}">
            <button class="todo-check" data-todo-action="toggle" data-todo-id="${todo.id}" aria-label="${todo.done ? "Reopen" : "Complete"} ${escapeHtml(todo.text)}" aria-pressed="${todo.done}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>
            </button>
            <div class="todo-copy">
              <span>${escapeHtml(todo.text)}</span>
              <div class="todo-meta"><b>${priority.label} priority</b><b class="category-${category}">${todoCategory[category] || todoCategory.personal}</b>${todo.repeat && todo.repeat !== "none" ? `<b>↻ ${todoRepeat[todo.repeat]}</b>` : ""}${timing.label ? `<b class="${timing.overdue ? "is-overdue" : ""}">${timing.label}</b>` : ""}</div>
              ${todo.notes ? `<small>${escapeHtml(todo.notes)}</small>` : ""}
            </div>
            <button class="row-delete" data-todo-action="delete" data-todo-id="${todo.id}" aria-label="Delete ${escapeHtml(todo.text)}">×</button>
          </article>`;
      }).join("")
    : `<div class="admin-empty"><span>✓</span><h3>A fresh page.</h3><p>Add the first thing you want out of your head.</p></div>`;

  document.querySelectorAll("[data-todo-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const list = state.todosByDate[selectedTodoDate] || [];
      const index = list.findIndex((todo) => todo.id === button.dataset.todoId);
      if (index < 0) return;
      if (button.dataset.todoAction === "delete") {
        const [removed] = list.splice(index, 1);
        if (!removed.parentId && removed.repeat && removed.repeat !== "none") {
          Object.keys(state.todosByDate).forEach((dateKey) => {
            state.todosByDate[dateKey] = state.todosByDate[dateKey].filter((todo) => todo.parentId !== removed.id);
          });
        }
      }
      else list[index].done = !list[index].done;
      state.todosByDate[selectedTodoDate] = list;
      saveState();
      renderTodos();
      renderLifeSnapshot();
    });
  });
}
function renderBooks() {
  const reading = state.books.filter((book) => book.status === "Reading").length;
  const finished = state.books.filter((book) => book.status === "Finished").length;
  document.querySelector("#reading-count").textContent = reading;
  document.querySelector("#finished-count").textContent = finished;
  document.querySelector("#book-shelf").innerHTML = state.books.length
    ? state.books
        .map(
          (book) => `
            <article class="book-card ${book.status === "Finished" ? "finished" : ""}">
              <div class="book-spine" aria-hidden="true"><span>${book.format === "Audiobook" ? "◉" : "▤"}</span></div>
              <div class="book-copy">
                <p class="book-format">${escapeHtml(book.format)}</p>
                <h2>${escapeHtml(book.title)}</h2>
                <p>${book.author ? escapeHtml(book.author) : "Author not added"}</p>
                ${book.format === "Audiobook" && (book.currentTime || book.totalTime) ? `<p class="audiobook-position">Listening: ${escapeHtml(book.currentTime || "Not set")}${book.totalTime ? ` of ${escapeHtml(book.totalTime)}` : ""}</p>` : ""}
              </div>
              <label class="book-status">Status
                <select data-book-status="${book.id}">
                  ${["Want to read", "Reading", "Paused", "Finished"].map((status) => `<option ${book.status === status ? "selected" : ""}>${status}</option>`).join("")}
                </select>
              </label>
              <label class="book-progress">Progress · +2 XP per new 5% <output id="book-output-${book.id}">${book.progress}%</output>
                <input type="range" min="0" max="100" step="5" value="${book.progress}" data-book-progress="${book.id}" />
              </label>
              <button class="row-delete book-delete" data-book-delete="${book.id}" aria-label="Remove ${escapeHtml(book.title)}">×</button>
            </article>`,
        )
        .join("")
    : `<div class="admin-empty shelf-empty"><span>▤</span><h3>Your shelf is waiting.</h3><p>Add a book or audiobook above to start tracking it.</p></div>`;

  document.querySelectorAll("[data-book-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const book = state.books.find((item) => item.id === select.dataset.bookStatus);
      if (!book) return;
      book.status = select.value;
      if (book.status === "Finished") book.progress = 100;
      const levelUp = awardBookProgress(book);
      saveState();
      renderAll();
      if (levelUp) showLevelUp(levelUp);
    });
  });
  document.querySelectorAll("[data-book-progress]").forEach((range) => {
    range.addEventListener("input", () => {
      const book = state.books.find((item) => item.id === range.dataset.bookProgress);
      if (!book) return;
      book.progress = Number(range.value);
      if (book.progress === 100) book.status = "Finished";
      else if (book.status === "Finished") book.status = "Reading";
      document.querySelector(`#book-output-${book.id}`).textContent = `${book.progress}%`;
      saveState();
      renderLifeSnapshot();
    });
    range.addEventListener("change", () => {
      const book = state.books.find((item) => item.id === range.dataset.bookProgress);
      if (!book) return;
      const levelUp = awardBookProgress(book);
      saveState();
      renderAll();
      if (levelUp) showLevelUp(levelUp);
    });
  });
  document.querySelectorAll("[data-book-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.books = state.books.filter((book) => book.id !== button.dataset.bookDelete);
      saveState();
      renderBooks();
      renderLifeSnapshot();
    });
  });
}

function awardBookProgress(book) {
  const rewardedProgress = Number(book.rewardedProgress || 0);
  const newRewardedProgress = Math.max(rewardedProgress, Number(book.progress || 0));
  const milestones = Math.floor(newRewardedProgress / 5) - Math.floor(rewardedProgress / 5);
  if (milestones <= 0) return null;
  book.rewardedProgress = newRewardedProgress;
  const amount = milestones * 2;
  return awardLifeXp(amount, "Reading progress", `${book.title} moved forward`, "book-progress");
}

function medicationTimingLabel(dueAt, now) {
  const diff = dueAt - now;
  const absoluteHours = Math.max(1, Math.round(Math.abs(diff) / 3600000));
  const relative = absoluteHours >= 48
    ? `${Math.round(absoluteHours / 24)} days`
    : `${absoluteHours} ${absoluteHours === 1 ? "hour" : "hours"}`;
  return {
    due: diff <= 0,
    dueAt,
    sortTime: dueAt,
    label: diff <= 0 ? `Due ${relative} ago` : `Due in ${relative}`,
    detail: new Intl.DateTimeFormat("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(dueAt)),
  };
}

function medicationCourseStatus(medication, now = new Date()) {
  const today = localDateKey(now);
  if (medication.courseStartDate && today < medication.courseStartDate) return "upcoming";
  if (medication.courseEndDate && today > medication.courseEndDate) return "complete";
  return "active";
}

function medicationCourseRange(medication) {
  if (!medication.courseStartDate && !medication.courseEndDate) return "Ongoing";
  const display = (value) => new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  return medication.courseStartDate && medication.courseEndDate ? `${display(medication.courseStartDate)} – ${display(medication.courseEndDate)}` : medication.courseStartDate ? `From ${display(medication.courseStartDate)}` : `Until ${display(medication.courseEndDate)}`;
}

function medicationTiming(medication, now = Date.now()) {
  const status = medicationCourseStatus(medication, new Date(now));
  const recentlyTaken = medicationWasTakenRecently(medication, now);
  if (status === "upcoming") {
    const startsAt = new Date(`${medication.courseStartDate}T00:00:00`).getTime();
    const dueAt = medication.scheduleType === "weekly" || medication.scheduleType === "cycle"
      ? medicationOccurrences(medication, startsAt - 1, 1)[0] || null
      : startsAt;
    return dueAt
      ? { due: false, dueAt, sortTime: dueAt, status, label: "Starts soon", detail: medicationCourseRange(medication) }
      : { due: false, dueAt: null, sortTime: Number.MAX_SAFE_INTEGER, status, label: "No scheduled occurrence", detail: medicationCourseRange(medication) };
  }
  if (status === "complete") return { due: false, dueAt: null, sortTime: Number.MAX_SAFE_INTEGER, status, label: "Course complete", detail: medicationCourseRange(medication) };
  if (medication.scheduleType === "weekly" || medication.scheduleType === "cycle") {
    const anchor = medication.lastTaken ? new Date(medication.lastTaken).getTime() : medication.courseStartDate ? new Date(`${medication.courseStartDate}T00:00:00`).getTime() - 1 : new Date(medication.createdAt || now).getTime() - 1;
    const dueAt = medicationOccurrences(medication, anchor, 1)[0];
    if (!dueAt) return { due: false, dueAt: null, sortTime: Number.MAX_SAFE_INTEGER, status, label: "Schedule incomplete", detail: "Choose at least one day" };
    const timing = medicationTimingLabel(dueAt, now);
    return recentlyTaken
      ? { ...timing, due: false, recentlyTaken: true, status, label: "Taken just now", detail: `Next: ${timing.detail}` }
      : { ...timing, status };
  }
  if (!medication.lastTaken) return { due: true, dueAt: null, sortTime: 0, status, label: "Ready to log", detail: "No dose logged yet" };
  const intervalMs = medication.interval * (medication.unit === "hours" ? 3600000 : 86400000);
  const rawDueAt = new Date(medication.lastTaken).getTime() + intervalMs;
  const dueAt = nextIntervalOccurrence(medication, rawDueAt, intervalMs);
  if (!dueAt) return { due: false, dueAt: null, sortTime: Number.MAX_SAFE_INTEGER, status, label: "No further doses scheduled", detail: medicationCourseRange(medication) };
  const timing = medicationTimingLabel(dueAt, now);
  return recentlyTaken
    ? { ...timing, due: false, recentlyTaken: true, status, label: "Taken just now", detail: `Next: ${timing.detail}` }
    : { ...timing, status };
}

function renderMedications() {
  const entries = state.medications.map((medication) => ({ medication, timing: medicationTiming(medication) })).sort((a, b) => a.timing.sortTime - b.timing.sortTime);
  const next = entries.find(({ timing }) => timing.status !== "complete");
  const orb = document.querySelector("#next-dose-orb");
  document.querySelector("#next-dose-name").textContent = next ? next.medication.name : "Nothing scheduled";
  document.querySelector("#next-dose-time").textContent = next ? [medicationDoseLabel(next.medication), next.timing.label].filter(Boolean).join(" · ") : state.medications.length ? "Current courses are complete" : "Add a medication below";
  orb.classList.toggle("due", Boolean(next?.timing.due));
  document.querySelector("#med-list").innerHTML = entries.length ? entries.map(({ medication, timing }) => {
    const status = timing.status === "upcoming" ? "UPCOMING" : timing.status === "complete" ? "COURSE COMPLETE" : timing.due ? "NEEDS ATTENTION" : "ON SCHEDULE";
    const schedule = medication.scheduleType === "interval" ? `Every ${escapeHtml(medication.interval)} ${escapeHtml(medication.unit)}` : escapeHtml(medicationScheduleLabel(medication));
    const dose = medicationDoseLabel(medication);
    return `<article class="med-card ${timing.due ? "due" : ""} ${timing.recentlyTaken ? "just-taken" : ""} ${timing.status}"><div class="med-status-mark" aria-hidden="true">${timing.due ? "!" : timing.status === "upcoming" ? "→" : "✓"}</div><div class="med-copy"><p>${status}</p><h2>${escapeHtml(medication.name)}</h2>${dose ? `<span class="med-dose">${escapeHtml(dose)}</span>` : ""}<strong>${escapeHtml(timing.label)}</strong><span>${escapeHtml(timing.detail)}</span></div><div class="med-schedule"><span>${schedule}</span><small>${escapeHtml(medicationCourseRange(medication))}</small>${medication.phase ? `<small>${escapeHtml(medication.phase)}</small>` : ""}</div>${timing.status === "active" && !timing.recentlyTaken ? `<button class="primary-button take-med" data-med-take="${escapeHtml(medication.id)}">Taken now <span>+5 XP</span></button>` : timing.recentlyTaken ? `<span class="med-logged" aria-live="polite">✓ Logged</span>` : ""}${medication.lastTaken ? `<button class="text-action med-correct-dose" data-med-correct="${escapeHtml(medication.id)}" aria-label="Correct latest dose time for ${escapeHtml(medication.name)}">Correct latest dose time</button>` : ""}<button class="secondary-button med-edit" data-med-edit="${escapeHtml(medication.id)}" aria-label="Edit medication and schedule for ${escapeHtml(medication.name)}">Edit medication & schedule</button><button class="row-delete med-delete" data-med-delete="${escapeHtml(medication.id)}" aria-label="Remove ${escapeHtml(medication.name)}">×</button></article>`;
  }).join("") : `<div class="admin-empty med-empty"><span>✚</span><h3>No medications added.</h3><p>Add one with the interval you have been instructed to follow.</p></div>`;
  document.querySelectorAll("[data-med-take]").forEach((button) => button.addEventListener("click", () => { const medication = state.medications.find((item) => item.id === button.dataset.medTake); if (!medication || medicationCourseStatus(medication) !== "active") return; medication.lastTaken = new Date().toISOString(); state.medLog.unshift({ id: makeId("dose"), medicationId: medication.id, name: medication.name, takenAt: medication.lastTaken }); const levelUp = awardLifeXp(5, "Dose logged", `${medication.name} marked as taken`, "medication-dose"); saveState(); renderAll(); if (levelUp) showLevelUp(levelUp); }));
  document.querySelectorAll("[data-med-edit]").forEach((button) => button.addEventListener("click", () => startMedicationEdit(button.dataset.medEdit)));
  document.querySelectorAll("[data-med-correct]").forEach((button) => button.addEventListener("click", () => startDoseCorrection(button.dataset.medCorrect)));
  document.querySelectorAll("[data-med-delete]").forEach((button) => button.addEventListener("click", () => {
    const medication = state.medications.find((item) => item.id === button.dataset.medDelete);
    if (!medication || !window.confirm(`Remove ${medication.name} from the tracker? Logged dose history will be kept.`)) return;
    if (editingMedicationId === medication.id) resetMedicationForm();
    state.medications = state.medications.filter((item) => item.id !== medication.id);
    saveState();
    renderMedications();
    renderLifeSnapshot();
  }));
}
function renderLifeSnapshot() {
  const todos = state.todosByDate[localDateKey()] || [];
  const remaining = todos.filter((todo) => !todo.done).length;
  document.querySelector("#snapshot-todo-count").textContent = remaining ? `${remaining} ${remaining === 1 ? "task" : "tasks"} left` : "To-dos clear";
  document.querySelector("#snapshot-todo-note").textContent = todos.length ? `${todos.length - remaining} complete today` : "A clear day";

  const dueMeds = state.medications.filter((medication) => medicationTiming(medication).due);
  document.querySelector("#snapshot-med-count").textContent = dueMeds.length ? `${dueMeds.length} ${dueMeds.length === 1 ? "med" : "meds"} due` : "No meds due";
  document.querySelector("#snapshot-med-note").textContent = dueMeds.length ? dueMeds.map((medication) => [medication.name, medicationDoseLabel(medication)].filter(Boolean).join(" · ")).join(", ") : state.medications.length ? "Everything is on schedule" : "Nothing scheduled yet";

  const activeBooks = state.books.filter((book) => book.status === "Reading");
  document.querySelector("#snapshot-book-count").textContent = activeBooks.length ? `${activeBooks.length} ${activeBooks.length === 1 ? "book" : "books"} in progress` : "No active books";
  document.querySelector("#snapshot-book-note").textContent = activeBooks[0]?.title || (state.books.length ? "Choose your next read" : "Start a new chapter");

  const latestWeight = normalizeWeightEntries(state.weightEntries).at(-1);
  document.querySelector("#snapshot-weight-count").textContent = latestWeight ? formatMeasurement(latestWeight.weight, "kg") : "Body snapshot";
  document.querySelector("#snapshot-weight-note").textContent = latestWeight ? `${formatMeasurementDate(latestWeight.date)}${latestWeight.waist === null ? "" : ` · ${formatWaist(latestWeight.waist)}`}` : "Add your first measurement";
}

function renderReminderSettings() {
  const button = document.querySelector("#enable-reminders");
  const status = document.querySelector("#reminder-status");
  const lead = document.querySelector("#reminder-lead");
  if (!button || !status || !lead) return;
  lead.value = String(state.notificationPrefs.leadMinutes);
  const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const registered = Boolean(state.notificationPrefs.deviceId && state.notificationPrefs.deviceToken);
  if (!supported) {
    button.disabled = true;
    button.textContent = "Not supported on this browser";
    status.textContent = "This browser cannot receive Web Push. Due and overdue states will still appear in the app.";
    return;
  }
  if (!pushApiBase) {
    button.disabled = true;
    button.textContent = "Push service unavailable";
    status.textContent = "The hosted push service is not connected yet. Due items will still be highlighted here.";
    return;
  }
  if (Notification.permission === "denied") {
    button.disabled = true;
    button.textContent = "Notifications blocked";
    status.textContent = "Notifications are blocked in your browser settings. Due items will still be highlighted here.";
    return;
  }
  button.disabled = false;
  button.textContent = registered ? "Disable push reminders" : "Enable push reminders";
  status.textContent = registered
    ? state.notificationPrefs.lastSyncError
      ? "Push is registered, but the latest schedule sync failed. It will retry automatically."
      : "Push alerts are active for timed tasks and medication doses, including when this app is closed."
    : "Get closed-app alerts for timed tasks and medication doses on this device.";
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function pushRequest(path, options = {}) {
  const response = await fetch(`${pushApiBase}/api/${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Push service request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function buildPushReminders(now = Date.now()) {
  const leadMs = Number(state.notificationPrefs.leadMinutes || 30) * 60000;
  const reminders = [];
  Object.entries(state.todosByDate).forEach(([dateKey, todos]) => {
    todos.filter((todo) => !todo.done && todo.time && !todo.parentId).forEach((todo) => {
      const isRecurring = todo.repeat && todo.repeat !== "none";
      const dueTimes = todo.repeat === "weekdays"
        ? upcomingWeekdayTodoDueAts(todo, now)
        : [isRecurring ? nextRecurringTodoDueAt(todo, now) : todoTiming(dateKey, todo, now).dueAt];
      dueTimes.filter(Number.isFinite).forEach((dueAt, index) => {
        reminders.push({
          id: todo.repeat === "weekdays" ? `${todo.id}::${dueAt}` : todo.id,
          kind: "todo",
          title: todo.text,
          body: `${todoCategory[todo.category || "personal"] || "Personal"}${todo.priority === "high" ? " high-priority" : ""} task is ${dueAt <= now ? "overdue" : "nearly due"}.${todo.notes ? ` ${todo.notes}` : ""}`,
          dueAt: new Date(dueAt).toISOString(),
          notifyAt: new Date(dueAt - leadMs).toISOString(),
          intervalMs: index === 0 && todo.repeat === "daily" ? 86400000 : index === 0 && todo.repeat === "weekly" ? 604800000 : undefined,
          url: "/#todos",
        });
      });
    });
  });
  state.medications.forEach((medication) => {
    const timing = medicationTiming(medication, now);
    if (!timing.dueAt) return;
    const dose = medicationDoseLabel(medication) || "your scheduled dose";
    if (medication.scheduleType === "weekly" || medication.scheduleType === "cycle") {
      const futureAnchor = Math.max(now - 1, timing.dueAt - 1);
      const occurrences = [
        ...(timing.dueAt >= now - 86400000 ? [timing.dueAt] : []),
        ...medicationOccurrences(medication, futureAnchor, 8).filter((dueAt) => dueAt !== timing.dueAt),
      ];
      occurrences.forEach((dueAt) => {
        const notifyAt = boundedNotificationTime(medication, dueAt, leadMs);
        if (!Number.isFinite(notifyAt)) return;
        reminders.push({
          id: concreteMedicationReminderId(medication.id, dueAt),
          kind: "medication",
          title: medication.name,
          body: `${dose} is nearly due.`,
          dueAt: new Date(dueAt).toISOString(),
          notifyAt: new Date(notifyAt).toISOString(),
          url: "/#meds",
        });
      });
      return;
    }
    const intervalMs = medication.interval * (medication.unit === "hours" ? 3600000 : 86400000);
    if (medication.courseEndDate) {
      finiteIntervalReminderOccurrences(medication, timing.dueAt, intervalMs, now, 8)
        .forEach((dueAt) => {
          const notifyAt = boundedNotificationTime(medication, dueAt, leadMs);
          if (!Number.isFinite(notifyAt)) return;
          reminders.push({
            id: concreteMedicationReminderId(medication.id, dueAt),
            kind: "medication",
            title: medication.name,
            body: `${dose} is ${dueAt <= now ? "overdue" : "nearly due"}.`,
            dueAt: new Date(dueAt).toISOString(),
            notifyAt: new Date(notifyAt).toISOString(),
            url: "/#meds",
          });
        });
      return;
    }
    const notifyAt = boundedNotificationTime(medication, timing.dueAt, leadMs);
    if (!Number.isFinite(notifyAt)) return;
    reminders.push({
      id: medication.id,
      kind: "medication",
      title: medication.name,
      body: `${dose} is ${timing.due ? "overdue" : "nearly due"}.`,
      dueAt: new Date(timing.dueAt).toISOString(),
      notifyAt: new Date(notifyAt).toISOString(),
      intervalMs,
      url: "/#meds",
    });
  });
  return reminders.filter((reminder) => new Date(reminder.notifyAt).getTime() >= now - 86400000);
}

async function syncPushReminders() {
  const prefs = state.notificationPrefs;
  if (!pushApiBase || !prefs.deviceId || !prefs.deviceToken) return;
  try {
    const result = await pushRequest("push/sync", {
      method: "POST",
      headers: {
        authorization: `Bearer ${prefs.deviceToken}`,
        "x-device-id": prefs.deviceId,
      },
      body: JSON.stringify({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        reminders: buildPushReminders(),
      }),
    });
    prefs.lastSyncedAt = result.syncedAt;
    prefs.lastSyncError = "";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderReminderSettings();
  } catch (error) {
    if (error.status === 401) {
      prefs.deviceId = "";
      prefs.deviceToken = "";
      prefs.enabled = false;
    }
    prefs.lastSyncError = error.message;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderReminderSettings();
  }
}

function schedulePushSync(delay = 1200) {
  clearTimeout(pushSyncTimer);
  pushSyncTimer = setTimeout(syncPushReminders, delay);
}

async function enablePushReminders() {
  if (!pushApiBase) throw new Error("The push service is not available yet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await pushRequest("push/config");
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  const credentials = await pushRequest("push/register", {
    method: "POST",
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  state.notificationPrefs.enabled = true;
  state.notificationPrefs.deviceId = credentials.deviceId;
  state.notificationPrefs.deviceToken = credentials.deviceToken;
  state.notificationPrefs.lastSyncError = "";
  saveState();
  await syncPushReminders();
}

async function disablePushReminders() {
  const prefs = state.notificationPrefs;
  if (pushApiBase && prefs.deviceId && prefs.deviceToken) {
    await pushRequest("push/unsubscribe", {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${prefs.deviceToken}`,
        "x-device-id": prefs.deviceId,
      },
      body: JSON.stringify({ deviceId: prefs.deviceId }),
    }).catch(() => {});
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe().catch(() => {});
  state.notificationPrefs.enabled = false;
  state.notificationPrefs.deviceId = "";
  state.notificationPrefs.deviceToken = "";
  state.notificationPrefs.lastSyncedAt = "";
  state.notificationPrefs.lastSyncError = "";
  saveState();
}

async function initialisePushBackend() {
  try {
    const response = await fetch("./push-config.json", { cache: "no-store" });
    const config = await response.json();
    pushApiBase = String(config.apiBase || "").replace(/\/$/, "");
    if (state.notificationPrefs.deviceId) {
      const registration = await navigator.serviceWorker.ready;
      if (!(await registration.pushManager.getSubscription())) {
        state.notificationPrefs.enabled = false;
        state.notificationPrefs.deviceId = "";
        state.notificationPrefs.deviceToken = "";
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        schedulePushSync(0);
      }
    }
  } catch {
    pushApiBase = "";
  }
  renderReminderSettings();
}

function inventoryLoot(instanceId) {
  const instance = state.loot.inventory.find((entry) => entry.instanceId === instanceId);
  const item = instance ? lootItem(instance.itemId) : null;
  return item ? { ...instance, ...item } : null;
}

function renderArmory() {
  state.loot = normalizeLootState(state.loot);
  const pending = state.loot.pendingBoxes;
  const badge = document.querySelector("#loot-badge");
  badge.hidden = pending === 0;
  badge.textContent = pending > 9 ? "9+" : pending;
  const armoryButton = document.querySelector("#armory-button");
  armoryButton.classList.toggle("has-loot", pending > 0);
  armoryButton.setAttribute("aria-label", pending ? `Open your armory. ${pending} ${pending === 1 ? "coffer" : "coffers"} waiting.` : "Open your armory");

  const name = state.profile.name.trim() || "The Wayfarer";
  const level = currentLevel();
  document.querySelector("#character-name").textContent = name;
  document.querySelector("#character-title").textContent = `Level ${level.level} · ${level.title}`;
  document.querySelector("#gear-score").textContent = lootGearScore(state.loot);
  document.querySelector("#coffer-count").textContent = pending;
  const openButton = document.querySelector("#open-coffer");
  openButton.disabled = pending === 0 || lootOpening;
  openButton.querySelector("strong").textContent = lootOpening ? "The seals are breaking…" : pending ? "Open one coffer" : "No coffers waiting";
  openButton.querySelector("small").textContent = pending ? "Reveal a random relic" : "Your next level earns one";

  const equippedItems = LOOT_SLOTS.map((slot) => equippedLoot(state.loot, slot.id)).filter(Boolean);
  const highestRank = equippedItems.reduce((highest, item) => Math.max(highest, LOOT_RARITIES[item.rarity].rank), 0);
  const highestRarity = Object.entries(LOOT_RARITIES).find(([, meta]) => meta.rank === highestRank)?.[0] || "common";
  const sheet = document.querySelector("#character-sheet");
  sheet.dataset.aura = highestRarity;
  sheet.setAttribute("aria-label", equippedItems.length ? `${name} equipped with ${equippedItems.map((item) => item.name).join(", ")}` : `${name} has no gear equipped yet`);
  const emptyGlyphs = { head: "◇", body: "◇", weapon: "†", offhand: "◐", boots: "⌁", cloak: "≋" };
  LOOT_SLOTS.forEach((slot) => {
    const equipped = equippedLoot(state.loot, slot.id);
    const piece = document.querySelector(`[data-character-piece="${slot.id}"]`);
    piece.textContent = equipped?.glyph || emptyGlyphs[slot.id];
    piece.className = `${piece.className.split(" ").slice(0, 2).join(" ")} ${equipped ? `rarity-${equipped.rarity}` : "empty"}`;
    piece.title = equipped?.name || `${slot.label} slot empty`;
  });

  document.querySelector("#equipped-slots").innerHTML = LOOT_SLOTS.map((slot) => {
    const equipped = equippedLoot(state.loot, slot.id);
    return `<article class="equipped-slot ${equipped ? `rarity-${equipped.rarity}` : "empty"}"><span>${escapeHtml(slot.label)}</span><strong>${equipped ? escapeHtml(equipped.name) : "Empty"}</strong>${equipped ? `<button type="button" data-unequip-slot="${slot.id}" aria-label="Unequip ${escapeHtml(equipped.name)}">×</button>` : ""}</article>`;
  }).join("");

  const inventory = state.loot.inventory
    .map((instance) => inventoryLoot(instance.instanceId))
    .filter(Boolean)
    .sort((left, right) => LOOT_RARITIES[right.rarity].rank - LOOT_RARITIES[left.rarity].rank || String(right.obtainedAt).localeCompare(String(left.obtainedAt)));
  document.querySelector("#inventory-count").textContent = `${inventory.length} ${inventory.length === 1 ? "relic" : "relics"}`;
  document.querySelector("#loot-inventory").innerHTML = inventory.length ? inventory.map((item) => {
    const equipped = state.loot.equipped[item.slot] === item.instanceId;
    const rarity = LOOT_RARITIES[item.rarity];
    return `<article class="loot-card rarity-${item.rarity}" style="--rarity:${rarity.color}"><span class="loot-glyph" aria-hidden="true">${item.glyph}</span><div><small>${rarity.label} · ${LOOT_SLOTS.find((slot) => slot.id === item.slot)?.label}</small><h3>${escapeHtml(item.name)}</h3></div><button type="button" data-equip-loot="${escapeHtml(item.instanceId)}" ${equipped ? "disabled" : ""}>${equipped ? "Equipped" : "Equip"}</button></article>`;
  }).join("") : `<div class="loot-empty"><span aria-hidden="true">♜</span><h3>Your ledger is blank.</h3><p>Reach Level 2 to earn your first coffer.</p></div>`;

  const lastDrop = inventoryLoot(state.loot.lastDropInstanceId);
  const reveal = document.querySelector("#loot-reveal");
  reveal.className = `loot-reveal ${lastDrop ? `rarity-${lastDrop.rarity}` : ""}`;
  document.querySelector("#loot-reveal-glyph").textContent = lastDrop?.glyph || "✦";
  document.querySelector("#loot-reveal-rarity").textContent = lastDrop ? `${LOOT_RARITIES[lastDrop.rarity].label.toUpperCase()} RELIC` : "THE VAULT IS QUIET";
  document.querySelector("#loot-reveal-name").textContent = lastDrop?.name || "Your next relic waits here.";
  document.querySelector("#loot-reveal-slot").textContent = lastDrop ? `${LOOT_SLOTS.find((slot) => slot.id === lastDrop.slot)?.label} gear · ready to equip` : "Earn a level to receive a coffer.";

  document.querySelectorAll("[data-equip-loot]").forEach((button) => button.addEventListener("click", () => {
    const item = inventoryLoot(button.dataset.equipLoot);
    if (!item) return;
    state.loot.equipped[item.slot] = item.instanceId;
    saveState();
    renderArmory();
    showToast("Relic equipped", `${item.name} now rests on your character.`);
  }));
  document.querySelectorAll("[data-unequip-slot]").forEach((button) => button.addEventListener("click", () => {
    state.loot.equipped[button.dataset.unequipSlot] = "";
    saveState();
    renderArmory();
  }));
}

function openLootCoffer() {
  if (lootOpening || state.loot.pendingBoxes < 1) return;
  lootOpening = true;
  const room = document.querySelector(".chest-room");
  room.classList.add("opening");
  renderArmory();
  const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 850;
  window.setTimeout(() => {
    const item = rollLootDrop();
    const instance = { instanceId: makeId("relic"), itemId: item.id, obtainedAt: new Date().toISOString() };
    state.loot.pendingBoxes -= 1;
    state.loot.openedBoxes += 1;
    state.loot.inventory.unshift(instance);
    state.loot.lastDropInstanceId = instance.instanceId;
    lootOpening = false;
    saveState();
    room.classList.remove("opening");
    room.classList.add("drop-landed");
    renderArmory();
    window.setTimeout(() => room.classList.remove("drop-landed"), 1100);
  }, delay);
}

function showToast(title, message, positive = true) {
  const toast = document.querySelector("#toast");
  document.querySelector("#toast-title").textContent = title;
  document.querySelector("#toast-message").textContent = message;
  toast.querySelector(".toast-mark").textContent = positive ? "✓" : "↺";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
}

function showLevelUp(level) {
  const overlay = document.querySelector("#level-up");
  document.querySelector("#level-up-number").textContent = level.level;
  document.querySelector("#level-up-title").textContent = level.title;
  document.querySelector("#level-up-reward").textContent = `${level.reward} unlocked`;
  const boxes = Math.max(1, Number(level.lootBoxesEarned) || 1);
  document.querySelector("#level-up-loot").textContent = `${boxes === 1 ? "A sealed coffer was" : `${boxes} sealed coffers were`} sent to your armory.`;
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("show");
  setTimeout(() => {
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
  }, 4200);
}

function renderAll() {
  renderHeader();
  renderLevel();
  renderCue();
  renderQuests();
  renderCapabilities();
  renderWeek();
  renderReflection();
  renderJourney();
  renderInsights();
  renderWeightTracker();
  renderTodos();
  renderBooks();
  renderMedications();
  renderLifeSnapshot();
  renderReminderSettings();
  renderArmory();
}

function switchView(viewName) {
  if (!document.querySelector(`#${viewName}-view`)) return;
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.remove("active"));
  document.querySelector(`#${viewName}-view`).classList.add("active");
  document.querySelector(`[data-view="${viewName}"]`)?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelector("#home-link").addEventListener("click", (event) => {
  event.preventDefault();
  if (location.hash !== "#today") history.pushState(null, "", "#today");
  switchView("today");
});

document.querySelector("#streak-button").addEventListener("click", () => {
  switchView("today");
  setTimeout(() => {
    document.querySelector("#quest-heading").scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelector(".quest-card:not(.complete) .complete-button")?.focus({ preventScroll: true });
  }, 250);
});

document.querySelector("#armory-button").addEventListener("click", () => {
  if (location.hash !== "#armory") history.pushState(null, "", "#armory");
  switchView("armory");
});

document.querySelector("#open-coffer").addEventListener("click", openLootCoffer);

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    const view = link.dataset.view;
    if (location.hash !== `#${view}`) history.pushState(null, "", `#${view}`);
    switchView(view);
  });
});

document.querySelectorAll("[data-go-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.goView;
    if (location.hash !== `#${view}`) history.pushState(null, "", `#${view}`);
    switchView(view);
  });
});

document.querySelector("#weight-date").value = localDateKey();
configureWaistInput();
document.querySelectorAll(".weight-range").forEach((button) => button.addEventListener("click", () => {
  selectedWeightRange = button.dataset.weightRange;
  renderWeightTracker();
}));

document.querySelector("#waist-unit").addEventListener("change", (event) => {
  const previousUnit = currentWaistUnit();
  const nextUnit = normalizeWaistUnit(event.target.value);
  convertCurrentWaistInput(previousUnit, nextUnit);
  state.waistUnit = nextUnit;
  configureWaistInput();
  saveState();
  renderWeightTracker();
  renderLifeSnapshot();
  document.querySelector("#weight-form-status").textContent = "Waist measurements are now shown in " + waistUnitLabel(nextUnit) + ".";
});

document.querySelector("#weight-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const date = document.querySelector("#weight-date").value;
  const weight = Number(document.querySelector("#weight-value").value);
  const waistInput = document.querySelector("#waist-value").value.trim();
  const waistValue = waistInput ? Number(waistInput) : null;
  const waist = waistInput ? waistToCanonicalCentimetres(waistValue, currentWaistUnit()) : null;
  const note = document.querySelector("#weight-note").value.trim();
  const status = document.querySelector("#weight-form-status");
  const dateAtNoon = new Date(date + "T12:00:00");
  const [dateYear, dateMonth, dateDay] = date.split("-").map(Number);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(dateAtNoon.getTime()) && dateAtNoon.getFullYear() === dateYear && dateAtNoon.getMonth() === dateMonth - 1 && dateAtNoon.getDate() === dateDay;
  const validWaist = !waistInput || (waistInputWithinBounds(waistValue, currentWaistUnit()) && waist !== null && waist >= 30 && waist <= 300);
  if (!validDate || !Number.isFinite(weight) || weight < 20 || weight > 500 || !validWaist) {
    const bounds = waistInputBounds();
    status.textContent = "Enter a valid date, weight between 20 and 500 kg, and optional waist between " + bounds.min + " and " + bounds.max + " " + currentWaistUnit() + ".";
    event.target.reportValidity();
    return;
  }
  const existing = normalizeWeightEntries(state.weightEntries).find((entry) => entry.date === date);
  const entry = { id: existing?.id || makeId("weight"), date, weight, waist, note, createdAt: existing?.createdAt || new Date().toISOString() };
  state.weightEntries = normalizeWeightEntries([...state.weightEntries.filter((item) => item.date !== date), entry]);
  saveState();
  const measurement = formatMeasurement(weight, "kg") + (waist === null ? "" : " · " + formatWaist(waist));
  status.textContent = (existing ? "Measurement updated" : "Measurement saved") + " for " + formatMeasurementDate(date) + ": " + measurement + ".";
  renderWeightTracker();
  renderLifeSnapshot();
});
document.querySelector("#todo-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#todo-input");
  const text = input.value.trim();
  if (!text) return;
  const list = state.todosByDate[selectedTodoDate] || [];
  list.push({
    id: makeId("todo"),
    text,
    priority: document.querySelector("#todo-priority").value,
    category: document.querySelector("#todo-category").value,
    time: document.querySelector("#todo-time").value,
    repeat: document.querySelector("#todo-repeat").value,
    repeatStartDate: selectedTodoDate,
    notes: document.querySelector("#todo-notes").value.trim(),
    done: false,
    createdAt: new Date().toISOString(),
  });
  state.todosByDate[selectedTodoDate] = list;
  event.target.reset();
  saveState();
  renderTodos();
  renderLifeSnapshot();
  input.focus();
});

document.querySelector("#todo-date").addEventListener("change", (event) => {
  if (!event.target.value) return;
  selectedTodoDate = event.target.value;
  renderTodos();
});

document.querySelector("#todo-category-filter").addEventListener("change", (event) => {
  selectedTodoCategory = event.target.value;
  renderTodos();
});

function shiftTodoDate(days) {
  const date = new Date(`${selectedTodoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  selectedTodoDate = localDateKey(date);
  renderTodos();
}

document.querySelector("#todo-previous").addEventListener("click", () => shiftTodoDate(-1));
document.querySelector("#todo-next").addEventListener("click", () => shiftTodoDate(1));
document.querySelector("#clear-completed").addEventListener("click", () => {
  state.todosByDate[selectedTodoDate] = (state.todosByDate[selectedTodoDate] || []).filter((todo) => !todo.done);
  saveState();
  renderTodos();
  renderLifeSnapshot();
});

document.querySelector("#enable-reminders").addEventListener("click", async () => {
  const registered = Boolean(state.notificationPrefs.deviceId && state.notificationPrefs.deviceToken);
  const button = document.querySelector("#enable-reminders");
  button.disabled = true;
  try {
    if (registered) {
      await disablePushReminders();
      showToast("Push reminders disabled", "This device will no longer receive closed-app alerts.", false);
    } else {
      await enablePushReminders();
      showToast("Push reminders enabled", "This device can now receive alerts even when the app is closed.");
    }
  } catch (error) {
    showToast("Could not update reminders", error.message || "Check the browser notification settings.", false);
  }
  renderReminderSettings();
});

document.querySelector("#reminder-lead").addEventListener("change", (event) => {
  state.notificationPrefs.leadMinutes = Number(event.target.value);
  saveState();
  schedulePushSync(0);
});
document.querySelector("#book-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const titleInput = document.querySelector("#book-title");
  const title = titleInput.value.trim();
  if (!title) return;
  state.books.unshift({
    id: makeId("book"),
    title,
    author: document.querySelector("#book-author").value.trim(),
    format: document.querySelector("#book-format").value,
    currentTime: document.querySelector("#book-current-time").value.trim(),
    totalTime: document.querySelector("#book-total-time").value.trim(),
    status: "Want to read",
    progress: 0,
    rewardedProgress: 0,
    addedAt: new Date().toISOString(),
  });
  const levelUp = awardLifeXp(10, "Book added", `${title} is ready when you are`, "book-setup");
  event.target.reset();
  saveState();
  renderAll();
  if (levelUp) showLevelUp(levelUp);
});

function updateAudiobookFields() {
  const isAudiobook = document.querySelector("#book-format").value === "Audiobook";
  document.querySelector("#audiobook-fields").hidden = !isAudiobook;
  document.querySelector("#book-current-time").required = false;
  document.querySelector("#book-total-time").required = false;
}

document.querySelector("#book-format").addEventListener("change", updateAudiobookFields);
updateAudiobookFields();

function updateMedicationCoursePreview() {
  const start = document.querySelector("#med-course-start").value;
  const duration = document.querySelector("#med-duration").value.trim();
  const unit = document.querySelector("#med-duration-unit").value;
  document.querySelector("#med-course-end").textContent = duration ? inclusiveCourseEndDate(start, Number(duration), unit) || "Choose a valid course" : "Ongoing";
}

function medicationLastTakenInputValue(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const part = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

function startDoseCorrection(medicationId) {
  const medication = state.medications.find((item) => item.id === medicationId);
  if (!medication?.lastTaken) return;
  correctingMedicationId = medication.id;
  document.querySelector("#dose-correction-copy").textContent = `Correct the latest logged time for ${medication.name}. This updates dose history and future reminders together.`;
  document.querySelector("#corrected-dose-time").value = medicationLastTakenInputValue(medication.lastTaken);
  document.querySelector("#dose-correction-dialog").showModal();
  document.querySelector("#corrected-dose-time").focus();
}

function setMedicationFormMode(medication = null) {
  editingMedicationId = medication?.id || null;
  document.querySelector("#med-form-mode").textContent = medication ? "EDIT MEDICATION" : "ADD A MEDICATION";
  document.querySelector("#med-form-title").textContent = medication ? `Edit ${medication.name}` : "Set your rhythm";
  document.querySelector("#med-form-status").textContent = medication ? "Schedule changes apply to future reminders. Logged dose history is unchanged." : "";
  document.querySelector("#med-form-submit").innerHTML = medication ? "Save changes" : "Add medication <span>+10 XP</span>";
  document.querySelector("#cancel-med-edit").hidden = !medication;
}

function updateMedicationScheduleFields() {
  const scheduleType = document.querySelector("#med-schedule-type").value;
  const interval = scheduleType === "interval";
  const weekly = scheduleType === "weekly";
  const cycle = scheduleType === "cycle";
  document.querySelector("#med-interval-fields").hidden = !interval;
  document.querySelector("#med-weekly-fields").hidden = !weekly;
  document.querySelector("#med-cycle-fields").hidden = !cycle;
  document.querySelector("#med-interval").required = interval;
  document.querySelector("#med-schedule-time").required = weekly;
  document.querySelector("#med-cycle-on-days").required = cycle;
  document.querySelector("#med-cycle-off-days").required = cycle;
  document.querySelector("#med-cycle-time").required = cycle;
}

function resetMedicationForm() {
  const form = document.querySelector("#med-form");
  form.reset();
  document.querySelector("#med-interval").value = 3;
  document.querySelector("#med-schedule-time").value = "09:00";
  document.querySelector("#med-cycle-on-days").value = 5;
  document.querySelector("#med-cycle-off-days").value = 2;
  document.querySelector("#med-cycle-time").value = "09:00";
  document.querySelector("#med-course-start").value = localDateKey();
  document.querySelector("#med-duration").value = 4;
  document.querySelector("#med-duration-unit").value = "weeks";
  setMedicationFormMode();
  updateMedicationCoursePreview();
  updateMedicationScheduleFields();
}

function startMedicationEdit(medicationId) {
  const medication = state.medications.find((item) => item.id === medicationId);
  if (!medication) return;
  document.querySelector("#med-name").value = medication.name || "";
  document.querySelector("#med-schedule-type").value = ["interval", "weekly", "cycle"].includes(medication.scheduleType) ? medication.scheduleType : "interval";
  document.querySelector("#med-interval").value = medication.interval || 3;
  document.querySelector("#med-unit").value = medication.unit || "days";
  document.querySelectorAll('input[name="med-weekday"]').forEach((input) => { input.checked = (medication.weekdays || []).map(Number).includes(Number(input.value)); });
  document.querySelector("#med-schedule-time").value = medication.scheduleTime || "09:00";
  document.querySelector("#med-cycle-on-days").value = medication.cycleOnDays || 5;
  document.querySelector("#med-cycle-off-days").value = medication.cycleOffDays ?? 2;
  document.querySelector("#med-cycle-time").value = medication.scheduleTime || "09:00";
  document.querySelector("#med-course-start").value = medication.courseStartDate || "";
  document.querySelector("#med-duration").value = medication.duration ?? "";
  document.querySelector("#med-duration-unit").value = medication.durationUnit || "weeks";
  document.querySelector("#med-dosage").value = medication.dosage ?? "";
  document.querySelector("#med-dose-unit").value = medication.dosageUnit || "mg";
  setMedicationFormMode(medication);
  updateMedicationCoursePreview();
  updateMedicationScheduleFields();
  document.querySelector("#med-form").scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#med-name").focus({ preventScroll: true });
}

document.querySelector("#med-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const existing = editingMedicationId ? state.medications.find((medication) => medication.id === editingMedicationId) : null;
  if (editingMedicationId && !existing) {
    resetMedicationForm();
    showToast("Medication changed elsewhere", "Choose the medication again before editing.", false);
    return;
  }
  const name = document.querySelector("#med-name").value.trim();
  const scheduleType = document.querySelector("#med-schedule-type").value;
  const interval = Number(document.querySelector("#med-interval").value);
  const weekdays = [...document.querySelectorAll('input[name="med-weekday"]:checked')].map((input) => Number(input.value));
  const cycleOnDays = Number(document.querySelector("#med-cycle-on-days").value);
  const cycleOffDays = Number(document.querySelector("#med-cycle-off-days").value);
  const dosageValue = document.querySelector("#med-dosage").value.trim();
  const dosage = dosageValue === "" ? null : Number(dosageValue);
  const durationValue = document.querySelector("#med-duration").value.trim();
  const duration = durationValue === "" ? null : Number(durationValue);
  const courseStartDate = document.querySelector("#med-course-start").value;
  const durationUnit = document.querySelector("#med-duration-unit").value;
  const courseEndDate = duration === null ? "" : inclusiveCourseEndDate(courseStartDate, duration, durationUnit);
  const scheduleTime = scheduleType === "cycle" ? document.querySelector("#med-cycle-time").value || "09:00" : document.querySelector("#med-schedule-time").value || "09:00";
  if (!name || !["interval", "weekly", "cycle"].includes(scheduleType) || (scheduleType === "interval" && (!Number.isFinite(interval) || interval < 1)) || (scheduleType === "weekly" && !weekdays.length) || (scheduleType === "cycle" && (!Number.isInteger(cycleOnDays) || cycleOnDays < 1 || !Number.isInteger(cycleOffDays) || cycleOffDays < 0)) || (dosage !== null && (!Number.isFinite(dosage) || dosage <= 0)) || (duration !== null && (!Number.isInteger(duration) || duration < 1 || !courseEndDate))) return;
  const medication = {
    ...existing,
    id: existing?.id || makeId("med"),
    name,
    scheduleType,
    courseStartDate,
    courseEndDate,
    duration,
    durationUnit,
    lastTaken: existing?.lastTaken || null,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  delete medication.interval;
  delete medication.unit;
  delete medication.weekdays;
  delete medication.scheduleTime;
  delete medication.cycleOnDays;
  delete medication.cycleOffDays;
  if (scheduleType === "interval") {
    medication.interval = interval;
    medication.unit = document.querySelector("#med-unit").value;
  } else if (scheduleType === "weekly") {
    medication.weekdays = weekdays;
    medication.scheduleTime = scheduleTime;
  } else {
    medication.cycleOnDays = cycleOnDays;
    medication.cycleOffDays = cycleOffDays;
    medication.scheduleTime = scheduleTime;
  }
  if (dosage !== null) {
    medication.dosage = dosage;
    medication.dosageUnit = document.querySelector("#med-dose-unit").value;
  } else {
    delete medication.dosage;
    delete medication.dosageUnit;
  }
  if (existing) {
    state.medications = state.medications.map((item) => item.id === existing.id ? medication : item);
    showToast("Medication updated", `${name} was updated without changing its history.`, false);
  } else {
    state.medications.push(medication);
  }
  const levelUp = existing ? null : awardLifeXp(10, "Medication added", `${name} is now on your tracker`, "medication-setup");
  resetMedicationForm();
  saveState();
  renderAll();
  if (levelUp) showLevelUp(levelUp);
});

document.querySelector("#cancel-med-edit").addEventListener("click", resetMedicationForm);
const doseCorrectionDialog = document.querySelector("#dose-correction-dialog");
function closeDoseCorrection() {
  correctingMedicationId = null;
  doseCorrectionDialog.close();
}
document.querySelector("#close-dose-correction").addEventListener("click", closeDoseCorrection);
document.querySelector("#cancel-dose-correction").addEventListener("click", closeDoseCorrection);
document.querySelector("#dose-correction-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const medication = state.medications.find((item) => item.id === correctingMedicationId);
  const input = document.querySelector("#corrected-dose-time").value;
  const correctedAt = input ? new Date(input).toISOString() : "";
  if (!medication || !correctedAt) return;
  medication.lastTaken = correctedAt;
  const latestLog = state.medLog
    .filter((entry) => entry.medicationId === medication.id)
    .sort((left, right) => new Date(right.takenAt).getTime() - new Date(left.takenAt).getTime())[0];
  if (latestLog) latestLog.takenAt = correctedAt;
  else state.medLog.unshift({ id: makeId("dose"), medicationId: medication.id, name: medication.name, takenAt: correctedAt, corrected: true });
  saveState();
  closeDoseCorrection();
  renderAll();
  showToast("Dose time corrected", `${medication.name} history and reminders now use the corrected time.`, false);
});
document.querySelector("#med-course-start").addEventListener("change", updateMedicationCoursePreview);
document.querySelector("#med-duration").addEventListener("input", updateMedicationCoursePreview);
document.querySelector("#med-duration-unit").addEventListener("change", updateMedicationCoursePreview);
document.querySelector("#med-schedule-type").addEventListener("change", updateMedicationScheduleFields);
resetMedicationForm();

document.querySelector("#cue-action").addEventListener("click", () => {
  setView("todos");
  setTimeout(() => document.querySelector("#todo-input")?.focus(), 250);
});

document.querySelector("#add-quest").addEventListener("click", () => {
  const key = localDateKey();
  if (state.extraQuestByDate[key] !== undefined) return;
  state.extraQuestByDate[key] = (daySeed(key) + state.xp) % stretchPool.length;
  saveState();
  renderQuests();
  showToast("Stretch quest added", "A bolder move is now on today’s path.");
});

document.querySelector("#reflection-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = document.querySelector("#reflection-input").value.trim();
  if (!value) {
    showToast("One sentence is enough", "Name what would make today feel meaningful.", false);
    return;
  }
  state.reflections[localDateKey()] = value;
  saveState();
  showToast("Reflection saved", "You have named what matters today.");
});

const profileDialog = document.querySelector("#profile-dialog");
document.querySelector("#profile-button").addEventListener("click", () => {
  document.querySelector("#profile-name").value = state.profile.name;
  document.querySelector("#target-role").value = state.profile.targetRole;
  document.querySelector(`input[name="focus"][value="${state.profile.focus}"]`).checked = true;
  profileDialog.showModal();
});

document.querySelector("#profile-form").addEventListener("submit", (event) => {
  if (event.submitter?.value !== "default") return;
  event.preventDefault();
  state.profile = {
    name: document.querySelector("#profile-name").value.trim(),
    targetRole: document.querySelector("#target-role").value.trim(),
    focus: document.querySelector('input[name="focus"]:checked')?.value || "presence",
  };
  state.hasPersonalised = true;
  saveState();
  profileDialog.close();
  renderAll();
  showToast("Path personalised", state.profile.targetRole ? `Aiming toward ${state.profile.targetRole}.` : "Your focus is set.");
});

document.querySelector("#reset-progress").addEventListener("click", () => {
  const confirmed = window.confirm("Reset quests, tasks, books, medications, measurements, streaks, and reflections? This cannot be undone.");
  if (!confirmed) return;
  state = structuredClone(defaultState);
  saveState();
  profileDialog.close();
  renderAll();
  showToast("Fresh page", "Your progress has been reset.", false);
});

const infoDialog = document.querySelector("#info-dialog");
document.querySelector("#focus-info").addEventListener("click", () => infoDialog.showModal());
document.querySelector("#close-info").addEventListener("click", () => infoDialog.close());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

const restoredLootBoxes = grantLootBoxesThroughLevel(currentLevel().level);
if (restoredLootBoxes) saveState();
renderAll();
initialisePushBackend();

const initialView = location.hash.slice(1);
if (["today", "todos", "library", "meds", "weight", "growth", "armory"].includes(initialView)) switchView(initialView);
window.addEventListener("hashchange", () => {
  const view = location.hash.slice(1);
  if (["today", "todos", "library", "meds", "weight", "growth", "armory"].includes(view)) switchView(view);
});
