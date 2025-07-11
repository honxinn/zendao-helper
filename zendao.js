// ==UserScript==
// @name        OS-EASY 专属禅道标记助手
// @namespace   Violentmonkey Scripts
// @match       http*://172.16.203.14/*
// @require     https://unpkg.com/jquery@3.3.1/dist/jquery.min.js
// @require     https://unpkg.com/workday-cn/lib/workday-cn.umd.js
// @grant       GM_addStyle
// @grant       GM_setClipboard
// @version     1.5.0
// @author      LHQ & CHH & ZCX && zagger
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
        currentStrategy: null,
        
        register(name, strategy) {
          if (!strategy.title || !strategy.render) {
            console.error('Strategy must have title and render function');
            return;
          }
          this.strategies[name] = strategy;
        },

        async switchStrategy(name, content) {
          // 取消之前策略的所有请求
          requestManager.clear();
          
          // 更新当前策略
          this.currentStrategy = name;
          
          // 清空内容并显示加载状态
          content.empty().html('<div class="zm-panel-item" style="text-align: center;">加载中...</div>');
          
          try {
            const strategy = this.strategies[name];
            const renderPromise = strategy.render(content);
            
            // 等待渲染完成
            await renderPromise;
            
            // 如果在渲染过程中切换了策略，则不显示结果
            if (this.currentStrategy !== name) {
              content.empty();
            }
          } catch (err) {
            if (err.name !== 'AbortError') {
              content.html(`<div class="zm-panel-item error">加载失败: ${err.message}</div>`);
            }
          }
        },

        getAll() {
          return this.strategies;
        },

        get(name) {
          return this.strategies[name];
        }
      };

      // 添加请求管理器
      const requestManager = {
        requests: new Map(),
        
        register(key, controller) {
          // 取消之前的请求
          this.abort(key);
          // 注册新请求
          this.requests.set(key, controller);
        },
        
        abort(key) {
          if (this.requests.has(key)) {
            this.requests.get(key).abort();
            this.requests.delete(key);
          }
        },
        
        clear() {
          // 取消所有请求
          this.requests.forEach(controller => controller.abort());
          this.requests.clear();
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
          '<div class="btn btn-success" style="margin-right:10px;">勾选自己</div>'
        )
          .on('click', function () {
            const trList = $('#bugList tbody > tr')
            trList.each(function () {
              const tds = $(this).find('td')
              const name = $(tds[5]).text().trim()
              if (name.includes(localStorage.getItem('zm-username'))) {
                $(this).trigger('click')
              }
            })
          })
          .insertBefore('#bugs .actions a')
          
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
          } else if (/story-view-\d+.html/.test(path)) {
              setupStoryDetailPage();
          } else if (/resolvedbyme/.test(path)) {
              setupResolvedByMePage();
          } else if (/build-view-\d+.*\.html/.test(path)) {
              setupVersionBugPage()
              setupResolvedByMeBuildPage()
          } else if (/effort-createForObject-bug-\d+.html/.test(path)) {
              setupBugEffortPage()
          } else if (/effort-createForObject-task-\d+.html/.test(path)) {
              setupTaskEffortPage()
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
              GM_setClipboard(`🔨bug(${$(this).text().trim()}): ${$(this).next().text().trim().replace(/【.+】(【.+】)*(-)*/, '')}

禅道BUG链接: [【${$(this).text().trim()}】${$(this).next().text().trim()}](${location.href})`);
          }).attr('title', '点击复制Bug提交信息').css({cursor: 'pointer'});
          enforceEffortLogging();
      }

      // 设置需求详情页功能
      function setupStoryDetailPage() {
          $('.label.label-id').on('click', function () {
              GM_setClipboard(`🔥feat(${$(this).text().trim()}): ${$(this).next().text().trim().replace(/(【.+?】)(【.+?】)*(-)*(.+)/, '$1$2$4')}

需求链接: [【${$(this).text().trim()}】${$(this).next().text().trim()}](${location.href})`);
          }).attr('title', '点击需求提交信息').css({cursor: 'pointer'});
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
          // 获取Bug ID
          const bug_id = $("#mainContent > div > h2 > span.label.label-id")[0].innerHTML;

          // Bug类型配置
          const bugTypes = {
              title: 'Bug处理类型',
              color: '#e74c3c',
              items: [
                  {name: '【解决内部BUG】处理BUG ' + bug_id, desc: '自身代码导致的BUG，有禅道BUG跟踪（需关联到禅道问题单）'},
                  {name: '【协助他人处理BUG】BUG归属人<实际归属人/已离职>，处理BUG ' + bug_id, desc: '协助解决或排查其他人的BUG，按照BUG归属人区分。内部测试提出的BUG，需关联到禅道问题单，描述清楚BUG归属人；外部反馈的BUG，需写清楚问题反馈人及BUG归属情况'},
                  {name: '【协助他人】处理外部原因导致的BUG ' + bug_id, desc: '外部人员反馈的BUG，排查后定位为产品质量问题'}
              ]
          };

          // 创建Bug卡片HTML
          const createBugCard = () => {
              const items = bugTypes.items.map(item =>
                  `<li style="margin-bottom: 8px; padding: 8px; background-color: white; border-radius: 4px; cursor: pointer; transition: background-color 0.2s;" 
             title="${item.desc}" data-content="${item.name}">
                ${item.name}
            </li>`
              ).join('');

              return `
        <div style="margin-bottom: 15px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="padding: 10px; background-color: ${bugTypes.color}; color: white; font-weight: bold;">
                ${bugTypes.title}
            </div>
            <ul style="list-style: none; margin: 0; padding: 10px; background-color: #f0f0f0;">
                ${items}
            </ul>
        </div>`;
          };

          // 插入卡片
          const blank_div = $('#mainContent > form > div')[0];
          if (blank_div) {
              blank_div.style.paddingTop = '0';
              blank_div.innerHTML = createBugCard();
          } else {
              $(createBugCard()).insertBefore('#mainContent > form > #objectTable');
          }

          // 添加点击事件
          $("[data-content]").on('click', function () {
              const content = $(this).data('content');
              $(".form-control")[2].value = content;

              // 视觉反馈
              $(this).css('background-color', '#ffc7bf');
              setTimeout(() => $(this).css('background-color', 'white'), 300);
          });


          // 默认填写工时为1小时
          $(".form-control")[1].value = 1;
          $(".form-control")[2].value = "【解决内部BUG】处理BUG " + bug_id;
      }


        /**
       * 任务工时窗口默认填充1h完成任务
       */

        function setupTaskEffortPage() {
            // 任务类型配置
            const taskTypes = {
                development: {
                    title: '开发任务',
                    color: '#007bff',
                    items: [
                        {name: '【立项项目开发任务】', desc: '版本开发计划中包含的所有任务，有明确的禅道需求'},
                        {name: '【定制项目】', desc: '外部临时插入，以产品经理邮件为准，需要有禅道需求'},
                        {name: '【专项开发任务】', desc: '没有明确需求的隐形专项开发任务，不在版本开发计划中体现，包含预研/设计/性能/稳定性/代码优化等'}
                    ]
                },
                management: {
                    title: '管理任务',
                    color: '#28a745',
                    items: [
                        {name: '【培训任务】', desc: '参加内外部培训，技术纷享等'},
                        {name: '【学习任务】', desc: '新员工熟悉工作内容，开发人员学习新的工作方法等'},
                        {name: '【会议】', desc: '参加各种类型的会议，项目启动会、需求串讲会、计划评审会、项目周会、项目站会、项目复盘会、其他各类临时会议等'},
                        {name: '【管理任务】', desc: '项目管理类工作（制定项目计划、跟踪项目进展等）、人员管理类工作（人员招聘、绩效考核等）、编写管理规范类文档'}
                    ]
                },
                support: {
                    title: '支持任务',
                    color: '#ffc107',
                    items: [
                        {name: '【对外支持】', desc: '外部疑问解答，仅指导技术人员或排查疑问'},
                        {name: '【协助他人】', desc: '内部产品测试过程中外部原因导致的产品BUG（需关联到禅道问题单），协助测试人员排查环境问题，帮助其他开发搭建环境等'}
                    ]
                }
            };

            const taskName = $("#mainContent > div > h2 > span:nth-child(2)")[0].innerHTML;

            // 生成任务卡片HTML
            const createTaskCard = (category) => {
                const items = category.items.map(item =>
                    `<li style="margin-bottom: 8px; padding: 8px; background-color: white; border-radius: 4px; cursor: pointer; transition: background-color 0.2s;" 
                 title="${item.desc}" data-task="${item.name}${taskName}">
                <div style="font-weight: bold; color: ${category.color};">${item.name}</div>
             </li>`
                ).join('');

                return `
            <div style="flex: 1; background-color: #f8f9fa; border-radius: 8px;">
                <div style="padding: 10px; background-color: ${category.color}; border-top-left-radius: 8px; border-top-right-radius: 8px; color: white; font-weight: bold;">
                    ${category.title}
                </div>
                <ul style="list-style: none; padding: 0; margin: 0;">${items}</ul>
            </div>`;
            };

            // 生成完整内容
            const content = `
        <div style="border-radius: 10px; background-color: #ccc; padding: 10px; margin-bottom: 10px">
            <p style="color: red; margin-bottom: 15px">* 点击下方文案，可自动填充至第一行</p>
            <div style="display: flex; gap: 15px;">
                ${Object.values(taskTypes).map(createTaskCard).join('')}
            </div>
        </div>
        <style>
            .task-card li:hover {
                background-color: #e9ecef !important;
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
        </style>`;

            // 插入内容
            const blankDiv = $('#mainContent > form > div')[0];
            if (blankDiv) {
                blankDiv.style.paddingTop = '0';
                blankDiv.innerHTML = content;
            } else {
                $(content).insertBefore('#mainContent > form > #objectTable');
            }

            // 添加点击事件
            $("div[style*='flex: 1'] li").on('click', function () {
                const fullText = $(this).attr('data-task');
                $(".form-control")[3].value = fullText;

                // 视觉反馈
                $(this).css('background-color', '#d4edda');
                setTimeout(() => $(this).css('background-color', 'white'), 300);
            });
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
      async function createFloatBall() {
          // 检查是否在登录页面
          if (/user-login|file-read/.test(window.location.pathname)) {
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
            // 避免重复加载相同策略
            if (strategyName === panelStrategies.currentStrategy) return;

            panel.find('.zm-panel-tab').removeClass('active');
            $(this).addClass('active');
            
            // 保存当前选中的面板到 localStorage
            localStorage.setItem('zm-panel-active', strategyName);
            currentStrategy = strategyName; // 更新当前策略

            // 使用新的切换方法
            await panelStrategies.switchStrategy(strategyName, panel.find('.zm-panel-content'));
          });

          // 初始加载内容
          await panelStrategies.switchStrategy(currentStrategy, panel.find('.zm-panel-content'));

          // 修改刷新按钮事件处理
          panel.find('.icon-refresh').click(
            debounce(async function(e) {
              e.stopPropagation();
              
              // 刷新时取消所有进行中的请求
              requestManager.clear();
              
              const refreshIcon = $(this);
              refreshIcon.css({
                'transform': 'rotate(360deg)',
                'transition': 'transform 0.5s'
              });
              
              const strategy = panelStrategies.get(currentStrategy);
              await strategy.render(panel.find('.zm-panel-content'));
              
              setTimeout(() => {
                refreshIcon.css({
                  'transform': 'rotate(0deg)',
                  'transition': 'none'
                });
              }, 500)
            }, 300) // 300ms 的防抖延迟
          );

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
                  // 显示面板时取消所有进行中的请求
                  requestManager.clear();
                  
                  panel.css('opacity', 0).show();
                  updatePanelPosition();
                  panel.animate({ opacity: 1 }, 200);
                  isPanelVisible = true;
                  
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

      // 修改数据获取策略
      dataStrategies.register('workHours', {
        async fetch() {
          try {
            const controller = new AbortController();
            requestManager.register('workHours', controller);
            
            setCookie('pagerMyEffort', 100);
            
            const response = await fetch('/my-effort-all-date_desc-1000000-100-1.json', {
              signal: controller.signal
            });
            const text = await response.text(); // 先获取文本响应
            
            // 尝试解析 JSON
            let rawData;
            try {
              rawData = JSON.parse(text);
            } catch (e) {
              throw new Error('Invalid JSON response');
            }
            
            // 确保数据格式正确
            if (!rawData.data) {
              throw new Error('Invalid data format');
            }
            
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
              .map(date => {
                const hours = dailyHours.get(date);
                return {
                  date,
                  hours: hours ? Number(hours.toFixed(2)) : 0
                }
              })
              .sort((a, b) => new Date(b.date) - new Date(a.date));
          } catch (err) {
            if (err.name === 'AbortError') {
              console.log('Work hours request aborted');
              return [];
            }
            console.error('Error fetching work hours:', err);
            throw err;
          } finally {
            requestManager.requests.delete('workHours');
          }
        }
      });

      // 修改Bug数据获取策略
      dataStrategies.register('bugs', {
        async fetch() {
          try {
            const controller = new AbortController();
            requestManager.register('bugs', controller);
            
            const userName = localStorage.getItem('zm-username');
            if (!userName) return [];

            const response = await fetch('/my-work-bug.html', {
              signal: controller.signal
            });
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            const bugs = Array.from(doc.querySelectorAll('tr')).slice(1);
            
            const bugDetails = (await Promise.all(
              bugs.map(async tr => {
                const id = tr.cells[0].textContent.trim();
                const title = tr.cells[4].textContent.trim();
                const status = tr.cells[6].textContent.trim();
                
                const detailResponse = await fetch(`/bug-view-${id}.json`, {
                  signal: controller.signal
                });
                const rawDetail = await detailResponse.json();
                const detail = JSON.parse(rawDetail.data);
                
                const users = detail.users || {};
                const { assignedDate, resolvedBy, assignedTo } = detail.bug;
                const actions = Object.values(detail.actions).sort((a, b) => 
                  new Date(a.date) - new Date(b.date)
                );
                // 确定开始时间
                let startDate = null;
                if (actions.length === 1) {
                  // 只有一条记录，且初始指派给自己
                  if (users[assignedTo] === userName) {
                    startDate = assignedDate;
                  }
                } else {
                  // 检查历史记录中是否存在从自己转出的情况
                  const hasAssignFromMe = actions.some(action => {
                    if (!action.history) return false;
                    return action.history.some(h => 
                      h.field === 'assignedTo' && 
                      users[h.old] === userName
                    );
                  });

                  if (hasAssignFromMe) {
                    // 历史记录中存在从自己转出的情况
                    // 使用第一条记录的时间
                    startDate = actions[0].date;
                  } else {
                    // 查找指派给自己的操作
                    const assignToMeAction = actions.find(a => users[a.extra] === userName);
                    if (assignToMeAction) {
                      startDate = assignToMeAction.date;
                    } else if (users[assignedTo] === userName) {
                      // 最后才考虑初始指派
                      startDate = actions[0].date;
                    }
                  }
                }
                // 如果没有找到开始时间，说明bug不属于当前用户
                if (!startDate) {
                  return null;
                }
                
                
                const start = new Date(startDate);
                const {str: timeStr, h: hours} = timeRangeStr(start);
                
                // 检查是否有自己的操作记录
                const hasMyAction = actions.some(action => 
                  users[action.actor] === userName
                );

                return {
                  id,
                  title,
                  status,
                  timeStr,
                  hours,
                  resolvedBy: users[resolvedBy] || resolvedBy,
                  confirmed: detail.bug.confirmed === '1',
                  hasMyAction,
                  assignedTo: users[assignedTo]
                };
              })
            )).filter(Boolean);

            // 对bugs进行分类
            return {
              new24h: bugDetails.filter(bug => 
                bug.hours <= 24  // 24小时内新增
              ).sort((a, b) => b.hours - a.hours),  // 按时长降序
              unconfirmed: bugDetails.filter(bug => 
                bug.assignedTo === userName && !bug.confirmed
              ).sort((a, b) => b.hours - a.hours),
              untreated36h: bugDetails.filter(bug => 
                bug.hours >= 36 && bug.hours < 72 && (!bug.confirmed || !bug.hasMyAction)
              ).sort((a, b) => b.hours - a.hours),
              unresolved72h: bugDetails.filter(bug => 
                bug.hours >= 72 && !bug.resolvedBy
              ).sort((a, b) => b.hours - a.hours),
              pendingResolve: bugDetails.filter(bug => 
                bug.confirmed && bug.hours > 24 && bug.hours < 72
              ).sort((a, b) => b.hours - a.hours)
            };
            
          } catch (err) {
            if (err.name === 'AbortError') {
              console.log('Bugs request aborted');
            }
            console.error('Error fetching bug details:', err);
            throw err;
          } finally {
            requestManager.requests.delete('bugs');
          }
        }
      });

       // 虚拟滚动组件
       class VirtualScroll {
         constructor(options) {
           const defaultOptions = {
             itemHeight: 32,
             visibleCount: 10,
             bufferSize: 5,
             container: null,
             data: [],
             renderItem: null,
             className: '',
             maxHeight: 360 // 添加最大高度限制
           };
           
           this.options = { ...defaultOptions, ...options };
           this.init();
         }

         init() {
           const { itemHeight, visibleCount, data, container, className, maxHeight } = this.options;
           
           // 计算实际需要的高度，不超过maxHeight
           const totalHeight = data.length * itemHeight;
           const actualHeight = Math.min(totalHeight, maxHeight);
           
           this.$container = $(`
             <div class="zm-virtual-list ${className}" style="height: ${actualHeight}px; overflow-y: auto;">
               <div class="zm-virtual-content" style="position: relative;"></div>
             </div>
           `);
           
           this.$virtualContent = this.$container.find('.zm-virtual-content');
           this.$virtualContent.css('height', `${totalHeight}px`);
           
           $(container).append(this.$container);
           
           this.$container.on('scroll', debounce(() => {
             requestAnimationFrame(() => {
               this.render();
             });
           }, 16));
           
           this.render();
         }

         render() {
           const { itemHeight, bufferSize, data, renderItem } = this.options;
           const scrollTop = this.$container.scrollTop();
           
           const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
           const endIndex = Math.min(
             data.length,
             Math.ceil((scrollTop + this.$container.height()) / itemHeight) + bufferSize
           );
           
           this.$virtualContent.empty();
           
           for (let i = startIndex; i < endIndex; i++) {
             const itemContent = renderItem(data[i], i);
             const $item = $('<div>', {
               class: 'zm-panel-item',
               css: {
                 position: 'absolute',
                 top: `${i * itemHeight}px`,
                 width: '100%',
                 height: `${itemHeight}px`
               }
             }).html(itemContent);
             
             this.$virtualContent.append($item);
           }
         }

         updateData(newData) {
           this.options.data = newData;
           this.$virtualContent.css('height', `${newData.length * this.options.itemHeight}px`);
           this.render();
         }

         destroy() {
           this.$container.remove();
         }
       }

       // 工时提醒面板
       const workHoursPanel = {
         strategy: {
           title: '工时提醒',
           icon: 'icon-time',
           async render(content) {
             try {
               content.html('<div class="zm-panel-item" style="text-align: center;">加载中...</div>');
               
               const insufficientDays = await dataStrategies.fetch('workHours');
               
               content.empty();
               if (!insufficientDays || insufficientDays.length === 0) {
                 content.append('<div class="zm-panel-item">所有工作日工时已填写完整 👍</div>');
                 return;
               }

               new VirtualScroll({
                 container: content,
                 data: insufficientDays,
                 className: 'work-hours',
                 itemHeight: 48,
                 maxHeight: 360, // 限制最大高度
                 renderItem: (day) => 
                   $('<div>').append(
                     $('<span>').text(day.date),
                     $('<span>').addClass('zm-hours').text(`${day.hours}h / 8h`)
                   ).html()
               });
               
             } catch (err) {
               if (err.name === 'AbortError') {
                 content.html('<div class="zm-panel-item" style="text-align: center;">加载中...</div>');
                 return;
               }
               content.html(`<div class="zm-panel-item error">加载失败: ${err.message}</div>`);
             }
           }
         },
         
         style: `
           .zm-virtual-list.work-hours .zm-panel-item {
             line-height: 40px;
             padding: 4px 16px;
             display: flex;
             justify-content: space-between;
             align-items: center;
             border-bottom: 1px solid #f0f0f0;
             background-color: #fff;
           }
           
           .zm-virtual-list.work-hours .zm-hours {
             color: #ff4d4f;
             font-size: 12px;
           }
         `
       };

       // Bug统计面板
       const bugsPanel = {
         strategy: {
           title: 'Bug统计',
           icon: 'icon-bug',
           async render(content) {
             try {
               content.html('<div class="zm-panel-item" style="text-align: center;">加载中...</div>');
               
               const bugs = await dataStrategies.fetch('bugs');
               
               content.empty();
               if (!bugs || !Object.values(bugs).some(arr => arr.length > 0)) {
                 content.append('<div class="zm-panel-item">暂无Bug</div>');
                 return;
               }

               // 添加提示信息(如果是首次查看)
               if (!localStorage.getItem('zm-bug-tip-shown')) {
                 content.append(`
                   <div class="zm-bug-tip">
                     <span>💡 点击Bug ID可直接跳转到详情页</span>
                     <span class="close-tip">×</span>
                   </div>
                 `);
                 
                 content.find('.close-tip').click(function() {
                   $(this).parent().fadeOut(200);
                   localStorage.setItem('zm-bug-tip-shown', 'true');
                 });
               }

               // 更新分类配置和显示顺序
               const categories = [
                 { key: 'untreated36h', title: '36小时未处理', color: '#ff4d4f' },
                 { key: 'unresolved72h', title: '72小时未解决', color: '#f5222d' },
                 { key: 'pendingResolve', title: '待解决Bug', color: '#1890ff' },
                 { key: 'new24h', title: '24小时内新增', color: '#52c41a' }
               ];

               // 添加展开全部按钮
               content.append(`
                 <div class="zm-bug-expand-all">
                   <span class="expand-all-btn">展开全部</span>
                 </div>
               `);

               categories.forEach(({key, title, color}) => {
                 if (bugs[key].length > 0) {
                   const isExpanded = key === 'pendingResolve'; // 默认展开待解决bug
                   content.append(`
                     <div class="zm-bug-category">
                       <div class="zm-bug-category-title ${isExpanded ? 'expanded' : ''}" style="color: ${color}">
                         <i class="icon icon-chevron-right ${isExpanded ? 'icon-rotate-90' : ''}"></i>
                         ${title} (${bugs[key].length})
                       </div>
                       <div class="zm-bug-list-${key}" style="display: ${isExpanded ? 'block' : 'none'}"></div>
                     </div>
                   `);

                   new VirtualScroll({
                     container: content.find(`.zm-bug-list-${key}`),
                     data: bugs[key],
                     className: 'bugs',
                     itemHeight: 32,
                     visibleCount: Math.min(bugs[key].length, 5),
                     maxHeight: 200, // 限制每个分类的最大高度
                     renderItem: (bug) => {
                       // 根据时长确定颜色类
                       let colorClass = '';
                       if (bug.hours <= 24) {
                         colorClass = 'green';
                       } else if (bug.hours <= 34) {
                         colorClass = 'orange';
                       } else if (bug.hours <= 70) {
                         colorClass = 'yellow';
                       } else {
                         colorClass = 'red';
                       }
                       
                       return $('<div>')
                         .addClass('zm-bug-item')
                         .css('cursor', 'pointer')
                         .on('click', () => {
                           window.open(`/bug-view-${bug.id}.html`, '_blank');
                         })
                         .append(
                           $('<a>')
                             .addClass('zm-bug-id')
                             .attr('href', `/bug-view-${bug.id}.html`)
                             .attr('target', '_blank')
                             .text(`Bug: ${bug.id}`)
                             .attr('title', bug.title),
                           $('<span>')
                             .addClass(`zm-bug-hours ${colorClass}`)
                             .text(bug.timeStr)
                         ).html();
                     }
                   });
                 }
               });
               
               // 添加折叠/展开事件处理
               content.find('.zm-bug-category-title').click(function() {
                 $(this).toggleClass('expanded');
                 $(this).find('.icon').toggleClass('icon-rotate-90');
                 $(this).next('.zm-bug-list-' + $(this).parent().find('[class^="zm-bug-list-"]').attr('class').split('-')[3]).slideToggle(200);
                 
                 // 检查是否所有分类都已展开
                 const allExpanded = content.find('.zm-bug-category-title.expanded').length === content.find('.zm-bug-category-title').length;
                 content.find('.expand-all-btn').text(allExpanded ? '折叠全部' : '展开全部');
               });

               // 展开全部按钮事件处理
               content.find('.expand-all-btn').click(function() {
                 const isExpandAll = $(this).text() === '展开全部';
                 $(this).text(isExpandAll ? '折叠全部' : '展开全部');
                 content.find('.zm-bug-category-title').each(function() {
                   const $title = $(this);
                   const $list = $title.next('[class^="zm-bug-list-"]');
                   if (isExpandAll) {
                     $title.addClass('expanded');
                     $title.find('.icon').addClass('icon-rotate-90');
                     $list.slideDown(200);
                   } else {
                     $title.removeClass('expanded');
                     $title.find('.icon').removeClass('icon-rotate-90');
                     $list.slideUp(200);
                   }
                 });
               });
               
             } catch (err) {
               if (err.name === 'AbortError') {
                 content.html('<div class="zm-panel-item" style="text-align: center;">加载中...</div>');
                 return;
               }
               content.html(`<div class="zm-panel-item error">加载失败: ${err.message}</div>`);
             }
           }
         },
         
         style: `
           .zm-virtual-list.bugs .zm-panel-item {
             padding: 8px 12px;
           }
           
           .zm-bug-category {
             margin-bottom: 12px;
           }

           .zm-bug-category-title {
             padding: 8px 12px;
             font-weight: bold;
             background: #fafafa;
             cursor: pointer;
             user-select: none;
             display: flex;
             align-items: center;
           }
           
           .zm-bug-category-title:hover {
             background: #f0f0f0;
           }
           
           .zm-bug-category-title .icon {
             margin-right: 8px;
             transition: transform 0.2s;
           }
           
           .zm-bug-category-title .icon-rotate-90 {
             transform: rotate(90deg);
           }
           
           .zm-bug-item {
             display: flex;
             align-items: center;
             width: 100%;
             transition: background-color 0.2s;
           }
           
           .zm-bug-item:hover {
             background-color: rgba(24, 144, 255, 0.1);
           }
           
           .zm-bug-id {
             color: #666;
             margin-right: 8px;
             cursor: pointer;
             text-decoration: none;
             position: relative;
           }
           
           .zm-bug-id:hover {
             color: #1890ff;
             text-decoration: underline;
           }
           
           /* 添加鼠标悬停提示图标 */
           .zm-bug-id::before {
             content: '🔗';
             font-size: 12px;
             margin-right: 4px;
             opacity: 0;
             transition: opacity 0.2s;
           }
           
           .zm-bug-id:hover::before {
             opacity: 1;
           }
           
           /* 首次打开面板时的提示样式 */
           .zm-bug-tip {
             padding: 8px 12px;
             background: #e6f7ff;
             border: 1px solid #91d5ff;
             border-radius: 4px;
             margin-bottom: 8px;
             font-size: 12px;
             color: #1890ff;
             display: flex;
             align-items: center;
             justify-content: space-between;
           }
           
           .zm-bug-tip .close-tip {
             cursor: pointer;
             color: #1890ff;
             font-size: 14px;
           }
           
           .zm-bug-title {
             flex: 1;
             overflow: hidden;
             text-overflow: ellipsis;
             white-space: nowrap;
           }
           
           .zm-bug-hours {
             font-size: 12px;
             margin-left: 8px;
           }
           
           .zm-bug-hours.green { color: #52c41a; }
           .zm-bug-hours.yellow { color: #faad14; }
           .zm-bug-hours.orange { color: #fa8c16; }
           .zm-bug-hours.red { color: #ff4d4f; }
           
           .zm-bug-expand-all {
             padding: 8px 12px;
             border-bottom: 1px solid #f0f0f0;
           }

           .expand-all-btn {
             color: #1890ff;
             cursor: pointer;
             user-select: none;
           }

           .expand-all-btn:hover {
             color: #40a9ff;
           }
         `
       };

       // 注册面板
       panelStrategies.register('workHours', workHoursPanel.strategy);
       panelStrategies.register('myBugs', bugsPanel.strategy);

       // 添加样式
       GM_addStyle(`
         /* 通用虚拟列表样式 */
         .zm-panel-content {
           width: 100%;
         }

         .zm-virtual-list {
           position: relative;
           border-top: 1px solid #f0f0f0;
           width: 100%;
         }
         
         .zm-virtual-list .zm-virtual-content {
           width: 100%;
         }
         
         .zm-virtual-list .zm-panel-item {
           box-sizing: border-box;
           width: 100%;
         }
         
         .zm-virtual-list .zm-panel-item:hover {
           background-color: #f5f5f5;
         }
         
         /* 各面板特定样式 */
         ${workHoursPanel.style}
         ${bugsPanel.style}
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

// 简单的debounce实现
function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}


