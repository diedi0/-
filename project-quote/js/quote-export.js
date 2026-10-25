/**
 * 项目报价单 - 导出模块
 * 真实实现 PDF / PNG 导出，基于 html2canvas + jsPDF
 * 统一使用 preview.buildFormalHtml 生成正式版面
 */
var exportFunc = (function () {

    /** 导出进行标志：防止快速连点导致并发渲染/重复下载 */
    var exporting = false;

    /** 将正式版面渲染为 canvas（离屏渲染，完整高度，长单不截断） */
    function renderToCanvas(quote) {
        return new Promise(function (resolve, reject) {
            if (typeof html2canvas === 'undefined') {
                reject(new Error('html2canvas 库未加载，请检查网络后刷新页面'));
                return;
            }
            var holder = document.createElement('div');
            holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:1123px;background:#fff;z-index:-1;';
            holder.innerHTML = preview.buildFormalHtml(quote, true);
            document.body.appendChild(holder);

            html2canvas(holder, {
                backgroundColor: '#ffffff',
                scale: 2,
                useCORS: true,
                logging: false
            }).then(function (canvas) {
                document.body.removeChild(holder);
                resolve(canvas);
            }).catch(function (err) {
                document.body.removeChild(holder);
                reject(err);
            });
        });
    }

    /** 文件名：单据编号_日期 */
    function fileName(quote, ext) {
        var base = (quote.order_no || 'quote') + '_' + (quote.order_date || '');
        base = base.replace(/[\\/:*?"<>|]/g, '-');
        return base + '.' + ext;
    }

    /** 导出 PNG（真实下载） */
    function exportPNG() {
        if (exporting) { app.toast('正在导出中，请勿重复点击', 'info'); return; }
        calc.recalc();
        var quote = quoteData.collect();
        var err = quoteData.validate(quote);
        if (err) { app.toast(err, 'error'); return; }

        exporting = true;
        app.toast('正在生成 PNG，请稍候…', 'info', 30000);
        renderToCanvas(quote).then(function (canvas) {
            canvas.toBlob(function (blob) {
                exporting = false;
                if (!blob) { app.toast('PNG 生成失败', 'error'); return; }
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = fileName(quote, 'png');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                app.toast('PNG 已导出：' + fileName(quote, 'png'), 'success');
            }, 'image/png');
        }).catch(function (e) {
            exporting = false;
            app.toast('PNG 生成失败：' + e.message, 'error');
        });
    }

    /** 导出 PDF（A4 横向，长内容自动分页） */
    function exportPDF() {
        if (exporting) { app.toast('正在导出中，请勿重复点击', 'info'); return; }
        calc.recalc();
        var quote = quoteData.collect();
        var err = quoteData.validate(quote);
        if (err) { app.toast(err, 'error'); return; }

        if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
            app.toast('PDF 库未加载，正在改用浏览器打印（可选择"另存为PDF"）…', 'info');
            if (preview.open()) {
                setTimeout(function () { window.print(); }, 400);
            }
            return;
        }

        exporting = true;
        app.toast('正在生成 PDF，请稍候…', 'info', 30000);
        renderToCanvas(quote).then(function (canvas) {
            try {
                var jsPDF = window.jspdf.jsPDF;
                var pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                var pageW = 297; // A4 横向宽
                var pageH = 210;
                var margin = 5;
                var usableW = pageW - margin * 2;
                var usableH = pageH - margin * 2;

                var imgW = usableW;
                var imgH = canvas.height * imgW / canvas.width;

                // 按页切片
                var pageCanvas = document.createElement('canvas');
                var pageCtx = pageCanvas.getContext('2d');
                var pagePixH = Math.floor(canvas.width * usableH / imgW); // 每页对应的源图像素高

                var rendered = 0;
                var pageIdx = 0;
                while (rendered < canvas.height) {
                    var sliceH = Math.min(pagePixH, canvas.height - rendered);
                    pageCanvas.width = canvas.width;
                    pageCanvas.height = sliceH;
                    pageCtx.fillStyle = '#ffffff';
                    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                    pageCtx.drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

                    var data = pageCanvas.toDataURL('image/jpeg', 0.92);
                    if (pageIdx > 0) pdf.addPage();
                    var sliceHmm = sliceH * imgW / canvas.width;
                    pdf.addImage(data, 'JPEG', margin, margin, imgW, sliceHmm);

                    rendered += sliceH;
                    pageIdx++;
                }

                pdf.save(fileName(quote, 'pdf'));
                exporting = false;
                app.toast('PDF 已导出：' + fileName(quote, 'pdf'), 'success');
            } catch (e) {
                exporting = false;
                app.toast('PDF 生成失败：' + e.message, 'error');
            }
        }).catch(function (e) {
            exporting = false;
            app.toast('PDF 生成失败：' + e.message, 'error');
        });
    }

    /** 打印（打开预览后调用系统打印） */
    function printQuote() {
        var quote = preview.open();
        if (quote) {
            setTimeout(function () { window.print(); }, 300);
        }
    }

    return {
        exportPNG: exportPNG,
        exportPDF: exportPDF,
        printQuote: printQuote,
        renderToCanvas: renderToCanvas
    };
})();
