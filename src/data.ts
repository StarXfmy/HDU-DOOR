export type Category = 'study' | 'campus' | 'life' | 'tools'
export type Campus = 'general' | 'unknown'
export type EntryType = 'web' | 'qr' | 'guide' | 'pending'
export interface Service {
  id: string
  name: string
  description: string
  category: Category
  icon: string
  color: string
  keywords: string[]
  kind: EntryType
  campus: Campus
  url?: string
  qr?: string
  client?: string
  note?: string
  login?: string
  iconImage?: string
  custom?: boolean
  modified?: boolean
}

export const iconOptions = [
  { name: 'BadgeCheck', label: '认证' },
  { name: 'BookOpen', label: '书本' },
  { name: 'Bot', label: '助手' },
  { name: 'BriefcaseBusiness', label: '公文包' },
  { name: 'Building2', label: '楼宇' },
  { name: 'CalendarDays', label: '日历' },
  { name: 'CloudSun', label: '天气' },
  { name: 'Code2', label: '代码' },
  { name: 'Coffee', label: '咖啡' },
  { name: 'Droplets', label: '水滴' },
  { name: 'Flag', label: '旗帜' },
  { name: 'FlaskConical', label: '实验' },
  { name: 'Footprints', label: '运动' },
  { name: 'Globe2', label: '地球' },
  { name: 'GraduationCap', label: '学位帽' },
  { name: 'Landmark', label: '学校' },
  { name: 'Languages', label: '语言' },
  { name: 'Lightbulb', label: '灯泡' },
  { name: 'Mountain', label: '山峰' },
  { name: 'Package', label: '包裹' },
  { name: 'PanelsTopLeft', label: '服务大厅' },
  { name: 'PenLine', label: '写作' },
  { name: 'SearchCheck', label: '检索' },
  { name: 'Shapes', label: '工具' },
  { name: 'ShieldCheck', label: '安全' },
  { name: 'ShowerHead', label: '淋浴' },
  { name: 'Smartphone', label: '手机' },
  { name: 'Sparkles', label: '智能' },
  { name: 'Sprout', label: '成长' },
  { name: 'Store', label: '商店' },
  { name: 'Wrench', label: '维修' },
]

export const colorOptions = [
  { name: 'green', label: '绿色' },
  { name: 'blue', label: '蓝色' },
  { name: 'orange', label: '橙色' },
  { name: 'purple', label: '紫色' },
  { name: 'teal', label: '青色' },
  { name: 'rose', label: '玫瑰色' },
]

const iconNames = new Set(iconOptions.map(option => option.name))
const colorNames = new Set(colorOptions.map(option => option.name))
const categoryValues: Category[] = ['study', 'campus', 'life', 'tools']
const campusValues: Campus[] = ['general', 'unknown']
const kindValues: EntryType[] = ['web', 'qr', 'guide', 'pending']
const builtInQrImages = new Set(['/hui798-code.png', '/cainiao-code.jpg'])

export function normalizeWebUrl(url: string): string {
  if (typeof url !== 'string') throw new Error('网址必须是文字。')
  const value = url.trim()
  if (value.length > 2048) throw new Error('网址不能超过 2048 个字符。')
  if (!/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f\\]/u.test(value)) {
    throw new Error('网址必须是明确以 http:// 或 https:// 开头的有效地址。')
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('网址格式不正确，请检查域名与地址。')
  }
  const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/, 1)[0]
  if (!authority || authority.includes('@') || parsed.username || parsed.password) {
    throw new Error('网址不能内嵌用户名或密码。')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('网址只支持有效的 HTTP 或 HTTPS 地址。')
  }
  if (parsed.href.length > 2048) throw new Error('网址编码后超过 2048 个字符，请缩短地址。')
  return parsed.href
}

