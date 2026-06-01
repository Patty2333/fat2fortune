// ============================================================
//  🏆 肥财实验室 - 减肥 = 存钱
//  核心逻辑：克制消费存钱 → 心愿礼物 | 饥饿打卡 → 奖励金
// ============================================================

// ===== 数据模型 =====
const DEFAULT_DATA = {
  wishes: [],              // 心愿礼物列表 [{ id, name, target, image, saved }]
  activeWishId: null,      // 当前选中的心愿ID（存钱目标）
  history: [],             // 历史记录 [{ type, name, amount, note, timestamp, wishId? }]
  checkins: [],            // 打卡日期列表 ['2025-05-10', ...]
  totalSaved: 0,           // 累计存钱总额
  bonusEarned: 0,          // 打卡奖金累计
  currentStreak: 0,        // 当前进度（0-3）
  lastCheckinDate: null,   // 上次打卡日期
  unlockedBadges: [],      // 已解锁的成就ID列表
};

// ===== 成就徽章定义 =====
// 每个徽章支持 progress(d) → 0~1 返回当前进度
// 等级：0=灰(未开始) 1=暗(起步) 2=亮(接近) 3=金光(已解锁)
const ACHIEVEMENTS = [
  {
    id: 'first_resist',
    icon: '🛑',
    name: '初次克制',
    desc: '第一次忍住没买高热量食物，自律之旅正式开始！',
    condition: (d) => d.history.some(h => h.type === 'resist'),
    progress: (d) => d.history.some(h => h.type === 'resist') ? 1 : 0,
  },
  {
    id: 'streak_3',
    icon: '🔥',
    name: '三日燃火',
    desc: '连续3天带着饥饿感入睡，你的意志力正在燃烧！',
    condition: (d) => d.currentStreak >= 3,
    progress: (d) => Math.min(1, d.currentStreak / 3),
  },
  {
    id: 'streak_7',
    icon: '⚡',
    name: '周周坚持',
    desc: '连续7天打卡！一周的自律换来一生的习惯。',
    condition: (d) => d.currentStreak >= 7,
    progress: (d) => Math.min(1, d.currentStreak / 7),
  },
  {
    id: 'streak_30',
    icon: '💎',
    name: '月度传奇',
    desc: '连续30天打卡！你已经超越了90%的人。',
    condition: (d) => d.currentStreak >= 30,
    progress: (d) => Math.min(1, d.currentStreak / 30),
  },
  {
    id: 'save_100',
    icon: '💰',
    name: '百元存钱罐',
    desc: '通过克制消费累计存下100元！每一分都是自律的勋章。',
    condition: (d) => d.totalSaved >= 100,
    progress: (d) => Math.min(1, d.totalSaved / 100),
  },
  {
    id: 'save_500',
    icon: '🏦',
    name: '小富翁',
    desc: '累计存下500元！你的钱包和身材同时变好了。',
    condition: (d) => d.totalSaved >= 500,
    progress: (d) => Math.min(1, d.totalSaved / 500),
  },
  {
    id: 'resist_10',
    icon: '🛡️',
    name: '十次护盾',
    desc: '成功克制10次美食诱惑！你的自控力已经坚如磐石。',
    condition: (d) => d.history.filter(h => h.type === 'resist').length >= 10,
    progress: (d) => Math.min(1, (d.history.filter(h => h.type === 'resist').length) / 10),
  },
  {
    id: 'wish_50',
    icon: '🎯',
    name: '半程目标',
    desc: '心愿礼物进度达到50%！离梦想又近了一大步。',
    condition: (d) => (d.wishes && d.wishes.some(w => w.target > 0 && (w.saved / w.target) >= 0.5)),
    progress: (d) => {
      if (!d.wishes || d.wishes.length === 0) return 0;
      const maxProg = Math.max(...d.wishes.filter(w => w.target > 0).map(w => w.saved / w.target), 0);
      return Math.min(1, maxProg);
    },
  },
];

// 根据进度返回等级 0~3
function getBadgeLevel(progress) {
  if (progress >= 1) return 3;   // 已解锁 - 金光
  if (progress >= 0.5) return 2; // 接近 - 亮
  if (progress > 0) return 1;    // 起步 - 暗
  return 0;                       // 未开始 - 灰
}

// ===== 鼓励文案库（每次随机不同）=====
const ENCOURAGEMENTS = {
  resist: [
    { icon: '🏆', title: '太强了！', text: '你刚刚战胜了多巴胺的诱惑！每一克克制都是对未来的投资。这笔钱会变成你真正值得拥有的东西。' },
    { icon: '💪', title: '自律即自由！', text: '此刻的你比99%的人都要强大。不是因为你没有欲望，而是你能驾驭欲望。这28块钱是你意志力的勋章！' },
    { icon: '⭐', title: '了不起的决定！', text: '想想看——那些高热量食物10分钟就吃完了，但你攒下的钱能陪伴你很久很久。这笔账，你算赢了！' },
    { icon: '🔥', title: '燃烧吧卡路里！', text: '你没吃进去的热量 = 你省下的钱 = 你离心愿更近了一步。三赢局面，这就是肥财智慧！' },
    { icon: '👑', title: '王者级自控力！', text: '真正的富人不乱花钱在短暂的快感上。你今天的行为说明——你已经拥有了富人思维的第一块拼图！' },
    { icon: '🎯', title: '正中红心！', text: '每一次"不买"，都是在给未来的自己打款。你的AirPods正在向你招手，它说："谢谢你没买那包炒货！"' },
    { icon: '✨', title: '闪闪发光的选择！', text: '你知道吗？大多数人花掉的钱都变成了 waistline（腰围），而你花的钱变成了 wishlist（愿望清单）。高下立判！' },
    { icon: '🚀', title: '起飞模式启动！', text: '克制一次看起来不多，但30次就是840元，100次就是2800元！你现在正在复利增长的路上狂飙！' },
    { icon: '💎', title: '钻石般的意志！', text: '钻石和石墨成分一样，区别只在压力。你承受住了美食诱惑的压力，所以你在发光！' },
    { icon: '🌟', title: '今日MVP！', text: '如果自律有奥运会，你刚刚拿到了金牌。颁奖嘉宾是未来的你自己——那个戴着AirPods、身材火辣的你！' },
    { icon: '🎪', title: '杂技般的平衡术！', text: '平衡欲望和目标是一门艺术，而你是大师级艺术家。这幅作品的名字叫《我用炒货换了未来》。' },
    { icon: '🦁', title: '狮子般的心！', text: '狮子不会追逐每一只路过的兔子。你有更大的猎物——那就是你清单上的心愿礼物。保持专注，王者！' },
  ],
  checkin: [
    { icon: '🌙', title: '带着饥饿感入睡', text: '这是最奢侈的自律！科学研究表明，轻度饥饿感能促进细胞自噬、延缓衰老。你不是在挨饿，你是在做身体的大扫除！' },
    { icon: '💫', title: '星光入梦', text: '今晚的星星会格外亮——因为一个自律的人在仰望它们。空腹入睡的你，明天醒来会比今天更轻盈、更强大。' },
    { icon: '🧘', title: '禅意时刻', text: '古人云：饭吃七分饱。你做到了极致版——带着一丝饥饿感入睡，这是对身体最温柔的修行。Namaste 🙏' },
    { icon: '🌸', title: '晚安，战士', text: '今天的战场你已经赢了。胃里空空的，但心里满满的——装着离心愿更近一步的自己。好梦！' },
    { icon: '🦋', title: '蜕变进行中', text: '蝴蝶破茧前也是黑暗和紧绷的。你现在的饥饿感就是茧——穿过它，你会长出翅膀。' },
    { icon: '🌊', title: '如水般坚韧', text: '水能穿石不是因为力量，而是坚持。你连续的饥饿感打卡就像滴水穿石——看似缓慢，实则无可阻挡。' },
    { icon: '🔮', title: '预见未来', text: '闭上眼睛想象一下：三个月后的你，体重轻了，钱包鼓了，手里拿着心愿礼物。这一切从今晚的饥饿感开始。' },
    { icon: '🎵', title: '夜的交响曲', text: '胃的轻微抗议声？那是你身体的交响乐团在演奏《自律协奏曲》。今晚的指挥家——就是你！' },
  ],
  bonus: [
    { icon: '🎁', title: '奖励到账！', text: '恭喜你完成3天连续饥饿感打卡！系统自动为你存入¥30奖励金！这是宇宙对你自律的认可！' },
    { icon: '🎉', title: '里程碑达成！', text: '三天！整整三天带着饥饿感入睡！这不是普通人能做到的。¥30奖励金已打入你的心愿账户！' },
    { icon: '💰', title: '奖金发放中...', text: '连续3天打卡成就解锁！¥30已自动存入你的心愿礼物基金。你的身体和钱包同时变好了，这是什么神仙操作？' },
    { icon: '🏅', title: '勋章+1', text: '【三日断食夜】成就达成！奖励金¥30已到账。继续坚持，下一个里程碑在6天后等你！' },
  ],
};

// 热量估算映射（每元对应预估kcal）
const CALORIE_PER_YUAN = 35; // 平均每元食物约35kcal

// ============================================================
//  🔐 用户认证系统（localStorage 多用户支持）
// ============================================================

const AUTH_KEY = 'fat2fortune_auth';       // 当前登录用户
const USERS_KEY = 'fat2fortune_users';     // 所有注册用户 { username: { nickname, passwordHash } }
const DATA_PREFIX = 'fat2fortune_data_';   // 用户数据前缀 fat2fortune_data_xxx

