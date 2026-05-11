// ============================================================
//  🏆 肥财实验室 - 减肥 = 存钱
//  核心逻辑：克制消费存钱 → 心愿礼物 | 饥饿打卡 → 奖励金
// ============================================================

// ===== 数据模型 =====
const DEFAULT_DATA = {
  wish: null,              // 当前心愿礼物 { name, target, image, saved }
  history: [],             // 历史记录 [{ type, name, amount, note, timestamp }]
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
    condition: (d) => d.wish && d.wish.target > 0 && (d.wish.saved / d.wish.target) >= 0.5,
    progress: (d) => (d.wish && d.wish.target > 0) ? Math.min(1, d.wish.saved / d.wish.target) : 0,
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

// ===== 工具函数 =====
function loadData() {
  try {
    const raw = localStorage.getItem('fat2fortune_data');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('数据加载失败:', e);
  }
  return { ...DEFAULT_DATA };
}

function saveData(data) {
  try {
    localStorage.setItem('fat2fortune_data', JSON.stringify(data));
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

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  renderAll();
  initFoodPresets();
  checkDailyReset();
  initAllEventListeners();
  playEntranceAnimationDelayed();
});

// 统一初始化所有事件监听器
function initAllEventListeners() {
  // 给行动按钮绑定涟漪
  document.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('click', (e) => createRipple(e, btn));
  });

  // ---- 心愿卡片点击交互 ----
  document.querySelector('.wish-card')?.addEventListener('click', (e) => {
    if (e.target.closest('.btn-add-wish')) return;
    openWishModal();
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

  // ---- 累计金额点击 → 显示统计摘要 ----
  document.querySelector('.total-saved-display')?.addEventListener('click', () => {
    showStats();
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

// ===== 渲染：心愿卡片 =====
function renderWishCard() {
  const container = document.getElementById('wishDisplay');
  const emptyState = document.getElementById('wishEmpty');

  if (!data.wish) {
    container.innerHTML = `
      <div class="wish-empty-state" id="wishEmpty">
        <div class="empty-icon">🎯</div>
        <p>还没有心愿礼物<br><small>点击右上角 + 添加一个吧</small></p>
      </div>`;
    return;
  }

  const w = data.wish;
  const percent = w.target > 0 ? Math.min((w.saved / w.target) * 100, 100) : 0;
  const isComplete = percent >= 100;

  container.innerHTML = `
    <div class="wish-active fade-in">
      <div class="wish-img-wrap">
        ${w.image ? `<img src="${w.image}" alt="${w.name}" onerror="this.parentElement.innerHTML='🎁'">` : '🎁'}
      </div>
      <div class="wish-info">
        <div class="wish-name">${w.name} ${isComplete ? '🎉' : ''}</div>
        <div class="wish-progress-bar">
          <div class="wish-progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="wish-amount-row">
          <span class="wish-current">¥${formatAmount(w.saved)}</span>
          <span class="wish-target">目标 ¥${formatAmount(w.target)}</span>
          <span class="wish-percent">${percent.toFixed(1)}%</span>
        </div>
      </div>
    </div>`;
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
    ring.style.stroke = '#7C4DFF'; // 紫色-正常
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
  const chips = document.querySelectorAll('.food-chip');
  const amountInput = document.getElementById('resistAmount');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      amountInput.value = chip.dataset.price;
    });
  });
}

// ===== 克制消费弹窗 =====
function openResistModal() {
  if (!data.wish) {
    showToast('⚠️ 请先添加一个心愿礼物哦～点右上角的 + 按钮！');
    openWishModal();
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
    data.wish.saved += amount;

    saveData(data);

    // 关闭弹窗
    closeResistModal();

    // 清空备注
    document.getElementById('resistNote').value = '';

    // 恢复按钮
    btn.textContent = origText;
    btn.style.opacity = '';
    btn.disabled = false;

    // 显示庆祝弹窗
    showCelebration('resist', amount);

    // 更新UI（带进度条高亮动画）
    renderAll();
    highlightWishProgress();

    // 检查成就
    checkAndUnlockBadges();
  }, 350);
}

// ===== 心愿管理弹窗 =====
function openWishModal() {
  document.getElementById('wishModal').classList.add('active');
  // 如果已有心愿，填充编辑状态
  if (data.wish) {
    document.getElementById('wishName').value = data.wish.name;
    document.getElementById('wishTarget').value = data.wish.target;
    document.getElementById('wishImage').value = data.wish.image || '';
  }
}

function closeWishModal() {
  document.getElementById('wishModal').classList.remove('active');
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

  // 如果已有心愿，保留已有存入金额；否则新建
  const existingSaved = data.wish ? data.wish.saved : 0;

  data.wish = {
    name,
    target,
    image: image || '',
    saved: existingSaved,
  };

  saveData(data);
  closeWishModal();
  renderWishCard();

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
    if (data.wish) {
      data.wish.saved += BONUS_AMOUNT;
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
    closeCelebration(); // 先关可能打开的
    showCelebration('bonus', BONUS_AMOUNT);
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

  overlay.classList.add('active');

  // 启动粒子效果
  startParticles(type);
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
    checkin: ['#7C4DFF', '#E040FB', '#B388FF', '#EA80FC'],
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
  background: rgba(29, 22, 21, 0.92);
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
