// ==UserScript==
// @name        OS-EASY 专属禅道标记助手
// @namespace   Violentmonkey Scripts
// @match       http*://172.16.203.14/*
// @require     https://unpkg.com/jquery@3.3.1/dist/jquery.min.js
// @require     https://unpkg.com/workday-cn/lib/workday-cn.umd.js
// @grant       GM_addStyle
// @grant       GM_setClipboard
// @version     1.4.0
// @author      LHQ & CHH & ZCX
// @license     GPLv3
// @description 仅针对 OS-EASY 适配，标记 bug 留存时间、解决方案填写人提示、计算每日工时、一键复制解决的 bug、解决指派 bug 强制填写工时、Bug 点击在新标签页打开
// @downloadURL https://update.greasyfork.org/scripts/502308/OS-EASY%20%E4%B8%93%E5%B1%9E%E7%A6%85%E9%81%93%E6%A0%87%E8%AE%B0%E5%8A%A9%E6%89%8B.user.js
// @updateURL https://update.greasyfork.org/scripts/502308/OS-EASY%20%E4%B8%93%E5%B1%9E%E7%A6%85%E9%81%93%E6%A0%87%E8%AE%B0%E5%8A%A9%E6%89%8B.meta.js
// ==/UserScript==

(() => {
  $.noConflict(true)(document).ready(async ($) => {
      // 初始化
      await initialize();

      // 定义颜色常量
      const colors = {
          green: '#82E0AA',
          yellow: '#F7DC6F',
          brown: '#FE9900',
          red: '#E74C3C'
      };

      // 设置通用的点击事件监听器
      setBodyClickListener();
      // 根据当前路径进行不同的处理
      const path = document.location.pathname;
      switch (path) {
          case '/effort-calendar.html':
              handleEffortCalendar(colors);
              break;
          case '/my-work-bug.html':
              handleMyWorkBug(colors);
              break;
          default:
              handleDefaultPath(path);
              break;
      }

      // 初始化函数
      async function initialize() {
          const userName = localStorage.getItem('zm-username');
          if (!userName) {
              const name = prompt("看上去你是第一次使用，请输入禅道中的姓名：");
              if (name) localStorage.setItem('zm-username', name);
              else return;
          }
          $("td.text-left a").attr('target', '_blank');
      }

      // 设置通用的点击事件监听器
      function setBodyClickListener() {
          document.body.onclick = async function (e) {
              if (e instanceof PointerEvent) {
                  const aTag = getATag(e.target);
                  if (!aTag) return;
                  const aHref = $(aTag).attr('href');
                  if (aHref?.includes('bug-resolve')) {
                      await generatorResolveType();
                  }
              }
          };
      }

      // 获取点击的A标签
      function getATag(target) {
          if (target.tagName === 'A') return target;
          if (target.parentElement.tagName === 'A') return target.parentElement;
          return null;
      }

      // 处理 effort-calendar 页面
      function handleEffortCalendar(colors) {
          GM_addStyle(`
              span.zm-day { font-weight: bold; margin: 0 8px; }
              .warn { color: ${colors.brown}; }
              .fine { color: ${colors.green}; }
          `);
          waitForContentInContainer('#main', 'table').then(element => {
              const observer = new MutationObserver(() => markEffortCalendar(element, observer));
              observer.observe(element, { subtree: true, childList: true });
              markEffortCalendar(element, observer);
          });
      }

      // 标记 effort-calendar 页面的数据
      function markEffortCalendar(element, observer) {
          observer.disconnect();
          const days = element.querySelectorAll(".cell-day");
          days.forEach(dayElement => {
              const total = calculateTotalTime(dayElement);
              updateDayElement(dayElement, total);
          });
          observer.observe(element, { subtree: true, childList: true });
      }

      // 计算时间总和
      function calculateTotalTime(dayElement) {
          const timeEles = dayElement.querySelectorAll('.has-time .time');
          return Array.from(timeEles).reduce((total, time) => total + parseFloat(time.textContent), 0);
      }

      // 更新天数元素的显示
      function updateDayElement(dayElement, total) {
          $(dayElement).find('.zm-day').remove();
          if (total != 0) {
              const colorClass = total > 10 || total < 8 ? 'warn' : 'fine';
              $(dayElement).find('.heading').prepend(`<span class="zm-day ${colorClass}">【${total.toFixed(1)}小时】</span>`);
          }
      }

      // 处理 my-work-bug 页面
      function handleMyWorkBug(colors) {
          GM_addStyle(`
              td.text-left.nobr { white-space: normal; }
              span.zm-mark { padding: 2px; border-radius: 4px; border: 1px solid; font-size: .9em; }
          `);
          addBugFetchButton(colors);
      }

      // 添加获取bug时间按钮
      function addBugFetchButton(colors) {
          const btn = $(`<div class="btn-toolbar pull-right" style="display:flex;align-items:center;"><div class="btn btn-warning">获取bug时间</div><span style="color:${colors.red};">一页超过8个Bug时需要手动获取</span></div>`)
          .on('click', async function () {
              let bugData = await fetchBugData();
              bugData = bugData.map(({ start, hasReactive }) => ({ ...timeRangeStr(start), processed: hasReactive }))
              updateBugTimeCells(bugData, colors);
          }).appendTo('#mainMenu');

          // 自动点击按钮以加载数据
          if ($('tr').length < 9) btn.click();
      }

      // 获取Bug数据
      async function fetchBugData() {
          const bugUrls = $("tr td:nth-child(5) a").map((_, ele) => ele.href).get();
          const bugPages = await Promise.all(bugUrls.map(fetchDocument));
          return bugPages.map(parseBugPage);
      }

      // 更新Bug时间单元格
      function updateBugTimeCells(bugData, colors) {
          $("tr th:nth-child(9)").text('Bug 留存').removeClass('text-center');
          $("tr td:nth-child(9)").each((idx, ele) => {
              const cell = $(ele).empty().html(`<span class="zm-mark">${bugData[idx].str}</span>`);
              const { h, processed } = bugData[idx];
              updateCellColor(cell, h, processed, colors);
          });
      }

      // 更新单元格颜色
      function updateCellColor(cell, h, processed, colors) {
          if (h < 12) cell.css({ color: colors.green });
          else if (h < 24) cell.css({ color: !processed ? colors.yellow : colors.green });
          else if (h < 34) cell.css({ color: !processed ? colors.brown : colors.yellow });
          else if (h < 70) cell.css({ color: !processed ? colors.red : colors.brown });
          else cell.css({ color: colors.red });
      }

      // 处理默认路径
      function handleDefaultPath(path) {
          if (/bug-view-\d+\.html/.test(path)) {
              setupBugDetailPage();
          } else if (/resolvedbyme/.test(path)) {
              setupResolvedByMePage();
          } else if (/build-view-\d+.html/.test(path)) {
              setupVersionBugPage()
          } else if (/effort-createForObject-bug-\d+.html/.test(path)) {
            setupBugEffortPage()
          }
          setupLeftMenu()
      }

      async function setupLeftMenu() {
        const element = await waitForContentInContainer('body', '#menuMainNav')
        const myBug = $('<li><a href="/my-work-bug.html" class="show-in-app"><i class="icon icon-bug"></i><span class="text num">我的Bug</span></a></li>');
        const myTask = $('<li><a href="/my-work-task.html" class="show-in-app"><i class="icon icon-list-alt"></i><span class="text num">我的任务</span></a></li>');
        const zenGuard = $('<li><a class="show-in-app"><i class="icon icon-magic"></i><span class="text num">禅道卫士</span></a></li>');

        myBug.click(function () {
            window.location.href = '/my-work-bug.html';
        });
        myTask.click(function () {
            window.location.href = '/my-work-task.html';
        });
        zenGuard.click(function () {
            window.open('http://172.21.15.106:8090/')
        })

        $('#menuMainNav .divider').before(myBug, myTask, zenGuard);
    }

      // 设置Bug详情页功能
      function setupBugDetailPage() {
          $('.label.label-id').on('click', function () {
              GM_setClipboard(`🔨bug(${$(this).text().trim()}): ${$(this).next().text().trim().replace(/【.+】(【.+】)*(-)*/, '')}`);
          }).attr('title', '点击复制 Bug').css({ cursor: 'pointer' });
          enforceEffortLogging();
      }

      // 强制填写工时
      function enforceEffortLogging() {
          $('a').has('.icon-bug-resolve, .icon-bug-assignTo').each((_, e) => {
              e.addEventListener('click', async function (e) {
                  const targetEle = e.target;
                  const { needEffort } = parseBugPage();
                  if (needEffort) {
                      e.stopPropagation();
                      e.preventDefault();
                      $('a.effort').get(0).click();
                  }
              }, true);
          });
      }

      // 设置 "我解决的Bug" 页面功能
      function setupResolvedByMePage() {
          $('<div class="btn btn-success">复制勾选</div>').on('click', function () {
              const bugs = $('tr.checked').map(function () {
                  const tds = $(this).find("td");
                  const id = $(tds[0]).text().trim();
                  const raw = $(tds[4]).text().trim();
                  let range = raw.match(/【([^【】]+?\/.+?)】/);
                  range = !range ? '' : range[1].replace(/(\d\.?|-){3}/, ''); // 移除版本号
                  const title = raw.slice(raw.lastIndexOf('】') + 1);
                  return `${localStorage.getItem('zm-username')}\t\t${id} ${title}\t${range}\n`;
              }).get().join('');
              GM_setClipboard(bugs);
          }).insertBefore('.btn-group.dropdown');
      }

      // 迭代版本页面中，添加一键复制已勾选BUG的按钮
      function addCopyBtnOnVersionBugPage() {
        $('<div class="btn btn-success table-actions btn-toolbar">复制勾选</div>').on('click', function () {
                const bugs = $('tr.checked').map( function () {
                    const tds = $(this).find("td")
                    const id = $(tds[0]).text().trim()
                    const title = $(tds[1]).text().trim()
                    const resolver = $(tds[5]).text().trim()
                    return `${id} ${title}\t${resolver}\n`
            })
            GM_setClipboard(bugs.get().join(''))
        }).insertAfter('.table-actions.btn-toolbar')
      }

      /**
       * 配置迭代版本BUG页面
       * 1. 添加一键复制已勾选BUG的按钮
       */
      function setupVersionBugPage() {
        addCopyBtnOnVersionBugPage()
      }

      /**
       * Bug填写工时窗口默认填充1h处理BUG
       */
      function setupBugEffortPage() {
        // 自动填BUG工时、内容
        let bug_id=$("#mainContent > div > h2 > span.label.label-id")[0].innerHTML
        $(".form-control")[1].value = 1
        $(".form-control")[2].value = "处理BUG: " + bug_id
      }

      // 根据时间范围生成字符串
      function timeRangeStr(start, end = Date.now()) {
          start = new Date(start);
          end = new Date(end);
          const msPerDay = 3.6e6 * 24;
          let ms = 0;

          while (start.getTime() < end) {
              if (workdayCn.isWorkday(start)) {
                  ms += msPerDay;
              }
              start.setDate(start.getDate() + 1);
          }

          ms += end - start;
          ms = Math.max(ms, 0);

          const rawh = ms / 3.6e6;
          const h = Math.trunc(rawh);
          const m = Math.trunc((rawh - h) * 60);
          return { str: `${h} 小时 ${m} 分钟`, h, m };
      }

      // 解析Bug页面
      function parseBugPage(document = window.document) {
          const userName = localStorage.getItem('zm-username');
          const processedRe = new RegExp(`由.${userName}.(指派|解决|确认|添加)`);
          const effortRe = new RegExp(`由.${userName}.记录工时`);
          const assignRe = new RegExp(`由.${userName}.指派`);
          const assignedRe = new RegExp(`指派给.${userName}`);
          const dateRe = /(\d{4}-.+:\d{2})/;

          let start, hasReactive = false, needEffort = false;
          const assignmens = [], reactives = [];

          const current = $('#legendBasicInfo th:contains(当前指派) ~ td').text().trim();
          needEffort = current.includes(userName);

          $(document).find('#actionbox li').each(function () {
              const text = $(this).text().trim();
              if (processedRe.test(text)) {
                  hasReactive = true;
                  reactives.push({ time: new Date(text.match(dateRe)[1]), action: text });
              }
              if (effortRe.test(text)) {
                  needEffort = false;
              }
              if (/由.+创建/.test(text)) {
                  start = new Date(text.match(dateRe)[1]);
              }
              if (assignRe.test(text)) {
                  assignmens.push({ toMe: false, time: new Date(text.match(dateRe)[1]) });
              }
              if (assignedRe.test(text)) {
                  assignmens.push({ toMe: true, time: new Date(text.match(dateRe)[1]) });
                  if (assignmens.length && assignmens[0].toMe) {
                      start = assignmens[0].time;
                  }
                  needEffort = current.includes(userName);
              }
          });

          console.log('(zm)DEBUG: ', { start: new Date(start).toLocaleString(), reactives, assignmens, hasReactive, needEffort });
          return { start, reactives, assignmens, hasReactive, needEffort };
      }

      // 获取Owner信息
      function getOwner(type) {
          const data = {
              "已解决": "研发、产品经理",
              "设计如此": "产品经理",
              "设计缺陷": "项目经理",
              "不予解决": "产品经理",
              "外部原因": "研发",
              "提交错误": "研发",
              "重复Bug": "研发",
              "无法重现": "项目经理",
              "下个版本解决": "产品经理",
              "延期处理": "产品经理"
          };
          return data[type] ? `${type}<span style="color: #8e8e8e;">（填写人：${data[type]}）</span>` : type;
      }

      // 生成处理类型选择器
      async function generatorResolveType() {
          const element = await waitForContentInContainer('body', '.modal-trigger.modal-scroll-inside .modal-dialog');
          const oIframe = element.querySelector('iframe');
          oIframe.addEventListener('load', () => {
              const content = oIframe.contentDocument;
              const body = content.querySelector('.m-bug-resolve');
              const oResolveType = body.querySelector('.chosen-container');
              oResolveType.addEventListener('click', () => {
                  const lis = oResolveType.querySelectorAll('li');
                  lis.forEach(node => {
                      const text = getOwner(node.textContent.trim());
                      node.innerHTML = text;
                      node.title = text.replace(/<span style="color: .*;">|<\/span>/g, '');
                  });
              });
          });
      }

      // 等待容器内内容加载
      async function waitForContentInContainer(containerSelector, targetSelector, timeout = 10000) {
          return new Promise((resolve, reject) => {
              let timer;
              const container = document.querySelector(containerSelector);

              if (!container) {
                  return reject(new Error(`Container ${containerSelector} not found`));
              }

              function checkElement() {
                  const element = container.querySelector(targetSelector);
                  if (element) {
                      if (timer) clearTimeout(timer);
                      observer.disconnect();
                      resolve(element);
                  }
              }

              const observer = new MutationObserver(checkElement);
              observer.observe(container, { childList: true, subtree: true });

              const iframes = container.querySelectorAll('iframe');
              let iframeLoadPromises = Array.from(iframes).map(iframe => new Promise(resolve => {
                  iframe.addEventListener('load', resolve);
                  if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                      resolve();
                  }
              }));

              timer = setTimeout(() => {
                  observer.disconnect();
                  reject(new Error(`Timeout: Element ${targetSelector} not found within ${timeout}ms`));
              }, timeout);

              Promise.all(iframeLoadPromises).then(() => checkElement());
          });
      }

      // 获取网页文档
      async function fetchDocument(url) {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          const decoder = new TextDecoder(document.characterSet);
          return new DOMParser().parseFromString(decoder.decode(arrayBuffer), 'text/html');
      }
  });
})();