// ===== 认证工具函数 =====

function getUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setCurrentUser(user) {
  if (user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_KEY);
  }
}

// 简单哈希（非安全用途，仅防明文存储）
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}

// ===== 登录 / 注册 / 登出 =====

function openAuthModal(panel = 'login') {
  switchAuthPanel(panel);
  document.getElementById('authModal').classList.add('active');
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('active');
  // 清空表单
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('regNickname').value = '';
  document.getElementById('regUsername').value = '';
  document.getElementById('regPassword').value = '';
  document.getElementById('regPassword2').value = '';
}

function switchAuthPanel(panel) {
  document.getElementById('loginPanel').style.display = panel === 'login' ? 'block' : 'none';
  document.getElementById('registerPanel').style.display = panel === 'register' ? 'block' : 'none';
}

function handleRegister() {
  const nickname = document.getElementById('regNickname').value.trim();
  const username = document.getElementById('regUsername').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  const password2 = document.getElementById('regPassword2').value;

  // 验证
  if (!nickname || !username || !password) {
    showToast('⚠️ 请填写完整信息');
    return;
  }
  if (username.length < 3 || username.length > 20) {
    showToast('⚠️ 用户名需 3-20 个字符');
    return;
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
    showToast('⚠️ 用户名只能包含字母、数字、下划线或中文');
    return;
  }
  if (password.length < 6) {
    showToast('⚠️ 密码至少6位');
    return;
  }
  if (password !== password2) {
    showToast('⚠️ 两次密码不一致');
    return;
  }

  const users = getUsers();
  if (users[username]) {
    showToast('⚠️ 该用户名已被注册');
    return;
  }

// 注册用户
users[username] = {
  id: simpleHash(username + Date.now()),
  nickname: nickname,
  avatar: '🐷', // 默认头像
  passwordHash: simpleHash(password),
  createdAt: new Date().toISOString(),
};
saveUsers(users);

  showToast('✅ 注册成功！请登录');
  switchAuthPanel('login');
  // 预填用户名
  document.getElementById('loginUsername').value = username;
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginPassword').focus();
}

function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) {
    showToast('⚠️ 请输入用户名和密码');
    return;
  }

  const users = getUsers();
  const user = users[username];

  if (!user) {
    showToast('⚠️ 用户不存在');
    return;
  }
  if (user.passwordHash !== simpleHash(password)) {
    showToast('⚠️ 密码错误');
    return;
  }

  // 登录成功
  setCurrentUser({ 
    username, 
    nickname: user.nickname,
    avatar: user.avatar || '🐷',
    id: user.id,
    createdAt: user.createdAt
  });
  showToast(`🎉 欢迎回来，${user.nickname}！`);
  closeAuthModal();

  // 加载该用户数据并刷新页面
  data = loadData();
  renderAll();
  updateAuthUI();
}

function handleLogout() {
  if (!confirm('确定要退出登录吗？\n（你的数据已保存在本地，下次登录即可恢复）')) return;

  setCurrentUser(null);
  data = { ...DEFAULT_DATA }; // 重置为默认数据
  showToast('👋 已退出登录');

  // 切回首页
  switchTab('home');
  renderAll();
  updateAuthUI();

  // 打开登录弹窗
  setTimeout(() => openAuthModal('login'), 400);
}

// 检查是否已登录，未登录则弹窗
function checkAuth() {
  const user = getCurrentUser();
  if (!user) {
    // 延迟一点弹出，让页面先渲染
    setTimeout(() => openAuthModal('login'), 600);
    return false;
  }
  return true;
}

// 更新"我的"页面的登录状态UI
function updateAuthUI() {
  const user = getCurrentUser();
  const profileName = document.getElementById('profileName');
  const profileHeader = document.querySelector('.profile-header');
  const profileAvatar = profileHeader?.querySelector('.profile-avatar');

  if (user && profileName) {
    // 已登录：显示昵称 + 登出按钮
    profileName.textContent = user.nickname;
    
    // 显示用户头像
    if (profileAvatar) {
      if (user.avatarData) {
        profileAvatar.innerHTML = `<img src="${user.avatarData}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
      } else {
        profileAvatar.textContent = '🐷';
      }
    }
    
    if (profileHeader && !profileHeader.classList.contains('profile-header-logged-in')) {
      profileHeader.classList.add('profile-header-logged-in');
      // 添加登出按钮（如果还没有）
      if (!profileHeader.querySelector('.logout-btn')) {
        const btn = document.createElement('button');
        btn.className = 'logout-btn';
        btn.textContent = '退出登录';
        btn.onclick = handleLogout;
        profileHeader.appendChild(btn);
      }
    }
  } else {
    // 未登录：显示默认 + 引导登录
    if (profileName) profileName.textContent = '自律达人';
    if (profileAvatar) profileAvatar.textContent = '🐷';
    const logoutBtn = profileHeader?.querySelector('.logout-btn');
    if (logoutBtn) logoutBtn.remove();
    if (profileHeader) profileHeader.classList.remove('profile-header-logged-in');
  }
}

// 点击遮罩层关闭登录弹窗
document.addEventListener('click', (e) => {
  if (e.target.id === 'authModal') {
    // 如果未登录，不允许关闭
    if (!getCurrentUser()) return;
    closeAuthModal();
  }
});

// 回车键提交
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const authModal = document.getElementById('authModal');
    if (authModal && authModal.classList.contains('active')) {
      const loginPanel = document.getElementById('loginPanel');
      if (loginPanel.style.display !== 'none') {
        handleLogin();
      } else {
        handleRegister();
      }
    }
  }
});

// ===== 工具函数（多用户数据隔离）=====
function loadData() {
  try {
    // 根据当前登录用户加载数据
    const user = getCurrentUser();
    const dataKey = user ? DATA_PREFIX + user.username : 'fat2fortune_data';
    const raw = localStorage.getItem(dataKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 迁移旧的 wish 单对象到 wishes 数组
      if (parsed.wish && !parsed.wishes) {
        const oldWish = parsed.wish;
        parsed.wishes = [{
          id: 'wish_migrated_' + Date.now(),
          name: oldWish.name,
          target: oldWish.target,
          image: oldWish.image || '',
          saved: oldWish.saved || 0,
        }];
        parsed.activeWishId = parsed.wishes[0].id;
        delete parsed.wish;
        // 立即保存迁移后的数据
        localStorage.setItem(dataKey, JSON.stringify(parsed));
        console.log('✅ 已迁移旧心愿数据到新格式');
      }
      // 确保 wishes 字段存在
      if (!parsed.wishes) {
        parsed.wishes = [];
      }
      return parsed;
    }
  } catch (e) {
    console.error('数据加载失败:', e);
  }
  return { ...DEFAULT_DATA };
}

function saveData(data) {
  try {
    // 根据当前登录用户保存数据
    const user = getCurrentUser();
    const dataKey = user ? DATA_PREFIX + user.username : 'fat2fortune_data';
    localStorage.setItem(dataKey, JSON.stringify(data));
  } catch (e) {
    console.error('数据保存失败:', e);
  }
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hour}:${min}`;
}

function formatAmount(n) {
  return Number(n).toFixed(0);
}

// 随机选取（排除最近使用的）
let _lastUsedIndices = { resist: -1, checkin: -1, bonus: -1 };
function pickRandom(type) {
  const pool = ENCOURAGEMENTS[type];
  let idx;
  do {
    idx = Math.floor(Math.random() * pool.length);
  } while (idx === _lastUsedIndices[type] && pool.length > 1);
  _lastUsedIndices[type] = idx;
  return pool[idx];
}

// ===== 全局状态 =====
let data = loadData();

// 日历系统变量（提前声明，避免 TDZ 错误）
let calViewYear, calViewMonth;

// ===== 初始化用户系统 =====
function initUserSystem() {
  const users = getUsers();
  // 如果没有任何用户，创建一个演示账户
  if (Object.keys(users).length === 0) {
    const demoUser = {
      id: simpleHash('demo_' + Date.now()),
      nickname: '自律达人',
      avatar: '🐷',
      passwordHash: simpleHash('123456'),
      createdAt: new Date().toISOString(),
    };
    users['demo'] = demoUser;
    saveUsers(users);
    console.log('✅ 已创建演示账户: 用户名=demo, 密码=123456');
  }

  // 检查是否有旧数据需要迁移到 Patty 账户
  migrateDataToPatty();
}

// ===== 数据迁移到 Patty 账户 =====
function migrateDataToPatty() {
  const users = getUsers();
  
  // 检查是否已存在 Patty 账户
  if (!users['patty']) {
    // 创建 Patty 账户
    users['patty'] = {
      id: simpleHash('patty_' + Date.now()),
      nickname: 'Patty',
      avatar: '🐷',
      passwordHash: simpleHash('patty24puth'),
      createdAt: new Date().toISOString(),
    };
    saveUsers(users);
    console.log('✅ 已创建 Patty 账户');
  }

  // 检查旧数据（未登录时的数据）
  const oldDataKey = 'fat2fortune_data';
  const oldData = localStorage.getItem(oldDataKey);
  
  if (oldData) {
    // 如果存在旧数据，将其迁移到 Patty 账户
    const pattyDataKey = DATA_PREFIX + 'patty';
    const existingPattyData = localStorage.getItem(pattyDataKey);
    
    // 如果 Patty 还没有数据，就用旧数据
    if (!existingPattyData) {
      localStorage.setItem(pattyDataKey, oldData);
      console.log('✅ 已将旧数据迁移到 Patty 账户');
    }
    
    // 删除旧数据键
    localStorage.removeItem(oldDataKey);
  }
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  initUserSystem();   // 初始化用户系统（如果需要创建演示账户）
  setupAvatarUpload(); // 初始化头像上传
  renderFoodChips();   // 渲染食物标签（从localStorage读取）
  renderAll();
  initFoodPresets();
  checkDailyReset();
  initAllEventListeners();
  playEntranceAnimationDelayed();

  // 检查登录状态 + 更新"我的"页面UI
  updateAuthUI();
  checkAuth();
});

// 统一初始化所有事件监听器
function initAllEventListeners() {
  // ===== 底部Tab切换 =====
  initTabSwitch();

  // 给行动按钮绑定涟漪
  document.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('click', (e) => createRipple(e, btn));
  });

  // ---- 心愿卡片点击交互 ----
  document.querySelector('.wish-card')?.addEventListener('click', (e) => {
    if (e.target.closest('.btn-add-wish')) return;
    if (e.target.closest('.wish-edit-btn') || e.target.closest('.wish-delete-btn')) return;
    // 如果已有心愿，打开活跃心愿的编辑；否则新建
    const activeWish = getActiveWish();
    openWishModal(activeWish ? activeWish.id : undefined);
  });

  // 空状态也支持点击（使用事件委托，因为 wishEmpty 是动态渲染的）
  // 已在上面通过 document.addEventListener 处理

  // ---- 打卡进度卡片/火焰/圆环 点击 → 打开日历弹窗 ----
  document.querySelector('.streak-card')?.addEventListener('click', () => {
    openCalendarModal();
  });

  document.querySelector('.streak-flame')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openCalendarModal();
  });

  document.querySelector('.progress-ring-wrap')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openCalendarModal();
  });

  // ---- 累计金额点击 → 跳转到目标页 ----
  document.querySelector('.total-saved-display')?.addEventListener('click', () => {
    switchTab('goal');
  });

  // ---- 按钮按住效果（移动端触控优化）----
  document.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('touchstart', () => {
      btn.style.transform = 'scale(0.95)';
    }, { passive: true });
    btn.addEventListener('touchend', () => {
      btn.style.transform = '';
    }, { passive: true });
  });
}

