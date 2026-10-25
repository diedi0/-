/**
 * 项目报价单 - 本地存储模块
 * 负责数据的增删改查、备份与恢复
 * 数据保存在浏览器 localStorage 中
 */
var storage = (function () {
    var STORAGE_KEY = 'project_quotes';
    var TOKEN_KEY = 'pq_token';

    // 后端地址：与 standalone 页面同主机，后端端口固定 3001
    var API_BASE = (location.protocol === 'file:')
        ? 'http://localhost:3001'
        : (location.protocol + '//' + location.hostname + ':3001');

    function apiBase() { return API_BASE; }

    function token() {
        try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }

    function authHeaders(extra) {
        var h = extra || {};
        var tk = token();
        if (tk) h['Authorization'] = 'Bearer ' + tk;
        return h;
    }

    function setStatus(text) {
        var el = document.getElementById('syncStatus');
        if (el) el.textContent = text;
    }

    function updateStatusFromToken() {
        if (token()) {
            setStatus('已连接后端，服务器数据会自动同步');
        } else {
            setStatus('未连接后端（当前仅本机缓存）');
        }
    }

    /** 登录系统账号并拉取服务器上的报价单 */
    function syncLogin() {
        var uEl = document.getElementById('syncUser');
        var pEl = document.getElementById('syncPwd');
        var u = uEl ? uEl.value.trim() : '';
        var p = pEl ? pEl.value : '';
        if (!u || !p) { app.toast('请输入系统账号和密码', 'error'); return; }
        setStatus('正在登录…');
        fetch(API_BASE + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        }).then(function (r) { return r.json(); }).then(function (res) {
            if (!res || !res.data || !res.data.token) {
                throw new Error((res && res.message) || '登录失败');
            }
            localStorage.setItem(TOKEN_KEY, res.data.token);
            if (pEl) pEl.value = '';
            pullAll(function (ok, msg, count) {
                if (ok) {
                    setStatus('已连接后端，服务器共 ' + count + ' 条报价单');
                    app.toast('已连接后端并完成同步', 'success');
                } else {
                    setStatus('登录成功，但拉取失败：' + msg);
                    app.toast('拉取失败：' + msg, 'error');
                }
            });
        }).catch(function (e) {
            setStatus('连接失败：' + e.message);
            app.toast('连接失败：' + e.message, 'error');
        });
    }

    /** 手动立即拉取 */
    function syncNow() {
        if (!token()) { app.toast('请先使用系统账号登录', 'error'); return; }
        setStatus('正在拉取…');
        pullAll(function (ok, msg, count) {
            if (ok) {
                setStatus('已连接后端，服务器共 ' + count + ' 条报价单');
                app.toast('已拉取 ' + count + ' 条报价单', 'success');
            } else {
                setStatus('拉取失败：' + msg);
                app.toast('拉取失败：' + msg, 'error');
            }
        });
    }

    function quoteKey(q) {
        return (q && q.order_no) ? String(q.order_no) : '';
    }

    /** 从后端拉取全部报价单，与本地缓存合并（服务器优先，本地独有的保留） */
    function pullAll(cb) {
        var tk = token();
        if (!tk) { if (cb) cb(false, '未登录', 0); return; }
        fetch(API_BASE + '/api/project-quotes', { headers: authHeaders() })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (!res || !res.ok) throw new Error((res && res.message) || '返回失败');
                var serverList = res.data || [];
                var local = getAll();

                var merged = [];
                var usedOrders = {};
                serverList.forEach(function (row) {
                    var q = row && row.data ? row.data : null;
                    if (!q) return;
                    // 记录服务器 ID，便于后续删除时定位
                    q.server_id = row.id;
                    merged.push(q);
                    if (quoteKey(q)) usedOrders[quoteKey(q)] = true;
                });
                local.forEach(function (q) {
                    if (quoteKey(q) && usedOrders[quoteKey(q)]) return;
                    merged.push(q);
                });

                saveAll(merged);
                if (typeof historyList !== 'undefined') historyList.render();
                if (cb) cb(true, '', serverList.length);
            })
            .catch(function (e) {
                if (cb) cb(false, e.message, 0);
            });
    }

    /** 单条报价单写入后端（失败时静默，本地缓存仍然有效） */
    function pushQuote(quote) {
        var tk = token();
        if (!tk) return;
        var body = {
            quoteNo: quote.order_no || '',
            title: quote.title || '',
            customerName: quote.customer_name || '',
            amount: parseFloat(quote.total) || 0,
            data: quote
        };
        fetch(API_BASE + '/api/project-quotes', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(body)
        }).then(function (r) { return r.json(); }).then(function (res) {
            if (res && res.ok && res.data) {
                quote.server_id = res.data.id;
                var list = getAll();
                for (var i = 0; i < list.length; i++) {
                    if (list[i].id === quote.id) { list[i].server_id = res.data.id; break; }
                }
                saveAll(list);
            }
        }).catch(function () { /* 离线时忽略，本地缓存仍可用 */ });
    }

    /** 删除后端的同号报价单 */
    function removeRemote(quote) {
        var tk = token();
        if (!tk || !quote) return;
        var orderNo = quote.order_no;
        var sid = quote.server_id;
        if (sid) {
            fetch(API_BASE + '/api/project-quotes/' + sid, { method: 'DELETE', headers: authHeaders() }).catch(function () {});
            return;
        }
        fetch(API_BASE + '/api/project-quotes', { headers: authHeaders() })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                var list = (res && res.data) || [];
                for (var i = 0; i < list.length; i++) {
                    if (list[i].quoteNo === orderNo) {
                        fetch(API_BASE + '/api/project-quotes/' + list[i].id, { method: 'DELETE', headers: authHeaders() }).catch(function () {});
                        return;
                    }
                }
            }).catch(function () {});
    }

    /** 图片上传到后端 uploads 目录；未登录时返回 null（调用方保留本地预览） */
    function uploadDataUrl(dataUrl, cb) {
        var tk = token();
        if (!tk || !dataUrl || dataUrl.indexOf('data:') !== 0) { cb(null); return; }
        try {
            var parts = dataUrl.split(',');
            var mimeMatch = parts[0].match(/:(.*?);/);
            var mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            var ext = mime.indexOf('png') >= 0 ? '.png' : (mime.indexOf('webp') >= 0 ? '.webp' : '.jpg');
            fetch(API_BASE + '/api/upload', {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ name: 'pq-' + Date.now() + ext, dataBase64: parts[1] })
            }).then(function (r) { return r.json(); }).then(function (res) {
                if (res && res.ok && res.data && res.data.url) {
                    cb(API_BASE + res.data.url);
                } else {
                    cb(null);
                }
            }).catch(function () { cb(null); });
        } catch (e) {
            cb(null);
        }
    }

    /** 读取全部报价单 */
    function getAll() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            var data = JSON.parse(raw);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error('读取数据失败:', e);
            return [];
        }
    }

    /** 保存全部报价单 */
    function saveAll(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
            return true;
        } catch (e) {
            console.error('保存数据失败:', e);
            if (e.name === 'QuotaExceededError') {
                app.toast('存储空间不足，请删除部分旧单据或清理图片后重试', 'error');
            }
            return false;
        }
    }

    /** 根据 ID 获取单条 */
    function getById(id) {
        var list = getAll();
        return list.find(function (q) { return q.id === id; }) || null;
    }

    /** 新增或更新报价单 */
    function save(quote) {
        var list = getAll();
        var idx = list.findIndex(function (q) { return q.id === quote.id; });
        if (idx >= 0) {
            quote.updated_at = new Date().toISOString();
            list[idx] = quote;
        } else {
            quote.created_at = quote.created_at || new Date().toISOString();
            quote.updated_at = new Date().toISOString();
            list.unshift(quote);
        }
        return saveAll(list);
    }

    /** 删除报价单（同时删除服务器同号记录） */
    function remove(id) {
        var quote = getById(id);
        var list = getAll().filter(function (q) { return q.id !== id; });
        var ok = saveAll(list);
        if (ok && quote) removeRemote(quote);
        return ok;
    }

    /** 搜索 */
    function search(keyword) {
        var list = getAll();
        if (!keyword) return list;
        var kw = keyword.toLowerCase().trim();
        return list.filter(function (q) {
            return (q.customer_name || '').toLowerCase().indexOf(kw) >= 0 ||
                (q.order_no || '').toLowerCase().indexOf(kw) >= 0 ||
                (q.order_date || '').indexOf(kw) >= 0;
        });
    }

    /** 生成唯一单据编号 */
    function generateOrderNo() {
        var now = new Date();
        var ts = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');
        var rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        return 'XM' + ts + rand;
    }

    /** 生成唯一 ID */
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }

    /** 导出备份 */
    function exportBackup() {
        var list = getAll();
        var backup = {
            version: '1.0',
            export_time: new Date().toISOString(),
            count: list.length,
            quotes: list
        };
        var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'project-quotes-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        app.toast('备份已导出，共 ' + list.length + ' 条报价单', 'success');
    }

    /** 导入备份 */
    function importBackup(event) {
        var file = event.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var data = JSON.parse(e.target.result);
                var quotes = data.quotes || data;
                if (!Array.isArray(quotes)) {
                    throw new Error('备份文件格式不正确');
                }
                if (!confirm('确定要导入备份吗？\n当前所有数据将被覆盖，此操作不可撤销。')) {
                    event.target.value = '';
                    return;
                }
                if (saveAll(quotes)) {
                    app.toast('恢复成功，共 ' + quotes.length + ' 条报价单', 'success');
                    app.closeBackup();
                    if (typeof historyList !== 'undefined') historyList.render();
                } else {
                    app.toast('恢复失败', 'error');
                }
            } catch (err) {
                app.toast('导入失败：' + err.message, 'error');
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    return {
        getAll: getAll,
        getById: getById,
        save: save,
        remove: remove,
        search: search,
        generateOrderNo: generateOrderNo,
        generateId: generateId,
        exportBackup: exportBackup,
        importBackup: importBackup,
        // 后端同步
        apiBase: apiBase,
        syncLogin: syncLogin,
        syncNow: syncNow,
        pullAll: pullAll,
        pushQuote: pushQuote,
        updateStatusFromToken: updateStatusFromToken,
        uploadDataUrl: uploadDataUrl
    };
})();
