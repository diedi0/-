/**
 * 项目报价单 - 金额计算模块
 * 负责行金额、类目合计、整单总额、含税金额计算
 * 使用整数分计算避免浮点精度问题
 */
var calc = (function () {

    /** 将金额转为整数分（避免浮点误差） */
    function toCents(num) {
        var n = parseFloat(num);
        if (isNaN(n) || !isFinite(n)) return 0;
        return Math.round(n * 100);
    }

    /** 整数分转元，保留两位小数 */
    function toYuan(cents) {
        return (cents / 100).toFixed(2);
    }

    /** 重新计算所有金额 */
    function recalc() {
        var cats = document.querySelectorAll('.pq-category');
        var grandTotalCents = 0;

        cats.forEach(function (cat) {
            var rows = cat.querySelectorAll('.pq-product-body tr');
            var catTotalCents = 0;

            rows.forEach(function (row, idx) {
                // 序号
                var idxCell = row.querySelector('.row-idx');
                if (idxCell) idxCell.textContent = idx + 1;

                var qtyInput = row.querySelector('.input-qty');
                var priceInput = row.querySelector('.input-price');
                var amountCell = row.querySelector('.cell-amount');

                var qty = parseFloat(qtyInput.value);
                var price = parseFloat(priceInput.value);

                if (isNaN(qty) || qty < 0) qty = 0;
                if (isNaN(price) || price < 0) price = 0;

                // 行金额 = 数量 × 单价
                var lineCents = toCents(qty) * toCents(price) / 100;
                lineCents = Math.round(lineCents);

                if (amountCell) amountCell.textContent = toYuan(lineCents);

                // 空白行（无名称）不计入类目合计
                var nameInput = row.querySelector('.input-name');
                if (nameInput && nameInput.value.trim()) {
                    catTotalCents += lineCents;
                }
            });

            // 更新类目合计
            var totalVal = cat.querySelector('.category-total-value');
            if (totalVal) totalVal.textContent = '¥' + toYuan(catTotalCents);

            var catName = '';
            var nameInput = cat.querySelector('.category-name-input');
            if (nameInput) catName = nameInput.value.trim() || '类目';
            var totalLabel = cat.querySelector('.category-total-label');
            if (totalLabel) totalLabel.textContent = catName + ' 合计：';

            grandTotalCents += catTotalCents;
        });

        // 更新整单未税总额
        var totalEl = document.getElementById('pqTotalAmount');
        if (totalEl) totalEl.textContent = '¥' + toYuan(grandTotalCents);

        return grandTotalCents;
    }

    /** 计算含税金额 */
    function calcTax() {
        var totalText = document.getElementById('pqTotalAmount').textContent.replace('¥', '');
        var totalCents = toCents(totalText);
        var rateInput = document.getElementById('pqTaxRate');
        var rate = parseFloat(rateInput.value);
        if (isNaN(rate) || rate < 0) rate = 0;

        // 含税 = 未税 × (1 + 税率/100)
        var taxCents = Math.round(totalCents * (100 + rate) / 100);
        var taxEl = document.getElementById('pqTaxAmount');
        taxEl.value = toYuan(taxCents);
    }

    /** 获取当前未税总额（分） */
    function getGrandTotalCents() {
        var totalText = document.getElementById('pqTotalAmount').textContent.replace('¥', '');
        return toCents(totalText);
    }

    return {
        recalc: recalc,
        calcTax: calcTax,
        getGrandTotalCents: getGrandTotalCents,
        toCents: toCents,
        toYuan: toYuan
    };
})();
