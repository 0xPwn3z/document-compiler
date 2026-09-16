const test = require("node:test");
const assert = require("node:assert");
const { findMatches, replaceInMarkdown } = require("../static/find-replace.js");

const MARKER = '<!-- dc:block {"id":"b00001","kind":"paragraph","style":"Normal","body_index":1} -->';
const HEADER = "<!-- doc-compiler:version 1 -->";

test("replace replaces every content occurrence, case-insensitive by default", () => {
  const md = "Il cliente ACME è acme.\n\nAcme spa";
  const out = replaceInMarkdown(md, { find: "acme", replace: "Beta" });
  assert.strictEqual(out.result, "Il cliente Beta è Beta.\n\nBeta spa");
  assert.strictEqual(out.count, 3);
});

test("replace never touches dc: marker lines, even when they contain the needle", () => {
  const md = `${HEADER}\n\n${MARKER}\nVecchio id di riferimento\n\n<!-- dc:blank -->\n`;
  const out = replaceInMarkdown(md, { find: "id", replace: "ID" });
  assert.ok(out.result.includes(MARKER), "marker dc:block alterato");
  assert.ok(out.result.includes(HEADER), "header doc-compiler alterato");
  assert.ok(out.result.includes("<!-- dc:blank -->"), "dc:blank alterato");
  assert.ok(out.result.includes("Vecchio ID di riferimento"));
  assert.strictEqual(out.count, 1);
});

test("marker JSON with needle-like keys stays byte-identical", () => {
  const marker = '<!-- dc:block {"id":"b00007","page_break":true,"list_type":null} -->';
  const md = `pagina page_break di prova\n\n${marker}\n`;
  const out = replaceInMarkdown(md, { find: "page_break", replace: "interruzione" });
  assert.ok(out.result.includes(marker));
  assert.ok(out.result.includes("pagina interruzione di prova"));
  assert.strictEqual(out.count, 1);
});

test("dc:page-break and dc:opaque comments are protected", () => {
  const md = "<!-- dc:page-break -->\n<!-- dc:opaque {\"reason\":\"page_break\"} -->\ncontenuto page_break\n";
  const out = replaceInMarkdown(md, { find: "page_break", replace: "x" });
  assert.ok(out.result.includes("<!-- dc:page-break -->"));
  assert.ok(out.result.includes('<!-- dc:opaque {"reason":"page_break"} -->'));
  assert.strictEqual(out.count, 1);
});

test("regex metacharacters are treated literally", () => {
  const md = "prezzo (EUR) 100\nprezzo EUR 200";
  const out = replaceInMarkdown(md, { find: "(EUR)", replace: "[eur]" });
  assert.strictEqual(out.result, "prezzo [eur] 100\nprezzo EUR 200");
  assert.strictEqual(out.count, 1);
});

test("dollar signs in replacement are literal", () => {
  const out = replaceInMarkdown("a e b", { find: "e", replace: "$&$'" });
  assert.strictEqual(out.result, "a $&$' b");
});

test("wholeWord option does not match inside longer words", () => {
  const md = "il test e il testing";
  const out = replaceInMarkdown(md, { find: "test", replace: "verifica", wholeWord: true });
  assert.strictEqual(out.result, "il verifica e il testing");
  assert.strictEqual(out.count, 1);
});

test("wholeWord respects accented characters", () => {
  const md = "città cittàs";
  const out = replaceInMarkdown(md, { find: "città", replace: "urbe", wholeWord: true });
  assert.strictEqual(out.result, "urbe cittàs");
});

test("caseSensitive option restricts matches", () => {
  const out = replaceInMarkdown("Acme acme ACME", { find: "acme", replace: "X", caseSensitive: true });
  assert.strictEqual(out.result, "Acme X ACME");
  assert.strictEqual(out.count, 1);
});

test("empty find is a no-op", () => {
  const md = "testo dc:block integro";
  const out = replaceInMarkdown(md, { find: "", replace: "x" });
  assert.strictEqual(out.result, md);
  assert.strictEqual(out.count, 0);
});

test("findMatches returns content-only ranges in order", () => {
  const md = `${MARKER}\nuno due tre\n\ndue ancora`;
  const matches = findMatches(md, { find: "due" });
  assert.deepStrictEqual(
    matches.map((m) => md.slice(m.start, m.end)),
    ["due", "due"],
  );
  assert.ok(matches[0].start > MARKER.length);
});

test("findMatches honours case and wholeWord options", () => {
  const md = "Test testing test";
  assert.strictEqual(findMatches(md, { find: "test" }).length, 3);
  assert.strictEqual(findMatches(md, { find: "test", caseSensitive: true }).length, 2);
  assert.strictEqual(findMatches(md, { find: "test", wholeWord: true }).length, 2);
});

test("round trip: replace via matches equals replaceInMarkdown result", () => {
  const md = "alpha beta gamma beta";
  const direct = replaceInMarkdown(md, { find: "beta", replace: "δ" }).result;
  let stepwise = md;
  let matches = findMatches(stepwise, { find: "beta" });
  while (matches.length) {
    const m = matches[0];
    stepwise = stepwise.slice(0, m.start) + "δ" + stepwise.slice(m.end);
    matches = findMatches(stepwise, { find: "beta" });
  }
  assert.strictEqual(direct, stepwise);
});
