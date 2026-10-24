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

  const MAX_FILE_SIZE = 2 * 1024 * 1024;

  // GitHub 仓库配置：数据文件提交到这里
  const REPO_OWNER = "egg-devlop";
  const REPO_NAME = "egg-devlop.github.io";
  const REPO_BRANCH = "main";
  const POSTS_PATH = "assets/data/posts.json";
  const RESOURCES_PATH = "assets/data/resources.json";

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
  let dataReady = null; // Promise，数据加载完成后 resolve

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
      fetchJSON(RESOURCES_PATH)
    ]).then(function (results) {
      postsCache = results[0];
      resourcesCache = results[1];
      return { posts: postsCache, resources: resourcesCache };
    });
    return dataReady;
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
    const posts = getPosts().filter(function (post) {
      return post.id !== id;
    });
    postsCache = posts;
    const local = writeArray(POSTS_KEY, posts);
    if (!local.ok) return Promise.resolve(local);

    return commitPosts().then(function () {
      return { ok: true };
    }).catch(function (error) {
      return {
        ok: true,
        warning: "已从本地删除，但同步到仓库失败：" + (error && error.message ? error.message : "未知错误")
      };
    });
  }

  /* ---------- 资源 ---------- */
  function getResources() {
    const list = resourcesCache !== null ? resourcesCache : readArray(RESOURCES_KEY);
    return list.slice().sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function addResource(resource) {
    const resources = getResources();
    resources.unshift(resource);
    resourcesCache = resources;
    const local = writeArray(RESOURCES_KEY, resources);
    if (!local.ok) return Promise.resolve(local);

    return commitResources().then(function () {
      return { ok: true };
    }).catch(function (error) {
      return {
        ok: true,
        warning: "已保存到本地，但同步到仓库失败：" + (error && error.message ? error.message : "未知错误")
      };
    });
  }

  function removeResource(id) {
    const resources = getResources().filter(function (resource) {
      return resource.id !== id;
    });
    resourcesCache = resources;
    const local = writeArray(RESOURCES_KEY, resources);
    if (!local.ok) return Promise.resolve(local);

    return commitResources().then(function () {
      return { ok: true };
    }).catch(function (error) {
      return {
        ok: true,
        warning: "已从本地删除，但同步到仓库失败：" + (error && error.message ? error.message : "未知错误")
      };
    });
  }

  /* ---------- GitHub API：提交数据到仓库 ---------- */
  function getGithubToken() {
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
      return true;
    } catch (error) {
      return false;
    }
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
      "/contents/" + path + "?ref=" + REPO_BRANCH;
    return fetch(url, {
      headers: {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json"
      }
    }).then(function (response) {
      if (response.status === 404) return null; // 文件不存在
      if (!response.ok) throw new Error("GitHub API " + response.status);
      return response.json().then(function (data) {
        return data.sha || null;
      });
    });
  }

  function commitFile(path, content, message) {
    const token = getGithubToken();
    if (!token) {
      return Promise.reject(new Error("未配置 GitHub Token"));
    }

    return getFileSha(path).then(function (sha) {
      const url =
        "https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME +
        "/contents/" + path;
      const body = {
        message: message,
        content: base64Encode(content),
        branch: REPO_BRANCH
      };
      if (sha) body.sha = sha;

      return fetch(url, {
        method: "PUT",
        headers: {
          "Authorization": "Bearer " + token,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }).then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (data) {
            throw new Error(data.message || "GitHub API " + response.status);
          });
        }
        return response.json();
      });
    });
  }

  function commitPosts() {
    if (!hasGithubToken()) return Promise.resolve();
    const content = JSON.stringify(getPosts(), null, 2);
    return commitFile(POSTS_PATH, content, "更新博文数据");
  }

  function commitResources() {
    if (!hasGithubToken()) return Promise.resolve();
    const content = JSON.stringify(getResources(), null, 2);
    return commitFile(RESOURCES_PATH, content, "更新资源数据");
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

  /* ---------- 登录 / 会话 ---------- */
  function getBuiltInUsers() {
    const list = window.EGG_USERS;
    return Array.isArray(list) ? list : [];
  }

  function getRegisteredUsers() {
    return readArray(USERS_KEY);
  }

  function getAllUsers() {
    return getBuiltInUsers().concat(getRegisteredUsers());
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
    const username = String(identifier || "").trim();
    const name = displayName ? String(displayName).trim() : username;

    if (username.length < 2) {
      return Promise.resolve({ ok: false, message: "账号至少需要 2 个字符。" });
    }
    if (!password || password.length < 6) {
      return Promise.resolve({ ok: false, message: "密码至少需要 6 位。" });
    }
    if (findUser(username)) {
      return Promise.resolve({ ok: false, message: "该账号已存在，请直接登录或换一个。" });
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

      return { ok: true, profile: profile };
    });
  }

  function login(identifier, password) {
    const user = findUser(identifier);
    if (!user) {
      return Promise.resolve({ ok: false, message: "该账号不存在，可以先注册一个。" });
    }
    if (!user.passwordHash) {
      return Promise.resolve({ ok: false, message: "该账号未设置密码，请联系站点管理员。" });
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

      return { ok: true, profile: profile };
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
    POST_STYLES: POST_STYLES,
    loadData: loadData,
    getPosts: getPosts,
    addPost: addPost,
    removePost: removePost,
    getResources: getResources,
    addResource: addResource,
    removeResource: removeResource,
    login: login,
    register: register,
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