// 延迟播放入场动画
function playEntranceAnimationDelayed() {
  setTimeout(playEntranceAnimation, 100);
}

function renderAll() {
  renderTotalSaved();
  renderWishCard();
  renderStreakCard();
  renderHistoryList();
  updateCheckinButtonState();
  renderBadgeCard();
  // 渲染各Tab页面数据
  renderGoalPage();
  renderRecordPage();
  renderMinePage();
}

// ===== 渲染：累计金额 =====
function renderTotalSaved() {
  const el = document.getElementById('totalSaved');
  animateNumber(el, data.totalSaved);
}

function animateNumber(el, target) {
  const start = parseInt(el.textContent) || 0;
  const duration = 500;
  const startTime = performance.now();

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // easeOutExpo
    const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    el.textContent = formatAmount(start + (target - start) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ===== 工具：获取当前活跃心愿 =====
function getActiveWish() {
  if (!data.wishes || data.wishes.length === 0) return null;
  if (data.activeWishId) {
    const found = data.wishes.find(w => w.id === data.activeWishId);
    if (found) return found;
  }
  // 回退到第一个心愿
  return data.wishes[0];
}

// ===== 渲染：心愿卡片 =====
function renderWishCard() {
  const container = document.getElementById('wishDisplay');

  if (!data.wishes || data.wishes.length === 0) {
    container.innerHTML = `
      <div class="wish-empty-state" id="wishEmpty">
        <div class="empty-icon">🎯</div>
        <p>还没有心愿礼物<br><small>点击右上角 + 添加一个吧</small></p>
      </div>`;
    return;
  }

  // 展示所有心愿卡片
  let html = '<div class="wish-list">';
  data.wishes.forEach(w => {
    const percent = w.target > 0 ? Math.min((w.saved / w.target) * 100, 100) : 0;
    const isComplete = percent >= 100;
    const isActive = data.activeWishId ? w.id === data.activeWishId : w === data.wishes[0];

    html += `
      <div class="wish-active fade-in${isActive ? ' wish-selected' : ''}" data-wish-id="${w.id}" onclick="selectWish('${w.id}')">
        <div class="wish-img-wrap">
          ${w.image ? `<img src="${w.image}" alt="${w.name}" onerror="this.parentElement.innerHTML='🎁'">` : '🎁'}
        </div>
        <div class="wish-info">
          <div class="wish-name">${w.name} ${isComplete ? '🎉' : ''} ${isActive ? '⭐' : ''}</div>
          <div class="wish-progress-bar">
            <div class="wish-progress-fill" style="width: ${percent}%"></div>
          </div>
          <div class="wish-amount-row">
            <span class="wish-current">¥${formatAmount(w.saved)}</span>
            <span class="wish-target">目标 ¥${formatAmount(w.target)}</span>
            <span class="wish-percent">${percent.toFixed(1)}%</span>
          </div>
        </div>
        <button class="wish-edit-btn" onclick="event.stopPropagation(); openWishModal('${w.id}')" title="编辑">✏️</button>
        <button class="wish-delete-btn" onclick="event.stopPropagation(); deleteWish('${w.id}')" title="删除">✕</button>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

// ===== 选中心愿作为存钱目标 =====
function selectWish(wishId) {
  data.activeWishId = wishId;
  saveData(data);
  renderWishCard();
  renderGoalWish();
  const w = data.wishes.find(w => w.id === wishId);
  if (w) showToast(`⭐ 已选择「${w.name}」作为存钱目标`);
}

// ===== 删除心愿 =====
function deleteWish(wishId) {
  const w = data.wishes.find(w => w.id === wishId);
  if (!w) return;
  if (!confirm(`确定要删除心愿「${w.name}」吗？\n已存入的 ¥${formatAmount(w.saved)} 将从累计总额中扣除。`)) return;

  data.totalSaved -= w.saved;
  data.wishes = data.wishes.filter(w => w.id !== wishId);

  // 如果删除的是当前活跃的，切换到第一个
  if (data.activeWishId === wishId) {
    data.activeWishId = data.wishes.length > 0 ? data.wishes[0].id : null;
  }

  saveData(data);
  renderAll();
  showToast(`🗑️ 已删除心愿「${w.name}」`);
}

// ===== 渲染：打卡进度 =====
function renderStreakCard() {
  document.getElementById('currentStreak').textContent = data.currentStreak;
  const remaining = 3 - (data.currentStreak % 3);
  document.getElementById('daysUntilReward').textContent = remaining === 0 ? '领奖！' : remaining;
  document.getElementById('ringText').textContent = `${data.currentStreak % 3}/3`;

  // 更新圆环进度
  const ring = document.getElementById('streakRing');
  const progress = (data.currentStreak % 3) / 3;
  const circumference = 2 * Math.PI * 42; // r=42
  ring.style.strokeDasharray = circumference;
  ring.style.strokeDashoffset = circumference * (1 - progress);

  // 根据进度变色
  if (data.currentStreak % 3 === 0 && data.currentStreak > 0) {
    ring.style.stroke = '#00C853'; // 绿色-可领奖
  } else if (progress >= 0.66) {
    ring.style.stroke = '#FFD700'; // 金色-快到了
  } else {
    ring.style.stroke = '#3D3D3D'; // 深灰-正常
  }
}

// ===== 渲染：历史记录 =====
function renderHistoryList() {
  const list = document.getElementById('historyList');
  if (data.history.length === 0) {
    list.innerHTML = `<div class="history-empty"><p>🌟 还没有记录，开始你的第一次克制吧！</p></div>`;
    return;
  }

  // 最新的在前
  const sorted = [...data.history].reverse();
  list.innerHTML = sorted.map(item => {
    let iconClass = item.type;
    let icon = '📝';
    let amountClass = 'positive';

    if (item.type === 'resist') {
      icon = '🛑';
      amountClass = 'positive';
    } else if (item.type === 'checkin') {
      icon = '🌙';
      amountClass = '';
    } else if (item.type === 'bonus') {
      icon = '🎁';
      amountClass = 'bonus';
    }

    return `
      <div class="history-item" data-index="${data.history.length - 1 - sorted.indexOf(item)}">
        <div class="history-icon ${iconClass}">${icon}</div>
        <div class="history-body">
          <div class="history-title">${item.name}</div>
          ${item.note ? `<div class="history-note">${item.note}</div>` : ''}
        </div>
        <div class="history-time">${formatTime(item.timestamp)}</div>
        <div class="history-amount ${amountClass}">+¥${formatAmount(item.amount)}</div>
      </div>`;
  }).join('');
}

// ===== 打卡按钮状态 =====
function updateCheckinButtonState() {
  const btn = document.querySelector('.btn-checkin');
  const subtext = document.getElementById('checkinSubtext');
  const today = getToday();

  if (data.checkins.includes(today)) {
    btn.classList.add('checked');
    subtext.textContent = '今日已打卡 ✓';
  } else {
    btn.classList.remove('checked');
    subtext.textContent = '带着饥饿感打卡';
  }
}

// ===== 每日重置检查 =====
function checkDailyReset() {
  const today = getToday();
  // 如果上次打卡不是今天且不是昨天，则连续天数归零
  if (data.lastCheckinDate) {
    const last = new Date(data.lastCheckinDate);
    const now = new Date(today);
    const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
      // 中断了，重置streak但保留历史记录
      data.currentStreak = 0;
      saveData(data);
      renderStreakCard();
    }
  }
}

// ===== 食物预设初始化 =====
function initFoodPresets() {
  const container = document.getElementById('foodPresets');
  if (!container) return;

  // 使用事件委托，区分点击标签主体和编辑区域
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.food-chip');
    if (!chip) return;

    // 检查是否点击在右侧编辑区域（后30%宽度内）
    const rect = chip.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const isEditClick = clickX > rect.width * 0.7;

    if (isEditClick) {
      // 点击了编辑区域 → 打开管理弹窗
      const idx = Array.from(container.querySelectorAll('.food-chip')).indexOf(chip);
      openFoodManageModal(idx);
      return;
    }

    // 正常点击 → 选中标签
    const chips = container.querySelectorAll('.food-chip');
    chips.forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');

    const amountInput = document.getElementById('resistAmount');
    if (amountInput) amountInput.value = chip.dataset.price;
  });
}

// ===== 食物标签数据（默认 + 用户自定义）=====
const FOODS_STORAGE_KEY = 'fat2fortune_foods';

const DEFAULT_FOODS = [
  { emoji: '🥜', name: '薛记炒货', price: 28 },
  { emoji: '🧋', name: '奶茶', price: 18 },
  { emoji: '🍗', name: '炸鸡套餐', price: 35 },
  { emoji: '🍰', name: '蛋糕甜点', price: 32 },
  { emoji: '🍢', name: '烧烤夜宵', price: 60 },
  { emoji: '🍲', name: '火锅', price: 120 },
  { emoji: '🍟', name: '快餐', price: 22 },
  { emoji: '🍦', name: '冰淇淋', price: 15 },
];

function getFoodList() {
  try {
    const raw = localStorage.getItem(FOODS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [...DEFAULT_FOODS];
}

function saveFoodList(list) {
  localStorage.setItem(FOODS_STORAGE_KEY, JSON.stringify(list));
}

// 渲染食物预设标签到克制弹窗
function renderFoodChips() {
  const container = document.getElementById('foodPresets');
  if (!container) return;

  const foods = getFoodList();
  container.innerHTML = foods.map((food, i) =>
    `<button class="food-chip${i === 0 ? ' selected' : ''}" data-name="${food.name}" data-price="${food.price}">${food.emoji} ${food.name} ¥${food.price}</button>`
  ).join('');

  // 重新绑定点击事件
  initFoodPresets();

  // 设置默认金额为第一个食物的价格
  const amountInput = document.getElementById('resistAmount');
  if (amountInput && foods.length > 0) amountInput.value = foods[0].price;
}

// ===== 账户编辑弹窗 =====

function openProfileModal() {
  const user = getCurrentUser();
  if (!user) {
    openAuthModal('login');
    return;
  }

  // 填充现有数据
  const nicknameInput = document.getElementById('profileNicknameInput');
  const profileJoinDate = document.getElementById('profileJoinDate');
  const profileAccountId = document.getElementById('profileAccountId');

  nicknameInput.value = user.nickname || '';
  profileJoinDate.textContent = new Date(user.createdAt).toLocaleDateString('zh-CN');
  profileAccountId.textContent = user.id;

  // 如果用户有头像，显示头像
  if (user.avatarData) {
    document.getElementById('avatarPreview').src = user.avatarData;
  } else {
    // 重置为默认头像
    document.getElementById('avatarPreview').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23FFF4E0' width='100' height='100'/%3E%3Ctext x='50' y='50' font-size='50' text-anchor='middle' dy='.3em'%3E🐷%3C/text%3E%3C/svg%3E";
  }

  document.getElementById('profileModal').classList.add('active');
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('active');
}

// 图片上传和裁剪
function setupAvatarUpload() {
  const avatarUpload = document.getElementById('avatarUpload');
  if (!avatarUpload) return;

  avatarUpload.addEventListener('change', handleAvatarUpload);
}

function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  // 检查文件类型
  if (!file.type.startsWith('image/')) {
    showToast('⚠️ 请选择图片文件');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      // 使用 canvas 进行裁剪（正方形）
      const canvas = document.getElementById('avatarCanvas');
      canvas.width = 200;
      canvas.height = 200;

      const ctx = canvas.getContext('2d');
      
      // 计算裁剪尺寸（取最小边）
      const size = Math.min(img.width, img.height);
      const x = (img.width - size) / 2;
      const y = (img.height - size) / 2;

      // 绘制圆形头像
      ctx.beginPath();
      ctx.arc(100, 100, 100, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, x, y, size, size, 0, 0, 200, 200);

      // 获取头像数据 URL
      const avatarData = canvas.toDataURL('image/png');
      
      // 显示预览
      const preview = document.getElementById('avatarPreview');
      preview.src = avatarData;

      showToast('✅ 头像已选择');
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);

  // 重置 input，允许选择相同文件
  e.target.value = '';
}

function saveProfileChanges() {
  const user = getCurrentUser();
  if (!user) return;

  const newNickname = document.getElementById('profileNicknameInput').value.trim();
  const avatarPreview = document.getElementById('avatarPreview');

  if (!newNickname) {
    showToast('⚠️ 昵称不能为空');
    return;
  }

  // 获取头像数据
  const newAvatarData = avatarPreview.src;

  // 更新用户信息
  user.nickname = newNickname;
  user.avatarData = newAvatarData;

  const users = getUsers();
  if (users[user.username]) {
    users[user.username].nickname = newNickname;
    users[user.username].avatarData = newAvatarData;
    saveUsers(users);
    setCurrentUser(user);
  }

  // 更新头部显示
  updateAuthUI();
  renderMinePage();

  // 保存后立即关闭弹窗
  closeProfileModal();
  showToast('✅ 账户信息已保存');
}

// ===== 食物标签管理弹窗 =====

function openFoodManageModal(highlightIdx) {
  renderFoodManageList(highlightIdx);
  document.getElementById('foodManageModal').classList.add('active');
}

function closeFoodManageModal() {
  document.getElementById('foodManageModal').classList.remove('active');
}

function renderFoodManageList(highlightIdx) {
  const listEl = document.getElementById('foodManageList');
  const foods = getFoodList();

  listEl.innerHTML = foods.map((food, idx) => `
    <div class="food-manage-item${idx === highlightIdx ? ' food-highlight' : ''}" data-idx="${idx}">
      <span class="food-manage-emoji">${food.emoji}</span>
      <span class="food-manage-name">${food.name}</span>
      <span class="food-manage-price">¥${food.price}</span>
      <button class="food-manage-delete" onclick="deleteFoodItem(${idx})" title="删除">✕</button>
    </div>
  `).join('');
}

function addFoodItem() {
  const emoji = document.getElementById('newFoodEmoji').value.trim() || '🍴';
  const name = document.getElementById('newFoodName').value.trim();
  const price = parseInt(document.getElementById('newFoodPrice').value) || 0;

  if (!name) { showToast('⚠️ 请输入食物名称'); return; }
  if (price <= 0 || price > 9999) { showToast('⚠️ 请输入有效价格(1-9999)'); return; }

  const foods = getFoodList();
  foods.push({ emoji, name, price });

  // 清空输入
  document.getElementById('newFoodEmoji').value = '';
  document.getElementById('newFoodName').value = '';
  document.getElementById('newFoodPrice').value = '';

  renderFoodManageList();
  showToast(`✅ 已添加「${emoji} ${name}」`);
}

function deleteFoodItem(idx) {
  const foods = getFoodList();
  const removed = foods.splice(idx, 1)[0];
  renderFoodManageList();
  showToast(`🗑️ 已删除「${removed.emoji} ${removed.name}」`);
}

function saveFoodListAndClose() {
  // 从管理列表中读取当前状态（因为 add/delete 已经修改了内存中的数据）
  // 这里直接保存即可，renderFoodManageList 已经通过 add/delete 操作了实际列表
  // 但为了安全，重新从 DOM 收集
  const items = document.querySelectorAll('.food-manage-item');
  const foods = getFoodList(); // 当前的 foods 数组已经是最新的（add/delete 直接操作了）

  saveFoodList(foods);

  // 重新渲染克制弹窗的食物标签
  renderFoodChips();

  closeFoodManageModal();
  showToast('✅ 食物标签已更新！');
}

// ===== 克制消费弹窗 =====
function openResistModal() {
  if (!data.wishes || data.wishes.length === 0) {
    showToast('⚠️ 请先添加一个心愿礼物哦～点右上角的 + 按钮！');
    openWishModal();
    return;
  }
  if (!getActiveWish()) {
    showToast('⚠️ 请先选择一个心愿礼物作为存钱目标！');
    return;
  }
  document.getElementById('resistModal').classList.add('active');
  // 清空自定义输入
  document.getElementById('customFoodName').value = '';
  document.getElementById('customFoodPrice').value = '';
}

function closeResistModal() {
  document.getElementById('resistModal').classList.remove('active');
}

// 使用自定义食物
function useCustomFood() {
  const nameInput = document.getElementById('customFoodName');
  const priceInput = document.getElementById('customFoodPrice');
  const name = nameInput.value.trim();
  const price = parseFloat(priceInput.value) || 0;

  if (!name) {
    showToast('⚠️ 请输入物品名称哦！');
    nameInput.focus();
    return;
  }
  if (price <= 0) {
    showToast('⚠️ 请输入有效的金额！');
    priceInput.focus();
    return;
  }

  // 取消所有预设标签的选中状态
  document.querySelectorAll('.food-chip').forEach(c => c.classList.remove('selected'));

  // 创建一个新的选中标签（动态添加到预设区）
  const presetsContainer = document.getElementById('foodPresets');
  // 移除之前可能存在的自定义标签
  const existingCustom = presetsContainer.querySelector('.food-chip-custom');
  if (existingCustom) existingCustom.remove();

  const customChip = document.createElement('button');
  customChip.className = 'food-chip food-chip-custom selected';
  customChip.setAttribute('data-name', name);
  customChip.setAttribute('data-price', price);
  customChip.textContent = `✏️ ${name} ¥${price}`;
  customChip.addEventListener('click', () => {
    document.querySelectorAll('.food-chip').forEach(c => c.classList.remove('selected'));
    customChip.classList.add('selected');
    document.getElementById('resistAmount').value = price;
  });
  presetsContainer.appendChild(customChip);

  // 更新金额输入框
  document.getElementById('resistAmount').value = price;

  // 反馈
  showToast(`✅ 已选择「${name}」¥${price}`);
}

function confirmResist() {
  const selectedChip = document.querySelector('.food-chip.selected');
  const name = selectedChip ? selectedChip.dataset.name : '自制美食';
  const amount = parseFloat(document.getElementById('resistAmount').value) || 0;
  const note = document.getElementById('resistNote').value.trim();

  if (amount <= 0) {
    showToast('⚠️ 请输入有效的金额哦！');
    return;
  }

  // 按钮加载状态反馈
  const btn = document.querySelector('.btn-resist-confirm');
  const origText = btn.textContent;
  btn.textContent = '✨ 存入中...';
  btn.style.opacity = '0.7';
  btn.disabled = true;

  // 短暂延迟让用户看到反馈
  setTimeout(() => {
    // 记录
    const record = {
      type: 'resist',
      name: `忍住没买「${name}」`,
      amount: amount,
      note: note || `省下 ¥${amount}`,
      timestamp: Date.now(),
    };

    data.history.push(record);
    data.totalSaved += amount;
    const activeWish = getActiveWish();
    if (activeWish) {
      activeWish.saved += amount;
      record.wishId = activeWish.id;
    }

    saveData(data);

    // 先关闭克制弹窗
    closeResistModal();

    // 清空备注
    document.getElementById('resistNote').value = '';

    // 恢复按钮
    btn.textContent = origText;
    btn.style.opacity = '';
    btn.disabled = false;

    // 更新UI（带进度条高亮动画）
    renderAll();
    highlightWishProgress();

    // 延迟显示庆祝弹窗，确保克制弹窗完全关闭后再弹出
    setTimeout(() => {
      showCelebration('resist', amount);
      // 检查成就
      checkAndUnlockBadges();
    }, 400);
  }, 350);
}

// ===== 心愿管理弹窗 =====
let _editingWishId = null; // null=新建模式, 非null=编辑模式

function openWishModal(editWishId) {
  _editingWishId = editWishId || null;
  const titleEl = document.querySelector('#wishModal .modal-title');

  if (_editingWishId) {
    // 编辑模式：填充现有数据
    const w = data.wishes.find(w => w.id === _editingWishId);
    if (w) {
      document.getElementById('wishName').value = w.name;
      document.getElementById('wishTarget').value = w.target;
      document.getElementById('wishImage').value = w.image || '';
      if (titleEl) titleEl.textContent = '🎁 编辑心愿礼物';
    }
  } else {
    // 新建模式：清空表单
    document.getElementById('wishName').value = '';
    document.getElementById('wishTarget').value = '699';
    document.getElementById('wishImage').value = '';
    if (titleEl) titleEl.textContent = '🎁 添加心愿礼物';
  }

  document.getElementById('wishModal').classList.add('active');
}

function closeWishModal() {
  document.getElementById('wishModal').classList.remove('active');
  _editingWishId = null;
}

function saveWish() {
  const name = document.getElementById('wishName').value.trim();
  const target = parseFloat(document.getElementById('wishTarget').value) || 0;
  const image = document.getElementById('wishImage').value.trim();

  if (!name) {
    showToast('⚠️ 请输入心愿礼物名称哦！');
    return;
  }
  if (target <= 0) {
    showToast('⚠️ 请输入有效的目标金额！');
    return;
  }

  if (_editingWishId) {
    // 编辑模式：更新现有心愿
    const w = data.wishes.find(w => w.id === _editingWishId);
    if (w) {
      w.name = name;
      w.target = target;
      w.image = image || '';
      showToast(`✅ 心愿「${name}」已更新`);
    }
  } else {
    // 新建模式：添加新的心愿
    const newWish = {
      id: 'wish_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name,
      target,
      image: image || '',
      saved: 0,
    };
    data.wishes.push(newWish);
    // 自动选中新添加的心愿作为存钱目标
    data.activeWishId = newWish.id;
    showToast(`✅ 已添加心愿「${name}」`);
  }

  saveData(data);
  closeWishModal();
  renderWishCard();
  renderGoalWish();
  renderMinePage();

  // 清空表单
  document.getElementById('wishName').value = '';
  document.getElementById('wishTarget').value = '699';
  document.getElementById('wishImage').value = '';
}

// ===== 饥饿感打卡 =====
function doCheckin() {
  const today = getToday();

  if (data.checkins.includes(today)) {
    // 今天已经打过卡了
    showCelebration('checkin', 0, true); // 已打卡提示
    return;
  }

  // 记录打卡
  data.checkins.push(today);
  data.lastCheckinDate = today;
  data.currentStreak++;

  // 打卡记录
  const record = {
    type: 'checkin',
    name: '🌙 饥饿感入睡打卡',
    amount: 0,
    note: `第 ${data.currentStreak} 天连续打卡`,
    timestamp: Date.now(),
  };
  data.history.push(record);

  // 检查是否达到3天的倍数 → 发放奖励
  const shouldBonus = data.currentStreak > 0 && data.currentStreak % 3 === 0;

    if (shouldBonus) {
      const BONUS_AMOUNT = 30;
      data.bonusEarned += BONUS_AMOUNT;
      data.totalSaved += BONUS_AMOUNT;
      const activeWish = getActiveWish();
      if (activeWish) {
        activeWish.saved += BONUS_AMOUNT;
      }

    // 奖励记录
    const bonusRecord = {
      type: 'bonus',
      name: `🎁 连续${data.currentStreak}天打卡奖励`,
      amount: BONUS_AMOUNT,
      note: '每3天打卡自动存入心愿金',
      timestamp: Date.now(),
    };
    data.history.push(bonusRecord);

    saveData(data);
    // 延迟显示奖励庆祝弹窗
    setTimeout(() => {
      showCelebration('bonus', BONUS_AMOUNT);
    }, 100);
  } else {
    saveData(data);
    showCelebration('checkin', 0);
  }

  updateCheckinButtonState();
  renderAll();

  // 检查成就
  checkAndUnlockBadges();
}

// ===== 庆祝弹窗 & 粒子光效 =====
let particleAnimationId = null;

function showCelebration(type, amount, alreadyChecked = false) {
  // 确保先关闭可能存在的庆祝弹窗
  closeCelebration();

  const overlay = document.getElementById('celebrationOverlay');
  const content = document.getElementById('celebrationContent');

  // 获取随机鼓励文案
  let msg;
  if (alreadyChecked) {
    msg = { icon: '✅', title: '今天已经打过卡啦！', text: '你今天的自律已经记录在案了。早点休息，明天的胜利在等你！' };
  } else {
    msg = pickRandom(type);
  }

  document.getElementById('celebrationIcon').textContent = msg.icon;
  document.getElementById('celebrationTitle').textContent = msg.title;
  document.getElementById('celebrationText').textContent = msg.text;

  const amountEl = document.getElementById('celebrationAmount');
  if (amount > 0) {
    amountEl.textContent = `+¥${formatAmount(amount)}`;
    amountEl.style.display = 'block';
  } else {
    amountEl.style.display = 'none';
  }

  // 使用 requestAnimationFrame 确保 DOM 已更新
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    // 启动粒子效果
    startParticles(type);
  });
}

function closeCelebration() {
  const overlay = document.getElementById('celebrationOverlay');
  overlay.classList.remove('active');
  stopParticles();
}

// ===== Canvas 粒子系统 =====
function startParticles(type) {
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');

  // 设置canvas尺寸
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();

  // 粒子配置
  const colors = {
    resist: ['#FF6B35', '#FFD700', '#FF4500', '#FFA500'],
    checkin: ['#3D3D3D', '#5A5A5A', '#787878', '#A0A0A0'],
    bonus: ['#00C853', '#FFD700', '#00E676', '#69F0AE'],
  };

  const palette = colors[type] || colors.resist;
  const particles = [];
  const particleCount = type === 'bonus' ? 80 : 50;

  class Particle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = canvas.width / 2;
      this.y = canvas.height / 2;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.life = 1;
      this.decay = Math.random() * 0.015 + 0.008;
      this.size = Math.random() * 5 + 2;
      this.color = palette[Math.floor(Math.random() * palette.length)];
      this.rotation = Math.random() * Math.PI * 2;
      this.rotationSpeed = (Math.random() - 0.5) * 0.15;
      // 形状类型：圆形/星形/方形/心形
      this.shape = ['circle', 'star', 'square', 'heart'][Math.floor(Math.random() * 4)];
      this.gravity = 0.03;
      this.friction = 0.99;
    }

    update() {
      this.vx *= this.friction;
      this.vy *= this.friction;
      this.vy += this.gravity;
      this.x += this.vx;
      this.y += this.vy;
      this.life -= this.decay;
      this.rotation += this.rotationSpeed;
    }

    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.globalAlpha = Math.max(0, this.life);
      ctx.fillStyle = this.color;

      const s = this.size * this.life;

      switch (this.shape) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, s, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'star':
          this.drawStar(ctx, s);
          break;
        case 'square':
          ctx.fillRect(-s / 2, -s / 2, s, s);
          break;
        case 'heart':
          this.drawHeart(ctx, s);
          break;
      }

      // 发光效果
      ctx.shadowBlur = 12;
      ctx.shadowColor = this.color;

      ctx.restore();
    }

    drawStar(ctx, r) {
      const spikes = 5;
      const outerRadius = r;
      const innerRadius = r * 0.45;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    drawHeart(ctx, size) {
      const s = size * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.3);
      ctx.bezierCurveTo(-s, -s * 0.3, -s * 0.5, -s, 0, -s * 0.3);
      ctx.bezierCurveTo(s * 0.5, -s, s, -s * 0.3, 0, s * 0.3);
      ctx.fill();
    }
  }

  // 创建粒子
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  // 光晕中心
  let glowIntensity = 1;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 中心光晕
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.4
    );
    gradient.addColorStop(0, `rgba(255, 215, 0, ${0.08 * glowIntensity})`);
    gradient.addColorStop(0.5, `rgba(255, 107, 53, ${0.04 * glowIntensity})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    glowIntensity *= 0.985;

    // 更新和绘制粒子
    particles.forEach(p => {
      p.update();
      p.draw();
      if (p.life <= 0) p.reset(); // 重生粒子保持持续效果
    });

    particleAnimationId = requestAnimationFrame(animate);
  }

  animate();
}

function stopParticles() {
  if (particleAnimationId) {
    cancelAnimationFrame(particleAnimationId);
    particleAnimationId = null;
  }
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ===== 统计面板 =====
function showStats() {
  // 计算统计数据
  const resistCount = data.history.filter(h => h.type === 'resist').length;
  const checkinCount = data.checkins.length;
  const caloriesSaved = data.history
    .filter(h => h.type === 'resist')
    .reduce((sum, h) => sum + h.amount * CALORIE_PER_YUAN, 0);

  // 计算最长连续打卡
  let bestStreak = 0;
  let tempStreak = 0;
  const sortedDates = [...data.checkins].sort();
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      tempStreak = 1;
    } else {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    bestStreak = Math.max(bestStreak, tempStreak);
  }

  document.getElementById('statTotalSaved').textContent = `¥${formatAmount(data.totalSaved)}`;
  document.getElementById('statResistCount').textContent = resistCount;
  document.getElementById('statCheckinCount').textContent = checkinCount;
  document.getElementById('statBonusEarned').textContent = `¥${formatAmount(data.bonusEarned)}`;
  document.getElementById('statCaloriesSaved').textContent = Math.round(caloriesSaved).toLocaleString();
  document.getElementById('statBestStreak').textContent = `${bestStreak}天`;

  document.getElementById('statsModal').classList.add('active');
}

function closeStatsModal() {
  document.getElementById('statsModal').classList.remove('active');
}

// ===== 清空历史 =====
function clearAllHistory() {
  if (!confirm('确定要清空所有记录吗？心愿礼物和存入金额也会重置哦！')) return;

  data = { ...DEFAULT_DATA };
  saveData(data);
  renderAll();
}

// ===== 点击遮罩关闭弹窗 =====
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      // authModal 未登录时不允许关闭
      if (overlay.id === 'authModal' && !getCurrentUser()) return;
      overlay.classList.remove('active');
      if (overlay.id === 'celebrationOverlay') stopParticles();
    }
  });
});

