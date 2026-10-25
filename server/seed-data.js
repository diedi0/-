'use strict'
// 初始演示数据：首次启动后端时写入数据库，之后以数据库为准

const customers = [
  { name: '杭州启明智能装备有限公司', shortName: '启明智能', contact: '陈立新', phone: '13805712345', address: '杭州市滨江区江虹路 1750 号', level: 'A', creditLimit: 300000, receivable: 86000, tags: '长期合作,电子制造', remark: '厂区网络与监控年度维护客户' },
  { name: '宁波海拓精密机械有限公司', shortName: '海拓精密', contact: '王海涛', phone: '13905748821', address: '宁波市北仑区新碶街道长江路 66 号', level: 'A', creditLimit: 200000, receivable: 42000, tags: '项目施工,制造业', remark: '新厂房弱电项目在实施' },
  { name: '绍兴越城职业技术学校', shortName: '越城职校', contact: '李国栋', phone: '13588120099', address: '绍兴市越城区群贤路 320 号', level: 'B', creditLimit: 150000, receivable: 128000, tags: '院校,政府采购', remark: '机房改造项目，回款周期较长' },
  { name: '嘉兴南湖数字科技有限公司', shortName: '南湖数科', contact: '周敏', phone: '13600553377', address: '嘉兴市南湖区亚太路 1358 号', level: 'B', creditLimit: 120000, receivable: 0, tags: '互联网,新客户', remark: '办公网络采购，付款及时' },
  { name: '湖州德清汽车零部件有限公司', shortName: '德清汽配', contact: '赵建平', phone: '13705726688', address: '湖州市德清县武康镇环城北路 88 号', level: 'B', creditLimit: 80000, receivable: 36000, tags: '制造业', remark: '车间监控扩容需求' },
  { name: '金华义乌商贸城管理有限公司', shortName: '义乌商贸', contact: '吴晓芳', phone: '13868001122', address: '金华市义乌市国际商贸城五区', level: 'A', creditLimit: 260000, receivable: 154000, tags: '商业综合体,长期合作', remark: '商城内监控与广播系统' },
  { name: '台州椒江医疗器械有限公司', shortName: '椒江医疗', contact: '林志强', phone: '13906867733', address: '台州市椒江区东海大道 258 号', level: 'B', creditLimit: 90000, receivable: 18000, tags: '医疗,制造业', remark: '净化车间网络布线' },
  { name: '温州瓯海物流有限公司', shortName: '瓯海物流', contact: '郑大伟', phone: '13566778899', address: '温州市瓯海区娄桥街道汇通路 12 号', level: 'C', creditLimit: 50000, receivable: 32000, tags: '物流', remark: '仓储无线覆盖，价格敏感' },
  { name: '衢州江山建筑安装工程有限公司', shortName: '江山建安', contact: '徐永军', phone: '13757001234', address: '衢州市江山市虎山街道鹿溪路 5 号', level: 'C', creditLimit: 60000, receivable: 0, tags: '工程商,合作方', remark: '弱电分包合作，按项目结算' },
  { name: '杭州临平第二中学', shortName: '临平二中', contact: '孙晓红', phone: '13858889900', address: '杭州市临平区南苑街道世纪大道 188 号', level: 'B', creditLimit: 100000, receivable: 24000, tags: '院校,政府采购', remark: '多媒体教室设备更新' }
]

