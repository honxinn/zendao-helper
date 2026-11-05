const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '../zendao.js'), 'utf8');
const helper = source.slice(source.indexOf('      function fetchZenTao('), source.indexOf('      // 获取网页文档'));
function setup(href) {
  const calls = [];
  const response = { text: async () => '{"status":"success"}' };
  const context = vm.createContext({ URL, Headers, window: { location: { href } },
    fetch: (url, options) => { calls.push({ url, options }); return Promise.resolve(response); } });
  vm.runInContext(helper, context);
  return { context, calls, response };
}

test('工时后台读取隔离标签会话、标记 AJAX，并透传响应和取消信号', async () => {
  const { context, calls, response } = setup('http://zentao.test/task-view-83441.html?tid=tab123');
  const controller = new AbortController();
  const result = await context.fetchZenTao('/my-effort-all-date_desc-1000000-1000-1.json', {
    signal: controller.signal, headers: { Accept: 'application/json' }
  });
  const call = calls[0];
  assert.notEqual(new URL(call.url).searchParams.get('tid'), 'tab123');
  assert.match(new URL(call.url).searchParams.get('tid'), /^zm[a-z0-9]+$/);
  assert.equal(call.options.headers.get('X-Requested-With'), 'XMLHttpRequest');
  assert.equal(call.options.headers.get('Accept'), 'application/json');
  assert.equal(call.options.cache, 'no-store');
  assert.equal(call.options.signal, controller.signal);
  controller.abort();
  assert.equal(call.options.signal.aborted, true);
  assert.equal(result, response);
});

test('替换显式 tid，保留 onlybody，并复用后台会话', () => {
  const { context, calls } = setup('http://zentao.test/my/?tid=current');
  context.fetchZenTao('/effort-view-1.html?onlybody=yes&tid=explicit');
  const url = new URL(calls[0].url);
  assert.notEqual(url.searchParams.get('tid'), 'explicit');
  assert.equal(url.searchParams.get('onlybody'), 'yes');
  context.fetchZenTao('/my-work-bug.html');
  assert.equal(new URL(calls[1].url).searchParams.get('tid'), url.searchParams.get('tid'));
});

test('没有页面 tid 时也创建独立后台会话', () => {
  const { context, calls } = setup('http://zentao.test/my/');
  context.fetchZenTao('/my-work-bug.html');
  assert.match(new URL(calls[0].url).searchParams.get('tid'), /^zm[a-z0-9]+$/);
});

test('工时 JSON 路由改写 taskList 时，当前页面的返回目标不受影响', async () => {
  const { context } = setup('http://zentao.test/task-view-83441.html?tid=tab123');
  const sessions = new Map([['tab123', '/execution-task-1542.html?tid=tab123']]);
  context.fetch = async url => {
    const request = new URL(url);
    // 真实服务器对照实验已确认：该 JSON 路由也会写入所在 tid 的列表导航状态。
    sessions.set(request.searchParams.get('tid'), request.pathname + request.search);
    return { status: 'success', data: { efforts: [] } };
  };
  const result = await context.fetchZenTao('/my-effort-all-date_desc-1000000-1000-1.json');
  assert.equal(result.status, 'success');
  assert.equal(sessions.get('tab123'), '/execution-task-1542.html?tid=tab123');
  assert.equal(sessions.size, 2);
});
