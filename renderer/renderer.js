// 全局状态
let allLinks = [];
let systemLinks = [];
let userLinks = [];
let activeTab = 'all'; // 'all' | 'system' | 'user'
let editingLink = null; // null 表示新建，否则为编辑的链接对象
let pendingConfirm = null; // 待确认的操作

// DOM 元素
const $ = (id) => document.getElementById(id);

// 初始化
async function init() {
  // 检查管理员权限
  const isAdmin = await window.api.checkAdmin();
  if (!isAdmin) {
    $('adminBanner').classList.remove('hidden');
  }

  $('restartAdminBtn').addEventListener('click', () => {
    $('adminBanner').classList.add('hidden');
  });

  // 绑定事件
  bindEvents();

  // 加载链接列表
  loadLinks();
}

function bindEvents() {
  $('refreshBtn').addEventListener('click', loadLinks);
  $('createBtn').addEventListener('click', () => openCreateDialog());
  $('searchInput').addEventListener('input', filterLinks);

  // 页签切换
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 对话框事件
  $('closeModalBtn').addEventListener('click', closeLinkDialog);
  $('cancelDialogBtn').addEventListener('click', closeLinkDialog);
  $('confirmDialogBtn').addEventListener('click', handleConfirmDialog);

  $('selectTargetBtn').addEventListener('click', selectTarget);
  $('selectLinkDirBtn').addEventListener('click', selectLinkDir);
  $('linkNameInput').addEventListener('input', updatePreview);
  $('linkDirInput').addEventListener('input', updatePreview);
  $('targetPathInput').addEventListener('input', updatePreview);
  $('linkTypeSelect').addEventListener('change', updateLinkTypeHint);

  // 确认对话框
  $('confirmCancelBtn').addEventListener('click', closeConfirmDialog);
  $('confirmOkBtn').addEventListener('click', handleConfirmOk);

  // 点击遮罩关闭
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal) modal.classList.add('hidden');
    });
  });
}

// 加载链接列表
async function loadLinks() {
  $('loadingState').classList.remove('hidden');
  $('emptyState').classList.add('hidden');
  $('linkList').querySelectorAll('.link-card').forEach(c => c.remove());
  $('scanStatus').textContent = '扫描中...';

  const result = await window.api.listLinks();

  $('loadingState').classList.add('hidden');
  $('scanStatus').textContent = '';

  if (result.success) {
    allLinks = result.data;
    systemLinks = allLinks.filter(l => l.isSystem);
    userLinks = allLinks.filter(l => !l.isSystem);
    updateTabCounts();
    renderLinksByTab();
    $('linkCount').textContent = `共 ${allLinks.length} 个链接`;
  } else {
    showToast('加载失败: ' + result.error, 'error');
    $('emptyState').classList.remove('hidden');
  }
}

// 渲染链接列表
function renderLinks(links) {
  const list = $('linkList');
  list.querySelectorAll('.link-card').forEach(c => c.remove());

  if (links.length === 0) {
    $('emptyState').classList.remove('hidden');
    return;
  }

  $('emptyState').classList.add('hidden');

  links.forEach(link => {
    list.appendChild(createLinkCard(link));
  });
}

// 根据当前tab渲染
function renderLinksByTab() {
  let links;
  switch (activeTab) {
    case 'system':
      links = systemLinks;
      break;
    case 'user':
      links = userLinks;
      break;
    default:
      links = allLinks;
  }
  renderLinks(links);
  $('linkCount').textContent = `共 ${links.length} 个链接`;
}

// 切换页签
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  // 清空搜索框
  $('searchInput').value = '';
  renderLinksByTab();
}

// 更新页签计数
function updateTabCounts() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tab = btn.dataset.tab;
    const badge = btn.querySelector('.tab-badge');
    if (badge) {
      if (tab === 'all') {
        badge.textContent = allLinks.length;
      } else if (tab === 'system') {
        badge.textContent = systemLinks.length;
      } else if (tab === 'user') {
        badge.textContent = userLinks.length;
      }
    }
  });
}

