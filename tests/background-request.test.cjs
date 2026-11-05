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

test('工时后台读取保留标签会话、标记 AJAX、禁止缓存，并透传响应和取消信号', async () => {
  const { context, calls, response } = setup('http://zentao.test/task-view-83441.html?tid=tab123');
  const controller = new AbortController();
  const result = await context.fetchZenTao('/my-effort-all-date_desc-1000000-1000-1.json', {
    signal: controller.signal, headers: { Accept: 'application/json' }
  });
  const call = calls[0];
  assert.equal(new URL(call.url).searchParams.get('tid'), 'tab123');
  assert.equal(call.options.headers.get('X-Requested-With'), 'XMLHttpRequest');
  assert.equal(call.options.headers.get('Accept'), 'application/json');
  assert.equal(call.options.cache, 'no-store');
  assert.equal(call.options.signal, controller.signal);
  controller.abort();
  assert.equal(call.options.signal.aborted, true);
  assert.equal(result, response);
});

test('保留已有 tid、onlybody 和其他查询参数', () => {
  const { context, calls } = setup('http://zentao.test/my/?tid=current');
  context.fetchZenTao('/effort-view-1.html?onlybody=yes&tid=explicit');
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('tid'), 'explicit');
  assert.equal(url.searchParams.get('onlybody'), 'yes');
});

test('没有标签 ID 时不虚构 tid', () => {
  const { context, calls } = setup('http://zentao.test/my/');
  context.fetchZenTao('/my-work-bug.html');
  assert.equal(new URL(calls[0].url).searchParams.has('tid'), false);
});
