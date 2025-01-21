// ==UserScript==
// @name        OS-EASY 专属禅道标记助手
// @namespace   Violentmonkey Scripts
// @match       http*://172.16.203.14/*
// @require     https://unpkg.com/jquery@3.3.1/dist/jquery.min.js
// @require     https://unpkg.com/workday-cn/lib/workday-cn.umd.js
// @grant       GM_addStyle
// @grant       GM_setClipboard
// @version     1.4.2
// @author      LHQ & CHH & ZCX
// @license     GPLv3
// @description 禅道助手: 工时统计(工时提醒/每日工时计算)、Bug管理(留存时间标记/一键复制/新标签页打开)、工作流优化(强制工时填写/解决方案提示)、悬浮球快捷工具
// @downloadURL https://update.greasyfork.org/scripts/502308/OS-EASY%20%E4%B8%93%E5%B1%9E%E7%A6%85%E9%81%93%E6%A0%87%E8%AE%B0%E5%8A%A9%E6%89%8B.user.js
// @updateURL https://update.greasyfork.org/scripts/502308/OS-EASY%20%E4%B8%93%E5%B1%9E%E7%A6%85%E9%81%93%E6%A0%87%E8%AE%B0%E5%8A%A9%E6%89%8B.meta.js
// ==/UserScript==

