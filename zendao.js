// ==UserScript==
// @name        OS-EASY 专属禅道标记助手
// @namespace   Violentmonkey Scripts
// @match       http*://172.16.203.14/*
// @require     https://unpkg.com/jquery@3.3.1/dist/jquery.min.js
// @require     https://unpkg.com/cn-workday@1.0.11/dist/cn-workday.js
// @grant       GM_addStyle
// @grant       GM_setClipboard
// @version     1.3.5
// @author      LinHQ & Mr.Cheng
// @license     GPLv3
// @description 标记 bug 留存时间、解决方案填写人提示、计算每日工时、一键复制解决的 bug、解决指派 bug 强制填写工时、Bug 点击在新标签页打开
// @downloadURL https://update.greasyfork.org/scripts/502308/OS-EASY%20%E4%B8%93%E5%B1%9E%E7%A6%85%E9%81%93%E6%A0%87%E8%AE%B0%E5%8A%A9%E6%89%8B.user.js
// @updateURL https://update.greasyfork.org/scripts/502308/OS-EASY%20%E4%B8%93%E5%B1%9E%E7%A6%85%E9%81%93%E6%A0%87%E8%AE%B0%E5%8A%A9%E6%89%8B.meta.js
// ==/UserScript==

(() => {
    $.noConflict(true)(document).ready(async ($) => {
        const userName = localStorage.getItem('zm-username')
        if (!userName) {
            const name = prompt("看上去你是第一次使用，请输入禅道中的姓名：")
            if (name) localStorage.setItem('zm-username', name)
            else return
        }

        document.body.onclick = async function(e){
            if (event instanceof PointerEvent) {
                // 只处理 PointerEvent
                const aTag = e.target.tagName === 'A' ? e.target : e.target.parentElement.tagName === 'A' ? e.target.parentElement : null
                if(!aTag) return
                const aBtn = $(aTag)
                const aHref = aBtn.attr('href')
                aHref?.indexOf('bug-resolve') > -1 && await generatorResolveType()
            }
        }

        const colors = {
            green: '#82E0AA',
            yellow: '#F7DC6F ',
            brown: '#FE9900',
            red: '#E74C3C'
        }

        $("td.text-left a").attr('target', '_blank')
        switch (document.location.pathname) {
            case '/effort-calendar.html':
                GM_addStyle(`
        span.zm-day {
          font-weight: bold;
          margin: 0 8px;
        }
        .warn {
          color: ${colors.brown};
        }
        .fine {
          color: ${colors.green};
        }
        `)
                const el = document.body.children[2]
                let element = await waitForContentInContainer('#main', 'table')
                const obs = new MutationObserver(mark)
                function mark(_, observe) {
                    observe.disconnect()
                    const days = element.querySelectorAll(".cell-day")
                    days.forEach(dayElement => {
                        const timeEles = dayElement.querySelectorAll('.has-time .time')
                        const total = Array.from(timeEles).reduce((total, time) => total + parseFloat(time.textContent), 0)
                        $(dayElement).find('.zm-day').remove()
                        if (total != 0) $(dayElement).find('.heading').prepend(`<span class="zm-day ${total > 10 || total < 8 ? 'warn' : 'fine'}">【${total.toFixed(1)}小时】</span>`)
                    })
                    obs.observe(element, { subtree: true, childList: true })
                }
                obs.observe(element, { subtree: true, childList: true })
                mark(undefined, obs)
                break
            case '/my-work-bug.html':
                GM_addStyle(`
        td.text-left.nobr {
          white-space: normal;
        }
        span.zm-mark {
          padding: 2px;
          border-radius: 4px;
          border: 1px solid;
          font-size: .9em;
        }
        `)
                const btn = $(`<div class='btn-toolbar pull-right'>
          <div class="btn btn-warning">
            获取bug时间
          </div>
        </div>`)
                .on('click', async function () {
                    // TODO: 可能要处理翻页问题
                    let last = await refresh()
                    last = last.map(({ start, hasReactive }) => ({ ...timeRangeStr(start), processed: hasReactive }))

                    $("tr th:nth-child(9)").text('Bug 留存').removeClass('text-center')
                    $("tr td:nth-child(9)").each((idx, ele) => {
                        const cell = $(ele).empty().html(`<span class="zm-mark">${last[idx].str}</span>`)
                        const { h, processed } = last[idx]
                        /*
                36 - 72 未处理/已处理 2 小时余量
                0-12 绿/绿
                12-24 黄/绿
                24-36 深黄/黄
                36-72 红/深黄
                72-x 红/红
              */
                        if (h < 12) cell.css({ color: colors.green })
                        else if (h < 24) cell.css({ color: !processed ? colors.yellow : colors.green })
                        else if (h < 34) cell.css({ color: !processed ? colors.brown : colors.yellow })
                        else if (h < 70) cell.css({ color: !processed ? colors.red : colors.brown })
                        else cell.css({ color: colors.red })
                    })
                }).appendTo('#mainMenu')

                if ($('tr').length < 9) btn.click()

                async function refresh() {
                    const bugs = $("tr td:nth-child(5) a").map((_, ele) => fetchDocument(ele.href)).get()
                    const res = await Promise.all(bugs)
                    return res.map(parseBugPage)
                }
                break
            default:
                const path = document.location.pathname
                // bug 详情页功能
                if (/bug-view-\d+\.html$/m.test(path)) {
                    // 点击 bug 编号复制
                    $('.label.label-id').on('click', function () {
                        GM_setClipboard(`:bug: ${$(this).text().trim()} ${$(this).next().text().trim().replace(/【.+】/, '')}`)
                    }).attr('title', '点击复制 Bug').css({ cursor: 'pointer' })
                    // 强制填工时
                    $('a').has('.icon-bug-resolve, .icon-bug-assignTo').get()
                        .forEach(e => {
                        e.addEventListener('click', async function (e) {
                            const targetEle = e.target
                            const { needEffort } = parseBugPage()
                            if (needEffort) {
                                // 阻止按钮本来行为
                                e.stopPropagation()
                                e.preventDefault()
                                // jquery 不会触发 a 标签上的 click
                                $('a.effort').get(0).click()
                            }
                        }, true)
                    })
                } else if (/resolvedbyme/.test(path)) {
                    $('<div class="btn btn-success">复制勾选</div>').on('click', function () {
                        const bugs = $('tr.checked').map(function () {
                            const tds = $(this).find("td")
                            const id = $(tds[0]).text().trim()
                            const raw = $(tds[4]).text().trim()
                            // 主要匹配，开头不能是数字和其他方括号
                            let range = raw.match(/【([^【】]+?\/.+?)】/)
                            range = !range ? '' : range[1].replace(/(\d\.?|-){3}/, '') //移除版本号
                            const title = raw.slice(raw.lastIndexOf('】') + 1, raw.length)
                            return `${userName}\t\t${id} ${title}\t${range}\n`
            })
                        GM_setClipboard(bugs.get().join(''))
                    }).insertBefore('.btn-group.dropdown')
                }
                break
        }

        function timeRangeStr(start, end = Date.now()) {
            start = new Date(start)
            end = new Date(end)
            const d = 3.6e6 * 24

            let ms = 0
            while (start.getTime() < end) {
                /* TODO: 暂时先用某一个手打的库来判断，后续考虑自动爬gov.com数据 */
                if (CnWorkday.isWorkday(start)) {
                    ms += d
                }
                /* TODO: 节假日跳过 */
                start.setDate(start.getDate() + 1)
            }
            // 一般是负的，退回多加的部分
            ms += end - start
            ms = Math.max(ms, 0)

            const rawh = ms / 3.6e6

            let h, m
            h = Math.trunc(rawh)
            m = Math.trunc((rawh - h) * 60)
            return { str: `${h} 小时 ${m} 分钟`, h, m }
        }

        function parseBugPage(document = window.document) {
            const processedRe = new RegExp(`由.${userName}.(指派|解决|确认|添加)`)
            , effortRe = new RegExp(`由.${userName}.记录工时`)
            , assignRe = new RegExp(`由.${userName}.指派`)
            , assignedRe = new RegExp(`指派给.${userName}`)
            , dateRe = /(\d{4}-.+:\d{2})/

            /* 当前指派
       * 格式一：XXX
       * 格式二：XXX 于 DDDD
       */
            const current = $('#legendBasicInfo th:contains(当前指派) ~ td').text().trim()

            let start
            , assignmens = []
            , hasReactive = false
            , needEffort = current.includes(userName)
            , reactives = []

            $(document).find('#actionbox li').each(function () {
                const text = $(this).text().trim()
                // 注意，不与其他判断互斥，比如和 assignRe
                if (processedRe.test(text)) {
                    hasReactive = true
                    reactives.push({ time: new Date(text.match(dateRe)[1]), action: text })
                }
                if (effortRe.test(text)) {
                    needEffort = false
                }
                if (/由.+创建/.test(text)) {
                    start = new Date(text.match(dateRe)[1])
                }
                if (assignRe.test(text)) {
                    assignmens.push({ toMe: false, time: new Date(text.match(dateRe)[1]) })
                }
                if (assignedRe.test(text)) {
                    // 被指派，但 创建->指派出去->第一次指回 取创建不取第一次指回
                    assignmens.push({ toMe: true, time: new Date(text.match(dateRe)[1]) })
                    if (assignmens.length && assignmens[0].toMe) {
                        start = assignmens[0].time
                    }
                    // 又被指派的话日志再填一下，当然，当前指派需要是自己
                    needEffort = current.includes(userName)
                }
            })

            const dbg = { start: new Date(start).toLocaleString(), reactives, assignmens, hasReactive, needEffort }
            console.log('(zm)DEBUG: ', dbg)
            // bug 创建或第一次被指派时间，和 bug 最后交互时间，当前指派人
            return { start, reactives, assignmens, hasReactive, needEffort }
        }

        async function fetchDocument(url) {
            this.loading = true
            const page = await fetch(url).then(resp => resp.arrayBuffer()),
                  decoder = new TextDecoder(document.characterSet)

            return new DOMParser().parseFromString(decoder.decode(page), 'text/html')
        }

        async function waitForContentInContainer(containerSelector, targetSelector, timeout = 10000) {
            return new Promise((resolve, reject) => {
                let timer;
                const container = document.querySelector(containerSelector);

                if (!container) {
                    return reject(new Error(`Container ${containerSelector} not found`));
                }

                // 检查目标元素是否存在于容器中
                function checkElement() {
                    const element = container.querySelector(targetSelector);
                    if (element) {
                        if (timer) clearTimeout(timer);
                        observer.disconnect();
                        resolve(element);
                    }
                }

                // 使用 MutationObserver 监控容器的 DOM 变化
                const observer = new MutationObserver(checkElement);
                observer.observe(container, { childList: true, subtree: true });

                // 监控容器内的 iframe 加载
                const iframes = container.querySelectorAll('iframe');
                let iframeLoadPromises = Array.from(iframes).map(iframe => {
                    return new Promise(resolve => {
                        iframe.addEventListener('load', resolve);
                        // 处理已经加载的 iframe
                        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                            resolve();
                        }
                    });
                });

                // 设置一个超时处理
                timer = setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Timeout: Element ${targetSelector} not found within ${timeout}ms`));
                }, timeout);

                // 等待所有 iframe 加载和目标元素出现
                Promise.all(iframeLoadPromises).then(() => checkElement());
            });
        }

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
            }


            return data[type] ? `${type}<span style="color: #8e8e8e;">（填写人：${data[type]}）</span>` : type
        }

        async function generatorResolveType() {
            const element = await waitForContentInContainer('body', '.modal-trigger.modal-scroll-inside .modal-dialog')
            const oIframe = element.querySelector('iframe')
            oIframe.addEventListener('load', () => {
                const content = oIframe.contentDocument
                const body = content.querySelector('.m-bug-resolve')
                const main = body.querySelector('#mainContent')
                const container = main.querySelector('#center-block')
                const oTable = main.children[0].children[1].children[0]
                const oResolveType = oTable.querySelector('.chosen-container')
                oResolveType.addEventListener('click', () => {
                    const lis = oResolveType.querySelectorAll('li')
                    lis.forEach(node => {
                        const text = getOwner(node.textContent.trim())
                        node.innerHTML = text
                        node.title = text.replace(/<span style="color: .*;">|<\/span>/g, '')
                    })
                })
            })
        }

    })
})()


