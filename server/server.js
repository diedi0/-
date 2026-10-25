'use strict'
// 蓝海电子 · 销售开单系统 后端服务
// 零第三方依赖：node:http + node:sqlite（Node 22 内置）
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { db, nowText, seedIfEmpty, count } = require('./db')
const seed = require('./seed-data')
const printRenderer = require('./print')

const PORT = Number(process.env.PORT || 3001)

// 商品图片等上传文件的存储目录（相对 /uploads/xxx 对外提供访问）
const UPLOAD_DIR = path.join(__dirname, 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}
const UPLOAD_EXT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024 // 单张图片最大 5MB

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400'
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// ---------- 工具 ----------
const str = (v) => (v === null || v === undefined ? '' : String(v).trim())
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const round2 = (n) => Math.round(n * 100) / 100
// 安全解析 JSON 数组列（非法/空值返回空数组）
const parseJsonArray = (text) => {
  if (!text) return []
  try {
    const v = JSON.parse(text)
    return Array.isArray(v) ? v : []
  } catch (e) {
    return []
  }
}

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS))
  res.end(body)
}

function ok(res, data, extra) {
  send(res, 200, Object.assign({ ok: true, data }, extra || {}))
}

function fail(res, status, message) {
  send(res, status, { ok: false, message })
}

function sendHtml(res, html) {
  res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, CORS))
  res.end(html)
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v)
  return '"' + s.replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"'
}

// 导出 CSV：带 UTF-8 BOM，Excel 打开中文不乱码
function sendCsv(res, filename, header, rows) {
  const lines = [header.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push(r.map(csvCell).join(','))
  }
  const body = '\uFEFF' + lines.join('\r\n')
  res.writeHead(200, Object.assign({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="' + filename + '"',
    'Content-Length': Buffer.byteLength(body)
  }, CORS))
  res.end(body)
}

function dateStamp() {
  return nowText().slice(0, 10).replace(/-/g, '')
}

function readBody(req, maxBytes) {
  const limit = maxBytes || 2 * 1024 * 1024
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new HttpError(413, '请求体过大'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve({})
      try {
        const parsed = JSON.parse(text)
        resolve(parsed === null ? {} : parsed)
      } catch (e) {
        reject(new HttpError(400, '请求体不是合法的 JSON'))
      }
    })
    req.on('error', (e) => reject(e))
  })
}

// ---------- 图片上传与访问 ----------
// POST /api/upload：JSON { name, dataBase64 }，校验格式与大小后保存原图，返回 { url }
function uploadImage(payload) {
  const name = str(payload.name)
  const b64 = String(payload.dataBase64 || '')
  const ext = path.extname(name).toLowerCase()
  if (!UPLOAD_EXT_TYPES[ext]) {
    throw new HttpError(400, '图片格式不支持，仅允许 JPG / JPEG / PNG / WebP')
  }
  if (!b64) throw new HttpError(400, '图片内容为空')
  let buf
  try {
    buf = Buffer.from(b64, 'base64')
  } catch (e) {
    throw new HttpError(400, '图片内容不是合法的 Base64')
  }
  if (!buf || buf.length === 0) throw new HttpError(400, '图片内容为空')
  if (buf.length > UPLOAD_MAX_BYTES) {
    throw new HttpError(400, '图片超过 5MB，请先压缩后再上传')
  }
  const fname = dateStamp() + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36) + ext
  fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf)
  return { url: '/uploads/' + fname, size: buf.length }
}

// GET /uploads/xxx：读取已保存的图片（只允许访问 uploads 目录内的文件）
function serveUpload(res, pathname) {
  let fname
  try {
    fname = decodeURIComponent(pathname.slice('/uploads/'.length))
  } catch (e) {
    throw new HttpError(400, '非法的文件路径')
  }
  if (fname.includes('/') || fname.includes('\\') || fname.includes('..')) {
    throw new HttpError(400, '非法的文件路径')
  }
  const ext = path.extname(fname).toLowerCase()
  const mime = UPLOAD_EXT_TYPES[ext]
  if (!mime) throw new HttpError(404, '文件不存在')
  const file = path.join(UPLOAD_DIR, fname)
  if (!fs.existsSync(file)) throw new HttpError(404, '文件不存在或已被删除')
  const data = fs.readFileSync(file)
  res.writeHead(200, Object.assign({
    'Content-Type': mime,
    'Content-Length': data.length,
    'Cache-Control': 'public, max-age=31536000, immutable'
  }, CORS))
  res.end(data)
}

// ---------- 客户 ----------
function mapCustomer(r) {
  return {
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    contact: r.contact,
    phone: r.phone,
    address: r.address,
    level: r.level,
    creditLimit: r.credit_limit,
    receivable: r.receivable,
    tags: r.tags,
    remark: r.remark,
    source: r.source
  }
}

function listCustomers(keyword) {
  const kw = str(keyword)
  let rows
  if (kw) {
    rows = db
      .prepare(`SELECT * FROM customers
        WHERE name LIKE ? OR short_name LIKE ? OR contact LIKE ? OR phone LIKE ?
        ORDER BY id DESC`)
      .all('%' + kw + '%', '%' + kw + '%', '%' + kw + '%', '%' + kw + '%')
  } else {
    rows = db.prepare('SELECT * FROM customers ORDER BY id DESC').all()
  }
  return rows.map(mapCustomer)
}

function createCustomer(payload) {
  const name = str(payload.name)
  if (!name) throw new HttpError(400, '客户名称不能为空')
  const exists = db.prepare('SELECT * FROM customers WHERE name = ?').get(name)
  if (exists) {
    // 已存在：不重复创建，直接返回已有档案（id 复用）
    return { customer: mapCustomer(exists), created: false }
  }
  const now = nowText()
  const info = db
    .prepare(`INSERT INTO customers
      (name, short_name, contact, phone, address, level, credit_limit, receivable, tags, remark, source, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      name,
      str(payload.shortName) || name.slice(0, 4),
      str(payload.contact),
      str(payload.phone),
      str(payload.address),
      str(payload.level) || 'C',
      num(payload.creditLimit),
      num(payload.receivable),
      str(payload.tags),
      str(payload.remark),
      str(payload.source) || 'manual',
      now,
      now
    )
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid)
  return { customer: mapCustomer(row), created: true }
}

function updateCustomer(id, payload) {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '客户档案不存在')
  const name = str(payload.name) || row.name
  if (name !== row.name) {
    const dup = db.prepare('SELECT id FROM customers WHERE name = ? AND id <> ?').get(name, id)
    if (dup) throw new HttpError(409, '已存在同名客户档案，不能重复创建')
  }
  db.prepare(`UPDATE customers SET
      name = ?, short_name = ?, contact = ?, phone = ?, address = ?, level = ?,
      credit_limit = ?, receivable = ?, tags = ?, remark = ?, updated_at = ?
    WHERE id = ?`)
    .run(
      name,
      str(payload.shortName) || row.short_name,
      payload.contact === undefined ? row.contact : str(payload.contact),
      payload.phone === undefined ? row.phone : str(payload.phone),
      payload.address === undefined ? row.address : str(payload.address),
      str(payload.level) || row.level,
      payload.creditLimit === undefined ? row.credit_limit : num(payload.creditLimit),
      payload.receivable === undefined ? row.receivable : num(payload.receivable),
      payload.tags === undefined ? row.tags : str(payload.tags),
      payload.remark === undefined ? row.remark : str(payload.remark),
      nowText(),
      id
    )
  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
  return mapCustomer(updated)
}

// ---------- 产品 ----------
function mapProduct(r) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    brand: r.brand,
    model: r.model,
    spec: r.spec,
    category: r.category,
    partCategory: r.part_category || '',
    unit: r.unit,
    price: r.price,
    cost: r.cost,
    stock: r.stock,
    safeStock: r.safe_stock,
    remark: r.remark,
    image: r.image || '',
    source: r.source
  }
}

function listProducts(keyword, category) {
  const kw = str(keyword)
  const cat = str(category)
  let rows = db.prepare('SELECT * FROM products ORDER BY id DESC').all()
  if (kw) {
    const k = kw.toLowerCase()
    rows = rows.filter(
      (r) =>
        String(r.name).toLowerCase().includes(k) ||
        String(r.code).toLowerCase().includes(k) ||
        String(r.brand).toLowerCase().includes(k) ||
        String(r.model).toLowerCase().includes(k) ||
        String(r.spec).toLowerCase().includes(k)
    )
  }
  if (cat && cat !== '全部') {
    rows = rows.filter((r) => r.category === cat)
  }
  return rows.map(mapProduct)
}

function createProduct(payload) {
  const name = str(payload.name)
  if (!name) throw new HttpError(400, '产品名称不能为空')
  const model = str(payload.model)
  const spec = str(payload.spec)
  // 判重规则：名称 + 型号 + 规格 相同才算同一产品
  const exists = db.prepare('SELECT * FROM products WHERE name = ? AND model = ? AND spec = ?').get(name, model, spec)
  if (exists) {
    return { product: mapProduct(exists), created: false }
  }
  // 图片只接受本系统 /uploads/ 下的地址
  let image = str(payload.image)
  if (image && !image.startsWith('/uploads/')) image = ''
  const now = nowText()
  const info = db
    .prepare(`INSERT INTO products
      (code, name, brand, model, spec, category, part_category, unit, price, cost, stock, safe_stock, remark, image, source, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      str(payload.code),
      name,
      str(payload.brand),
      model,
      spec,
      str(payload.category) || '其他',
      str(payload.partCategory),
      str(payload.unit) || '个',
      num(payload.price),
      num(payload.cost),
      num(payload.stock),
      num(payload.safeStock),
      str(payload.remark),
      image,
      str(payload.source) || 'manual',
      now,
      now
    )
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid)
  return { product: mapProduct(row), created: true }
}

function updateProduct(id, payload) {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '产品档案不存在')
  const name = str(payload.name) || row.name
  const model = payload.model === undefined ? row.model : str(payload.model)
  const spec = payload.spec === undefined ? row.spec : str(payload.spec)
  if (name !== row.name || model !== row.model || spec !== row.spec) {
    const dup = db
      .prepare('SELECT id FROM products WHERE name = ? AND model = ? AND spec = ? AND id <> ?')
      .get(name, model, spec, id)
    if (dup) throw new HttpError(409, '已存在同名、同型号、同规格的产品档案，不能重复创建')
  }
  // 图片：传了则校验 /uploads/ 前缀（空串表示移除图片），没传则保持原图不变
  let image = row.image || ''
  if (payload.image !== undefined) {
    const want = str(payload.image)
    if (want === '' || want.startsWith('/uploads/')) {
      image = want
    }
  }
  db.prepare(`UPDATE products SET
      code = ?, name = ?, brand = ?, model = ?, spec = ?, category = ?, part_category = ?, unit = ?,
      price = ?, cost = ?, stock = ?, safe_stock = ?, remark = ?, image = ?, updated_at = ?
    WHERE id = ?`)
    .run(
      payload.code === undefined ? row.code : str(payload.code),
      name,
      payload.brand === undefined ? row.brand : str(payload.brand),
      model,
      spec,
      str(payload.category) || row.category,
      payload.partCategory === undefined ? (row.part_category || '') : str(payload.partCategory),
      str(payload.unit) || row.unit,
      payload.price === undefined ? row.price : num(payload.price),
      payload.cost === undefined ? row.cost : num(payload.cost),
      payload.stock === undefined ? row.stock : num(payload.stock),
      payload.safeStock === undefined ? row.safe_stock : num(payload.safeStock),
      payload.remark === undefined ? row.remark : str(payload.remark),
      image,
      nowText(),
      id
    )
  return mapProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id))
}

// ---------- 单据 ----------
function mapDoc(r, items) {
  const base = {
    id: r.id,
    docNo: r.doc_no,
    type: r.type,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerContact: r.customer_contact,
    customerPhone: r.customer_phone,
    customerAddress: r.customer_address,
    date: r.doc_date,
    amount: r.amount,
    rawAmount: r.raw_amount,
    discountPercent: r.discount_percent,
    discountAmount: r.discount_amount,
    taxAmount: r.tax_amount,
    taxRate: r.tax_rate,
    status: r.status,
    owner: r.owner,
    remark: r.remark,
    // 装机单专用字段
    rootDocId: r.root_doc_id || r.id,
    versionNo: r.version_no || 1,
    isLatest: r.is_latest === 1,
    title: r.title || '',
    tags: r.tags || '',
    companyName: r.company_name || '',
    companyPhone: r.company_phone || '',
    companyAddress: r.company_address || '',
    companyLogo: r.company_logo || '',
    // 项目报价单专用字段
    projectDesc: r.project_desc || '',
    quoteNote: r.quote_note || '',
    colorScheme: r.color_scheme || '',
    categories: parseJsonArray(r.pq_categories),
    // 装机单功能补偿字段（theme 空串由前端按默认 orange 处理；services 为 JSON 数组字符串）
    theme: r.theme || '',
    billNo: r.bill_no || '',
    services: r.services || '',
    qrcode: r.qrcode || '',
    taxInput: r.tax_input || '',
    // 结款模块字段
    settledAmount: r.settled_amount || 0,
    dueDays: r.due_days == null ? 30 : Number(r.due_days),
    settledAt: r.settled_at || '',
    payMethod: r.pay_method || '',
    paidAt: r.paid_at || '',
    // 修改留痕（首次创建为 0，之后每次保存累加）
    editCount: r.edit_count == null ? 0 : Number(r.edit_count),
    lastEditedAt: r.last_edited_at || '',
    lastEditor: r.last_editor || ''
  }
  if (items) base.items = items
  return base
}

function mapItem(r) {
  return {
    id: r.id,
    lineNo: r.line_no,
    productId: r.product_id,
    code: r.code,
    name: r.name,
    model: r.model,
    spec: r.spec,
    unit: r.unit,
    qty: r.qty,
    price: r.price,
    discount: r.discount,
    amount: r.amount,
    image: r.image || '',
    icon: r.icon || '',
    remark: r.remark
  }
}

function loadItems(docId) {
  return db.prepare('SELECT * FROM doc_items WHERE doc_id = ? ORDER BY line_no ASC').all(docId).map(mapItem)
}

function listDocs(type) {
  const t = str(type)
  // 只展示每个单据的最新版本（is_latest=1），历史版本不混在主列表里
  const rows = t
    ? db.prepare('SELECT * FROM docs WHERE type = ? AND is_latest = 1 ORDER BY id DESC').all(t)
    : db.prepare('SELECT * FROM docs WHERE is_latest = 1 ORDER BY id DESC').all()
  return rows.map((r) => {
    const d = mapDoc(r, null)
    const c = db.prepare('SELECT COUNT(*) AS n FROM doc_items WHERE doc_id = ?').get(r.id)
    d.itemCount = Number(c.n)
    return d
  })
}

// 查询某张装机单的全部历史版本（按版本号倒序，最新在前）
function listDocVersions(rootDocId) {
  const rid = Number(rootDocId)
  if (!Number.isFinite(rid) || rid <= 0) throw new HttpError(400, '单据 ID 不合法')
  const rows = db
    .prepare('SELECT * FROM docs WHERE root_doc_id = ? ORDER BY version_no DESC, id DESC')
    .all(rid)
  return rows.map((r) => {
    const d = mapDoc(r, null)
    const c = db.prepare('SELECT COUNT(*) AS n FROM doc_items WHERE doc_id = ?').get(r.id)
    d.itemCount = Number(c.n)
    return d
  })
}

