// Fast, no-browser check of index.html's parsed DOM structure, using jsdom (a
// spec-compliant HTML5 parser — the same parsing rules a real browser follows).
//
// Why this exists: a missing closing </script> tag is NOT invalid HTML. A browser's
// (and jsdom's) parser treats a <script> element's content as raw text up to the
// first literal "</script>" it finds in the source — so an unclosed <script src=...>
// right before <script type="module" src="app.js"></script> swallows that second tag
// as plain text instead of parsing it as an element. The page looks fine in a text
// editor and passes ordinary HTML syntax validation (there is no syntax error), but
// app.js silently never runs. Only parsing the file the way a browser actually does,
// and then asserting the elements you expect exist, catches this class of bug.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const {window} = new JSDOM(html);
const {document} = window;

const appScript = document.querySelector('script[type="module"][src="app.js"]');
assert.ok(
  appScript,
  'index.html must parse to include <script type="module" src="app.js"> as its own element (not swallowed as text by an earlier unclosed <script> tag)',
);

// Every external <script>/<link> before app.js must be properly closed/self-closed —
// otherwise it can swallow everything after it as raw text, same failure mode as above.
const scripts = [...document.querySelectorAll('script')];
assert.ok(
  scripts.length >= 2,
  `expected at least 2 <script> elements to parse out, found ${scripts.length} — something upstream is likely swallowing the rest of the document`,
);

// A duplicate id means $('that-id') (document.getElementById) silently returns the
// wrong element for whichever one comes first — a different but related class of
// "looks fine, silently wrong" bug worth catching the same way.
const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
assert.deepEqual(duplicates, [], `duplicate element ids found: ${duplicates.join(', ')}`);

console.log('HTML structure tests passed: app.js module script parses as its own element, no duplicate ids.');
