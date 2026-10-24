/* 鸡蛋站 · 授权用户列表
 * ------------------------------------------------------------------
 * 本文件是站内所有“可登录账号”的唯一来源。
 * 站点没有注册功能：只有这里登记过的账号才能登录发布面板。
 * 要新增 / 修改 / 删除账号，直接编辑下方 USERS 数组，
 * 重新部署到 GitHub Pages 后即时生效。
 *
 * 密码不保存明文，只保存 passwordHash：
 *   passwordHash = SHA-256(SALT + 明文密码)  的十六进制字符串
 *
 * 生成新账号的 passwordHash（任选其一）：
 *   1) Node:  node -e "const c=require('crypto');const s='鸡蛋站';console.log(c.createHash('sha256').update(s+'你的密码').digest('hex'))"
 *   2) 浏览器控制台（打开任意站内页面后粘贴）：
 *        crypto.subtle.digest('SHA-256', new TextEncoder().encode('鸡蛋站' + '你的密码'))
 *          .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
 *
 * 注意：本站为纯静态部署（GitHub Pages），users.js 可被任何人查看。
 * 哈希能避免明文密码泄露，但无法抵御离线暴力破解，请勿在别处复用相同密码。
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  // 全站统一盐值。修改后所有旧的 passwordHash 都会失效，请同步重新生成。
  const SALT = "鸡蛋站";

  // 可登录账号列表。username 必须唯一。
  const USERS = [
    {
      username: "eggdevlop@163.com",
      passwordHash: "b59a49d644208d7d6bb77eafd1ddaa23127a5c637f8f02b0ecdfe95beb6d97ec",
      displayName: "鸡蛋站站长",
      role: "admin",
      bio: "负责写文章、整理资源，偶尔孵蛋。",
      createdAt: "2026-01-01"
    }
    /* 新增账号示例：
    ,{
      username: "编辑",
      passwordHash: "把 SALT + 密码 的 SHA-256 结果粘到这里",
      displayName: "小编",
      role: "editor",
      bio: "一句话介绍。",
      createdAt: "2026-01-01"
    }
    */
  ];

  window.EGG_USERS = USERS;
  window.EGG_USER_SALT = SALT;
})();