function getDoc(id) {
  const row = db.prepare('SELECT * FROM docs WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '单据不存在')
  return mapDoc(row, loadItems(row.id))
}

/**
 * 保存单据 + 自动归档（单事务，失败整体回滚）
 * 幂等：同一 doc_no 重复保存时更新原单据，不重复创建单据/档案
 */
function saveDoc(payload, operator) {
  const editor = str(operator)
  const docNo = str(payload.docNo)
  const type = str(payload.type) || '销售单'
  const customerName = str(payload.customerName)
  const rawItems = Array.isArray(payload.items) ? payload.items : []

  // ---- 事务外先做完整校验，避免无效事务 ----
  if (!docNo) throw new HttpError(400, '单据编号不能为空')
  if (!type) throw new HttpError(400, '单据类型不能为空')
  if (!customerName) throw new HttpError(400, '客户名称不能为空，请填写客户信息')

  // 整单优惠金额（元）：新口径直接传优惠金额；兼容旧前端仍传 discountPercent（百分比）的情况
  let discountAmountInput = 0
  let discountPercentLegacy = 0
  if (payload.discountAmount !== undefined && payload.discountAmount !== null && String(payload.discountAmount).trim() !== '') {
    const d = Number(payload.discountAmount)
    if (!Number.isFinite(d) || d < 0) {
      throw new HttpError(400, '整单优惠金额必须是不小于 0 的数字')
    }
    discountAmountInput = round2(d)
  } else if (payload.discountPercent !== undefined && payload.discountPercent !== null && String(payload.discountPercent).trim() !== '') {
    const p = Number(payload.discountPercent)
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      throw new HttpError(400, '整单优惠折扣必须是 0 到 100 之间的数字')
    }
    discountPercentLegacy = round2(p * 100) / 100
  }

  // 空白行（没填名称）只是录入占位，跳过不保存；全部为空才算没有明细
  const items = []
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i]
    const name = str(it.name)
    if (!name) continue
    const qty = num(it.qty)
    if (!(qty > 0)) throw new HttpError(400, '第 ' + (i + 1) + ' 行：数量必须大于 0')
    const price = num(it.price)
    if (price < 0) throw new HttpError(400, '第 ' + (i + 1) + ' 行：单价不能为负数')
    // 图片路径只接受本系统 /uploads/ 下的地址，其它一律丢弃
    let image = str(it.image)
    if (image && !image.startsWith('/uploads/')) image = ''
    items.push({
      line_no: items.length + 1,
      code: str(it.code),
      name,
      model: str(it.model),
      spec: str(it.spec),
      unit: str(it.unit) || '个',
      qty,
      price,
      discount: 100, // 单品折扣已下线；列保留仅为兼容历史单据
      amount: round2(qty * price),
      image,
      remark: str(it.remark)
    })
  }
  if (items.length === 0) throw new HttpError(400, '请至少填写一条有效商品明细')

  // 金额口径：原始未税 = Σ(数量×单价)；应收 = 原始 − 整单优惠金额（整数分运算防浮点误差）
  // 旧前端按百分比传入时换算为金额；discount_percent 列仅保留旧口径数据，新单据写 0
  const rawAmount = round2(items.reduce((s, it) => s + it.amount, 0))
  let discountAmount = discountAmountInput
  if (discountAmount <= 0 && discountPercentLegacy > 0) {
    discountAmount = round2((rawAmount * discountPercentLegacy) / 100)
  }
  if (discountAmount > rawAmount) {
    throw new HttpError(400, '整单优惠金额不能大于合计金额 ' + rawAmount.toFixed(2) + ' 元')
  }
  const discountPercent = 0
  const totalAmount = round2(rawAmount - discountAmount)

  // 含税金额：只有前端明确点了「计算含税金额」并传来税率时才计算
  // 一律由后端用合计未税金额现算，避免重复乘税率导致金额越算越多
  let taxRate = 0
  if (payload.taxRate !== undefined && payload.taxRate !== null && String(payload.taxRate).trim() !== '') {
    const r = Number(payload.taxRate)
    if (!Number.isFinite(r) || r < 0 || r > 100) {
      throw new HttpError(400, '税率必须是 0 到 100 之间的数字')
    }
    taxRate = round2(r * 100) / 100
  }
  const taxAmount = taxRate > 0 ? round2(totalAmount * (1 + taxRate / 100)) : 0

  const result = {
    customerCreated: false,
    customerLinked: false,
    customerInfoKept: false,
    productCreated: 0,
    productLinked: 0,
    docCreated: false,
    docUpdated: false
  }

  // 项目报价单专用：类目结构（JSON）、项目说明、报价说明、配色方案
  let pqCategoriesJson = ''
  if (type === '项目报价单' && Array.isArray(payload.categories)) {
    pqCategoriesJson = JSON.stringify(payload.categories)
  }
  const projectDesc = str(payload.projectDesc)
  const quoteNote = str(payload.quoteNote)
  const colorScheme = str(payload.colorScheme)

  const now = nowText()
  // 新单据的默认账期取基础设置中的默认值（已有单据保持不变）
  const defaultDueDays = Math.round(Number(getSettings().defaultDueDays) || 30)

  db.exec('BEGIN IMMEDIATE')
  try {
    // ===== 1. 客户归档 =====
    let customerId
    const existCustomer = db.prepare('SELECT * FROM customers WHERE name = ?').get(customerName)
    if (existCustomer) {
      customerId = existCustomer.id
      result.customerLinked = true
      // 只在档案字段为空时补填，绝不覆盖已有信息
      const patch = {}
      if (!existCustomer.contact && str(payload.customerContact)) patch.contact = str(payload.customerContact)
      if (!existCustomer.phone && str(payload.customerPhone)) patch.phone = str(payload.customerPhone)
      if (!existCustomer.address && str(payload.customerAddress)) patch.address = str(payload.customerAddress)
      // 用户填写的联系信息与档案已有值不一致：保留档案原值，仅做标记，由前端提示用户
      if (existCustomer.contact && str(payload.customerContact) && existCustomer.contact !== str(payload.customerContact)) {
        result.customerInfoKept = true
      }
      if (existCustomer.phone && str(payload.customerPhone) && existCustomer.phone !== str(payload.customerPhone)) {
        result.customerInfoKept = true
      }
      if (existCustomer.address && str(payload.customerAddress) && existCustomer.address !== str(payload.customerAddress)) {
        result.customerInfoKept = true
      }
      const keys = Object.keys(patch)
      if (keys.length > 0) {
        const sets = keys.map((k) => k + ' = ?').join(', ')
        const args = keys.map((k) => patch[k])
        args.push(now)
        args.push(customerId)
        db.prepare('UPDATE customers SET ' + sets + ', updated_at = ? WHERE id = ?').run(...args)
      }
    } else {
      const info = db
        .prepare(`INSERT INTO customers
          (name, short_name, contact, phone, address, level, credit_limit, receivable, tags, remark, source, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          customerName,
          customerName.slice(0, 4),
          str(payload.customerContact),
          str(payload.customerPhone),
          str(payload.customerAddress),
          'C',
          0,
          0,
          '',
          '开单自动归档',
          'doc',
          now,
          now
        )
      customerId = info.lastInsertRowid
      result.customerCreated = true
    }

    // ===== 2. 产品归档（名称 + 型号 + 规格 判重，同名不同规格分别建档） =====
    const productIds = []
    for (const it of items) {
      let existProduct = db
        .prepare('SELECT * FROM products WHERE name = ? AND model = ? AND spec = ?')
        .get(it.name, it.model, it.spec)
      // 明细里没写全型号/规格时，若档案中只有一个符合条件的同名产品就直接关联，避免生成重复档案；
      // 若同名产品有多个且无法区分，则给出明确提示，避免错误合并
      if (!existProduct && (!it.model || !it.spec)) {
        let candidates = db.prepare('SELECT * FROM products WHERE name = ?').all(it.name)
        if (it.model) candidates = candidates.filter((p) => p.model === it.model)
        if (it.spec) candidates = candidates.filter((p) => p.spec === it.spec)
        if (candidates.length === 1) {
          existProduct = candidates[0]
        } else if (candidates.length > 1) {
          throw new HttpError(
            400,
            '第 ' + it.line_no + ' 行：产品「' + it.name + '」在档案中已有 ' + candidates.length + ' 种不同型号/规格，请补充型号或规格后再保存，以免重复建档'
          )
        }
      }
      if (existProduct) {
        productIds.push(existProduct.id)
        result.productLinked += 1
      } else {
        const info = db
          .prepare(`INSERT INTO products
            (code, name, brand, model, spec, category, unit, price, cost, stock, safe_stock, remark, source, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(
            it.code,
            it.name,
            '',
            it.model,
            it.spec,
            '其他',
            it.unit,
            it.price,
            0,
            0,
            0,
            '开单自动归档',
            'doc',
            now,
            now
          )
        productIds.push(info.lastInsertRowid)
        result.productCreated += 1
      }
    }

    // ===== 3. 单据 upsert（按 doc_no 幂等） =====
    const existDoc = db.prepare('SELECT id FROM docs WHERE doc_no = ?').get(docNo)
    let docId
    if (existDoc) {
      docId = existDoc.id
      result.docUpdated = true
      db.prepare(`UPDATE docs SET
          type = ?, customer_id = ?, customer_name = ?, customer_contact = ?, customer_phone = ?,
          customer_address = ?, doc_date = ?, amount = ?, raw_amount = ?, discount_percent = ?, discount_amount = ?,
          tax_amount = ?, tax_rate = ?,
          status = ?, owner = ?, remark = ?, updated_at = ?,
          pq_categories = ?, project_desc = ?, quote_note = ?, color_scheme = ?,
          title = ?, company_name = ?, company_phone = ?,
          edit_count = edit_count + 1, last_edited_at = ?, last_editor = ?
        WHERE id = ?`)
        .run(
          type,
          customerId,
          customerName,
          str(payload.customerContact),
          str(payload.customerPhone),
          str(payload.customerAddress),
          str(payload.date) || now.slice(0, 10),
          totalAmount,
          rawAmount,
          discountPercent,
          discountAmount,
          taxAmount,
          taxRate,
          str(payload.status) || '草稿',
          str(payload.owner),
          str(payload.remark),
          now,
          pqCategoriesJson,
          projectDesc,
          quoteNote,
          colorScheme,
          str(payload.title),
          str(payload.companyName),
          str(payload.companyPhone),
          now,
          editor,
          docId
        )
      db.prepare('DELETE FROM doc_items WHERE doc_id = ?').run(docId)
    } else {
      const info = db
        .prepare(`INSERT INTO docs
          (doc_no, type, customer_id, customer_name, customer_contact, customer_phone, customer_address,
           doc_date, amount, raw_amount, discount_percent, discount_amount, tax_amount, tax_rate, status, owner, remark,
           pq_categories, project_desc, quote_note, color_scheme, title, company_name, company_phone, due_days, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          docNo,
          type,
          customerId,
          customerName,
          str(payload.customerContact),
          str(payload.customerPhone),
          str(payload.customerAddress),
          str(payload.date) || now.slice(0, 10),
          totalAmount,
          rawAmount,
          discountPercent,
          discountAmount,
          taxAmount,
          taxRate,
          str(payload.status) || '草稿',
          str(payload.owner),
          str(payload.remark),
          pqCategoriesJson,
          projectDesc,
          quoteNote,
          colorScheme,
          str(payload.title),
          str(payload.companyName),
          str(payload.companyPhone),
          defaultDueDays,
          now,
          now
        )
      docId = info.lastInsertRowid
      result.docCreated = true
    }

    // ===== 4. 写入明细快照（与产品档案解耦，后续改档案不影响历史） =====
    const itemStmt = db.prepare(`INSERT INTO doc_items
      (doc_id, line_no, product_id, code, name, model, spec, unit, qty, price, discount, amount, image, remark)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      itemStmt.run(docId, it.line_no, productIds[i], it.code, it.name, it.model, it.spec, it.unit,
        it.qty, it.price, it.discount, it.amount, it.image, it.remark)
    }

    db.exec('COMMIT')
    return { docId, result, totalAmount }
  } catch (e) {
    try {
      db.exec('ROLLBACK')
    } catch (ignore) {
      // 回滚失败不再抛出，保留原始错误
    }
    throw e
  }
}

// ---------- 装机单保存（含版本管理） ----------
// 与普通单据的区别：
// 1. 不强制客户名称（标题/备注/任一有效配件也可保存）
// 2. 不显示单据编号（内部仍有 doc_no 作唯一键）
// 3. 业务数据变化后再保存，自动创建新版本，保留旧版本
// 4. 支持「另存为新单据」
// 5. 公司信息为单据快照，不修改全局设置

// 装机单配件图标白名单（与前端 ICONS 对应），非法值一律置空
const INSTALL_ICON_KEYS = ['cpu', 'mobo', 'fan', 'ram', 'ssd', 'gpu', 'psu', 'case', 'monitor', 'keyboard', 'mouse', 'headset', 'box']
// 装机单主题白名单（15 套配色），非法值一律置空（前端按默认 orange 处理）
const INSTALL_THEMES = ['orange', 'blue', 'green', 'purple', 'red', 'teal', 'amber', 'pink', 'indigo', 'brown', 'sunset', 'ocean', 'forest', 'grape', 'aurora']

function installEffectiveItems(rawItems) {
  const items = []
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i]
    const name = str(it.name)
    if (!name) continue
    const qty = num(it.qty)
    if (!(qty > 0)) throw new HttpError(400, '第 ' + (i + 1) + ' 行配件：数量必须大于 0')
    const price = num(it.price)
    if (price < 0) throw new HttpError(400, '第 ' + (i + 1) + ' 行配件：单价不能为负数')
    let image = str(it.image)
    if (image && !image.startsWith('/uploads/')) image = ''
    let icon = str(it.icon)
    if (INSTALL_ICON_KEYS.indexOf(icon) < 0) icon = ''
    items.push({
      line_no: items.length + 1,
      code: str(it.code),
      name,
      model: str(it.model),
      spec: str(it.spec),
      unit: str(it.unit) || '个',
      qty,
      price,
      discount: 100,
      amount: round2(qty * price),
      image,
      icon,
      remark: str(it.remark)
    })
  }
  return items
}

// 服务项清洗：只保留非空字符串，最多 20 项，每项截断 30 字，返回 JSON 数组字符串
function installServicesJson(raw) {
  let arr = []
  if (Array.isArray(raw)) arr = raw
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw)
      if (Array.isArray(p)) arr = p
    } catch (e) { arr = [] }
  }
  const out = []
  for (const s of arr) {
    const t = String(s == null ? '' : s).trim().slice(0, 30)
    if (t) out.push(t)
    if (out.length >= 20) break
  }
  return JSON.stringify(out)
}

// 判断装机单是否有有效业务数据（标题/客户/配件/备注任一非空）
function installHasEffectiveData(payload, items) {
  if (str(payload.title).length > 0) return true
  if (str(payload.customerName).length > 0) return true
  if (str(payload.customerPhone).length > 0) return true
  if (str(payload.remark).length > 0) return true
  if (items.length > 0) return true
  return false
}

// 生成业务数据快照字符串（用于判断是否发生变化）
function installSnapshot(payload, items) {
  return JSON.stringify({
    title: str(payload.title),
    companyName: str(payload.companyName),
    companyPhone: str(payload.companyPhone),
    companyAddress: str(payload.companyAddress),
    customerName: str(payload.customerName),
    customerPhone: str(payload.customerPhone),
    date: str(payload.date),
    tags: str(payload.tags),
    remark: str(payload.remark),
    theme: str(payload.theme),
    billNo: str(payload.billNo),
    services: str(payload.services),
    qrcode: str(payload.qrcode),
    discount: String(round2(num(payload.discount)) || 0),
    taxInput: str(payload.taxInput),
    taxRate: String(round2(num(payload.taxRate)) || 0),
    items: items.map((it) => ({
      n: it.name, m: it.model, s: it.spec, u: it.unit, q: it.qty, p: it.price, r: it.remark, i: it.icon || ''
    }))
  })
}