(() => {
  $.noConflict(true)(document).ready(async ($) => {
      // 面板策略管理
      const panelStrategies = {
        strategies: {},
        
        register(name, strategy) {
          if (!strategy.title || !strategy.render) {
            console.error('Strategy must have title and render function');
            return;
          }
          this.strategies[name] = strategy;
        },

        getAll() {
          return this.strategies;
        },

        get(name) {
          return this.strategies[name];
        }
      };

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
          
          // 添加悬浮球和面板样式
          GM_addStyle(`
              .zm-float-ball {
                  position: fixed;
                  left: 105px;
                  top: 4px;
                  width: 36px;
                  height: 36px;
                  background: #1890ff;
                  border-radius: 50%;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  cursor: pointer;
                  z-index: 9999;
                  transition: all 0.3s;
              }
              .zm-float-ball::after {
                  content: '';
                  position: absolute;
                  width: 100%;
                  height: 100%;
                  border-radius: 50%;
                  border: 2px solid #1890ff;
                  animation: ripple 1.5s ease-out infinite;
              }
              @keyframes ripple {
                  0% {
                      transform: scale(1);
                      opacity: 0.8;
                  }
                  100% {
                      transform: scale(1.5);
                      opacity: 0;
                  }
              }
              .zm-float-ball:hover {
                  transform: scale(1.1);
              }
              .zm-float-ball i {
                  color: white;
                  font-size: 24px;
              }
              .zm-panel {
                  position: fixed;
                  right: 80px;
                  top: 50%;
                  transform: translateY(-50%);
                  width: 300px;
                  background: white;
                  border-radius: 8px;
                  box-shadow: 0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08);
                  z-index: 9998;
                  display: none;
              }
              .zm-panel-header {
                  padding: 12px 16px;
                  border-bottom: 1px solid #f0f0f0;
                  font-weight: bold;
              }
              .zm-panel-content {
                  max-height: 400px;
                  overflow-y: auto;
                  scrollbar-width: thin;
                  scrollbar-color: rgba(0,0,0,.2) transparent;
              }
              .zm-panel-content::-webkit-scrollbar {
                  width: 6px;
              }
              .zm-panel-content::-webkit-scrollbar-track {
                  background: transparent;
              }
              .zm-panel-content::-webkit-scrollbar-thumb {
                  background-color: rgba(0,0,0,.2);
                  border-radius: 3px;
                  border: none;
              }
              .zm-panel-content::-webkit-scrollbar-thumb:hover {
                  background-color: rgba(0,0,0,.3);
              }
              .zm-panel-item {
                  padding: 12px 16px;
                  border-bottom: 1px solid #f0f0f0;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
              }
              .zm-panel-item:hover {
                  background: #f5f5f5;
              }
              .zm-hours {
                  color: #ff4d4f;
                  font-weight: bold;
              }
          `);

          // 创建悬浮球和面板
          createFloatBall();
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
          $(dayElement).find('.copy-time').remove();
          if (total != 0) {
              const colorClass = total > 10 || total < 8 ? 'warn' : 'fine';
              $(dayElement).find('.heading').prepend(`<span class="zm-day ${colorClass}">【${total.toFixed(1)}小时】</span>`);
              $(dayElement).find('.heading').prepend(`<div class="copy-time btn-toolbar pull-left" style="margin-left:25px;display:flex;align-items:center;">复制</div>`);
              $(dayElement).find('.heading').find('.copy-time').on('click', async function (e) { copyTaskTime(e) })
          }
      }

      
      // 复制任务时间
      async function copyTaskTime(e) {
        e.stopPropagation()
        const targetEle = e.target
        const content = $(targetEle).parent('.heading').next('.content')
        function calculateTaskTimes(startTime, tasks) {
          let currentHour = parseInt(startTime.split(':')[0])
          let currentMinute = parseInt(startTime.split(':')[1])
          const results = []
          let startDate = new Date()
          startDate.setHours(currentHour)
          startDate.setMinutes(currentMinute)

          const middleStartDate = new Date()
          middleStartDate.setHours(12)
          middleStartDate.setMinutes(0)
          const middleEndDate = new Date()
          middleEndDate.setHours(14)
          middleEndDate.setMinutes(0)

          let endDate = null

          tasks.forEach((task) => {
            const hourStamp = 60 * 60 * 1000
            const timeParts = task.time.split('h')
            let hours = timeParts[0] * 1
            let startStamp = startDate.getTime()
            const middleStamp = middleStartDate.getTime()
            const middleEndStamp = middleEndDate.getTime()
            let endStamp = startStamp + hours * hourStamp

            if (startStamp <= middleStamp && endStamp > middleStamp) {
              endStamp = endStamp + 2 * hourStamp
            }
            const start = new Date(startStamp)
            const end = new Date(endStamp)
            const startTimeStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
            const endTimeStr = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
            startDate = new Date(endStamp)
            results.push({
              ...task,
              start: startTimeStr,
              end: endTimeStr
            })
          })

          return results
        }

        // 示例用法
        const start = '08:30'
        let tempTasks = Array.from(
          content
            .find('.events')
            .find('.event')
            .map(function () {
              const title = $(this).find('.title').text().trim()
              const time = $(this).find('.time').text().trim()
              const id = $(this).data('id')
              return {
                id,
                time,
                title
              }
            })
        )
        tempTasks = calculateTaskTimes(start, tempTasks)
        const parseTaskDoc = function (doc) {
          const objReg = new RegExp(`对象\n`)
          const id = $(doc).find('.main-header span.label').text()
          let item = {}
          $(doc)
            .find('table tbody tr')
            .each(function () {
              // console.log($(this).text())
              const text = $(this).text()
              if (objReg.test(text)) {
                item.obj = text.replace(objReg, '').replace('\n', '').trim()
                item.href = $(this).find('a').attr('href')
              }
            })
          return { ...item, id }
        }
        const fetchTaskData = async function () {
          const docs = await Promise.all(
            tempTasks.map(async function (t) {
              return fetchDocument(
                `/effort-view-${t.id}.html?onlybody=yes&tid=i2sh4q46`
              )
            })
          )
          return docs.map((d) => parseTaskDoc(d))
        }
        const taskObjData = await fetchTaskData()
        let tasks = tempTasks.map((t) => {
          const findOne = taskObjData.find(
            (task) => task.id * 1 === t.id * 1
          )
          return { ...t, ...findOne }
        })
        tasks = tasks
          .map((t) => {
            return `- [ ] ${t.start} - ${t.end} #工时 ${t.time}\t${t.title}\t ${t.obj && t.href ? `[${t.obj}](${location.origin + t.href})\t` : ''}\n`
          })
          .join('')
        GM_setClipboard(tasks)
      }

      // 设置 执行-版本-6.0.5-future-我解决的bug 页面功能
      function setupResolvedByMeBuildPage() {
        $(
          '<div class="btn btn-success" style="margin-right:10px;">复制勾选</div>'
        )
          .on('click', function () {
            const bugs = $('tr.checked')
              .map(function () {
                const tds = $(this).find('td')
                const id = $(tds[0]).text().trim()
                const raw = $(tds[1]).text().trim()
                let range = raw.match(/【([^【】]+?\/.+?)】/)
                range = !range ? '' : range[1].replace(/(\d\.?|-){3}/, '') // 移除版本号
                const title = raw.slice(raw.lastIndexOf('】') + 1)
                return `${localStorage.getItem('zm-username')}\t\t${id} ${title}\t${range}\n`
              })
              .get()
              .join('')
            GM_setClipboard(bugs)
          })
          .insertBefore('#bugs .actions a')
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
          } else if (/build-view-\d+.*\.html/.test(path)) {
              setupVersionBugPage()
              setupResolvedByMeBuildPage()
          } else if (/effort-createForObject-bug-\d+.html/.test(path)) {
            setupBugEffortPage()
          }
          setupLeftMenu()
          analyzeWorkHours().then(res => {
            console.log(res)
          })
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
        }).insertBefore('.table-statistic')
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

      // 设置Cookie 某些页面需要修改Cookie中的分页和页数才能查询生效
      function setCookie(name, value, options = { path: '/' }) {
        let cookie = `${name}=${encodeURIComponent(value)}`
        
        if (options.path) cookie += `; path=${options.path}`
        if (options.domain) cookie += `; domain=${options.domain}`
        if (options.expires) cookie += `; expires=${options.expires.toUTCString()}`
        if (options.maxAge) cookie += `; max-age=${options.maxAge}`
        if (options.secure) cookie += `; secure`
        if (options.sameSite) cookie += `; samesite=${options.sameSite}`
        
        document.cookie = cookie
      }
      
      // 获取工作日工时是否不足
      async function analyzeWorkHours() {
        // 设置分页
        setCookie('pagerMyEffort', 500);
        
        // 获取数据
        const response = await fetch('http://172.16.203.14:2980/my-effort-all-date_desc-1000000-500-1.json');
        const rawData = await response.json();
        const data = JSON.parse(rawData.data);
        const efforts = data.efforts;
        
        // 获取日期范围
        const startDate = new Date(efforts[efforts.length - 1].date);
        const endDate = new Date(efforts[0].date);
        
        // 获取周期内的工作日
        const workdays = workdayCn.getWorkdaysBetween(startDate, endDate);
        
        // 计算每天的工时
        const dailyHours = new Map();
        efforts.forEach(effort => {
            const date = effort.date;
            const hours = parseFloat(effort.consumed);
            dailyHours.set(date, (dailyHours.get(date) || 0) + hours);
        });
        
        // 找出工时不足的日期并按时间逆序排序
        const insufficientDays = workdays
            .map(date => date.toISOString().split('T')[0])
            .filter(date => {
                const hours = dailyHours.get(date) || 0;
                return hours < 8;
            })
            .map(date => ({
                date,
                hours: dailyHours.get(date) || 0
            }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        return insufficientDays;
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

      // 修改面板创建代码
      function createFloatBall() {
          // 检查是否在登录页面
          if (window.location.pathname === '/user-login.html') {
              return;
          }

          // 检查是否在iframe中
          if (window.self !== window.top) {
              return;
          }

          // 检查是否已存在悬浮球
          if ($('.zm-float-ball').length > 0) {
              return;
          }

          // 添加拖动相关样式
          GM_addStyle(`
              .zm-float-ball {
                  user-select: none;
                  touch-action: none;
                  transition: all 0.3s;
                  z-index: 9999;
              }
              .zm-float-ball.dragging {
                  transition: none;
                  opacity: 0.8;
              }
              .zm-panel {
                  z-index: 9998;
              }
          `);

          const floatBall = $(`
              <div class="zm-float-ball">
                  <i class="icon icon-zentao"></i>
              </div>
          `).appendTo('body');

          // 创建带标签页的面板
          const panel = $(`
            <div class="zm-panel">
              <div class="zm-panel-header">
                <div class="zm-panel-tabs">
                  <span class="zm-panel-tab active" data-strategy="workHours">
                    <i class="icon icon-time"></i>工时提醒
                  </span>
                  <span class="zm-panel-tab" data-strategy="myBugs">
                    <i class="icon icon-bug"></i>Bug统计
                  </span>
                </div>
                <i class="icon icon-refresh" style="float: right; cursor: pointer; font-size: 14px;"></i>
              </div>
              <div class="zm-panel-content"></div>
            </div>
          `).appendTo('body');

          // 从 localStorage 获取上次选中的面板
          let currentStrategy = localStorage.getItem('zm-panel-active') || 'workHours';
          
          // 初始化激活状态
          panel.find('.zm-panel-tab').removeClass('active');
          panel.find(`[data-strategy="${currentStrategy}"]`).addClass('active');

          // 标签切换逻辑
          panel.find('.zm-panel-tab').click(async function() {
            const strategyName = $(this).data('strategy');
            if (strategyName === currentStrategy) return;

            panel.find('.zm-panel-tab').removeClass('active');
            $(this).addClass('active');
            currentStrategy = strategyName;
            
            // 保存当前选中的面板到 localStorage
            localStorage.setItem('zm-panel-active', currentStrategy);

            const strategy = panelStrategies.get(strategyName);
            await strategy.render(panel.find('.zm-panel-content'));
          });

          // 修改刷新按钮事件
          panel.find('.icon-refresh').click(async function(e) {
            e.stopPropagation();
            
            const refreshIcon = $(this);
            // 添加旋转动画
            refreshIcon.css({
              'transform': 'rotate(360deg)',
              'transition': 'transform 0.5s'
            });
            
            // 获取当前激活的策略并刷新
            const strategy = panelStrategies.get(currentStrategy);
            await strategy.render(panel.find('.zm-panel-content'));
            
            // 重置旋转动画
            setTimeout(() => {
              refreshIcon.css({
                'transform': 'rotate(0deg)',
                'transition': 'none'
              });
            }, 500);
          });

          // 修改拖动相关变量
          let isDragging = false;
          let startX, startY;
          let initialLeft, initialTop;
          const margin = 20;
          let hasDragged = false;

          // 更新位置的动画函数
          function updatePosition(mouseX, mouseY) {
              if (!isDragging) return;

              // 计算位移
              const deltaX = mouseX - startX;
              const deltaY = mouseY - startY;
              
              // 计算新位置
              let left = initialLeft + deltaX;
              let top = initialTop + deltaY;
              
              // 边界限制
              const maxX = window.innerWidth - floatBall.outerWidth();
              const maxY = window.innerHeight - floatBall.outerHeight();
              
              left = Math.max(0, Math.min(left, maxX));
              top = Math.max(0, Math.min(top, maxY));
              
              floatBall.css({
                  left: left + 'px',
                  top: top + 'px',
                  right: 'auto'
              });

              // 实时更新面板位置
              if (panel.is(':visible')) {
                  updatePanelPosition();
              }
          }

          // 修改 pointer events 处理
          floatBall[0].addEventListener('pointerdown', function(e) {
              isDragging = true;
              hasDragged = false;
              floatBall.addClass('dragging');
              
              // 立即隐藏面板，不使用动画
              if (panel.is(':visible')) {
                  panel.hide();
                  $('.zm-panel-content').empty();
              }
              
              this.setPointerCapture(e.pointerId);
              
              // 记录初始位置
              startX = e.clientX;
              startY = e.clientY;
              const rect = floatBall[0].getBoundingClientRect();
              initialLeft = rect.left;
              initialTop = rect.top;
              
              e.preventDefault();
          });

          floatBall[0].addEventListener('pointermove', function(e) {
              if (isDragging) {
                  hasDragged = true;
                  updatePosition(e.clientX, e.clientY);
                  e.preventDefault();
              }
          });

          floatBall[0].addEventListener('pointerup', function(e) {
              if (isDragging) {
                  isDragging = false;
                  floatBall.removeClass('dragging');
                  this.releasePointerCapture(e.pointerId);
              }
          });

          // 防止文本选择和其他默认行为
          $(document).on('selectstart dragstart', function(e) {
              if (isDragging) {
                  e.preventDefault();
                  return false;
              }
          });

          // 添加一个变量来追踪面板状态
          let isPanelVisible = false;

          // 修改点击悬浮球显示面板的代码
          floatBall.click(async function(e) {
              if (hasDragged) return;
              
              e.stopPropagation();
              
              if (!isPanelVisible) {
                  panel.css('opacity', 0).show();
                  updatePanelPosition();
                  panel.animate({ opacity: 1 }, 200);
                  isPanelVisible = true;
                  
                  // 使用当前激活的策略渲染内容
                  const strategy = panelStrategies.get(currentStrategy);
                  await strategy.render(panel.find('.zm-panel-content'));
              } else {
                  panel.fadeOut(200, function() {
                      $('.zm-panel-content').empty();
                      isPanelVisible = false;
                  });
              }
          });

          // 更新面板位置函数优化
          function updatePanelPosition() {
              const ballRect = floatBall[0].getBoundingClientRect();
              const panelWidth = panel.outerWidth();
              const panelHeight = panel.outerHeight();
              const windowWidth = window.innerWidth;
              const windowHeight = window.innerHeight;
              
              // 计算各个方向的可用空间
              const leftSpace = ballRect.left;
              const rightSpace = windowWidth - ballRect.right;
              const topSpace = ballRect.top;
              const bottomSpace = windowHeight - ballRect.bottom;
              
              // 水平位置计算
              let left;
              // 优先选择空间较大的左右侧
              if (leftSpace >= rightSpace && leftSpace >= panelWidth + 10) {
                  // 左侧空间足够
                  left = ballRect.left - panelWidth - 10;
              } else if (rightSpace >= panelWidth + 10) {
                  // 右侧空间足够
                  left = ballRect.right + 10;
              } else {
                  // 两侧空间都不够，强制靠左或靠右
                  left = leftSpace > rightSpace ? 10 : windowWidth - panelWidth - 10;
              }
              
              // 垂直位置计算
              let top;
              // 优先考虑上下空间是否足够显示完整面板
              if (bottomSpace >= panelHeight + 10) {
                  // 底部空间足够
                  top = Math.min(ballRect.top, windowHeight - panelHeight - 10);
              } else if (topSpace >= panelHeight + 10) {
                  // 顶部空间足够
                  top = Math.max(10, ballRect.bottom - panelHeight);
              } else {
                  // 上下空间都不够，强制靠上或靠下
                  top = topSpace > bottomSpace ? 10 : windowHeight - panelHeight - 10;
              }
              
              panel.css({
                  left: left + 'px',
                  top: top + 'px',
                  transform: 'none'
              });
          }

          // 监听悬浮球位置变化
          const observer = new MutationObserver(() => {
              if (panel.is(':visible')) {
                  updatePanelPosition();
              }
          });
          
          observer.observe(floatBall[0], {
              attributes: true,
              attributeFilter: ['style']
          });

          // 点击其他区域隐藏面板时也需要更新状态
          $(document).click(function(e) {
              if (!$(e.target).closest('.zm-panel').length) {
                  panel.fadeOut(200, function() {
                      $('.zm-panel-content').empty();
                      isPanelVisible = false;
                  });
              }
          });
      }

      // 更新面板内容
      function updatePanel(insufficientDays) {
          const content = $('.zm-panel-content');
          content.empty();
          
          if (insufficientDays.length === 0) {
              content.append('<div class="zm-panel-item">所有工作日工时已填写完整 👍</div>');
              return;
          }

          insufficientDays.forEach(day => {
              content.append(`
                  <div class="zm-panel-item">
                      <span>${day.date}</span>
                      <span class="zm-hours">${day.hours}h / 8h</span>
                  </div>
              `);
          });
      }

      // 数据获取策略
      const dataStrategies = {
        strategies: {},
        
        register(name, strategy) {
          if (!strategy.fetch) {
            console.error('Data strategy must have fetch function');
            return;
          }
          this.strategies[name] = strategy;
        },

        async fetch(name, ...args) {
          const strategy = this.strategies[name];
          if (!strategy) {
            console.error(`Data strategy ${name} not found`);
            return null;
          }
          return await strategy.fetch(...args);
        }
      };

      // 注册工时数据获取策略
      dataStrategies.register('workHours', {
        async fetch() {
          // 设置分页
          setCookie('pagerMyEffort', 500);
          
          // 获取数据
          const response = await fetch('http://172.16.203.14:2980/my-effort-all-date_desc-1000000-500-1.json');
          const rawData = await response.json();
          const data = JSON.parse(rawData.data);
          const efforts = data.efforts;
          
          // 获取日期范围
          const startDate = new Date(efforts[efforts.length - 1].date);
          const endDate = new Date(efforts[0].date);
          
          // 获取周期内的工作日
          const workdays = workdayCn.getWorkdaysBetween(startDate, endDate);
          
          // 计算每天的工时
          const dailyHours = new Map();
          efforts.forEach(effort => {
              const date = effort.date;
              const hours = parseFloat(effort.consumed);
              dailyHours.set(date, (dailyHours.get(date) || 0) + hours);
          });
          
          // 找出工时不足的日期并按时间逆序排序
          return workdays
            .map(date => date.toISOString().split('T')[0])
            .filter(date => {
                const hours = dailyHours.get(date) || 0;
                return hours < 8;
            })
            .map(date => ({
                date,
                hours: dailyHours.get(date) || 0
            }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        }
      });

      // 注册Bug数据获取策略
      dataStrategies.register('bugs', {
        async fetch() {
          const response = await fetch('/my-work-bug.html');
          const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
          return Array.from(doc.querySelectorAll('tr')).slice(1).map(tr => ({
            id: tr.cells[0].textContent.trim(),
            title: tr.cells[4].textContent.trim(),
            status: tr.cells[6].textContent.trim()
          }));
        }
      });

      // 修改面板策略的注册,使用数据策略
      panelStrategies.register('workHours', {
        title: '工时提醒',
        icon: 'icon-time',
        async render(content) {
          try {
            content.html('<div class="zm-panel-item" style="text-align: center;">加载中...</div>');
            
            const insufficientDays = await dataStrategies.fetch('workHours');
            
            content.empty();
            if (insufficientDays.length === 0) {
              content.append('<div class="zm-panel-item">所有工作日工时已填写完整 👍</div>');
              return;
            }

            insufficientDays.forEach(day => {
              content.append(`
                <div class="zm-panel-item">
                  <span>${day.date}</span>
                  <span class="zm-hours">${day.hours}h / 8h</span>
                </div>
              `);
            });
          } catch (err) {
            content.html(`<div class="zm-panel-item error">加载失败: ${err.message}</div>`);
          }
        }
      });

      // Bug统计功能
      panelStrategies.register('myBugs', {
        title: 'Bug统计',
        icon: 'icon-bug',
        async render(content) {
          try {
            content.html('<div class="zm-panel-item" style="text-align: center;">加载中...</div>');
            
            const bugs = await dataStrategies.fetch('bugs');
            
            content.empty();
            if (bugs.length === 0) {
              content.append('<div class="zm-panel-item">暂无Bug</div>');
              return;
            }

            // 按状态分组
            const bugsByStatus = bugs.reduce((acc, bug) => {
              if (!acc[bug.status]) {
                acc[bug.status] = [];
              }
              acc[bug.status].push(bug);
              return acc;
            }, {});

            // 渲染每个状态组
            Object.entries(bugsByStatus).forEach(([status, statusBugs]) => {
              content.append(`
                <div class="zm-panel-group">
                  <div class="zm-panel-group-header">
                    <span>${status}</span>
                    <span class="zm-count">${statusBugs.length}</span>
                  </div>
                  ${statusBugs.map(bug => `
                    <div class="zm-panel-item zm-bug-item" title="${bug.title}" data-bug-id="${bug.id}">
                      <span class="zm-bug-id">#${bug.id}</span>
                      <span class="zm-bug-title">${bug.title}</span>
                    </div>
                  `).join('')}
                </div>
              `);
            });

            // 添加点击事件
            content.find('.zm-bug-item').click(function() {
              const bugId = $(this).data('bug-id');
              window.open(`/bug-view-${bugId}.html`, '_blank');
            });
            
          } catch (err) {
            content.html(`<div class="zm-panel-item error">加载失败: ${err.message}</div>`);
          }
        }
      });

      // 添加错误样式
      GM_addStyle(`
        .zm-panel-item.error {
          color: #ff4d4f;
        }
        
        .zm-count {
          font-weight: bold;
          color: #1890ff;
        }
      `);

      // 更新面板样式
      GM_addStyle(`
        .zm-panel-group {
          margin-bottom: 12px;
        }

        .zm-panel-group:last-child {
          margin-bottom: 0;
        }

        .zm-panel-group-header {
          padding: 8px;
          background: #f5f5f5;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: bold;
        }

        .zm-bug-item {
          padding: 6px 8px;
          cursor: pointer;
        }

        .zm-bug-item:hover {
          background: #f5f5f5;
        }

        .zm-bug-id {
          color: #1890ff;
          margin-right: 8px;
          flex-shrink: 0;
        }

        .zm-bug-title {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }
      `);
  });
})();

// 添加面板样式
GM_addStyle(`
  .zm-panel {
    position: fixed;
    width: 300px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    display: none;
    z-index: 9999;
  }

  .zm-panel-header {
    padding: 12px;
    border-bottom: 1px solid #f0f0f0;
  }

  .zm-panel-tabs {
    display: flex;
    gap: 12px;
  }

  .zm-panel-tab {
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.3s;
    user-select: none;
  }

  .zm-panel-tab:hover {
    background: rgba(0,0,0,0.05);
  }

  .zm-panel-tab.active {
    background: #1890ff;
    color: white;
  }

  .zm-panel-tab i {
    margin-right: 4px;
  }

  .zm-panel-content {
    padding: 12px;
    max-height: 400px;
    overflow-y: auto;
  }

  .zm-panel-item {
    padding: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #f0f0f0;
  }

  .zm-panel-item:last-child {
    border-bottom: none;
  }
`);


