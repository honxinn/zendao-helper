const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../zendao.js'), 'utf8');
const formUrl = 'http://zentao.test/effort-createForObject-bug-88119.html?onlybody=yes';
const nativeSuccessHtml = fs.readFileSync(path.join(__dirname, 'fixtures/effort-save-success.html'), 'utf8');

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, event = {}) {
    for (const fn of [...(this.listeners.get(type) || [])]) fn({ type, ...event });
  }
}

function setup({ sandbox = false, initialBlank = false } = {}) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const observers = new Set();
  const result = { refreshes: 0, closes: 0 };
  const schedule = (fn, delay, interval = false) => {
    const id = ++nextTimer;
    timers.set(id, { fn, at: now + delay, delay, interval });
    return id;
  };
  class Observer {
    constructor(fn) { this.fn = fn; observers.add(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  class XHR extends Events {
    open(method, url) { this.method = method; this.url = url; }
    send() {}
    respond(status, payload) {
      this.status = status;
      this.readyState = 4;
      this.responseText = JSON.stringify(payload);
      this.emit('readystatechange');
      this.emit('load');
      this.emit('loadend');
    }
  }
  const frame = new Events();
  frame.dataset = {};
  const top = { location: { reload: () => result.refreshes++ } };
  const frameWindow = new Events();
  frameWindow.XMLHttpRequest = XHR;
  frameWindow.location = new URL(initialBlank ? 'about:blank' : formUrl);
  frameWindow.MutationObserver = Observer;
  frame.contentWindow = frameWindow;
  frame.ownerDocument = { querySelectorAll: () => [frame] };
  if (sandbox) frame.contentWindow = { location: frameWindow.location, XMLHttpRequest: class { open() {} } };
  const makeDocument = () => {
    const doc = new Events();
    doc.body = {};
    doc.scripts = [];
    doc.successNodes = [];
    doc.button = {
      dataset: {}, disabled: false,
      getAttribute: name => name === 'disabled' && doc.button.disabled ? '' : null,
      closest: () => doc.button,
    };
    doc.querySelector = selector => selector.includes('#submit') ? doc.button : doc.successNodes[0] || null;
    doc.querySelectorAll = selector => selector === 'script' ? doc.scripts :
      selector === 'iframe, frame' ? (doc.resultFrame ? [doc.resultFrame] : []) : doc.successNodes;
    return doc;
  };
  frame.contentDocument = makeDocument();
  const context = vm.createContext({
    URL, WeakMap, WeakSet, Map, Set, console: { log() {}, warn() {} },
    window: { top }, location: top.location, MutationObserver: Observer,
    closeQuickDockUI: () => result.closes++,
    setTimeout: (fn, delay) => schedule(fn, delay),
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, true),
    clearInterval: id => timers.delete(id),
    ...(sandbox ? { unsafeWindow: { frames: [frameWindow] } } : {}),
  });
  const helperStart = source.indexOf('      function watchBugActionFrame(');
  assert.notEqual(helperStart, -1);
  vm.runInContext(source.slice(helperStart, source.indexOf('      // Bug详情页', helperStart)) +
    '\nglobalThis.watch = watchBugActionFrame;', context);
  const dispose = context.watch(frame, () => result.refreshes++);
  const tick = ms => {
    const until = now + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      if (timer.interval) timer.at += timer.delay;
      else timers.delete(id);
      timer.fn();
    }
    now = until;
  };
  const mutate = () => {
    for (const observer of [...observers]) if (observer.active) observer.fn([], observer);
  };
  const submit = () => frame.contentDocument.emit('submit', { target: frame.contentDocument });
  const request = (method = 'POST', url = formUrl) => {
    const xhr = new XHR();
    xhr.open(method, url);
    xhr.send();
    return xhr;
  };
  const nativeSubmit = (target = 'hiddenwin') => {
    const doc = frame.contentDocument;
    const responseFrame = target === '_self' ? frame : new Events();
    if (target !== '_self') {
      responseFrame.name = target;
      responseFrame.id = target;
      responseFrame.contentWindow = { location: new URL('about:blank') };
      responseFrame.contentDocument = makeDocument();
      doc.resultFrame = responseFrame;
    }
    const form = { method: 'post', action: formUrl, target,
      getAttribute: name => ({ method: 'post', action: formUrl, target }[name] || null),
    };
    doc.emit('submit', { target: form });
    return {
      originalDocument: doc,
      respond(html, href = formUrl) {
        const resultDoc = makeDocument();
        resultDoc.body.textContent = html;
        resultDoc.scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(match => ({ textContent: match[1] }));
        responseFrame.contentDocument = resultDoc;
        responseFrame.contentWindow.location = new URL(href);
        responseFrame.emit('load');
      },
    };
  };
  return { frame, result, tick, mutate, submit, request, nativeSubmit, dispose,
    reloadForm() { frame.contentDocument = makeDocument(); frame.emit('load'); },
    makeFormAvailableWithoutLoad() {
      frameWindow.location = new URL(formUrl);
      frame.contentDocument = makeDocument();
    },
  };
}