// 创建链接卡片
function createLinkCard(link) {
  const card = document.createElement('div');
  card.className = 'link-card';

  const isDir = link.isDirectory;
  const broken = !link.targetExists;

  let icon = '📄';
  if (isDir) icon = '📁';
  if (broken) icon = '❌';

  const typeLabel = getTypeLabel(link.type);
  const statusTag = broken
    ? `<span class="tag tag-broken">目标失效</span>`
    : `<span class="tag tag-ok">正常</span>`;

  card.innerHTML = `
    <div class="link-icon ${isDir ? 'dir' : ''} ${broken ? 'broken' : ''}">${icon}</div>
    <div class="link-info">
      <div class="link-name">
        ${escapeHtml(link.name)}
        <span class="tag tag-${link.type}">${typeLabel}</span>
        ${statusTag}
      </div>
      <div class="link-path" title="${escapeHtml(link.path)}">${escapeHtml(link.path)}</div>
      <div class="link-target ${broken ? 'broken' : ''}" title="${escapeHtml(link.target)}">${escapeHtml(link.target)}</div>
    </div>
    <div class="link-actions">
      <button class="action-btn open" title="在资源管理器中打开">📂</button>
      <button class="action-btn open" title="打开目标位置" data-action="openTarget">🎯</button>
      <button class="action-btn edit" title="修改链接">✏️</button>
      <button class="action-btn delete" title="删除链接">🗑️</button>
    </div>
  `;

  // 绑定按钮事件
  const buttons = card.querySelectorAll('.action-btn');
  // 打开链接位置
  buttons[0].addEventListener('click', () => window.api.openInExplorer(link.path));
  // 打开目标位置
  buttons[1].addEventListener('click', async () => {
    const res = await window.api.openTarget(link.target);
    if (!res.success) {
      showToast(res.error, 'error');
    }
  });
  // 修改
  buttons[2].addEventListener('click', () => openEditDialog(link));
  // 删除
  buttons[3].addEventListener('click', () => confirmDelete(link));

  return card;
}

function getTypeLabel(type) {
  const labels = {
    'symbolic': '符号链接',
    'dir-symlink': '目录符号链接',
    'file-symlink': '文件符号链接',
    'junction': '目录联接',
    'hardlink': '硬链接'
  };
  return labels[type] || '符号链接';
}

// 过滤链接
function filterLinks() {
  const keyword = $('searchInput').value.toLowerCase().trim();

  let sourceLinks;
  switch (activeTab) {
    case 'system':
      sourceLinks = systemLinks;
      break;
    case 'user':
      sourceLinks = userLinks;
      break;
    default:
      sourceLinks = allLinks;
  }

  if (!keyword) {
    renderLinks(sourceLinks);
    $('linkCount').textContent = `共 ${sourceLinks.length} 个链接`;
    return;
  }
  const filtered = sourceLinks.filter(link =>
    link.name.toLowerCase().includes(keyword) ||
    link.path.toLowerCase().includes(keyword) ||
    link.target.toLowerCase().includes(keyword)
  );
  renderLinks(filtered);
  $('linkCount').textContent = `找到 ${filtered.length} 个链接 (共 ${sourceLinks.length} 个)`;
}

// 打开创建对话框
function openCreateDialog() {
  editingLink = null;
  $('modalTitle').textContent = '新建符号链接';
  $('targetPathInput').value = '';
  $('linkDirInput').value = '';
  $('linkNameInput').value = '';
  $('linkTypeSelect').value = 'symbolic';
  $('linkTypeSelect').disabled = false;
  $('targetPreviewGroup').style.display = 'none';
  updateLinkTypeHint();
  $('linkDialog').classList.remove('hidden');
}

// 打开编辑对话框
function openEditDialog(link) {
  editingLink = link;
  $('modalTitle').textContent = '修改符号链接';
  $('targetPathInput').value = link.target;
  $('linkDirInput').value = link.parentDir;
  $('linkNameInput').value = link.name;

  // 设置链接类型
  let typeValue = 'symbolic';
  if (link.type === 'junction') typeValue = 'junction';
  else if (link.type === 'hardlink') typeValue = 'hardlink';
  $('linkTypeSelect').value = typeValue;
  $('linkTypeSelect').disabled = false;

  updateLinkTypeHint();
  updatePreview();
  $('linkDialog').classList.remove('hidden');
}

// 关闭对话框
function closeLinkDialog() {
  $('linkDialog').classList.add('hidden');
  editingLink = null;
}

// 选择目标
async function selectTarget() {
  // 先尝试选择文件，失败再选目录 - 这里用目录选择更通用
  // 我们提供两个选项：通过 linkType 判断
  const currentType = $('linkTypeSelect').value;
  let result;
  if (currentType === 'junction') {
    result = await window.api.selectDirectory();
  } else if (currentType === 'hardlink') {
    result = await window.api.selectFile();
  } else {
    // symbolic - 让用户选择，优先尝试文件
    result = await window.api.selectFile();
    if (!result) {
      result = await window.api.selectDirectory();
    }
  }
  if (result) {
    $('targetPathInput').value = result;
    updatePreview();
  }
}

