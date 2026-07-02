import * as pdfjsLib from "./vendor/pdfjs/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.mjs";

const state = {
  books: [],
  activeBook: null,
  pdf: null,
  page: 1,
  scale: 1,
  spread: window.innerWidth > 860,
  rendering: false,
  isLocalAdmin: false,
  tocEditing: false,
  tocDraft: []
};

const els = {
  bookList: document.querySelector("#bookList"),
  emptyState: document.querySelector("#emptyState"),
  bookSearch: document.querySelector("#bookSearch"),
  bookUpload: document.querySelector("#bookUpload"),
  adminPanel: document.querySelector("#adminPanel"),
  stage: document.querySelector("#stage"),
  title: document.querySelector("#bookTitle"),
  pageStatus: document.querySelector("#pageStatus"),
  homeBtn: document.querySelector("#homeBtn"),
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  zoomOutBtn: document.querySelector("#zoomOutBtn"),
  zoomInBtn: document.querySelector("#zoomInBtn"),
  spreadBtn: document.querySelector("#spreadBtn"),
  downloadLink: document.querySelector("#downloadLink"),
  leftHit: document.querySelector("#leftHit"),
  rightHit: document.querySelector("#rightHit"),
  tocPanel: document.querySelector("#tocPanel"),
  tocList: document.querySelector("#tocList"),
  tocEditBtn: document.querySelector("#tocEditBtn"),
  tocEditForm: document.querySelector("#tocEditForm"),
  tocEditRows: document.querySelector("#tocEditRows"),
  tocAddRowBtn: document.querySelector("#tocAddRowBtn"),
  tocCancelBtn: document.querySelector("#tocCancelBtn"),
  tocSaveBtn: document.querySelector("#tocSaveBtn")
};

async function detectLocalAdmin() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const response = await fetch("/api/ping", { signal: controller.signal });
    clearTimeout(timeout);
    state.isLocalAdmin = response.ok;
  } catch {
    state.isLocalAdmin = false;
  }
  els.adminPanel.hidden = !state.isLocalAdmin;
}

async function loadBooks() {
  const response = await fetch(state.isLocalAdmin ? "/api/books" : "./manifest.json");
  const data = await response.json();
  state.books = data.books;
  renderBookList();
}

function renderBookList() {
  const query = els.bookSearch.value.trim().toLowerCase();
  const entries = state.books
    .map((book) => {
      const matchedToc = query ? (book.toc || []).filter((item) => item.title.toLowerCase().includes(query)) : [];
      const titleMatches = !query || book.title.toLowerCase().includes(query);
      return { book, matchedToc, visible: titleMatches || matchedToc.length > 0 };
    })
    .filter((entry) => entry.visible);

  els.bookList.innerHTML = "";
  els.emptyState.hidden = entries.length > 0;

  for (const { book, matchedToc } of entries) {
    const item = document.createElement("div");
    item.className = `book-item${state.activeBook?.fileName === book.fileName ? " active" : ""}`;

    const button = document.createElement("button");
    button.className = "book-item-main";
    button.type = "button";
    button.innerHTML = `<strong>${escapeHtml(book.title)}</strong>`;
    button.addEventListener("click", () => openBook(book));
    item.append(button);

    if (state.isLocalAdmin) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "book-item-delete";
      deleteBtn.type = "button";
      deleteBtn.title = "자료 삭제";
      deleteBtn.setAttribute("aria-label", "자료 삭제");
      deleteBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" /></svg>';
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteBook(book);
      });
      item.append(deleteBtn);
    }

    els.bookList.append(item);

    if (matchedToc.length) {
      const matchList = document.createElement("div");
      matchList.className = "book-toc-matches";
      for (const tocItem of matchedToc) {
        const matchBtn = document.createElement("button");
        matchBtn.type = "button";
        matchBtn.className = "book-toc-match";
        matchBtn.innerHTML = `<span class="book-toc-match-title">${escapeHtml(tocItem.title)}</span><span class="book-toc-match-page">${tocItem.page}쪽</span>`;
        matchBtn.addEventListener("click", () => openBookAtPage(book, tocItem.page));
        matchList.append(matchBtn);
      }
      els.bookList.append(matchList);
    }
  }
}

async function openBookAtPage(book, page) {
  await openBook(book);
  goToPage(page);
}

