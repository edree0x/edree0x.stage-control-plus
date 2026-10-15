// Checks settings validation, shortcut parsing and conflicts, and the whole
// path from settings to hypr/stage.lua and back to the events it sends.
// Usage (from the plugin directory): node tests/settings.test.cjs

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { load, plain, root } = require("./load.cjs");

const Settings = load("Settings.js");
const Defaults = load("Defaults.js");
const defaults = plain(Defaults.DEFAULTS);
const schema = plain(Defaults.SCHEMA);
let passed = 0;

// Every default is valid against the schema, and the schema covers every setting.
{
  assert.deepEqual(plain(Settings.merge(defaults, defaults, schema)), defaults);
  assert.deepEqual(Object.keys(schema.types).sort(), Object.keys(defaults).sort(), "schema.types lists every setting");
  passed++;
}

// ---- shortcuts ---------------------------------------------------------------
{
  const cases = [
    ["SUPER + A", "SUPER + A", 64],
    ["super + alt + a", "SUPER + ALT + A", 72],
    ["ALT + SUPER + a", "SUPER + ALT + A", 72],
    ["CONTROL + UP", "CTRL + UP", 4],
    ["XF86LaunchA", "XF86LaunchA", 0],
    ["SUPER + SHIFT + CTRL + ALT + F12", "SUPER + CTRL + ALT + SHIFT + F12", 77],
  ];
  for (const [input, text, modmask] of cases) {
    const parsed = plain(Settings.parseShortcut(input));
    assert.equal(parsed.text, text, input);
    assert.equal(parsed.modmask, modmask, input);
  }
  for (const bad of ["SUPER +", "+ A", "SUPER + SUPER + A", "HYPER + A", "SUPER + A; rm", "SUPER + é", "SUPER + ", 42, null, "A".repeat(70)]) {
    assert.equal(Settings.parseShortcut(bad), null, String(bad));
  }
  assert.equal(plain(Settings.parseShortcut("  ")).empty, true);
  passed++;
}

// ---- merge ---------------------------------------------------------------------
{
  const user = {
    gestureFingers: 3,
    desktopSwipeFingers: 7,          // not a choice -> default
    dim: 500,                        // clamped
    speed: 60,
    stageKey: "super+tab",  // canonicalized
    appWindowsKey: "SUPER + ;",      // invalid -> default
    highlight: "#FF00AA",            // custom color, lowercased
    glass: "chrome",                 // not a choice
    groupByApp: "yes",               // wrong type
    cornerTopLeft: "stage",
    unknown: true,                   // dropped
  };
  const merged = plain(Settings.merge(defaults, user, schema));
  assert.equal(merged.gestureFingers, 3);
  assert.equal(merged.desktopSwipeFingers, 0);
  assert.equal(merged.dim, 80);
  assert.equal(merged.speed, 60);
  assert.equal(merged.stageKey, "SUPER + TAB");
  assert.equal(merged.appWindowsKey, defaults.appWindowsKey);
  assert.equal(merged.highlight, "#ff00aa");
  assert.equal(merged.glass, defaults.glass);
  assert.equal(merged.groupByApp, false);
  assert.equal(merged.cornerTopLeft, "stage");
  assert.equal(merged.unknown, undefined);
  assert.deepEqual(plain(Settings.overrides(defaults, merged)), {
    gestureFingers: 3, dim: 80, speed: 60, stageKey: "SUPER + TAB", highlight: "#ff00aa", cornerTopLeft: "stage",
  });
  assert.equal(Settings.highlightColor(merged, "#123456"), "#ff00aa");
  assert.equal(Settings.highlightColor(defaults, "#123456"), "#123456", "accent follows the theme");
  assert.equal(Settings.highlightColor(Object.assign({}, defaults, { highlight: "graphite" })), "#98989d");
  passed++;
}

