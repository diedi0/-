'use strict'
// 打印页渲染：生成 A4 版式的单据 / 合同 HTML（浏览器直接打印或另存为 PDF）

const DIGITS = '零壹贰叁肆伍陆柒捌玖'
const RADICE = ['', '拾', '佰', '仟']
const UNITS = ['', '万', '亿', '万亿']

function chineseInteger(num) {
  if (num === 0) return '零'
  let unitPos = 0
  let str = ''
  let needZero = false
  let n = num
  while (n > 0) {
    const section = n % 10000
    if (needZero && section !== 0) {
      str = '零' + str
    }
    let sectionStr = ''
    let sec = section
    let zero = false
    let pos = 0
    while (sec > 0) {
      const d = sec % 10
      if (d === 0) {
        if (!zero && sectionStr.length > 0) {
          zero = true
          sectionStr = '零' + sectionStr
        }
      } else {
        zero = false
        sectionStr = DIGITS[d] + RADICE[pos] + sectionStr
      }
      pos += 1
      sec = Math.floor(sec / 10)
    }
    if (section !== 0) {
      str = sectionStr + UNITS[unitPos] + str
    }
    if (section !== 0) {
      needZero = section < 1000
    }
    unitPos += 1
    n = Math.floor(n / 10000)
  }
  return str
}

function amountToChinese(value) {
  const cents = Math.round(Number(value || 0) * 100)
  if (cents === 0) return '零元整'
  let neg = ''
  let c = cents
  if (c < 0) {
    neg = '负'
    c = -c
  }
  const yuan = Math.floor(c / 100)
  const jiao = Math.floor((c % 100) / 10)
  const fen = c % 10
  let res = neg + chineseInteger(yuan) + '元'
  if (jiao === 0 && fen === 0) return res + '整'
  if (jiao > 0) res += DIGITS[jiao] + '角'
  if (fen > 0) {
    if (jiao === 0) res += '零'
    res += DIGITS[fen] + '分'
  } else {
    res += '整'
  }
  return res
}

