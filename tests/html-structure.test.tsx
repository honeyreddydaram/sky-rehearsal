import React from 'react';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import App from '../src/App';

const entry = new JSDOM(readFileSync('index.html', 'utf8')).window.document;
assert.ok(entry.querySelector('#root'));
assert.ok(entry.querySelector('script[type="module"][src="/src/main.tsx"]'));
const document = new JSDOM(renderToStaticMarkup(<App />)).window.document;
const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
assert.equal(new Set(ids).size, ids.length, 'Rehearsal controls must have unique IDs');
for (const id of ['map', 'play', 'route-distance', 'quiz-dialog', 'airfield-panel']) {
  assert.ok(document.getElementById(id), `Missing rehearsal control: ${id}`);
}
console.log('React interface structure passed: entry point, controls, unique IDs.');