// ---- Stage Control Plus's entry, from the bar configuration the shell hands plugins ----------
{
  const barConfig = {
    position: "top",
    layout: {
      left: [{ id: "omarchy.menu" }],
      center: [{ id: "omarchy.clock" }],
      right: [{ id: "omarchy.tray" }, { id: "stage-control.plus", dim: 55, desktops: { "eDP-1": [1, 2] } }],
    },
  };
  assert.deepEqual(plain(Settings.entryInBar(barConfig, "stage-control.plus")), { dim: 55, desktops: { "eDP-1": [1, 2] } });
  assert.deepEqual(plain(Settings.entryInBar(barConfig, "someone.else")), {});
  for (const bad of [null, undefined, "nope", [], { layout: "nope" }, { layout: { right: "nope" } }, { layout: { right: [null, 5, "x"] } }]) {
    assert.deepEqual(plain(Settings.entryInBar(bad, "stage-control.plus")), {}, JSON.stringify(bad));
  }
  // The copy is detached: changing it can't reach the shell's configuration.
  const copy = Settings.entryInBar(barConfig, "stage-control.plus");
  copy.dim = 1;
  assert.equal(barConfig.layout.right[1].dim, 55);
  passed++;
}

// ---- binds and conflicts ---------------------------------------------------------
{
  const settings = plain(Settings.merge(defaults, { macShortcuts: true, appWindowsKey: "SUPER + A" }, schema));
  const wanted = plain(Settings.wantedBinds(settings));
  assert.deepEqual(wanted.map((b) => b.keys), ["SUPER + A", "CTRL + UP", "CTRL + DOWN", "CTRL + LEFT", "CTRL + RIGHT", "XF86LaunchA"],
    "a duplicate chord is only bound once");
  const hyprBinds = [
    { modmask: 64, key: "UP", description: "Focus on above window" },
    { modmask: 4, key: "LEFT", description: "Word left" },
    { modmask: 4, key: "UP", description: "Open the stage (Stage Control Plus)" },   // our own, from before
    { modmask: 4, key: "DOWN", description: "", submap: "resize" },         // other submap
    { modmask: 4, key: "RIGHT", mouse: true },
  ];
  const checked = plain(Settings.checkBinds(wanted, hyprBinds));
  assert.deepEqual(checked.taken.map((t) => t.keys), ["CTRL + LEFT"]);
  assert.equal(checked.taken[0].usedBy, "Word left");
  assert.equal(checked.free.length, wanted.length - 1);
  assert.deepEqual(plain(Settings.wantedBinds(Object.assign({}, settings, { shortcuts: false }))), []);
  // Hyprland's binds unreadable: nothing is registered, everything reported.
  for (const unreadable of [null, undefined, "not json", { binds: [] }]) {
    const blind = plain(Settings.checkBinds(wanted, unreadable));
    assert.equal(blind.free.length, 0, "no bind registered without knowing it's free");
    assert.equal(blind.taken.length, wanted.length);
    assert.ok(blind.taken.every((t) => t.unknown === true));
  }
  passed++;
}

// ---- events --------------------------------------------------------------------
{
  assert.deepEqual(plain(Settings.parseEvent("stage-control.plus|toggle")), { type: "command", command: "toggle" });
  assert.deepEqual(plain(Settings.parseEvent("stage-control.plus|g|update|0.00|-12.50|1016.00|5")),
    { type: "gesture", phase: "update", dx: 0, dy: -12.5, time: 1016, fingers: 5 });
  assert.deepEqual(plain(Settings.parseEvent("stage-control.plus|g|finish|1|99.00")), { type: "gesture", phase: "finish", cancelled: true, time: 99 });
  for (const other of ["someone-else|toggle", "stage-control.plus|exec|rm", "stage-control.plus|g|explode", "", null, "stage-control.plus|toggle" + "|".repeat(200)]) {
    assert.equal(Settings.parseEvent(other), null, String(other));
  }
  passed++;
}