// ===== 键盘快捷键 =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(o => o.classList.remove('active'));
    stopParticles();
  }
});

// ============================================================
//  🎯 卡片交互系统 - 涟漪效果、点击行为、微动画
// ============================================================

// ---- 涟漪效果（按钮点击）----
function createRipple(event, element) {
  const ripple = document.createElement('span');
  ripple.classList.add('ripple');

  const rect = element.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  element.appendChild(ripple);

  // 动画结束后移除
  ripple.addEventListener('animationend', () => ripple.remove());
}

// ---- 空状态点击（事件委托，因为 wishEmpty 是动态渲染的）----
document.addEventListener('click', (e) => {
  if (e.target.closest('#wishEmpty') || e.target.closest('.wish-empty-state')) {
    openWishModal();
  }
});

// ---- 历史记录条目点击 → 显示详情（事件委托）----
document.addEventListener('click', (e) => {
  const item = e.target.closest('.history-item');
  if (!item) return;

  const index = parseInt(item.dataset.index);
  if (isNaN(index)) return;

  const record = data.history[index];
  if (!record) return;

  const date = new Date(record.timestamp);
  const dateStr = `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日 ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;

  let detailMsg = `📋 ${record.name}\n💰 +¥${record.amount}`;
  if (record.note) detailMsg += `\n📝 ${record.note}`;
  detailMsg += `\n🕐 ${dateStr}`;

  showToast(detailMsg);
});

// ---- Toast 提示组件 ----
let toastTimer = null;
function showToast(message, duration = 2200) {
  // 移除已有的toast
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  document.body.appendChild(toast);

  // 触发动画
  requestAnimationFrame(() => toast.classList.add('show'));

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// 注入 Toast 样式
const toastStyle = document.createElement('style');
toastStyle.textContent = `
.toast-notification {
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: rgba(26, 26, 30, 0.9);
  color: #fff;
  padding: 12px 24px;
  border-radius: 14px;
  font-size: 0.85rem;
  line-height: 1.6;
  max-width: 320px;
  text-align: center;
  z-index: 9999;
  opacity: 0;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  backdrop-filter: blur(10px);
  white-space: pre-line;
  pointer-events: none;
  font-family: 'Noto Sans SC', sans-serif;
}
.toast-notification.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
@media (min-width: 769px) {
  .toast-notification { bottom: 32px; }
}`;
document.head.appendChild(toastStyle);

// ---- 入场动画：卡片依次淡入 ----
function playEntranceAnimation() {
  const cards = document.querySelectorAll('.card');
  cards.forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    setTimeout(() => {
      card.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 80 * i);
  });
}

// ============================================================
//  📅 打卡日历系统
// ============================================================

function openCalendarModal() {
  const now = new Date();
  calViewYear = now.getFullYear();
  calViewMonth = now.getMonth(); // 0-11
  renderCalendar();
  document.getElementById('calendarModal').classList.add('active');
}

function closeCalendarModal() {
  document.getElementById('calendarModal').classList.remove('active');
}

function changeCalMonth(delta) {
  calViewMonth += delta;
  if (calViewMonth < 0) {
    calViewMonth = 11;
    calViewYear--;
  } else if (calViewMonth > 11) {
    calViewMonth = 0;
    calViewYear++;
  }
  renderCalendar();
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const monthLabel = document.getElementById('calMonthYear');

  // 设置月份标题
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  monthLabel.textContent = `${calViewYear}年 ${monthNames[calViewMonth]}`;

  // 获取当月信息
  const firstDay = new Date(calViewYear, calViewMonth, 1).getDay(); // 0=周日
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const todayStr = getToday();
  const todayParts = todayStr.split('-');
  const todayDay = parseInt(todayParts[2]);
  const todayMonth = parseInt(todayParts[1]) - 1;
  const todayYear = parseInt(todayParts[0]);

  // 上个月的天数（用于显示灰色日期）
  const prevMonthDays = new Date(calViewYear, calViewMonth, 0).getDate();

  let html = '';
  let checkedCountThisMonth = 0;
  let bonusCountThisMonth = 0;

  // 填充上个月的尾部日期
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    html += `<div class="cal-day other-month">${day}</div>`;
  }

  // 当月的每一天
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calViewYear}-${String(calViewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isChecked = data.checkins.includes(dateStr);
    const isToday = (day === todayDay && calViewMonth === todayMonth && calViewYear === todayYear);

    if (isChecked) checkedCountThisMonth++;

    // 判断是否是奖励日（每第3天）
    let classes = 'cal-day';
    if (isToday) classes += ' today';
    if (isChecked) {
      classes += ' checked';
      // 计算这是第几个打卡日，判断是否为3的倍数
      const checkinIndex = data.checkins.indexOf(dateStr);
      if (checkinIndex !== -1 && (checkinIndex + 1) % 3 === 0) {
        classes += ' bonus-day';
        bonusCountThisMonth++;
      }
    }

    html += `<div class="${classes}" title="${dateStr}${isChecked ? ' ✓ 已打卡' : ''}">${day}</div>`;
  }

  // 填充下个月的头部日期
  const totalCells = firstDay + daysInMonth;
  const remaining = totalCells <= 35 ? 35 - totalCells : 42 - totalCells;
  for (let i = 1; i <= remaining; i++) {
    html += `<div class="cal-day other-month">${i}</div>`;
  }

  grid.innerHTML = html;

  // 更新统计摘要
  document.getElementById('calTotalDays').textContent = checkedCountThisMonth;
  document.getElementById('calBonusThisMonth').textContent = `¥${bonusCountThisMonth * 30}`;

  // 当前连续天数
  document.getElementById('calCurrentStreak2').textContent = `${data.currentStreak}天`;
}

// ---- 心愿进度条高亮动画 ----
function highlightWishProgress() {
  const fill = document.querySelector('.wish-progress-fill');
  if (!fill) return;

  fill.classList.remove('progress-highlight');
  void fill.offsetWidth; // 触发重排
  fill.classList.add('progress-highlight');

  setTimeout(() => fill.classList.remove('progress-highlight'), 1200);
}

// 注入进度条高亮样式
const progressHighlightStyle = document.createElement('style');
progressHighlightStyle.textContent = `
.wish-progress-fill.progress-highlight {
  box-shadow: 0 0 16px rgba(245, 166, 35, 0.5), 0 0 32px rgba(255, 107, 53, 0.25);
  filter: brightness(1.15);
  transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.4s ease, filter 0.4s ease;
}
@keyframes progressPulse {
  0% { transform: scaleX(1); }
  50% { transform: scaleX(1.008); }
  100% { transform: scaleX(1); }
}
.wish-progress-fill.progress-highlight {
  animation: progressPulse 0.6s ease 2;
}
`;
document.head.appendChild(progressHighlightStyle);

// ============================================================
//  🏆 成就徽章系统
// ============================================================

let badgeParticleAnimationId = null;

// 检查并解锁新成就（在关键操作后调用）
function checkAndUnlockBadges() {
  const newUnlocks = [];

  ACHIEVEMENTS.forEach(badge => {
    if (data.unlockedBadges.includes(badge.id)) return; // 已解锁
    if (badge.condition(data)) {
      data.unlockedBadges.push(badge.id);
      newUnlocks.push(badge);
    }
  });

  if (newUnlocks.length > 0) {
    saveData(data);
    renderBadgeCard();

    // 依次展示每个新解锁的成就（只弹第一个，其余静默）
    if (newUnlocks.length >= 1) {
      showBadgeCelebration(newUnlocks[0]);
    }
  }
}

// 渲染首页成就卡片（显示前4个徽章）
function renderBadgeCard() {
  const grid = document.getElementById('badgeGrid');
  const countEl = document.getElementById('badgeCount');

  countEl.textContent = `${data.unlockedBadges.length}/${ACHIEVEMENTS.length}`;

  // 取前4个成就显示在首页卡片中
  const displayBadges = ACHIEVEMENTS.slice(0, 4);
  grid.innerHTML = displayBadges.map(badge => {
    const unlocked = data.unlockedBadges.includes(badge.id);
    const progress = badge.progress ? badge.progress(data) : (unlocked ? 1 : 0);
    const level = getBadgeLevel(progress);
    // 等级 class: lvl-0(灰) / lvl-1(暗) / lvl-2(亮) / lvl-3(金光/解锁)
    return `
    <div class="badge-item lvl-${level}" title="${badge.name}: ${badge.desc}${!unlocked ? ' (' + Math.round(progress * 100) + '%)' : ''}">
      <span class="badge-icon">${badge.icon}</span>
      <span class="badge-name">${badge.name}</span>
    </div>`;
  }).join('');
}

// 打开成就殿堂弹窗
function openBadgeModal() {
  const list = document.getElementById('badgeList');

  list.innerHTML = ACHIEVEMENTS.map(badge => {
    const unlocked = data.unlockedBadges.includes(badge.id);
    const progress = badge.progress ? badge.progress(data) : (unlocked ? 1 : 0);
    const level = getBadgeLevel(progress);
    const pct = Math.round(progress * 100);
    return `
      <div class="badge-detail-item lvl-${level}">
        <div class="badge-detail-icon">${badge.icon}</div>
        <div class="badge-detail-info">
          <div class="badge-detail-name">${badge.name} ${unlocked ? '<span class="badge-unlocked-tag">✓ 已解锁</span>' : '<span class="badge-progress-tag">' + pct + '%</span>'}</div>
          <div class="badge-detail-desc">${badge.desc}</div>
          ${!unlocked ? `<div class="badge-progress-bar"><div class="badge-progress-fill" style="width:${pct}%"></div></div>` : ''}
        </div>
      </div>`;
  }).join('');

  document.getElementById('badgeModal').classList.add('active');
}

function closeBadgeModal() {
  document.getElementById('badgeModal').classList.remove('active');
}

// 成就解锁庆祝弹窗 + 金色粒子特效
function showBadgeCelebration(badge) {
  const overlay = document.getElementById('badgeCelebrationOverlay');
  document.getElementById('badgeUnlockIcon').textContent = badge.icon;
  document.getElementById('badgeUnlockTitle').textContent = '🎉 成就解锁！';
  document.getElementById('badgeUnlockName').textContent = badge.name;
  document.getElementById('badgeUnlockDesc').textContent = badge.desc;

  overlay.classList.add('active');
  startBadgeParticles();
}

function closeBadgeCelebration() {
  const overlay = document.getElementById('badgeCelebrationOverlay');
  overlay.classList.remove('active');
  stopBadgeParticles();
}

// 成就解锁金色粒子效果
function startBadgeParticles() {
  const canvas = document.getElementById('badgeParticleCanvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();

  const palette = ['#FFD700', '#FFA500', '#FF6B35', '#F5A623', '#FFF8DC', '#FFE066'];
  const particles = [];
  const particleCount = 70;

  class BadgeParticle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = canvas.width / 2;
      this.y = canvas.height / 2;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 7 + 3;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed - 2;
      this.life = 1;
      this.decay = Math.random() * 0.012 + 0.006;
      this.size = Math.random() * 6 + 3;
      this.color = palette[Math.floor(Math.random() * palette.length)];
      this.rotation = Math.random() * Math.PI * 2;
      this.rotationSpeed = (Math.random() - 0.5) * 0.2;
      this.shape = ['circle', 'star', 'heart'][Math.floor(Math.random() * 3)];
      this.gravity = 0.04;
      this.friction = 0.985;
    }
    update() {
      this.vx *= this.friction;
      this.vy *= this.friction;
      this.vy += this.gravity;
      this.x += this.vx;
      this.y += this.vy;
      this.life -= this.decay;
      this.rotation += this.rotationSpeed;
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.globalAlpha = Math.max(0, this.life);
      ctx.fillStyle = this.color;
      const s = this.size * this.life;
      switch (this.shape) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, s, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'star':
          this.drawStar(ctx, s);
          break;
        case 'heart':
          this.drawHeart(ctx, s);
          break;
      }
      ctx.shadowBlur = 16;
      ctx.shadowColor = this.color;
      ctx.restore();
    }
    drawStar(ctx, r) {
      const spikes = 5;
      const outerRadius = r;
      const innerRadius = r * 0.45;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    drawHeart(ctx, size) {
      const s = size * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.3);
      ctx.bezierCurveTo(-s, -s * 0.3, -s * 0.5, -s, 0, -s * 0.3);
      ctx.bezierCurveTo(s * 0.5, -s, s, -s * 0.3, 0, s * 0.3);
      ctx.fill();
    }
  }

  for (let i = 0; i < particleCount; i++) {
    particles.push(new BadgeParticle());
  }

  let glowIntensity = 1;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 金色光晕中心
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.4
    );
    gradient.addColorStop(0, `rgba(255, 215, 0, ${0.12 * glowIntensity})`);
    gradient.addColorStop(0.5, `rgba(255, 165, 0, ${0.06 * glowIntensity})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    glowIntensity *= 0.986;

    particles.forEach(p => {
      p.update();
      p.draw();
      if (p.life <= 0) p.reset();
    });

    badgeParticleAnimationId = requestAnimationFrame(animate);
  }

  animate();
}

