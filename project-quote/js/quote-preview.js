/**
 * 项目报价单 - 预览模块
 * buildFormalHtml 由数据生成正式版面，预览/打印/PDF/PNG 统一调用
 */
var preview = (function () {

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /** 应用配色到正式版面内联样式 */
    function schemeOf(quote) {
        return colorScheme.get(quote.color_scheme || 'default');
    }

    /** 由数据生成正式报价单 HTML（A4横向版式）
     *  forExport=true 时渐变标题改用纯色（html2canvas 不支持 background-clip:text） */
    function buildFormalHtml(quote, forExport) {
        var scheme = schemeOf(quote);
        var titleStyle;
        if (scheme.title.indexOf('linear-gradient') === 0) {
            if (forExport) {
                var m = scheme.title.match(/#[0-9a-fA-F]{6}/);
                titleStyle = 'color:' + (m ? m[0] : '#4f46e5') + ';';
            } else {
                titleStyle = 'background:' + scheme.title + ';-webkit-background-clip:text;background-clip:text;color:transparent;';
            }
        } else {
            titleStyle = 'color:' + scheme.title + ';';
        }

        var html = '';
        html += '<div class="quote-paper" style="width:1123px;min-height:794px;background:#fff;padding:30px 40px;box-sizing:border-box;">';

        // 标题 + 报价单位
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #e0e7ff;">';
        if (quote.title) {
            html += '<h1 style="font-size:26px;font-weight:bold;margin:0;letter-spacing:2px;' + titleStyle + '">' + esc(quote.title) + '</h1>';
        } else {
            html += '<h1 style="font-size:26px;margin:0;"></h1>';
        }
        var coParts = [];
        if (quote.company) coParts.push('<span>报价单位：<b style="color:#334155;">' + esc(quote.company) + '</b></span>');
        if (quote.company_phone) coParts.push('<span>电话：<b style="color:#334155;">' + esc(quote.company_phone) + '</b></span>');
        html += '<div style="font-size:12px;color:#64748b;display:flex;gap:20px;">' + coParts.join('') + '</div>';
        html += '</div>';

        // 客户信息行（空字段隐藏）
        var infoCells = [];
        if (quote.customer_name) infoCells.push('<span style="color:#374151;font-weight:500;">客户名称：<span style="color:#0f172a;">' + esc(quote.customer_name) + '</span></span>');
        if (quote.customer_phone) infoCells.push('<span style="color:#374151;font-weight:500;">联系电话：<span style="color:#0f172a;">' + esc(quote.customer_phone) + '</span></span>');
        if (quote.order_date) infoCells.push('<span style="color:#374151;font-weight:500;">报价日期：<span style="color:#0f172a;">' + esc(quote.order_date) + '</span></span>');
        if (infoCells.length > 0) {
            html += '<div style="display:flex;gap:24px;margin-bottom:8px;font-size:12px;">' + infoCells.join('') + '</div>';
        }

        // 项目说明
        if (quote.project_desc) {
            html += '<div style="display:flex;gap:6px;margin-bottom:10px;font-size:12px;"><span style="color:#374151;font-weight:500;white-space:nowrap;">项目说明：</span><span style="color:#0f172a;white-space:pre-wrap;">' + esc(quote.project_desc) + '</span></div>';
        }

        // 类目与明细
        (quote.categories || []).forEach(function (cat, ci) {
            var items = (cat.items || []).filter(function (it) { return it.name; });
            if (items.length === 0) return; // 空类目不输出

            html += '<div style="margin-bottom:16px;">';
            html += '<div style="background:' + scheme.categoryBg + ';padding:4px 10px;border-radius:4px;border-left:3px solid ' + scheme.categoryBorder + ';font-weight:bold;color:' + scheme.categoryText + ';font-size:13px;">'
                + esc(colorScheme.getChineseNum(ci)) + '、' + esc(cat.name || '类目') + '</div>';

            html += '<table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;margin-top:0;">';
            html += '<thead><tr style="background:#f8fafc;">'
                + '<th style="border:1px solid #e2e8f0;padding:5px 3px;width:34px;color:#475569;">序号</th>'
                + '<th style="border:1px solid #e2e8f0;padding:5px 3px;color:#475569;">品牌/名称</th>'
                + '<th style="border:1px solid #e2e8f0;padding:5px 3px;color:#475569;">参数</th>'
                + '<th style="border:1px solid #e2e8f0;padding:5px 3px;color:#475569;">说明</th>'
                + '<th style="border:1px solid #e2e8f0;padding:5px 3px;width:44px;color:#475569;">单位</th>'
                + '<th style="border:1px solid #e2e8f0;padding:5px 3px;width:56px;color:#475569;">数量</th>'
                + '<th style="border:1px solid #e2e8f0;padding:5px 3px;width:80px;color:#475569;">单价</th>'
                + '<th style="border:1px solid #e2e8f0;padding:5px 3px;width:80px;color:#475569;">合计</th>'
                + '<th style="border:1px solid #e2e8f0;padding:5px 3px;width:80px;color:#475569;">备注</th>'
                + '<th style="border:1px solid #e2e8f0;padding:5px 3px;width:56px;color:#475569;">图片</th>'
                + '</tr></thead><tbody>';

            var catCents = 0;
            items.forEach(function (it, idx) {
                var qty = parseFloat(it.qty) || 0;
                var price = parseFloat(it.price) || 0;
                var cents = Math.round(calc.toCents(qty) * calc.toCents(price) / 100);
                catCents += cents;
                html += '<tr style="page-break-inside:avoid;">'
                    + '<td style="border:1px solid #e2e8f0;padding:4px 3px;text-align:center;color:#64748b;">' + (idx + 1) + '</td>'
                    + '<td style="border:1px solid #e2e8f0;padding:4px 3px;font-weight:600;color:#0f172a;">' + esc(it.name) + '</td>'
                    + '<td style="border:1px solid #e2e8f0;padding:4px 3px;color:#475569;">' + esc(it.spec || '') + '</td>'
                    + '<td style="border:1px solid #e2e8f0;padding:4px 3px;color:#475569;">' + esc(it.description || '') + '</td>'
                    + '<td style="border:1px solid #e2e8f0;padding:4px 3px;text-align:center;color:#475569;">' + esc(it.unit || '') + '</td>'
                    + '<td style="border:1px solid #e2e8f0;padding:4px 3px;text-align:center;color:#475569;">' + qty + '</td>'
                    + '<td style="border:1px solid #e2e8f0;padding:4px 3px;text-align:right;color:#475569;">' + price.toFixed(2) + '</td>'
                    + '<td style="border:1px solid #e2e8f0;padding:4px 3px;text-align:right;font-weight:600;color:#0f172a;">' + calc.toYuan(cents) + '</td>'
                    + '<td style="border:1px solid #e2e8f0;padding:4px 3px;color:#475569;">' + esc(it.remark || '') + '</td>'
                    + '<td style="border:1px solid #e2e8f0;padding:4px 3px;text-align:center;">'
                    + (it.image ? '<img src="' + esc(it.image) + '" style="max-width:50px;max-height:50px;object-fit:contain;border-radius:3px;">' : '')
                    + '</td>'
                    + '</tr>';
            });

            html += '</tbody><tfoot><tr style="background:' + scheme.totalBg + ';">'
                + '<td colspan="7" style="border:1px solid #e2e8f0;padding:5px 3px;text-align:right;font-weight:600;color:' + scheme.totalText + ';">' + esc(cat.name || '类目') + ' 合计：</td>'
                + '<td style="border:1px solid #e2e8f0;padding:5px 3px;text-align:right;font-weight:bold;color:#dc2626;">¥' + calc.toYuan(catCents) + '</td>'
                + '<td colspan="2" style="border:1px solid #e2e8f0;"></td>'
                + '</tr></tfoot></table></div>';
        });

        // 汇总区域
        html += '<div style="margin-top:16px;font-size:12px;">';
        if (quote.remark) {
            html += '<div style="display:flex;gap:6px;margin-bottom:10px;"><span style="color:#374151;font-weight:500;white-space:nowrap;">整单备注：</span><span style="color:#0f172a;white-space:pre-wrap;">' + esc(quote.remark) + '</span></div>';
        }
        html += '<div style="text-align:right;">';
        html += '<div style="margin-bottom:4px;"><span style="color:#374151;font-weight:500;">总金额（未税）：</span>'
            + '<span style="font-size:17px;font-weight:bold;color:#dc2626;">¥' + esc(quote.total || '0.00') + '</span></div>';
        if (quote.tax_amount) {
            html += '<div style="margin-bottom:4px;"><span style="color:#374151;font-weight:500;">税率 ' + esc(quote.tax_rate) + '%，含税金额：</span>'
                + '<span style="font-size:14px;font-weight:bold;color:#dc2626;">¥' + esc(quote.tax_amount) + '</span></div>';
        }
        if (quote.quote_note) {
            html += '<div style="font-size:11px;color:#6b7280;margin-top:8px;">备注：' + esc(quote.quote_note) + '</div>';
        }
        html += '</div></div>';

        html += '</div>';
        return html;
    }

    /** 打开预览（先校验有效数据） */
    function open() {
        calc.recalc();
        var quote = quoteData.collect();
        var err = quoteData.validate(quote);
        if (err) {
            app.toast(err, 'error');
            return null;
        }
        var container = document.getElementById('previewContent');
        container.innerHTML = buildFormalHtml(quote);
        document.getElementById('previewModal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        return quote;
    }

    /** 关闭预览 */
    function close() {
        document.getElementById('previewModal').classList.add('hidden');
        document.body.style.overflow = '';
    }

    /** 是否处于预览打开状态 */
    function isOpen() {
        return !document.getElementById('previewModal').classList.contains('hidden');
    }

    return {
        buildFormalHtml: buildFormalHtml,
        open: open,
        close: close,
        isOpen: isOpen
    };
})();
