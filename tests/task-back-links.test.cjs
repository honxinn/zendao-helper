const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../zendao.js'), 'utf8');
const helper = source.slice(source.indexOf('      function repairTaskBackLinks('), source.indexOf('      // my-effort 的 JSON'));
const context = vm.createContext({ URL });
vm.runInContext(helper, context);
function link(textContent, href) {
  return { textContent, getAttribute: () => href, setAttribute: (_, value) => { href = value; } };
}
function repair(referrer, backHref) {
  const links = [link('返回', backHref), link('返回', backHref), link('任务', '/execution-task-1542.html?tid=newtab')];
  context.repairTaskBackLinks({ referrer, querySelectorAll: () => links }, 'http://zentao.test/task-view-83441.html?tid=newtab');
  return links.slice(0, 2).map(a => a.getAttribute('href'));
}
test('新标签继承旧 JSON 返回地址时，两个返回按钮恢复为页面任务列表', () => {
  assert.deepEqual(repair('', '/my-effort-all-date_desc-1000000-1000-1.json'),
    ['/execution-task-1542.html?tid=newtab', '/execution-task-1542.html?tid=newtab']);
});
test('来源列表保留筛选参数，但使用新标签 tid', () => {
  assert.deepEqual(repair('http://zentao.test/execution-task-1542-byModule-2046.html?tid=old', '/my-effort-all.json'),
    ['/execution-task-1542-byModule-2046.html?tid=newtab', '/execution-task-1542-byModule-2046.html?tid=newtab']);
});
test('正常返回链接不受影响', () => {
  assert.deepEqual(repair('', '/my-work-task.html?tid=newtab'),
    ['/my-work-task.html?tid=newtab', '/my-work-task.html?tid=newtab']);
});
test('外部来源不能成为返回目标', () => {
  assert.equal(repair('https://external.test/execution-task-1542.html', '/my-effort-all.json')[0], '/execution-task-1542.html?tid=newtab');
});
