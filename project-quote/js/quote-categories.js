/**
 * 项目报价单 - 类目与明细行管理模块
 * 负责类目的增删、明细行的增删、图片上传、序号重排
 */
var categories = (function () {

    /** 新增类目，返回类目 DOM 元素 */
    function add(name) {
        var list = document.getElementById('pqCategoryList');
        var div = document.createElement('div');
        div.className = 'pq-category';

        // 类目标题栏
        var header = document.createElement('div');
        header.className = 'category-header';

        var numSpan = document.createElement('span');
        numSpan.className = 'category-num';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'category-name-input';
        nameInput.value = name || '';
        nameInput.placeholder = '输入类目名称';
        nameInput.addEventListener('input', function () { calc.recalc(); });

        var addRowBtn = document.createElement('button');
        addRowBtn.className = 'btn btn-blue btn-xs';
        addRowBtn.textContent = '+ 添加产品行';
        addRowBtn.addEventListener('click', function () { addRow(div); });

        var delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger btn-xs';
        delBtn.textContent = '删除';
        delBtn.addEventListener('click', function () {
            if (!confirm('确定删除这个类目吗？类目下的所有明细将一并删除。')) return;
            div.remove();
            renumber();
            calc.recalc();
        });

        header.appendChild(numSpan);
        header.appendChild(nameInput);
        header.appendChild(addRowBtn);
        header.appendChild(delBtn);

        // 产品表格（外包一层用于手机端横向滚动）
        var wrapper = document.createElement('div');
        wrapper.className = 'pq-table-wrapper';

        var table = document.createElement('table');
        table.className = 'pq-table';

        var thead = document.createElement('thead');
        var headRow = document.createElement('tr');
        var heads = [
            { t: '序号', w: '34px' }, { t: '品牌/名称', w: '130px' }, { t: '参数', w: '150px' },
            { t: '说明', w: '90px' }, { t: '单位', w: '44px' }, { t: '数量', w: '60px' },
            { t: '单价', w: '80px' }, { t: '合计', w: '80px' }, { t: '备注', w: '80px' },
            { t: '图片', w: '56px' }, { t: '', w: '26px' }
        ];
        heads.forEach(function (h) {
            var th = document.createElement('th');
            th.textContent = h.t;
            th.style.width = h.w;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);

        var tbody = document.createElement('tbody');
        tbody.className = 'pq-product-body';

        var tfoot = document.createElement('tfoot');
        var footRow = document.createElement('tr');
        footRow.className = 'category-total-row';
        var labelTd = document.createElement('td');
        labelTd.colSpan = 7;
        labelTd.className = 'category-total-label cell-right';
        labelTd.textContent = '类目合计：';
        var valueTd = document.createElement('td');
        valueTd.className = 'category-total-value cell-right';
        valueTd.textContent = '¥0.00';
        var emptyTd = document.createElement('td');
        emptyTd.colSpan = 3;
        footRow.appendChild(labelTd);
        footRow.appendChild(valueTd);
        footRow.appendChild(emptyTd);
        tfoot.appendChild(footRow);

        table.appendChild(thead);
        table.appendChild(tbody);
        table.appendChild(tfoot);
        wrapper.appendChild(table);

        div.appendChild(header);
        div.appendChild(wrapper);
        list.appendChild(div);

        renumber();
        colorScheme.apply();
        return div;
    }

    /** 在指定类目下新增一行明细 */
    function addRow(categoryDiv, data) {
        var tbody = categoryDiv.querySelector('.pq-product-body');
        var row = document.createElement('tr');
        data = data || {};

        // 序号
        var idxTd = document.createElement('td');
        idxTd.className = 'row-idx';
        row.appendChild(idxTd);

        // 文本列：品牌/名称、参数、说明、单位
        var textCols = [
            { cls: 'input-name', ph: '品牌/名称', val: data.name || '' },
            { cls: 'input-spec', ph: '参数', val: data.spec || '' },
            { cls: 'input-desc', ph: '说明', val: data.description || '' },
            { cls: 'input-unit', ph: '', val: data.unit || '个', center: true }
        ];
        textCols.forEach(function (c) {
            var td = document.createElement('td');
            var input = document.createElement('input');
            input.type = 'text';
            input.className = c.cls;
            input.placeholder = c.ph;
            input.value = c.val;
            if (c.center) input.classList.add('cell-center');
            input.addEventListener('input', function () { calc.recalc(); });
            td.appendChild(input);
            row.appendChild(td);
        });

        // 数量
        var qtyTd = document.createElement('td');
        var qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.className = 'input-qty cell-center';
        qtyInput.value = (data.qty !== undefined && data.qty !== null) ? data.qty : 1;
        qtyInput.min = '0';
        qtyInput.addEventListener('focus', function () { qtyInput.select(); });
        qtyInput.addEventListener('input', function () { calc.recalc(); });
        qtyTd.appendChild(qtyInput);
        row.appendChild(qtyTd);

        // 单价
        var priceTd = document.createElement('td');
        var priceInput = document.createElement('input');
        priceInput.type = 'number';
        priceInput.className = 'input-price cell-right';
        priceInput.value = (data.price !== undefined && data.price !== null) ? data.price : 0;
        priceInput.min = '0';
        priceInput.addEventListener('focus', function () { priceInput.select(); });
        priceInput.addEventListener('input', function () { calc.recalc(); });
        priceTd.appendChild(priceInput);
        row.appendChild(priceTd);

        // 金额
        var amountTd = document.createElement('td');
        amountTd.className = 'cell-amount';
        amountTd.textContent = '0.00';
        row.appendChild(amountTd);

        // 备注
        var remarkTd = document.createElement('td');
        var remarkInput = document.createElement('input');
        remarkInput.type = 'text';
        remarkInput.className = 'input-remark';
        remarkInput.value = data.remark || '';
        remarkTd.appendChild(remarkInput);
        row.appendChild(remarkTd);

        // 图片
        var imgTd = document.createElement('td');
        imgTd.className = 'cell-center';
        var upload = document.createElement('div');
        upload.className = 'img-upload';
        if (data.image) {
            var img = document.createElement('img');
            img.src = data.image;
            img.alt = '';
            upload.appendChild(img);
        } else {
            upload.textContent = '上传';
        }
        upload.addEventListener('click', function () { uploadImage(upload); });
        imgTd.appendChild(upload);
        row.appendChild(imgTd);

        // 删除按钮
        var delTd = document.createElement('td');
        delTd.className = 'cell-center';
        var delBtn = document.createElement('button');
        delBtn.className = 'row-del-btn';
        delBtn.textContent = '×';
        delBtn.title = '删除本行';
        delBtn.addEventListener('click', function () {
            row.remove();
            calc.recalc();
        });
        delTd.appendChild(delBtn);
        row.appendChild(delTd);

        tbody.appendChild(row);
        calc.recalc();
        return row;
    }

    /** 图片上传（压缩至宽 100px JPEG 0.7，与原系统一致） */
    function uploadImage(div) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function (e) {
            var file = e.target.files[0];
            if (!file) return;
            if (file.type.indexOf('image/') !== 0) {
                app.toast('请选择图片文件', 'error');
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                app.toast('图片不能超过 10MB', 'error');
                return;
            }
            var reader = new FileReader();
            reader.onload = function (ev) {
                var img = new Image();
                img.onload = function () {
                    try {
                        var canvas = document.createElement('canvas');
                        var maxW = 100;
                        var scale = Math.min(1, maxW / img.width);
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        var ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                        div.innerHTML = '';
                        var thumb = document.createElement('img');
                        thumb.src = dataUrl;
                        thumb.alt = '';
                        div.appendChild(thumb);
                        // 已登录后端时把图片上传到服务器 uploads 目录，文档里只保存路径
                        storage.uploadDataUrl(dataUrl, function (remoteUrl) {
                            if (remoteUrl) {
                                thumb.src = remoteUrl;
                                thumb.setAttribute('data-remote', remoteUrl);
                            }
                        });
                    } catch (err) {
                        app.toast('图片处理失败：' + err.message, 'error');
                    }
                };
                img.onerror = function () { app.toast('图片加载失败，请换一张试试', 'error'); };
                img.src = ev.target.result;
            };
            reader.onerror = function () { app.toast('图片读取失败', 'error'); };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    /** 类目中文序号重排 */
    function renumber() {
        var cats = document.querySelectorAll('.pq-category');
        for (var i = 0; i < cats.length; i++) {
            var numEl = cats[i].querySelector('.category-num');
            if (numEl) numEl.textContent = colorScheme.getChineseNum(i) + '、';
        }
    }

    /** 清空全部类目 */
    function clear() {
        document.getElementById('pqCategoryList').innerHTML = '';
    }

    /** 类目上移/下移 */
    function move(categoryDiv, dir) {
        if (dir < 0 && categoryDiv.previousElementSibling) {
            categoryDiv.parentNode.insertBefore(categoryDiv, categoryDiv.previousElementSibling);
        } else if (dir > 0 && categoryDiv.nextElementSibling) {
            categoryDiv.parentNode.insertBefore(categoryDiv.nextElementSibling, categoryDiv);
        }
        renumber();
    }

    return {
        add: add,
        addRow: addRow,
        uploadImage: uploadImage,
        renumber: renumber,
        clear: clear,
        move: move
    };
})();