// 选择链接目录
async function selectLinkDir() {
  const result = await window.api.selectSaveDirectory($('linkDirInput').value || undefined);
  if (result) {
    $('linkDirInput').value = result;
    updatePreview();
  }
}

// 更新链接类型提示
function updateLinkTypeHint() {
  const type = $('linkTypeSelect').value;
  const hints = {
    'symbolic': '符号链接可指向文件或目录。创建目录符号链接需要管理员权限。',
    'junction': '目录联接 (Junction) 只能指向目录，不需要管理员权限，兼容性更好。',
    'hardlink': '硬链接只能用于文件，且目标和链接必须在同一磁盘卷上。'
  };
  $('linkTypeHint').textContent = hints[type] || '';
}

// 更新预览
function updatePreview() {
  const target = $('targetPathInput').value.trim();
  const dir = $('linkDirInput').value.trim();
  const name = $('linkNameInput').value.trim();

  if (target || dir || name) {
    $('targetPreviewGroup').style.display = 'block';
    const linkFull = dir && name ? (dir.replace(/\\$/, '') + '\\' + name) : '(请填写完整)';
    $('previewBox').innerHTML = `
      <div><strong>链接:</strong> ${escapeHtml(linkFull)}</div>
      <div><strong>目标:</strong> ${escapeHtml(target || '(未选择)')}</div>
    `;
  } else {
    $('targetPreviewGroup').style.display = 'none';
  }
}

// 确认对话框提交
async function handleConfirmDialog() {
  const targetPath = $('targetPathInput').value.trim();
  const linkDir = $('linkDirInput').value.trim();
  const linkName = $('linkNameInput').value.trim();
  const linkType = $('linkTypeSelect').value;

  // 验证
  if (!targetPath) {
    showToast('请选择或输入目标路径', 'warning');
    return;
  }
  if (!linkDir) {
    showToast('请选择链接所在目录', 'warning');
    return;
  }
  if (!linkName) {
    showToast('请输入链接名称', 'warning');
    return;
  }

  const linkPath = linkDir.replace(/\\$/, '') + '\\' + linkName;

  $('confirmDialogBtn').disabled = true;
  $('confirmDialogBtn').textContent = '处理中...';

  try {
    let result;
    if (editingLink) {
      // 修改
      result = await window.api.modifyLink({
        oldPath: editingLink.path,
        newPath: linkPath,
        newTarget: targetPath,
        newType: linkType
      });
    } else {
      // 创建
      result = await window.api.createLink({
        linkPath: linkPath,
        targetPath: targetPath,
        linkType: linkType
      });
    }

    if (result.success) {
      showToast(editingLink ? '链接修改成功' : '链接创建成功', 'success');
      closeLinkDialog();
      loadLinks();
    } else {
      showToast(result.error, 'error');
    }
  } catch (e) {
    showToast('操作失败: ' + e.message, 'error');
  } finally {
    $('confirmDialogBtn').disabled = false;
    $('confirmDialogBtn').textContent = '确定';
  }
}

// 确认删除
function confirmDelete(link) {
  pendingConfirm = { type: 'delete', link: link };
  $('confirmTitle').textContent = '删除链接';
  $('confirmMessage').innerHTML = `确定要删除以下链接吗？<br><br>
    <strong>链接:</strong> ${escapeHtml(link.path)}<br>
    <strong>目标:</strong> ${escapeHtml(link.target)}<br><br>
    <span style="color: var(--danger)">注意：仅删除链接本身，不会删除目标文件/目录。</span>`;
  $('confirmDialog').classList.remove('hidden');
}

function closeConfirmDialog() {
  $('confirmDialog').classList.add('hidden');
  pendingConfirm = null;
}

async function handleConfirmOk() {
  if (!pendingConfirm) return;

  if (pendingConfirm.type === 'delete') {
    const link = pendingConfirm.link;
    $('confirmOkBtn').disabled = true;
    $('confirmOkBtn').textContent = '删除中...';

    const result = await window.api.deleteLink(link.path, link.isDirectory);
    $('confirmOkBtn').disabled = false;
    $('confirmOkBtn').textContent = '确定';

    if (result.success) {
      showToast('链接删除成功', 'success');
      closeConfirmDialog();
      loadLinks();
    } else {
      showToast(result.error, 'error');
    }
  }
}

// Toast 提示
let toastTimer = null;
function showToast(message, type = 'info') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type;
  toast.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// HTML 转义
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 启动
init();