function stopBadgeParticles() {
  if (badgeParticleAnimationId) {
    cancelAnimationFrame(badgeParticleAnimationId);
    badgeParticleAnimationId = null;
  }
  const canvas = document.getElementById('badgeParticleCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ============================================================
//  📑 Tab 页面切换系统
// ============================================================

let currentTab = 'home';
let currentRecordFilter = 'all';

function initTabSwitch() {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;

  nav.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      switchTab(tab);
    });
  });

  // 记录页筛选标签
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentRecordFilter = tab.dataset.filter;
      renderRecordPage();
    });
  });
}

function switchTab(tab) {
  if (tab === currentTab) return;
  currentTab = tab;

  // 更新导航栏选中态
  document.querySelectorAll('#bottomNav .nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });

  // 切换页面显示
  document.querySelectorAll('.tab-page').forEach(page => {
    page.classList.remove('active');
  });
  const targetPage = document.querySelector(`.tab-${tab}`);
  if (targetPage) {
    targetPage.classList.add('active');
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 切换时刷新对应页面数据
  if (tab === 'goal') renderGoalPage();
  if (tab === 'history') renderRecordPage();
  if (tab === 'mine') renderMinePage();
}

// ============================================================
//  🎯 目标页渲染
// ============================================================

function renderGoalPage() {
  const resistItems = data.history.filter(h => h.type === 'resist');
  const totalCalories = resistItems.reduce((sum, h) => sum + h.amount * CALORIE_PER_YUAN, 0);
  const kgLost = (totalCalories / 7700).toFixed(1);

  document.getElementById('goalTotalCalories').textContent = Math.round(totalCalories).toLocaleString();
  document.getElementById('goalKgLost').textContent = kgLost;
  document.getElementById('goalResistCount').textContent = resistItems.length;

  // 本周/本月统计
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let weekCalories = 0, monthCalories = 0;
  resistItems.forEach(item => {
    const d = new Date(item.timestamp);
    if (d >= weekStart) weekCalories += item.amount * CALORIE_PER_YUAN;
    if (d >= monthStart) monthCalories += item.amount * CALORIE_PER_YUAN;
  });

  document.getElementById('goalWeekCalories').textContent = Math.round(weekCalories).toLocaleString();
  document.getElementById('goalMonthCalories').textContent = Math.round(monthCalories).toLocaleString();
  document.getElementById('goalKgEq').textContent = kgLost + 'kg';

  // 心愿详情
  renderGoalWish();

  // 食物TOP排行
  renderFoodRank();
}

function renderGoalWish() {
  const container = document.getElementById('goalWishDisplay');
  if (!data.wishes || data.wishes.length === 0) {
    container.innerHTML = `
      <div class="wish-empty-state">
        <div class="empty-icon">🎯</div>
        <p>还没有心愿礼物<br><small>点击编辑添加一个吧</small></p>
      </div>`;
    return;
  }

  // 展示所有心愿
  let html = '<div class="goal-wish-list">';
  data.wishes.forEach(w => {
    const percent = w.target > 0 ? Math.min((w.saved / w.target) * 100, 100) : 0;
    const isActive = data.activeWishId ? w.id === data.activeWishId : w === data.wishes[0];

    html += `
      <div class="wish-preview${isActive ? ' wish-selected' : ''}" onclick="selectWish('${w.id}')" style="cursor:pointer;">
        <div class="wish-img" style="width:64px;height:64px;font-size:2rem;">${w.image ? `<img src="${w.image}" alt="${w.name}" style="width:64px;height:64px;border-radius:12px;object-fit:cover;" onerror="this.parentElement.textContent='🎁'">` : '🎁'}</div>
        <div class="wish-info">
          <div class="wish-name" style="font-size:1rem;">${w.name} ${isActive ? '⭐' : ''}</div>
          <div class="wish-bar-wrap" style="height:10px;border-radius:5px;background:#f0ece6;"><div class="wish-bar-fill" style="width:${percent}%;border-radius:5px;background:linear-gradient(90deg,#F5A623,#FFD700);"></div></div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;">
            <span style="font-size:0.78rem;color:var(--text-secondary);">已存 ¥${formatAmount(w.saved)}</span>
            <span style="font-size:0.78rem;font-weight:700;color:var(--gold);">目标 ¥${formatAmount(w.target)}</span>
          </div>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderFoodRank() {
  const container = document.getElementById('foodRankList');
  const resistItems = data.history.filter(h => h.type === 'resist');

  if (resistItems.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:0.85rem;">暂无克制记录</div>';
    return;
  }

  // 按食物名称聚合
  const foodMap = {};
  resistItems.forEach(item => {
    // 从名称中提取食物名（去掉前缀）
    let name = item.name.replace(/^忍住没买「|」$/g, '');
    if (!foodMap[name]) {
      foodMap[name] = { name, count: 0, totalAmount: 0, totalCalories: 0 };
    }
    foodMap[name].count++;
    foodMap[name].totalAmount += item.amount;
    foodMap[name].totalCalories += item.amount * CALORIE_PER_YUAN;
  });

  // 按总金额排序，取TOP3
  const ranked = Object.values(foodMap).sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 3);

  const rankClasses = ['n1', 'n2', 'n3'];
  container.innerHTML = ranked.map((item, i) => `
    <div class="food-rank-item">
      <span class="food-rank-num ${rankClasses[i]}">${i + 1}</span>
      <span class="food-rank-name">${item.name}</span>
      <span class="food-rank-kcal">${Math.round(item.totalCalories).toLocaleString()} kcal</span>
      <span class="food-rank-count">${item.count} 次</span>
    </div>`).join('');
}

// ============================================================
//  📝 记录页渲染
// ============================================================

function renderRecordPage() {
  const container = document.getElementById('recordPageList');

  if (data.history.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:0.85rem;">🌟 还没有记录，开始你的第一次克制吧！</div>';
    updateMonthSummary();
    return;
  }

  // 筛选
  let filtered = data.history;
  if (currentRecordFilter !== 'all') {
    filtered = data.history.filter(h => h.type === currentRecordFilter);
  }

  // 最新的在前
  const sorted = [...filtered].reverse();

  // 按日期分组
  const groups = {};
  sorted.forEach(item => {
    const dateKey = formatDateKey(item.timestamp);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(item);
  });

  let html = '';
  Object.keys(groups).forEach(dateKey => {
    html += `<div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);padding:12px 4px 6px;">${dateKey}</div>`;
    html += '<div class="card" style="padding:4px 12px;">';

    groups[dateKey].forEach(item => {
      let iconClass = item.type;
      let icon = '📝';
      let moneyColor = '';
      let moneyText = `¥${formatAmount(item.amount)}`;

      if (item.type === 'resist') {
        icon = '🛑'; iconClass = 'resist'; moneyColor = '';
      } else if (item.type === 'checkin') {
        icon = '🌙'; iconClass = 'checkin'; moneyColor = 'var(--purple)'; moneyText = '✓';
      } else if (item.type === 'bonus') {
        icon = '🎁'; iconClass = 'bonus'; moneyColor = 'var(--green)'; moneyText = `+¥${formatAmount(item.amount)}`;
      }

      const calories = item.type === 'resist' ? Math.round(item.amount * CALORIE_PER_YUAN) : 0;
      const detailText = item.type === 'resist'
        ? `少摄入 <span>${calories.toLocaleString()} kcal</span> ${item.note ? '· ' + item.note : ''}`
        : (item.note || '');

      html += `
        <div class="record-item">
          <div class="record-icon ${iconClass}">${icon}</div>
          <div class="record-body">
            <div class="record-name">${item.name}</div>
            <div class="record-detail">${detailText}</div>
          </div>
          <div class="record-right">
            <div class="record-money" style="${moneyColor ? 'color:' + moneyColor : ''}">${moneyText}</div>
            <div class="record-time">${formatTime(item.timestamp)}</div>
          </div>
        </div>`;
    });

    html += '</div>';
  });

  container.innerHTML = html;
  updateMonthSummary();
}

function formatDateKey(timestamp) {
  const d = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dStr = `${d.getMonth()+1}月${d.getDate()}日`;
  if (d.toDateString() === today.toDateString()) return `今天 · ${dStr}`;
  if (d.toDateString() === yesterday.toDateString()) return `昨天 · ${dStr}`;
  return dStr;
}

function updateMonthSummary() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let monthResist = 0, monthCalories = 0, monthSaved = 0, monthCheckins = 0;

  data.history.forEach(item => {
    const d = new Date(item.timestamp);
    if (d >= monthStart) {
      if (item.type === 'resist') { monthResist++; monthCalories += item.amount * CALORIE_PER_YUAN; monthSaved += item.amount; }
      if (item.type === 'bonus') monthSaved += item.amount;
    }
  });

  data.checkins.forEach(dateStr => {
    const d = new Date(dateStr);
    if (d >= monthStart && d <= now) monthCheckins++;
  });

  document.getElementById('msResistCount').textContent = monthResist;
  document.getElementById('msCalories').textContent = Math.round(monthCalories).toLocaleString();
  document.getElementById('msSaved').textContent = '¥' + formatAmount(monthSaved);
  document.getElementById('msCheckins').textContent = monthCheckins;
}

