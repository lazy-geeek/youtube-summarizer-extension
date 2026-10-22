// Runtime checks SUM-001..SUM-006 for background.js; run: node tests/background.test.js
const vm = require("vm"), fs = require("fs"), assert = require("assert");
const SRC = fs.readFileSync(require("path").join(__dirname, "..", "background.js"), "utf8");
function load(local, sync) {
  let listener = null; const log = [];
  const ctx = {
    console: { warn: (...a) => log.push(["warn", a]), log }, Date,
    chrome: { runtime: { onMessage: { addListener(f) { listener = f; } } }, storage: { local, sync: sync || { get: async () => ({}) } } }
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return { ctx, get listener() { return listener; }, log };
}
function mem(init) {
  let data = init || {}; const calls = [];
  return {
    data: () => data, calls,
    get: async (k) => { calls.push("get"); return data[k] !== undefined ? { [k]: JSON.parse(JSON.stringify(data[k])) } : {}; },
    set: async (v) => { calls.push("set"); Object.assign(data, JSON.parse(JSON.stringify(v))); }
  };
}
(async () => {
  // SUM-001
  {
    const { ctx } = load(mem());
    for (const n of [0, 99, 100, 101]) {
      const s = {}; const ids = [...Array(n).keys()].sort(() => Math.random() - .5);
      ids.forEach(i => s["v" + i] = { summary: "x", title: "t", createdAt: i }); const snap = JSON.stringify(s);
      const r = ctx.pruneSummaries(s, 100); assert.strictEqual(Object.keys(r).length, Math.min(n, 100));
      if (n === 101) { assert(!("v0" in r)); assert("v100" in r); }
      assert.strictEqual(JSON.stringify(s), snap);
    }
    console.log("SUM-001 ok");
  }
  // SUM-002
  {
    const m = mem(); const { ctx } = load(m);
    let t0 = Date.now(); await ctx.saveSummary("a", "T", "S1"); let t1 = Date.now();
    let e = m.data().summaries.a; assert(e.summary === "S1" && e.title === "T" && e.createdAt >= t0 && e.createdAt <= t1);
    await new Promise(r => setTimeout(r, 5)); t0 = Date.now(); await ctx.saveSummary("a", "T2", "S2"); t1 = Date.now();
    assert.strictEqual(Object.keys(m.data().summaries).length, 1); e = m.data().summaries.a;
    assert(e.summary === "S2" && e.title === "T2" && e.createdAt >= t0 && e.createdAt <= t1); console.log("SUM-002 ok");
  }
  // SUM-003
  {
    const s = {}; for (let i = 0; i < 100; i++) s["k" + i] = { summary: "x", title: "t", createdAt: 1000 + i };
    const m = mem({ summaries: s }); const { ctx } = load(m);
    await ctx.saveSummary("k0", "t", "new"); await new Promise(r => setTimeout(r, 3)); await ctx.saveSummary("n", "t", "n");
    const r = m.data().summaries; assert.strictEqual(Object.keys(r).length, 100); assert("k0" in r && "n" in r && !("k1" in r));
    console.log("SUM-003 ok");
  }
  // SUM-004
  {
    let active = 0, overlap = false; const data = {};
    const local = {
      get: async (k) => { active++; if (active > 1) overlap = true; await new Promise(r => setTimeout(r, 10)); return data[k] ? { [k]: JSON.parse(JSON.stringify(data[k])) } : {}; },
      set: async (v) => { await new Promise(r => setTimeout(r, 10)); Object.assign(data, JSON.parse(JSON.stringify(v))); active--; }
    };
    const { ctx } = load(local); await Promise.all([ctx.saveSummary("a", "t", "s"), ctx.saveSummary("b", "t", "s")]);
    assert(!overlap); assert.deepStrictEqual(Object.keys(data.summaries).sort(), ["a", "b"]); console.log("SUM-004 ok");
  }
  // SUM-005
  {
    for (const mode of ["get", "set"]) {
      let n = 0; const data = {};
      const local = {
        get: async (k) => { if (mode === "get" && n++ === 0) throw new Error("q"); return {}; },
        set: async (v) => { if (mode === "set" && n++ === 0) throw new Error("q"); Object.assign(data, v); }
      };
      const { ctx } = load(local); let rejected = false;
      await ctx.saveSummary("a", "t", "s").catch(() => { rejected = true; }); assert(rejected);
      await ctx.saveSummary("b", "t", "s"); assert.deepStrictEqual(Object.keys(data.summaries), ["b"]);
    }
    console.log("SUM-005 ok");
  }
  // SUM-006
  {
    const run = async (msg, fake, setThrows) => {
      const order = []; const m = mem(); const origSet = m.set;
      m.set = async (v) => { order.push("set"); if (setThrows) throw new Error("quota"); return origSet(v); };
      const h = load(m); if (fake) h.ctx.summarize = fake;
      const resp = await new Promise(res => { const r = h.listener(msg, {}, (x) => { order.push("resp"); res(x); }); assert.strictEqual(r, true); });
      return { order, resp, m, h };
    };
    let r = await run({ type: "SUMMARIZE", videoId: "a", title: "t", transcript: "x" }, async () => ({ summary: "S" }));
    assert.deepStrictEqual(r.order, ["set", "resp"]); assert.strictEqual(JSON.stringify(r.resp), JSON.stringify({ summary: "S" })); assert("a" in r.m.data().summaries);
    r = await run({ type: "SUMMARIZE", title: "t", transcript: "x" }, async () => ({ summary: "S" }));
    assert.deepStrictEqual(r.m.calls, []); assert.strictEqual(JSON.stringify(r.resp), JSON.stringify({ summary: "S" }));
    r = await run({ type: "SUMMARIZE", videoId: "a", title: "t", transcript: "x" }, null);
    assert.deepStrictEqual(r.m.calls, []); assert.strictEqual(JSON.stringify(r.resp), JSON.stringify({ error: "NO_API_KEY" }));
    r = await run({ type: "SUMMARIZE", videoId: "a", title: "t", transcript: "x" }, async () => ({ summary: "S" }), true);
    assert(r.h.log.some(x => x[0] === "warn")); assert.strictEqual(JSON.stringify(r.resp), JSON.stringify({ summary: "S" }));
    console.log("SUM-006 ok");
  }
})().catch(e => { console.error("FAIL", e); process.exit(1); });