function saveInstallDoc(payload, operator) {
  const editor = str(operator)
  const type = '装机单'
  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const items = installEffectiveItems(rawItems)

  // 有效数据校验：完全空白不允许保存
  if (!installHasEffectiveData(payload, items)) {
    throw new HttpError(400, '当前单据没有有效内容，请至少填写标题、客户信息、配件明细或备注后再保存。')
  }

  const title = str(payload.title)
  const customerName = str(payload.customerName)
  const customerPhone = str(payload.customerPhone)
  const remark = str(payload.remark)
  const tags = str(payload.tags)
  const companyName = str(payload.companyName)
  const companyPhone = str(payload.companyPhone)
  const companyAddress = str(payload.companyAddress)
  let companyLogo = str(payload.companyLogo)
  if (companyLogo && !companyLogo.startsWith('/uploads/')) companyLogo = ''

  // 功能补偿新增字段：主题/展示编号/服务项/二维码/优惠/含税
  let theme = str(payload.theme)
  if (INSTALL_THEMES.indexOf(theme) < 0) theme = ''
  const billNo = str(payload.billNo).slice(0, 40)
  const services = installServicesJson(payload.services)
  let qrcode = str(payload.qrcode)
  if (qrcode && !qrcode.startsWith('/uploads/')) qrcode = ''
  // 税率（百分数，0-100，默认 13 由前端传入）
  let taxRate = num(payload.taxRate)
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) taxRate = 13
  taxRate = round2(taxRate)
  // 含税金额输入值：原样保存字符串用于还原；数值部分存入 tax_amount 供列表/统计
  const taxInput = str(payload.taxInput).slice(0, 32)
  const taxAmount = taxInput && Number.isFinite(Number(taxInput)) ? round2(Number(taxInput)) : 0

  // 金额用整数分运算：原价合计（分）− 大客户优惠（分）= 实际整机总价（分）
  const rawCents = items.reduce((s, it) => s + Math.round(it.amount * 100), 0)
  let discountCents = Math.round(num(payload.discount) * 100)
  if (!Number.isFinite(discountCents) || discountCents < 0) discountCents = 0
  if (discountCents > rawCents) discountCents = rawCents
  const totalCents = rawCents - discountCents
  const rawAmount = rawCents / 100
  const discountAmount = discountCents / 100
  const totalAmount = totalCents / 100

  // 内部 doc_no（不展示给用户），格式：ZJ-日期-序号
  const now = nowText()
  const dateStr = now.slice(0, 10).replace(/-/g, '')
  const isSaveAsNew = payload.saveAsNew === true
  const existingId = Number(payload.id) || 0
  const existingRootId = Number(payload.rootDocId) || 0

  const result = {
    customerCreated: false, customerLinked: false,
    productCreated: 0, productLinked: 0,
    docCreated: false, docUpdated: false, versionNo: 1, noChange: false
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    // ===== 客户归档（装机单客户名为空时不归档） =====
    let customerId = null
    if (customerName.length > 0) {
      const existCustomer = db.prepare('SELECT * FROM customers WHERE name = ?').get(customerName)
      if (existCustomer) {
        customerId = existCustomer.id
        result.customerLinked = true
      } else {
        const info = db
          .prepare(`INSERT INTO customers
            (name, short_name, contact, phone, address, level, credit_limit, receivable, tags, remark, source, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(customerName, customerName.slice(0, 4), '', customerPhone, '', 'C', 0, 0, '', '装机单自动归档', 'doc', now, now)
        customerId = info.lastInsertRowid
        result.customerCreated = true
      }
    }

    // ===== 产品归档（配件自动归档，类别设为「配件」） =====
    const productIds = []
    for (const it of items) {
      let existProduct = db
        .prepare('SELECT * FROM products WHERE name = ? AND model = ? AND spec = ?')
        .get(it.name, it.model, it.spec)
      if (!existProduct && (!it.model || !it.spec)) {
        let candidates = db.prepare('SELECT * FROM products WHERE name = ?').all(it.name)
        if (it.model) candidates = candidates.filter((p) => p.model === it.model)
        if (it.spec) candidates = candidates.filter((p) => p.spec === it.spec)
        if (candidates.length === 1) {
          existProduct = candidates[0]
        } else if (candidates.length > 1) {
          throw new HttpError(400, '配件「' + it.name + '」在档案中已有 ' + candidates.length + ' 种不同型号/规格，请补充型号或规格')
        }
      }
      if (existProduct) {
        productIds.push(existProduct.id)
        result.productLinked += 1
      } else {
        const info = db
          .prepare(`INSERT INTO products
            (code, name, brand, model, spec, category, part_category, unit, price, cost, stock, safe_stock, remark, source, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(it.code, it.name, '', it.model, it.spec, '配件', '', it.unit, it.price, 0, 0, 0, '装机单自动归档', 'doc', now, now)
        productIds.push(info.lastInsertRowid)
        result.productCreated += 1
      }
    }

    // ===== 版本管理 =====
    let docId
    let versionNo = 1
    let rootDocId

    if (existingId > 0 && !isSaveAsNew) {
      // 修改已有单据：判断是否变化，变化则创建新版本
      const oldRow = db.prepare('SELECT * FROM docs WHERE id = ?').get(existingId)
      if (!oldRow) throw new HttpError(404, '单据不存在')
      const oldItems = loadItems(oldRow.id)
      const oldSnap = installSnapshot(
        {
          title: oldRow.title, companyName: oldRow.company_name, companyPhone: oldRow.company_phone,
          companyAddress: oldRow.company_address, customerName: oldRow.customer_name,
          customerPhone: oldRow.customer_phone, date: oldRow.doc_date, tags: oldRow.tags,
          remark: oldRow.remark, theme: oldRow.theme || '', billNo: oldRow.bill_no || '',
          services: oldRow.services || '', qrcode: oldRow.qrcode || '',
          discount: String(oldRow.discount_amount || 0), taxInput: oldRow.tax_input || '',
          taxRate: String(oldRow.tax_rate || 0)
        },
        oldItems
      )
      const newSnap = installSnapshot(payload, items)
      if (oldSnap === newSnap) {
        // 业务数据完全相同，不创建新版本
        db.exec('COMMIT')
        result.noChange = true
        return { docId: oldRow.id, result, totalAmount, versionNo: oldRow.version_no }
      }
      // 创建新版本
      rootDocId = oldRow.root_doc_id || oldRow.id
      const maxVer = db.prepare('SELECT MAX(version_no) AS m FROM docs WHERE root_doc_id = ?').get(rootDocId)
      versionNo = Number(maxVer.m || 0) + 1
      db.prepare('UPDATE docs SET is_latest = 0 WHERE root_doc_id = ?').run(rootDocId)
      const newDocNo = oldRow.doc_no + '-V' + versionNo
      const info = db
        .prepare(`INSERT INTO docs
          (doc_no, type, customer_id, customer_name, customer_contact, customer_phone, customer_address,
           doc_date, amount, raw_amount, discount_percent, discount_amount, tax_amount, tax_rate,
           status, owner, remark, created_at, updated_at,
           root_doc_id, version_no, is_latest, title, tags,
           company_name, company_phone, company_address, company_logo,
           theme, bill_no, services, qrcode, tax_input)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          newDocNo, type, customerId, customerName, '', customerPhone, '',
          str(payload.date) || now.slice(0, 10), totalAmount, rawAmount, 0, discountAmount, taxAmount, taxRate,
          str(payload.status) || '已提交', str(payload.owner), remark, now, now,
          rootDocId, versionNo, 1, title, tags,
          companyName, companyPhone, companyAddress, companyLogo,
          theme, billNo, services, qrcode, taxInput
        )
      docId = info.lastInsertRowid
      result.docUpdated = true
      result.versionNo = versionNo
      // 修改留痕：新版本继承旧版本的修改次数并累加 1
      const oldCount = oldRow.edit_count == null ? 0 : Number(oldRow.edit_count)
      db.prepare('UPDATE docs SET edit_count = ?, last_edited_at = ?, last_editor = ? WHERE id = ?')
        .run(oldCount + 1, now, editor, docId)
    } else {
      // 新建单据（或另存为新单据）
      // 生成内部 doc_no
      const head = 'ZJ-' + dateStr + '-'
      const existing = db.prepare("SELECT doc_no FROM docs WHERE doc_no LIKE ?").all(head + '%')
      let maxSeq = 0
      for (const e of existing) {
        const tail = e.doc_no.substring(head.length).split('-')[0]
        const v = parseInt(tail, 10)
        if (!isNaN(v) && v > maxSeq) maxSeq = v
      }
      const seq = String(maxSeq + 1).padStart(4, '0')
      const docNo = head + seq
      const info = db
        .prepare(`INSERT INTO docs
          (doc_no, type, customer_id, customer_name, customer_contact, customer_phone, customer_address,
           doc_date, amount, raw_amount, discount_percent, discount_amount, tax_amount, tax_rate,
           status, owner, remark, created_at, updated_at,
           root_doc_id, version_no, is_latest, title, tags,
           company_name, company_phone, company_address, company_logo,
           theme, bill_no, services, qrcode, tax_input)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          docNo, type, customerId, customerName, '', customerPhone, '',
          str(payload.date) || now.slice(0, 10), totalAmount, rawAmount, 0, discountAmount, taxAmount, taxRate,
          str(payload.status) || '已提交', str(payload.owner), remark, now, now,
          null, 1, 1, title, tags,
          companyName, companyPhone, companyAddress, companyLogo,
          theme, billNo, services, qrcode, taxInput
        )
      docId = info.lastInsertRowid
      // root_doc_id 设为自身 id
      db.prepare('UPDATE docs SET root_doc_id = ? WHERE id = ?').run(docId, docId)
      rootDocId = docId
      versionNo = 1
      result.docCreated = true
      result.versionNo = 1
    }

    // ===== 写入明细快照 =====
    const itemStmt = db.prepare(`INSERT INTO doc_items
      (doc_id, line_no, product_id, code, name, model, spec, unit, qty, price, discount, amount, image, icon, remark)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      itemStmt.run(docId, it.line_no, productIds[i] || null, it.code, it.name, it.model, it.spec, it.unit,
        it.qty, it.price, it.discount, it.amount, it.image, it.icon || '', it.remark)
    }

    db.exec('COMMIT')
    return { docId, result, totalAmount, versionNo, rootDocId }
  } catch (e) {
    try { db.exec('ROLLBACK') } catch (ignore) {}
    throw e
  }
}

// ---------- 商品分类字典（基础设置-分类管理，存 app_settings.productCategories） ----------
const PRODUCT_CATEGORY_DEFAULTS = ['整机', '配件', '外设', '耗材', '服务', '其他']

function getProductCategories() {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('productCategories')
  let names
  if (!row) {
    names = PRODUCT_CATEGORY_DEFAULTS
  } else {
    try {
      const arr = JSON.parse(row.value)
      names = Array.isArray(arr) ? arr.map((s) => String(s)) : []
    } catch (e) {
      names = []
    }
  }
  return names.map((n) => ({ name: n }))
}

function saveProductCategories(payload) {
  // 兼容两种入参：{ categories: [...] } 或直接 [...]
  const list = Array.isArray(payload) ? payload : (Array.isArray(payload.categories) ? payload.categories : [])
  const cleaned = []
  for (const c of list) {
    let s
    if (c && typeof c === 'object') s = str(c.name)
    else s = str(c)
    s = s.trim()
    if (s.length > 0 && !cleaned.includes(s)) cleaned.push(s)
  }
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('productCategories', JSON.stringify(cleaned))
  return getProductCategories()
}

// ---------- 配件分类管理 ----------
function getPartCategories() {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('partCategories')
  let names
  if (!row) {
    names = ['CPU', '主板', '散热器', '内存', '固态硬盘', '机械硬盘', '显卡', '电源', '机箱', '显示器', '键盘', '鼠标', '外设', '其他配件']
  } else {
    try {
      const arr = JSON.parse(row.value)
      names = Array.isArray(arr) ? arr.map((s) => String(s)) : []
    } catch (e) {
      names = []
    }
  }
  return names.map((n) => ({ name: n }))
}

function savePartCategories(payload) {
  const list = Array.isArray(payload.categories) ? payload.categories : []
  const cleaned = []
  for (const c of list) {
    let s
    if (c && typeof c === 'object') s = str(c.name)
    else s = str(c)
    if (s.length > 0) cleaned.push(s)
  }
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('partCategories', JSON.stringify(cleaned))
  return getPartCategories()
}

function deleteDoc(id) {
  const row = db.prepare('SELECT id, type, root_doc_id FROM docs WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '单据不存在')
  db.exec('BEGIN IMMEDIATE')
  try {
    if (row.type === '装机单') {
      // 装机单：删除同一 root_doc_id 下的所有版本
      const rootId = row.root_doc_id || row.id
      const all = db.prepare('SELECT id FROM docs WHERE root_doc_id = ?').all(rootId)
      for (const r of all) {
        db.prepare('DELETE FROM doc_items WHERE doc_id = ?').run(r.id)
        db.prepare('DELETE FROM docs WHERE id = ?').run(r.id)
      }
    } else {
      db.prepare('DELETE FROM doc_items WHERE doc_id = ?').run(id)
      db.prepare('DELETE FROM docs WHERE id = ?').run(id)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

// ---------- 库存 ----------
function mapStockLog(r) {
  return {
    id: r.id,
    productId: r.product_id,
    type: r.type,
    qty: r.qty,
    beforeStock: r.before_stock,
    afterStock: r.after_stock,
    code: r.code,
    name: r.name,
    model: r.model,
    spec: r.spec,
    unit: r.unit,
    remark: r.remark,
    operator: r.operator,
    time: r.created_at
  }
}

function listStockLogs(limitText) {
  let limit = Number(limitText)
  if (!Number.isFinite(limit) || limit <= 0) limit = 50
  if (limit > 500) limit = 500
  return db.prepare('SELECT * FROM stock_logs ORDER BY id DESC LIMIT ?').all(limit).map(mapStockLog)
}

/**
 * 入库/出库：单事务更新产品库存并写入流水，失败整体回滚
 * 出库不允许库存变成负数
 */
function moveStock(payload) {
  const productId = Number(payload.productId)
  if (!Number.isFinite(productId) || productId <= 0) throw new HttpError(400, '请选择要出入库的产品')
  const type = str(payload.type)
  if (type !== '入库' && type !== '出库') throw new HttpError(400, '出入库类型只能是「入库」或「出库」')
  const qty = num(payload.qty)
  if (!(qty > 0)) throw new HttpError(400, '数量必须大于 0')
  const remark = str(payload.remark)
  const operator = str(payload.operator) || 'admin'
  const now = nowText()

  db.exec('BEGIN IMMEDIATE')
  try {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(productId)
    if (!p) throw new HttpError(404, '产品档案不存在，无法出入库')
    const before = Number(p.stock)
    const after = round2(type === '入库' ? before + qty : before - qty)
    if (type === '出库' && after < 0) {
      throw new HttpError(
        400,
        '库存不足：「' + p.name + '」当前库存 ' + before + ' ' + p.unit + '，本次出库 ' + qty + ' ' + p.unit + '，未做任何变更'
      )
    }
    db.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?').run(after, now, productId)
    const info = db
      .prepare(`INSERT INTO stock_logs
        (product_id, type, qty, before_stock, after_stock, code, name, model, spec, unit, remark, operator, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(productId, type, qty, before, after, p.code, p.name, p.model, p.spec, p.unit, remark, operator, now)
    db.exec('COMMIT')
    const log = db.prepare('SELECT * FROM stock_logs WHERE id = ?').get(info.lastInsertRowid)
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId)
    return { log: mapStockLog(log), product: mapProduct(product) }
  } catch (e) {
    try {
      db.exec('ROLLBACK')
    } catch (ignore) {
      // 回滚失败不再抛出，保留原始错误
    }
    throw e
  }
}

// ---------- 合同 ----------
const CONTRACT_STATUS = ['草稿', '执行中', '已验收', '已终止']

function mapContract(r) {
  let fields = {}
  try { fields = JSON.parse(r.fields_json || '{}') } catch (e) { fields = {} }
  let items = []
  try { items = JSON.parse(r.items_json || '[]') } catch (e) { items = [] }
  return {
    id: r.id,
    contractNo: r.contract_no,
    type: r.type || 'legacy',
    title: r.title || '',
    customerId: r.customer_id == null ? '' : String(r.customer_id),
    customerName: r.customer_name,
    customerContact: r.customer_contact,
    customerPhone: r.customer_phone,
    amount: r.amount,
    signDate: r.sign_date,
    status: r.status,
    owner: r.owner,
    docNo: r.doc_no,
    remark: r.remark,
    time: r.updated_at,
    fields,
    items,
    sealCompany: r.seal_company || '',
    sealSign: r.seal_sign || '',
    // 结款模块字段（合同与销售单共用同一套结款逻辑）
    settledAmount: r.settled_amount || 0,
    dueDays: r.due_days == null ? 30 : Number(r.due_days),
    settledAt: r.settled_at || '',
    // 修改留痕（首次创建为 0，之后每次保存累加）
    editCount: r.edit_count == null ? 0 : Number(r.edit_count),
    lastEditedAt: r.last_edited_at || '',
    lastEditor: r.last_editor || ''
  }
}

function listContracts(keyword, status) {
  const kw = str(keyword)
  const st = str(status)
  let rows = db.prepare('SELECT * FROM contracts ORDER BY sign_date DESC, id DESC').all()
  if (kw) {
    const k = kw.toLowerCase()
    rows = rows.filter(
      (r) =>
        String(r.contract_no).toLowerCase().includes(k) ||
        String(r.customer_name).toLowerCase().includes(k) ||
        String(r.doc_no).toLowerCase().includes(k) ||
        String(r.owner).toLowerCase().includes(k)
    )
  }
  if (st && st !== '全部') {
    rows = rows.filter((r) => r.status === st)
  }
  return rows.map(mapContract)
}

function contractFields(payload, row) {
  const contractNo = str(payload.contractNo) || (row ? row.contract_no : '')
  if (!contractNo) throw new HttpError(400, '合同编号不能为空')
  const customerName = str(payload.customerName) || (row ? row.customer_name : '')
  if (!customerName) throw new HttpError(400, '客户名称不能为空')
  const signDate = str(payload.signDate) || (row ? row.sign_date : '')
  if (!signDate) throw new HttpError(400, '签订日期不能为空')
  const status = str(payload.status) || (row ? row.status : '草稿')
  if (!CONTRACT_STATUS.includes(status)) {
    throw new HttpError(400, '合同状态只能是：' + CONTRACT_STATUS.join(' / '))
  }
  const amount = payload.amount === undefined ? (row ? row.amount : 0) : num(payload.amount)
  if (amount < 0) throw new HttpError(400, '合同金额不能为负数')
  const customer = db.prepare('SELECT * FROM customers WHERE name = ?').get(customerName)
  // 模板化合同（产品购销 / 施工）专用字段
  const type = str(payload.type) || (row ? row.type : 'legacy') || 'legacy'
  const title = payload.title === undefined ? (row ? row.title : '') : str(payload.title)
  const fieldsJson = payload.fields && typeof payload.fields === 'object' ? JSON.stringify(payload.fields) : (row ? row.fields_json : '{}')
  const itemsJson = Array.isArray(payload.items) ? JSON.stringify(payload.items) : (row ? row.items_json : '[]')
  const sealCompany = payload.sealCompany === undefined ? (row ? row.seal_company : '') : str(payload.sealCompany)
  const sealSign = payload.sealSign === undefined ? (row ? row.seal_sign : '') : str(payload.sealSign)
  return {
    contractNo,
    customerId: customer ? customer.id : null,
    customerName,
    customerContact: payload.customerContact === undefined
      ? (customer ? customer.contact : (row ? row.customer_contact : ''))
      : str(payload.customerContact),
    customerPhone: payload.customerPhone === undefined
      ? (customer ? customer.phone : (row ? row.customer_phone : ''))
      : str(payload.customerPhone),
    amount,
    signDate,
    status,
    owner: str(payload.owner) || (row ? row.owner : ''),
    docNo: payload.docNo === undefined ? (row ? row.doc_no : '') : str(payload.docNo),
    remark: payload.remark === undefined ? (row ? row.remark : '') : str(payload.remark),
    type, title, fieldsJson, itemsJson, sealCompany, sealSign
  }
}

function createContract(payload, operator) {
  const editor = str(operator)
  const f = contractFields(payload, null)
  const now = nowText()
  const exists = db.prepare('SELECT * FROM contracts WHERE contract_no = ?').get(f.contractNo)
  if (exists) {
    // 同一合同编号视为再次保存：更新内容，不重复创建；并累加修改次数
    db.prepare(`UPDATE contracts SET
        customer_id = ?, customer_name = ?, customer_contact = ?, customer_phone = ?,
        amount = ?, sign_date = ?, status = ?, owner = ?, doc_no = ?, remark = ?, updated_at = ?,
        type = ?, title = ?, fields_json = ?, items_json = ?, seal_company = ?, seal_sign = ?,
        edit_count = edit_count + 1, last_edited_at = ?, last_editor = ?
      WHERE id = ?`)
      .run(f.customerId, f.customerName, f.customerContact, f.customerPhone,
        f.amount, f.signDate, f.status, f.owner, f.docNo, f.remark, now,
        f.type, f.title, f.fieldsJson, f.itemsJson, f.sealCompany, f.sealSign,
        now, editor, exists.id)
    return {
      contract: mapContract(db.prepare('SELECT * FROM contracts WHERE id = ?').get(exists.id)),
      created: false,
      updated: true
    }
  }
  const info = db.prepare(`INSERT INTO contracts
    (contract_no, customer_id, customer_name, customer_contact, customer_phone,
     amount, sign_date, status, owner, doc_no, remark,
     type, title, fields_json, items_json, seal_company, seal_sign, due_days, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(f.contractNo, f.customerId, f.customerName, f.customerContact, f.customerPhone,
      f.amount, f.signDate, f.status, f.owner, f.docNo, f.remark,
      f.type, f.title, f.fieldsJson, f.itemsJson, f.sealCompany, f.sealSign,
      Math.round(Number(getSettings().defaultDueDays) || 30), now, now)
  return {
    contract: mapContract(db.prepare('SELECT * FROM contracts WHERE id = ?').get(info.lastInsertRowid)),
    created: true,
    updated: false
  }
}

function updateContract(id, payload, operator) {
  const row = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '合同不存在')
  const f = contractFields(payload, row)
  if (f.contractNo !== row.contract_no) {
    const dup = db.prepare('SELECT id FROM contracts WHERE contract_no = ? AND id <> ?').get(f.contractNo, id)
    if (dup) throw new HttpError(409, '已存在相同合同编号的合同，不能重复保存')
  }
  db.prepare(`UPDATE contracts SET
      contract_no = ?, customer_id = ?, customer_name = ?, customer_contact = ?, customer_phone = ?,
      amount = ?, sign_date = ?, status = ?, owner = ?, doc_no = ?, remark = ?, updated_at = ?,
      type = ?, title = ?, fields_json = ?, items_json = ?, seal_company = ?, seal_sign = ?,
      edit_count = edit_count + 1, last_edited_at = ?, last_editor = ?
    WHERE id = ?`)
    .run(f.contractNo, f.customerId, f.customerName, f.customerContact, f.customerPhone,
      f.amount, f.signDate, f.status, f.owner, f.docNo, f.remark, nowText(),
      f.type, f.title, f.fieldsJson, f.itemsJson, f.sealCompany, f.sealSign,
      nowText(), str(operator), id)
  return mapContract(db.prepare('SELECT * FROM contracts WHERE id = ?').get(id))
}

function getContract(id) {
  const row = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '合同不存在')
  return mapContract(row)
}

// ---------- 合同 Word 导出（基于 docx 范本占位替换） ----------
const { readZip, writeZip } = require('./zip-util')
const TEMPLATES_DIR = path.join(__dirname, 'templates')

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// 将锚点文本之后的第一个「带下划线且文本为空白」的 run 替换为指定值
function replaceUnderlinedAfter(xml, anchor, value) {
  const idx = xml.indexOf(anchor)
  if (idx < 0) return xml
  let pos = idx + anchor.length
  while (true) {
    const rStart = xml.indexOf('<w:r>', pos)
    if (rStart < 0) return xml
    const rEnd = xml.indexOf('</w:r>', rStart)
    if (rEnd < 0) return xml
    const run = xml.slice(rStart, rEnd + 6)
    const tMatch = run.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/)
    const txt = tMatch ? tMatch[1] : ''
    if (/<w:u\b/.test(run) && txt.trim() === '' && txt.length > 0) {
      const safe = xmlEscape(value)
      const newRun = run.replace(/<w:t([^>]*)>[\s\S]*?<\/w:t>/, (m, attrs) => {
        const a = String(attrs || '')
        const hasPreserve = a.indexOf('xml:space') >= 0
        return '<w:t' + a + (hasPreserve ? '' : ' xml:space="preserve"') + '>' + safe + '</w:t>'
      })
      return xml.slice(0, rStart) + newRun + xml.slice(rEnd + 6)
    }
    pos = rEnd + 6
  }
}

// 生成产品表格行（含表头行：商品名称/单价/数量/总价 + 数据行 + 总计行，整体替换 tbl 内的 tr）
function purchaseHeaderCell(text) {
  return '<w:tc><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r></w:p></w:tc>'
}

function buildPurchaseRows(items) {
  const list = Array.isArray(items) ? items.filter(it => it && (it.name || it.price || it.qty)) : []
  let xml = '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
    + purchaseHeaderCell('商品名称') + purchaseHeaderCell('单价') + purchaseHeaderCell('数量') + purchaseHeaderCell('总价')
    + '</w:tr>'
  for (const it of list) {
    const name = xmlEscape(it.name || '')
    const price = it.price == null ? '' : Number(it.price).toFixed(2)
    const qty = it.qty == null ? '' : Number(it.qty)
    const total = it.total == null ? '' : Number(it.total).toFixed(2)
    xml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
    xml += cellXml(name) + cellXml(price) + cellXml(qty) + cellXml(total)
    xml += '</w:tr>'
  }
  const grand = list.reduce((s, it) => s + (Number(it.total) || 0), 0)
  // 总计行：前三列合并，与范本版式一致
  xml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
  xml += '<w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">总计</w:t></w:r></w:p></w:tc>'
  xml += '<w:tc><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + grand.toFixed(2) + '</w:t></w:r></w:p></w:tc>'
  xml += '</w:tr>'
  return xml
}

function cellXml(text) {
  return '<w:tc><w:p><w:r><w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r></w:p></w:tc>'
}

// 替换锚点后第一个「带下划线格式」run 的文本（不论原文本空白与否；值为空时跳过保留模板默认）
function replaceUnderlinedTextAfter(xml, anchor, value) {
  if (value === null || value === undefined || String(value).trim() === '') return xml
  const idx = xml.indexOf(anchor)
  if (idx < 0) return xml
  let pos = idx + anchor.length
  while (true) {
    const rStart = xml.indexOf('<w:r>', pos)
    if (rStart < 0) return xml
    const rEnd = xml.indexOf('</w:r>', rStart)
    if (rEnd < 0) return xml
    const run = xml.slice(rStart, rEnd + 6)
    if (/<w:u\b/.test(run)) {
      const safe = xmlEscape(value)
      const newRun = run.replace(/<w:t([^>]*)>[\s\S]*?<\/w:t>/, (m, attrs) => {
        const a = String(attrs || '')
        const hasPreserve = a.indexOf('xml:space') >= 0
        return '<w:t' + a + (hasPreserve ? '' : ' xml:space="preserve"') + '>' + safe + '</w:t>'
      })
      return xml.slice(0, rStart) + newRun + xml.slice(rEnd + 6)
    }
    pos = rEnd + 6
  }
}

// 在包含锚点的段落内，按下划线空白 run 的顺序位置依次填入 values（位置一一对应，空值保留空白下划线）
function fillUnderlinedInPara(xml, anchor, values) {
  const idx = xml.indexOf(anchor)
  if (idx < 0) return xml
  const ps = Math.max(xml.lastIndexOf('<w:p>', idx), xml.lastIndexOf('<w:p ', idx))
  const pEnd = xml.indexOf('</w:p>', idx)
  if (ps < 0 || pEnd < 0) return xml
  let vi = 0
  const para = xml.slice(ps, pEnd + 6).replace(/<w:r>[\s\S]*?<\/w:r>/g, (run) => {
    if (vi >= values.length) return run
    if (!/<w:u\b/.test(run)) return run
    const tMatch = run.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/)
    const txt = tMatch ? tMatch[1] : ''
    if (txt.trim() !== '' || txt.length === 0) return run
    const value = values[vi]; vi++
    if (value === null || value === undefined || String(value).trim() === '') return run
    const safe = xmlEscape(String(value))
    return run.replace(/<w:t([^>]*)>[\s\S]*?<\/w:t>/, (m, attrs) => {
      const a = String(attrs || '')
      return '<w:t' + a + (a.indexOf('xml:space') >= 0 ? '' : ' xml:space="preserve"') + '>' + safe + '</w:t>'
    })
  })
  return xml.slice(0, ps) + para + xml.slice(pEnd + 6)
}

// 在包含锚点的段落内做一次字符串替换（用于段内 □→■ 标记等，避免跨段误替换）
function replaceInPara(xml, anchor, searchText, replaceText) {
  const idx = xml.indexOf(anchor)
  if (idx < 0) return xml
  const ps = Math.max(xml.lastIndexOf('<w:p>', idx), xml.lastIndexOf('<w:p ', idx))
  const pEnd = xml.indexOf('</w:p>', idx)
  if (ps < 0 || pEnd < 0) return xml
  const para = xml.slice(ps, pEnd + 6)
  const ni = para.indexOf(searchText)
  if (ni < 0) return xml
  return xml.slice(0, ps) + para.slice(0, ni) + replaceText + para.slice(ni + searchText.length) + xml.slice(pEnd + 6)
}

// 在包含锚点的段落末尾 run 追加文本（用于工程地点/工程内容等无下划线占位、冒号后直接书写的段落）
function appendTextInPara(xml, anchor, value) {
  const v = String(value === null || value === undefined ? '' : value).trim()
  if (v.length === 0) return xml
  const idx = xml.indexOf(anchor)
  if (idx < 0) return xml
  const pEnd = xml.indexOf('</w:p>', idx)
  if (pEnd < 0) return xml
  const tEnd = xml.lastIndexOf('</w:t>', pEnd)
  if (tEnd < 0) return xml
  return xml.slice(0, tEnd) + xmlEscape(v) + xml.slice(tEnd)
}

// 将锚点文本之后第一个 <w:t> 的内容整体替换为指定值（用于标题、乙方（卖方）等非空白占位）
function replaceTextAfter(xml, anchor, value) {
  const idx = xml.indexOf(anchor)
  if (idx < 0) return xml
  const tStart = xml.indexOf('<w:t', idx + anchor.length)
  if (tStart < 0) return xml
  const tOpenEnd = xml.indexOf('>', tStart)
  const tEnd = xml.indexOf('</w:t>', tOpenEnd)
  if (tEnd < 0) return xml
  const openTag = xml.slice(tStart, tOpenEnd + 1)
  const hasPreserve = openTag.indexOf('xml:space') >= 0
  const safe = xmlEscape(value)
  const newOpen = hasPreserve ? openTag : openTag.replace(/>$/, ' xml:space="preserve">')
  return xml.slice(0, tStart) + newOpen + safe + xml.slice(tEnd)
}

// 在单元格内写入文本，保留其中的公章等浮动图片（drawing），并沿用原首个段落属性
function setCellTextKeepDrawings(tcXml, text) {
  const tcPrMatch = tcXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)
  const tcPr = tcPrMatch ? tcPrMatch[0] : ''
  const pPrMatch = tcXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)
  const pPr = pPrMatch ? pPrMatch[0] : ''
  const runs = tcXml.match(/<w:r>[\s\S]*?<\/w:r>/g) || []
  const kept = runs.filter(r => r.indexOf('<w:drawing>') >= 0)
  const textRun = '<w:r><w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r>'
  return '<w:tc>' + tcPr + '<w:p>' + pPr + textRun + kept.join('') + '</w:p></w:tc>'
}

// 购销合同签署表：原位填充每行第 2 列（甲方值）与第 4 列（乙方值），保留公章锚点与表格样式
function fillSignTableInPlace(xml, tableIndex, valuesA, valuesB) {
  let idx = 0, tblStart = -1
  for (let k = 0; k <= tableIndex; k++) {
    tblStart = xml.indexOf('<w:tbl>', idx)
    if (tblStart < 0) return xml
    idx = tblStart + 7
  }
  const tblEnd = xml.indexOf('</w:tbl>', tblStart)
  if (tblEnd < 0) return xml
  const tblXml = xml.slice(tblStart, tblEnd)
  const rowRe = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g
  const rows = tblXml.match(rowRe) || []
  const cellRe = /<w:tc>[\s\S]*?<\/w:tc>/g
  const newRows = rows.map((rowXml, i) => {
    const cells = rowXml.match(cellRe)
    if (!cells || cells.length < 4) return rowXml
    if (i < valuesA.length) cells[1] = setCellTextKeepDrawings(cells[1], valuesA[i] || '')
    if (i < valuesB.length) cells[3] = setCellTextKeepDrawings(cells[3], valuesB[i] || '')
    // 用替换后的单元格重建该行（保留 <w:tr> 开标签中的属性）
    const trOpenMatch = rowXml.match(/<w:tr\b[^>]*>/)
    const trOpen = trOpenMatch ? trOpenMatch[0] : '<w:tr>'
    return trOpen + cells.join('') + '</w:tr>'
  })
  let cursor = 0
  const rebuilt = tblXml.replace(rowRe, () => newRows[cursor++] || '')
  return xml.slice(0, tblStart) + rebuilt + xml.slice(tblEnd)
}

// 替换产品购销合同的表格内容（保留 tblPr/tblGrid，替换所有 tr）
function replacePurchaseTable(xml, items) {
  const tblStart = xml.indexOf('<w:tbl>')
  if (tblStart < 0) return xml
  const tblEnd = xml.indexOf('</w:tbl>', tblStart)
  if (tblEnd < 0) return xml
  const inner = xml.slice(tblStart, tblEnd)
  const gridEnd = inner.indexOf('</w:tblGrid>')
  if (gridEnd < 0) return xml
  const keep = inner.slice(0, gridEnd + '</w:tblGrid>'.length)
  const rows = buildPurchaseRows(items)
  return xml.slice(0, tblStart) + keep + rows + '</w:tbl>' + xml.slice(tblEnd + '</w:tbl>'.length)
}

// 替换第 n 个表格（0-based）的全部内容，保留 tblPr/tblGrid
function replaceNthTable(xml, n, rowsXml) {
  let idx = 0, tblStart = -1
  for (let k = 0; k <= n; k++) {
    tblStart = xml.indexOf('<w:tbl>', idx)
    if (tblStart < 0) return xml
    idx = tblStart + 6
  }
  const tblEnd = xml.indexOf('</w:tbl>', tblStart)
  if (tblEnd < 0) return xml
  const inner = xml.slice(tblStart, tblEnd)
  const gridEnd = inner.indexOf('</w:tblGrid>')
  if (gridEnd < 0) return xml
  const keep = inner.slice(0, gridEnd + '</w:tblGrid>'.length)
  return xml.slice(0, tblStart) + keep + rowsXml + '</w:tbl>' + xml.slice(tblEnd + '</w:tbl>'.length)
}

// 生成落款表格（甲方信息 + 乙方信息）
function buildSignTable(doc, settings) {
  const f = doc.fields || {}
  const s = settings || {}
  const partyA = [
    f.partyASignName || doc.customerName || '',
    f.partyARepresentative || '',
    f.partyAAddress || '',
    f.partyAPhone || '',
    f.partyABank || '',
    f.partyABankAccount || '',
    f.partyATaxNo || ''
  ]
  const partyB = [
    s.contractCompanyName || '',
    s.contractRepresentative || '',
    s.contractAddress || '',
    s.contractCompanyPhone || '',
    s.contractBankName || '',
    s.contractBankAccount || '',
    s.contractTaxNo || ''
  ]
  const labels = ['名称', '授权代表', '地址', '电话', '开户银行', '账号', '税号']
  let xml = ''
  for (let i = 0; i < labels.length; i++) {
    xml += '<w:tr>'
    xml += labelCell('甲方' + (i === 0 ? '：' : ''))
    xml += valueCell(partyA[i], i === 0)
    xml += labelCell('乙方' + (i === 0 ? '：' : ''))
    xml += valueCell(partyB[i], i === 0)
    xml += '</w:tr>'
  }
  return xml
}
function labelCell(text) {
  return '<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r></w:p></w:tc>'
}
function valueCell(text, bold) {
  const rPr = bold ? '<w:rPr><w:b/></w:rPr>' : ''
  return '<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr><w:p><w:r>' + rPr + '<w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r></w:p></w:tc>'
}

// 公章拖拽位置同步到 Word：按文档顺序遍历浮动图片锚点，
// 以浏览器实测默认坐标为基准，将 (保存值-默认值) 的像素差换算成 EMU 平移 posOffset（1px = 9525EMU）；
// saved.hidden=true 时删除整个锚点（印章已删除）；saved.w 与默认边长不同时按比例缩放 extent（印章调大小）
function shiftSealAnchors(xml, sealPosJson, keyOrder, defaults) {
  if (!sealPosJson) return xml
  let pos
  try { pos = JSON.parse(sealPosJson) } catch (e) { return xml }
  if (!pos || typeof pos !== 'object') return xml
  let i = 0
  return xml.replace(/<wp:anchor[\s\S]*?<\/wp:anchor>/g, (aText) => {
    const key = keyOrder[i]
    i++
    if (!key) return aText
    const saved = pos[key]
    const def = defaults[key]
    // 编辑页已删除该印章：从 Word 中移除整个浮动锚点
    if (saved && saved.hidden === true) return ''
    if (!saved || typeof saved.x !== 'number' || typeof saved.y !== 'number') return aText
    const dx = Math.round((saved.x - def.x) * 9525)
    const dy = Math.round((saved.y - def.y) * 9525)
    let out = aText
    if (dx !== 0 || dy !== 0) {
      out = out
        .replace(/(<wp:positionH[^>]*>\s*<wp:posOffset>)(-?\d+)/, (mm, p1, v) => p1 + String(Number(v) + dx))
        .replace(/(<wp:positionV[^>]*>\s*<wp:posOffset>)(-?\d+)/, (mm, p1, v) => p1 + String(Number(v) + dy))
    }
    // 尺寸调整：按保存边长与默认边长的比例缩放 wp:extent 与 a:ext
    const defW = def.w || 0
    const newW = (typeof saved.w === 'number' && saved.w >= 60 && saved.w <= 280) ? Math.round(saved.w) : defW
    if (defW > 0 && newW > 0 && newW !== defW) {
      const ratio = newW / defW
      const scaleEmu = (mm, p1, cx, p3, cy, p5) => p1 + String(Math.round(Number(cx) * ratio)) + p3 + String(Math.round(Number(cy) * ratio)) + p5
      out = out
        .replace(/(<wp:extent\s+cx=")(\d+)("\s+cy=")(\d+)("\s*\/>)/, scaleEmu)
        .replace(/(<a:ext\s+cx=")(\d+)("\s+cy=")(\d+)("\s*\/>)/, scaleEmu)
    }
    return out
  })
}

function fillPurchaseDoc(xml, doc, settings) {
  const f = doc.fields || {}
  const s = settings || {}
  const items = doc.items || []
  const total = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0)
  // 乙方信息：优先用合同里保存的乙方字段，未保存时回落到基础设置
  const partyB = [
    f.partyBName || s.contractCompanyName || '',
    f.partyBRepresentative || s.contractRepresentative || '',
    f.partyBAddress || s.contractAddress || '',
    f.partyBPhone || s.contractCompanyPhone || '',
    f.partyBBank || s.contractBankName || '',
    f.partyBBankAccount || s.contractBankAccount || '',
    f.partyBTaxNo || s.contractTaxNo || ''
  ]
  const partyA = [
    f.partyASignName || doc.customerName || f.partyAName || '',
    f.partyARepresentative || '',
    f.partyAAddress || '',
    f.partyAPhone || doc.customerPhone || '',
    f.partyABank || '',
    f.partyABankAccount || '',
    f.partyATaxNo || ''
  ]
  let x = xml
  // 标题（可改）
  const title = doc.title || f.title || '产品购销合同'
  if (title !== '产品购销合同') x = replaceTextAfter(x, '产品购销合同', title)
  x = replaceUnderlinedAfter(x, '合同编号：', doc.contractNo || f.contractNo || '')
  x = replaceUnderlinedAfter(x, '签订日期：', doc.signDate || f.signDate || '')
  // 甲方(买方): 范本中该行结尾没有下划线空白，直接在同名 run 文本后追加甲方名称
  const aName = doc.customerName || f.partyAName || ''
  x = x.replace('<w:t>甲方(买方):</w:t>', '<w:t xml:space="preserve">甲方(买方):' + xmlEscape(aName) + '</w:t>')
  // 乙方(卖方): 范本中乙方名为带下划线的固定文本，整体替换
  x = replaceTextAfter(x, '乙方(卖方):', partyB[0])
  const effTotal = total > 0 ? total : Number(doc.amount || 0)
  // 大写金额：优先前端传入值，空则由后端按合计自动生成
  const capital = String(f.capitalAmount || '').trim() || printRenderer.amountToChinese(effTotal)
  x = replaceUnderlinedAfter(x, '本合同金额', capital)
  x = replaceUnderlinedAfter(x, '(小写', effTotal.toFixed(2))
  x = replaceUnderlinedAfter(x, '订单完成后', f.payDays || '')
  x = replaceUnderlinedAfter(x, '下单后', f.deliveryDays || '')
  x = replaceUnderlinedAfter(x, '地址', f.deliveryAddress || '')
  x = replaceUnderlinedAfter(x, '收货联系人', f.receiverName || '')
  x = replaceUnderlinedAfter(x, '移动电话', f.receiverPhone || '')
  // 产品表格（第 1 个表，含表头行重建）
  x = replaceNthTable(x, 0, buildPurchaseRows(items))
  // 签署表（第 2 个表）：原位填充，保留公章浮动图片
  x = fillSignTableInPlace(x, 1, partyA, partyB)
  // 公章/法人章拖拽位置：按保存值平移模板锚点（文档顺序：一条款/五条款/九条款骑缝章、乙方公司章、法人章）
  x = shiftSealAnchors(x, f.sealPos, ['stamp1', 'stamp5', 'stamp9', 'co', 'sign'], {
    stamp1: { x: 631, y: 274, w: 153 }, stamp5: { x: 631, y: 869, w: 153 }, stamp9: { x: 631, y: 1596, w: 153 },
    co: { x: 497, y: 1828, w: 153 }, sign: { x: 597, y: 1874, w: 125 }
  })
  return x
}

function fillConstructionDoc(xml, doc, settings) {
  const f = doc.fields || {}
  const s = settings || {}
  const sd = String(doc.signDate || f.signDate || '').split(/[-/]/)
  const y = sd[0] || '', m = sd[1] || '', d = sd[2] || ''
  const amount = Number(doc.amount || 0)
  // 乙方信息：优先合同保存值，回落基础设置
  const partyBName = String(f.partyBName || s.contractCompanyName || '').trim()
  const partyBRep = String(f.partyBRepresentative || s.contractRepresentative || '').trim()
  const partyBPhone = String(f.partyBPhone || s.contractCompanyPhone || '').trim()
  let x = xml
  // 标题（可改）：范本标题为「Xx施工合同」两个 run，将 Xx 替换为完整标题并清空后一个 run
  const titleText = String(doc.title || f.title || '施工合同')
  x = x.replace(/<w:t([^>]*)>Xx<\/w:t>/, (mm, p1) => '<w:t' + p1 + ' xml:space="preserve">' + xmlEscape(titleText) + '</w:t>')
  x = x.replace(/<w:t([^>]*)>施工合同<\/w:t>/, '<w:t$1></w:t>')
  // 签订日期 年/月/日（段内 3 个格式下划线空白，按位置填充）
  x = fillUnderlinedInPara(x, '签订日期', [y, m, d])
  // 合同编号：范本中为 ASCII 下划线字符
  x = x.replace('：_______________', '：' + xmlEscape(doc.contractNo || f.contractNo || ''))
  // 甲方（发包方）与甲方电话
  x = replaceUnderlinedAfter(x, '甲方（发包方）', doc.customerName || f.partyAName || '')
  x = replaceUnderlinedAfter(x, '联系电话', f.partyAPhone || doc.customerPhone || '')
  // 乙方（承包方）名称与电话：范本为带下划线固定文本，可替换
  if (partyBName.length > 0) x = replaceTextAfter(x, '乙方（承包方）：', partyBName)
  if (partyBPhone.length > 0) x = x.replace('13614335222', xmlEscape(partyBPhone))
  // 工程概况：名称段有下划线空白；地点/内容段无下划线 run，冒号后直接追加
  x = fillUnderlinedInPara(x, '工程名称', [f.projectName || ''])
  x = appendTextInPara(x, '工程地点', f.projectLocation || '')
  x = appendTextInPara(x, '工程内容', f.projectContent || '')
  // 承包方式单选（段内标记，第一个选项「包工包料」范本自带无框，选中时前缀 ■）
  const mode = f.contractMode || '包工包料'
  if (mode === '包工包料') x = replaceInPara(x, '承包方式', '包工包料', '■包工包料')
  else if (mode === '包工不包料') x = replaceInPara(x, '承包方式', '□', '■')
  else if (mode === '包工部分包料') x = replaceInPara(x, '承包方式', '□包工部分包料', '■包工部分包料')
  // 开工日期 年/月/日（段内 3 个下划线空白）
  const sd2 = String(f.startDate || '').split(/[-/]/)
  x = fillUnderlinedInPara(x, '开工日期', [sd2[0] || '', sd2[1] || '', sd2[2] || ''])
  // 竣工日期（段内 3 个下划线空白；范本「预计/竣工日期：」跨 run，锚点用连续的「竣工日期」）
  const sd3 = String(f.endDate || '').split(/[-/]/)
  x = fillUnderlinedInPara(x, '竣工日期', [sd3[0] || '', sd3[1] || '', sd3[2] || ''])
  // 总工期（范本默认下划线文本 8）、质保期（范本默认下划线文本 365）：空值保留模板默认
  x = replaceUnderlinedTextAfter(x, '总工期', f.totalDays || '')
  x = replaceUnderlinedTextAfter(x, '质保期', f.warrantyDays || '')
  // 合同总价款 小写 + 大写（大写空时按合计自动生成）；范本自带「元整」后缀需去除避免重复
  x = replaceUnderlinedAfter(x, '合同总价款', amount.toFixed(2))
  const capital = String(f.capitalAmount || '').trim() || printRenderer.amountToChinese(amount)
  x = replaceUnderlinedAfter(x, '大写', capital)
  x = x.replace('元整）本价格为', '）本价格为')
  // 固定总价 / 可调价（段内标记）
  const pt = f.priceType || '固定总价'
  if (pt === '固定总价') x = replaceInPara(x, '本价格为', '□', '■')
  else if (pt === '可调价') x = replaceInPara(x, '本价格为', '□可调价', '■可调价')
  // 预付款：签订后 N 日，总价 P%，即 A 元
  x = replaceUnderlinedAfter(x, '合同签订后', f.prepayDays || '')
  x = replaceUnderlinedAfter(x, '合同总价', f.prepayPercent || '')
  x = replaceUnderlinedAfter(x, '即', f.prepayAmount || '')
  // 进度款：完成 P1% 后，总价 P2%，即 A 元
  x = replaceUnderlinedAfter(x, '工程施工完成', f.progressCompletePercent || f.progressPercent || '')
  x = replaceUnderlinedAfter(x, '合同总价', f.progressPercent || '')
  x = replaceUnderlinedAfter(x, '即', f.progressAmount || '')
  // 竣工款：验收合格后 N 内，总价 P%，即 A 元
  x = replaceUnderlinedAfter(x, '竣工验收合格后', f.finalDays || '')
  x = replaceUnderlinedAfter(x, '结算总价的', f.finalPercent || '')
  x = replaceUnderlinedAfter(x, '即', f.finalAmount || '')
  // 验收天数 / 逾期天数
  x = replaceUnderlinedAfter(x, '验收申请后', f.acceptanceDays || '')
  x = replaceUnderlinedAfter(x, '逾期超过', f.overdueDays || '')
  // 签署表原位填充（保留乙方处公章 drawing）：
  // 甲方列两处 ASCII 下划线：盖章处=甲方名称、签字处=授权代表
  const aSignName = String(f.partyASignName || doc.customerName || f.partyAName || '')
  const aRep = String(f.partyARepresentative || '')
  x = x.replace('_______________', xmlEscape(aSignName))
  x = x.replace('_______________', xmlEscape(aRep))
  // 甲方列签署日期：填签订日期
  if (y.length > 0) {
    x = x.replace('日期：______年____月____日', '日期：' + xmlEscape(y) + ' 年 ' + xmlEscape(m) + ' 月 ' + xmlEscape(d) + ' 日')
  }
  // 乙方列：公司名与代表名为范本固定文本，可替换
  if (partyBName.length > 0) x = x.replace('敦化市中关村智联电子产品中心', xmlEscape(partyBName))
  if (partyBRep.length > 0) x = x.replace('张洪智', xmlEscape(partyBRep))
  // 附页：调取单据有明细行时，文末追加产品/设备清单页
  const items = (doc.items || []).filter(it => it && String(it.name || '').trim().length > 0)
  if (items.length > 0) {
    x = x.replace('</w:body>', buildConstructionAttachment(items) + '</w:body>')
  }
  // 公章拖拽位置：按保存值平移模板锚点（单锚点，盖乙方处）
  x = shiftSealAnchors(x, f.sealPos, ['main'], { main: { x: 563, y: 1711, w: 153 } })
  return x
}

// 施工合同附页：分页符 + 标题 + 产品/设备清单表格（名称/单价/数量/总价 + 合计行）
function buildConstructionAttachment(items) {
  let rows = ''
  items.forEach((it, i) => {
    const name = xmlEscape(it.name || '')
    const price = it.price == null ? '' : Number(it.price).toFixed(2)
    const qty = it.qty == null ? '' : Number(it.qty)
    const total = it.total == null ? '' : Number(it.total).toFixed(2)
    rows += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
      + cellXml(String(i + 1)) + cellXml(name) + cellXml(price) + cellXml(qty) + cellXml(total)
      + '</w:tr>'
  })
  const grand = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0)
  rows += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
    + '<w:tc><w:tcPr><w:gridSpan w:val="4"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">合计</w:t></w:r></w:p></w:tc>'
    + '<w:tc><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + grand.toFixed(2) + '</w:t></w:r></w:p></w:tc>'
    + '</w:tr>'
  const th = (t) => '<w:tc><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + t + '</w:t></w:r></w:p></w:tc>'
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
    + '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">附页：产品/设备清单</w:t></w:r></w:p>'
    + '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>'
    + '<w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/>'
    + '<w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/>'
    + '</w:tblBorders><w:jc w:val="center"/></w:tblPr>'
    + '<w:tblGrid><w:gridCol w:w="700"/><w:gridCol w:w="4500"/><w:gridCol w:w="1400"/><w:gridCol w:w="900"/><w:gridCol w:w="1600"/></w:tblGrid>'
    + '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>' + th('序号') + th('产品名称') + th('单价') + th('数量') + th('总价') + '</w:tr>'
    + rows
    + '</w:tbl>'
}

function exportContractWord(id) {
  const doc = getContract(id)
  const tplName = doc.type === 'construction' ? '施工合同.docx' : '产品购销合同.docx'
  const tplPath = path.join(TEMPLATES_DIR, tplName)
  if (!fs.existsSync(tplPath)) throw new HttpError(404, '合同模板文件不存在')
  const entries = readZip(fs.readFileSync(tplPath))
  let xml = entries.get('word/document.xml').toString('utf8')
  if (doc.type === 'construction') xml = fillConstructionDoc(xml, doc, getSettings())
  else xml = fillPurchaseDoc(xml, doc, getSettings())
  entries.set('word/document.xml', Buffer.from(xml, 'utf8'))
  // 替换印章图片（若用户上传了自定义印章）
  if (doc.sealCompany) {
    const p = path.join(UPLOAD_DIR, path.basename(doc.sealCompany))
    if (fs.existsSync(p) && entries.has('word/media/image1.jpeg')) entries.set('word/media/image1.jpeg', fs.readFileSync(p))
  }
  if (doc.sealSign && doc.type === 'purchase') {
    const p = path.join(UPLOAD_DIR, path.basename(doc.sealSign))
    if (fs.existsSync(p) && entries.has('word/media/image2.jpeg')) entries.set('word/media/image2.jpeg', fs.readFileSync(p))
  }
  const buf = writeZip(entries)
  const filename = (doc.title || doc.contractNo || '合同') + '.docx'
  return { filename, buffer: buf }
}

// ---------- 基础设置 ----------
const SETTINGS_DEFAULTS = {
  companyName: '杭州蓝海电子科技有限公司',
  taxNo: '91330106MA2XXXXXXX',
  address: '杭州市西湖区文三路 259 号昌地火炬大厦 2 号楼 6 层',
  phone: '0571-88886666',
  bankName: '中国建设银行杭州文三路支行',
  bankAccount: '3300 1234 5678 9012 345',
  taxRate: 0.13,
  salesPrefix: 'XS',
  quotePrefix: 'BJ',
  installPrefix: 'ZJ',
  projectPrefix: 'XM',
  contractPrefix: 'HT',
  footerNote: '本单据为演示系统生成，仅用于流程展示，不具备法律效力。',
  // 合同模板专用（乙方信息）
  contractCompanyName: '敦化市中关村电子城智联电子产品中心',
  contractCompanyPhone: '13614335222',
  contractBankName: '中国建设银行股份有限公司延边朝鲜族自治州分行营业部',
  contractBankAccount: '22050168633800002420',
  contractTaxNo: '91222403126460846K',
  contractRepresentative: '张洪智',
  contractAddress: '吉林省敦化市中关村电子城',
  // 印章默认路径
  sealCompany: '/uploads/seal_company.jpeg',
  sealSign: '/uploads/seal_sign.jpeg',
  // 首页模块显隐（'1' 显示 / '0' 隐藏，默认隐藏）与结款默认账期
  showOverview: '0',
  showStockAlert: '0',
  defaultDueDays: '30',
  // 登录页左侧自定义背景图（/uploads/xxx，空串 = 默认渐变）
  loginBg: '',
  // 界面文字自定义（JSON 对象字符串：key → 自定义文案，空对象 = 全部用默认文案）
  uiText: '{}',
  // 左侧导航整体隐藏（'1' = 隐藏，隐藏后显示悬浮呼出按钮）
  hideSidebar: '0',
  // 永久隐藏悬浮「菜单」呼出按钮（'1' = 左侧导航隐藏时不再显示左下角悬浮按钮，可用顶栏「显示菜单」恢复）
  hideMenuFloat: '0',
  // 工作台「功能直达」板块显隐（默认显示）
  showQuick: '1',
  // 工作台「最近单据」板块显隐（默认显示）
  showRecent: '1',
  // NAS 备份目录（数据管理页可改，备份时把数据库文件复制到该目录）
  nasPath: '',
  // 开具发票网址列表（JSON 字符串数组，默认吉林电子税局，基础设置可增删改）
  invoiceUrls: '["https://jilin.chinatax.gov.cn/"]',
  // 工作台功能直达排序与显隐（JSON 数组：[{key, hidden}]，空数组 = 默认顺序全部显示）
  quickOrder: '[]'
}

const SETTINGS_TEXT_KEYS = [
  'companyName', 'taxNo', 'address', 'phone', 'bankName', 'bankAccount',
  'salesPrefix', 'quotePrefix', 'installPrefix', 'projectPrefix', 'contractPrefix', 'footerNote',
  'contractCompanyName', 'contractCompanyPhone', 'contractBankName', 'contractBankAccount',
  'contractTaxNo', 'contractRepresentative', 'contractAddress', 'sealCompany', 'sealSign',
  'showOverview', 'showStockAlert', 'defaultDueDays',
  'loginBg', 'uiText', 'hideSidebar', 'hideMenuFloat', 'showQuick', 'showRecent', 'nasPath',
  'invoiceUrls', 'quickOrder'
]
const SETTINGS_PREFIX_KEYS = ['salesPrefix', 'quotePrefix', 'installPrefix', 'projectPrefix', 'contractPrefix']

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM app_settings').all()
  const saved = {}
  for (const r of rows) {
    saved[r.key] = r.value
  }
  const out = {}
  for (const k of SETTINGS_TEXT_KEYS) {
    out[k] = saved[k] === undefined ? SETTINGS_DEFAULTS[k] : saved[k]
  }
  out.taxRate = saved.taxRate === undefined ? SETTINGS_DEFAULTS.taxRate : num(saved.taxRate)
  return out
}

// 保存设置：校验后整体写入，事务保证全部成功或全部不变
function saveSettings(payload) {
  const current = getSettings()
  const next = {}
  for (const k of SETTINGS_TEXT_KEYS) {
    next[k] = payload[k] === undefined ? current[k] : str(payload[k])
  }
  if (!next.companyName) throw new HttpError(400, '公司名称不能为空')

  const rate = payload.taxRate === undefined ? current.taxRate : num(payload.taxRate)
  if (rate < 0 || rate > 1) throw new HttpError(400, '税率必须在 0% 到 100% 之间')
  next.taxRate = round2(rate * 100) / 100

  for (const k of SETTINGS_PREFIX_KEYS) {
    const v = next[k].toUpperCase().replace(/\s+/g, '')
    if (!/^[A-Z0-9]{1,6}$/.test(v)) {
      throw new HttpError(400, '单据编号前缀只能是 1-6 位字母或数字')
    }
    next[k] = v
  }

  // 主页显隐开关系列：只接受 0/1（兼容 true/false），其它值一律拒绝
  for (const k of ['showOverview', 'showStockAlert', 'hideSidebar', 'hideMenuFloat', 'showQuick', 'showRecent']) {
    const raw = next[k]
    next[k] = raw === '1' || raw === 'true' ? '1' : '0'
  }
  // 默认账期：0-365 天
  const due = Number(next.defaultDueDays)
  if (!Number.isFinite(due) || due < 0 || due > 365) {
    throw new HttpError(400, '默认账期必须是 0 到 365 之间的天数')
  }
  next.defaultDueDays = String(Math.round(due))

  // 登录背景图：只允许 /uploads/ 下的路径或空串，防止任意外链
  if (next.loginBg && !next.loginBg.startsWith('/uploads/')) {
    throw new HttpError(400, '登录背景图路径不合法')
  }
  // 界面文字自定义：必须是 JSON 对象字符串（key → 文案）
  try {
    const parsed = JSON.parse(next.uiText || '{}')
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not-object')
    }
    next.uiText = JSON.stringify(parsed)
  } catch (e) {
    throw new HttpError(400, '界面文字自定义必须是合法的 JSON 对象')
  }

  // 开具发票网址列表：必须是 JSON 字符串数组，每个为 http(s) 地址；至少保留一个
  try {
    const urls = JSON.parse(next.invoiceUrls || '[]')
    if (!Array.isArray(urls)) throw new Error('not-array')
    const cleaned = []
    for (const u of urls) {
      const v = String(u || '').trim()
      if (!v) continue
      if (!/^https?:\/\//i.test(v)) throw new HttpError(400, '发票网址必须以 http:// 或 https:// 开头')
      if (v.length > 300) throw new HttpError(400, '发票网址过长')
      cleaned.push(v)
    }
    if (cleaned.length === 0) throw new HttpError(400, '至少保留一个发票网址')
    if (cleaned.length > 20) throw new HttpError(400, '发票网址最多 20 个')
    next.invoiceUrls = JSON.stringify(cleaned)
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(400, '发票网址列表必须是合法的 JSON 数组')
  }

  // 功能直达排序：必须是 JSON 数组，元素为 {key, hidden}
  try {
    const arr = JSON.parse(next.quickOrder || '[]')
    if (!Array.isArray(arr)) throw new Error('not-array')
    const cleaned = []
    for (const it of arr) {
      if (!it || typeof it.key !== 'string' || !it.key) continue
      cleaned.push({ key: String(it.key).slice(0, 32), hidden: it.hidden === true || it.hidden === '1' })
      if (cleaned.length > 50) break
    }
    next.quickOrder = JSON.stringify(cleaned)
  } catch (e) {
    throw new HttpError(400, '功能排序必须是合法的 JSON 数组')
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    const stmt = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
    for (const k of SETTINGS_TEXT_KEYS) {
      stmt.run(k, String(next[k]))
    }
    stmt.run('taxRate', String(next.taxRate))
    db.exec('COMMIT')
  } catch (e) {
    try {
      db.exec('ROLLBACK')
    } catch (ignore) {
      // 回滚失败不再抛出，保留原始错误
    }
    throw e
  }
  return getSettings()
}

// ---------- 数据管理：备份 / 恢复 / 一键清空 ----------
// 参与备份恢复的业务表（用户、登录会话、验证码不纳入，避免恢复后无法登录）
const DATA_TABLES = ['customers', 'products', 'docs', 'doc_items', 'stock_logs', 'contracts', 'payments', 'project_quotes', 'app_settings', 'memos']
const DB_FILE = path.join(__dirname, 'data', 'sales.db')

// 全量导出：各表原始行打包为 JSON
function dataExport() {
  const tables = {}
  for (const t of DATA_TABLES) {
    tables[t] = db.prepare('SELECT * FROM ' + t).all()
  }
  return { version: 1, exportedAt: nowText(), tables }
}

// 单表恢复：先清空再按当前表结构逐行写入（只写入真实存在的列）
function restoreTable(t, rows) {
  db.exec('DELETE FROM ' + t)
  if (!Array.isArray(rows) || rows.length === 0) return 0
  const cols = db.prepare('PRAGMA table_info(' + t + ')').all().map((c) => c.name)
  const colSet = new Set(cols)
  const keys = []
  if (colSet.has('id')) keys.push('id')
  for (const k of Object.keys(rows[0])) {
    if (colSet.has(k) && k !== 'id') keys.push(k)
  }
  if (keys.length === 0) return 0
  const stmt = db.prepare('INSERT INTO ' + t + ' (' + keys.join(',') + ') VALUES (' + keys.map(() => '?').join(',') + ')')
  let n = 0
  for (const r of rows) {
    stmt.run(...keys.map((k) => (r[k] === undefined || r[k] === null ? null : r[k])))
    n += 1
  }
  return n
}

// 从 JSON 备份恢复：整库业务表整体替换，事务保证全部成功或全部不变
function dataRestore(payload) {
  const tables = payload && payload.tables
  if (!tables || typeof tables !== 'object') {
    throw new HttpError(400, '备份文件格式不正确：缺少 tables 数据')
  }
  const restored = {}
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const t of DATA_TABLES) {
      if (Array.isArray(tables[t])) {
        restored[t] = restoreTable(t, tables[t])
      }
    }
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch (ignore) {}
    throw e
  }
  return { restored }
}

function nasDir(payload) {
  const p = str(payload && payload.path) || str(getSettings().nasPath)
  if (!p) throw new HttpError(400, '请先在「基础设置 → 数据管理」中填写并保存 NAS 路径')
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
    throw new HttpError(400, 'NAS 路径不存在或不是文件夹：' + p)
  }
  return p
}

// 备份到 NAS：先把 WAL 日志写回主库文件，再整体复制，保证备份完整
function backupToNas(payload) {
  const dir = nasDir(payload)
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const fname = 'sales-backup-' + dateStamp() + '-' + Date.now().toString(36) + '.db'
  const target = path.join(dir, fname)
  fs.copyFileSync(DB_FILE, target)
  return { file: target, size: fs.statSync(target).size }
}

// 从 NAS 恢复：只读打开备份库文件，读出各表后走统一 JSON 恢复流程
function restoreFromNas(payload) {
  const file = str(payload && payload.file)
  if (!file) throw new HttpError(400, '请指定要恢复的 NAS 备份文件完整路径')
  if (!fs.existsSync(file)) throw new HttpError(400, '备份文件不存在：' + file)
  const { DatabaseSync } = require('node:sqlite')
  const src = new DatabaseSync(file, { readOnly: true })
  const tables = {}
  try {
    for (const t of DATA_TABLES) {
      try {
        tables[t] = src.prepare('SELECT * FROM ' + t).all()
      } catch (e) {
        tables[t] = []
      }
    }
  } finally {
    src.close()
  }
  return dataRestore({ tables })
}

const CLEAR_SCOPES = {
  all: '所有数据',
  customers: '客户信息',
  products: '产品信息',
  sales: '销售单据',
  quotes: '报价单据',
  installs: '装机单据',
  pquotes: '项目报价单据',
  contracts: '已保存合同'
}
const CLEAR_DOC_TYPES = { sales: '销售单', quotes: '报价单', installs: '装机单', pquotes: '项目报价单' }

function countWhere(sql, ...params) {
  return Number(db.prepare(sql).get(...params).n)
}

function docIdsOfType(type) {
  return db.prepare('SELECT id FROM docs WHERE type = ?').all(type).map((r) => Number(r.id))
}

// 统计某范围将删除的条数（二次确认弹窗用）
function clearCounts(scope) {
  const counts = {}
  if (scope === 'all') {
    for (const t of ['customers', 'products', 'docs', 'doc_items', 'stock_logs', 'contracts', 'payments', 'project_quotes']) {
      counts[t] = count(t)
    }
    return counts
  }
  if (scope === 'customers') { counts.customers = count('customers'); return counts }
  if (scope === 'products') { counts.products = count('products'); counts.stock_logs = count('stock_logs'); return counts }
  if (scope === 'contracts') {
    counts.contracts = count('contracts')
    counts.payments = countWhere("SELECT COUNT(*) AS n FROM payments WHERE doc_type = 'contract'")
    return counts
  }
  const t = CLEAR_DOC_TYPES[scope]
  if (!t) return null
  const ids = docIdsOfType(t)
  counts.docs = ids.length
  counts.doc_items = 0
  if (ids.length > 0) {
    const ph = ids.map(() => '?').join(',')
    counts.doc_items = countWhere('SELECT COUNT(*) AS n FROM doc_items WHERE doc_id IN (' + ph + ')', ...ids)
    if (scope === 'sales') {
      counts.payments = countWhere("SELECT COUNT(*) AS n FROM payments WHERE doc_type = 'sale' AND doc_id IN (" + ph + ')', ...ids)
    }
  }
  if (scope === 'pquotes') counts.project_quotes = count('project_quotes')
  return counts
}

// 一键清空：confirm 为 true 才真正删除，否则只返回将删除的条数
function dataClear(payload) {
  const scope = str(payload && payload.scope)
  if (!CLEAR_SCOPES[scope]) throw new HttpError(400, '不支持的数据范围：' + scope)
  const counts = clearCounts(scope)
  const confirm = payload && (payload.confirm === true || payload.confirm === 'true')
  if (!confirm) {
    return { scope, scopeLabel: CLEAR_SCOPES[scope], counts, confirmed: false }
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    if (scope === 'all') {
      db.exec('DELETE FROM payments')
      db.exec('DELETE FROM doc_items')
      db.exec('DELETE FROM docs')
      db.exec('DELETE FROM stock_logs')
      db.exec('DELETE FROM contracts')
      db.exec('DELETE FROM project_quotes')
      db.exec('DELETE FROM products')
      db.exec('DELETE FROM customers')
    } else if (scope === 'customers') {
      db.exec('DELETE FROM customers')
    } else if (scope === 'products') {
      db.exec('DELETE FROM stock_logs')
      db.exec('DELETE FROM products')
    } else if (scope === 'contracts') {
      db.exec("DELETE FROM payments WHERE doc_type = 'contract'")
      db.exec('DELETE FROM contracts')
    } else {
      const ids = docIdsOfType(CLEAR_DOC_TYPES[scope])
      if (ids.length > 0) {
        const ph = ids.map(() => '?').join(',')
        db.prepare('DELETE FROM doc_items WHERE doc_id IN (' + ph + ')').run(...ids)
        if (scope === 'sales') {
          db.prepare("DELETE FROM payments WHERE doc_type = 'sale' AND doc_id IN (" + ph + ')').run(...ids)
        }
        db.prepare('DELETE FROM docs WHERE id IN (' + ph + ')').run(...ids)
      }
      if (scope === 'pquotes') db.exec('DELETE FROM project_quotes')
    }
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch (ignore) {}
    throw e
  }
  return { scope, scopeLabel: CLEAR_SCOPES[scope], counts, confirmed: true }
}

// ---------- 聚合搜索（单号 / 客户 / 金额） ----------
// 同时查销售类单据与合同（单据号 / 客户名称 / 客户电话 / 金额），按日期倒序
function searchAll(keyword) {
  const q = str(keyword)
  if (!q) return []
  const k = q.toLowerCase()
  const isNum = Number.isFinite(Number(q)) && q.trim() !== ''
  const out = []

  const hitField = (r, noFields) => {
    for (let i = 0; i < noFields.length; i++) {
      if (String(noFields[i] || '').toLowerCase().includes(k)) return true
    }
    const amountText = Number(r.amount || 0).toFixed(2)
    if (isNum && amountText.includes(String(Number(q)))) return true
    return false
  }

  const docs = db.prepare('SELECT * FROM docs WHERE is_latest = 1 ORDER BY doc_date DESC, id DESC LIMIT 1000').all()
  for (const r of docs) {
    const no = r.bill_no && String(r.bill_no).length > 0 ? r.bill_no : r.doc_no
    if (!hitField(r, [r.doc_no, r.bill_no, r.customer_name, r.customer_phone])) continue
    out.push({
      kind: 'doc',
      id: r.id,
      type: r.type,
      no,
      docNo: r.doc_no,
      customerName: r.customer_name,
      customerPhone: r.customer_phone || '',
      amount: r.amount,
      date: r.doc_date,
      settledAmount: r.settled_amount || 0,
      dueDays: r.due_days == null ? 30 : Number(r.due_days),
      editCount: r.edit_count == null ? 0 : Number(r.edit_count),
      lastEditedAt: r.last_edited_at || '',
      lastEditor: r.last_editor || ''
    })
  }

  const contracts = db.prepare('SELECT * FROM contracts ORDER BY sign_date DESC, id DESC LIMIT 1000').all()
  for (const r of contracts) {
    if (!hitField(r, [r.contract_no, r.customer_name, r.customer_phone])) continue
    out.push({
      kind: 'contract',
      id: r.id,
      type: '合同',
      contractType: r.type,
      no: r.contract_no,
      docNo: r.contract_no,
      customerName: r.customer_name,
      customerPhone: r.customer_phone || '',
      amount: r.amount,
      date: r.sign_date,
      settledAmount: r.settled_amount || 0,
      dueDays: r.due_days == null ? 30 : Number(r.due_days),
      editCount: r.edit_count == null ? 0 : Number(r.edit_count),
      lastEditedAt: r.last_edited_at || '',
      lastEditor: r.last_editor || ''
    })
  }

  // 单据与合同合并后统一按日期倒序，最多返回 60 条
  out.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return out.slice(0, 60)
}

// ---------- 单据结款 ----------
// 业务口径：收款汇总与结款清单只统计「销售单」
// 合同、报价单、装机单、项目报价单均不进入结款统计
const SETTLE_DOC_TYPE = '销售单'
// 收款方式：只允许这五种，未选默认「现金」
const PAY_METHODS = ['现金', '微信', '支付宝', '银行卡', '对公银行转账']

function normalizePayMethod(v) {
  const m = str(v)
  return PAY_METHODS.indexOf(m) >= 0 ? m : PAY_METHODS[0]
}

function daysBetween(dateText) {
  if (!dateText) return 0
  const start = new Date(String(dateText).slice(0, 10) + 'T00:00:00')
  if (isNaN(start.getTime())) return 0
  const today = new Date(nowText().slice(0, 10) + 'T00:00:00')
  return Math.floor((today.getTime() - start.getTime()) / 86400000)
}

function settlementRow(kind, r) {
  const amount = round2(num(r.amount))
  const settled = round2(num(r.settled_amount))
  const unsettled = round2(amount - settled)
  const dueDays = r.due_days == null ? 30 : Number(r.due_days)
  const elapsed = daysBetween(r.doc_date || r.sign_date)
  const leftDays = dueDays - elapsed
  let dueStatus = '账内'
  if (unsettled <= 0) {
    dueStatus = '已结清'
  } else if (leftDays < 0) {
    dueStatus = '已逾期'
  }
  return {
    kind,
    id: r.id,
    no: kind === 'sale' ? (r.bill_no && String(r.bill_no).length > 0 ? r.bill_no : r.doc_no) : r.contract_no,
    docNo: kind === 'sale' ? r.doc_no : r.contract_no,
    type: kind === 'sale' ? '销售单' : (r.type === 'legacy' ? '合同' : '合同'),
    customerName: r.customer_name,
    date: kind === 'sale' ? r.doc_date : r.sign_date,
    amount,
    settledAmount: settled,
    unsettledAmount: unsettled,
    dueDays,
    elapsedDays: elapsed,
    leftDays,
    dueStatus,
    settledAt: r.settled_at || '',
    payMethod: r.pay_method || '',
    paidAt: r.paid_at || '',
    status: r.status
  }
}

function settlementData() {
  const list = []
  // 结款清单只显示销售单，合同不再进入结款列表
  const docs = db
    .prepare("SELECT * FROM docs WHERE type = ? AND is_latest = 1 AND status <> '已作废' ORDER BY doc_date DESC, id DESC")
    .all(SETTLE_DOC_TYPE)
  for (const r of docs) {
    // 金额为 0 的单据默认不计入未结清单
    if (round2(num(r.amount)) <= 0) continue
    list.push(settlementRow('sale', r))
  }

  const summary = { receivable: 0, settled: 0, unsettled: 0, overdue: 0, saleCount: 0, contractCount: 0 }
  for (const it of list) {
    summary.receivable += it.amount
    summary.settled += it.settledAmount
    summary.unsettled += it.unsettledAmount
    if (it.dueStatus == '已逾期') summary.overdue += it.unsettledAmount
    summary.saleCount += 1
  }
  summary.receivable = round2(summary.receivable)
  summary.settled = round2(summary.settled)
  summary.unsettled = round2(summary.unsettled)
  summary.overdue = round2(summary.overdue)
  return { summary, list }
}

function settlementTable(docType) {
  if (docType === 'sale') return 'docs'
  if (docType === 'contract') return 'contracts'
  throw new HttpError(400, '结款单据类型只能是 sale 或 contract')
}

// 登记一笔结款：写流水 + 更新已结金额（同一事务）
function recordPayment(payload) {
  const docType = str(payload.docType)
  const table = settlementTable(docType)
  const docId = Number(payload.docId)
  if (!Number.isFinite(docId) || docId <= 0) throw new HttpError(400, '单据 ID 不合法')
  const amount = num(payload.amount)
  if (!(amount > 0)) throw new HttpError(400, '本次结款金额必须大于 0')

  const row = db.prepare('SELECT * FROM ' + table + ' WHERE id = ?').get(docId)
  if (!row) throw new HttpError(404, '单据不存在')
  if (docType === 'sale' && row.type !== SETTLE_DOC_TYPE) {
    throw new HttpError(400, '只有销售单可以登记结款，报价单/装机单/项目报价单不参与结款统计')
  }

  const total = round2(num(row.amount))
  const settled = round2(num(row.settled_amount))
  const unpaid = round2(total - settled)
  if (unpaid <= 0) throw new HttpError(400, '该单据已结清，无需再次登记')
  if (amount > unpaid + 0.001) {
    throw new HttpError(400, '本次结款金额不能超过未结金额 ¥ ' + unpaid.toFixed(2))
  }

  const nextSettled = round2(settled + amount)
  const settledAt = nextSettled >= total - 0.001 ? nowText() : ''
  const paidAt = str(payload.paidAt) || nowText().slice(0, 10)
  const payMethod = normalizePayMethod(payload.payMethod)

  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('INSERT INTO payments (doc_type, doc_id, amount, paid_at, pay_method, remark, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(docType, docId, round2(amount), paidAt, payMethod, str(payload.remark), nowText())
    if (docType === 'sale') {
      // 销售单同时记录本次收款方式与最近结款日期（单据详情/打印页展示）
      db.prepare('UPDATE docs SET settled_amount = ?, settled_at = ?, pay_method = ?, paid_at = ?, updated_at = ? WHERE id = ?')
        .run(nextSettled, settledAt, payMethod, paidAt, nowText(), docId)
    } else {
      db.prepare('UPDATE ' + table + ' SET settled_amount = ?, settled_at = ?, updated_at = ? WHERE id = ?')
        .run(nextSettled, settledAt, nowText(), docId)
    }
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch (ignore) {}
    throw e
  }
  return settlementData()
}

// 设置某张单据的账期天数
function updateDueDays(payload) {
  const docType = str(payload.docType)
  const table = settlementTable(docType)
  const docId = Number(payload.docId)
  if (!Number.isFinite(docId) || docId <= 0) throw new HttpError(400, '单据 ID 不合法')
  const days = Number(payload.dueDays)
  if (!Number.isFinite(days) || days < 0 || days > 365) {
    throw new HttpError(400, '账期天数必须是 0 到 365 之间的整数')
  }
  const row = db.prepare('SELECT id FROM ' + table + ' WHERE id = ?').get(docId)
  if (!row) throw new HttpError(404, '单据不存在')
  db.prepare('UPDATE ' + table + ' SET due_days = ?, updated_at = ? WHERE id = ?')
    .run(Math.round(days), nowText(), docId)
  return settlementData()
}

// ---------- 项目报价单（独立版页面数据入库） ----------
function mapProjectQuote(r) {
  let data = {}
  try { data = JSON.parse(r.data_json || '{}') } catch (e) { data = {} }
  return {
    id: r.id,
    quoteNo: r.quote_no,
    title: r.title,
    customerName: r.customer_name,
    amount: r.amount,
    data,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

function listProjectQuotes() {
  return db.prepare('SELECT * FROM project_quotes ORDER BY id DESC').all().map(mapProjectQuote)
}

function getProjectQuote(id) {
  const row = db.prepare('SELECT * FROM project_quotes WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '项目报价单不存在')
  return mapProjectQuote(row)
}

function saveProjectQuote(payload) {
  const quoteNo = str(payload.quoteNo)
  const title = str(payload.title)
  const customerName = str(payload.customerName)
  const amount = round2(num(payload.amount))
  const dataJson = payload.data && typeof payload.data === 'object' ? JSON.stringify(payload.data) : '{}'
  const now = nowText()
  const id = Number(payload.id)

  let exist = null
  if (Number.isFinite(id) && id > 0) {
    exist = db.prepare('SELECT * FROM project_quotes WHERE id = ?').get(id)
  }
  if (!exist && quoteNo) {
    exist = db.prepare('SELECT * FROM project_quotes WHERE quote_no = ?').get(quoteNo)
  }
  if (exist) {
    db.prepare('UPDATE project_quotes SET quote_no = ?, title = ?, customer_name = ?, amount = ?, data_json = ?, updated_at = ? WHERE id = ?')
      .run(quoteNo || exist.quote_no, title, customerName, amount, dataJson, now, exist.id)
    return mapProjectQuote(db.prepare('SELECT * FROM project_quotes WHERE id = ?').get(exist.id))
  }
  const info = db.prepare('INSERT INTO project_quotes (quote_no, title, customer_name, amount, data_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(quoteNo, title, customerName, amount, dataJson, now, now)
  return mapProjectQuote(db.prepare('SELECT * FROM project_quotes WHERE id = ?').get(info.lastInsertRowid))
}

function deleteProjectQuote(id) {
  const row = db.prepare('SELECT id FROM project_quotes WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '项目报价单不存在')
  db.prepare('DELETE FROM project_quotes WHERE id = ?').run(id)
  return { deleted: true }
}

// ---------- 备忘录（工具箱） ----------
function mapMemo(r) {
  let images = []
  try {
    const arr = JSON.parse(r.images || '[]')
    if (Array.isArray(arr)) images = arr.map((u) => String(u)).filter((u) => u.length > 0).slice(0, 20)
  } catch (e) {}
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    images: images,
    remindDate: r.remind_date || '',
    owner: r.owner || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

function listMemos(remindDate) {
  if (remindDate) {
    return db.prepare('SELECT * FROM memos WHERE remind_date = ? ORDER BY id DESC').all(remindDate).map(mapMemo)
  }
  return db.prepare('SELECT * FROM memos ORDER BY id DESC').all().map(mapMemo)
}

function saveMemo(payload, operator) {
  const title = str(payload.title).trim().slice(0, 100)
  const content = str(payload.content).slice(0, 200000)
  const remindDate = str(payload.remindDate).trim()
  if (!title) throw new HttpError(400, '备忘录标题不能为空')
  if (remindDate && !/^\d{4}-\d{2}-\d{2}$/.test(remindDate)) {
    throw new HttpError(400, '提醒日期格式应为 YYYY-MM-DD')
  }
  let images = []
  if (Array.isArray(payload.images)) {
    images = payload.images.map((u) => str(u)).filter((u) => u.startsWith('/uploads/') || u.startsWith('data:image/')).slice(0, 20)
  }
  const imagesJson = JSON.stringify(images)
  const now = nowText()
  const id = Number(payload.id)
  if (Number.isFinite(id) && id > 0) {
    const exist = db.prepare('SELECT id FROM memos WHERE id = ?').get(id)
    if (!exist) throw new HttpError(404, '备忘录不存在')
    db.prepare('UPDATE memos SET title = ?, content = ?, images = ?, remind_date = ?, updated_at = ? WHERE id = ?')
      .run(title, content, imagesJson, remindDate, now, id)
    return mapMemo(db.prepare('SELECT * FROM memos WHERE id = ?').get(id))
  }
  const info = db.prepare('INSERT INTO memos (title, content, images, remind_date, owner, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(title, content, imagesJson, remindDate, operator || '', now, now)
  return mapMemo(db.prepare('SELECT * FROM memos WHERE id = ?').get(info.lastInsertRowid))
}

function deleteMemo(id) {
  const row = db.prepare('SELECT id FROM memos WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '备忘录不存在')
  db.prepare('DELETE FROM memos WHERE id = ?').run(id)
  return { deleted: true }
}

// ---------- 登录认证 ----------
const crypto = require('node:crypto')

// 密码加密：scrypt + 随机盐，只存哈希不存明文
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return salt + ':' + hash
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':')
  if (parts.length !== 2) return false
  const expect = crypto.scryptSync(String(password), parts[0], 64).toString('hex')
  const a = Buffer.from(expect, 'utf8')
  const b = Buffer.from(parts[1], 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function hashCode(code) {
  return crypto.createHash('sha256').update('reset:' + String(code)).digest('hex')
}

function timeText(offsetMinutes) {
  const d = new Date(Date.now() + offsetMinutes * 60000)
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
  )
}

// 首次启动时创建管理员账号（密码 123456，仅哈希入库）
function ensureAdminUser() {
  if (count('users') === 0) {
    const now = nowText()
    db.prepare('INSERT INTO users (username, password_hash, display_name, phone, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run('admin', hashPassword('123456'), '系统管理员', '13800000000', now, now)
    console.log('[auth] 已创建管理员账号 admin（演示密码 123456）')
  }
}

function createSession(userId, remember) {
  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = timeText(remember ? 30 * 24 * 60 : 12 * 60)
  db.prepare('INSERT INTO sessions (token, user_id, remember, expires_at, created_at) VALUES (?,?,?,?,?)')
    .run(token, userId, remember ? 1 : 0, expiresAt, nowText())
  return { token, expiresAt }
}

function userByToken(req) {
  const auth = String(req.headers.authorization || '')
  if (!auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
  if (!s) return null
  if (s.expires_at <= nowText()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return null
  }
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id)
  return u || null
}

function loginApi(payload) {
  const username = str(payload.username)
  const password = String(payload.password || '')
  if (!username || !password) throw new HttpError(400, '请输入账号和密码')
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!u || !verifyPassword(password, u.password_hash)) {
    throw new HttpError(401, '账号或密码错误')
  }
  const remember = payload.remember === true
  const sess = createSession(u.id, remember)
  return {
    token: sess.token,
    expiresAt: sess.expiresAt,
    remember: remember,
    username: u.username,
    displayName: u.display_name || u.username,
    perms: parsePerms(u.perms)
  }
}

// ---------- 账户与权限 ----------
// 权限板块 key：sales 销售 / quote 报价 / install 装机 / contract 合同 / stock 库存 / archive 档案 / settings 设置
// perms 存 JSON 数组字符串；空数组 = 全部权限（管理员与旧账号兼容）
const PERM_SECTIONS = ['sales', 'quote', 'install', 'contract', 'stock', 'archive', 'settings']

function parsePerms(text) {
  if (!text) return []
  try {
    const arr = JSON.parse(text)
    if (Array.isArray(arr)) return arr.filter((k) => PERM_SECTIONS.includes(k))
    return []
  } catch (e) {
    return []
  }
}

function userToJson(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name || '',
    phone: u.phone || '',
    perms: parsePerms(u.perms),
    createdAt: u.created_at || ''
  }
}

function requireAdmin(user) {
  if (!user || user.username !== 'admin') {
    throw new HttpError(403, '只有管理员可以管理账户与权限')
  }
}

function listUsers() {
  return db.prepare('SELECT * FROM users ORDER BY id ASC').all().map(userToJson)
}

function createUser(payload) {
  const phone = str(payload.phone)
  const pwd = String(payload.password || '')
  const displayName = str(payload.displayName)
  // 预留字段：短信验证码（当前不接短信服务，仅记录不校验）
  const smsCode = str(payload.smsCode)
  if (!/^1\d{10}$/.test(phone)) throw new HttpError(400, '请输入 11 位手机号作为登录账号')
  if (pwd.length < 6) throw new HttpError(400, '密码至少 6 位')
  const dup = db.prepare('SELECT id FROM users WHERE username = ? OR phone = ?').get(phone, phone)
  if (dup) throw new HttpError(409, '该手机号已注册，可直接登录')
  const perms = Array.isArray(payload.perms) ? JSON.stringify(payload.perms.filter((k) => PERM_SECTIONS.includes(k))) : ''
  const now = nowText()
  const info = db
    .prepare('INSERT INTO users (username, password_hash, display_name, phone, perms, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(phone, hashPassword(pwd), displayName || phone, phone, perms, now, now)
  return userToJson(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid))
}

function updateUser(id, payload) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!u) throw new HttpError(404, '用户不存在')
  const displayName = payload.displayName === undefined ? u.display_name : str(payload.displayName)
  let phone = u.phone
  if (payload.phone !== undefined) {
    const p = str(payload.phone)
    if (!/^1\d{10}$/.test(p)) throw new HttpError(400, '请输入 11 位手机号')
    const dup = db.prepare('SELECT id FROM users WHERE phone = ? AND id <> ?').get(p, id)
    if (dup) throw new HttpError(409, '该手机号已被其他账号使用')
    phone = p
  }
  let perms = u.perms || ''
  if (payload.perms !== undefined) {
    perms = Array.isArray(payload.perms) ? JSON.stringify(payload.perms.filter((k) => PERM_SECTIONS.includes(k))) : ''
  }
  db.prepare('UPDATE users SET display_name = ?, phone = ?, perms = ?, updated_at = ? WHERE id = ?')
    .run(displayName, phone, perms, nowText(), id)
  return userToJson(db.prepare('SELECT * FROM users WHERE id = ?').get(id))
}

function changeUserPassword(id, payload, authUser) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!u) throw new HttpError(404, '用户不存在')
  const pwd = String(payload.newPassword || '')
  if (pwd.length < 6) throw new HttpError(400, '新密码至少 6 位')
  const isSelf = authUser && authUser.id === u.id
  const isAdmin = authUser && authUser.username === 'admin'
  if (!isSelf && !isAdmin) throw new HttpError(403, '只能修改自己的密码')
  // 修改自己的密码必须校验旧密码；管理员重置他人密码除外
  if (isSelf) {
    const old = String(payload.oldPassword || '')
    if (!verifyPassword(old, u.password_hash)) throw new HttpError(400, '旧密码不正确')
  }
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(pwd), nowText(), id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id) // 改密后旧会话全部失效
  return { done: true }
}

function logoutApi(req) {
  const auth = String(req.headers.authorization || '')
  if (auth.startsWith('Bearer ')) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(auth.slice(7))
  }
  return { done: true }
}

// 忘记密码 · 发送验证码
// 短信服务商未配置时不伪造发送成功，返回演示模式验证码
const SMS_CONFIGURED = false // 接入阿里云/腾讯云短信后改为 true 并在 sendSms 中实现

function sendSms(phone, code) {
  // TODO: 接入真实短信服务商（需要账号、签名、模板审核，会产生费用）
  return false
}

function forgotSend(payload) {
  const phone = str(payload.phone)
  if (!/^1\d{10}$/.test(phone)) throw new HttpError(400, '请输入 11 位手机号')
  const u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone)
  if (!u) throw new HttpError(400, '该手机号未绑定任何账号')

  const today = nowText().slice(0, 10)
  const last = db.prepare('SELECT * FROM reset_codes WHERE phone = ? ORDER BY id DESC LIMIT 1').get(phone)
  if (last && last.last_send_at > timeText(-1)) {
    throw new HttpError(429, '发送太频繁，请 60 秒后再试')
  }
  const todayCount = db.prepare("SELECT COALESCE(SUM(send_count),0) AS n FROM reset_codes WHERE phone = ? AND send_date = ?").get(phone, today)
  if (Number(todayCount.n) >= 5) {
    throw new HttpError(429, '今天发送次数已达上限（5 次），请明天再试')
  }

  const code = String(crypto.randomInt(100000, 1000000))
  db.prepare('INSERT INTO reset_codes (phone, code_hash, attempts, expires_at, last_send_at, send_date, send_count, used) VALUES (?,?,?,?,?,?,?,0)')
    .run(phone, hashCode(code), 0, timeText(5), nowText(), today, 1)

  const sent = SMS_CONFIGURED ? sendSms(phone, code) : false
  if (!sent) {
    // 诚实模式：明确告知短信服务未配置，验证码仅用于演示流程
    return {
      sent: false,
      demo: true,
      demoCode: code,
      message: '短信服务未配置（需要短信服务商账号），当前为演示模式，验证码直接显示'
    }
  }
  return { sent: true, demo: false, message: '验证码已发送，5 分钟内有效' }
}

function forgotReset(payload) {
  const phone = str(payload.phone)
  const code = str(payload.code)
  const pwd = String(payload.newPassword || '')
  if (!/^1\d{10}$/.test(phone)) throw new HttpError(400, '请输入 11 位手机号')
  if (!code) throw new HttpError(400, '请输入验证码')
  if (pwd.length < 6) throw new HttpError(400, '新密码至少 6 位')

  const rc = db.prepare('SELECT * FROM reset_codes WHERE phone = ? AND used = 0 ORDER BY id DESC LIMIT 1').get(phone)
  if (!rc) throw new HttpError(400, '请先获取验证码')
  if (rc.expires_at <= nowText()) throw new HttpError(400, '验证码已过期，请重新获取')
  if (rc.attempts >= 5) throw new HttpError(400, '错误次数过多，验证码已失效，请重新获取')

  if (rc.code_hash !== hashCode(code)) {
    db.prepare('UPDATE reset_codes SET attempts = attempts + 1 WHERE id = ?').run(rc.id)
    throw new HttpError(400, '验证码错误')
  }

  const u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone)
  if (!u) throw new HttpError(400, '该手机号未绑定任何账号')

  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(pwd), nowText(), u.id)
    db.prepare('UPDATE reset_codes SET used = 1 WHERE id = ?').run(rc.id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id) // 旧会话全部失效
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch (ignore) {}
    throw e
  }
  return { done: true, username: u.username }
}

// 需要登录的接口判定：打印/导出/健康检查/认证接口公开，其余需要令牌
function isPublicPath(p) {
  return p === '/api/health' ||
    p === '/api/public/appearance' ||
    p === '/api/auth/login' ||
    p === '/api/auth/forgot/send' ||
    p === '/api/auth/forgot/reset' ||
    p.startsWith('/api/print/') ||
    p.startsWith('/api/export/') ||
    p.startsWith('/uploads/')
}

// ---------- 路由 ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'))
  const pathname = url.pathname
  const method = req.method

  if (method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }

  // 图片等上传文件的静态访问（公开，与打印页同源）
  if (pathname.startsWith('/uploads/') && method === 'GET') {
    return serveUpload(res, pathname)
  }

  // 认证接口（公开）
  if (pathname === '/api/auth/login' && method === 'POST') {
    return ok(res, loginApi(await readBody(req)))
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    return ok(res, logoutApi(req))
  }
  if (pathname === '/api/auth/forgot/send' && method === 'POST') {
    return ok(res, forgotSend(await readBody(req)))
  }
  if (pathname === '/api/auth/forgot/reset' && method === 'POST') {
    return ok(res, forgotReset(await readBody(req)))
  }

  // 登录校验：其余业务接口必须携带有效令牌
  let authUser = null
  if (!isPublicPath(pathname)) {
    const user = userByToken(req)
    if (!user) {
      return fail(res, 401, '未登录或登录已过期，请重新登录')
    }
    authUser = user
    if (pathname === '/api/auth/me' && method === 'GET') {
      return ok(res, { id: user.id, username: user.username, displayName: user.display_name || user.username, phone: user.phone || '', perms: parsePerms(user.perms) })
    }
    // 账户与权限管理（仅管理员）
    if (pathname === '/api/users' && method === 'GET') {
      requireAdmin(user)
      return ok(res, listUsers())
    }
    if (pathname === '/api/users' && method === 'POST') {
      requireAdmin(user)
      return ok(res, createUser(await readBody(req)))
    }
    const userMatch = pathname.match(/^\/api\/users\/(\d+)$/)
    if (userMatch && method === 'PUT') {
      requireAdmin(user)
      return ok(res, updateUser(Number(userMatch[1]), await readBody(req)))
    }
    const userPwdMatch = pathname.match(/^\/api\/users\/(\d+)\/password$/)
    if (userPwdMatch && method === 'POST') {
      return ok(res, changeUserPassword(Number(userPwdMatch[1]), await readBody(req), user))
    }
  }
  // 修改留痕里的「操作人」：当前登录账号的显示名，取不到时退回账号名
  const operator = authUser == null ? '' : (authUser.display_name || authUser.username)

  // 健康检查
  if (pathname === '/api/health' && method === 'GET') {
    return ok(res, {
      service: '蓝海电子销售开单系统后端',
      customers: count('customers'),
      products: count('products'),
      docs: count('docs'),
      contracts: count('contracts'),
      settings: count('app_settings')
    })
  }

  // 图片上传（需登录）
  if (pathname === '/api/upload' && method === 'POST') {
    return ok(res, uploadImage(await readBody(req, 9 * 1024 * 1024)))
  }

  // 客户
  if (pathname === '/api/customers' && method === 'GET') {
    return ok(res, listCustomers(url.searchParams.get('keyword')))
  }
  if (pathname === '/api/customers' && method === 'POST') {
    const r = createCustomer(await readBody(req))
    return ok(res, r.customer, { created: r.created })
  }
  const mCust = pathname.match(/^\/api\/customers\/(\d+)$/)
  if (mCust && method === 'PUT') {
    return ok(res, updateCustomer(Number(mCust[1]), await readBody(req)))
  }

  // 产品
  if (pathname === '/api/products' && method === 'GET') {
    return ok(res, listProducts(url.searchParams.get('keyword'), url.searchParams.get('category')))
  }
  if (pathname === '/api/products' && method === 'POST') {
    const r = createProduct(await readBody(req))
    return ok(res, r.product, { created: r.created })
  }
  const mProd = pathname.match(/^\/api\/products\/(\d+)$/)
  if (mProd && method === 'PUT') {
    return ok(res, updateProduct(Number(mProd[1]), await readBody(req)))
  }

  // 库存
  if (pathname === '/api/stock/logs' && method === 'GET') {
    return ok(res, listStockLogs(url.searchParams.get('limit')))
  }
  if (pathname === '/api/stock/move' && method === 'POST') {
    return ok(res, moveStock(await readBody(req)))
  }

  // 合同
  if (pathname === '/api/contracts' && method === 'GET') {
    return ok(res, listContracts(url.searchParams.get('keyword'), url.searchParams.get('status')))
  }
  if (pathname === '/api/contracts' && method === 'POST') {
    const r = createContract(await readBody(req), operator)
    return ok(res, r.contract, { created: r.created, updated: r.updated })
  }
  const mContract = pathname.match(/^\/api\/contracts\/(\d+)$/)
  if (mContract && method === 'GET') {
    return ok(res, getContract(Number(mContract[1])))
  }
  if (mContract && method === 'PUT') {
    return ok(res, updateContract(Number(mContract[1]), await readBody(req), operator))
  }
  const mExportWord = pathname.match(/^\/api\/contracts\/(\d+)\/export-word$/)
  if (mExportWord && method === 'GET') {
    try {
      const r = exportContractWord(Number(mExportWord[1]))
      res.writeHead(200, Object.assign({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="' + encodeURIComponent(r.filename) + '"',
        'Content-Length': r.buffer.length
      }, CORS))
      res.end(r.buffer)
    } catch (e) { return fail(res, e.status || 500, e.message) }
    return
  }
  if (pathname === '/api/contract-templates' && method === 'GET') {
    return ok(res, {
      purchase: { type: 'purchase', title: '产品购销合同' },
      construction: { type: 'construction', title: '施工合同' }
    })
  }

  // 基础设置
  if (pathname === '/api/settings' && method === 'GET') {
    return ok(res, getSettings())
  }
  if (pathname === '/api/settings' && method === 'PUT') {
    return ok(res, saveSettings(await readBody(req)))
  }

  // 登录页外观（公开，无需登录）：公司名 + 登录背景图
  if (pathname === '/api/public/appearance' && method === 'GET') {
    const s = getSettings()
    return ok(res, { companyName: s.companyName, loginBg: s.loginBg })
  }

  // 数据管理：备份 / 恢复 / 一键清空（均需登录）
  if (pathname === '/api/data/backup' && method === 'POST') {
    const p = await readBody(req)
    if (str(p.target) === 'nas') {
      return ok(res, backupToNas(p))
    }
    return ok(res, dataExport())
  }
  if (pathname === '/api/data/restore' && method === 'POST') {
    const p = await readBody(req, 64 * 1024 * 1024)
    if (str(p.source) === 'nas') {
      return ok(res, restoreFromNas(p))
    }
    return ok(res, dataRestore(p.data))
  }
  if (pathname === '/api/data/clear' && method === 'POST') {
    return ok(res, dataClear(await readBody(req)))
  }

  // 聚合搜索：单号 / 客户 / 金额（同时查单据与合同）
  if (pathname === '/api/search' && method === 'GET') {
    return ok(res, searchAll(url.searchParams.get('q')))
  }

  // 单据结款（只统计销售单 + 合同）
  if (pathname === '/api/settlement' && method === 'GET') {
    return ok(res, settlementData())
  }
  if (pathname === '/api/settlement/record' && method === 'POST') {
    return ok(res, recordPayment(await readBody(req)))
  }
  if (pathname === '/api/settlement/due' && method === 'PUT') {
    return ok(res, updateDueDays(await readBody(req)))
  }

  // 项目报价单（独立版页面数据入库）
  if (pathname === '/api/project-quotes' && method === 'GET') {
    return ok(res, listProjectQuotes())
  }
  if (pathname === '/api/project-quotes' && method === 'POST') {
    return ok(res, saveProjectQuote(await readBody(req)))
  }
  const mPQuote = pathname.match(/^\/api\/project-quotes\/(\d+)$/)
  if (mPQuote && method === 'GET') {
    return ok(res, getProjectQuote(Number(mPQuote[1])))
  }
  if (mPQuote && method === 'DELETE') {
    return ok(res, deleteProjectQuote(Number(mPQuote[1])))
  }

  // 备忘录（工具箱）
  if (pathname === '/api/memos' && method === 'GET') {
    return ok(res, listMemos(url.searchParams.get('remind') || ''))
  }
  if (pathname === '/api/memos' && method === 'POST') {
    return ok(res, saveMemo(await readBody(req, 4 * 1024 * 1024), operator))
  }
  const mMemo = pathname.match(/^\/api\/memos\/(\d+)$/)
  if (mMemo && method === 'DELETE') {
    return ok(res, deleteMemo(Number(mMemo[1])))
  }

  // 打印页（浏览器直接打开，A4 版式）
  const mPrintDoc = pathname.match(/^\/api\/print\/docs\/(\d+)$/)
  if (mPrintDoc && method === 'GET') {
    return sendHtml(res, printRenderer.docHtml(getDoc(Number(mPrintDoc[1])), getSettings()))
  }
  const mPrintContract = pathname.match(/^\/api\/print\/contracts\/(\d+)$/)
  if (mPrintContract && method === 'GET') {
    return sendHtml(res, printRenderer.contractHtml(getContract(Number(mPrintContract[1])), getSettings()))
  }

  // 导出 CSV（Excel 可直接打开）
  if (pathname === '/api/export/docs' && method === 'GET') {
    const list = listDocs(url.searchParams.get('type'))
    const header = ['单据编号', '单据类型', '客户名称', '联系人', '联系电话', '客户地址', '单据日期', '明细行数', '原始未税金额', '整单优惠折扣%', '优惠金额', '合计金额未税', '税率%', '合计金额含税', '状态', '制单人', '备注']
    const rows = list.map((d) => [
      d.docNo, d.type, d.customerName, d.customerContact, d.customerPhone, d.customerAddress, d.date, d.itemCount,
      Number(d.rawAmount > 0 ? d.rawAmount : d.amount).toFixed(2),
      Number(d.discountPercent || 0).toFixed(0),
      Number(d.discountAmount || 0).toFixed(2),
      Number(d.amount).toFixed(2),
      Number(d.taxRate || 0).toFixed(0),
      Number(d.taxAmount || 0) > 0 ? Number(d.taxAmount).toFixed(2) : '',
      d.status, d.owner, d.remark
    ])
    return sendCsv(res, 'docs-' + dateStamp() + '.csv', header, rows)
  }
  if (pathname === '/api/export/contracts' && method === 'GET') {
    const list = listContracts(url.searchParams.get('keyword'), url.searchParams.get('status'))
    const header = ['合同编号', '客户名称', '联系人', '联系电话', '合同金额', '签订日期', '状态', '负责人', '关联单据', '备注']
    const rows = list.map((c) => [c.contractNo, c.customerName, c.customerContact, c.customerPhone, Number(c.amount).toFixed(2), c.signDate, c.status, c.owner, c.docNo, c.remark])
    return sendCsv(res, 'contracts-' + dateStamp() + '.csv', header, rows)
  }

  // 单据
  if (pathname === '/api/docs' && method === 'GET') {
    return ok(res, listDocs(url.searchParams.get('type')))
  }
  if (pathname === '/api/docs' && method === 'POST') {
    const r = saveDoc(await readBody(req), operator)
    return ok(res, getDoc(r.docId), { archived: r.result, totalAmount: r.totalAmount })
  }
  // 装机单保存（含版本管理）
  if (pathname === '/api/docs/install' && method === 'POST') {
    const r = saveInstallDoc(await readBody(req), operator)
    return ok(res, getDoc(r.docId), { archived: r.result, totalAmount: r.totalAmount, versionNo: r.versionNo, rootDocId: r.rootDocId })
  }
  // 装机单历史版本列表
  const mVersions = pathname.match(/^\/api\/docs\/(\d+)\/versions$/)
  if (mVersions && method === 'GET') {
    return ok(res, listDocVersions(Number(mVersions[1])))
  }
  const mDoc = pathname.match(/^\/api\/docs\/(\d+)$/)
  if (mDoc && method === 'GET') {
    return ok(res, getDoc(Number(mDoc[1])))
  }
  if (mDoc && method === 'DELETE') {
    deleteDoc(Number(mDoc[1]))
    return ok(res, { deleted: true })
  }

  // 配件分类
  if (pathname === '/api/part-categories' && method === 'GET') {
    return ok(res, getPartCategories())
  }
  if (pathname === '/api/part-categories' && method === 'PUT') {
    return ok(res, savePartCategories(await readBody(req)))
  }

  // 商品分类字典（基础设置-分类管理）
  if (pathname === '/api/product-categories' && method === 'GET') {
    return ok(res, getProductCategories())
  }
  if (pathname === '/api/product-categories' && method === 'PUT') {
    return ok(res, saveProductCategories(await readBody(req)))
  }

  return fail(res, 404, '接口不存在：' + method + ' ' + pathname)
}

seedIfEmpty(seed.customers, seed.products, seed.contracts)
ensureAdminUser()

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (e instanceof HttpError) {
      fail(res, e.status, e.message)
    } else if (e && e.message && String(e.message).includes('database is locked')) {
      fail(res, 503, '数据库正忙（可能有其他保存正在进行），请稍后重试，本次保存未写入任何数据')
    } else {
      console.error('[500]', e)
      fail(res, 500, '服务器内部错误：' + (e && e.message ? e.message : String(e)) + '（本次保存已回滚，未写入任何数据）')
    }
  })
})

server.listen(PORT, () => {
  console.log('后端服务已启动: http://localhost:' + PORT)
  console.log('数据库文件: ' + require('./db').dbPath)
  console.log('客户 ' + count('customers') + ' 条 / 产品 ' + count('products') + ' 条 / 单据 ' + count('docs') + ' 条')
})