// ---- the whole path through hypr/stage.lua ---------------------------------------
{
  const settings = plain(Settings.merge(defaults, { macShortcuts: true, desktopSwipeFingers: 3 }, schema));
  const options = plain(Settings.hyprOptions(settings, Settings.wantedBinds(settings)));
  assert.equal(options.fingers, 4);
  assert.equal(options.desktopSwipe, 3);
  const literal = Settings.luaLiteral(options);
  const script = `
    package.path = "./tests/?.lua;" .. package.path
    local fake = require("fake_hl")
    local register = dofile("hypr/stage.lua")
    local status = register(${literal})
    local lines = { "status " .. status }
    for _, bind in ipairs(fake.active_binds()) do
      lines[#lines + 1] = "bind " .. bind.keys .. " => " .. bind.dispatcher.message .. " (" .. bind.options.description .. ")"
    end
    local spec = fake.gesture(4, "vertical")
    spec.action.start({ delta = { x = 0, y = -3 }, time_ms = 10, fingers = 4 })
    spec.action.update({ delta = { x = 1, y = -40.25 }, time_ms = 26, fingers = 4 })
    spec.action.finish({ cancelled = false, time_ms = 42 })
    for _, event in ipairs(fake.events) do lines[#lines + 1] = "event " .. event end
    print(table.concat(lines, "\\n"))`;
  const out = execFileSync("lua", ["-e", script], { cwd: root, encoding: "utf8" }).trim().split("\n");
  assert.equal(out[0], "status ok");
  const binds = out.filter((l) => l.startsWith("bind ")).sort();
  assert.ok(binds.includes("bind SUPER + A => stage-control.plus|toggle (Open the stage (Stage Control Plus))"), binds.join("\n"));
  assert.ok(binds.includes("bind CTRL + RIGHT => stage-control.plus|desktop-next (Move right a desktop (Stage Control Plus))"));
  assert.equal(binds.length, 7);
  const events = out.filter((l) => l.startsWith("event ")).map((l) => plain(Settings.parseEvent(l.slice(6))));
  assert.deepEqual(events, [
    { type: "gesture", phase: "start", dx: 0, dy: -3, time: 10, fingers: 4 },
    { type: "gesture", phase: "update", dx: 1, dy: -40.25, time: 26, fingers: 4 },
    { type: "gesture", phase: "finish", cancelled: false, time: 42 },
  ]);
  passed++;
}

// ---- Lua literals ----------------------------------------------------------------
{
  const tricky = { path: "/home/me/\"quoted\"\\dir/ümlaut\n", list: [1, true, "x"], "bad key": 1, nested: { a: null } };
  const lua = Settings.luaLiteral(tricky);
  const out = execFileSync("lua", ["-e", `local t = ${lua}; io.write(t.path, "|", #t.list, "|", tostring(t["bad key"]), "|", tostring(t.nested.a))`], { encoding: "utf8" });
  assert.equal(out, "/home/me/\"quoted\"\\dir/ümlaut\n|3|nil|nil");
  const registration = Settings.hyprRegistration(path.join(root, "hypr/stage.lua"), { fingers: 0, desktopSwipe: 0, binds: [] });
  assert.ok(registration.startsWith("return dofile(\""));
  passed++;
}

// ---- the expose-derived settings ------------------------------------------------
{
  assert.equal(defaults.workspaceScope, "all");
  assert.equal(defaults.windowSource, "thisDisplay");
  assert.equal(defaults.quickLookPlacement, "in-place");
  assert.equal(defaults.hotCornerDelay, 90);
  assert.equal(defaults.hotCornerDisplays, "all");
  assert.deepEqual(schema.choices.workspaceScope, ["all", "current"]);
  assert.deepEqual(schema.choices.windowSource, ["thisDisplay", "allDisplays"]);
  assert.deepEqual(schema.choices.quickLookPlacement, ["in-place", "centered"]);
  assert.deepEqual(schema.choices.hotCornerDisplays, ["all", "outermost"]);
  assert.deepEqual(schema.ranges.hotCornerDelay, [0, 1000]);

  const merged = plain(Settings.merge(defaults, {
    workspaceScope: "sometimes",
    windowSource: "somehow",
    quickLookPlacement: "sideways",
    hotCornerDisplays: "leftmost",
    hotCornerDelay: -5,
  }, schema));
  assert.equal(merged.workspaceScope, "all", "a bogus scope falls back to the default");
  assert.equal(merged.windowSource, "thisDisplay");
  assert.equal(merged.quickLookPlacement, "in-place");
  assert.equal(merged.hotCornerDisplays, "all");
  assert.equal(merged.hotCornerDelay, 0, "clamped into range");
  assert.equal(plain(Settings.merge(defaults, { hotCornerDelay: 99999 }, schema)).hotCornerDelay, 1000);
  const chosen = plain(Settings.merge(defaults, { workspaceScope: "current", windowSource: "allDisplays", quickLookPlacement: "centered", hotCornerDisplays: "outermost", hotCornerDelay: 250 }, schema));
  assert.equal(chosen.workspaceScope, "current");
  assert.equal(chosen.windowSource, "allDisplays");
  assert.equal(chosen.quickLookPlacement, "centered");
  assert.equal(chosen.hotCornerDisplays, "outermost");
  assert.equal(chosen.hotCornerDelay, 250);
  passed++;
}

console.log(`settings: ${passed} checks passed`);
