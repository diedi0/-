'use strict'
// 数据库层：使用 Node 22 内置的 node:sqlite，无需安装任何第三方依赖
const { DatabaseSync } = require('node:sqlite')
const path = require('node:path')
const fs = require('node:fs')

const dataDir = path.join(__dirname, 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'sales.db')
const db = new DatabaseSync(dbPath)

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'C',
  credit_limit REAL NOT NULL DEFAULT 0,
  receivable REAL NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  spec TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '其他',
  unit TEXT NOT NULL DEFAULT '个',
  price REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  stock REAL NOT NULL DEFAULT 0,
  safe_stock REAL NOT NULL DEFAULT 0,
  remark TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL,
  type TEXT NOT NULL,
  customer_id INTEGER,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_contact TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  customer_address TEXT NOT NULL DEFAULT '',
  doc_date TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '草稿',
  owner TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_docs_no ON docs(doc_no);

CREATE TABLE IF NOT EXISTS doc_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL DEFAULT 0,
  product_id INTEGER,
  code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  spec TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  qty REAL NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 100,
  amount REAL NOT NULL DEFAULT 0,
  remark TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_doc_items_doc ON doc_items(doc_id);

CREATE TABLE IF NOT EXISTS stock_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  before_stock REAL NOT NULL DEFAULT 0,
  after_stock REAL NOT NULL DEFAULT 0,
  code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  spec TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  operator TEXT NOT NULL DEFAULT '',
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_stock_logs_product ON stock_logs(product_id);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_no TEXT NOT NULL,
  customer_id INTEGER,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_contact TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  sign_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '草稿',
  owner TEXT NOT NULL DEFAULT '',
  doc_no TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_no ON contracts(contract_no);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- 结款流水：doc_type 取 'sale'（销售单）或 'contract'（合同）
-- 报价单 / 装机单 / 项目报价单不参与结款统计，不会写入本表
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type TEXT NOT NULL,
  doc_id INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  paid_at TEXT NOT NULL DEFAULT '',
  pay_method TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_doc ON payments(doc_type, doc_id);

-- 项目报价单（独立版 project-quote 页面同步到后端的数据）
CREATE TABLE IF NOT EXISTS project_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_no TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_name ON users(username);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  remember INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS reset_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  last_send_at TEXT NOT NULL,
  send_date TEXT NOT NULL,
  send_count INTEGER NOT NULL DEFAULT 1,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reset_codes_phone ON reset_codes(phone);