async function deleteBook(book) {
  if (!confirm(`"${book.title}" 자료를 삭제할까요?`)) return;
  const response = await fetch(`/api/books/${encodeURIComponent(book.fileName)}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    alert(data.error || "삭제에 실패했습니다.");
    return;
  }
  if (state.activeBook?.fileName === book.fileName) {
    resetStage();
  }
  await loadBooks();
}

function resetStage() {
  state.activeBook = null;
  state.pdf = null;
  state.tocEditing = false;
  els.title.textContent = "전자책을 선택하세요";
  els.pageStatus.textContent = "왼쪽 목록에서 자료를 선택하면 바로 열람할 수 있습니다.";
  els.stage.innerHTML = `
    <div class="welcome">
      <div class="welcome-icon">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5c-2-1.4-4.6-2-7-2v13c2.4 0 5 .6 7 2 2-1.4 4.6-2 7-2v-13c-2.4 0-5 .6-7 2z" /><path d="M12 6.5v13" /></svg>
      </div>
      <h2>예산정책이슈, 온라인으로 만나보세요</h2>
      <p>
        충청남도의회 예산정책담당관실이 발행하는 예산정책이슈를<br />
        온라인 전자책으로도 제공합니다.<br />
        왼쪽 목록에서 자료를 선택하면 바로 열람할 수 있고, 제목이나 목차 키워드로<br />
        원하는 내용을 검색해 바로 이동할 수도 있습니다.
      </p>
    </div>
  `;
  updateControls();
  renderToc();
  renderBookList();
}

async function openBook(book) {
  state.activeBook = book;
  state.page = 1;
  state.tocEditing = false;
  els.title.textContent = book.title;
  els.pageStatus.textContent = "불러오는 중...";
  els.downloadLink.href = book.url;
  els.downloadLink.setAttribute("download", book.fileName);
  renderBookList();
  renderToc();

  const loadingTask = pdfjsLib.getDocument({ url: book.url });
  state.pdf = await loadingTask.promise;
  await renderPages();
}

function goToPage(pageNumber) {
  if (!state.pdf) return;
  const clamped = Math.min(Math.max(1, Math.floor(pageNumber)), state.pdf.numPages);
  if (clamped === state.page) return;
  state.page = clamped;
  renderPages();
}

function renderToc() {
  const book = state.activeBook;
  const toc = book?.toc || [];
  const showPanel = state.isLocalAdmin || toc.length > 0;
  els.tocPanel.hidden = !book || !showPanel;
  els.tocEditBtn.hidden = !state.isLocalAdmin || !book;

  if (!book) return;

  if (state.tocEditing) {
    els.tocList.hidden = true;
    els.tocEditForm.hidden = false;
    els.tocEditBtn.hidden = true;
    renderTocEditRows();
    return;
  }

  els.tocList.hidden = false;
  els.tocEditForm.hidden = true;
  els.tocList.innerHTML = "";

  if (!toc.length) {
    const empty = document.createElement("p");
    empty.className = "toc-empty";
    empty.textContent = "등록된 목차가 없습니다.";
    els.tocList.append(empty);
    return;
  }

  const currentPage = state.page;
  let activeIndex = 0;
  toc.forEach((item, index) => {
    if (item.page <= currentPage) activeIndex = index;
  });

  toc.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `toc-item${index === activeIndex ? " active" : ""}`;
    button.textContent = item.title;
    button.addEventListener("click", () => goToPage(item.page));
    els.tocList.append(button);
  });
}

function renderTocEditRows() {
  els.tocEditRows.innerHTML = "";
  state.tocDraft.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "toc-edit-row";

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = "제목";
    titleInput.value = item.title;
    titleInput.addEventListener("input", () => {
      state.tocDraft[index].title = titleInput.value;
    });

    const pageInput = document.createElement("input");
    pageInput.type = "number";
    pageInput.min = "1";
    pageInput.placeholder = "쪽";
    pageInput.className = "toc-edit-page";
    pageInput.value = item.page;
    pageInput.addEventListener("input", () => {
      state.tocDraft[index].page = Number(pageInput.value) || 1;
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "toc-edit-remove";
    removeBtn.setAttribute("aria-label", "항목 삭제");
    removeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>';
    removeBtn.addEventListener("click", () => {
      state.tocDraft.splice(index, 1);
      renderTocEditRows();
    });

    row.append(titleInput, pageInput, removeBtn);
    els.tocEditRows.append(row);
  });
}

function enterTocEdit() {
  if (!state.activeBook) return;
  state.tocDraft = (state.activeBook.toc || []).map((item) => ({ ...item }));
  state.tocEditing = true;
  renderToc();
}

function cancelTocEdit() {
  state.tocEditing = false;
  renderToc();
}

async function saveToc() {
  if (!state.activeBook) return;
  const toc = state.tocDraft
    .map((item) => ({ title: item.title.trim(), page: Math.max(1, Math.floor(Number(item.page)) || 1) }))
    .filter((item) => item.title);

  const response = await fetch(`/api/books/${encodeURIComponent(state.activeBook.fileName)}/toc`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toc })
  });
  const data = await response.json();
  if (!response.ok) {
    alert(data.error || "목차 저장에 실패했습니다.");
    return;
  }
  state.activeBook = data.book;
  state.tocEditing = false;
  renderToc();
  await loadBooks();
}

async function renderPages(direction = "next") {
  if (!state.pdf || state.rendering) return;
  state.rendering = true;
  const previousPages = [...els.stage.querySelectorAll(".page")];
  previousPages.forEach((page) => page.classList.add("turning"));

  const pageNumbers = [state.page];
  if (state.spread && state.page < state.pdf.numPages) pageNumbers.push(state.page + 1);

  const canvases = [];
  for (const pageNumber of pageNumbers) {
    canvases.push(await renderPage(pageNumber));
  }

  els.stage.className = `stage ${state.spread ? "spread" : "single"}`;
  els.stage.replaceChildren(...canvases);
  requestAnimationFrame(() => {
    els.stage.querySelectorAll(".page").forEach((page) => {
      page.style.transform = direction === "prev" ? "rotateY(5deg) translateX(6px)" : "rotateY(-5deg) translateX(-6px)";
      requestAnimationFrame(() => {
        page.style.transform = "none";
      });
    });
  });

  const visibleEnd = pageNumbers[pageNumbers.length - 1];
  els.pageStatus.textContent = `${state.page}-${visibleEnd} / ${state.pdf.numPages}쪽`;
  updateControls();
  renderToc();
  state.rendering = false;
}

async function renderPage(pageNumber) {
  const page = await state.pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const stageBounds = els.stage.getBoundingClientRect();
  const maxWidth = state.spread ? (stageBounds.width - 24) / 2 : Math.min(stageBounds.width, 760);
  const maxHeight = stageBounds.height || window.innerHeight * 0.72;
  const fitScale = Math.min(maxWidth / baseViewport.width, maxHeight / baseViewport.height) * state.scale;
  const viewport = page.getViewport({ scale: fitScale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;

  canvas.className = "page";
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

function turn(delta) {
  if (!state.pdf) return;
  const step = state.spread ? 2 : 1;
  const nextPage = Math.min(Math.max(1, state.page + delta * step), state.pdf.numPages);
  if (nextPage === state.page) return;
  state.page = nextPage;
  renderPages(delta < 0 ? "prev" : "next");
}

function updateControls() {
  const hasBook = Boolean(state.pdf);
  els.prevBtn.disabled = !hasBook || state.page <= 1;
  els.nextBtn.disabled = !hasBook || state.page >= state.pdf.numPages;
  els.zoomOutBtn.disabled = !hasBook || state.scale <= 0.72;
  els.zoomInBtn.disabled = !hasBook || state.scale >= 1.7;
  els.spreadBtn.disabled = !hasBook;
  els.downloadLink.setAttribute("aria-disabled", hasBook ? "false" : "true");
}

async function uploadBook(file) {
  if (!file) return;
  const formData = new FormData();
  formData.append("book", file);
  els.pageStatus.textContent = "업로드 중...";
  const response = await fetch("/api/books", { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "업로드에 실패했습니다.");
  await loadBooks();
  if (data.book) await openBook(data.book);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

els.homeBtn.addEventListener("click", () => resetStage());
els.prevBtn.addEventListener("click", () => turn(-1));
els.nextBtn.addEventListener("click", () => turn(1));
els.leftHit.addEventListener("click", () => turn(-1));
els.rightHit.addEventListener("click", () => turn(1));
els.zoomOutBtn.addEventListener("click", () => {
  state.scale = Math.max(0.7, state.scale - 0.1);
  renderPages();
});
els.zoomInBtn.addEventListener("click", () => {
  state.scale = Math.min(1.8, state.scale + 0.1);
  renderPages();
});
els.spreadBtn.addEventListener("click", () => {
  state.spread = !state.spread;
  renderPages();
});
els.bookSearch.addEventListener("input", renderBookList);
els.tocEditBtn.addEventListener("click", enterTocEdit);
els.tocCancelBtn.addEventListener("click", cancelTocEdit);
els.tocSaveBtn.addEventListener("click", saveToc);
els.tocAddRowBtn.addEventListener("click", () => {
  state.tocDraft.push({ title: "", page: state.page || 1 });
  renderTocEditRows();
});
els.bookUpload.addEventListener("change", async (event) => {
  try {
    await uploadBook(event.target.files[0]);
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = "";
  }
});
window.addEventListener("keydown", (event) => {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (event.key === "ArrowLeft") turn(-1);
  if (event.key === "ArrowRight") turn(1);
});
window.addEventListener("resize", () => {
  if (state.pdf) renderPages();
});

updateControls();
detectLocalAdmin().finally(() => {
  loadBooks().catch((error) => {
    els.pageStatus.textContent = error.message;
  });
});
