// A small in-memory stand-in for the Apps Script services Code.gs uses.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class FakeSheet {
  rows = [];
  getLastRow() { return this.rows.length; }
  getMaxRows() { return 1000; }
  insertRowsAfter() {}
  setFrozenRows() {}
  deleteRow(n) { this.rows.splice(n - 1, 1); }
  getRange(row, col, rowCount, colCount) {
    const sheet = this;
    return {
      setNumberFormat() { return this; },
      setValues(values) { values.forEach((v, i) => { sheet.rows[row - 1 + i] = [...v]; }); return this; },
      getValues() {
        return sheet.rows.slice(row - 1, row - 1 + rowCount).map((r) => r.slice(col - 1, col - 1 + colCount));
      },
    };
  }
}

export function loadBackend(properties = { ADMIN_PIN: '1234', SCORE_PIN: '0000' }) {
  const tabs = {};
  const props = { ...properties };
  const cache = new Map();
  const book = {
    getSheetByName: (name) => tabs[name] || null,
    insertSheet: (name) => (tabs[name] = new FakeSheet()),
  };
  const context = vm.createContext({
    console,
    SpreadsheetApp: { getActive: () => book },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => props[key] ?? null,
        setProperty: (key, value) => { props[key] = value; },
        deleteProperty: (key) => { delete props[key]; },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => cache.get(key) ?? null,
        put: (key, value) => { cache.set(key, value); },
        remove: (key) => { cache.delete(key); },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    // Records emails; set api.mailFails to make sending throw.
    MailApp: {
      sendEmail: (message) => {
        if (api.mailFails) throw new Error('mail is off');
        emails.push(message);
      },
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => ({ setMimeType() { return text; } }),
    },
    Utilities: { getUuid: () => crypto.randomUUID(), sleep: () => {}, formatDate: (date, zone) => date.toLocaleDateString('en-CA', { timeZone: zone }) },
    // Records calls to the rink Draw Clock; set fetchReply to change or throw the answer.
    UrlFetchApp: {
      fetch: (url, options) => {
        fetches.push({ url, body: JSON.parse(options.payload) });
        return { getContentText: () => api.fetchReply() };
      },
    },
  });
  const fetches = [];
  const emails = [];
  for (const file of ['Code.gs', 'Ccm.gs']) vm.runInContext(readFileSync(new URL(`../backend/${file}`, import.meta.url), 'utf8'), context);
  context.setup();
  const api = {
    tabs,
    fetches,
    emails,
    fetchReply: () => '{"ok":true}',
    context,
    get: (parameter = {}) => JSON.parse(context.doGet({ parameter })),
    post: (body) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } })),
  };
  return api;
}
