/**
 * 项目报价单 - 历史单据管理模块
 * 列表、搜索、打开编辑、删除、预览入口
 */
var historyList = (function () {

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function fmtTime(iso) {
        if (!iso) return '-';
        try {
            var d = new Date(iso);
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-'
                + String(d.getDate()).padStart(2, '0') + ' '
                + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        } catch (e) { return iso; }
    }

    /** 渲染历史列表 */
    function render() {
        var keyword = '';
        var searchEl = document.getElementById('historySearch');
        if (searchEl) keyword = searchEl.value;

        var list = storage.search(keyword);
        var container = document.getElementById('historyList');
        var empty = document.getElementById('historyEmpty');
        var count = document.getElementById('historyCount');

        count.textContent = '（共 ' + list.length + ' 份）';
        container.innerHTML = '';

        if (list.length === 0) {
            empty.classList.remove('hidden');
            empty.textContent = keyword ? '没有找到匹配的报价单' : '暂无历史报价单，点击「新建报价单」开始创建';
            return;
        }
        empty.classList.add('hidden');

        list.forEach(function (q) {
            var card = document.createElement('div');
            card.className = 'history-card';

            var main = document.createElement('div');
            main.className = 'history-card-main';
            main.innerHTML =
                '<div class="history-card-title">' + esc(q.customer_name || '未填写客户') +
                ' <span style="color:#94a3b8;font-weight:normal;font-size:12px;">' + esc(q.order_no || '') + '</span></div>' +
                '<div class="history-card-meta">' +
                '<span>报价日期：' + esc(q.order_date || '-') + '</span>' +
                '<span>最后修改：' + esc(fmtTime(q.updated_at)) + '</span>' +
                '<span>类目：' + ((q.categories || []).length) + ' 个</span>' +
                '</div>';

            var amount = document.createElement('div');
            amount.className = 'history-card-amount';
            amount.textContent = '¥' + esc(q.total || '0.00');

            var actions = document.createElement('div');
            actions.className = 'history-card-actions';

            var editBtn = document.createElement('button');
            editBtn.className = 'btn btn-blue btn-sm';
            editBtn.textContent = '打开/编辑';
            editBtn.addEventListener('click', function () { app.editQuote(q.id); });

            var prevBtn = document.createElement('button');
            prevBtn.className = 'btn btn-gray btn-sm';
            prevBtn.textContent = '预览';
            prevBtn.addEventListener('click', function () {
                app.editQuote(q.id);
                setTimeout(function () { preview.open(); }, 100);
            });

            var delBtn = document.createElement('button');
            delBtn.className = 'btn btn-danger btn-sm';
            delBtn.textContent = '删除';
            delBtn.addEventListener('click', function () {
                if (!confirm('确定删除报价单「' + (q.order_no || '') + '」吗？此操作不可撤销。')) return;
                if (storage.remove(q.id)) {
                    app.toast('已删除', 'success');
                    // 如果正在编辑该单据，重置为新建状态
                    if (app.getCurrentId() === q.id) app.newQuote();
                    render();
                } else {
                    app.toast('删除失败', 'error');
                }
            });

            actions.appendChild(editBtn);
            actions.appendChild(prevBtn);
            actions.appendChild(delBtn);

            card.appendChild(main);
            card.appendChild(amount);
            card.appendChild(actions);
            container.appendChild(card);
        });
    }

    return { render: render };
})();