// ============================================================
//  👤 我的页面渲染
// ============================================================

function renderMinePage() {
  const resistItems = data.history.filter(h => h.type === 'resist');
  const totalCalories = resistItems.reduce((sum, h) => sum + h.amount * CALORIE_PER_YUAN, 0);
  const kgLost = (totalCalories / 7700).toFixed(1);

  // 计算坚持天数（从第一条记录或打卡开始）
  let daysActive = 0;
  if (data.history.length > 0 || data.checkins.length > 0) {
    const allDates = [...data.history.map(h => new Date(h.timestamp)), ...data.checkins.map(d => new Date(d))];
    allDates.sort((a, b) => a - b);
    const firstDate = allDates[0];
    daysActive = Math.max(1, Math.ceil((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
  }

  // 个人信息
  const user = getCurrentUser();
  const profileAvatar = document.querySelector('.profile-avatar');
  if (profileAvatar && user) {
    profileAvatar.textContent = user.avatar || '🐷';
  }

  document.getElementById('profileDays').textContent = `已坚持 ${daysActive} 天 · 加入于 ${formatJoinDate(daysActive)}`;

  // 数据概览
  document.getElementById('mineTotalSaved').textContent = '¥' + formatAmount(data.totalSaved);
  document.getElementById('mineCalories').textContent = Math.round(totalCalories).toLocaleString();
  document.getElementById('mineKg').textContent = kgLost + 'kg';

  // 成就徽章
  document.getElementById('mineBadgeCount').textContent = `${data.unlockedBadges.length}/${ACHIEVEMENTS.length} 已解锁`;
  const mineBadgeGrid = document.getElementById('mineBadgeGrid');
  mineBadgeGrid.innerHTML = ACHIEVEMENTS.map(badge => {
    const unlocked = data.unlockedBadges.includes(badge.id);
    return `
      <div class="badge-item ${unlocked ? 'unlocked' : 'locked'}">
        <span class="badge-icon">${badge.icon}</span>
        <span class="badge-name">${badge.name}</span>
      </div>`;
  }).join('');

  // 设置-心愿描述
  const wishDescEl = document.getElementById('settingWishDesc');
  if (data.wishes && data.wishes.length > 0) {
    const activeWish = getActiveWish();
    if (activeWish) {
      const percent = activeWish.target > 0 ? Math.min((activeWish.saved / activeWish.target) * 100, 100) : 0;
      wishDescEl.textContent = `${activeWish.name} · 已存 ${percent.toFixed(0)}%${data.wishes.length > 1 ? ` (共${data.wishes.length}个心愿)` : ''}`;
    } else {
      wishDescEl.textContent = `共 ${data.wishes.length} 个心愿`;
    }
  } else {
    wishDescEl.textContent = '尚未设置心愿';
  }
}

const now = new Date();
function formatJoinDate(daysActive) {
  if (daysActive <= 0) return '今天';
  const d = new Date(now.getTime() - daysActive * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}


