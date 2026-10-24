/* 鸡蛋站 · 全站交互 */
(function () {
  "use strict";

  document.documentElement.classList.add("js");

  const STORE = window.EggStore;
  let POSTS = STORE ? STORE.getPosts() : [];
  let RESOURCES = STORE ? STORE.getResources() : [];
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const page = document.body.dataset.page || "home";

  const ICONS = {
    code:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13.5 5-3 14"/></svg>',
    pen:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    bolt:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
    book:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>'
  };

  const RESOURCE_THEMES = {
    开发工具: { bg: "#e6f0ea", color: "#3f8068" },
    设计素材: { bg: "#fff0c2", color: "#a97600" },
    效率工具: { bg: "#f0eaf8", color: "#7a5c9e" },
    学习充电: { bg: "#e8f1f8", color: "#3f7296" }
  };

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

  function emptyState(title, description, href, label) {
    return [
      '<div class="empty-state" style="grid-column:1/-1">',
      "<strong>", escapeHTML(title), "</strong>",
      "<p>", escapeHTML(description), "</p>",
      href
        ? '<a class="btn btn--outline btn--small" href="' + href + '">' + escapeHTML(label) + "</a>"
        : "",
      "</div>"
    ].join("");
  }

  function setHash(hash) {
    try {
      if (hash) {
        history.replaceState(null, "", "#" + hash);
      } else {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } catch (error) {
      /* file:// 等环境下忽略即可 */
    }
  }

  /* ---------- 提示 ---------- */
  let toastStack = null;

  function showToast(message) {
    if (!toastStack) {
      toastStack = document.createElement("div");
      toastStack.className = "toast-stack";
      toastStack.setAttribute("role", "status");
      toastStack.setAttribute("aria-live", "polite");
      document.body.appendChild(toastStack);
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastStack.appendChild(toast);

    window.setTimeout(function () {
      toast.classList.add("is-leaving");
      window.setTimeout(function () {
        toast.remove();
      }, 300);
    }, 3200);
  }

  /* ---------- 滚动出现 ---------- */
  let revealObserver = null;

  function initReveal() {
    if (!("IntersectionObserver" in window) || reduceMotion.matches) {
      return;
    }

    revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -36px 0px" }
    );
  }

  function observeReveals() {
    const nodes = $$(".reveal:not(.is-visible)");
    if (!revealObserver) {
      nodes.forEach(function (node) {
        node.classList.add("is-visible");
      });
      return;
    }
    nodes.forEach(function (node) {
      revealObserver.observe(node);
    });
  }

  /* ---------- 文章卡片 ---------- */
  function authorLabel(post) {
    const name = post.authorName || post.author;
    return name ? '<span class="post-author">· ' + escapeHTML(name) + "</span>" : "";
  }

  function postCard(post, index, delay) {
    return [
      '<article class="post-card reveal" style="--soft:', escapeHTML(post.soft), ";--accent:", escapeHTML(post.accent), ";--delay:", delay, 'ms">',
      '<a href="blog.html#', escapeHTML(post.id), '" data-post-link="', escapeHTML(post.id), '">',
      '<span class="post-art post-art--', escapeHTML(post.art), '">',
      '<span class="post-art-index" aria-hidden="true">', pad(index + 1), "</span>",
      '<span class="post-art-egg" aria-hidden="true"></span>',
      "</span>",
      '<div class="post-card-body">',
      '<div class="post-meta"><span class="tag">', escapeHTML(post.category), "</span>",
      authorLabel(post),
      '<time datetime="', escapeHTML(post.date), '">', escapeHTML(post.dateLabel), "</time></div>",
      "<h3>", escapeHTML(post.title), "</h3>",
      "<p>", escapeHTML(post.excerpt), "</p>",
      '<div class="post-card-foot"><span>', post.readTime, ' 分钟阅读</span><span class="round-arrow" aria-hidden="true">→</span></div>',
      "</div></a></article>"
    ].join("");
  }

  function renderHomePosts() {
    const grid = $("[data-home-posts]");
    if (!grid) return;

    if (!POSTS.length) {
      grid.innerHTML = emptyState(
        "还没有破壳的文章",
        "新的想法正在孵化中，敬请期待。",
        "",
        ""
      );
      observeReveals();
      return;
    }

    grid.innerHTML = POSTS.slice(0, 3)
      .map(function (post, index) {
        return postCard(post, index, index * 80);
      })
      .join("");

    observeReveals();
  }

  /* ---------- 博客页 ---------- */
  function setupBlog() {
    const grid = $("[data-blog-grid]");
    if (!grid) return;

    const filters = $("[data-blog-filters]");
    const count = $("[data-blog-count]");
    const featuredWrap = $("[data-featured-wrap]");
    let activeCategory = "全部";

    const categories = ["全部"].concat(
      Array.from(new Set(POSTS.map(function (post) { return post.category; })))
    );

    function renderFeatured() {
      if (!featuredWrap || !POSTS.length) return;
      const post = POSTS[0];

      featuredWrap.innerHTML = [
        '<article class="featured-post reveal" style="--soft:', escapeHTML(post.soft), ";--accent:", escapeHTML(post.accent), '">',
        '<a class="featured-art post-art--', escapeHTML(post.art), '" href="blog.html#', escapeHTML(post.id), '" data-post-link="', escapeHTML(post.id), '" aria-label="阅读文章：', escapeHTML(post.title), '">',
        '<span class="featured-word">EDITOR\'S PICK · 01</span>',
        '<span class="post-art-index" aria-hidden="true">01</span>',
        '<span class="post-art-egg" aria-hidden="true"></span>',
        "</a>",
        '<div class="featured-copy">',
        '<div class="post-meta"><span class="tag">', escapeHTML(post.category), "</span>",
        authorLabel(post),
        '<time datetime="', escapeHTML(post.date), '">', escapeHTML(post.dateLabel), "</time></div>",
        "<h2>", escapeHTML(post.title), "</h2>",
        "<p>", escapeHTML(post.excerpt), "</p>",
        '<div class="featured-actions">',
        '<a class="text-link" href="blog.html#', escapeHTML(post.id), '" data-post-link="', escapeHTML(post.id), '">阅读全文 <span aria-hidden="true">→</span></a>',
        '<span class="read-time">', post.readTime, " 分钟阅读</span>",
        "</div></div></article>"
      ].join("");
    }

    function renderFilters() {
      if (!filters) return;

      filters.innerHTML = categories
        .map(function (category) {
          const isActive = category === activeCategory;
          const quantity =
            category === "全部"
              ? POSTS.length
              : POSTS.filter(function (post) { return post.category === category; }).length;

          return [
            '<button class="chip', isActive ? " is-active" : "", '" type="button" data-category="', escapeHTML(category), '" aria-pressed="', isActive, '">',
            escapeHTML(category),
            '<span class="chip-count">', quantity, "</span></button>"
          ].join("");
        })
        .join("");
    }

    function renderGrid() {
      const isAll = activeCategory === "全部";
      if (featuredWrap) featuredWrap.hidden = !isAll || !POSTS.length;

      const visible = isAll
        ? POSTS.slice(1)
        : POSTS.filter(function (post) { return post.category === activeCategory; });

      grid.innerHTML = visible
        .map(function (post, index) {
          return postCard(post, POSTS.indexOf(post), index * 70);
        })
        .join("");

      if (!POSTS.length) {
        grid.innerHTML = emptyState(
          "博客还是空的",
          "登录发布入口，把第一个想法写下来，它就会出现在这里。",
          "admin.html",
          "去发布第一篇"
        );
      } else if (!visible.length) {
        grid.innerHTML = emptyState(
          "这一窝还没有文章",
          "换个分类看看，新的蛋正在孵化中。",
          "",
          ""
        );
      }

      if (count) {
        count.textContent =
          "共 " + POSTS.length + " 篇文章 · " + Math.max(0, categories.length - 1) + " 个分类";
      }

      observeReveals();
    }

    function renderAll() {
      renderFeatured();
      renderFilters();
      renderGrid();
      observeReveals();
    }

    if (filters) {
      filters.addEventListener("click", function (event) {
        const button = event.target.closest("[data-category]");
        if (!button) return;
        activeCategory = button.dataset.category;
        renderAll();
      });
    }

    renderAll();

    const requestedPost = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : "";
    if (requestedPost && POSTS.some(function (post) { return post.id === requestedPost; })) {
      window.setTimeout(function () {
        openPost(requestedPost);
      }, 80);
    }
  }

  /* ---------- 资源页 ---------- */
  function resourceTheme(category) {
    return RESOURCE_THEMES[category] || { bg: "#ffedb3", color: "#a97600" };
  }

  function resourceMini(resource) {
    const theme = resourceTheme(resource.category);
    const icon = resource.icon || (STORE ? STORE.resourceIcon(resource.category) : "bolt");
    return [
      '<a class="resource-mini reveal" href="', escapeHTML(resource.filePath || resource.fileData || "#"), '" download="', escapeHTML(resource.fileName || resource.name), '"',
      ' style="--icon-bg:', theme.bg, ";--icon-color:", theme.color, '">',
      '<span class="resource-mini-icon">', ICONS[icon] || ICONS.bolt, "</span>",
      '<div class="resource-mini-body"><span>', escapeHTML(resource.category), " · ", escapeHTML(resource.type), "</span>",
      "<h3>", escapeHTML(resource.name), "</h3><p>", escapeHTML(resource.desc), "</p></div>",
      '<span class="mini-arrow" aria-hidden="true">↓</span></a>'
    ].join("");
  }

  function renderHomeResources() {
    const list = $("[data-home-resources]");
    if (!list) return;

    if (!RESOURCES.length) {
      list.innerHTML = emptyState(
        "资源库还是空的",
        "顺手的工具正在路上，很快就来。",
        "",
        ""
      );
      observeReveals();
      return;
    }

    list.innerHTML = RESOURCES.slice(0, 3).map(resourceMini).join("");
    observeReveals();
  }

  function setupResources() {
    const grid = $("[data-resource-grid]");
    if (!grid) return;

    const filters = $("[data-resource-filters]");
    const searchInput = $("[data-resource-search]");
    const count = $("[data-resource-count]");
    const categories = ["全部"].concat(
      Array.from(new Set(RESOURCES.map(function (item) { return item.category; })))
    );
    let activeCategory = "全部";

    function renderFilters() {
      if (!filters) return;
      filters.innerHTML = categories
        .map(function (category) {
          const isActive = category === activeCategory;
          const quantity =
            category === "全部"
              ? RESOURCES.length
              : RESOURCES.filter(function (item) { return item.category === category; }).length;

          return [
            '<button class="chip', isActive ? " is-active" : "", '" type="button" data-resource-category="', escapeHTML(category), '" aria-pressed="', isActive, '">',
            escapeHTML(category),
            '<span class="chip-count">', quantity, "</span></button>"
          ].join("");
        })
        .join("");
    }

    function render() {
      const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

      const visible = RESOURCES.filter(function (item) {
        const inCategory = activeCategory === "全部" || item.category === activeCategory;
        const haystack = (item.name + " " + item.desc + " " + item.category).toLowerCase();
        return inCategory && (!query || haystack.indexOf(query) !== -1);
      });

      if (!visible.length) {
        grid.innerHTML = RESOURCES.length
          ? emptyState(
              "没有找到这份资源",
              "试试更短的关键词，或者切换一个分类。",
              "",
              ""
            )
          : emptyState(
              "资源库还是空的",
              "登录发布入口，上传第一份文件资源，访客就能在这里下载。",
              "admin.html",
              "去上传资源"
            );
      } else {
        grid.innerHTML = visible
          .map(function (item, index) {
            const theme = resourceTheme(item.category);
            const icon = item.icon || (STORE ? STORE.resourceIcon(item.category) : "bolt");
            return [
              '<article class="resource-card reveal" style="--icon-bg:', theme.bg, ";--icon-color:", theme.color, ";--delay:", index * 50, 'ms">',
              '<div class="resource-head"><span class="resource-icon">', ICONS[icon] || ICONS.bolt, "</span>",
              '<span class="resource-cat">', escapeHTML(item.category), "</span></div>",
              "<h3>", escapeHTML(item.name), "</h3><p>", escapeHTML(item.desc), "</p>",
              '<div class="resource-foot"><span class="resource-type">', escapeHTML(item.type), "</span>",
              '<a class="resource-link" href="', escapeHTML(item.filePath || item.fileData || "#"), '" download="', escapeHTML(item.fileName || item.name), '">下载文件 <span aria-hidden="true">↓</span></a></div>',
              "</article>"
            ].join("");
          })
          .join("");
      }

      if (count) {
        count.textContent =
          query || activeCategory !== "全部"
            ? "找到 " + visible.length + " 份资源"
            : "共 " + RESOURCES.length + " 份资源";
      }

      observeReveals();
    }

    if (filters) {
      filters.addEventListener("click", function (event) {
        const button = event.target.closest("[data-resource-category]");
        if (!button) return;
        activeCategory = button.dataset.resourceCategory;
        renderFilters();
        render();
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", render);
    }

    renderFilters();
    render();
  }

  /* ---------- 文章弹窗 ---------- */
  function openPost(id) {
    const dialog = $("#postDialog");
    if (!dialog) return;

    const post = POSTS.find(function (item) { return item.id === id; });
    if (!post) return;

    const art = $("[data-dialog-art]", dialog);
    const index = $("[data-dialog-index]", dialog);
    const meta = $("[data-dialog-meta]", dialog);
    const title = $("[data-dialog-title]", dialog);
    const content = $("[data-dialog-content]", dialog);

    dialog.style.setProperty("--soft", post.soft);
    dialog.style.setProperty("--accent", post.accent);

    if (art) {
      art.className = "dialog-art post-art--" + post.art;
    }
    if (index) {
      index.textContent = pad(POSTS.indexOf(post) + 1);
    }
    if (meta) {
      meta.innerHTML = [
        '<span class="tag">', escapeHTML(post.category), "</span>",
        authorLabel(post),
        '<time datetime="', escapeHTML(post.date), '">', escapeHTML(post.dateLabel), "</time>",
        "<span>", post.readTime, " 分钟阅读</span>"
      ].join("");
    }
    if (title) {
      title.textContent = post.title;
    }
    if (content) {
      content.innerHTML = post.content
        .map(function (paragraph, paragraphIndex) {
          const quote =
            paragraphIndex === 1 && post.quote
              ? "<blockquote>" + escapeHTML(post.quote) + "</blockquote>"
              : "";
          return "<p>" + escapeHTML(paragraph) + "</p>" + quote;
        })
        .join("");
    }

    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    document.body.classList.add("dialog-open");
    setHash(post.id);

    const closeButton = $("[data-dialog-close]", dialog);
    if (closeButton) {
      window.setTimeout(function () { closeButton.focus(); }, 30);
    }
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute("open");
      document.body.classList.remove("dialog-open");
      setHash("");
    }
  }

  function setupDialog() {
    const dialog = $("#postDialog");
    if (!dialog) return;

    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeDialog(dialog);
    });

    dialog.addEventListener("close", function () {
      document.body.classList.remove("dialog-open");
      setHash("");
    });

    $$("[data-dialog-close]", dialog).forEach(function (button) {
      button.addEventListener("click", function () {
        closeDialog(dialog);
      });
    });

    document.addEventListener("click", function (event) {
      if (page !== "blog") return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

      const link = event.target.closest("[data-post-link]");
      if (!link) return;

      event.preventDefault();
      openPost(link.dataset.postLink);
    });
  }

  /* ---------- 首页彩蛋 ---------- */
  function setupHeroEgg() {
    const egg = $("#heroEgg");
    const speech = $("#eggSpeech");
    if (!egg || !speech) return;

    const messages = [
      "唔，轻一点。",
      "裂开了一点点。",
      "里面好像有东西。",
      "再敲，我可要孵出来了。",
      "好吧，今天先不孵。"
    ];
    let taps = 0;

    egg.addEventListener("click", function () {
      taps += 1;
      egg.classList.add("is-cracked");
      egg.classList.remove("is-wobbling");
      void egg.offsetWidth;
      egg.classList.add("is-wobbling");

      speech.textContent = messages[Math.min(taps - 1, messages.length - 1)];
      speech.classList.add("is-visible");

      window.clearTimeout(egg._speechTimer);
      egg._speechTimer = window.setTimeout(function () {
        speech.classList.remove("is-visible");
      }, 2400);
    });
  }

  /* ---------- 页头 / 导航 ---------- */
  function setupHeader() {
    const header = $(".site-header");
    const toggle = $(".nav-toggle");
    if (!header) return;

    function closeNav() {
      header.classList.remove("nav-open");
      document.body.classList.remove("nav-open");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    }

    if (toggle) {
      toggle.addEventListener("click", function () {
        const isOpen = header.classList.toggle("nav-open");
        document.body.classList.toggle("nav-open", isOpen);
        toggle.setAttribute("aria-expanded", String(isOpen));
      });
    }

    $$(".nav a").forEach(function (link) {
      link.addEventListener("click", closeNav);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeNav();
    });

    const desktop = window.matchMedia("(min-width: 901px)");
    const handleDesktop = function (event) {
      if (event.matches) closeNav();
    };
    if (desktop.addEventListener) {
      desktop.addEventListener("change", handleDesktop);
    }

    function onScroll() {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- 回到顶部 ---------- */
  function setupToTop() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "to-top";
    button.setAttribute("aria-label", "回到顶部");
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
    document.body.appendChild(button);

    function update() {
      button.classList.toggle("is-visible", window.scrollY > 560);
    }

    window.addEventListener("scroll", update, { passive: true });
    update();

    button.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
    });
  }

  /* ---------- 订阅表单 ---------- */
  function setupSubscribe() {
    $$("[data-subscribe-form]").forEach(function (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        showToast("已订阅，下一颗蛋破壳时再会。");
      });
    });
  }

  /* ---------- 数据统计 ---------- */
  function paintStats() {
    const postCategories = new Set(POSTS.map(function (post) { return post.category; })).size;
    const resourceCategories = new Set(RESOURCES.map(function (item) { return item.category; })).size;
    const averageRead = POSTS.length
      ? Math.round(
          POSTS.reduce(function (total, post) {
            return total + (Number(post.readTime) || 0);
          }, 0) / POSTS.length
        )
      : 0;

    [
      ["[data-stat-posts]", pad(POSTS.length)],
      ["[data-stat-resources]", pad(RESOURCES.length)],
      ["[data-stat-post-categories]", pad(postCategories)],
      ["[data-stat-resource-categories]", pad(resourceCategories)],
      ["[data-stat-avg-read]", pad(averageRead)]
    ].forEach(function (pair) {
      $$(pair[0]).forEach(function (node) {
        node.textContent = pair[1];
      });
    });
  }

  /* ---------- 启动 ---------- */
  initReveal();
  setupDialog();
  setupHeroEgg();
  setupHeader();
  setupToTop();
  setupSubscribe();

  const year = $("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());

  // 等仓库数据加载完成后再渲染博文/资源，确保所有访客看到同一份内容
  function renderContent() {
    POSTS = STORE ? STORE.getPosts() : [];
    RESOURCES = STORE ? STORE.getResources() : [];
    paintStats();
    renderHomePosts();
    renderHomeResources();
    setupBlog();
    setupResources();
  }

  if (STORE && typeof STORE.loadData === "function") {
    STORE.loadData().then(renderContent).catch(renderContent);
  } else {
    renderContent();
  }

  observeReveals();
})();
