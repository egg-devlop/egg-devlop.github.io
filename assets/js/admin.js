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
        submit.textContent = "正在提交…";
      }

      STORE.register(account, password, displayName).then(function (result) {
        if (submit) {
          submit.disabled = false;
          submit.textContent = "提交注册申请";
        }
        if (!result.ok) {
          setMessage(message, result.message, "error");
          return;
        }

        // 注册收紧后：不再自动登录，等待站长批准
        form.reset();
        setMessage(message, result.message + " 批准后回到本页登录即可。", "success");
      }).catch(function () {
        setMessage(message, "注册失败，请稍后再试。", "error");
        if (submit) {
          submit.disabled = false;
          submit.textContent = "提交注册申请";
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
        const isOwner = !post.author || post.author === currentUser;
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

      const isOwner = !post.author || post.author === currentUser;
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
      }).catch(function (error) {
        setMessage(messageNode, "删除失败：" + (error && error.message ? error.message : "未知错误"), "error");
      });
    };
  }

  function setupPostForm(session) {
    const form = $("[data-post-form]");
    if (!form) return;

    const message = $("[data-post-message]");
    const imageInput = form.elements.images;
    const imageInfo = $("[data-post-images-info]");
    const submit = $("[data-post-submit]");
    renderPosts(message, session);

    if (imageInput && imageInfo) {
      imageInput.addEventListener("change", function () {
        const files = Array.prototype.slice.call(imageInput.files || []);
        if (!files.length) {
          imageInfo.textContent = "尚未选择图片";
          imageInfo.classList.remove("is-error");
          return;
        }
        const total = files.reduce(function (sum, file) { return sum + file.size; }, 0);
        const tooBig = files.filter(function (file) {
          return file.size > STORE.MAX_IMAGE_SIZE;
        });
        imageInfo.textContent = "已选择 " + files.length + " 张图片，共 " +
          STORE.formatBytes(total) +
          (tooBig.length ? "（有 " + tooBig.length + " 张超过 10MB）" : "");
        imageInfo.classList.toggle("is-error", tooBig.length > 0);
      });
    }

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

      const files = Array.prototype.slice.call((imageInput && imageInput.files) || []);
      const tooBig = files.filter(function (file) {
        return file.size > STORE.MAX_IMAGE_SIZE;
      });
      if (tooBig.length) {
        setMessage(message, "有 " + tooBig.length + " 张图片超过 10MB，请压缩后再发布。", "error");
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
        images: [],
        cover: "",
        author: session ? session.username : "",
        authorName: session ? (session.displayName || session.username) : "匿名",
        createdAt: now.getTime()
      };

      if (submit) {
        submit.disabled = true;
        submit.textContent = files.length ? "正在上传配图…" : "正在发布…";
      }
      if (files.length) {
        setMessage(message, "正在上传 " + files.length + " 张配图到仓库，请稍候…", "success");
      }

      STORE.uploadPostImages(post.id, files).then(function (uploaded) {
        post.images = uploaded.images || [];
        post.cover = post.images.length ? post.images[0] : "";

        return STORE.addPost(post).then(function (result) {
          if (submit) {
            submit.disabled = false;
            submit.textContent = "发布这篇博文";
          }
          if (!result.ok) {
            setMessage(message, result.message, "error");
            return;
          }
          form.reset();
          form.elements.category.value = category;
          if (imageInfo) {
            imageInfo.textContent = "尚未选择图片";
            imageInfo.classList.remove("is-error");
          }
          const text = "博文《" + title + "》已发布" +
            (result.warning ? "（" + result.warning + "）" : "，可在博客页查看。") +
            (uploaded.local ? "（未配置 Token，配图仅自己可见）" : "");
          setMessage(message, text, result.warning || uploaded.local ? "warn" : "success");
          renderPosts(message, session);
          message.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }).catch(function (error) {
        if (submit) {
          submit.disabled = false;
          submit.textContent = "发布这篇博文";
        }
        setMessage(message, "配图上传失败：" + (error && error.message ? error.message : "未知错误"), "error");
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
        const href = resource.filePath || resource.fileData || "#";
        return [
          '<div class="manage-item">',
          '<span class="manage-number">', pad(index + 1), "</span>",
          '<div class="manage-main"><strong>', escapeHTML(resource.name), "</strong>",
          "<span>", escapeHTML(resource.category), " · ", escapeHTML(resource.type), " · ", escapeHTML(resource.fileName), "</span></div>",
          '<a class="manage-open" href="', escapeHTML(href), '" download="', escapeHTML(resource.fileName), '">下载</a>',
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
      }).catch(function (error) {
        setMessage(messageNode, "删除失败：" + (error && error.message ? error.message : "未知错误"), "error");
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
        setMessage(message, "文件超过 " + STORE.formatBytes(STORE.MAX_FILE_SIZE) + "，请压缩后再上传。", "error");
        return;
      }
      if (!name) {
        setMessage(message, "请填写资源名称。", "error");
        form.elements.name.focus();
        return;
      }

      if (submit) {
        submit.disabled = true;
        submit.textContent = "正在上传…";
      }
      setMessage(message, "正在上传文件到仓库，请稍候…", "success");

      const extension = file.name.indexOf(".") !== -1
        ? file.name.split(".").pop().toUpperCase().slice(0, 10)
        : "FILE";

      const metadata = {
        id: STORE.makeId("file"),
        name: name,
        category: category,
        desc: descInput || "资源文件：" + file.name,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || "application/octet-stream",
        type: extension + " · " + STORE.formatBytes(file.size),
        icon: STORE.resourceIcon(category),
        author: session ? session.username : "",
        authorName: session ? (session.displayName || session.username) : "匿名",
        createdAt: Date.now()
      };

      STORE.addResource(metadata, file).then(function (result) {
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
      }).catch(function (error) {
        if (submit) {
          submit.disabled = false;
          submit.textContent = "上传资源";
        }
        setMessage(message, "上传失败：" + (error && error.message ? error.message : "未知错误"), "error");
      });
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
      Promise.resolve(STORE.setGithubToken(token)).then(function () {
        input.value = "";
        setMessage(message, "Token 已保存：本机可用，并已用登录密码加密同步到仓库，其他设备登录站长账号后自动恢复。", "success");
      });
    });

    const clearBtn = $("[data-token-clear]");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        STORE.setGithubToken("");
        setMessage(message, "Token 已清除，发布将仅保存在本地。", "warn");
      });
    }

    // 站长开启/关闭注册申请通道
    const passBtn = $("[data-pass-save]");
    if (passBtn) {
      passBtn.addEventListener("click", function () {
        passBtn.disabled = true;
        passBtn.textContent = "开启中…";
        STORE.publishSyncToken().then(function (result) {
          passBtn.disabled = false;
          passBtn.textContent = "开启注册申请";
          setMessage(message, result.message, result.ok ? "success" : "error");
        });
      });
    }
    const revokeBtn = $("[data-pass-revoke]");
    if (revokeBtn) {
      revokeBtn.addEventListener("click", function () {
        revokeBtn.disabled = true;
        revokeBtn.textContent = "关闭中…";
        STORE.revokeSyncToken().then(function (result) {
          revokeBtn.disabled = false;
          revokeBtn.textContent = "关闭注册申请";
          setMessage(message, result.message, result.ok ? "success" : "error");
        });
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

    // 注销账号：仅成员可见，站长不可注销
    const deleteBtn = $("[data-delete-account]");
    if (deleteBtn && !isAdmin) {
      deleteBtn.hidden = false;
      deleteBtn.addEventListener("click", function () {
        if (!window.confirm("注销后账号将从本机和仓库中删除，且无法恢复。确定注销吗？")) return;
        deleteBtn.disabled = true;
        deleteBtn.textContent = "注销中…";
        STORE.deleteAccount().then(function (result) {
          window.alert(result.message);
          window.location.href = "admin.html";
        });
      });
    }

    // Token 配置仅站长可见：Token 会用站长密码加密后存入仓库，换设备登录自动恢复
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

    // 仓库数据加载完成后再刷新列表，避免只显示本地缓存
    if (STORE && typeof STORE.loadData === "function") {
      STORE.loadData().then(function () {
        renderPosts($("[data-post-message]"), STORE.getSession());
        if (isAdmin) renderResources($("[data-resource-message]"));
      });
    }
  }

  /* ---------- 站长审批：密钥解锁 + 申请列表 ---------- */
  function setupApprovals() {
    if (page !== "admin") return;

    const gate = $("[data-key-gate]");
    const panel = $("[data-pending-panel]");
    const unlockBtn = $("[data-key-unlock]");
    const keyInput = $("#admin-key");
    const keyMessage = $("[data-key-message]");
    const list = $("[data-pending-list]");
    const listMessage = $("[data-pending-message]");
    if (!gate || !panel || !unlockBtn || !keyInput) return;

    function renderPending() {
      if (!list) return;
      list.innerHTML = '<div class="manage-empty"><strong>读取中…</strong></div>';
      STORE.getPendingRequests().then(function (pending) {
        if (!pending.length) {
          list.innerHTML = '<div class="manage-empty"><strong>没有待审批的申请</strong><p>访客提交账号同步申请后会出现在这里。</p></div>';
          return;
        }
        list.innerHTML = pending
          .map(function (item, index) {
            const time = item.requestedAt
              ? new Date(item.requestedAt).toLocaleString("zh-CN", { hour12: false })
              : "";
            return [
              '<div class="manage-item">',
              '<span class="manage-number">', pad(index + 1), "</span>",
              '<div class="manage-main"><strong>', escapeHTML(item.displayName || item.username), "</strong>",
              "<span>", escapeHTML(item.username), (time ? " · " + escapeHTML(time) : ""), "</span></div>",
              '<button class="manage-open" type="button" data-approve="', escapeHTML(item.username), '">批准</button>',
              '<button class="manage-delete" type="button" data-reject="', escapeHTML(item.username), '">拒绝</button>',
              "</div>"
            ].join("");
          })
          .join("");
      });
    }

    unlockBtn.addEventListener("click", function () {
      unlockBtn.disabled = true;
      STORE.checkAdminKey(keyInput.value).then(function (ok) {
        unlockBtn.disabled = false;
        if (!ok) {
          setMessage(keyMessage, "密钥不正确。", "error");
          keyInput.select();
          return;
        }
        gate.hidden = true;
        panel.hidden = false;
        renderPending();
      });
    });

    keyInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        unlockBtn.click();
      }
    });

    if (list) {
      list.addEventListener("click", function (event) {
        const approveBtn = event.target.closest("[data-approve]");
        const rejectBtn = event.target.closest("[data-reject]");
        const btn = approveBtn || rejectBtn;
        if (!btn) return;
        const username = btn.dataset.approve || btn.dataset.reject;
        btn.disabled = true;
        const action = approveBtn ? STORE.approveRequest(username) : STORE.rejectRequest(username);
        action.then(function (result) {
          setMessage(listMessage, result.message, result.ok ? "success" : "error");
          renderPending();
        });
      });
    }
  }

  setupAuthTabs();
  setupLogin();
  setupRegister();
  setupApprovals();
  setupDashboard();
})();