test('保存按钮变灰时不隐藏面板，也不提前刷新', () => {
  const env = setup();
  env.submit();
  env.frame.contentDocument.button.disabled = true;
  env.mutate();
  env.tick(500);
  assert.equal(env.result.closes, 0);
  assert.equal(env.result.refreshes, 0);
});

test('AJAX 返回保存成功后刷新，即使按钮没有变灰', () => {
  const env = setup();
  env.submit();
  env.request().respond(200, { result: 'success', message: '保存成功' });
  env.tick(500);
  assert.equal(env.result.refreshes, 1);
});

test('真实禅道原生表单提交到hiddenwin，收到closeModal完成响应后刷新', () => {
  const env = setup();
  const submission = env.nativeSubmit();
  env.tick(1000);
  assert.equal(env.result.refreshes, 0);
  submission.respond(nativeSuccessHtml);
  env.tick(500);
  assert.equal(env.result.refreshes, 1);
});

test('表单文档可用但iframe尚未load时也能监听原生保存', () => {
  const env = setup({ initialBlank: true });
  assert.equal(env.frame.inert, true);
  env.makeFormAvailableWithoutLoad();
  env.tick(150);
  assert.equal(env.frame.inert, false);
  env.nativeSubmit().respond(nativeSuccessHtml);
  env.tick(500);
  assert.equal(env.result.refreshes, 1);
});

test('原生表单响应直接加载在面板iframe时也通知外层刷新', () => {
  const env = setup();
  const submission = env.nativeSubmit('_self');
  submission.respond(nativeSuccessHtml);
  env.tick(500);
  assert.equal(env.result.refreshes, 1);
});

test('原生表单校验失败不刷新，原表单保持可用，重试成功后刷新', () => {
  const env = setup();
  const submission = env.nativeSubmit();
  submission.respond('<html><script>alert("耗时不能为空");</script></html>');
  env.tick(500);
  assert.equal(env.result.refreshes, 0);
  assert.equal(env.frame.contentDocument, submission.originalDocument);
  env.nativeSubmit().respond(nativeSuccessHtml);
  env.tick(500);
  assert.equal(env.result.refreshes, 1);
});

test('hiddenwin的心跳和无关页面不会被当作保存完成', () => {
  const env = setup();
  const submission = env.nativeSubmit();
  submission.respond(nativeSuccessHtml, 'http://zentao.test/misc-ping.html');
  env.tick(500);
  assert.equal(env.result.refreshes, 0);
  submission.respond(nativeSuccessHtml);
  env.tick(500);
  assert.equal(env.result.refreshes, 1);
});

test('原生提交返回登录跳转时不误判成功', () => {
  const env = setup();
  env.nativeSubmit().respond('<html><script>self.location="/user-login.html";</script></html>');
  env.tick(500);
  assert.equal(env.result.refreshes, 0);
});

test('释放监听后原生表单的响应不再刷新页面', () => {
  const env = setup();
  const submission = env.nativeSubmit();
  env.dispose();
  submission.respond(nativeSuccessHtml);
  env.tick(500);
  assert.equal(env.result.refreshes, 0);
});

