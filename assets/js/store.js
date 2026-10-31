/* 鸡蛋站 · 数据与登录状态
 * 纯静态部署（GitHub Pages）方案：
 *   - 博文 / 资源保存在仓库的 assets/data/*.json，所有访客都能看到同一份内容；
 *   - 站长可配置 GitHub Personal Access Token（仅保存在站长浏览器 localStorage），
 *     发布时通过 GitHub Contents API 直接把数据提交到仓库，无需后端；
 *   - 未配置 Token 时，发布仅写入当前浏览器 localStorage（本地预览，他人看不到）；
 *   - 内置账号来自 assets/js/users.js（window.EGG_USERS），密码用 SHA-256(SALT+明文) 哈希。
 * 由于所有逻辑都在前端，这只是演示级别的鉴权，不能当作生产级安全方案。
 */
(function () {
  "use strict";

  /* ---------- 常量 ---------- */
  const POSTS_KEY = "eggstation.posts.v1";
  const RESOURCES_KEY = "eggstation.resources.v1";
  const SESSION_KEY = "eggstation.session.v1";
  const PROFILE_KEY = "eggstation.profile.v1";
  const USERS_KEY = "eggstation.users.v1";
  const DELETIONS_KEY = "eggstation.deletions.v1";
  const TOKEN_KEY = "eggstation.github_token.v1";
  const KEY_SESSION_KEY = "eggstation.key.v1"; // 登录后派生的 AES 密钥（仅本次会话）

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // GitHub Contents API 单文件上限 100MB

  // GitHub 仓库配置：数据文件提交到这里
  const REPO_OWNER = "egg-devlop";
  const REPO_NAME = "egg-devlop.github.io";
  const REPO_BRANCH = "main";
  const POSTS_PATH = "assets/data/posts.json";
  const RESOURCES_PATH = "assets/data/resources.json";
  const USERS_PATH = "assets/data/users.json";
  const SYNC_PATH = "assets/data/sync.json"; // 同步口令加密后的 Token
  const RESOURCES_DIR = "assets/resources";
  const POST_IMAGES_DIR = "assets/uploads/posts";
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 单张配图上限 10MB

  const POST_STYLES = {
    前端开发: { accent: "#5a8fa9", soft: "#e5eff3" },
    设计灵感: { accent: "#9b79b5", soft: "#f3eaf8" },
    生活方式: { accent: "#5f9c84", soft: "#e9f3ee" },
    随笔: { accent: "#d97854", soft: "#fbe7df" }
  };

  const POST_ARTS = ["rings", "dots", "grid", "arc", "stripes", "lines", "window", "blob"];

  const RESOURCE_ICONS = {
    开发工具: "code",
    设计素材: "pen",
    效率工具: "bolt",
    学习充电: "book"
  };

  /* ---------- 内存缓存（从仓库 JSON 加载） ---------- */
  let postsCache = null;
  let resourcesCache = null;
  let usersCache = null; // 仓库中的注册用户
  let dataReady = null; // Promise，数据加载完成后 resolve

  // 提交锁：避免并发提交导致 sha 冲突
  let commitLock = Promise.resolve();

  /* ---------- 本地存储读写 ---------- */
  function readArray(key) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function writeArray(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message:
          error && error.name === "QuotaExceededError"
            ? "浏览器本地存储空间不足，请先删除一些资源文件再上传。"
            : "保存失败，请检查浏览器是否禁用了本地存储。"
      };
    }
  }

  /* ---------- 从仓库加载 JSON 数据 ---------- */
  function fetchJSON(path) {
    // 加时间戳避免缓存旧数据
    return fetch(path + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        return Array.isArray(data) ? data : [];
      })
      .catch(function () {
        return [];
      });
  }

  function loadData() {
    if (dataReady) return dataReady;
    dataReady = Promise.all([
      fetchJSON(POSTS_PATH),
      fetchJSON(RESOURCES_PATH),
      fetchJSON(USERS_PATH)
    ]).then(function (results) {
      // 合并本地尚未同步到仓库的内容，避免刷新后被仓库数据覆盖
      postsCache = mergeLocal(results[0], readArray(POSTS_KEY));
      resourcesCache = mergeLocal(results[1], readArray(RESOURCES_KEY));
      usersCache = results[2];
      return { posts: postsCache, resources: resourcesCache, users: usersCache };
    });
    return dataReady;
  }

  // 把只存在于本地的条目（按 id 去重）并到仓库数据前面
  function mergeLocal(remote, local) {
    const remoteIds = {};
    remote.forEach(function (item) { remoteIds[item.id] = true; });
    const localOnly = local.filter(function (item) {
      return item && item.id && !remoteIds[item.id];
    });
    return localOnly.concat(remote);
  }

  /* ---------- 博文 ---------- */
  function getPosts() {
    const list = postsCache !== null ? postsCache : readArray(POSTS_KEY);
    return list.slice().sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function addPost(post) {
    // 更新内存缓存 + localStorage
    const posts = getPosts();
    posts.unshift(post);
    postsCache = posts;
    const local = writeArray(POSTS_KEY, posts);
    if (!local.ok) return Promise.resolve(local);

    if (!hasGithubToken()) {
      return Promise.resolve({
        ok: true,
        warning: "未配置 GitHub Token，仅保存在当前浏览器，其他访客看不到。请在发布面板配置 Token 后重新发布。"
      });
    }

    // 尝试提交到 GitHub（如果配置了 Token）
    return commitPosts().then(function () {
      return { ok: true };
    }).catch(function (error) {
      return {
        ok: true,
        warning: "已保存到本地，但同步到仓库失败：" + (error && error.message ? error.message : "未知错误")
      };
    });
  }

  function removePost(id) {
    const target = getPosts().find(function (post) { return post.id === id; });
    const posts = getPosts().filter(function (post) {
      return post.id !== id;
    });
    postsCache = posts;
    const local = writeArray(POSTS_KEY, posts);
    if (!local.ok) return Promise.resolve(local);

    // 先清理仓库中的配图（Data URL 是本地图片，跳过）
    const images = target && Array.isArray(target.images) ? target.images : [];
    const deleteImages = Promise.all(
      images
        .filter(function (src) {
          return typeof src === "string" && src.indexOf("data:") !== 0;
        })
        .map(deleteResourceFile)
    ).catch(function () { return null; });

    return deleteImages.then(function () {
      return commitPosts().then(function () {
        return { ok: true };
      }).catch(function (error) {
        return {
          ok: true,
          warning: "已从本地删除，但同步到仓库失败：" + (error && error.message ? error.message : "未知错误")
        };
      });
    });
  }

  /* ---------- 资源 ---------- */
  function getResources() {
    const list = resourcesCache !== null ? resourcesCache : readArray(RESOURCES_KEY);
    return list.slice().sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  // 生成安全的文件名：保留扩展名，替换非法字符
  function safeFileName(name) {
    const parts = String(name || "file").split(".");
    const ext = parts.length > 1 ? "." + parts.pop().toLowerCase() : "";
    const base = parts.join(".").replace(/[^\w\u4e00-\u9fa5-]+/g, "_").slice(0, 40) || "file";
    return base + ext;
  }

  // 把 File 对象转为 base64 字符串（不含 data: 前缀）
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () {
        reject(new Error("读取文件失败"));
      };
      reader.readAsDataURL(file);
    });
  }

  // 上传资源文件到仓库的 assets/resources/ 目录
  function uploadResourceFile(file, resourceId) {
    const fileName = safeFileName(file.name);
    const path = RESOURCES_DIR + "/" + resourceId + "-" + fileName;
    return fileToBase64(file).then(function (b64) {
      return commitFile(path, b64, "上传资源：" + file.name, true).then(function () {
        return path;
      });
    });
  }

  // 上传博文配图到仓库的 assets/uploads/posts/ 目录，返回图片路径
  function uploadPostImage(file, postId, index) {
    const fileName = safeFileName(file.name);
    const path =
      POST_IMAGES_DIR + "/" + postId + "-" + (index + 1) + "-" + fileName;
    return fileToBase64(file).then(function (b64) {
      return commitFile(path, b64, "上传博文配图：" + file.name, true).then(function () {
        return path;
      });
    });
  }

  // 上传多张配图；无 Token 时降级为 Data URL（只存在本地）
  function uploadPostImages(postId, files) {
    const list = Array.prototype.slice.call(files || []);
    if (!list.length) return Promise.resolve({ ok: true, images: [] });

    if (!hasGithubToken()) {
      return Promise.all(list.map(function (file) {
        return fileToDataURL(file);
      })).then(function (urls) {
        return { ok: true, images: urls, local: true };
      });
    }

    return Promise.all(list.map(function (file, index) {
      return uploadPostImage(file, postId, index);
    })).then(function (paths) {
      return { ok: true, images: paths };
    });
  }

  // 把 File 转为完整 Data URL（仅用于无 Token 的本地降级）
  function fileToDataURL(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        reject(new Error("读取图片失败"));
      };
      reader.readAsDataURL(file);
    });
  }

  // 从仓库删除资源文件
  function deleteResourceFile(filePath) {
    if (!filePath) return Promise.resolve();
    const token = getGithubToken();
    if (!token) return Promise.resolve();

    return getFileSha(filePath).then(function (sha) {
      if (!sha) return null; // 文件不存在，无需删除
      const url =
        "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME +
        "/contents/" + filePath;
      return fetch(url, {
        method: "DELETE",
        cache: "no-store",
        headers: {
          "Authorization": "Bearer " + token,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: "删除资源文件",
          sha: sha,
          branch: REPO_BRANCH
        })
      }).then(function (response) {
        if (!response.ok && response.status !== 404) {
          return response.json().catch(function () { return {}; }).then(function (data) {
            throw new Error(data.message || "GitHub API " + response.status);
          });
        }
        return null;
      });
    });
  }

  // 添加资源：metadata 为元数据，file 为 File 对象（可选）
  function addResource(metadata, file) {
    const resource = Object.assign({}, metadata);
    const resources = getResources();
    resources.unshift(resource);
    resourcesCache = resources;

    const saveLocal = function () {
      return writeArray(RESOURCES_KEY, resources);
    };

    // 有 Token 且有文件：上传到仓库，resources.json 只存文件路径
    if (file && hasGithubToken()) {
      return uploadResourceFile(file, resource.id).then(function (filePath) {
        resource.filePath = filePath;
        delete resource.fileData; // 不再内嵌 base64
        resourcesCache = resources; // 已含 filePath
        const local = saveLocal();
        if (!local.ok) return local;
        return commitResources().then(function () {
          return { ok: true };
        }).catch(function (error) {
          return {
            ok: true,
            warning: "文件已上传，但元数据同步失败：" + (error && error.message ? error.message : "未知错误")
          };
        });
      }).catch(function (error) {
        // 上传失败，回退到 base64 本地存储
        return fileToBase64(file).then(function (b64) {
          resource.fileData = "data:" + (file.type || "application/octet-stream") + ";base64," + b64;
          delete resource.filePath;
          resourcesCache = resources;
          const local = saveLocal();
          if (!local.ok) return local;
          return {
            ok: true,
            warning: "上传到仓库失败，已保存到本地（他人不可见）：" + (error && error.message ? error.message : "未知错误")
          };
        });
      });
    }

    // 无 Token 或无文件：仅本地存储
    const local = saveLocal();
    if (!local.ok) return Promise.resolve(local);
    return Promise.resolve({
      ok: true,
      warning: file ? "未配置 GitHub Token，资源仅保存在本地（他人不可见）。" : undefined
    });
  }

  function removeResource(id) {
    const target = getResources().find(function (r) { return r.id === id; });
    const resources = getResources().filter(function (resource) {
      return resource.id !== id;
    });
    resourcesCache = resources;
    const local = writeArray(RESOURCES_KEY, resources);
    if (!local.ok) return Promise.resolve(local);

    // 先删除仓库中的文件，再更新 resources.json
    const deleteFile = target && target.filePath ? deleteResourceFile(target.filePath) : Promise.resolve();
    return deleteFile.then(function () {
      return commitResources().then(function () {
        return { ok: true };
      }).catch(function (error) {
        return {
          ok: true,
          warning: "已从本地删除，但同步到仓库失败：" + (error && error.message ? error.message : "未知错误")
        };
      });
    }).catch(function (error) {
      // 文件删除失败不影响元数据删除
      return commitResources().then(function () {
        return {
          ok: true,
          warning: "资源文件删除失败，但已从列表移除：" + (error && error.message ? error.message : "未知错误")
        };
      }).catch(function () {
        return { ok: true };
      });
    });
  }

  /* ---------- GitHub API：提交数据到仓库 ---------- */
  // 一次性 Token（自行同步时使用，不落盘）
  let tempToken = "";

  function getGithubToken() {
    if (tempToken) return tempToken;
    try {
      return window.localStorage.getItem(TOKEN_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function setGithubToken(token) {
    try {
      if (token) {
        window.localStorage.setItem(TOKEN_KEY, String(token));
      } else {
        window.localStorage.removeItem(TOKEN_KEY);
      }
    } catch (error) {
      return Promise.resolve(false);
    }

    // 站长保存 Token 时：用登录密码加密后写入仓库用户记录，换设备登录即可自动恢复
    const session = getSession();
    if (!token || !session || session.role !== "admin") {
      return Promise.resolve(true);
    }
    return encryptToken(token).then(function (cipher) {
      if (!cipher) return true; // 无密钥（如登录过久）时只存本地
      // 给当前账号写一条覆盖记录（含密码哈希，保证仓库记录可独立用于登录）
      const current = findUser(session.username) || {};
      const record = Object.assign({}, current, {
        username: session.username,
        displayName: session.displayName || session.username,
        role: "admin",
        tokenCipher: cipher
      });
      const locals = getRegisteredUsers().filter(function (u) {
        return u.username !== session.username;
      });
      locals.push(record);
      writeArray(USERS_KEY, locals);
      if (usersCache) {
        usersCache = usersCache.filter(function (u) { return u.username !== session.username; });
        usersCache.push(record);
      }
      // 静默同步；失败不影响本地使用
      return commitUsers().catch(function () {}).then(function () { return true; });
    });
  }

  function hasGithubToken() {
    return Boolean(getGithubToken());
  }

  function base64Encode(str) {
    // 统一为 UTF-8 字节再 base64，避免中文乱码
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  // 获取仓库中文件的 sha，用于更新
  function getFileSha(path) {
    const token = getGithubToken();
    const url =
      "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME +
      "/contents/" + path + "?ref=" + REPO_BRANCH + "&t=" + Date.now();
    return fetch(url, {
      cache: "no-store",
      headers: {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "If-None-Match": ""
      }
    }).then(function (response) {
      if (response.status === 404) return null; // 文件不存在
      if (!response.ok) throw new Error("GitHub API " + response.status);
      return response.json().then(function (data) {
        return data.sha || null;
      });
    });
  }

  // content 为文本时会自动 base64；若 rawBase64 为 true，则 content 视为已编码的 base64 字符串
  function putFile(path, content, message, sha, rawBase64) {
    const token = getGithubToken();
    const url =
      "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME +
      "/contents/" + path;
    const encoded = rawBase64 ? content : base64Encode(content);
    const body = {
      message: message,
      content: encoded,
      branch: REPO_BRANCH
    };
    if (sha) body.sha = sha;

    return fetch(url, {
      method: "PUT",
      cache: "no-store",
      headers: {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  }

  function commitFile(path, content, message, rawBase64) {
    const token = getGithubToken();
    if (!token) {
      return Promise.reject(new Error("未配置 GitHub Token"));
    }

    function tryCommit(retry) {
      return getFileSha(path).then(function (sha) {
        return putFile(path, content, message, sha, rawBase64).then(function (response) {
          if (response.ok) {
            return response.json();
          }
          return response.json().catch(function () { return {}; }).then(function (data) {
            const msg = data.message || "GitHub API " + response.status;
            // sha 不匹配时，重新获取 sha 再试一次
            if (retry && /does not match|sha/i.test(msg)) {
              return tryCommit(false);
            }
            throw new Error(msg);
          });
        });
      });
    }

    return tryCommit(true);
  }

  function commitPosts() {
    if (!hasGithubToken()) return Promise.resolve();
    const content = JSON.stringify(getPosts(), null, 2);
    return commitLocked(function () {
      return commitFile(POSTS_PATH, content, "更新博文数据");
    });
  }

  function commitResources() {
    if (!hasGithubToken()) return Promise.resolve();
    const content = JSON.stringify(getResources(), null, 2);
    return commitLocked(function () {
      return commitFile(RESOURCES_PATH, content, "更新资源数据");
    });
  }

  // 串行执行提交，避免并发导致 sha 冲突
  function commitLocked(fn) {
    const run = commitLock.then(fn, fn); // 即使上一次失败也继续
    // 锁本身吞掉错误，保持链条可继续
    commitLock = run.catch(function () {});
    return run; // 调用方拿到的是可能 reject 的 promise
  }

  /* ---------- 密码哈希 ---------- */
  function sha256Hex(text) {
    if (window.crypto && window.crypto.subtle) {
      return window.crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(text))
        .then(function (buffer) {
          const bytes = new Uint8Array(buffer);
          let hex = "";
          for (let i = 0; i < bytes.length; i += 1) {
            hex += bytes[i].toString(16).padStart(2, "0");
          }
          return hex;
        });
    }
    return Promise.resolve("__unsupported__");
  }

  /* ---------- Token 加密：用登录密码派生 AES 密钥，密文才可入仓库 ---------- */
  function bytesToB64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
  }

  function b64ToBytes(b64) {
    const binary = window.atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // 登录成功后：用 密码+盐 派生 AES-GCM 密钥，只存在 sessionStorage
  function deriveSessionKey(username, password) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve();
    const salt = new TextEncoder().encode((window.EGG_USER_SALT || "") + "|token-key|" + username);
    return crypto.subtle
      .importKey("raw", new TextEncoder().encode(String(password)), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: salt, iterations: 50000, hash: "SHA-256" },
          base,
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt", "decrypt"]
        );
      })
      .then(function (key) {
        return crypto.subtle.exportKey("raw", key).then(function (raw) {
          try {
            window.sessionStorage.setItem(KEY_SESSION_KEY, bytesToB64(new Uint8Array(raw)));
          } catch (error) { /* 忽略 */ }
        });
      })
      .catch(function () { /* 不支持时静默降级 */ });
  }

  function getSessionKey() {
    if (!window.crypto || !crypto.subtle) return Promise.resolve(null);
    let b64 = "";
    try {
      b64 = window.sessionStorage.getItem(KEY_SESSION_KEY) || "";
    } catch (error) {
      return Promise.resolve(null);
    }
    if (!b64) return Promise.resolve(null);
    return crypto.subtle
      .importKey("raw", b64ToBytes(b64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
      .catch(function () { return null; });
  }

  function encryptToken(token) {
    return getSessionKey().then(function (key) {
      if (!key) return null;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle
        .encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(String(token)))
        .then(function (buf) {
          return { iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(buf)) };
        })
        .catch(function () { return null; });
    });
  }

  function decryptToken(record) {
    if (!record || !record.tokenCipher) return Promise.resolve("");
    return getSessionKey().then(function (key) {
      if (!key) return "";
      return crypto.subtle
        .decrypt(
          { name: "AES-GCM", iv: b64ToBytes(record.tokenCipher.iv) },
          key,
          b64ToBytes(record.tokenCipher.data)
        )
        .then(function (buf) {
          return new TextDecoder().decode(buf);
        })
        .catch(function () { return ""; });
    });
  }

  /* ---------- 访客自助同步：Token 以 base64 混淆存仓库，访客点击即可同步 ----------
   * 注意：这是用户明确要求的便利方案。sync.json 里的内容可被任何人还原成 Token，
   * 因此必须使用 Fine-grained Token，且只授权本仓库的 Contents 读写权限。 */
  // 站长：把当前 Token 发布到仓库，开启访客自助同步
  function publishSyncToken() {
    const token = getGithubToken();
    if (!token) {
      return Promise.resolve({ ok: false, message: "请先保存 GitHub Token，再开启自助同步。" });
    }
    return commitLocked(function () {
      return commitFile(SYNC_PATH, JSON.stringify({ v: 2, data: base64Encode(token) }, null, 2), "开启访客自助同步");
    }).then(function () {
      return { ok: true, message: "已开启：访客在发布面板点一下按钮即可自行同步账号。" };
    }).catch(function (error) {
      return { ok: false, message: "开启失败：" + (error && error.message ? error.message : "未知错误") };
    });
  }

  // 站长：关闭自助同步（删除仓库中的 sync.json）
  function revokeSyncToken() {
    const token = getGithubToken();
    if (!token) {
      return Promise.resolve({ ok: false, message: "请先保存 GitHub Token。" });
    }
    return getFileSha(SYNC_PATH).then(function (sha) {
      if (!sha) return { ok: true, message: "自助同步本来就是关闭状态。" };
      const url =
        "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME +
        "/contents/" + SYNC_PATH;
      return fetch(url, {
        method: "DELETE",
        cache: "no-store",
        headers: {
          "Authorization": "Bearer " + token,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: "关闭访客自助同步", sha: sha, branch: REPO_BRANCH })
      }).then(function (response) {
        if (!response.ok) throw new Error("GitHub API " + response.status);
        return { ok: true, message: "自助同步已关闭。" };
      }).catch(function (error) {
        return { ok: false, message: "关闭失败：" + (error && error.message ? error.message : "未知错误") };
      });
    });
  }

  // 访客：一键把本机账号同步进仓库（Token 只在内存里用一次，不落盘）
  function selfSyncAccount() {
    return fetch(SYNC_PATH + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .catch(function () { return null; })
      .then(function (record) {
        if (!record || !record.data) {
          return { ok: false, message: "站长还没有开启自助同步，请联系站长。" };
        }
        let token = "";
        try {
          const binary = window.atob(record.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          token = new TextDecoder().decode(bytes);
        } catch (error) {
          return { ok: false, message: "同步配置损坏，请联系站长重新开启。" };
        }
        tempToken = token;
        return commitUsers()
          .then(function () {
            return { ok: true, message: "同步成功！你的账号已存入仓库，任何设备都能登录了。" };
          })
          .catch(function (error) {
            return { ok: false, message: "同步失败：" + (error && error.message ? error.message : "未知错误") };
          })
          .then(function (result) {
            tempToken = "";
            return result;
          });
      });
  }

  /* ---------- 登录 / 会话 ---------- */
  function getBuiltInUsers() {
    const list = window.EGG_USERS;
    return Array.isArray(list) ? list : [];
  }

  function getRegisteredUsers() {
    return readArray(USERS_KEY);
  }

  // 仓库 users.json 中的注册用户（所有设备共享）
  function getRepoUsers() {
    return usersCache !== null ? usersCache : [];
  }

  function getAllUsers() {
    const byName = {};
    const order = [];
    // 后出现的记录覆盖同名字段（仓库/本地记录可给内置账号补充 tokenCipher 等）
    getBuiltInUsers()
      .concat(getRepoUsers())
      .concat(getRegisteredUsers())
      .forEach(function (user) {
        if (!user || !user.username) return;
        if (!byName[user.username]) {
          byName[user.username] = {};
          order.push(user.username);
        }
        byName[user.username] = Object.assign(byName[user.username], user);
      });
    return order.map(function (name) { return byName[name]; });
  }

  // 需要写入仓库的用户记录 = 本地注册 + 仓库已有 + 带 tokenCipher 的内置账号
  function getSyncableUsers() {
    const seen = {};
    const out = [];
    getRegisteredUsers()
      .concat(getRepoUsers())
      .forEach(function (user) {
        if (!user || !user.username || seen[user.username]) return;
        seen[user.username] = true;
        out.push(user);
      });
    return out;
  }

  /* ---------- 账号同步码：访客导出给站长，站长导入后统一同步 ---------- */
  function makeAccountCode(username) {
    const user = findUser(username);
    if (!user || !user.passwordHash) return "";
    const payload = {
      username: user.username,
      passwordHash: user.passwordHash,
      displayName: user.displayName || user.username,
      role: user.role === "admin" ? "admin" : "member",
      bio: user.bio || "",
      createdAt: user.createdAt || ""
    };
    try {
      return "EGGUSER." + base64Encode(JSON.stringify(payload));
    } catch (error) {
      return "";
    }
  }

  function parseAccountCode(code) {
    const text = String(code || "").trim();
    if (text.indexOf("EGGUSER.") !== 0) return null;
    try {
      const binary = window.atob(text.slice(8));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      if (!payload || !payload.username || !payload.passwordHash) return null;
      return {
        username: String(payload.username),
        passwordHash: String(payload.passwordHash),
        displayName: String(payload.displayName || payload.username),
        role: payload.role === "admin" ? "admin" : "member",
        bio: String(payload.bio || ""),
        createdAt: String(payload.createdAt || ""),
        registered: true
      };
    } catch (error) {
      return null;
    }
  }

  // 站长导入访客同步码：写入本地记录并提交到仓库
  function importAccount(code) {
    const record = parseAccountCode(code);
    if (!record) {
      return Promise.resolve({ ok: false, message: "同步码无法识别，请确认完整复制后再试。" });
    }
    const existing = findUser(record.username);
    if (existing && existing.passwordHash) {
      // 已存在：更新密码哈希以外的资料也无妨，直接视为已同步
      return Promise.resolve({ ok: true, message: "账号“" + record.username + "”已存在，无需导入。" });
    }
    const locals = getRegisteredUsers().filter(function (u) {
      return u.username !== record.username;
    });
    locals.push(record);
    writeArray(USERS_KEY, locals);
    if (usersCache) {
      usersCache = usersCache.filter(function (u) { return u.username !== record.username; });
    }
    return commitUsers().then(function () {
      return { ok: true, message: "账号“" + (record.displayName || record.username) + "”已导入并同步到仓库，对方现在可以登录了。" };
    }).catch(function (error) {
      return { ok: false, message: "已导入本机，但同步到仓库失败：" + (error && error.message ? error.message : "未知错误") };
    });
  }

  // 本地已注册但还没同步到仓库的账号
  function getUnsyncedUsers() {
    const repoNames = {};
    getRepoUsers().forEach(function (user) { repoNames[user.username] = true; });
    return getSyncableUsers().filter(function (user) {
      return !repoNames[user.username];
    });
  }

  function commitUsers() {
    if (!hasGithubToken()) {
      return Promise.reject(new Error("未配置 GitHub Token"));
    }
    const content = JSON.stringify(getSyncableUsers(), null, 2);
    return commitLocked(function () {
      return commitFile(USERS_PATH, content, "更新用户数据");
    }).then(function (result) {
      usersCache = getSyncableUsers();
      return result;
    });
  }

  function findUser(identifier) {
    const name = String(identifier || "").trim();
    if (!name) return null;
    return (
      getAllUsers().find(function (user) {
        return user.username === name;
      }) || null
    );
  }

  function register(identifier, password, displayName) {
    return loadData().catch(function () { return null; }).then(function () {
      const username = String(identifier || "").trim();
      const name = displayName ? String(displayName).trim() : username;

      if (username.length < 2) {
        return { ok: false, message: "账号至少需要 2 个字符。" };
      }
      if (!password || password.length < 6) {
        return { ok: false, message: "密码至少需要 6 位。" };
      }
      if (findUser(username)) {
        return { ok: false, message: "该账号已存在，请直接登录或换一个。" };
      }

      const salt = window.EGG_USER_SALT || "";
      return sha256Hex(salt + String(password)).then(function (hash) {
        const user = {
          username: username,
          passwordHash: hash,
          displayName: name,
          role: "member",
          bio: "",
          createdAt: new Date().toISOString().slice(0, 10),
          registered: true
        };

        const result = writeArray(USERS_KEY, getRegisteredUsers().concat(user));
        if (!result.ok) {
          return { ok: false, message: result.message || "注册失败，请稍后再试。" };
        }

        const profile = {
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          bio: user.bio,
          createdAt: user.createdAt,
          loginAt: Date.now()
        };

        try {
          window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
          window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        } catch (error) {
          return { ok: false, message: "无法保存登录状态，请检查浏览器设置。" };
        }

        // 有 Token 时把账号同步到仓库，其他设备也能登录
        if (!hasGithubToken()) {
          return {
            ok: true,
            profile: profile,
            warning: "账号已创建并登录，但目前只保存在本机。请到发布面板点「同步我的账号」，即可全设备登录。"
          };
        }
        return commitUsers().then(function () {
          return { ok: true, profile: profile };
        }).catch(function (error) {
          return {
            ok: true,
            profile: profile,
            warning: "账号已创建并登录，但同步到仓库失败：" + (error && error.message ? error.message : "未知错误")
          };
        });
      });
    });
  }

  function login(identifier, password) {
    return loadData().catch(function () { return null; }).then(function () {
      const user = findUser(identifier);
      if (!user) {
        return { ok: false, message: "该账号不存在，可以先注册一个。" };
      }
      if (!user.passwordHash) {
        return { ok: false, message: "该账号未设置密码，请联系站点管理员。" };
      }

      const salt = window.EGG_USER_SALT || "";
      return sha256Hex(salt + String(password || "")).then(function (hash) {
        if (hash !== user.passwordHash) {
          return { ok: false, message: "密码不正确，请重新输入。" };
        }

        const profile = {
          username: user.username,
          displayName: user.displayName || user.username,
          role: user.role || "member",
          bio: user.bio || "",
          createdAt: user.createdAt || "",
          loginAt: Date.now()
        };

        try {
          window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
          window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        } catch (error) {
          return { ok: false, message: "无法保存登录状态，请检查浏览器设置。" };
        }

        // 派生会话密钥，并尝试解密仓库中保存的 Token（换设备也能直接发布）
        return deriveSessionKey(user.username, password).then(function () {
          return decryptToken(user);
        }).then(function (token) {
          if (token) setGithubToken(token);
          return { ok: true, profile: profile };
        });
      });
    });
  }

  function getSession() {
    try {
      return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function getSavedProfile() {
    try {
      return JSON.parse(window.localStorage.getItem(PROFILE_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function isLoggedIn() {
    const session = getSession();
    return Boolean(session && session.username);
  }

  function logout() {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(KEY_SESSION_KEY);
      window.localStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      /* 忽略 */
    }
  }

  /* ---------- 工具 ---------- */
  function formatBytes(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return size + " B";
    if (size < 1024 * 1024) return (size / 1024).toFixed(1).replace(/\.0$/, "") + " KB";
    return (size / 1024 / 1024).toFixed(1).replace(/\.0$/, "") + " MB";
  }

  function makeId(prefix) {
    return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function postStyle(category) {
    return POST_STYLES[category] || POST_STYLES["随笔"];
  }

  function postArt(index) {
    return POST_ARTS[index % POST_ARTS.length];
  }

  function resourceIcon(category) {
    return RESOURCE_ICONS[category] || "bolt";
  }

  function logDeletion(record) {
    const list = readArray(DELETIONS_KEY);
    list.unshift(record);
    writeArray(DELETIONS_KEY, list.slice(0, 100));
  }

  window.EggStore = {
    MAX_FILE_SIZE: MAX_FILE_SIZE,
    MAX_IMAGE_SIZE: MAX_IMAGE_SIZE,
    POST_STYLES: POST_STYLES,
    loadData: loadData,
    getPosts: getPosts,
    addPost: addPost,
    removePost: removePost,
    uploadPostImages: uploadPostImages,
    getResources: getResources,
    addResource: addResource,
    removeResource: removeResource,
    login: login,
    register: register,
    commitUsers: commitUsers,
    getUnsyncedUsers: getUnsyncedUsers,
    makeAccountCode: makeAccountCode,
    importAccount: importAccount,
    setSyncPassphrase: publishSyncToken,
    publishSyncToken: publishSyncToken,
    revokeSyncToken: revokeSyncToken,
    selfSyncAccount: selfSyncAccount,
    logout: logout,
    getSession: getSession,
    getSavedProfile: getSavedProfile,
    isLoggedIn: isLoggedIn,
    formatBytes: formatBytes,
    makeId: makeId,
    postStyle: postStyle,
    postArt: postArt,
    resourceIcon: resourceIcon,
    logDeletion: logDeletion,
    getGithubToken: getGithubToken,
    setGithubToken: setGithubToken,
    hasGithubToken: hasGithubToken
  };
})();
