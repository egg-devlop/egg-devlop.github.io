/* 鸡蛋站 · 本地数据与登录状态
 * 纯静态部署（GitHub Pages）方案：
 *   - 博文 / 资源保存在浏览器 localStorage；
 *   - 内置账号来自 assets/js/users.js（window.EGG_USERS）；
 *   - 开放注册：新用户保存在浏览器 localStorage（eggstation.users.v1），仅当前浏览器可见；
 *   - 密码用 SHA-256(SALT + 明文) 保存为哈希，不保存明文。
 * 由于所有逻辑都在前端，这只是演示级别的鉴权，不能当作生产级安全方案。
 */
(function () {
  "use strict";

  const POSTS_KEY = "eggstation.posts.v1";
  const RESOURCES_KEY = "eggstation.resources.v1";
  const SESSION_KEY = "eggstation.session.v1";
  const PROFILE_KEY = "eggstation.profile.v1"; // 保存当前登录用户的个人信息
  const USERS_KEY = "eggstation.users.v1"; // 注册用户
  const DELETIONS_KEY = "eggstation.deletions.v1"; // 站长删除记录
  const MAX_FILE_SIZE = 2 * 1024 * 1024;

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

  /* ---------- 博文 ---------- */
  function getPosts() {
    return readArray(POSTS_KEY).sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function addPost(post) {
    const posts = getPosts();
    posts.unshift(post);
    return writeArray(POSTS_KEY, posts);
  }

  function removePost(id) {
    return writeArray(
      POSTS_KEY,
      getPosts().filter(function (post) {
        return post.id !== id;
      })
    );
  }

  /* ---------- 资源 ---------- */
  function getResources() {
    return readArray(RESOURCES_KEY).sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function addResource(resource) {
    const resources = getResources();
    resources.unshift(resource);
    return writeArray(RESOURCES_KEY, resources);
  }

  function removeResource(id) {
    return writeArray(
      RESOURCES_KEY,
      getResources().filter(function (resource) {
        return resource.id !== id;
      })
    );
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
    // 环境不支持 SubtleCrypto（如 file://）时返回一个永远不会匹配的占位
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

  // 注册：新用户保存在 localStorage，仅当前浏览器可见。
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

      // 注册后自动登录
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

  // 登录：接受内置账号 + 注册用户。
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

      // 保存会话与个人信息到本地
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
    // 保留 PROFILE_KEY 中的个人信息，下次同账号登录仍可识别。
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

  // 记录站长删除他人博文的缘由，便于向作者说明。
  function logDeletion(record) {
    const list = readArray(DELETIONS_KEY);
    list.unshift(record);
    // 最多保留 100 条删除记录
    writeArray(DELETIONS_KEY, list.slice(0, 100));
  }

  window.EggStore = {
    MAX_FILE_SIZE: MAX_FILE_SIZE,
    POST_STYLES: POST_STYLES,
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
    logDeletion: logDeletion
  };
})();
