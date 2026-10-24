/* 鸡蛋站 · 登录与发布面板 */
(function () {
  "use strict";

  const STORE = window.EggStore;
  if (!STORE) return;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const page = document.body.dataset.page;

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad(number) {
    return String(number).padStart(2, "0");
  }

  function setMessage(node, message, type) {
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("is-error", type === "error");
    node.classList.toggle("is-success", type === "success");
    node.classList.toggle("is-warn", type === "warn");
  }

  function localDate(date) {
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    return year + "-" + month + "-" + day;
  }

  /* ---------- 登录 ---------- */
  /* ---------- 登录 / 注册 切换 ---------- */
  function setupAuthTabs() {
    const tabs = $$("[data-tab]");
    if (!tabs.length) return;

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        const target = tab.dataset.tab;
        tabs.forEach(function (t) {
          const active = t.dataset.tab === target;
          t.classList.toggle("is-active", active);
          t.setAttribute("aria-selected", String(active));
        });
        $$("[data-auth-panel]").forEach(function (panel) {
          panel.hidden = panel.dataset.authPanel !== target;
        });
      });
    });
  }

  function setupLogin() {
    const form = $("[data-login-form]");
    if (!form) return;

    if (STORE.isLoggedIn()) {
      window.location.replace("dashboard.html");
      return;
    }

    const message = $("[data-login-message]");
    const submit = $("button[type='submit']", form);

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      const account = form.elements.account.value.trim();
      const password = form.elements.password.value;
      if (!account || !password) {
        setMessage(message, "请填写账号与登录密码。", "error");
        return;
      }

      if (submit) {
        submit.disabled = true;
        submit.textContent = "正在校验…";
      }

      STORE.login(account, password).then(function (result) {
        if (!result.ok) {
          setMessage(message, result.message, "error");
          if (submit) {
            submit.disabled = false;
            submit.textContent = "登录并继续";
          }
          return;
        }

        setMessage(message, "登录成功，正在进入发布面板…", "success");
        window.setTimeout(function () {
          window.location.href = "dashboard.html";
        }, 350);
      }).catch(function () {
        setMessage(message, "登录校验失败，请稍后再试。", "error");
        if (submit) {
          submit.disabled = false;
          submit.textContent = "登录并继续";
        }
      });
    });
  }

  function setupRegister() {
    const form = $("[data-register-form]");
    if (!form) return;

    const message = $("[data-register-message]");
    const submit = $("button[type='submit']", form);

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      const account = form.elements.account.value.trim();
      const displayName = form.elements.displayName.value.trim();
      const password = form.elements.password.value;
      const confirm = form.elements.confirm.value;

      if (!account || !password || !confirm) {
        setMessage(message, "请填写账号、密码并确认密码。", "error");
        return;
      }
      if (password !== confirm) {
        setMessage(message, "两次输入的密码不一致。", "error");
        return;
      }

      if (submit) {
        submit.disabled = true;
        submit.textContent = "正在注册…";
      }

      STORE.register(account, password, displayName).then(function (result) {
        if (!result.ok) {
          setMessage(message, result.message, "error");
          if (submit) {
            submit.disabled = false;
            submit.textContent = "注册并进入";
          }
          return;
        }

        setMessage(message, "注册成功，正在进入发布面板…", "success");
        window.setTimeout(function () {
          window.location.href = "dashboard.html";
        }, 350);
      }).catch(function () {
        setMessage(message, "注册失败，请稍后再试。", "error");
        if (submit) {
          submit.disabled = false;
          submit.textContent = "注册并进入";
        }
      });
    });
  }

  /* ---------- 发布博文 ---------- */
  function renderPosts(messageNode, session) {
    const list = $("[data-admin-posts]");
    if (!list) return;

    const posts = STORE.getPosts();
    const count = $("[data-post-count]");
    if (count) count.textContent = posts.length + " 篇";

    if (!posts.length) {
      list.innerHTML =
        '<div class="manage-empty"><strong>还没有博文</strong><p>发布第一篇后，它会出现在这里。</p></div>';
      return;
    }

    const isAdmin = session && session.role === "admin";
    const currentUser = session ? session.username : "";

    list.innerHTML = posts
      .map(function (post, index) {
        const isOwner = post.author === currentUser;
        const canDelete = isOwner || isAdmin;
        const authorLabel = post.authorName || (post.author || "佚名");

        return [
          '<div class="manage-item">',
          '<span class="manage-number">', pad(index + 1), "</span>",
          '<div class="manage-main"><strong>', escapeHTML(post.title), "</strong>",
          "<span>", escapeHTML(post.category), " · ", escapeHTML(post.dateLabel),
          " · 作者：", escapeHTML(authorLabel), "</span></div>",
          '<a class="manage-open" href="blog.html#', escapeHTML(post.id), '">查看</a>',
          canDelete
            ? '<button class="manage-delete" type="button" data-delete-post="' + escapeHTML(post.id) + '">删除</button>'
            : "",
          "</div>"
        ].join("");
      })
      .join("");

    list.onclick = function (event) {
      const button = event.target.closest("[data-delete-post]");
      if (!button) return;
      const post = STORE.getPosts().find(function (item) {
        return item.id === button.dataset.deletePost;
      });
      if (!post) return;

      const isOwner = post.author === currentUser;
      const isOthersPost = !isOwner && isAdmin;

      // 站长删除他人博文须说明缘由，否则不予删除
      if (isOthersPost) {
        const reason = window.prompt(
          "删除他人博文《" + post.title + "》\n请填写删除缘由（将告知作者，留空则取消删除）："
        );
        if (reason === null || !reason.trim()) {
          setMessage(messageNode, "未填写缘由，不予删除。", "error");
          return;
        }
        STORE.logDeletion({
          type: "post",
          title: post.title,
          author: post.author || "佚名",
          reason: reason.trim(),
          deletedBy: session.displayName || session.username,
          deletedAt: Date.now()
        });
      } else {
        if (!window.confirm("确定删除自己的博文《" + post.title + "》吗？")) return;
      }

      STORE.removePost(post.id).then(function (result) {
        if (!result.ok) {
          setMessage(messageNode, result.message, "error");
          return;
        }
        renderPosts(messageNode, session);
        setMessage(
          messageNode,
          (isOthersPost ? "博文已删除，缘由已记录。" : "博文已删除。") +
          (result.warning ? "（" + result.warning + "）" : ""),
          result.warning ? "warn" : "success"
        );
      });
    };
  }

  function setupPostForm(session) {
    const form = $("[data-post-form]");
    if (!form) return;

    const message = $("[data-post-message]");
    renderPosts(message, session);

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      const title = form.elements.title.value.trim();
      const category = form.elements.category.value;
      const excerptInput = form.elements.excerpt.value.trim();
      const paragraphs = form.elements.content.value
        .split(/\n+/)
        .map(function (line) { return line.trim(); })
        .filter(Boolean);

      if (!title) {
        setMessage(message, "请填写文章标题。", "error");
        form.elements.title.focus();
        return;
      }
      if (!paragraphs.length) {
        setMessage(message, "正文不能为空，写一句也可以。", "error");
        form.elements.content.focus();
        return;
      }

      const style = STORE.postStyle(category);
      const now = new Date();
      const date = localDate(now);
      const totalLength = paragraphs.join("").length;
      const readTime = Math.max(3, Math.ceil(totalLength / 320));
      const excerpt =
        excerptInput ||
        paragraphs[0].slice(0, 100) + (paragraphs[0].length > 100 ? "…" : "");

      const post = {
        id: STORE.makeId("post"),
        title: title,
        category: category,
        date: date,
        dateLabel: date.replace(/-/g, "."),
        readTime: readTime,
        accent: style.accent,
        soft: style.soft,
        art: STORE.postArt(STORE.getPosts().length),
        excerpt: excerpt,
        quote: "",
        content: paragraphs,
        author: session ? session.username : "",
        authorName: session ? (session.displayName || session.username) : "匿名",
        createdAt: now.getTime()
      };

      STORE.addPost(post).then(function (result) {
        if (!result.ok) {
          setMessage(message, result.message, "error");
          return;
        }
        form.reset();
        form.elements.category.value = category;
        const text = "博文《" + title + "》已发布" +
          (result.warning ? "（" + result.warning + "）" : "，可在博客页查看。");
        setMessage(message, text, result.warning ? "warn" : "success");
        renderPosts(message, session);
        message.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  /* ---------- 上传资源 ---------- */
  function renderResources(messageNode) {
    const list = $("[data-admin-resources]");
    if (!list) return;

    const resources = STORE.getResources();
    const total = $("[data-resource-total]");
    if (total) total.textContent = resources.length + " 份";

    if (!resources.length) {
      list.innerHTML =
        '<div class="manage-empty"><strong>还没有资源</strong><p>上传第一份文件后，它会出现在这里。</p></div>';
      return;
    }

    list.innerHTML = resources
      .map(function (resource, index) {
        return [
          '<div class="manage-item">',
          '<span class="manage-number">', pad(index + 1), "</span>",
          '<div class="manage-main"><strong>', escapeHTML(resource.name), "</strong>",
          "<span>", escapeHTML(resource.category), " · ", escapeHTML(resource.type), " · ", escapeHTML(resource.fileName), "</span></div>",
          '<a class="manage-open" href="', escapeHTML(resource.fileData), '" download="', escapeHTML(resource.fileName), '">下载</a>',
          '<button class="manage-delete" type="button" data-delete-resource="', escapeHTML(resource.id), '">删除</button>',
          "</div>"
        ].join("");
      })
      .join("");

    list.onclick = function (event) {
      const button = event.target.closest("[data-delete-resource]");
      if (!button) return;
      const resource = STORE.getResources().find(function (item) {
        return item.id === button.dataset.deleteResource;
      });
      if (!resource) return;
      if (!window.confirm("确定删除资源“" + resource.name + "”吗？")) return;

      STORE.removeResource(resource.id).then(function (result) {
        if (!result.ok) {
          setMessage(messageNode, result.message, "error");
          return;
        }
        renderResources(messageNode);
        setMessage(
          messageNode,
          "资源已删除。" + (result.warning ? "（" + result.warning + "）" : ""),
          result.warning ? "warn" : "success"
        );
      });
    };
  }

  function setupResourceForm(session) {
    const form = $("[data-resource-form]");
    if (!form) return;

    const message = $("[data-resource-message]");
    const fileInput = form.elements.file;
    const fileInfo = $("[data-file-info]");
    const submit = $("[data-resource-submit]");
    renderResources(message);

    if (fileInput && fileInfo) {
      fileInput.addEventListener("change", function () {
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
          fileInfo.textContent = "尚未选择文件";
          fileInfo.classList.remove("is-error");
          return;
        }

        fileInfo.textContent = file.name + " · " + STORE.formatBytes(file.size);
        fileInfo.classList.toggle("is-error", file.size > STORE.MAX_FILE_SIZE);
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      const file = fileInput.files && fileInput.files[0];
      const name = form.elements.name.value.trim();
      const category = form.elements.category.value;
      const descInput = form.elements.desc.value.trim();

      if (!file) {
        setMessage(message, "请选择要上传的资源文件。", "error");
        fileInput.focus();
        return;
      }
      if (file.size > STORE.MAX_FILE_SIZE) {
        setMessage(message, "文件超过 2MB，请压缩后再上传。", "error");
        return;
      }
      if (!name) {
        setMessage(message, "请填写资源名称。", "error");
        form.elements.name.focus();
        return;
      }

      if (submit) {
        submit.disabled = true;
        submit.textContent = "正在读取文件…";
      }
      setMessage(message, "正在将文件保存到浏览器，请稍候…", "success");

      const reader = new FileReader();
      reader.onload = function () {
        const extension = file.name.indexOf(".") !== -1
          ? file.name.split(".").pop().toUpperCase().slice(0, 10)
          : "FILE";

        const resource = {
          id: STORE.makeId("file"),
          name: name,
          category: category,
          desc: descInput || "资源文件：" + file.name,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || "application/octet-stream",
          fileData: String(reader.result),
          type: extension + " · " + STORE.formatBytes(file.size),
          icon: STORE.resourceIcon(category),
          createdAt: Date.now()
        };

        STORE.addResource(resource).then(function (result) {
          if (submit) {
            submit.disabled = false;
            submit.textContent = "上传资源";
          }

          if (!result.ok) {
            setMessage(message, result.message, "error");
            return;
          }

          form.reset();
          if (fileInfo) {
            fileInfo.textContent = "尚未选择文件";
            fileInfo.classList.remove("is-error");
          }
          const text = "资源“" + name + "”已上传" +
            (result.warning ? "（" + result.warning + "）" : "，可在资源页下载。");
          setMessage(message, text, result.warning ? "warn" : "success");
          renderResources(message);
        });
      };

      reader.onerror = function () {
        if (submit) {
          submit.disabled = false;
          submit.textContent = "上传资源";
        }
        setMessage(message, "文件读取失败，请重新选择后再试。", "error");
      };

      reader.readAsDataURL(file);
    });
  }

  /* ---------- 面板守卫与退出 ---------- */
  /* ---------- GitHub Token 配置（仅站长） ---------- */
  function setupToken() {
    const form = $("[data-token-form]");
    if (!form) return;

    const message = $("[data-token-message]");
    const input = form.elements.token;

    // 显示当前是否已配置 Token
    if (STORE.hasGithubToken()) {
      setMessage(message, "已配置 GitHub Token，发布将自动同步到仓库。", "success");
    } else {
      setMessage(message, "尚未配置 Token，当前发布仅保存在本地。", "warn");
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const token = input.value.trim();
      if (!token) {
        setMessage(message, "请输入 GitHub Token。", "error");
        return;
      }
      STORE.setGithubToken(token);
      input.value = "";
      setMessage(message, "Token 已保存，发布将同步到仓库。", "success");
    });

    const clearBtn = $("[data-token-clear]");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        STORE.setGithubToken("");
        setMessage(message, "Token 已清除，发布将仅保存在本地。", "warn");
      });
    }
  }

  function setupDashboard() {
    if (page !== "dashboard") return;

    if (!STORE.isLoggedIn()) {
      window.location.replace("admin.html");
      return;
    }

    const session = STORE.getSession();
    const identity = $("[data-admin-identity]");
    if (identity && session) identity.textContent = session.displayName || session.username;

    const bio = $("[data-admin-bio]");
    if (bio) bio.textContent = session && session.bio ? session.bio : "";

    const roleNode = $("[data-admin-role]");
    if (roleNode && session) {
      roleNode.textContent = "角色：" + (session.role || "成员");
    }

    $$("[data-logout]").forEach(function (button) {
      button.addEventListener("click", function () {
        STORE.logout();
        window.location.href = "admin.html";
      });
    });

    const isAdmin = session && session.role === "admin";

    // Token 配置仅站长可见
    const tokenCard = $("[data-token-card]");
    if (tokenCard && isAdmin) {
      tokenCard.hidden = false;
      setupToken();
    }

    // 资源上传仅站长可用
    const resourceForm = $("[data-resource-form]");
    if (resourceForm) {
      const card = resourceForm.closest(".dash-card");
      if (card && !isAdmin) {
        card.innerHTML = [
          '<div class="dash-card-head">',
          '<span class="dash-kicker">02 / NEW RESOURCE</span>',
          "<h2>上传资源文件</h2>",
          "<p>资源上传仅对站长开放。</p>",
          "</div>",
          '<div class="manage-empty" style="margin-top:8px">',
          "<strong>仅站长可上传资源</strong>",
          "<p>如需上传资源文件，请联系站长代为发布。</p>",
          "</div>"
        ].join("");
      }
    }

    setupPostForm(session);
    if (isAdmin) setupResourceForm(session);
  }

  setupAuthTabs();
  setupLogin();
  setupRegister();
  setupDashboard();
})();
