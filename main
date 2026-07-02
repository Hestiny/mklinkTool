const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, exec } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    title: 'MklinkTool - 符号链接管理工具',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// 检查是否具有管理员权限
function checkAdminRights() {
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// 获取所有用户和常见路径下的符号链接
function findAllLinks() {
  const links = [];
  const scannedPaths = new Set();

  // 1. 扫描桌面、文档、下载等用户目录
  const userProfile = process.env.USERPROFILE || os.homedir();
  const userDirs = [
    userProfile,
    path.join(userProfile, 'Desktop'),
    path.join(userProfile, 'Documents'),
    path.join(userProfile, 'Downloads'),
    path.join(userProfile, 'Pictures'),
    path.join(userProfile, 'Music'),
    path.join(userProfile, 'Videos'),
    process.env.APPDATA,
    process.env.LOCALAPPDATA,
    process.env.ProgramData,
    'C:\\',
    'C:\\Users',
    'D:\\',
    'D:\\Users'
  ].filter(Boolean);

  function scanDirectory(dirPath, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return;
    const key = path.resolve(dirPath).toLowerCase();
    if (scannedPaths.has(key)) return;
    scannedPaths.add(key);

    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        const stat = fs.lstatSync(fullPath);
        if (stat.isSymbolicLink()) {
          let target = '';
          let linkType = 'symbolic';
          try {
            target = fs.readlinkSync(fullPath);
          } catch (e) {
            target = '(无法读取目标)';
          }

          // 判断是目录链接还是文件链接
          const isDir = stat.isDirectory() || entry.isDirectory();

          // 尝试判断是否为 junction
          try {
            const cmd = `dir /al "${path.dirname(fullPath)}"`;
            const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            const lines = output.split('\n');
            for (const line of lines) {
              if (line.includes(entry.name)) {
                if (/JUNCTION/i.test(line)) {
                  linkType = 'junction';
                } else if (/SYMLINK/i.test(line) && /SYMLINKD/i.test(line) === false) {
                  linkType = 'file-symlink';
                } else if (/SYMLINKD/i.test(line)) {
                  linkType = 'dir-symlink';
                }
                break;
              }
            }
          } catch (e) {}

          // 检查目标是否存在
          let targetExists = true;
          try {
            fs.accessSync(target, fs.constants.F_OK);
          } catch (e) {
            targetExists = false;
          }

          links.push({
            path: fullPath,
            name: entry.name,
            target: target,
            type: linkType,
            isDirectory: isDir,
            targetExists: targetExists,
            parentDir: path.dirname(fullPath)
          });
        } else if (entry.isDirectory() && !entry.name.startsWith('.') && depth < maxDepth) {
          // 跳过一些特殊目录
          const skipDirs = ['node_modules', '.git', 'Windows', 'Program Files', 'Program Files (x86)', 
                          '$Recycle.Bin', 'System Volume Information', 'AppData'];
          if (!skipDirs.includes(entry.name)) {
            scanDirectory(fullPath, depth + 1, maxDepth);
          }
        }
      } catch (e) {
        // 跳过无法访问的项
      }
    }
  }

  for (const dir of userDirs) {
    scanDirectory(dir, 0, 2);
  }

  return links;
}

// 创建符号链接
function createLink(options) {
  const { linkPath, targetPath, linkType } = options;

  // 验证路径
  if (!targetPath || !linkPath) {
    throw new Error('链接路径和目标路径不能为空');
  }

  // 检查目标是否存在
  if (!fs.existsSync(targetPath)) {
    throw new Error('目标路径不存在: ' + targetPath);
  }

  // 检查链接路径是否已存在
  if (fs.existsSync(linkPath)) {
    throw new Error('链接路径已存在: ' + linkPath);
  }

  const targetIsDir = fs.statSync(targetPath).isDirectory();

  let cmd;
  switch (linkType) {
    case 'junction':
      if (!targetIsDir) {
        throw new Error('目录联接 (Junction) 只能用于目录');
      }
      cmd = `mklink /J "${linkPath}" "${targetPath}"`;
      break;
    case 'hardlink':
      if (targetIsDir) {
        throw new Error('硬链接 (Hardlink) 只能用于文件');
      }
      cmd = `mklink /H "${linkPath}" "${targetPath}"`;
      break;
    case 'symbolic':
    default:
      cmd = targetIsDir
        ? `mklink /D "${linkPath}" "${targetPath}"`
        : `mklink "${linkPath}" "${targetPath}"`;
      break;
  }

  try {
    execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { success: true, message: '链接创建成功' };
  } catch (e) {
    throw new Error('创建链接失败: ' + (e.stderr || e.message));
  }
}