const products = [
  { code: 'SW-2408', name: '核心交换机', brand: '华为', model: 'S5735-L24T4S', category: '网络设备', unit: '台', price: 3280.0, cost: 2600.0, stock: 18, safeStock: 5, spec: '24口千兆 + 4口光口，三层网管', remark: '企业组网常用型号' },
  { code: 'SW-1624', name: '接入交换机', brand: '华为', model: 'S1730S-L16T-A', category: '网络设备', unit: '台', price: 860.0, cost: 690.0, stock: 42, safeStock: 10, spec: '16口千兆非网管', remark: '办公区接入使用' },
  { code: 'CAM-2A4', name: '网络摄像机', brand: '海康威视', model: 'DS-2CD2T25FWD', category: '视频监控', unit: '台', price: 420.0, cost: 330.0, stock: 120, safeStock: 20, spec: '200万像素 红外50米 室外枪机', remark: '含支架' },
  { code: 'CAM-3A6', name: '半球摄像机', brand: '海康威视', model: 'DS-2CD2325FWD', category: '视频监控', unit: '台', price: 380.0, cost: 300.0, stock: 86, safeStock: 20, spec: '200万像素 室内半球', remark: '吸顶安装' },
  { code: 'NVR-16', name: '网络硬盘录像机', brand: '海康威视', model: 'DS-7616N-K2', category: '视频监控', unit: '台', price: 1680.0, cost: 1350.0, stock: 4, safeStock: 5, spec: '16路接入 双盘位', remark: '不含硬盘' },
  { code: 'HDD-6T', name: '监控级硬盘', brand: '希捷', model: 'ST6000VX001', category: '视频监控', unit: '块', price: 980.0, cost: 820.0, stock: 26, safeStock: 10, spec: '6TB 监控专用', remark: '质保三年' },
  { code: 'CAB-6E', name: '超六类网线', brand: '秋叶原', model: 'CAT6-305', category: '综合布线', unit: '箱', price: 620.0, cost: 480.0, stock: 35, safeStock: 8, spec: '305米/箱 无氧铜', remark: '非屏蔽' },
  { code: 'TRAY-100', name: 'PVC线槽', brand: '联塑', model: '24x14', category: '综合布线', unit: '根', price: 8.5, cost: 5.6, stock: 800, safeStock: 100, spec: '2米/根 白色', remark: '明装布线' },
  { code: 'PDU-8', name: '机柜PDU', brand: '大唐保镖', model: 'HP-8008', category: '机房设备', unit: '个', price: 260.0, cost: 180.0, stock: 15, safeStock: 5, spec: '8位 10A 机架式', remark: '带开关' },
  { code: 'RACK-42', name: '网络机柜', brand: '图腾', model: 'G26642', category: '机房设备', unit: '台', price: 1850.0, cost: 1500.0, stock: 1, safeStock: 2, spec: '42U 600x600 前网门', remark: '含风扇与层板' },
  { code: 'AP-3000', name: '无线AP', brand: '华为', model: 'AirEngine 5762-12', category: '网络设备', unit: '台', price: 1280.0, cost: 1020.0, stock: 3, safeStock: 6, spec: 'Wi-Fi 6 双频 吸顶式', remark: '库存低于安全值' },
  { code: 'FIB-24', name: '光纤配线架', brand: '普天', model: 'ODF-24', category: '综合布线', unit: '个', price: 320.0, cost: 240.0, stock: 9, safeStock: 3, spec: '24芯 机架式', remark: '含法兰盘' },
  { code: 'SVR-2U', name: '机架式服务器', brand: '浪潮', model: 'NF5280M6', category: '服务器', unit: '台', price: 28600.0, cost: 24800.0, stock: 2, safeStock: 1, spec: '2U 双路 64G内存 4T存储', remark: '项目配套' },
  { code: 'UPS-3K', name: '在线式UPS', brand: '山特', model: 'C3KS', category: '机房设备', unit: '台', price: 3650.0, cost: 3050.0, stock: 6, safeStock: 2, spec: '3kVA 在线式 需外接电池', remark: '含电池柜另计' },
  { code: 'SRV-INST', name: '综合布线施工服务', brand: '蓝海电子', model: '施工服务', category: '施工服务', unit: '点', price: 180.0, cost: 120.0, stock: 9999, safeStock: 0, spec: '含线材辅材与人工 按信息点计', remark: '现场施工' },
  { code: 'SRV-INST-CAM', name: '监控安装调试服务', brand: '蓝海电子', model: '施工服务', category: '施工服务', unit: '路', price: 260.0, cost: 180.0, stock: 9999, safeStock: 0, spec: '含安装、调试、培训 按摄像机路数计', remark: '现场施工' }
]

const contracts = [
  { contractNo: 'HT-20261021-0001', customerName: '金华义乌商贸城管理有限公司', amount: 328000.0, signDate: '2026-10-21', status: '执行中', owner: '演示管理员', docNo: 'XM-20261021-0001', remark: '商城内监控与广播系统施工合同，分三期回款' },
  { contractNo: 'HT-20261022-0001', customerName: '宁波海拓精密机械有限公司', amount: 74200.0, signDate: '2026-10-22', status: '已验收', owner: '演示管理员', docNo: 'ZJ-20261022-0001', remark: '新厂房弱电装机，已验收待回款' },
  { contractNo: 'HT-20261015-0002', customerName: '绍兴越城职业技术学校', amount: 186500.0, signDate: '2026-10-15', status: '执行中', owner: '演示管理员', docNo: 'BJ-20261023-0001', remark: '机房改造项目，工期 45 天' },
  { contractNo: 'HT-20261010-0001', customerName: '杭州启明智能装备有限公司', amount: 48620.0, signDate: '2026-10-10', status: '已验收', owner: '演示管理员', docNo: 'XS-20261024-0003', remark: '厂区网络设备采购，质保一年' },
  { contractNo: 'HT-20260928-0003', customerName: '温州瓯海物流有限公司', amount: 9600.0, signDate: '2026-09-28', status: '已终止', owner: '演示管理员', docNo: 'XS-20261020-0001', remark: '客户预算调整，双方协商终止' },
  { contractNo: 'HT-20260920-0001', customerName: '台州椒江医疗器械有限公司', amount: 21500.0, signDate: '2026-09-20', status: '已验收', owner: '演示管理员', docNo: 'ZJ-20261018-0001', remark: '净化车间网络布线，已验收' }
]

module.exports = { customers, products, contracts }
