/**
 * 项目报价单 - 数据收集与加载模块
 * 统一的数据模型：编辑、预览、保存、导出都从这里取数
 */
var quoteData = (function () {

    /** 从页面收集当前报价单完整数据 */
    function collect() {
        var cats = [];
        var catEls = document.querySelectorAll('.pq-category');
        var totalCents = 0;

        catEls.forEach(function (cat) {
            var nameInput = cat.querySelector('.category-name-input');
            var catName = nameInput ? nameInput.value.trim() : '';
            var items = [];
            var rows = cat.querySelectorAll('.pq-product-body tr');

            rows.forEach(function (row) {
                function val(cls) {
                    var el = row.querySelector(cls);
                    return el ? el.value : '';
                }
                var qty = parseFloat(val('.input-qty'));
                var price = parseFloat(val('.input-price'));
                if (isNaN(qty) || qty < 0) qty = 0;
                if (isNaN(price) || price < 0) price = 0;
                var amount = calc.toCents(qty) * calc.toCents(price) / 100;
                amount = Math.round(amount);

                var imgEl = row.querySelector('.img-upload img');
                var item = {
                    name: val('.input-name').trim(),
                    spec: val('.input-spec').trim(),
                    description: val('.input-desc').trim(),
                    unit: val('.input-unit').trim() || '个',
                    qty: qty,
                    price: price,
                    amount: calc.toYuan(amount),
                    remark: val('.input-remark').trim(),
                    image: imgEl ? imgEl.src : ''
                };
                // 空白行（所有文本字段为空且无图）不收集
                if (item.name || item.spec || item.description || item.remark || item.image) {
                    items.push(item);
                    totalCents += amount;
                }
            });

            cats.push({ name: catName, items: items });
        });

        var rate = parseFloat(document.getElementById('pqTaxRate').value);
        if (isNaN(rate) || rate < 0) rate = 0;

        var quote = {
            type: '项目报价单',
            title: document.getElementById('pqTitle').innerText.trim(),
            company: document.getElementById('pqCompany').innerText.trim(),
            company_phone: document.getElementById('pqPhone').innerText.trim(),
            customer_name: document.getElementById('pqCustomerName').value.trim(),
            customer_phone: document.getElementById('pqCustomerPhone').value.trim(),
            order_date: document.getElementById('pqDate').value,
            order_no: document.getElementById('pqOrderNo').value.trim(),
            project_desc: document.getElementById('pqProjectDesc').value.trim(),
            remark: document.getElementById('pqOrderRemark').value.trim(),
            quote_note: document.getElementById('pqQuoteNote').value.trim(),
            tax_rate: rate,
            tax_amount: document.getElementById('pqTaxAmount').value.trim(),
            total: calc.toYuan(totalCents),
            color_scheme: document.getElementById('pqColorScheme').value,
            categories: cats
        };
        return quote;
    }

    /** 校验是否有有效业务数据；返回 null 表示通过，否则返回错误信息 */
    function validate(quote) {
        // 至少一条有效明细（行内含名称/参数/说明/备注/图片任一内容）
        var hasValidItem = false;
        for (var i = 0; i < quote.categories.length; i++) {
            if (quote.categories[i].items.length > 0) { hasValidItem = true; break; }
        }
        // 默认标题不算有效内容（否则空白单据永远无法被拦截）
        var customTitle = quote.title && quote.title !== '智联电子项目报价单';
        var hasText = customTitle || quote.customer_name || quote.customer_phone ||
            quote.project_desc || quote.remark;
        if (!hasValidItem && !hasText) {
            return '当前报价单没有有效内容，请至少填写一条产品明细或客户/说明/备注信息后再保存。';
        }
        return null;
    }

    /** 将报价单数据加载到编辑界面 */
    function load(quote) {
        if (!quote) return;

        document.getElementById('pqTitle').innerText = quote.title || '智联电子项目报价单';
        document.getElementById('pqCompany').innerText = quote.company || '智联电子';
        document.getElementById('pqPhone').innerText = quote.company_phone || '';
        document.getElementById('pqCustomerName').value = quote.customer_name || '';
        document.getElementById('pqCustomerPhone').value = quote.customer_phone || '';
        document.getElementById('pqDate').value = quote.order_date || new Date().toISOString().slice(0, 10);
        document.getElementById('pqOrderNo').value = quote.order_no || storage.generateOrderNo();
        document.getElementById('pqProjectDesc').value = quote.project_desc || '';
        document.getElementById('pqOrderRemark').value = quote.remark || '';
        document.getElementById('pqQuoteNote').value = quote.quote_note || '报价有效期15天，最终解释权归智联电子所有';
        document.getElementById('pqTaxRate').value = (quote.tax_rate !== undefined && quote.tax_rate !== null) ? quote.tax_rate : 13;
        document.getElementById('pqTaxAmount').value = quote.tax_amount || '';
        document.getElementById('pqColorScheme').value = quote.color_scheme || 'default';

        // 重建类目
        categories.clear();
        var list = quote.categories || [];
        if (list.length === 0) {
            var c = categories.add('设备类');
            for (var i = 0; i < 3; i++) categories.addRow(c);
        } else {
            list.forEach(function (cat) {
                var div = categories.add(cat.name || '');
                var body = div.querySelector('.pq-product-body');
                body.innerHTML = '';
                (cat.items || []).forEach(function (item) {
                    categories.addRow(div, item);
                });
                if ((cat.items || []).length === 0) categories.addRow(div);
            });
        }

        colorScheme.apply();
        calc.recalc();
    }

    /** 新建空白报价单（默认两个类目各三行，与原系统一致） */
    function newQuote() {
        var quote = {
            id: storage.generateId(),
            order_no: storage.generateOrderNo(),
            order_date: new Date().toISOString().slice(0, 10),
            title: '智联电子项目报价单',
            company: '智联电子',
            company_phone: '13614335222',
            customer_name: '',
            customer_phone: '',
            project_desc: '',
            remark: '',
            quote_note: '报价有效期15天，最终解释权归智联电子所有',
            tax_rate: 13,
            tax_amount: '',
            color_scheme: 'default',
            categories: [
                { name: '设备类', items: [{}, {}, {}] },
                { name: '安装与服务类', items: [{}, {}, {}] }
            ]
        };
        load(quote);
        return quote;
    }

    return {
        collect: collect,
        validate: validate,
        load: load,
        newQuote: newQuote
    };
})();
