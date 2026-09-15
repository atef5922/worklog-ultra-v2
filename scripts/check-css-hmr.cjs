// Exercise the installed Next.js CSS HMR runtime, not a hand-written substitute.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const patch = require("./webpack/safe-css-hmr-cleanup.cjs");
const source = fs.readFileSync(
  require.resolve("next/dist/compiled/mini-css-extract-plugin/hmr/hotModuleReplacement"), "utf8",
);

function cleanup(runtime, event, detached) {
  const timers = [], clones = [];
  let removals = 0;
  const parent = {
    appendChild(node) { node.parentNode = this; clones.push(node); },
    removeChild(node) { removals++; node.parentNode = null; },
  };
  const oldLink = {
    href: "http://localhost:3000/regression.css", parentNode: parent,
    cloneNode() {
      return { handlers: {}, addEventListener(name, callback) { this.handlers[name] = callback; } };
    },
  };
  const context = {
    module: { exports: {} }, __dirname: ".",
    document: {
      currentScript: null, getElementsByTagName() { return []; },
      querySelectorAll() { return [oldLink]; },
    },
    console: { log() {} },
    setTimeout(callback) { timers.push(callback); }, clearTimeout() {},
  };
  vm.runInNewContext(runtime, context);
  context.module.exports("regression", { locals: true })();
  timers.shift()();
  if (detached) parent.removeChild(oldLink); // Concurrent Webpack/React cleanup.
  clones[0].handlers[event]();
  clones[0].handlers[event](); // Duplicate load/error events must be harmless.
  assert.equal(removals, 1);
  assert.equal(clones[0].parentNode, parent, "Replacement stylesheet stays attached");
}
assert.throws(() => cleanup(source, "load", true), /Cannot read properties of null.*removeChild/);
assert.throws(() => cleanup(source, "error", true), /Cannot read properties of null.*removeChild/);
const safe = patch(source);
assert.notEqual(safe, source, "Guard must match the installed Next.js runtime; reassess on upgrade");
for (const event of ["load", "error"]) {
  for (const detached of [false, true]) cleanup(safe, event, detached);
}
assert.equal(patch("unrelated code"), "unrelated code");
console.log("PASS: reproduced original CSS HMR removeChild error; guarded load/error, attached/detached and duplicate events");

const config = require("../next.config.js");
for (const [dev, isServer, expected] of [[true, false, 1], [true, true, 0], [false, false, 0], [false, true, 0]]) {
  const configured = config.webpack({ module: { rules: [] } }, { dev, isServer });
  assert.equal(configured.module.rules.length, expected, "HMR guard applies only to the dev client");
  if (expected) {
    assert(configured.module.rules[0].test.test(require.resolve("next/dist/compiled/mini-css-extract-plugin/hmr/hotModuleReplacement")));
  }
}
console.log("PASS: actual Next config enables cleanup guard only for development clients");