-- 备忘录（工具箱）：富文本内容 + 大图留底 + 提醒日期
CREATE TABLE IF NOT EXISTS memos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  remind_date TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_memos_remind ON memos(remind_date);
`)

// 产品唯一性规则：名称 + 型号 + 规格 三者相同才算同一产品
// 旧版本按名称唯一，这里做一次索引迁移（仅删索引，不动数据）
db.exec('DROP INDEX IF EXISTS uq_products_name')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_products_identity ON products(name, model, spec)')

// 阶段五迁移：只加列、不删列，历史单据数据保持不动
// doc_items.image      商品图片在服务器上的路径（/uploads/xxx），空串表示无图
// docs.raw_amount      原始未税金额（优惠前）
// docs.discount_percent 整单优惠折扣（0-100 的百分比）
// docs.discount_amount 整单优惠金额
// docs.amount 继续存放「优惠后合计金额未税」，保证列表/导出/打印旧逻辑不变
function ensureColumn(table, name, ddl) {
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all()
  let found = false
  for (const c of cols) {
    if (c.name === name) {
      found = true
      break
    }
  }
  if (!found) {
    db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + ddl)
  }
}
ensureColumn('doc_items', 'image', "image TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'raw_amount', 'raw_amount REAL NOT NULL DEFAULT 0')
ensureColumn('docs', 'discount_percent', 'discount_percent REAL NOT NULL DEFAULT 0')
ensureColumn('docs', 'discount_amount', 'discount_amount REAL NOT NULL DEFAULT 0')
// 阶段六迁移：只加列、不删列
// docs.tax_amount  合计金额含税（优惠后未税金额 × (1+税率)），0 表示未计算含税
// docs.tax_rate    计算含税时使用的税率（百分数，如 13 表示 13%）
ensureColumn('docs', 'tax_amount', 'tax_amount REAL NOT NULL DEFAULT 0')
ensureColumn('docs', 'tax_rate', 'tax_rate REAL NOT NULL DEFAULT 0')
// 阶段九迁移：产品档案图片（/uploads/xxx 路径，空串表示无图）
ensureColumn('products', 'image', "image TEXT NOT NULL DEFAULT ''")

// 装机单改造迁移：只加列、不删列，历史单据数据保持不动
// docs 新增字段（装机单专用，其它单据为空串/0 不影响）：
//   root_doc_id     版本分组主键（同一单据的多个版本共享同一个 root_doc_id）
//   version_no      版本号（从 1 开始递增）
//   is_latest       是否为最新版本（1=是，0=历史版本）
//   title           装机单主标题（如"配置3 1080P/2K 重度游戏 轻度画图"）
//   tags            标签 JSON 数组（[{"text":"赛博朋克","color":"#F59E0B"}]）
//   company_name    本单公司名称快照（可与全局不同，不修改全局设置）
//   company_phone   本单公司电话快照
//   company_address 本单公司地址快照
//   company_logo    本单公司标志图片路径（/uploads/xxx）
ensureColumn('docs', 'root_doc_id', 'root_doc_id INTEGER')
ensureColumn('docs', 'version_no', 'version_no INTEGER NOT NULL DEFAULT 1')
ensureColumn('docs', 'is_latest', 'is_latest INTEGER NOT NULL DEFAULT 1')
ensureColumn('docs', 'title', "title TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'tags', "tags TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'company_name', "company_name TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'company_phone', "company_phone TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'company_address', "company_address TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'company_logo', "company_logo TEXT NOT NULL DEFAULT ''")
// 项目报价单专用字段（类目结构JSON/项目说明/报价说明/配色方案）
ensureColumn('docs', 'pq_categories', "pq_categories TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'project_desc', "project_desc TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'quote_note', "quote_note TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'color_scheme', "color_scheme TEXT NOT NULL DEFAULT ''")

// 装机单功能补偿迁移：只加列、不删列，历史数据保持不动
// docs.theme      主题配色 key（orange/blue/... 共15套，空串表示默认 orange）
// docs.bill_no    用户可编辑的展示编号（ZJ-YYYYMMDD-XX），与内部唯一键 doc_no 独立
// docs.services   服务项 JSON 数组字符串（["上门装机","质保1年"]）
// docs.qrcode     微信二维码图片路径（/uploads/xxx）
// docs.tax_input  含税金额输入值（字符串原样保存，便于还原用户输入）
// doc_items.icon  配件行前置图标 key（cpu/mobo/... 空串表示无图标）
// 优惠金额复用现有 docs.discount_amount 列；docs.amount 存「原价−优惠」后的实际总价
ensureColumn('docs', 'theme', "theme TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'bill_no', "bill_no TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'services', "services TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'qrcode', "qrcode TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'tax_input', "tax_input TEXT NOT NULL DEFAULT ''")
ensureColumn('doc_items', 'icon', "icon TEXT NOT NULL DEFAULT ''")

// 已有单据回填版本字段：root_doc_id = id，version_no = 1，is_latest = 1
// 仅在 root_doc_id 为空时回填，避免覆盖后续已版本化的数据
try {
  db.prepare('UPDATE docs SET root_doc_id = id WHERE root_doc_id IS NULL').run()
} catch (e) {
  // 兼容没有该列的旧库（ensureColumn 之前的情况）
}

// 合同表扩展：模板化合同（产品购销 / 施工）专用字段，旧合同 type=legacy 不受影响
ensureColumn('contracts', 'type', "type TEXT NOT NULL DEFAULT 'legacy'")
ensureColumn('contracts', 'title', "title TEXT NOT NULL DEFAULT ''")
ensureColumn('contracts', 'fields_json', "fields_json TEXT NOT NULL DEFAULT '{}'")
ensureColumn('contracts', 'items_json', "items_json TEXT NOT NULL DEFAULT '[]'")
ensureColumn('contracts', 'seal_company', "seal_company TEXT NOT NULL DEFAULT ''")
ensureColumn('contracts', 'seal_sign', "seal_sign TEXT NOT NULL DEFAULT ''")

// 产品档案新增「配件类别」字段（与 category 并列，装机单使用）
ensureColumn('products', 'part_category', "part_category TEXT NOT NULL DEFAULT ''")

// 结款模块迁移：只加列、不删列，历史数据默认「未结款、账期 30 天」
// settled_amount  已结金额（由 payments 流水累加）
// due_days        账期天数（默认 30 天，从单据日期起算）
// settled_at      结清时间（未结清为空串）
ensureColumn('docs', 'settled_amount', 'settled_amount REAL NOT NULL DEFAULT 0')
ensureColumn('docs', 'due_days', 'due_days INTEGER NOT NULL DEFAULT 30')
ensureColumn('docs', 'settled_at', "settled_at TEXT NOT NULL DEFAULT ''")
// 收款方式（现金/微信/支付宝/银行卡/对公银行转账）与最近一次结款日期
ensureColumn('docs', 'pay_method', "pay_method TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'paid_at', "paid_at TEXT NOT NULL DEFAULT ''")
ensureColumn('payments', 'pay_method', "pay_method TEXT NOT NULL DEFAULT ''")
ensureColumn('contracts', 'settled_amount', 'settled_amount REAL NOT NULL DEFAULT 0')
ensureColumn('contracts', 'due_days', 'due_days INTEGER NOT NULL DEFAULT 30')
ensureColumn('contracts', 'settled_at', "settled_at TEXT NOT NULL DEFAULT ''")

// 修改留痕：首次创建为 0，之后每次保存累加 1
ensureColumn('docs', 'edit_count', 'edit_count INTEGER NOT NULL DEFAULT 0')
ensureColumn('docs', 'last_edited_at', "last_edited_at TEXT NOT NULL DEFAULT ''")
ensureColumn('docs', 'last_editor', "last_editor TEXT NOT NULL DEFAULT ''")
ensureColumn('contracts', 'edit_count', 'edit_count INTEGER NOT NULL DEFAULT 0')
ensureColumn('contracts', 'last_edited_at', "last_edited_at TEXT NOT NULL DEFAULT ''")
ensureColumn('contracts', 'last_editor', "last_editor TEXT NOT NULL DEFAULT ''")

// 用户权限：JSON 数组字符串，空串 = 全部权限（兼容老账号 admin）
ensureColumn('users', 'perms', "perms TEXT NOT NULL DEFAULT ''")

// 配件分类配置（存 JSON 数组到 app_settings），首次启动写入默认分类
function ensurePartCategories() {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('partCategories')
  if (row) return
  const defaults = ['CPU', '主板', '散热器', '内存', '固态硬盘', '机械硬盘', '显卡', '电源', '机箱', '显示器', '键盘', '鼠标', '外设', '其他配件']
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('partCategories', JSON.stringify(defaults))
}
ensurePartCategories()

function nowText() {
  const d = new Date()
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
  )
}

function count(table) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM ' + table).get()
  return Number(row.n)
}

// 首次运行时把演示数据写入数据库，表里已有数据则不再重复写入
function seedIfEmpty(seedCustomers, seedProducts, seedContracts) {
  const now = nowText()
  if (count('customers') === 0) {
    const stmt = db.prepare(`INSERT INTO customers
      (name, short_name, contact, phone, address, level, credit_limit, receivable, tags, remark, source, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (const c of seedCustomers) {
      stmt.run(c.name, c.shortName, c.contact, c.phone, c.address, c.level,
        c.creditLimit, c.receivable, c.tags, c.remark, 'seed', now, now)
    }
  }
  if (count('products') === 0) {
    const stmt = db.prepare(`INSERT INTO products
      (code, name, brand, model, spec, category, unit, price, cost, stock, safe_stock, remark, source, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (const p of seedProducts) {
      stmt.run(p.code, p.name, p.brand, p.model, p.spec, p.category, p.unit,
        p.price, p.cost, p.stock, p.safeStock, p.remark, 'seed', now, now)
    }
  }
  if (seedContracts && count('contracts') === 0) {
    const stmt = db.prepare(`INSERT INTO contracts
      (contract_no, customer_id, customer_name, customer_contact, customer_phone, amount, sign_date, status, owner, doc_no, remark, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (const c of seedContracts) {
      const customer = db.prepare('SELECT * FROM customers WHERE name = ?').get(c.customerName)
      stmt.run(c.contractNo, customer ? customer.id : null, c.customerName,
        customer ? customer.contact : '', customer ? customer.phone : '',
        c.amount, c.signDate, c.status, c.owner, c.docNo, c.remark, now, now)
    }
  }
}

module.exports = { db, dbPath, nowText, seedIfEmpty, count }