// 删除符号链接
function deleteLink(linkPath, isDirectory) {
  if (!fs.existsSync(linkPath) && !fs.lstatSync(linkPath).isSymbolicLink()) {
    throw new Error('链接路径不存在: ' + linkPath);
  }

  try {
    if (isDirectory) {
      // 目录链接用 rmdir 删除（不会删除目标内容）
      execSync(`rmdir "${linkPath}"`, { encoding: 'utf8' });
    } else {
      // 文件链接用 del 删除
      execSync(`del /f /q "${linkPath}"`, { encoding: 'utf8' });
    }
    return { success: true, message: '链接删除成功' };
  } catch (e) {
    // 尝试用 fs 操作
    try {
      if (isDirectory) {
        fs.rmdirSync(linkPath);
      } else {
        fs.unlinkSync(linkPath);
      }
      return { success: true, message: '链接删除成功' };
    } catch (e2) {
      throw new Error('删除链接失败: ' + (e2.message));
    }
  }
}

// 修改符号链接（先删后建）
function modifyLink(options) {
  const { oldPath, newPath, newTarget, newType } = options;

  // 读取原链接信息
  const oldStat = fs.lstatSync(oldPath);
  if (!oldStat.isSymbolicLink()) {
    throw new Error('原路径不是符号链接');
  }
  const oldIsDir = oldStat.isDirectory();
  const oldTarget = fs.readlinkSync(oldPath);

  // 删除旧链接
  deleteLink(oldPath, oldIsDir);

  // 创建新链接
  try {
    createLink({
      linkPath: newPath || oldPath,
      targetPath: newTarget || oldTarget,
      linkType: newType || 'symbolic'
    });
    return { success: true, message: '链接修改成功' };
  } catch (e) {
    // 如果创建失败，尝试恢复原链接
    try {
      createLink({
        linkPath: oldPath,
        targetPath: oldTarget,
        linkType: 'symbolic'
      });
    } catch (restoreErr) {
      // 恢复失败也忽略
    }
    throw new Error('修改失败，已尝试恢复原链接: ' + e.message);
  }
}

// 选择文件夹对话框
ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// 选择文件对话框
ipcMain.handle('dialog:selectFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// 选择保存位置（链接位置）
ipcMain.handle('dialog:selectSaveDirectory', async (event, defaultPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: defaultPath
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// 检查管理员权限
ipcMain.handle('system:checkAdmin', async () => {
  return checkAdminRights();
});

// 获取所有链接
ipcMain.handle('links:list', async () => {
  try {
    return { success: true, data: findAllLinks() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 创建链接
ipcMain.handle('links:create', async (event, options) => {
  try {
    const result = createLink(options);
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 删除链接
ipcMain.handle('links:delete', async (event, linkPath, isDirectory) => {
  try {
    const result = deleteLink(linkPath, isDirectory);
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 修改链接
ipcMain.handle('links:modify', async (event, options) => {
  try {
    const result = modifyLink(options);
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 在资源管理器中打开
ipcMain.handle('shell:openInExplorer', async (event, filePath) => {
  shell.showItemInFolder(filePath);
  return { success: true };
});

// 在资源管理器中打开目标
ipcMain.handle('shell:openTarget', async (event, targetPath) => {
  if (fs.existsSync(targetPath)) {
    shell.openPath(targetPath);
    return { success: true };
  }
  return { success: false, error: '目标路径不存在' };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
