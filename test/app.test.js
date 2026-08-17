import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the static app exposes its core experience", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /Your daily quests/);
  assert.match(html, /Capability growth/);
  assert.match(html, /Your executive journey/);
  assert.match(html, /app\.js/);
  assert.match(html, /styles\.css/);
});

test("life actions award XP and header controls have useful destinations", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="home-link" href="#today"/);
  assert.match(html, /id="streak-button"/);
  assert.match(app, /awardLifeXp\(10, "Book added"/);
  assert.match(app, /awardLifeXp\(10, "Medication added"/);
  assert.match(app, /awardLifeXp\(5, "Dose logged"/);
  assert.match(app, /function awardBookProgress/);
});

test("level ups grant sealed coffers for an outfit-able character", async () => {
  const [html, app, loot, css, worker, packageJson] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
    readFile(new URL("../loot-system.js", import.meta.url), "utf8"),
    readFile(new URL("../armory.css", import.meta.url), "utf8"),
    readFile(new URL("../service-worker.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="armory-button"/);
  assert.match(html, /id="armory-view"/);
  assert.match(html, /id="open-coffer"/);
  assert.match(html, /data-character-piece="head"/);
  assert.match(html, /id="loot-inventory"/);
  assert.match(app, /function grantLootBoxesThroughLevel/);
  assert.match(app, /rewardedThroughLevel/);
  assert.match(app, /lootBoxesEarned: grantLootBoxesThroughLevel/);
  assert.match(app, /rollLootDrop\(\)/);
  assert.match(app, /state\.loot\.equipped\[item\.slot\] = item\.instanceId/);
  assert.match(app, /renderArmory\(\)/);
  assert.match(loot, /if \(roll < 0\.6\) return "common"/);
  assert.match(loot, /if \(roll < 0\.99\) return "epic"/);
  assert.match(loot, /return "legendary"/);
  assert.match(css, /\.character-sheet/);
  assert.match(css, /@keyframes cofferLid/);
  assert.match(worker, /loot-system\.js/);
  assert.match(JSON.parse(packageJson).scripts.check, /loot-system\.js/);
});

test("Azure Static Web Apps configuration has a navigation fallback", async () => {
  const config = JSON.parse(
    await readFile(new URL("../staticwebapp.config.json", import.meta.url), "utf8"),
  );
  assert.equal(config.navigationFallback.rewrite, "/index.html");
  assert.equal(config.globalHeaders["X-Content-Type-Options"], "nosniff");
});


test("life-admin fields and optional push wiring are present", async () => {
  const [html, app, worker, pushConfig, backendPackage] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
    readFile(new URL("../service-worker.js", import.meta.url), "utf8"),
    readFile(new URL("../push-config.json", import.meta.url), "utf8"),
    readFile(new URL("../backend/package.json", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="todo-priority"/);
  assert.match(html, /id="todo-time"/);
  assert.match(html, /id="med-dosage"/);
  assert.match(html, /id="med-schedule-type"/);
  assert.match(html, /name="med-weekday"/);
  assert.match(html, /id="med-dose-unit"/);
  assert.match(app, /pushManager\.subscribe/);
  assert.match(app, /push\/sync/);
  assert.match(worker, /addEventListener\("push"/);
  assert.equal(JSON.parse(pushConfig).apiBase, "");
  assert.equal(JSON.parse(backendPackage).dependencies["web-push"], "^3.6.7");
});

test("weight tracking is wired into the static shell", async () => {
  const [html, app, worker, packageJson] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
    readFile(new URL("../service-worker.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(html, /data-view="weight"/);
  assert.match(html, /id="weight-form"/);
  assert.match(html, /id="weight-chart"/);
  assert.match(html, /id="waist-unit"/);
  assert.match(html, /decimals supported/);
  assert.match(app, /weightEntries: \[\]/);
  assert.match(app, /normalizeWeightEntries\(saved\?\.weightEntries\)/);
  assert.match(app, /same date updates|Measurement updated/);
  assert.match(app, /"weight"/);
  const weightSubmitStart = app.indexOf('document.querySelector("#weight-form").addEventListener("submit"');
  const weightSubmitEnd = app.indexOf('document.querySelector("#todo-form").addEventListener("submit"');
  const weightSubmitHandler = app.slice(weightSubmitStart, weightSubmitEnd);
  assert.ok(weightSubmitStart >= 0 && weightSubmitEnd > weightSubmitStart);
  assert.doesNotMatch(weightSubmitHandler, /\.reset\(\)/);
  assert.doesNotMatch(weightSubmitHandler, /#weight-value"\)\.focus\(\)/);
  assert.match(weightSubmitHandler, /waistToCanonicalCentimetres/);
  assert.match(weightSubmitHandler, /waistInputWithinBounds/);
  assert.match(worker, /weight-tracker\.js/);
  assert.match(JSON.parse(packageJson).scripts.check, /weight-tracker\.js/);
  const snapshotStart = app.indexOf("function renderLifeSnapshot()");

  const snapshotEnd = app.indexOf("function renderReminderSettings()");
  const snapshotUpdate = app.indexOf("#snapshot-weight-count");
  assert.ok(snapshotStart >= 0 && snapshotUpdate > snapshotStart && snapshotUpdate < snapshotEnd);
  assert.equal((app.match(/#snapshot-weight-count/g) || []).length, 1);
  assert.match(app, /escapeSvgAttribute\(pointAriaLabel\(point, true\)\)/);
  assert.doesNotMatch(app, /aria-label="\$\{escapeHtml\(measurementDetail\(point\)\)\}"/);
  const pointLabel = app.slice(app.indexOf("function pointAriaLabel"), app.indexOf("function renderWeightChart"));
  assert.doesNotMatch(pointLabel, /note/);

});

test("finite medication courses are wired into the meds view without a bundled treatment plan", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(html, /programme-|Eight-week plan|PROTOCOL SETUP/);
  assert.match(html, /<option value="cycle">/);
  assert.match(html, /id="med-cycle-on-days"/);
  assert.match(html, /id="med-cycle-off-days"/);
  assert.match(html, /id="med-cycle-time"/);
  assert.match(html, /id="cancel-med-edit"/);
  assert.match(html, /id="med-course-start"/);
  assert.match(html, /id="med-duration"/);
  assert.match(html, /id="med-duration-unit"/);
  assert.match(html, /id="med-course-end"/);
  assert.doesNotMatch(html, /id="med-last-taken"/);
  assert.match(html, /id="dose-correction-dialog"/);
  assert.match(html, /<option value="IU">IU<\/option>/);
  assert.doesNotMatch(html, /id="med-dosage"[^>]*required/);
  assert.match(app, /concreteMedicationReminderId, finiteIntervalOccurrences, finiteIntervalReminderOccurrences/);
  assert.match(app, /medicationDoseLabel/);
  assert.match(app, /#next-dose-time"\)\.textContent = next \? \[medicationDoseLabel\(next\.medication\), next\.timing\.label\]/);
  assert.match(app, /const dose = medicationDoseLabel\(medication\);[\s\S]*\$\{dose \? `<span class="med-dose">\$\{escapeHtml\(dose\)\}/);
  assert.match(app, /dueMeds\.map\(\(medication\) => \[medication\.name, medicationDoseLabel\(medication\)\]/);
  assert.match(app, /const dose = medicationDoseLabel\(medication\) \|\| "your scheduled dose"/);
  assert.match(app, /medicationOccurrences\(medication, anchor, 1\)/);
  assert.match(app, /medicationOccurrences\(medication, futureAnchor, 8\)/);
  assert.match(app, /COURSE COMPLETE|Course complete/);
  assert.match(app, /status === "upcoming"[\s\S]*medicationOccurrences\(medication, startsAt - 1, 1\)/);
  assert.match(app, /timing\.due \? "!" : timing\.status === "upcoming" \? "→" : "✓"/);
  assert.doesNotMatch(app, /eight-week-plan|buildEightWeekPlan|normalizeEightWeekProgrammes|hasEightWeekProgrammeStart|programmeInstanceId/);
  assert.match(app, /data-med-edit/);
  assert.match(app, /Edit medication & schedule/);
  assert.match(app, /data-med-correct/);
  assert.match(app, /function startMedicationEdit/);
  assert.match(app, /\.\.\.existing,[\s\S]*id: existing\?\.id \|\| makeId\("med"\)/);
  assert.match(app, /state\.medications = state\.medications\.map\(\(item\) => item\.id === existing\.id/);
  assert.match(app, /const levelUp = existing \? null : awardLifeXp\(10/);
  assert.match(app, /if \(editingMedicationId === medication\.id\) resetMedicationForm\(\)/);
  assert.match(app, /scheduleType === "cycle"[\s\S]*cycleOffDays < 0/);
  const medicationSubmitStart = app.indexOf('document.querySelector("#med-form").addEventListener("submit"');
  const medicationSubmitEnd = app.indexOf('document.querySelector("#cancel-med-edit")', medicationSubmitStart);
  const medicationSubmitHandler = app.slice(medicationSubmitStart, medicationSubmitEnd);
  assert.ok(medicationSubmitStart >= 0 && medicationSubmitEnd > medicationSubmitStart);
  assert.doesNotMatch(medicationSubmitHandler, /medLog/);
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
  assert.match(app, /boundedNotificationTime, concreteMedicationReminderId, finiteIntervalOccurrences, finiteIntervalReminderOccurrences/);
  assert.match(app, /boundedNotificationTime\(medication, dueAt, leadMs\)/);
  assert.match(app, /if \(medication\.courseEndDate\) \{[\s\S]*finiteIntervalReminderOccurrences\(medication, timing\.dueAt, intervalMs, now, 8\)/);
  assert.doesNotMatch(app, /finiteIntervalReminderOccurrences\([^\n]*86400000/);
  assert.match(app, /body: `\$\{dose\} is \$\{dueAt <= now \? "overdue" : "nearly due"\}\.`/);
  assert.equal((app.match(/id: concreteMedicationReminderId\(medication\.id, dueAt\)/g) || []).length, 2);
  assert.match(app, /const dueAt = nextIntervalOccurrence\(medication, rawDueAt, intervalMs\)/);
  assert.match(app, /id: medication\.id,[\s\S]*intervalMs,/);
  const finiteIntervalStart = app.indexOf("if (medication.courseEndDate) {");
  const ongoingIntervalStart = app.indexOf("const notifyAt = boundedNotificationTime(medication, timing.dueAt, leadMs);", finiteIntervalStart);
  assert.ok(finiteIntervalStart >= 0 && ongoingIntervalStart > finiteIntervalStart);
  assert.doesNotMatch(app.slice(finiteIntervalStart, ongoingIntervalStart), /intervalMs,\s*url/);
  assert.match(app.slice(ongoingIntervalStart), /intervalMs,\s*url/);
  assert.match(app, /updateMedicationCoursePreview/);
  assert.equal((app.match(/function medicationTiming\(/g) || []).length, 1);
  assert.equal((app.match(/function renderMedications\(/g) || []).length, 1);
  assert.equal((app.match(/#med-form"\)\.addEventListener\("submit"/g) || []).length, 1);
  assert.doesNotMatch(css, /\.protocol-panel|\.protocol-summary/);
});