function validateImage(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 180000) {
    throw new Error(`${label}必须是 PNG、JPEG 或 WEBP 图片，且不能超过 180000 个字符。`)
  }
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match || match[2].length % 4 !== 0) {
    throw new Error(`${label}只支持 PNG、JPEG 或 WEBP 的 base64 图片。`)
  }
  let binary: string
  try {
    binary = atob(match[2])
    if (btoa(binary) !== match[2]) throw new Error()
  } catch {
    throw new Error(`${label}的 base64 图片内容无效。`)
  }
  const bytes = (index: number) => binary.charCodeAt(index)
  const valid = match[1] === 'png'
    ? binary.startsWith('\x89PNG\r\n\x1a\n')
    : match[1] === 'jpeg'
      ? bytes(0) === 0xff && bytes(1) === 0xd8 && bytes(2) === 0xff
      : binary.startsWith('RIFF') && binary.slice(8, 12) === 'WEBP'
  if (!valid) throw new Error(`${label}的图片内容与格式不符。`)
  return value
}

function validateText(value: unknown, label: string, maxLength: number, required = false): string {
  if (typeof value !== 'string' || value.length > maxLength || (required && !value.trim())) {
    throw new Error(`${label}${required ? '不能为空，且' : ''}必须是最多 ${maxLength} 个字符的文字。`)
  }
  return value
}

function validateOption<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new Error(`${label}不受支持。`)
  return value as T
}

export function validateService(input: unknown): Service {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('服务内容格式不正确。')
  const data = input as Record<string, unknown>
  if (typeof data.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(data.id)
    || ['constructor', 'prototype', '__proto__'].includes(data.id)) {
    throw new Error('服务 ID 必须为 1–100 个字母、数字、短横线或下划线，且以字母或数字开头。')
  }
  if (typeof data.icon !== 'string' || !iconNames.has(data.icon)) throw new Error('服务图标不受支持，请选择提供的图标。')
  if (typeof data.color !== 'string' || !colorNames.has(data.color)) throw new Error('服务颜色不受支持，请选择提供的颜色。')
  if (!Array.isArray(data.keywords) || data.keywords.length > 30 || ![...data.keywords].every(word => typeof word === 'string' && word.trim().length > 0 && word.length <= 80)) {
    throw new Error('服务关键词最多 30 个，每个必须是 1–80 个字符的文字。')
  }
  const service: Service = {
    id: data.id,
    name: validateText(data.name, '服务名称', 60, true),
    description: validateText(data.description, '服务介绍', 600),
    category: validateOption(data.category, categoryValues, '服务分类'),
    icon: data.icon,
    color: data.color,
    keywords: [...data.keywords],
    kind: validateOption(data.kind, kindValues, '服务类型'),
    campus: validateOption(data.campus, campusValues, '服务校区'),
  }
  if (data.note !== undefined) service.note = validateText(data.note, '服务说明', 1600)
  if (data.client !== undefined) service.client = validateText(data.client, '使用客户端', 40)
  if (data.login !== undefined) service.login = validateText(data.login, '登录说明', 1600)
  if (data.iconImage !== undefined) service.iconImage = validateImage(data.iconImage, '自定义图标')
  for (const flag of ['custom', 'modified'] as const) {
    if (data[flag] !== undefined) {
      if (typeof data[flag] !== 'boolean') throw new Error('服务来源标记必须是布尔值。')
      service[flag] = data[flag]
    }
  }
  // 切换类型时移除旧入口；即使不会保留，也不接受危险网址或图片。
  let url: string | undefined
  if (data.url !== undefined || service.kind === 'web') {
    if (typeof data.url !== 'string') throw new Error('网页服务必须填写有效的网址。')
    url = normalizeWebUrl(data.url)
  }
  if (service.kind === 'web') service.url = url
  let qr: string | undefined
  if (data.qr !== undefined || service.kind === 'qr') {
    qr = typeof data.qr === 'string' && builtInQrImages.has(data.qr) ? data.qr : validateImage(data.qr, '二维码')
  }
  if (service.kind === 'qr') service.qr = qr
  return service
}

export function imageUrl(path: string): string {
  return path.startsWith('/') ? `${import.meta.env.BASE_URL}${path.slice(1)}` : path
}