function money(v) {
  return Number(v || 0).toFixed(2)
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textOr(v, fallback) {
  const s = String(v === null || v === undefined ? '' : v).trim()
  return s.length > 0 ? esc(s) : fallback
}

const CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #F2F4F7; color: #1B1F24;
    font-family: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", Arial, sans-serif;
  }
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 24px; background: #1B1F24; color: #FFFFFF;
  }
  .toolbar .hint { font-size: 12px; color: #C9D0D8; flex: 1; }
  .toolbar button {
    height: 32px; padding: 0 16px; border-radius: 6px; border: 1px solid #FFFFFF;
    background: #FFFFFF; color: #1B1F24; font-size: 13px; cursor: pointer;
  }
  .toolbar button.ghost { background: transparent; color: #FFFFFF; }
  .sheet {
    position: relative;
    width: 794px; min-height: 1000px; margin: 20px auto 40px; padding: 38px 44px;
    background: #FFFFFF; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
  }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1B1F24; padding-bottom: 14px; }
  .co-name { font-size: 21px; font-weight: 700; letter-spacing: 1px; }
  .co-line { font-size: 12px; color: #5C6670; margin-top: 4px; }
  .title-box { text-align: right; }
  .doc-title { font-size: 24px; font-weight: 700; letter-spacing: 5px; }
  .doc-no { font-size: 12px; color: #5C6670; margin-top: 6px; }
  /* 销售单结款状态条：已结清 / 未结款 + 支付方式 + 最近结款日期 */
  .settle-strip { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 12px; padding: 9px 12px; border-radius: 6px; font-size: 12px; }
  .settle-badge { padding: 2px 10px; border-radius: 10px; font-weight: 700; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  .meta { margin-top: 16px; }
  .meta th, .meta td { border: 1px solid #BFC6D0; padding: 6px 8px; font-size: 12px; text-align: left; }
  .meta th { width: 90px; background: #F7F8FA; color: #5C6670; font-weight: normal; }
  .items { margin-top: 16px; }
  .items th, .items td { border: 1px solid #BFC6D0; padding: 6px 8px; font-size: 12px; text-align: left; }
  .items th { background: #F7F8FA; color: #5C6670; font-weight: normal; }
  .items td.right, .items th.right { text-align: right; }
  .items td.center, .items th.center { text-align: center; }
  .amount-line { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding: 10px 12px; background: #F7F8FA; border: 1px solid #BFC6D0; }
  .upper { font-size: 13px; }
  .total { font-size: 16px; font-weight: 700; color: #1B1F24; }
  .bank { margin-top: 14px; font-size: 12px; color: #5C6670; line-height: 1.8; }
  .remark { margin-top: 10px; font-size: 12px; color: #5C6670; line-height: 1.7; }
  .clauses { margin-top: 18px; font-size: 13px; line-height: 1.9; }
  .clauses p { margin: 0 0 6px; }
  .parties { display: flex; gap: 20px; margin-top: 16px; }
  .party { flex: 1; border: 1px solid #BFC6D0; padding: 10px 12px; font-size: 12px; line-height: 1.8; }
  .party-title { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
  .sign { display: flex; justify-content: space-between; margin-top: 34px; font-size: 12px; }
  .sign-col { width: 32%; }
  .sign-line { margin-top: 30px; }
  .foot { margin-top: 26px; padding-top: 10px; border-top: 1px dashed #BFC6D0; font-size: 11px; color: #8A94A0; }
  .empty-tip { padding: 20px; text-align: center; color: #8A94A0; font-size: 13px; }
  /* ===== 产品购销合同（与范本版式一致） ===== */
  .pc-title { text-align: center; font-size: 23px; font-weight: 700; letter-spacing: 6px; margin: 2px 0 12px; }
  .pc-meta { display: flex; justify-content: space-between; font-size: 13.5px; margin-bottom: 12px; }
  .pc-party { font-size: 14px; font-weight: 700; margin: 4px 0; }
  .pc-h { font-size: 14px; font-weight: 700; margin: 12px 0 4px; }
  .pc-p { font-size: 13px; line-height: 1.9; margin: 2px 0; text-align: justify; }
  .pc .u { display: inline-block; min-width: 70px; padding: 0 6px; border-bottom: 1px solid #1B1F24; text-align: center; }
  .pc .u-name { min-width: 200px; text-align: left; font-weight: 700; }
  .pc .u-wide { min-width: 220px; font-weight: 700; }
  .pc .u-wide2 { min-width: 380px; }
  .pc .u-mid { min-width: 140px; }
  .pc .u-money { min-width: 90px; }
  .pc .u-days { min-width: 40px; }
  .pc-table { margin-top: 6px; }
  .pc-table th, .pc-table td { border: 1px solid #1B1F24; padding: 5px 8px; font-size: 13px; }
  .pc-table th { background: #FFFFFF; color: #1B1F24; font-weight: 700; text-align: center; }
  .pc-table td.right, .pc-table th.right { text-align: right; }
  .pc-table td.center, .pc-table th.center { text-align: center; }
  .pc-endnote { text-align: center; font-size: 13px; margin: 18px 0 8px; }
  .pc-sign-wrap { position: relative; margin-top: 4px; }
  .pc-sign { width: 100%; }
  .pc-sign td { border: none; padding: 6px 8px; font-size: 13.5px; vertical-align: middle; }
  .pc-sign td.sl { width: 108px; white-space: nowrap; }
  .pc-sign td.sv { min-width: 180px; }
  .pc-sign td.bold { font-weight: 700; }
  /* 公章：圆章 40.6mm 盖乙方名称处，方章 33mm 盖乙方授权代表处（与范本一致） */
  .pc-seal-co { position: absolute; width: 40.6mm; height: 40.6mm; right: 96px; top: -16px; opacity: 0.92; }
  .pc-seal-sign { position: absolute; width: 33mm; height: 33.4mm; right: 24px; top: 30px; opacity: 0.92; }
  /* 正文骑缝章：一/五/九条款右侧，40.6mm 圆章 */
  .pc-stamp-anchor { position: relative; }
  .pc-stamp { position: absolute; width: 40.6mm; height: 40.6mm; right: -10mm; opacity: 0.9; }
  /* ===== 施工合同（与范本版式一致） ===== */
  .cc-title { text-align: center; font-size: 23px; font-weight: 700; letter-spacing: 4px; margin: 2px 0 10px; }
  .cc-meta { display: flex; justify-content: space-between; font-size: 13.5px; margin-bottom: 8px; }
  .cc-parties { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; margin: 4px 0; }
  .cc-h { font-size: 14px; font-weight: 700; margin: 10px 0 3px; }
  .cc-p { font-size: 13px; line-height: 1.85; margin: 1px 0; text-align: justify; }
  .cc .u { display: inline-block; min-width: 60px; padding: 0 6px; border-bottom: 1px solid #1B1F24; text-align: center; }
  .cc .u-name { min-width: 180px; text-align: left; }
  .cc .u-name2 { min-width: 130px; }
  .cc .u-wide { min-width: 300px; text-align: left; }
  .cc .u-mid { min-width: 130px; }
  .cc .u-no { min-width: 120px; }
  .cc .u-num { min-width: 44px; }
  .cc .u-money { min-width: 100px; font-weight: 700; }
  .cc .u-cap { min-width: 200px; font-weight: 700; }
  .cc .u-money2 { min-width: 90px; }
  .cc-endnote { text-align: center; font-size: 13px; margin: 10px 0 2px; }
  .cc-sign-wrap { position: relative; margin-top: 8px; }
  .cc-sign { width: 100%; }
  .cc-sign td { border: none; padding: 6px 12px; font-size: 13.5px; line-height: 2.1; vertical-align: top; width: 50%; }
  .cc-sign td p { margin: 0; }
  /* 公章：圆章 40.6mm 盖乙方（承包方）处（与范本一致） */
  .cc-seal { position: absolute; width: 40.6mm; height: 40.6mm; right: 30px; top: -10px; opacity: 0.92; }
  /* 施工合同附页 */
  .cc-attach { page-break-before: always; }
  .cc-attach-title { text-align: center; font-size: 20px; font-weight: 700; margin: 6px 0 16px; }
  .cc-attach-table { margin-top: 4px; }
  .cc-attach-note { margin-top: 14px; font-size: 12px; color: #5C6670; }
  @page { size: A4; margin: 14mm; }
  @media print {
    body { background: #FFFFFF; }
    .toolbar { display: none; }
    .sheet { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
  }
`

const SCRIPT = `
  function doPrint() { window.print(); }
  function doClose() { window.close(); }
  function loadScript(src, cb) {
    var s = document.createElement('script'); s.src = src; s.onload = cb; s.onerror = cb;
    document.head.appendChild(s);
  }
  function doPdf() {
    var btn = event.target; btn.disabled = true; btn.innerText = '生成中...';
    var done = function(){ btn.disabled = false; btn.innerText = '下载 PDF'; };
    var run = function() {
      var sheets = document.querySelectorAll('.sheet');
      if (!sheets.length || !window.html2canvas || !window.jspdf) { done(); return; }
      var pdf = new jspdf.jsPDF('p', 'mm', 'a4');
      var pw = pdf.internal.pageSize.getWidth();
      var ph = pdf.internal.pageSize.getHeight();
      var firstPage = true;
      // 逐 sheet 渲染：合同附页等独立版面各占整页，长版面再按 A4 高度切片
      var chain = Promise.resolve();
      Array.prototype.forEach.call(sheets, function(sheet) {
        chain = chain.then(function() {
          return html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        }).then(function(canvas) {
          var pageCanvasH = Math.floor(canvas.width * ph / pw);
          var totalPages = Math.ceil(canvas.height / pageCanvasH);
          for (var i = 0; i < totalPages; i++) {
            var sliceH = Math.min(pageCanvasH, canvas.height - i * pageCanvasH);
            var c2 = document.createElement('canvas');
            c2.width = canvas.width; c2.height = sliceH;
            var ctx = c2.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c2.width, c2.height);
            ctx.drawImage(canvas, 0, i * pageCanvasH, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
            var hMm = sliceH * pw / canvas.width;
            if (!firstPage) pdf.addPage();
            firstPage = false;
            // 单页且不足一页时垂直居中（保持单据类打印原有行为），满页则顶格输出
            if (totalPages === 1 && hMm < ph) {
              pdf.addImage(c2.toDataURL('image/png'), 'PNG', 0, (ph - hMm) / 2, pw, hMm);
            } else {
              pdf.addImage(c2.toDataURL('image/png'), 'PNG', 0, 0, pw, hMm);
            }
          }
        });
      });
      chain.then(function() {
        pdf.save((document.title || 'contract') + '.pdf');
        done();
      }).catch(function(){ alert('PDF 生成失败，请使用「打印」按钮另存为 PDF'); done(); });
    };
    if (window.html2canvas && window.jspdf) { run(); return; }
    loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', function(){
      loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', run);
    });
  }
`

// 读取合同中保存的公章拖拽位置（fields.sealPos JSON 字符串），无则返回 null
function sealPosOf(c, key) {
  try {
    const pos = JSON.parse((c.fields && c.fields.sealPos) || '')
    const p = pos && pos[key]
    if (p && typeof p.x === 'number' && typeof p.y === 'number') return p
  } catch (e) {}
  return null
}

// 读取合同中额外插入的电子印章（fields.extraSeals JSON 数组：[{url,x,y}]），打印/导出时按拖拽位置渲染
function extraSealsOf(c) {
  try {
    const arr = JSON.parse((c.fields && c.fields.extraSeals) || '')
    if (!Array.isArray(arr)) return []
    return arr.filter((it) => it && typeof it.url === 'string' && it.url.length > 0)
  } catch (e) {}
  return []
}

// 额外印章渲染为页面层绝对定位图片（坐标与编辑页一致，相对 .sheet 左上角；复用 pc-stamp 尺寸样式，w 可覆盖尺寸）
function extraSealsHtml(c) {
  const list = extraSealsOf(c)
  let html = ''
  for (const it of list) {
    const x = Number(it.x) || 0
    const y = Number(it.y) || 0
    const w = Number(it.w) || 0
    const size = w > 0 ? `width:${w}px;height:${w}px;` : ''
    html += `<img class="pc-stamp" style="left:${x}px;top:${y}px;right:auto;${size}" src="${esc(it.url)}"/>`
  }
  return html
}

// 印章尺寸内联样式：saved.w 有效时按保存值输出，否则用默认边长
function sealSizeStyle(sp, defW) {
  const w = sp && Number(sp.w) >= 60 && Number(sp.w) <= 280 ? Math.round(Number(sp.w)) : defW
  return `width:${w}px;height:${w}px;`
}

// 印章是否已被用户在编辑页删除（hidden=true 时打印/导出均不输出）
function sealIsHidden(sp) {
  return !!(sp && sp.hidden === true)
}

function page(title, body) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="toolbar">
    <span class="hint">需要 PDF 时，可点击「下载 PDF」，或在打印窗口的「目标打印机」中选择「另存为 PDF」</span>
    <button onclick="doPdf()">下载 PDF</button>
    <button onclick="doPrint()">打印</button>
    <button class="ghost" onclick="doClose()">关闭</button>
  </div>
  <div class="sheet">
${body}
  </div>
  <script>${SCRIPT}</script>
</body>
</html>`
}

function companyBlock(s) {
  return `<div>
      <div class="co-name">${textOr(s.companyName, '—')}</div>
      <div class="co-line">税号：${textOr(s.taxNo, '—')}</div>
      <div class="co-line">地址：${textOr(s.address, '—')}</div>
      <div class="co-line">电话：${textOr(s.phone, '—')}</div>
    </div>`
}

function signatureBlock(label, owner, date) {
  return `<div class="sign-col">
      <div>${label}（签字 / 盖章）：</div>
      <div class="sign-line">${owner ? esc(owner) : '____________________'}</div>
      <div style="margin-top:8px;">日期：${esc(date)}</div>
    </div>`
}

function docHtml(doc, settings) {
  // 装机单使用专用模板（接近参考图的简洁装机配置单样式）
  if (doc.type === '装机单') {
    return installHtml(doc, settings)
  }
  // 项目报价单使用专用模板（类目分组、配色方案、A4 横向）
  if (doc.type === '项目报价单') {
    return projectQuoteHtml(doc, settings)
  }
  const s = settings || {}
  const items = Array.isArray(doc.items) ? doc.items : []
  // 图片列：任一行有图才显示；折扣列：仅历史单据存在单品折扣（≠100）时才显示，兼容旧数据
  const hasImage = items.some((it) => String(it.image || '').length > 0)
  const hasLineDiscount = items.some((it) => Number(it.discount) !== 100)
  const colCount = 8 + (hasImage ? 1 : 0) + (hasLineDiscount ? 1 : 0)

  let itemRows = ''
  if (items.length === 0) {
    itemRows = '<tr><td colspan="' + colCount + '" class="center empty-tip">该单据没有明细</td></tr>'
  } else {
    itemRows = items
      .map((it, i) => {
        const imgCell = hasImage
          ? '<td class="center">' +
            (String(it.image || '').length > 0
              ? '<img src="' + esc(it.image) + '" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:4px;border:1px solid #E2E6EC;" />'
              : '') +
            '</td>'
          : ''
        const discountCell = hasLineDiscount ? '<td class="right">' + esc(it.discount) + '%</td>' : ''
        return `<tr>
        <td class="center">${i + 1}</td>
        <td>${textOr(it.name, '—')}</td>
        <td>${textOr(it.model, '—')}</td>
        <td>${textOr(it.spec, '—')}</td>
        <td class="center">${textOr(it.unit, '—')}</td>
        <td class="right">${esc(it.qty)}</td>
        <td class="right">${money(it.price)}</td>
        ${discountCell}
        <td class="right">${money(it.amount)}</td>
        ${imgCell}
      </tr>`
      })
      .join('')
  }

  // 整单优惠金额（元）：优惠为 0 时不显示优惠明细；兼容旧单据（discount_amount 已是换算后的金额）
  const discountPercent = Number(doc.discountPercent || 0)
  const discountAmount = Number(doc.discountAmount || 0)
  const hasDiscount = discountAmount > 0 || discountPercent > 0
  const rawAmount = hasDiscount ? Number(doc.rawAmount || doc.amount) : Number(doc.amount)
  // 含税金额：仅当保存时计算过含税（tax_amount > 0）才显示
  const taxAmount = Number(doc.taxAmount || 0)
  const taxRate = Number(doc.taxRate || 0)
  const hasTax = taxAmount > 0

  // 客户信息：联系人 / 电话 / 地址没有内容时整行隐藏，不留空白单元格
  const metaRows = []
  metaRows.push(`<tr>
      <th>客户名称</th><td>${textOr(doc.customerName, '—')}</td>
      <th>单据日期</th><td>${textOr(doc.date, '—')}</td>
    </tr>`)
  const contactText = String(doc.customerContact || '').trim()
  const phoneText = String(doc.customerPhone || '').trim()
  if (contactText.length > 0 || phoneText.length > 0) {
    const contact = [contactText, phoneText].filter((v) => v.length > 0).join(' · ')
    metaRows.push(`<tr>
      <th>联系人</th><td>${esc(contact)}</td>
      <th>单据状态</th><td>${textOr(doc.status, '—')}</td>
    </tr>`)
  } else {
    metaRows.push(`<tr>
      <th>单据状态</th><td colspan="3">${textOr(doc.status, '—')}</td>
    </tr>`)
  }
  const addressText = String(doc.customerAddress || '').trim()
  if (addressText.length > 0) {
    metaRows.push(`<tr>
      <th>客户地址</th><td colspan="3">${esc(addressText)}</td>
    </tr>`)
  }
  metaRows.push(`<tr>
      <th>制单人</th><td colspan="3">${textOr(doc.owner, '—')}</td>
    </tr>`)

  const bank = String(s.bankName || '').length > 0 || String(s.bankAccount || '').length > 0
    ? `收款信息：开户行 ${textOr(s.bankName, '—')}　账号 ${textOr(s.bankAccount, '—')}`
    : '收款信息：未填写'
  const remark = String(doc.remark || '').length > 0
    ? `<div class="remark">备注：${esc(doc.remark)}</div>`
    : ''
  // 报价单专属固定声明（分页友好：紧随备注区，不跨页断裂）
  const quoteNote = doc.type === '报价单'
    ? `<div class="remark" style="page-break-inside:avoid;">本报价7天有效，最终解释权归本公司所有。</div>`
    : ''

  // 金额区：有优惠先显示优惠明细行；含税仅 tax_amount>0 时显示；最后一行始终为合计未税大写
  let amountBlock = ''
  if (hasDiscount) {
    amountBlock += `<div class="amount-line">
    <span class="upper">原始未税金额：¥ ${money(rawAmount)}　整单优惠金额：- ¥ ${money(discountAmount)}</span>
    <span class="total">合计金额未税：¥ ${money(doc.amount)}</span>
  </div>`
  }
  if (hasTax) {
    amountBlock += `
  <div class="amount-line">
    <span class="upper">按 ${money(taxRate)}% 税率计算含税</span>
    <span class="total">合计金额含税：¥ ${money(taxAmount)}</span>
  </div>`
  }
  amountBlock += `
  <div class="amount-line">
    <span class="upper">人民币大写：${amountToChinese(doc.amount)}</span>
    <span class="total">合计：¥ ${money(doc.amount)}</span>
  </div>`

  // 销售单：头部显眼位置标注结款状态、支付方式、最近结款日期
  let settleStrip = ''
  if (doc.type === '销售单') {
    const totalAmt = round2(doc.amount)
    const paidAmt = round2(doc.settledAmount)
    const restAmt = round2(totalAmt - paidAmt)
    let badge = '未结款'
    let color = '#B91C1C'
    let bg = '#FDECEC'
    if (restAmt <= 0 && totalAmt > 0) {
      badge = '已结清'
      color = '#0E7A5F'
      bg = '#E8F6F0'
    } else if (paidAmt > 0) {
      badge = '部分结款'
      color = '#B45309'
      bg = '#FEF3C7'
    }
    const extras = []
    if (String(doc.payMethod || '').length > 0) extras.push('支付方式：' + esc(doc.payMethod))
    if (String(doc.paidAt || '').length > 0) extras.push('结款日期：' + esc(doc.paidAt))
    extras.push('已结 ¥ ' + money(paidAmt) + '　未结 ¥ ' + money(restAmt))
    settleStrip = `<div class="settle-strip" style="background:${bg};border:1px solid ${color}33;">
      <span class="settle-badge" style="color:${color};background:${bg};">${badge}</span>
      <span style="color:${color};">${extras.join('　')}</span>
    </div>`
  }

  const body = `<div class="head">
    ${companyBlock(s)}
    <div class="title-box">
      <div class="doc-title">${textOr(doc.type, '单据')}</div>
      <div class="doc-no">No. ${textOr(doc.docNo, '—')}</div>
    </div>
  </div>
  ${settleStrip}

  <table class="meta">
    ${metaRows.join('\n    ')}
  </table>

  <table class="items">
    <thead>
      <tr>
        <th class="center" style="width:36px;">#</th>
        <th>产品名称</th>
        <th style="width:100px;">型号</th>
        <th style="width:110px;">规格</th>
        <th class="center" style="width:48px;">单位</th>
        <th class="right" style="width:60px;">数量</th>
        <th class="right" style="width:80px;">单价</th>
        ${hasLineDiscount ? '<th class="right" style="width:56px;">折扣</th>' : ''}
        <th class="right" style="width:88px;">金额</th>
        ${hasImage ? '<th class="center" style="width:56px;">图片</th>' : ''}
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  ${amountBlock}

  <div class="bank">${bank}</div>
  ${remark}
  ${quoteNote}

  <div class="sign">
    ${signatureBlock('客户签收', '', doc.date)}
    ${signatureBlock('经办人', doc.owner, doc.date)}
    <div class="sign-col">
      <div>公司盖章：</div>
      <div class="sign-line">____________________</div>
      <div style="margin-top:8px;">${textOr(s.companyName, '')}</div>
    </div>
  </div>

  <div class="foot">${textOr(s.footerNote, '')}</div>`

  return page('单据打印 - ' + String(doc.docNo || ''), body)
}

function purchaseContractHtml(c, settings) {
  const s = settings || {}
  const f = c.fields || {}
  const items = Array.isArray(c.items) ? c.items : []
  const total = round2(items.reduce((sum, it) => sum + (Number(it.total) || 0), 0))
  const capital = f.capitalAmount || amountToChinese(total || c.amount)
  const sealCo = c.sealCompany || s.sealCompany || ''
  const sealSign = c.sealSign || s.sealSign || ''
  // 已拖拽保存的公章位置：有保存值时改在页面层绝对定位渲染，无则保持范本原位
  const spStamp1 = sealPosOf(c, 'stamp1')
  const spStamp5 = sealPosOf(c, 'stamp5')
  const spStamp9 = sealPosOf(c, 'stamp9')
  const spCo = sealPosOf(c, 'co')
  const spSign = sealPosOf(c, 'sign')
  const title = c.title || f.title || '产品购销合同'
  // 乙方信息：合同字段优先，其次基础设置
  const B = [
    f.partyBName || s.contractCompanyName || '',
    f.partyBRepresentative || s.contractRepresentative || '',
    f.partyBAddress || s.contractAddress || '',
    f.partyBPhone || s.contractCompanyPhone || '',
    f.partyBBank || s.contractBankName || '',
    f.partyBBankAccount || s.contractBankAccount || '',
    f.partyBTaxNo || s.contractTaxNo || ''
  ]
  const A = [
    f.partyASignName || c.customerName || f.partyAName || '',
    f.partyARepresentative || '',
    f.partyAAddress || '',
    f.partyAPhone || c.customerPhone || '',
    f.partyABank || '',
    f.partyABankAccount || '',
    f.partyATaxNo || ''
  ]
  const aName = c.customerName || f.partyAName || ''

  let rows = ''
  for (const it of items) {
    if (!String(it.name || '').trim() && !it.price && !it.qty) continue
    rows += `<tr>
      <td>${esc(it.name || '')}</td>
      <td class="right">${it.price == null ? '' : money(it.price)}</td>
      <td class="center">${esc(it.qty == null ? '' : it.qty)}</td>
      <td class="right">${it.total == null ? '' : money(it.total)}</td>
    </tr>`
  }
  rows += `<tr style="font-weight:700;">
    <td colspan="3" class="center">总计</td><td class="right">${money(total)}</td>
  </tr>`

  const signLabels = ['甲方：', '授权代表 (签字)', '地   址', '电    话', '开户银行', '账   号', '税   号 ']
  const signLabelsB = ['乙方：', '授权代表 (签字)', '地  址', '电 话', '开户银行', '账  号', '税  号']
  let signRows = ''
  for (let i = 0; i < 7; i++) {
    signRows += `<tr>
      <td class="sl">${signLabels[i]}</td><td class="sv${i === 0 ? ' bold' : ''}">${esc(A[i])}</td>
      <td class="sl">${signLabelsB[i]}</td><td class="sv${i === 0 ? ' bold' : ''}">${esc(B[i])}</td>
    </tr>`
  }

  const body = `<div class="pc" style="position:relative;">
    <h1 class="pc-title">${esc(title)}</h1>
    <div class="pc-meta">
      <span>合同编号：<span class="u">${esc(c.contractNo || f.contractNo || '')}</span></span>
      <span>签订日期：<span class="u">${esc(c.signDate || f.signDate || '')}</span></span>
    </div>
    <p class="pc-party">甲方(买方):<span class="u u-name">${esc(aName)}</span></p>
    <p class="pc-party">乙方(卖方):<span class="u u-name">${esc(B[0])}</span></p>

    <p class="pc-p">甲乙双方因产品购销事宜经友好协商，本着平等互利的原则，根据《中华人民共和国民法典》等有关法律、法规，自愿签订本合同并共同遵守。</p>

    <div class="pc-stamp-anchor">
      <p class="pc-h">一 、 合同标的：</p>
      <p class="pc-p">甲方同意作为买方向乙方购买，乙方同意作为卖方向甲方提供甲方所需的产品。同时，乙方应就甲方提供的产品清单进行配置检查，以保证甲方所购设备的准确性、完整性，并能满足甲方的技术要求。</p>
      ${sealCo && !spStamp1 ? `<img class="pc-stamp" style="top:10mm;" src="${esc(sealCo)}"/>` : ''}
    </div>
    <table class="pc-table">
      <thead><tr><th>商品名称</th><th class="right" style="width:88px;">单价</th><th class="center" style="width:64px;">数量</th><th class="right" style="width:96px;">总价</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <p class="pc-h">二 、 合同金额：</p>
    <p class="pc-p">本合同金额：<span class="u u-wide">${esc(capital)}</span>(小写：<span class="u u-money">${money(total || c.amount)}</span> 元)。</p>

    <p class="pc-h">三 、 付款方式：</p>
    <p class="pc-p">乙方于甲方付款前提供 13% 增值税普通发票（非成品油类型），双方约定按如下方式进行付款结算。订单完成后 <span class="u u-days">${esc(f.payDays || '')}</span> 个工作日内，甲方支付对应款项。</p>

    <p class="pc-h">四 、 交货日期：</p>
    <p class="pc-p">交货期限：约定不晚于下单后 <span class="u u-days">${esc(f.deliveryDays || '')}</span> 日完成产品到指定地点的交付。</p>
    <p class="pc-p">交货方式：货到现场，乙方发货时请在产品包装内附上发货单，需提供发货单和产品在一起的照片图，根据客户要求提供对应的产品合格证、检测报告等资料，客户签收后需向甲方回传带有客户签字的发货单照片，以配合京东平台完成订单验收。</p>

    <div class="pc-stamp-anchor">
      <p class="pc-h">五 、 交货地点及产品验收：</p>
      <p class="pc-p">交货地址：<span class="u u-wide2">${esc(f.deliveryAddress || '')}</span>；</p>
      <p class="pc-p">收货联系人：<span class="u u-mid">${esc(f.receiverName || '')}</span>， 移动电话：<span class="u u-mid">${esc(f.receiverPhone || '')}</span>。</p>
      ${sealCo && !spStamp5 ? `<img class="pc-stamp" style="top:24mm;" src="${esc(sealCo)}"/>` : ''}
    </div>
    <p class="pc-p">乙方保证订货是由原厂商供应、全新、未曾用过(卖方声明的除外),并完全符合本合同规定的质 量、规格和性能。因乙方产品达不到验收标准所需各项费用均应由乙方承担。</p>
    <p class="pc-p">产品符合国家最新标准，以国标和行业、企业最新最高标准为准，符合合同附件《产品质量服务手册》约定，实行三包政策；三无产品，如果有需要，不影响二次销售的情况下乙方应当予以退货，退货费用由乙方承担，不合格产品、残次品 及未能完成客户验收通过产生的退货费用由供应商承担。</p>
    <p class="pc-p">加工定制产品，供应商应按照约定或者图纸加工生产，收货后不能满足采购方需求的，供应商应 予以返修，返修后仍然满足不了客户要求的，供应商应当予以退货，退货方式由双方协商确定。</p>
    <p class="pc-p">卖方选择适合的运输方式(汽运或物流等)送达买方指定地点，运输费用、运输途中一切安全责任及在途风险，均由卖方承担。无论采取任何形式包装，必须满足运输和保存需求，保证到货产品质量，包装费用由卖方承担，包装物不另计费，不回收。</p>
    <p class="pc-p">卖方保证所供产品为该品牌厂家原厂正品，满足买方使用要求，最终以实际到货数量结算。</p>

    <p class="pc-h">六 、 违约责任</p>
    <p class="pc-p">如乙方延期交货达5天或者提供产品存在假冒伪劣等质量问题，甲方有权中止合同，并且产生的违约责任等损失由乙方承担。如因乙方原因造成导致甲方向甲方销售渠道所属平台追究责任的，乙方应承担全部责任。</p>
    <p class="pc-p">本协议项下损失包括但不限于甲方因乙方行为对平台方、政府等第三方承担的罚款/扣款、以及对购买产品的消费者的额外补偿、赔偿，以及因实现权利支出的律师费、诉讼费、差旅费等全部费用。</p>

    <p class="pc-h">七、保修及售后服务</p>
    <p class="pc-p">产品质保期不低于1年，所有设备按厂家保修条例提供保修服务及技术支持。乙方有责任协助甲方解决相应技术问题，保修期外的技术支持及维修服务由甲、乙双方友好协商解决。</p>
    <p class="pc-p">如果乙方提供产品有质量问题，需乙方进行现场服务的，乙方应免费提供现场服务，并符合合同附件《产品质量服务手册》。</p>

    <p class="pc-h">八 、 保密条款</p>
    <p class="pc-p">双方须对协议签订、履行过程中获悉的对方所有商业信息、资料承担保密职责。未经对方书面同意， 一方不得以履 行本协议以外的目的使用信息，若违反本条约定给对方造成损失的一方应承担全部赔偿责任。</p>

    <div class="pc-stamp-anchor">
      <p class="pc-h">九、其它</p>
      <p class="pc-p">解决合同纠纷的方式：因履行本合同发生争议，由甲乙双方友好协商解决，若协商不成，提交甲方所在地法院提起诉讼。</p>
      <p class="pc-p">本合同经甲乙双方法定代表人或委托代理人签字并加盖双方单位公章或合同专用章之日起生效，合同执行期内，甲乙双方均不得随意变更或解除本合同。本合同附件与本合同具有同等法律效力。</p>
      <p class="pc-p">本合同附件系本合同组成部分，与本合同具有同等效力，如有其他未尽事宜，可经甲乙双方共同协商，进行书面补充约定，补充规定与本合同具有同等法律效力。</p>
      <p class="pc-p">本合同正本一式贰份，甲方执壹份，乙方执壹份，复印件扫描件具备同等法律效益。</p>
      ${sealCo && !spStamp9 ? `<img class="pc-stamp" style="top:26mm;" src="${esc(sealCo)}"/>` : ''}
    </div>

    <p class="pc-h">十 、签收及妥投：</p>
    <p class="pc-p">根据京东平台妥投和支付要求，妥投需要提供完整的签收妥投资料，随货发送对应的到货清单，具 体清单以附件形式随本合同发出，乙方需提供完整的签收资料才可具备妥投后付款条件，如因到货资料 问题导致的平台罚款需要乙方承担相关责任。</p>

    <p class="pc-endnote">（以下无正文，为合同签署页）</p>

    <div class="pc-sign-wrap">
      <table class="pc-sign">
        <tbody>${signRows}</tbody>
      </table>
      ${sealCo && !spCo ? `<img class="pc-seal-co" src="${esc(sealCo)}"/>` : ''}
      ${sealSign && !spSign ? `<img class="pc-seal-sign" src="${esc(sealSign)}"/>` : ''}
    </div>
  </div>`
  // 拖拽保存的公章/法人章：页面层绝对定位（坐标与编辑页一致，相对 .sheet 左上角）；hidden=true 不输出，w 覆盖尺寸
  let dragSeals = ''
  if (sealCo && spStamp1 && !sealIsHidden(spStamp1)) dragSeals += `<img class="pc-stamp" style="left:${spStamp1.x}px;top:${spStamp1.y}px;right:auto;${sealSizeStyle(spStamp1, 153)}" src="${esc(sealCo)}"/>`
  if (sealCo && spStamp5 && !sealIsHidden(spStamp5)) dragSeals += `<img class="pc-stamp" style="left:${spStamp5.x}px;top:${spStamp5.y}px;right:auto;${sealSizeStyle(spStamp5, 153)}" src="${esc(sealCo)}"/>`
  if (sealCo && spStamp9 && !sealIsHidden(spStamp9)) dragSeals += `<img class="pc-stamp" style="left:${spStamp9.x}px;top:${spStamp9.y}px;right:auto;${sealSizeStyle(spStamp9, 153)}" src="${esc(sealCo)}"/>`
  if (sealCo && spCo && !sealIsHidden(spCo)) dragSeals += `<img class="pc-seal-co" style="left:${spCo.x}px;top:${spCo.y}px;right:auto;${sealSizeStyle(spCo, 153)}" src="${esc(sealCo)}"/>`
  if (sealSign && spSign && !sealIsHidden(spSign)) dragSeals += `<img class="pc-seal-sign" style="left:${spSign.x}px;top:${spSign.y}px;right:auto;${sealSizeStyle(spSign, 125)}" src="${esc(sealSign)}"/>`
  dragSeals += extraSealsHtml(c)
  return page('产品购销合同 - ' + String(c.contractNo || ''), body + dragSeals)
}

function constructionContractHtml(c, settings) {
  const s = settings || {}
  const f = c.fields || {}
  const amount = Number(c.amount || 0)
  const capital = String(f.capitalAmount || '').trim() || amountToChinese(amount)
  // 乙方信息：合同保存值优先，回落基础设置
  const partyBName = String(f.partyBName || s.contractCompanyName || '').trim()
  const partyBRep = String(f.partyBRepresentative || s.contractRepresentative || '').trim()
  const partyBPhone = String(f.partyBPhone || s.contractCompanyPhone || '').trim()
  // 公章：合同快照优先
  const sealCo = c.sealCompany || s.sealCompany || ''
  // 已拖拽保存的公章位置：有保存值时改在页面层绝对定位渲染，无则保持范本原位
  const spMain = sealPosOf(c, 'main')
  const mode = f.contractMode || '包工包料'
  const priceType = f.priceType || '固定总价'
  const modeBox = (m) => (m === mode ? '■' : '□') + m
  const sd = String(c.signDate || f.signDate || '').split(/[-/]/)
  const sy = sd[0] || '', sm = sd[1] || '', sd2 = sd[2] || ''
  const kd = String(f.startDate || '').split(/[-/]/)
  const jd = String(f.endDate || '').split(/[-/]/)
  const u = (v, cls) => `<span class="u ${cls || ''}">${esc(v || '')}</span>`
  const un = (v) => `<span class="u u-num">${esc(v || '')}</span>`

  const body = `<div class="cc">
    <h1 class="cc-title">${esc(c.title || f.title || '施工合同')}</h1>
    <div class="cc-meta">
      <span>签订日期：${un(sy)} 年 ${un(sm)} 月 ${un(sd2)} 日</span>
      <span>合同编号：<span class="u u-no">${esc(c.contractNo || f.contractNo || '')}</span></span>
    </div>
    <div class="cc-parties">
      <span>甲方（发包方）：${u(c.customerName || f.partyAName || '', 'u-name')}</span>
      <span>乙方（承包方）：${u(partyBName, 'u-name')}</span>
    </div>
    <div class="cc-parties">
      <span>联系电话：${u(f.partyAPhone || c.customerPhone || '', 'u-mid')}</span>
      <span>联系电话：${u(partyBPhone, 'u-mid')}</span>
    </div>

    <p class="cc-p">依据《中华人民共和国民法典》《建设工程安全生产管理条例》等相关法律法规，甲乙双方本着平等自愿、公平诚信、权责统一的原则，就甲方弱电工程施工事宜达成一致，签订本合同，双方共同遵照执行。</p>

    <p class="cc-h">一、工程概况</p>
    <p class="cc-p">1. 工程名称：${u(f.projectName, 'u-wide')}</p>
    <p class="cc-p">2. 工程地点：${u(f.projectLocation, 'u-wide')}</p>
    <p class="cc-p">3. 工程内容：${u(f.projectContent, 'u-wide')}</p>
    <p class="cc-p">4. 承包方式：${modeBox('包工包料')}  ${modeBox('包工不包料')}  ${modeBox('包工部分包料')}</p>

    <p class="cc-h">二、合同工期</p>
    <p class="cc-p">1. 开工日期：${un(kd[0] || '')} 年 ${un(kd[1] || '')} 月 ${un(kd[2] || '')} 日</p>
    <p class="cc-p">2. 预计竣工日期：${un(jd[0] || '')} 年 ${un(jd[1] || '')} 月 ${un(jd[2] || '')} 日</p>
    <p class="cc-p">3. 总工期：${un(f.totalDays || '8')}日历天。因甲方原因、不可抗力或第三方因素导致工期延误的，工期顺延；因乙方施工不力造成工期延误的，由乙方承担违约责任。</p>

    <p class="cc-h">三、工程质量标准</p>
    <p class="cc-p">1. 本工程质量严格按照国家、行业现行弱电工程施工规范、验收标准及甲方要求施工，确保工程合格，一次性验收通过率100%。</p>
    <p class="cc-p">2. 所有进场设备、材料必须符合合同约定及国家标准，无假冒伪劣、三无产品，设备资料、合格证齐全。</p>
    <p class="cc-p">3. 工程质保期：自整体竣工验收合格之日起 ${un(f.warrantyDays || '365')} 天，质保期内乙方免费提供维修、调试、故障处理服务。人为损坏、不可抗力、甲方私自改装造成的损坏除外。</p>

    <p class="cc-h">四、合同价款及支付方式</p>
    <p class="cc-p">1. 合同总价款：人民币 ${u(amount.toFixed(2), 'u-money')} 元（大写：${u(capital, 'u-cap')} 元整）本价格为 ${priceType === '固定总价' ? '■' : '□'}固定总价 / ${priceType === '可调价' ? '■' : '□'}可调价</p>
    <p class="cc-p">包含材料、人工、施工、调试、辅料、简易售后等全部费用（无特殊增项不再另行计费）。</p>
    <p class="cc-p">2. 付款方式（双方协商选定）：</p>
    <p class="cc-p">（1）预付款：合同签订后 ${un(f.prepayDays)} 日内，甲方支付合同总价 ${un(f.prepayPercent)} %，即 ${u(f.prepayAmount, 'u-money2')} 元；</p>
    <p class="cc-p">（2）进度款：工程施工完成 ${un(f.progressCompletePercent || f.progressPercent)} %后，甲方支付合同总价 ${un(f.progressPercent)} %，即 ${u(f.progressAmount, 'u-money2')} 元；</p>
    <p class="cc-p">（3）竣工款：工程竣工验收合格后 ${un(f.finalDays)} 内，甲方支付至结算总价的 ${un(f.finalPercent)} %；即 ${u(f.finalAmount, 'u-money2')} 元；</p>
    <p class="cc-p">3. 工程增、减项需双方书面确认，价款另行结算，口头变更无效。</p>

    <p class="cc-h">五、双方责任</p>
    <p class="cc-p">（一）甲方责任</p>
    <p class="cc-p">1. 开工前清理施工现场，提供施工所需场地、水电基础条件，协调现场施工关系；</p>
    <p class="cc-p">2. 及时确认施工方案、图纸及变更内容，按合同约定按时支付工程款；</p>
    <p class="cc-p">3. 委派专人负责现场对接、验收、签证工作，及时处理施工中的相关问题；</p>
    <p class="cc-p">4. 配合乙方完成工程竣工验收相关工作。</p>
    <p class="cc-p">（二）乙方责任</p>
    <p class="cc-p">1. 严格按照施工规范、图纸及合同要求施工，保证工程质量和施工进度；</p>
    <p class="cc-p">2. 严格遵守安全施工规范，做好现场安全防护，施工期间发生的人员伤亡、设备损坏、安全事故等一切责任及费用由乙方自行承担；</p>
    <p class="cc-p">3. 负责设备安装、调试、试运行工作，完工后及时提交竣工资料，配合甲方验收；</p>
    <p class="cc-p">4. 施工过程中爱护现场设施，不得损坏原有建筑及设备，造成损坏的由乙方负责赔偿；</p>
    <p class="cc-p">5. 质保期内按约定提供售后维修服务，及时响应甲方故障报修。</p>

    <p class="cc-h">六、工程验收</p>
    <p class="cc-p">1. 乙方施工完成后，自行自检合格，向甲方提交竣工验收申请及相关竣工资料；</p>
    <p class="cc-p">2. 甲方收到验收申请后 ${un(f.acceptanceDays)} 日内组织验收，验收合格的，双方签署竣工验收单；</p>
    <p class="cc-p">3. 甲方逾期未组织验收或已投入实际使用的，视为工程验收合格。</p>

    <p class="cc-h">七、违约责任</p>
    <p class="cc-p">1. 甲方逾期付款的，每逾期一日，按应付未付款项的万分之三向乙方支付违约金；逾期超过 ${un(f.overdueDays)} 日的，乙方有权拆除设施。</p>
    <p class="cc-p">2. 因乙方施工质量不合格、材料不符约定导致工程返工、整改的，乙方承担全部费用，且赔偿甲方相应经济损失。</p>

    <p class="cc-h">八、不可抗力</p>
    <p class="cc-p">因地震、台风、暴雨、洪水等不可抗力因素导致本合同无法履行或工期延误的，双方互不承担违约责任，应及时沟通，协商顺延工期或终止合同。</p>

    <p class="cc-h">九、争议解决</p>
    <p class="cc-p">本合同履行过程中发生争议，双方优先友好协商解决；协商不成的，任何一方均有权向工程所在地人民法院提起诉讼。</p>

    <p class="cc-h">十、其他约定</p>
    <p class="cc-p">1. 本合同未尽事宜，双方可签订补充协议，补充协议与本合同具有同等法律效力。</p>
    <p class="cc-p">2. 施工图纸、报价清单、设备清单为本合同附件，与本合同一致有效。</p>
    <p class="cc-p">3. 本合同一式贰份，甲乙双方各执壹份，自双方签字盖章之日起生效，质保期满、款项结清后自动失效。</p>

    <p class="cc-endnote">（以下无正文）</p>
    <p class="cc-endnote">双方签字盖章</p>

    <div class="cc-sign-wrap">
      <table class="cc-sign">
        <tr>
          <td>
            <p>甲方（发包方）：（盖章）${u(f.partyASignName || c.customerName || f.partyAName || '', 'u-name2')}</p>
            <p>法定代表人/授权代表（签字）：${u(f.partyARepresentative || '', 'u-name2')}</p>
            <p>日期：${un(sy)} 年 ${un(sm)} 月 ${un(sd2)} 日</p>
          </td>
          <td>
            <p>乙方（承包方）：（盖章）${esc(partyBName)}</p>
            <p>法定代表人/授权代表（签字）：${esc(partyBRep)}</p>
            <p>日期：&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;年&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;月&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;日</p>
          </td>
        </tr>
      </table>
      ${sealCo && !spMain ? `<img src="${esc(sealCo)}" class="cc-seal" alt=""/>` : ''}
    </div>
  </div>`

  // 拖拽保存的公章：页面层绝对定位（坐标与编辑页一致，相对 .sheet 左上角）；hidden=true 不输出，w 覆盖尺寸
  const dragSeal = (sealCo && spMain && !sealIsHidden(spMain)) ? `<img src="${esc(sealCo)}" class="cc-seal" style="left:${spMain.x}px;top:${spMain.y}px;right:auto;${sealSizeStyle(spMain, 153)}" alt=""/>` : ''
  // 额外插入的电子印章同样按拖拽位置输出
  const extraSealImgs = extraSealsHtml(c)

  // 附页：调取单据有明细行时生成第二页产品/设备清单
  const items = (c.items || []).filter(it => it && String(it.name || '').trim().length > 0)
  let attachment = ''
  if (items.length > 0) {
    let rows = ''
    items.forEach((it, i) => {
      rows += `<tr><td class="center">${i + 1}</td><td>${esc(it.name)}</td><td class="right">${it.price == null || it.price === '' ? '' : money(it.price)}</td><td class="center">${esc(String(it.qty == null ? '' : it.qty))}</td><td class="right">${it.total == null || it.total === '' ? '' : money(it.total)}</td></tr>`
    })
    const grand = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0)
    rows += `<tr><td colspan="4" class="center bold">合计</td><td class="right bold">${grand.toFixed(2)}</td></tr>`
    attachment = `</div><div class="sheet cc-attach">
      <h2 class="cc-attach-title">附页：产品/设备清单</h2>
      <table class="pc-table cc-attach-table">
        <thead><tr><th style="width:46px;">序号</th><th>产品名称</th><th style="width:110px;">单价</th><th style="width:70px;">数量</th><th style="width:120px;">总价</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="cc-attach-note">本清单为 ${esc(c.contractNo || '')} 合同附件，与合同具有同等法律效力。</div>
    `
  }

  return page('施工合同 - ' + String(c.contractNo || ''), body + dragSeal + extraSealImgs + attachment)
}

function contractHtml(contract, settings) {
  const c = contract || {}
  if (c.type === 'purchase') return purchaseContractHtml(c, settings)
  if (c.type === 'construction') return constructionContractHtml(c, settings)
  return legacyContractHtml(c, settings)
}

function legacyContractHtml(contract, settings) {
  const s = settings || {}
  const c = contract || {}
  const contact = [c.customerContact, c.customerPhone].filter((v) => String(v || '').length > 0).join(' · ')
  const related = String(c.docNo || '').length > 0 ? esc(c.docNo) : '无关联单据'
  const remark = String(c.remark || '').length > 0 ? esc(c.remark) : '无'
  const bank = String(s.bankName || '').length > 0 || String(s.bankAccount || '').length > 0
    ? `收款账户：${textOr(s.bankName, '—')}　${textOr(s.bankAccount, '—')}`
    : '收款账户：未填写'

  const body = `<div class="head">
    ${companyBlock(s)}
    <div class="title-box">
      <div class="doc-title">销售合同</div>
      <div class="doc-no">合同编号：${textOr(c.contractNo, '—')}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-title">甲方（供方）</div>
      <div>${textOr(s.companyName, '—')}</div>
      <div>地址：${textOr(s.address, '—')}</div>
      <div>电话：${textOr(s.phone, '—')}</div>
    </div>
    <div class="party">
      <div class="party-title">乙方（需方）</div>
      <div>${textOr(c.customerName, '—')}</div>
      <div>联系人：${textOr(contact, '—')}</div>
    </div>
  </div>

  <table class="meta">
    <tr>
      <th>合同金额</th><td>¥ ${money(c.amount)}</td>
      <th>签订日期</th><td>${textOr(c.signDate, '—')}</td>
    </tr>
    <tr>
      <th>合同状态</th><td>${textOr(c.status, '—')}</td>
      <th>负责人</th><td>${textOr(c.owner, '—')}</td>
    </tr>
    <tr>
      <th>关联单据</th><td colspan="3">${related}</td>
    </tr>
  </table>

  <div class="clauses">
    <p>一、合同金额：人民币 ¥ ${money(c.amount)}（大写：${amountToChinese(c.amount)}）。</p>
    <p>二、付款方式：按双方约定执行；如需分期付款，以双方书面确认为准。</p>
    <p>三、交付与验收：按关联单据${related === '无关联单据' ? '' : '（' + related + '）'}约定的产品、数量、时间与地点执行。</p>
    <p>四、其他约定：${remark}。</p>
    <p>五、本合同自双方签字盖章之日起生效，一式两份，甲乙双方各执一份，具有同等法律效力。</p>
  </div>

  <div class="bank">${bank}</div>

  <div class="sign">
    ${signatureBlock('甲方（盖章）', s.companyName, c.signDate)}
    ${signatureBlock('乙方（盖章）', c.customerName, c.signDate)}
    <div class="sign-col">
      <div>负责人：</div>
      <div class="sign-line">${textOr(c.owner, '____________________')}</div>
      <div style="margin-top:8px;">签订日期：${textOr(c.signDate, '—')}</div>
    </div>
  </div>

  <div class="foot">${textOr(s.footerNote, '')}</div>`

  return page('合同打印 - ' + String(c.contractNo || ''), body)
}

// ---------- 装机单打印（参考图片风格：白色背景、红色分隔线、橙红表头、圆角标签） ----------
// 装机单 15 套主题配色（与前端一致）：brand 主色 / deep 深色 / soft 浅底 / line 浅线
const INSTALL_PRINT_THEMES = {
  orange: { brand: '#f97316', deep: '#c2410c', soft: '#fff1e6', line: '#fadbc2' },
  blue: { brand: '#2563eb', deep: '#1e40af', soft: '#eef4ff', line: '#d7e3fc' },
  green: { brand: '#16a34a', deep: '#166534', soft: '#ecfdf3', line: '#c9f0d6' },
  purple: { brand: '#7c3aed', deep: '#5b21b6', soft: '#f3eefe', line: '#e0d2fb' },
  red: { brand: '#e11d48', deep: '#9f1239', soft: '#fff1f2', line: '#fecdd3' },
  teal: { brand: '#0d9488', deep: '#0f766e', soft: '#f0fdfa', line: '#99f6e4' },
  amber: { brand: '#d97706', deep: '#b45309', soft: '#fffbeb', line: '#fde68a' },
  pink: { brand: '#db2777', deep: '#be185d', soft: '#fdf2f8', line: '#fbcfe8' },
  indigo: { brand: '#4f46e5', deep: '#4338ca', soft: '#eef2ff', line: '#c7d2fe' },
  brown: { brand: '#92400e', deep: '#78350f', soft: '#fef3c7', line: '#e7d3b3' },
  sunset: { brand: '#f43f5e', deep: '#be123c', soft: '#fff1f2', line: '#fecdd3' },
  ocean: { brand: '#0284c7', deep: '#075985', soft: '#f0f9ff', line: '#bae6fd' },
  forest: { brand: '#059669', deep: '#065f46', soft: '#ecfdf5', line: '#a7f3d0' },
  grape: { brand: '#9333ea', deep: '#6b21a8', soft: '#faf5ff', line: '#e9d5ff' },
  aurora: { brand: '#6366f1', deep: '#4338ca', soft: '#eef2ff', line: '#c7d2fe' }
}

// 装机单配件图标（与前端 ICONS 一致的 SVG 路径），打印时以 data URI 内联
const INSTALL_PRINT_ICONS = {
  cpu: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="10.5" y="10.5" width="3" height="3"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  mobo: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><rect x="7" y="8" width="6" height="5" rx="0.8"/><circle cx="16" cy="9.5" r="1.2"/><circle cx="16" cy="13" r="1.2"/><path d="M7 16h7"/>',
  fan: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 4.8c2.3 1.3 3.3 2.9 3.3 5.2M19.2 12c-1.3 2.3-2.9 3.3-5.2 3.3M12 19.2c-2.3-1.3-3.3-2.9-3.3-5.2M4.8 12c1.3-2.3 2.9-3.3 5.2-3.3"/>',
  ram: '<rect x="7" y="4" width="10" height="16" rx="1"/><path d="M9.5 8h5M9.5 12h5M9.5 16h3"/>',
  ssd: '<rect x="4" y="8" width="16" height="8" rx="1.2"/><path d="M8 12h5"/>',
  gpu: '<rect x="3" y="9" width="18" height="7" rx="1.2"/><circle cx="8" cy="12.5" r="2"/><path d="M14 11h3M14 14h3"/>',
  psu: '<rect x="5" y="7" width="14" height="11" rx="1.2"/><path d="M12 9.5l-2.5 4h3l-2 3"/>',
  case: '<rect x="8" y="3" width="8" height="18" rx="1.5"/><circle cx="12" cy="8" r="1.2"/><path d="M10 13h4M10 16h4"/>',
  monitor: '<rect x="3" y="5" width="18" height="11" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  keyboard: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M6 11h2M10 11h2M14 11h2M18 11h.5M6 13.5h12"/>',
  mouse: '<rect x="8" y="4" width="8" height="16" rx="4"/><path d="M12 4v5"/>',
  headset: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/>',
  box: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M9 12h6"/>'
}

function installIconDataUri(key, color) {
  const body = INSTALL_PRINT_ICONS[key]
  if (!body) return ''
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>'
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

function installHtml(doc, settings) {
  const s = settings || {}
  const items = Array.isArray(doc.items) ? doc.items : []

  // 主题配色（无记录时默认 orange）
  const theme = INSTALL_PRINT_THEMES[String(doc.theme || '')] || INSTALL_PRINT_THEMES.orange

  // 公司信息：优先用单据快照，没有则用全局设置
  const coName = String(doc.companyName || s.companyName || '').trim()
  const coPhone = String(doc.companyPhone || s.phone || '').trim()
  const coAddress = String(doc.companyAddress || s.address || '').trim()
  const coLogo = String(doc.companyLogo || '').trim()

  const date = String(doc.date || '').trim()
  const billNo = String(doc.billNo || '').trim()
  const title = String(doc.title || '').trim()
  const customerName = String(doc.customerName || '').trim()
  const customerPhone = String(doc.customerPhone || '').trim()
  const remark = String(doc.remark || '').trim()
  const qrcode = String(doc.qrcode || '').trim()
  const taxInput = String(doc.taxInput || '').trim()
  const discountAmount = round2(Number(doc.discountAmount) || 0)

  // 服务项解析（JSON 数组字符串）
  let services = []
  try {
    const sv = String(doc.services || '').trim()
    if (sv) services = JSON.parse(sv)
  } catch (e) { services = [] }
  if (!Array.isArray(services)) services = []
  services = services.filter((x) => String(x || '').trim().length > 0)

  // 标签解析
  let tags = []
  try {
    const t = String(doc.tags || '').trim()
    if (t) tags = JSON.parse(t)
  } catch (e) { tags = [] }
  if (!Array.isArray(tags)) tags = []
  tags = tags.filter((t) => t && String(t.text || '').trim().length > 0)

  // 有效配件行（名称非空）
  const validItems = items.filter((it) => String(it.name || '').trim().length > 0)
  const totalAmount = round2(validItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0))

  // 公司信息块
  let coBlock = ''
  if (coName || coPhone || coAddress) {
    const logoHtml = coLogo
      ? '<img src="' + esc(coLogo) + '" alt="" style="width:42px;height:42px;border-radius:8px;margin-right:10px;vertical-align:middle;" />'
      : ''
    let coLines = ''
    if (coName) coLines += '<div style="font-size:15px;font-weight:700;">' + esc(coName) + '</div>'
    if (coPhone) coLines += '<div style="font-size:11px;color:#5C6670;margin-top:2px;">电话：' + esc(coPhone) + '</div>'
    if (coAddress) coLines += '<div style="font-size:11px;color:#5C6670;margin-top:1px;">地址：' + esc(coAddress) + '</div>'
    coBlock = '<div style="display:flex;align-items:center;">' + logoHtml + '<div>' + coLines + '</div></div>'
  }

  // 日期 + 单据编号
  const dateHtml = (billNo || date)
    ? '<div style="font-size:12px;color:#5C6670;text-align:right;">' +
      (billNo ? '<div>编号：<b style="color:#1B1F24;">' + esc(billNo) + '</b></div>' : '') +
      (date ? '<div style="margin-top:2px;">日期：' + esc(date) + '</div>' : '') +
      '</div>'
    : ''

  // 标题
  const titleHtml = title
    ? '<div style="text-align:center;margin:18px 0 6px;font-size:22px;font-weight:700;letter-spacing:2px;">' + esc(title) + '</div>'
    : ''

  // 标签
  let tagsHtml = ''
  if (tags.length > 0) {
    const pills = tags.map((t) => {
      const color = String(t.color || '#F59E0B')
      return '<span style="display:inline-block;padding:3px 12px;margin:3px 4px;border-radius:12px;font-size:11px;color:#FFFFFF;background:' + esc(color) + ';">' + esc(t.text) + '</span>'
    }).join('')
    tagsHtml = '<div style="text-align:center;margin:4px 0 14px;">' + pills + '</div>'
  }

  // 客户信息
  let custHtml = ''
  const custRows = []
  if (customerName) custRows.push('<span style="font-weight:600;">客户：' + esc(customerName) + '</span>')
  if (customerPhone) custRows.push('<span>联系电话：' + esc(customerPhone) + '</span>')
  if (custRows.length > 0) {
    custHtml = '<div style="margin:8px 0;font-size:12px;color:#1B1F24;">' + custRows.join('　') + '</div>'
  }

  // 配件表格（行首图标 + 主题色表头）
  let tableHtml = ''
  if (validItems.length > 0) {
    const rows = validItems.map((it, i) => {
      const rowBg = i % 2 === 1 ? '#f8fafc' : '#ffffff'
      const iconUri = installIconDataUri(String(it.icon || ''), theme.deep)
      const iconHtml = iconUri
        ? '<img src="' + iconUri + '" alt="" style="width:15px;height:15px;margin-right:5px;vertical-align:-2px;" />'
        : ''
      return `<tr style="background:${rowBg};">
      <td style="padding:5px 8px;font-size:12px;border:1px solid #e5e7eb;">${iconHtml}${esc(it.name)}</td>
      <td style="padding:5px 8px;font-size:12px;border:1px solid #e5e7eb;">${textOr(it.model, '')}</td>
      <td style="padding:5px 8px;font-size:12px;border:1px solid #e5e7eb;">${textOr(it.spec, '')}</td>
      <td style="padding:5px 8px;font-size:12px;text-align:center;border:1px solid #e5e7eb;">${esc(it.qty)}</td>
      <td style="padding:5px 8px;font-size:12px;text-align:right;border:1px solid #e5e7eb;">${money(it.price)}</td>
      <td style="padding:5px 8px;font-size:12px;text-align:right;font-weight:600;border:1px solid #e5e7eb;">${money(it.amount)}</td>
    </tr>`
    }).join('')
    tableHtml = `<table style="width:100%;border-collapse:collapse;margin-top:8px;">
      <thead>
        <tr style="background:linear-gradient(180deg,${theme.brand} 0%,${theme.deep} 100%);color:#FFFFFF;">
          <th style="padding:7px 8px;font-size:12px;text-align:left;border:1px solid ${theme.deep};">配件</th>
          <th style="padding:7px 8px;font-size:12px;text-align:left;border:1px solid ${theme.deep};">型号</th>
          <th style="padding:7px 8px;font-size:12px;text-align:left;border:1px solid ${theme.deep};">规格参数</th>
          <th style="padding:7px 8px;font-size:12px;text-align:center;border:1px solid ${theme.deep};width:60px;">数量</th>
          <th style="padding:7px 8px;font-size:12px;text-align:right;border:1px solid ${theme.deep};width:90px;">单价(元)</th>
          <th style="padding:7px 8px;font-size:12px;text-align:right;border:1px solid ${theme.deep};width:90px;">金额(元)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:${theme.soft};">
          <td colspan="5" style="padding:7px 8px;font-size:12px;text-align:right;font-weight:700;border:1px solid ${theme.line};">合计</td>
          <td style="padding:7px 8px;font-size:13px;text-align:right;font-weight:700;border:1px solid ${theme.line};color:${theme.brand};">${money(totalAmount)}</td>
        </tr>
      </tfoot>
    </table>`
  }

  // 整机总价区：大字实际总价 + 价格拆分（有优惠时）+ 含税总价（有输入时）
  const actualAmount = round2(Number(doc.amount) || totalAmount)
  let priceBlock = ''
  if (validItems.length > 0) {
    const breakHtml = discountAmount > 0
      ? '<div style="margin-top:6px;font-size:11px;color:#5C6670;">原价 <b style="color:#1B1F24;">' + money(totalAmount) + '</b> − 大客户优惠 <b style="color:#1B1F24;">' + money(discountAmount) + '</b> = 实际整机总价 <b style="color:' + theme.deep + ';">' + money(actualAmount) + '</b></div>'
      : ''
    const taxHtml = taxInput
      ? '<div style="margin-top:6px;font-size:13px;font-weight:700;color:' + theme.deep + ';">含税总价：¥' + esc(money(Number(taxInput) || 0)) + '</div>'
      : ''
    priceBlock = `<div style="margin-top:14px;padding:12px 16px;background:${theme.soft};border:1px solid ${theme.line};border-radius:6px;flex:1;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;color:#5C6670;">整机总价（未税）</span>
          <span style="font-size:24px;font-weight:800;color:${theme.brand};">¥ ${money(actualAmount)}</span>
        </div>
        ${breakHtml}
        ${taxHtml}
      </div>`
  }

  // 服务项小标签（不计入金额）
  const servicesHtml = services.length > 0
    ? '<div style="margin-top:10px;">' + services.map((x) =>
        '<span style="display:inline-block;padding:2px 10px;margin:2px 4px 2px 0;border-radius:10px;font-size:11px;color:' + theme.deep + ';background:' + theme.soft + ';border:1px solid ' + theme.line + ';">' + esc(x) + '</span>'
      ).join('') + '</div>'
    : ''

  // 微信二维码（有则显示在价格区右侧）
  const qrHtml = qrcode
    ? '<div style="margin-top:14px;margin-left:14px;text-align:center;"><img src="' + esc(qrcode) + '" alt="微信二维码" style="width:96px;height:96px;border:1px solid #e5e7eb;border-radius:6px;" /><div style="font-size:10px;color:#8A94A0;margin-top:3px;">微信扫码付款</div></div>'
    : ''

  // 价格区 + 二维码 横向排列
  const priceQrHtml = (priceBlock || qrHtml)
    ? '<div style="display:flex;align-items:flex-start;">' + priceBlock + qrHtml + '</div>'
    : ''

  // 备注
  const remarkHtml = remark
    ? '<div style="margin-top:14px;font-size:12px;color:#5C6670;line-height:1.7;">备注：' + esc(remark) + '</div>'
    : ''

  const body = `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div>${coBlock}</div>
    <div>${dateHtml}</div>
  </div>
  <div style="margin-top:10px;border-bottom:2px solid ${theme.deep};"></div>
  ${titleHtml}
  ${tagsHtml}
  ${custHtml}
  ${tableHtml}
  ${priceQrHtml}
  ${servicesHtml}
  ${remarkHtml}
  <div style="margin-top:20px;padding-top:10px;border-top:1px dashed #BFC6D0;font-size:11px;color:#8A94A0;text-align:center;">${textOr(s.footerNote, '')}</div>`

  return page('装机单 - ' + (title || '装机配置'), body)
}

// ---------- 项目报价单打印（类目分组表格、配色方案、A4 横向） ----------
// 配色方案与独立版 project-quote/js/quote-color.js 保持一致
const PQ_SCHEMES = {
  'default': { title: ['#4f46e5', '#7c3aed'], categoryBg: 'linear-gradient(90deg,#ede9fe,#f5f3ff)', categoryBorder: '#8b5cf6', categoryText: '#5b21b6', totalBg: '#fefce8', totalText: '#854d0e' },
  'solid-blue': { title: ['#2563eb'], categoryBg: '#dbeafe', categoryBorder: '#3b82f6', categoryText: '#1e40af', totalBg: '#eff6ff', totalText: '#1e3a8a' },
  'solid-green': { title: ['#16a34a'], categoryBg: '#dcfce7', categoryBorder: '#22c55e', categoryText: '#166534', totalBg: '#f0fdf4', totalText: '#14532d' },
  'solid-red': { title: ['#dc2626'], categoryBg: '#fee2e2', categoryBorder: '#ef4444', categoryText: '#991b1b', totalBg: '#fef2f2', totalText: '#7f1d1d' },
  'solid-orange': { title: ['#ea580c'], categoryBg: '#ffedd5', categoryBorder: '#f97316', categoryText: '#9a3412', totalBg: '#fff7ed', totalText: '#7c2d12' },
  'solid-purple': { title: ['#9333ea'], categoryBg: '#f3e8ff', categoryBorder: '#a855f7', categoryText: '#6b21a8', totalBg: '#faf5ff', totalText: '#581c87' },
  'solid-teal': { title: ['#0d9488'], categoryBg: '#ccfbf1', categoryBorder: '#14b8a6', categoryText: '#115e59', totalBg: '#f0fdfa', totalText: '#134e4a' },
  'solid-pink': { title: ['#db2777'], categoryBg: '#fce7f3', categoryBorder: '#ec4899', categoryText: '#9d174d', totalBg: '#fdf2f8', totalText: '#831843' },
  'solid-indigo': { title: ['#4f46e5'], categoryBg: '#e0e7ff', categoryBorder: '#6366f1', categoryText: '#3730a3', totalBg: '#eef2ff', totalText: '#312e81' },
  'solid-cyan': { title: ['#0891b2'], categoryBg: '#cffafe', categoryBorder: '#06b6d4', categoryText: '#155e75', totalBg: '#ecfeff', totalText: '#164e63' },
  'solid-emerald': { title: ['#059669'], categoryBg: '#d1fae5', categoryBorder: '#10b981', categoryText: '#065f46', totalBg: '#ecfdf5', totalText: '#064e3b' },
  'gradient-blue': { title: ['#06b6d4', '#3b82f6'], categoryBg: 'linear-gradient(90deg,#cffafe,#dbeafe)', categoryBorder: '#0ea5e9', categoryText: '#0c4a6e', totalBg: '#f0f9ff', totalText: '#0c4a6e' },
  'gradient-green': { title: ['#10b981', '#06b6d4'], categoryBg: 'linear-gradient(90deg,#d1fae5,#ccfbf1)', categoryBorder: '#14b8a6', categoryText: '#134e4a', totalBg: '#f0fdfa', totalText: '#134e4a' },
  'gradient-red': { title: ['#ef4444', '#f97316'], categoryBg: 'linear-gradient(90deg,#fee2e2,#ffedd5)', categoryBorder: '#f97316', categoryText: '#7c2d12', totalBg: '#fff7ed', totalText: '#7c2d12' },
  'gradient-purple': { title: ['#a855f7', '#ec4899'], categoryBg: 'linear-gradient(90deg,#f3e8ff,#fce7f3)', categoryBorder: '#d946ef', categoryText: '#86198f', totalBg: '#fdf4ff', totalText: '#86198f' },
  'gradient-orange': { title: ['#f97316', '#eab308'], categoryBg: 'linear-gradient(90deg,#ffedd5,#fef9c3)', categoryBorder: '#ca8a04', categoryText: '#713f12', totalBg: '#fefce8', totalText: '#713f12' },
  'gradient-teal': { title: ['#14b8a6', '#6366f1'], categoryBg: 'linear-gradient(90deg,#ccfbf1,#e0e7ff)', categoryBorder: '#6366f1', categoryText: '#3730a3', totalBg: '#eef2ff', totalText: '#3730a3' },
  'gradient-indigo': { title: ['#6366f1', '#8b5cf6'], categoryBg: 'linear-gradient(90deg,#e0e7ff,#ede9fe)', categoryBorder: '#8b5cf6', categoryText: '#5b21b6', totalBg: '#f5f3ff', totalText: '#5b21b6' },
  'gradient-pink': { title: ['#ec4899', '#8b5cf6'], categoryBg: 'linear-gradient(90deg,#fce7f3,#ede9fe)', categoryBorder: '#a855f7', categoryText: '#6b21a8', totalBg: '#faf5ff', totalText: '#6b21a8' },
  'gradient-cyan': { title: ['#06b6d4', '#10b981'], categoryBg: 'linear-gradient(90deg,#cffafe,#d1fae5)', categoryBorder: '#10b981', categoryText: '#065f46', totalBg: '#ecfdf5', totalText: '#065f46' },
  'gradient-warm': { title: ['#f97316', '#ef4444'], categoryBg: 'linear-gradient(90deg,#ffedd5,#fee2e2)', categoryBorder: '#ef4444', categoryText: '#991b1b', totalBg: '#fef2f2', totalText: '#991b1b' }
}
const PQ_CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

const PQ_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #EEF1F5; color: #1B1F24; font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 10px; align-items: center; padding: 10px 18px; background: #FFFFFF; border-bottom: 1px solid #E2E6EC; }
  .toolbar .hint { flex: 1; font-size: 12px; color: #8A94A0; }
  .toolbar button { padding: 7px 18px; border: none; border-radius: 6px; background: #4f46e5; color: #FFFFFF; font-size: 13px; cursor: pointer; }
  .toolbar button.ghost { background: #FFFFFF; color: #4f46e5; border: 1px solid #4f46e5; }
  .sheet { width: 1123px; margin: 18px auto; background: #FFFFFF; padding: 36px 42px; box-shadow: 0 2px 14px rgba(15, 23, 42, 0.08); }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 8px; font-size: 12px; }
  th { background: #f8fafc; font-weight: 600; }
  .right { text-align: right; }
  .center { text-align: center; }
  @page { size: A4 landscape; margin: 10mm; }
  @media print {
    body { background: #FFFFFF; }
    .toolbar { display: none; }
    .sheet { width: auto; margin: 0; padding: 0; box-shadow: none; }
  }
`

function pqPage(title, body) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>${PQ_CSS}</style>
</head>
<body>
  <div class="toolbar">
    <span class="hint">需要 PDF 时，请在打印窗口的「目标打印机」中选择「另存为 PDF」</span>
    <button onclick="window.print()">打印 / 另存为 PDF</button>
    <button class="ghost" onclick="window.close()">关闭</button>
  </div>
  <div class="sheet">
${body}
  </div>
</body>
</html>`
}

function projectQuoteHtml(doc, settings) {
  const s = settings || {}
  const scheme = PQ_SCHEMES[String(doc.colorScheme || 'default')] || PQ_SCHEMES['default']

  const title = String(doc.title || '').trim() || '智联电子项目报价单'
  const coName = String(doc.companyName || s.companyName || '').trim()
  const coPhone = String(doc.companyPhone || s.phone || '').trim()
  const customerName = String(doc.customerName || '').trim()
  const customerPhone = String(doc.customerPhone || '').trim()
  const date = String(doc.date || '').trim()
  const docNo = String(doc.docNo || '').trim()
  const projectDesc = String(doc.projectDesc || '').trim()
  const remark = String(doc.remark || '').trim()
  const quoteNote = String(doc.quoteNote || '').trim() || '1. 报价有效期15天；2. 以上价格不含税，如需发票请联系客服；3. 付款方式：合同签订后付50%，交付验收后付清余款。'

  // 标题配色：渐变取双色，纯色取单色
  const titleStyle = scheme.title.length > 1
    ? 'background:linear-gradient(135deg,' + scheme.title[0] + ',' + scheme.title[1] + ');-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:' + scheme.title[0] + ';'
    : 'color:' + scheme.title[0] + ';'

  // 类目结构：优先用快照中的类目分组；老单据没有类目时退化为单一类目
  let categories = Array.isArray(doc.categories) ? doc.categories : []
  if (categories.length === 0 && Array.isArray(doc.items) && doc.items.length > 0) {
    categories = [{ name: '报价明细', items: doc.items.map((it) => ({
      name: it.name, spec: it.spec, description: it.model, unit: it.unit,
      qty: it.qty, price: it.price, remark: it.remark, image: it.image
    })) }]
  }

  const chineseNum = (n) => PQ_CN_NUMS[n] || String(n + 1)
  // 类目合计标签：与参考文件一致的「类目名 合计：」
  const catLabelText = (name, ci) => (String(name || '').trim() || ('类目' + (ci + 1))) + ' 合计：'
  let total = 0
  let catsHtml = ''
  // 先过滤出「有数据行」的类目，再按顺序编号，保证空类目不占序号
  const visibleCategories = []
  categories.forEach((cat) => {
    // 空行不输出：名称 / 规格 / 数量 / 单价 全部为空才视为空行（与前端编辑页一致）
    const items = (Array.isArray(cat.items) ? cat.items : []).filter((it) => {
      const nm = String(it.name == null ? '' : it.name).trim()
      const sp = String(it.spec == null ? '' : it.spec).trim()
      const qy = String(it.qty == null ? '' : it.qty).trim()
      const pr = String(it.price == null ? '' : it.price).trim()
      return !(nm.length === 0 && sp.length === 0 && qy.length === 0 && pr.length === 0)
    })
    if (items.length > 0) {
      visibleCategories.push({ name: cat.name, items: items })
    }
  })
  visibleCategories.forEach((cat, ci) => {
    const items = cat.items
    let catTotal = 0
    const rows = items.map((it, i) => {
      const qty = Number(it.qty) || 0
      const price = Number(it.price) || 0
      const amount = round2(qty * price)
      catTotal = round2(catTotal + amount)
      const img = String(it.image || '').trim()
      const imgCell = img
        ? '<img src="' + esc(img) + '" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0;" />'
        : ''
      return '<tr>' +
        '<td class="center">' + (i + 1) + '</td>' +
        '<td>' + esc(it.name) + '</td>' +
        '<td>' + esc(it.spec || '') + '</td>' +
        '<td>' + esc(it.description || '') + '</td>' +
        '<td class="center">' + esc(it.unit || '个') + '</td>' +
        '<td class="right">' + esc(qty) + '</td>' +
        '<td class="right">' + money(price) + '</td>' +
        '<td class="right">' + money(amount) + '</td>' +
        '<td>' + esc(it.remark || '') + '</td>' +
        '<td class="center">' + imgCell + '</td>' +
        '</tr>'
    }).join('')
    total = round2(total + catTotal)
    catsHtml +=
      '<div style="margin:14px 0 6px;padding:7px 12px;border-left:3px solid ' + esc(scheme.categoryBorder) + ';background:' + scheme.categoryBg + ';">' +
        '<span style="font-size:14px;font-weight:700;color:' + esc(scheme.categoryText) + ';">' + chineseNum(ci) + '、' + esc(cat.name || ('类目' + (ci + 1))) + '</span>' +
      '</div>' +
      '<table><thead><tr>' +
        '<th style="width:36px;">序号</th><th>品牌名称</th><th>参数</th><th>说明</th>' +
        '<th style="width:44px;">单位</th><th style="width:54px;">数量</th><th style="width:80px;">单价</th>' +
        '<th style="width:90px;">合计</th><th style="width:90px;">备注</th><th style="width:56px;">图片</th>' +
      '</tr></thead><tbody>' + rows +
      '<tr style="background:' + esc(scheme.totalBg) + ';">' +
        '<td colspan="7" class="right" style="font-weight:700;color:' + esc(scheme.totalText) + ';">' + esc(catLabelText(cat.name, ci)) + '</td>' +
        '<td class="right" style="font-weight:700;color:#dc2626;">¥' + money(catTotal) + '</td>' +
        '<td colspan="2"></td>' +
      '</tr></tbody></table>'
  })

  // 金额汇总（与参考文件一致：右对齐总金额 + 含税金额 + 底部说明）
  const taxRate = Number(doc.taxRate || 0)
  const taxAmount = Number(doc.taxAmount || 0)
  let summaryHtml =
    '<div style="margin-top:16px;text-align:right;font-size:12px;font-weight:500;color:#374151;">总金额（未税）：<span style="color:#dc2626;font-size:16px;font-weight:700;">¥' + money(total) + '</span></div>'
  if (taxAmount > 0) {
    summaryHtml += '<div style="margin-top:6px;text-align:right;font-size:12px;color:#374151;">含税总价（税率 ' + esc(taxRate) + '%）：<span style="color:#dc2626;font-weight:700;font-size:14px;">¥' + money(taxAmount) + '</span></div>'
  }
  summaryHtml += '<div style="margin-top:8px;text-align:right;font-size:10px;color:#6b7280;">备注：报价有效期15天，最终解释权归' + esc(coName || '本公司') + '所有</div>'

  // 客户与项目信息行（空字段隐藏）
  const metaCells = []
  if (customerName) metaCells.push('<span style="margin-right:24px;"><b>客户名称：</b>' + esc(customerName) + '</span>')
  if (customerPhone) metaCells.push('<span style="margin-right:24px;"><b>联系电话：</b>' + esc(customerPhone) + '</span>')
  if (date) metaCells.push('<span style="margin-right:24px;"><b>报价日期：</b>' + esc(date) + '</span>')
  if (docNo) metaCells.push('<span><b>单据编号：</b>' + esc(docNo) + '</span>')
  const metaHtml = metaCells.length > 0
    ? '<div style="margin:0 0 8px;font-size:11px;color:#374151;">' + metaCells.join('') + '</div>'
    : ''
  const descHtml = projectDesc
    ? '<div style="margin:8px 0;font-size:12px;color:#475569;"><b>项目说明：</b>' + esc(projectDesc) + '</div>'
    : ''

  // 报价单位信息（标题行右侧）
  let coHtml = ''
  if (coName || coPhone) {
    coHtml = '<div style="text-align:right;font-size:11px;color:#64748b;line-height:1.7;">' +
      (coName ? '<div>报价单位：<b style="color:#334155;">' + esc(coName) + '</b></div>' : '') +
      (coPhone ? '<div>电话：<b style="color:#334155;">' + esc(coPhone) + '</b></div>' : '') +
      '</div>'
  }

  const remarkHtml = remark
    ? '<div style="margin-top:12px;font-size:12px;"><b>备注：</b>' + esc(remark).replace(/\n/g, '<br/>') + '</div>'
    : ''
  const noteHtml = quoteNote
    ? '<div style="margin-top:14px;padding-top:10px;border-top:1px dashed #BFC6D0;font-size:11px;color:#64748b;"><b>报价说明：</b><br/>' + esc(quoteNote).replace(/\n/g, '<br/>') + '</div>'
    : ''

  const body =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #e0e7ff;">' +
      '<div style="font-size:26px;font-weight:800;letter-spacing:2px;' + titleStyle + '">' + esc(title) + '</div>' +
      coHtml +
    '</div>' +
    metaHtml +
    descHtml +
    catsHtml +
    summaryHtml +
    remarkHtml +
    noteHtml

  return pqPage('项目报价单 - ' + (docNo || title), body)
}

module.exports = { docHtml, contractHtml, installHtml, amountToChinese }