test('油猴隔离环境中监听页面实际使用的请求对象', () => {
  const env = setup({ sandbox: true });
  env.submit();
  env.request().respond(200, { result: 'success' });
  env.tick(500);
  assert.equal(env.result.refreshes, 1);
});

test('表单打开超过15秒且保存请求较慢时仍等待响应并刷新', () => {
  const env = setup();
  env.tick(30000);
  env.submit();
  const xhr = env.request();
  env.tick(20000);
  assert.equal(env.result.refreshes, 0);
  xhr.respond(200, { result: 'success' });
  env.tick(500);
  assert.equal(env.result.refreshes, 1);
});

test('保存失败保留表单，修正后重试成功才刷新', () => {
  const env = setup();
  env.submit();
  env.request().respond(200, { result: 'fail', message: { consumed: '必填' } });
  env.tick(500);
  assert.equal(env.result.closes, 0);
  assert.equal(env.result.refreshes, 0);
  env.submit();
  env.request().respond(200, { result: 'success' });
  env.tick(500);
  assert.equal(env.result.refreshes, 1);
});

test('同一URL重新加载表单后，新文档继续监听保存', () => {
  const env = setup();
  env.reloadForm();
  env.submit();
  env.request().respond(200, { result: 'success' });
  env.tick(500);
  assert.equal(env.result.refreshes, 1);
});

test('无关请求和GET成功不会被当成保存成功', () => {
  const env = setup();
  env.submit();
  env.request('GET').respond(200, { result: 'success' });
  env.request('POST', '/misc-ping.html').respond(200, { result: 'success' });
  env.request().respond(500, { result: 'success' });
  env.tick(500);
  assert.equal(env.result.refreshes, 0);
});

test('保存后出现成功提示时刷新，初始成功样式不会误触发', () => {
  const env = setup();
  const doc = env.frame.contentDocument;
  doc.successNodes.push({ textContent: '历史提示' });
  env.mutate();
  env.tick(500);
  assert.equal(env.result.refreshes, 0);
  env.submit();
  env.mutate();
  assert.equal(env.result.refreshes, 0);
  doc.successNodes.push({ textContent: '保存成功' });
  env.mutate();
  env.tick(500);
  assert.equal(env.result.refreshes, 1);
});

test('返回Bug详情仅在提交后触发刷新，多个成功信号只刷新一次', () => {
  const env = setup();
  env.submit();
  env.frame.contentWindow.location = new URL('http://zentao.test/bug-view-88119.html');
  env.frame.emit('load');
  env.frame.emit('load');
  env.tick(500);
  assert.equal(env.result.refreshes, 1);
});

test('释放监听后请求完成不会触发刷新', () => {
  const env = setup();
  env.submit();
  const xhr = env.request();
  env.dispose();
  xhr.respond(200, { result: 'success' });
  env.tick(500);
  assert.equal(env.result.refreshes, 0);
});

test('解决方案选项已经增强时不重复改写DOM，避免观察器循环', () => {
  const observers = [];
  let textWrites = 0;
  let text = '已解决';
  const option = {
    title: '',
    get text() { return text; },
    set text(value) { textWrites++; text = value; },
  };
  const select = { dataset: {}, options: [option] };
  const doc = { body: { querySelector: selector => selector.includes('select') ? select : null } };
  const start = source.indexOf('            function enhanceResolveFormInDocument(');
  const end = source.indexOf('            // Helper: 在 iframe', start);
  const ownerStart = source.indexOf('      function getOwner(');
  const ownerEnd = source.indexOf('      // 设置Cookie', ownerStart);
  const context = vm.createContext({
    doc, console,
    MutationObserver: class {
      constructor(callback) { observers.push(callback); }
      observe() {}
    },
  });
  vm.runInContext(source.slice(ownerStart, ownerEnd) + source.slice(start, end) +
    '\nenhanceResolveFormInDocument(doc);', context);
  assert.match(text, /填写人/);
  const before = textWrites;
  for (const callback of observers) callback();
  assert.equal(textWrites, before);
});