export const sourceUrl = 'https://hdu-campus-hub-bkmscmdessk.qoder.zone/'
export const catalogDate = '2026-11-22'
export const categories = [
  { id: 'study' as const, name: '学习与考试', icon: 'GraduationCap', description: '课程、考试与每一点进步' },
  { id: 'campus' as const, name: '校园办事', icon: 'Building2', description: '办事少绕路，信息不遗漏' },
  { id: 'life' as const, name: '生活服务', icon: 'Coffee', description: '照顾好校园里的日常' },
  { id: 'tools' as const, name: '资料与工具', icon: 'Shapes', description: '给学习多一点好用的帮手' },
]

export const services: Service[] = [
  { id: 'digital', name: '数字杭电', description: '学校一站式服务大厅，校园办事集中入口。', category: 'campus', icon: 'PanelsTopLeft', color: 'green', keywords: ['办事', '统一认证', '大厅', '缴费'], kind: 'web', campus: 'general', url: 'https://i.hdu.edu.cn/', login: '个人业务的登录要求以学校页面为准。' },
  { id: 'hduhelp', name: '杭电助手', description: '课表、成绩与考试信息，学习安排随手查。', category: 'study', icon: 'Bot', color: 'blue', keywords: ['课表', '成绩', '考试', 'hduhelp'], kind: 'web', campus: 'general', url: 'https://neo.hduhelp.com/' },
  { id: 'erke', name: '青春杭电', description: '发现第二课堂活动，让课外生活更丰富。', category: 'study', icon: 'Sprout', color: 'green', keywords: ['二课', '第二课堂', '报名', '活动', '学分'], kind: 'web', campus: 'general', url: 'https://erke.hdu.edu.cn/' },
  { id: 'chaoxing', name: '学习通', description: '查看网络课程、课程资料与学习任务。', category: 'study', icon: 'BookOpen', color: 'orange', keywords: ['超星', '作业', '网课', '课程'], kind: 'web', campus: 'general', url: 'https://i.mooc.chaoxing.com/space/index?ws=1' },
  { id: 'hdu', name: '学校官网', description: '学校新闻、通知公告与官方信息。', category: 'campus', icon: 'Landmark', color: 'blue', keywords: ['杭电', '通知', '新闻', '官网'], kind: 'web', campus: 'general', url: 'https://www.hdu.edu.cn/' },
  { id: 'logistics', name: '杭电后勤生活', description: '后勤报修、缴费与校园生活服务。', category: 'life', icon: 'Wrench', color: 'orange', keywords: ['报修', '宿舍', '维修', '缴费', '后勤'], kind: 'web', campus: 'unknown', url: 'https://s10088.wap.goliveplus.cn/', note: '各校区服务范围尚未核实，请先在目标平台确认所在校区。' },
  { id: 'schedule', name: '模拟排课', description: '提前规划课程，找到适合自己的课表。', category: 'study', icon: 'CalendarDays', color: 'purple', keywords: ['选课', '排课', '课表', '课程'], kind: 'web', campus: 'general', url: 'https://neo.hduhelp.com/navigation/course-dashboard' },
  { id: 'cet', name: '四六级考试', description: '全国大学英语四六级考试官方信息。', category: 'study', icon: 'Languages', color: 'orange', keywords: ['cet', '英语', '四级', '六级', '考试'], kind: 'web', campus: 'general', url: 'https://cet.neea.cn/' },
  { id: 'mooc', name: '中国大学 MOOC', description: '精品在线课程，拓展课堂之外的知识。', category: 'study', icon: 'Globe2', color: 'green', keywords: ['慕课', '网课', 'mooc', '公开课'], kind: 'web', campus: 'general', url: 'https://www.icourse163.org/' },
  { id: 'pta', name: 'PTA', description: '程序设计练习与课程实验辅助平台。', category: 'study', icon: 'Code2', color: 'blue', keywords: ['编程', 'c语言', '代码', '作业', '刷题'], kind: 'web', campus: 'general', url: 'https://pintia.cn/' },
  { id: 'luogu', name: '洛谷', description: '算法练习与信息学竞赛交流社区。', category: 'study', icon: 'Mountain', color: 'purple', keywords: ['算法', '编程', '竞赛', '刷题'], kind: 'web', campus: 'general', url: 'https://www.luogu.com.cn/' },
  { id: 'lab', name: '远程实验管理系统', description: '课程实验与远程实验的管理入口。', category: 'study', icon: 'FlaskConical', color: 'teal', keywords: ['实验', '预约', '远程实验'], kind: 'web', campus: 'unknown', url: 'https://www.ycsypt.com/#/', note: '课程与校区适用范围待核实，请以任课教师通知为准。' },
  { id: 'erke-mobile', name: '青春杭电 · 微信端', description: '第二课堂的移动端入口，适合手机访问。', category: 'study', icon: 'Smartphone', color: 'green', keywords: ['二课', '第二课堂', '微信', '手机'], kind: 'web', campus: 'general', client: '微信端', url: 'https://erke.hdu.edu.cn/weixin/#/' },
  { id: 'chsi', name: '学信网', description: '学历学籍查询与在线验证服务。', category: 'campus', icon: 'BadgeCheck', color: 'blue', keywords: ['学籍', '学历', '学信', '验证', '证明'], kind: 'web', campus: 'general', url: 'https://www.chsi.com.cn/' },
  { id: 'youth', name: '智慧团建', description: '网上共青团与团组织事务办理。', category: 'campus', icon: 'Flag', color: 'rose', keywords: ['团员', '团组织', '团关系', '转接'], kind: 'web', campus: 'general', url: 'https://zhtj.youth.cn/zhtj/' },
  { id: 'safety', name: '安全教育', description: '校园安全知识学习，通用入口等待确认。', category: 'campus', icon: 'ShieldCheck', color: 'teal', keywords: ['安全', '考试', '教育'], kind: 'pending', campus: 'unknown', note: '尚未收录可公开分享的通用入口。请从学校或辅导员的正式通知进入，不要转发含个人登录信息的链接。' },
  { id: 'lost', name: '失物认领', description: '找找遗失物品，也帮物品找到主人。', category: 'life', icon: 'BriefcaseBusiness', color: 'purple', keywords: ['失物招领', '丢东西', '寻物', '遗失', '认领'], kind: 'web', campus: 'unknown', url: 'https://swzl.hdu.edu.cn/web_app/#/', note: '发布与认领前，请确认物品所在地和服务覆盖校区。' },
  { id: 'water', name: '慧生活 798', description: '直饮水、热水、淋浴与洗衣服务。', category: 'life', icon: 'Droplets', color: 'blue', keywords: ['喝水', '饮水', '热水', '洗衣', '淋浴', '798'], kind: 'qr', campus: 'unknown', client: '支付宝', qr: '/hui798-code.png', note: '二维码来自参考目录，尚未独立核实其服务范围。请使用支付宝扫一扫；同机可保存图片后从相册识别。支付前核对商户与所在校区。' },
  { id: 'parcel', name: '菜鸟驿站', description: '查找校园快递与取件服务入口。', category: 'life', icon: 'Package', color: 'orange', keywords: ['快递', '取件', '包裹', '菜鸟', '淘宝'], kind: 'qr', campus: 'unknown', client: '手机淘宝', qr: '/cainiao-code.jpg', note: '二维码来自参考目录，尚未独立核实其服务范围。请使用手机淘宝扫一扫；同机可保存图片后从相册识别。网点与校区以识别结果为准。' },
  { id: 'running', name: '运动时间 bank', description: '运动锻炼与校园打卡服务。', category: 'life', icon: 'Footprints', color: 'green', keywords: ['跑步', '体育', '运动', '打卡', 'bank'], kind: 'guide', campus: 'unknown', client: '微信', note: '参考目录建议在微信搜索“运动时间bank”小程序。未独立核实各校区适用性，请以体育课程通知为准。' },
  { id: 'shower', name: '文一后勤淋浴', description: '淋浴预约与热水服务，使用范围待确认。', category: 'life', icon: 'ShowerHead', color: 'teal', keywords: ['洗澡', '热水', '文一', '淋浴'], kind: 'guide', campus: 'unknown', client: '微信', note: '参考目录建议在微信搜索“文一后勤淋浴”小程序。名称不等于已核实的服务范围，请根据宿舍通知选择。' },
  { id: 'baitu', name: '佰途校园', description: '校园生活服务的小程序入口指引。', category: 'life', icon: 'Store', color: 'rose', keywords: ['佰途', '百途', '生活', '小程序'], kind: 'guide', campus: 'unknown', client: '微信', note: '参考目录建议在微信搜索“佰途校园”小程序。请确认服务商与所在校区后再使用。' },
  { id: 'weather', name: '天气预报', description: '中国天气网，出门前看看天气。', category: 'life', icon: 'CloudSun', color: 'orange', keywords: ['天气', '下雨', '温度', '绍兴', '杭州'], kind: 'web', campus: 'general', url: 'https://www.weather.com.cn/weather/101210109.shtml', note: '参考目录提供的是固定地区链接，不会自动切换城市。打开后请确认或手动切换到所在城市。' },
  { id: 'student-ai', name: '杭电学生助手', description: '学校 AI 学生智能助手入口。', category: 'tools', icon: 'Sparkles', color: 'purple', keywords: ['ai', '人工智能', '问答', '咨询'], kind: 'web', campus: 'general', url: 'https://aitalk.hdu.edu.cn/aiapp/student' },
  { id: 'pubscholar', name: 'PubScholar', description: '公益学术平台，检索论文与科研资料。', category: 'tools', icon: 'SearchCheck', color: 'teal', keywords: ['论文', '文献', '学术', '检索', '科研'], kind: 'web', campus: 'general', url: 'https://pubscholar.cn/' },
  { id: 'pacy', name: 'Pacy work', description: '开题与写作辅助，生成内容需自行核验。', category: 'tools', icon: 'PenLine', color: 'rose', keywords: ['论文', '写作', '开题', 'ai'], kind: 'web', campus: 'general', url: 'https://pacywork.com/', note: '第三方工具，不代表学校推荐。使用前检查费用、隐私政策与课程的 AI 使用规定。' },
  { id: 'smart', name: '数你最灵', description: 'AI 学习助手，辅助理解与学习。', category: 'tools', icon: 'Lightbulb', color: 'orange', keywords: ['ai', '数学', '人工智能', '学习'], kind: 'web', campus: 'general', url: 'https://smartestu.cn/', note: '第三方平台，使用规则与费用以目标网站为准；AI 结果需自行判断。' },
]

