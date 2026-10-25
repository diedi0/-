/**
 * 项目报价单 - 主应用模块
 * 页面路由、保存、Toast 提示、备份弹窗
 */
var app = (function () {
    /** 内部状态：当前正在编辑的单据 ID（null 表示新建） */
    var state = { currentId: null };

    /** Toast 提示 */
    var toastTimer = null;
    function toast(msg, type, duration) {
        var el = document.getElementById('toast');
        el.textContent = msg;
        el.className = 'toast ' + (type || 'info');
        el.classList.remove('hidden');
        if (toastTimer) clearTimeout(toastTimer);
        var ms = (typeof duration === 'number') ? duration : 2600;
        if (ms > 0) {
            toastTimer = setTimeout(function () { el.classList.add('hidden'); }, ms);
        }
    }

    /** 页面切换 */
    function showEditor() {
        document.getElementById('historyPage').classList.add('hidden');
        document.getElementById('editorPage').classList.remove('hidden');
    }
    function showHistory() {
        document.getElementById('editorPage').classList.add('hidden');
        document.getElementById('historyPage').classList.remove('hidden');
        historyList.render();
    }

    /** 新建报价单 */
    function newQuote() {
        state.currentId = null;
        quoteData.newQuote();
        showEditor();
        toast('已创建新报价单', 'success');
    }

    /** 打开历史单据编辑 */
    function editQuote(id) {
        var q = storage.getById(id);
        if (!q) { toast('单据不存在或已被删除', 'error'); return; }
        state.currentId = q.id;
        quoteData.load(q);
        showEditor();
    }

    /** 保存（新建插入、编辑更新原记录，不重复新增） */
    function save() {
        try {
            calc.recalc();
            var quote = quoteData.collect();
            var err = quoteData.validate(quote);
            if (err) { toast(err, 'error'); return; }

            if (state.currentId) {
                var old = storage.getById(state.currentId);
                if (old) {
                    quote.id = state.currentId;
                    quote.created_at = old.created_at;
                    // 编辑历史单据时保留原单据编号
                    quote.order_no = old.order_no || quote.order_no;
                } else {
                    quote.id = storage.generateId();
                }
            } else {
                quote.id = storage.generateId();
            }

            if (storage.save(quote)) {
                state.currentId = quote.id;
                // 已连接后端时同步一份到服务器数据库（离线时仅存本机缓存）
                storage.pushQuote(quote);
                toast('保存成功！单据号：' + quote.order_no, 'success');
            } else {
                toast('保存失败：写入存储出错', 'error');
            }
        } catch (e) {
            toast('保存出错：' + e.message, 'error');
        }
    }

    /** 备份弹窗 */
    function showBackup() {
        document.getElementById('backupModal').classList.remove('hidden');
    }
    function closeBackup() {
        document.getElementById('backupModal').classList.add('hidden');
    }

    /** 初始化 */
    function init() {
        // 打印后恢复页面滚动（防止预览弹窗状态残留）
        window.addEventListener('afterprint', function () {
            document.body.style.overflow = '';
        });
        // 打开应用即进入新建状态
        quoteData.newQuote();
        // 已连接后端时，启动后自动拉取服务器数据（localStorage 仅作离线缓存）
        storage.updateStatusFromToken();
        storage.pullAll(function () {});
    }

    document.addEventListener('DOMContentLoaded', init);

    return {
        toast: toast,
        showEditor: showEditor,
        showHistory: showHistory,
        newQuote: newQuote,
        editQuote: editQuote,
        save: save,
        showBackup: showBackup,
        closeBackup: closeBackup,
        // 暴露当前编辑 ID 供历史模块判断删除冲突
        getCurrentId: function () { return state.currentId; }
    };
})();