export function verification(service: Service) {
  if (service.custom) return '用户添加的服务，尚未核实'
  if (service.modified) return '用户编辑的服务，尚未核实'
  if (service.kind !== 'web') return '仅核对参考目录，未在对应 App 内验证'
  if (service.id === 'cet') return '本机请求返回 403，无法据此判断入口失效'
  if (['pubscholar', 'pacy'].includes(service.id)) return '本机 TLS 连接失败，访问情况待进一步确认'
  if (['digital', 'chaoxing'].includes(service.id)) return '已响应并跳转登录页，未验证登录后功能'
  return '公开地址返回 HTTP 200，未验证登录后功能与前端路由'
}

export const serviceById = new Map(services.map(service => [service.id, service]))
export const defaultFavorites = ['digital', 'hduhelp', 'erke', 'chaoxing']
export const campusNames = { all: '全部校区', shaoxing: '绍兴校区', xiasha: '下沙校区', wenyi: '文一校区' } as const
export type CampusFilter = keyof typeof campusNames
export const kindNames: Record<EntryType, string> = { web: '网页入口', qr: '扫码使用', guide: '小程序指引', pending: '入口待核实' }

export function searchServices(catalog: Service[], query: string): { items: Service[]; matchedBy: 'title' | 'description' | 'all' } {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return { items: [...catalog], matchedBy: 'all' }
  const matches = (text: string) => {
    const normalized = text.toLowerCase()
    return terms.every(term => normalized.includes(term))
  }
  const titles = catalog.filter(service => matches(service.name))
  if (titles.length > 0) return { items: titles, matchedBy: 'title' }
  return {
    items: catalog.filter(service => matches([service.description, ...service.keywords, service.note ?? ''].join(' '))),
    matchedBy: 'description',
  }
}
