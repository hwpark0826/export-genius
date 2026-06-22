(() => {
  const HELPER_VERSION = "v2026-06-22-persistent-record-recovery";
  const EXTENSION_VERSION = chrome.runtime?.getManifest?.().version || "";
  const LOCAL_API_VERSION = 1;
  const USE_SAVED_BUYER_SKIP_RESUME = false;
  const COLLECTION_STATE_KEY = "exportGeniusQualifiedCollectionState";
  const RECORD_NOT_FOUND_RECOVERY_KEY = "exportGeniusRecordNotFoundRecovery";
  const LOCAL_GUI_URL = "http://127.0.0.1:8765";
  const MAX_RECORD_NOT_FOUND_RECOVERY = 3;
  const HUMAN_DELAY_RANGES = Object.freeze({
    input: [220, 520],
    control: [450, 950],
    navigation: [700, 1400],
    task: [1200, 2200]
  });

  function textOf(element) {
    if (!element) {
      return "";
    }

    return (element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function humanPause(kindOrMin = "control", explicitMax = null) {
    const [minMs, maxMs] = Number.isFinite(kindOrMin)
      ? [kindOrMin, Number.isFinite(explicitMax) ? Math.max(kindOrMin, explicitMax) : kindOrMin]
      : (HUMAN_DELAY_RANGES[kindOrMin] || HUMAN_DELAY_RANGES.control);
    const duration = Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
    await sleep(duration);
    return duration;
  }

  async function waitUntil(predicate, timeoutMs = 20000, intervalMs = 300, settleMs = 0) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const value = predicate();
      if (value) {
        if (settleMs > 0) {
          await sleep(settleMs);
        }
        return value;
      }

      await sleep(intervalMs);
    }

    return null;
  }

  function visibleElement(element) {
    if (!element || isHelperElement(element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function describeElement(element) {
    const rect = element.getBoundingClientRect();

    return {
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute("type") || "",
      name: element.getAttribute("name") || "",
      id: element.id || "",
      placeholder: element.getAttribute("placeholder") || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      role: element.getAttribute("role") || "",
      text: textOf(element).slice(0, 120),
      visible: rect.width > 0 && rect.height > 0,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function isHelperElement(element) {
    return false;
  }

  function inspectPage() {
    const controls = Array.from(
      document.querySelectorAll("input, textarea, select, button, a, [role='button']")
    )
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !isHelperElement(element);
      })
      .slice(0, 120)
      .map(describeElement);

    const tables = Array.from(document.querySelectorAll("table")).map((table) => ({
      rows: table.rows.length,
      text: textOf(table).slice(0, 500)
    }));

    return {
      url: location.href,
      title: document.title,
      bodyTextSample: textOf(document.body).slice(0, 1000),
      controlCount: controls.length,
      controls,
      tableCount: tables.length,
      tables
    };
  }

  function highlightControls() {
    const elements = Array.from(
      document.querySelectorAll("input, textarea, select, button, a, [role='button']")
    ).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !isHelperElement(element);
    });

    elements.forEach((element, index) => {
      element.style.outline = "3px solid #ef4444";
      element.style.outlineOffset = "2px";
      element.dataset.exportGeniusHelperIndex = String(index + 1);
      element.title = `Export Genius Helper #${index + 1}`;
    });

    return {
      highlighted: elements.length,
      message: "蹂댁씠???낅젰李?踰꾪듉??鍮④컙 ?쒖떆瑜??덉뒿?덈떎."
    };
  }

  function testFillFirstInput() {
    const input = Array.from(document.querySelectorAll("input:not([type='hidden']), textarea"))
      .find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !element.disabled && !element.readOnly && !isHelperElement(element);
      });

    if (!input) {
      return { ok: false, message: "입력 가능한 input/textarea를 찾지 못했습니다." };
    }

    input.focus();
    input.value = "test";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    return {
      ok: true,
      message: "泥?踰덉㎏ ?낅젰 媛?ν븳 ?꾨뱶??test瑜??낅젰?덉뒿?덈떎.",
      element: describeElement(input)
    };
  }

  function dispatchValue(element, value) {
    element.focus();
    const setter = Object.getOwnPropertyDescriptor(element.__proto__, "value")?.set;
    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function normalizeText(value) {
    return Array.from(String(value || "").toLowerCase())
      .filter((character) => /[a-z0-9]/.test(character))
      .join("");
  }

  function matchesExactText(element, expectedTexts) {
    const text = textOf(element).trim();
    const normalized = normalizeText(text);

    return expectedTexts.some((expected) => {
      const expectedNormalized = normalizeText(expected);
      return text.toLowerCase() === expected.toLowerCase() || normalized === expectedNormalized;
    });
  }

  function findVisibleByText(texts, options = {}) {
    const lowered = texts.map((text) => text.toLowerCase());
    return Array.from(document.querySelectorAll("button, div, span, li, a, [role='option'], [role='button']"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = textOf(element).toLowerCase();
        const normalized = normalizeText(text);
        const isReasonableSize = rect.width > 0 && rect.height > 0 && rect.width <= 700 && rect.height <= 120;
        const matches = options.exact
          ? lowered.some((target) => text === target)
          : lowered.some((target) => text === target || text.includes(target) || normalized.includes(normalizeText(target)));
        return isReasonableSize && matches;
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        const aText = textOf(a).toLowerCase();
        const bText = textOf(b).toLowerCase();
        const aExact = lowered.some((target) => aText === target) ? 0 : 1;
        const bExact = lowered.some((target) => bText === target) ? 0 : 1;

        if (aExact !== bExact) {
          return aExact - bExact;
        }

        return aRect.width * aRect.height - bRect.width * bRect.height;
      })[0] || null;
  }

  function visibleTextCandidates(texts) {
    const lowered = texts.map((text) => text.toLowerCase());
    return Array.from(document.querySelectorAll("button, div, span, li, a, [role='option'], [role='button']"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = textOf(element).toLowerCase();
        return rect.width > 0 && rect.height > 0 && rect.width <= 700 && rect.height <= 160 &&
          lowered.some((target) => text.includes(target));
      })
      .slice(0, 12)
      .map(describeElement);
  }

  function compareDocumentOrder(a, b) {
    if (a === b) {
      return 0;
    }

    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  }

  function findDropdownInputNear(trigger) {
    const triggerRect = trigger.getBoundingClientRect();
    const active = document.activeElement;

    if (active && ["INPUT", "TEXTAREA"].includes(active.tagName) && !isHelperElement(active)) {
      const rect = active.getBoundingClientRect();
      const overlapsX = rect.left < triggerRect.right + 60 && rect.right > triggerRect.left - 60;
      const isNearDropdown = rect.top >= triggerRect.top - 20 && rect.top <= triggerRect.bottom + 500;

      if (rect.width > 0 && rect.height > 0 && overlapsX && isNearDropdown) {
        return active;
      }
    }

    return Array.from(document.querySelectorAll("input:not([type='hidden']), textarea"))
      .find((element) => {
        if (isHelperElement(element) || element.disabled || element.readOnly) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const overlapsX = rect.left < triggerRect.right + 60 && rect.right > triggerRect.left - 60;
        const isNearDropdown = rect.top >= triggerRect.top - 20 && rect.top <= triggerRect.bottom + 500;

        return rect.width > 0 && rect.height > 0 && overlapsX && isNearDropdown;
      });
  }

  async function chooseSelectByInputId(inputId, optionTexts, searchText) {
    const input = document.getElementById(inputId);

    if (!input) {
      return {
        ok: false,
        reason: `${inputId} input not found`
      };
    }

    input.scrollIntoView({ block: "center", inline: "center" });
    input.focus();
    clickAt(input, 0.5);
    await humanPause(200, 500);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
    await humanPause(700, 1200);

    let option = findOptionNearInput(input, optionTexts);
    let usedSearch = false;

    if (!option && searchText) {
      dispatchValue(input, searchText);
      usedSearch = true;
      await humanPause(700, 1200);
      option = findOptionNearInput(input, optionTexts);
    }

    if (!option) {
      return {
        ok: false,
        reason: `option not found: ${optionTexts.join(", ")}`,
        input: describeElement(input),
        candidates: visibleTextCandidates(optionTexts)
      };
    }

    await humanPause("control");
    clickElement(option);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    closeOpenMenus();
    await humanPause(400, 800);

    return {
      ok: true,
      usedSearch,
      input: describeElement(input),
      option: describeElement(option)
    };
  }

  function getTopFilterCombobox(kind) {
    const expected = kind === "condition" ? "selectcondition" : "selectfilter";
    const containers = Array.from(document.querySelectorAll(".filter-select, .select-filter-condition, .ant-select"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const text = normalizeText(textOf(element) || element.getAttribute("aria-label") || "");
        const inputText = normalizeText(Array.from(element.querySelectorAll("input"))
          .map((input) => input.getAttribute("placeholder") || input.value || "")
          .join(" "));

        return visibleElement(element) && (text.includes(expected) || inputText.includes(expected));
      })
      .sort(compareDocumentOrder);

    const container = containers[0];
    return container?.querySelector("input[role='combobox'], input[type='search']") || null;
  }

  function getTopFilterTrigger(kind) {
    const labelText = kind === "condition" ? "select condition" : "select filter";
    const expected = normalizeText(labelText);
    const container = Array.from(document.querySelectorAll(".filter-select, .select-filter-condition, .ant-select"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const text = normalizeText(textOf(element) || element.getAttribute("placeholder") || "");
        const inputText = normalizeText(Array.from(element.querySelectorAll("input"))
          .map((input) => input.getAttribute("placeholder") || input.value || "")
          .join(" "));
        return visibleElement(element) && (text.includes(expected) || inputText.includes(expected));
      })
      .sort(compareDocumentOrder)[0];

    if (container) {
      return container.querySelector(".ant-select-selector, [role='combobox']") || container;
    }

    const input = getTopFilterCombobox(kind);
    if (!input) {
      return null;
    }

    let best = input;
    let current = input;
    for (let index = 0; index < 5 && current.parentElement; index += 1) {
      current = current.parentElement;
      const rect = current.getBoundingClientRect();
      if (
        rect.width >= 120 &&
        rect.width <= 260 &&
        rect.height >= 32 &&
        rect.height <= 90
      ) {
        best = current;
      }
    }

    return best;
  }

  function findOptionNearTrigger(trigger, optionTexts, anchorRect = null) {
    const triggerRect = anchorRect || trigger.getBoundingClientRect();

    return Array.from(document.querySelectorAll("button, div, span, li, a, [role='option'], [role='button']"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const role = element.getAttribute("role") || "";
        const nearX = rect.left >= triggerRect.left - 120 && rect.left <= triggerRect.right + 260;
        const belowInput = rect.top >= triggerRect.bottom - 10 && rect.top <= triggerRect.bottom + 230;
        const isTableHeader = role === "columnheader" || element.closest("table, thead");
        return rect.width > 0 && rect.height > 0 && nearX && belowInput && !isTableHeader && matchesExactText(element, optionTexts);
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.top - bRect.top || aRect.left - bRect.left;
      })[0] || null;
  }

  async function chooseTopFilterSelect(kind, optionTexts) {
    const antResult = await chooseAntdTopFilterSelect(kind, optionTexts);
    if (antResult.ok) {
      return antResult;
    }

    const trigger = getTopFilterTrigger(kind);

    if (!trigger) {
      return {
        ok: false,
        reason: `${kind} dropdown trigger not found`
      };
    }

    trigger.scrollIntoView({ block: "center", inline: "center" });
    closeOpenMenus();
    await humanPause(200, 500);

    clickElement(trigger);
    await humanPause(700, 1200);

    const option = findOptionNearTrigger(trigger, optionTexts);

    if (!option) {
      return {
        ok: false,
        reason: `option not found near ${kind}: ${optionTexts.join(", ")}`,
        trigger: describeElement(trigger),
        candidates: Array.from(document.querySelectorAll("button, div, span, li, a, [role='option'], [role='button']"))
          .filter((element) => {
            if (isHelperElement(element)) {
              return false;
            }

            const rect = element.getBoundingClientRect();
            const role = element.getAttribute("role") || "";
            return rect.width > 0 && rect.height > 0 &&
              rect.left >= trigger.getBoundingClientRect().left - 120 &&
              rect.left <= trigger.getBoundingClientRect().right + 260 &&
              rect.top >= trigger.getBoundingClientRect().bottom - 10 &&
              rect.top <= trigger.getBoundingClientRect().bottom + 230 &&
              role !== "columnheader";
          })
          .slice(0, 20)
          .map(describeElement)
      };
    }

    await humanPause("control");
    clickElement(option);
    closeOpenMenus();
    await humanPause(400, 800);

    return {
      ok: true,
      trigger: describeElement(trigger),
      option: describeElement(option)
    };
  }

  function getAntdTopFilterContainer(kind) {
    const selector = kind === "condition"
      ? ".select-filter-condition"
      : ".filter-select";
    const expected = kind === "condition" ? "selectcondition" : "selectfilter";

    return Array.from(document.querySelectorAll(selector))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const text = normalizeText(textOf(element) || "");
        const inputText = normalizeText(Array.from(element.querySelectorAll("input"))
          .map((input) => input.getAttribute("placeholder") || input.value || "")
          .join(" "));

        return visibleElement(element) && (text.includes(expected) || inputText.includes(expected) || element.matches(selector));
      })
      .sort(compareDocumentOrder)[0] || null;
  }

  function findAntdOption(optionTexts) {
    return Array.from(document.querySelectorAll(".ant-select-item-option, [role='option']"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const disabled = element.getAttribute("aria-disabled") === "true" ||
          element.classList.contains("ant-select-item-option-disabled");
        return rect.width > 0 && rect.height > 0 && !disabled && matchesExactText(element, optionTexts);
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.top - bRect.top || aRect.left - bRect.left;
      })[0] || null;
  }

  async function openAntdSelect(selector, searchInput = null) {
    selector.scrollIntoView({ block: "center", inline: "nearest" });
    selector.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    selector.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    selector.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    selector.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    selector.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    selector.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    selector.click();

    if (searchInput) {
      searchInput.focus();
      searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
    }

    await humanPause(500, 900);
  }

  async function chooseAntdTopFilterSelect(kind, optionTexts) {
    const container = getAntdTopFilterContainer(kind);

    if (!container) {
      return {
        ok: false,
        reason: `${kind} AntD container not found`
      };
    }

    const selector = container.querySelector(".ant-select-selector") || container;
    const searchInput = container.querySelector("input[role='combobox']");

    closeOpenMenus();
    await humanPause(150, 400);
    await openAntdSelect(selector, searchInput);

    let option = findAntdOption(optionTexts);
    let usedSearch = false;

    if (!option && searchInput) {
      dispatchValue(searchInput, "");
      await humanPause(200, 500);
      dispatchValue(searchInput, optionTexts[0]);
      searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
      usedSearch = true;
      await humanPause(700, 1200);
      option = findAntdOption(optionTexts);
    }

    if (!option) {
      closeOpenMenus();
      await humanPause(250, 550);
      await openAntdSelect(selector, searchInput);
      option = findAntdOption(optionTexts);
    }

    if (!option) {
      return {
        ok: false,
        reason: `${kind} AntD option not found: ${optionTexts.join(", ")}`,
        container: describeElement(container),
        candidates: Array.from(document.querySelectorAll(".ant-select-item-option, [role='option']"))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .slice(0, 20)
          .map(describeElement)
      };
    }

    await humanPause("control");
    clickElement(option);
    closeOpenMenus();
    await humanPause(400, 800);

    return {
      ok: true,
      method: "antd",
      usedSearch,
      container: describeElement(container),
      option: describeElement(option)
    };
  }

  function findDropdownTrigger(labelText) {
    const lowered = labelText.toLowerCase();
    const candidates = Array.from(document.querySelectorAll("button, div, span, input, [role='button'], [class*='select'], [class*='control']"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = textOf(element).toLowerCase();
        const placeholder = (element.getAttribute("placeholder") || "").toLowerCase();
        const isDropdownSize = rect.width >= 120 && rect.width <= 700 && rect.height >= 24 && rect.height <= 100;
        return isDropdownSize && (text.includes(lowered) || placeholder.includes(lowered));
      });

    if (!candidates.length) {
      return null;
    }

    return candidates
      .map((element) => {
        let best = element;
        let current = element;

        for (let index = 0; index < 4 && current.parentElement; index += 1) {
          current = current.parentElement;
          const rect = current.getBoundingClientRect();
          const text = textOf(current).toLowerCase();

          const isDropdownSize = rect.width >= 120 && rect.width <= 700 && rect.height >= 24 && rect.height <= 100;
          if (isDropdownSize && rect.width >= best.getBoundingClientRect().width && text.includes(lowered)) {
            best = current;
          }
        }

        return best;
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return bRect.width - aRect.width;
      })[0];
  }

  function clickElement(element) {
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    element.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, clientX: x, clientY: y }));
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: x, clientY: y }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y }));
    element.click();
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y }));
  }

  function installSameTabWindowOpenOverride() {
    if (document.documentElement.dataset.exportGeniusSameTabOpen === "true") {
      return;
    }

    document.documentElement.dataset.exportGeniusSameTabOpen = "true";

    const script = document.createElement("script");
    script.textContent = `
      (() => {
        if (window.__exportGeniusOriginalOpen) return;
        window.__exportGeniusOriginalOpen = window.open;
        window.open = function(url) {
          if (typeof url === "string" && url) {
            window.location.href = url;
          }
          return null;
        };
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();
  }

  function openElementInSameTab(element) {
    const row = element.closest(".G-table-row, [role='row'], tr");
    const anchor = element.closest("a[href]") ||
      element.querySelector?.("a[href]") ||
      row?.querySelector("a[href*='company-profile'], a[href]");

    if (anchor?.href) {
      anchor.removeAttribute("target");
      anchor.setAttribute("target", "_self");
      clickElement(anchor);
      return {
        usedHref: true,
        href: anchor.href,
        mode: "native-anchor-click"
      };
    }

    installSameTabWindowOpenOverride();
    element.removeAttribute?.("target");
    clickElement(element);

    return {
      usedHref: false,
      mode: "element-click"
    };
  }

  function clickAt(element, horizontalRatio = 0.5) {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width * horizontalRatio;
    const y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y) || element;

    target.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, clientX: x, clientY: y }));
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y }));
    target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
  }

  function closeOpenMenus() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true }));
  }

  function findStrictOption(optionTexts) {
    return Array.from(document.querySelectorAll("button, div, span, li, a, [role='option'], [role='button']"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.width <= 900 && rect.height <= 140;
      })
      .filter((element) => matchesExactText(element, optionTexts))
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.width * aRect.height - bRect.width * bRect.height;
      })[0] || null;
  }

  async function waitForTriggerText(trigger, expectedTexts) {
    for (let index = 0; index < 20; index += 1) {
      if (matchesExactText(trigger, expectedTexts) || expectedTexts.some((text) => textOf(trigger).toLowerCase().includes(text.toLowerCase()))) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return false;
  }

  async function waitForSearchButton() {
    for (let index = 0; index < 30; index += 1) {
      const button = Array.from(document.querySelectorAll("button, [role='button']"))
        .filter((element) => {
          if (isHelperElement(element)) {
            return false;
          }

          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && textOf(element).trim().toLowerCase() === "search";
        })
        .find((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true");

      if (button) {
        return button;
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return null;
  }

  function findExactControl(text, selector = "button, a, [role='button']") {
    return Array.from(document.querySelectorAll(selector))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .find((element) => normalizeText(textOf(element)) === normalizeText(text)) || null;
  }

  function clickExactControl(text, selector = "button, a, [role='button']") {
    const target = findExactControl(text, selector);

    if (!target) {
      return {
        ok: false,
        reason: `${text} not found`
      };
    }

    clickElement(target);

    return {
      ok: true,
      clicked: describeElement(target)
    };
  }

  function appliedFilterCount() {
    const counts = Array.from(document.querySelectorAll("div, span, p, strong"))
      .filter((element) => !isHelperElement(element) && !isResultsTableElement(element))
      .map((element) => normalizeText(textOf(element)).match(/^(\d+)filters?(?:clearall)?$/))
      .filter(Boolean)
      .map((match) => Number.parseInt(match[1], 10))
      .filter(Number.isFinite);

    return counts.length ? Math.max(...counts) : null;
  }

  function findClearAllCriteriaControl() {
    const candidates = Array.from(document.querySelectorAll("button, a, [role='button'], span, p, div"))
      .filter((element) => {
        if (!visibleElement(element) || isResultsTableElement(element)) {
          return false;
        }

        return normalizeText(textOf(element)) === "clearall";
      })
      .map((element) => element.closest("button, a, [role='button']") || element)
      .filter((element, index, items) => items.indexOf(element) === index);

    return candidates.sort((a, b) => {
      const aClickable = a.matches("button, a, [role='button']") ? 1 : 0;
      const bClickable = b.matches("button, a, [role='button']") ? 1 : 0;
      return bClickable - aClickable;
    })[0] || null;
  }

  async function clearAllAppliedCriteria() {
    closeOpenMenus();
    document.body.click();
    await humanPause(350, 700);

    const beforeCount = appliedFilterCount();
    const control = findClearAllCriteriaControl();

    if (!control) {
      return beforeCount && beforeCount > 0
        ? {
            ok: false,
            reason: `Clear All control not found while ${beforeCount} filters are applied.`,
            beforeCount
          }
        : {
            ok: true,
            alreadyClear: true,
            beforeCount: beforeCount || 0
          };
    }

    const clicked = describeElement(control);
    await humanPause("control");
    clickElement(control);

    const cleared = await waitUntil(() => {
      const count = appliedFilterCount();
      const remainingControl = findClearAllCriteriaControl();
      return count === 0 || (count === null && !remainingControl)
        ? {
            count: count || 0,
            clearAllVisible: Boolean(remainingControl)
          }
        : null;
    }, 12000, 350, 500);

    return {
      ok: Boolean(cleared),
      reason: cleared ? "" : "Applied filters did not clear after clicking Clear All.",
      beforeCount,
      clicked,
      after: cleared || {
        count: appliedFilterCount(),
        clearAllVisible: Boolean(findClearAllCriteriaControl())
      }
    };
  }

  function canonicalCriteriaNumber(value) {
    const cleaned = String(value ?? "").replace(/,/g, "").trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : cleaned.replace(/\D/g, "");
  }

  function appliedCriteriaTextSnapshot() {
    const texts = Array.from(document.querySelectorAll("div, span, p, label, strong"))
      .filter((element) => {
        if (!visibleElement(element) || isResultsTableElement(element)) {
          return false;
        }

        const text = normalizeText(textOf(element));
        return text.length <= 300 && (text.includes("hscode") || text.includes("totalvalueusd"));
      })
      .map((element) => textOf(element))
      .filter(Boolean);

    return Array.from(new Set(texts)).sort((a, b) => a.length - b.length);
  }

  function inspectAppliedCriteria(options) {
    const hsCode = canonicalCriteriaNumber(options.hsCode);
    const minValue = canonicalCriteriaNumber(options.minValue);
    const maxValue = canonicalCriteriaNumber(options.maxValue);
    const expectedRange = options.dateRange || getLastOneYearRange();
    const startInput = document.querySelector("input[placeholder='Start date']");
    const endInput = document.querySelector("input[placeholder='End date']");
    const criteriaTexts = appliedCriteriaTextSnapshot();
    const normalizedTexts = criteriaTexts.map(normalizeText);
    const expectedHsText = `hscodebeginwith${hsCode}`;
    const expectedUsdText = `totalvalueusdisbetween${minValue}${maxValue}`;
    const hsMatches = normalizedTexts.filter((text) => text.includes(expectedHsText));
    const usdMatches = normalizedTexts.filter((text) => text.includes(expectedUsdText));
    const filterCount = appliedFilterCount();
    const datesMatch = Boolean(
      startInput && endInput &&
      startInput.value === expectedRange.start &&
      endInput.value === expectedRange.end
    );

    const checks = {
      exactFilterCount: filterCount === 2,
      hsCode: hsMatches.length > 0,
      totalValueUsd: usdMatches.length > 0,
      dates: datesMatch
    };

    return {
      ok: Object.values(checks).every(Boolean),
      checks,
      expected: {
        hsCode,
        minValue,
        maxValue,
        filterCount: 2,
        dateRange: expectedRange
      },
      actual: {
        filterCount,
        startDate: startInput?.value || "",
        endDate: endInput?.value || "",
        criteriaTexts
      }
    };
  }

  async function verifyAppliedCriteria(options, timeoutMs = 12000) {
    const verified = await waitUntil(() => {
      const snapshot = inspectAppliedCriteria(options);
      return snapshot.ok ? snapshot : null;
    }, timeoutMs, 400, 500);

    return verified || inspectAppliedCriteria(options);
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDate(value) {
    const [day, month, year] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function getLastOneYearRange() {
    const match = textOf(document.body).match(/Data Available\s+\d{2}-\d{2}-\d{4}\s*-\s*(\d{2}-\d{2}-\d{4})/i);
    const end = match ? parseDate(match[1]) : new Date();
    const start = new Date(end);

    start.setFullYear(start.getFullYear() - 1);
    start.setDate(start.getDate() + 1);

    return {
      start: formatDate(start),
      end: formatDate(end)
    };
  }

  async function setLastOneYearDates() {
    const startInput = document.querySelector("input[placeholder='Start date']");
    const endInput = document.querySelector("input[placeholder='End date']");
    const range = getLastOneYearRange();

    if (!startInput || !endInput) {
      return {
        ok: false,
        reason: "date inputs not found",
        range
      };
    }

    dispatchValue(startInput, range.start);
    await humanPause("input");
    dispatchValue(endInput, range.end);
    await humanPause("input");

    return {
      ok: true,
      range
    };
  }

  async function applyHsCodeFilter(hsCode) {
    if (!hsCode) {
      return {
        ok: false,
        reason: "hs code is empty"
      };
    }

    closeOpenMenus();
    document.body.click();
    await humanPause(2000, 3000);

    const filterResult = await chooseTopFilterSelect("filter", ["hs code", "hscode"]);
    await humanPause(2000, 3000);
    const conditionResult = await chooseTopFilterSelect("condition", ["begin with"]);
    await humanPause(2000, 3000);
    const detailInput = document.getElementById("enter-detail-input") ||
      Array.from(document.querySelectorAll("input")).find((element) => element.placeholder === "Enter details");

    if (!detailInput) {
      return {
        ok: false,
        filter: filterResult,
        condition: conditionResult,
        reason: "Enter details input not found"
      };
    }

    dispatchValue(detailInput, hsCode);
    await humanPause(700, 1200);

    await humanPause("control");
    const filterButton = clickExactControl("Filter", "button, [role='button']");
    await humanPause(700, 1200);

    return {
      ok: filterResult.ok && conditionResult.ok && filterButton.ok,
      filter: filterResult,
      condition: conditionResult,
      details: describeElement(detailInput),
      filterButton
    };
  }

  function isResultsTableElement(element) {
    return Boolean(element?.closest(
      "table, thead, tbody, tr, th, td, .ant-table, .ant-table-wrapper, [role='table'], [role='row'], [role='columnheader'], [role='cell']"
    ));
  }

  function compactTextElement(element, maxHeight = 180, maxTextLength = 500) {
    if (!element || isHelperElement(element) || isResultsTableElement(element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const text = normalizeText(textOf(element));
    return rect.width > 0 && rect.height > 0 && rect.height <= maxHeight && text.length <= maxTextLength;
  }

  function findTotalValueFilterPanel() {
    return Array.from(document.querySelectorAll("aside, section, form, div"))
      .filter((element) => {
        if (isHelperElement(element) || isResultsTableElement(element) || element.id === "root") {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = normalizeText(textOf(element));
        return rect.width > 0 && rect.height > 0 &&
          rect.height <= Math.max(900, window.innerHeight) &&
          text.includes("totalvalueusd") &&
          (
            text.includes("filters") ||
            text.includes("modifyyourdata") ||
            element.querySelector("button, [role='button'], input")
          );
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.width * aRect.height - bRect.width * bRect.height;
      })[0] || null;
  }

  function findTotalValueFilterLabel(panel) {
    const scope = panel || document;
    return Array.from(scope.querySelectorAll("div, span, button, p, label"))
      .filter((element) => {
        const text = normalizeText(textOf(element));
        return compactTextElement(element, 140, 320) && text.includes("totalvalueusd");
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        const aArea = aRect.width * aRect.height;
        const bArea = bRect.width * bRect.height;
        return aArea - bArea || compareDocumentOrder(a, b);
      })[0] || null;
  }

  function findCompactFilterRow(label) {
    let row = label;
    for (let index = 0; index < 6 && row?.parentElement; index += 1) {
      const parent = row.parentElement;
      const text = normalizeText(textOf(parent));
      if (compactTextElement(parent, 180, 700) && text.includes("totalvalueusd")) {
        row = parent;
      }
    }

    return row;
  }

  function findTotalValueCollapseItem(label) {
    const item = label?.closest(".ant-collapse-item");

    if (item && !isResultsTableElement(item)) {
      return item;
    }

    return Array.from(document.querySelectorAll(".ant-collapse-item"))
      .filter((element) => {
        const header = element.querySelector(".ant-collapse-header, [role='tab'], .ant-collapse-header-text") || element;
        const text = normalizeText(textOf(header));
        return !isResultsTableElement(element) && text.includes("totalvalueusd");
      })
      .sort(compareDocumentOrder)[0] || null;
  }

  async function applyTotalValueRangeFromCollapse(label, minValue, maxValue) {
    const item = findTotalValueCollapseItem(label);

    if (!item) {
      return null;
    }

    const header = item.querySelector(".ant-collapse-header, [role='tab'], .ant-collapse-header-text");
    const findInputs = () => Array.from(item.querySelectorAll("input.input-range[type='number'], input[type='number']"))
      .filter((element) => !element.disabled && !element.readOnly && !isResultsTableElement(element))
      .slice(0, 2);

    let inputs = findInputs();
    if (header && inputs.length < 2) {
      await humanPause("control");
      clickElement(header);
      await humanPause(700, 1200);
      inputs = findInputs();
    }

    if (inputs.length < 2) {
      return {
        ok: false,
        reason: "Total Value USD collapse inputs not found",
        item: describeElement(item),
        header: header ? describeElement(header) : null,
        content: item.querySelector(".ant-collapse-content") ? describeElement(item.querySelector(".ant-collapse-content")) : null,
        inputs: Array.from(item.querySelectorAll("input")).map(describeElement)
      };
    }

    dispatchValue(inputs[0], minValue);
    await humanPause("input");
    dispatchValue(inputs[1], maxValue);
    await humanPause(250, 550);

    const addButton = Array.from(item.querySelectorAll("button, [role='button']"))
      .filter((element) => visibleElement(element) && normalizeText(textOf(element)) === "add")
      .sort(compareDocumentOrder)[0] || null;

    if (!addButton) {
      return {
        ok: false,
        reason: "Total Value USD collapse Add button not found",
        item: describeElement(item),
        inputs: inputs.map(describeElement),
        buttons: Array.from(item.querySelectorAll("button, [role='button']"))
          .filter(visibleElement)
          .map(describeElement)
      };
    }

    await humanPause("control");
    clickElement(addButton);
    const resultsStable = await waitForResultsStable(12000);

    return {
      ok: true,
      method: "collapse",
      min: minValue,
      max: maxValue,
      item: describeElement(item),
      inputs: inputs.map(describeElement),
      addButton: describeElement(addButton),
      resultsStable
    };
  }

  async function applyTotalValueRange(minValue, maxValue) {
    const existingApplied = Array.from(document.querySelectorAll("div, span, p"))
      .find((element) => {
        const text = normalizeText(textOf(element));
        return compactTextElement(element, 180, 500) &&
          text.includes("totalvalueusd") &&
          text.includes(String(minValue).replace(/\D/g, "")) &&
          text.includes(String(maxValue).replace(/\D/g, ""));
      });

    if (existingApplied) {
      return {
        ok: true,
        alreadyApplied: true,
        row: describeElement(existingApplied)
      };
    }

    const modify = findVisibleByText(["modify your data"]);
    if (modify) {
      await humanPause("control");
      clickElement(modify);
      await humanPause(700, 1200);
    }

    const panel = findTotalValueFilterPanel();
    const label = findTotalValueFilterLabel(panel) || findTotalValueFilterLabel(document);

    if (!label) {
      return {
        ok: false,
        reason: "Total Value USD filter not found",
        panel: panel ? describeElement(panel) : null,
        tableHeaders: Array.from(document.querySelectorAll("[role='columnheader'], th"))
          .filter((element) => normalizeText(textOf(element)).includes("totalvalueusd"))
          .slice(0, 5)
          .map(describeElement)
      };
    }

    label.scrollIntoView({ block: "center", inline: "nearest" });
    await humanPause(300, 650);

    const collapseResult = await applyTotalValueRangeFromCollapse(label, minValue, maxValue);
    if (collapseResult) {
      return collapseResult;
    }

    const row = findCompactFilterRow(label);

    const rowRect = row.getBoundingClientRect();
    const plus = Array.from(row.querySelectorAll("button, span, div, [role='button']"))
      .filter((element) => {
        if (isHelperElement(element) || isResultsTableElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = textOf(element).trim();
        const aria = normalizeText(element.getAttribute("aria-label") || "");
        const title = normalizeText(element.getAttribute("title") || "");
        const className = normalizeText(String(element.className || ""));
        const looksInteractive = element.matches("button, [role='button']") ||
          element.closest("button, [role='button']") ||
          className.includes("add") ||
          className.includes("plus");
        const looksLikeBlankIcon = !text && looksInteractive && rect.width <= 80 && rect.height <= 80;
        return rect.width > 0 && rect.height > 0 &&
          !aria.includes("delete") &&
          !title.includes("delete") &&
          !className.includes("delete") &&
          (text === "+" || normalizeText(text).includes("add") || aria.includes("add") || title.includes("add") || looksLikeBlankIcon);
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        const aDistance = Math.abs(aRect.top - rowRect.top);
        const bDistance = Math.abs(bRect.top - rowRect.top);
        return aDistance - bDistance || bRect.left - aRect.left;
      })[0];

    if (!plus) {
      return {
        ok: false,
        reason: "Total Value USD add control not found",
        label: describeElement(label),
        row: describeElement(row),
        panel: panel ? describeElement(panel) : null,
        rowControls: Array.from(row.querySelectorAll("button, span, div, [role='button']"))
          .filter((element) => !isHelperElement(element) && !isResultsTableElement(element) && visibleElement(element))
          .slice(0, 20)
          .map(describeElement)
      };
    }

    await humanPause("control");
    clickElement(plus);
    await humanPause(800, 1400);

    const findTotalValueInputs = () => {
      const expandedRect = row.getBoundingClientRect();
      return Array.from(document.querySelectorAll("input"))
        .filter((element) => {
          if (isHelperElement(element) || isResultsTableElement(element) || element.disabled || element.readOnly) {
            return false;
          }

          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 &&
            rect.top > expandedRect.top - 20 &&
            rect.top < expandedRect.top + 420;
        })
        .sort((a, b) => {
          const aRect = a.getBoundingClientRect();
          const bRect = b.getBoundingClientRect();
          return aRect.top - bRect.top || aRect.left - bRect.left;
        })
        .slice(0, 2);
    };

    const inputs = await waitUntil(() => {
      const found = findTotalValueInputs();
      return found.length >= 2 ? found : null;
    }, 6000, 300, 300) || [];

    if (inputs.length < 2) {
      return {
        ok: false,
        reason: "Total Value USD min/max inputs not found",
        label: describeElement(label),
        row: describeElement(row),
        plus: plus ? describeElement(plus) : null,
        panel: panel ? describeElement(panel) : null,
        nearbyInputs: Array.from(document.querySelectorAll("input"))
          .filter((element) => !isHelperElement(element) && !isResultsTableElement(element))
          .slice(0, 20)
          .map(describeElement)
      };
    }

    dispatchValue(inputs[0], minValue);
    await humanPause("input");
    dispatchValue(inputs[1], maxValue);
    await humanPause(300, 650);

    const addButton = Array.from(document.querySelectorAll("button, [role='button']"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && normalizeText(textOf(element)) === "add";
      })[0];

    if (!addButton) {
      return {
        ok: false,
        reason: "Total Value USD Add button not found",
        inputs: inputs.map(describeElement)
      };
    }

    await humanPause("control");
    clickElement(addButton);
    const resultsStable = await waitForResultsStable(12000);

    return {
      ok: true,
      min: minValue,
      max: maxValue,
      inputs: inputs.map(describeElement),
      addButton: describeElement(addButton),
      resultsStable
    };
  }

  async function enableRemoveUnknownExporter() {
    const header = Array.from(document.querySelectorAll("p.header-filler, p, div"))
      .find((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const text = normalizeText(textOf(element)).replace(/[^a-z0-9]/gi, "");
        return text.includes("removeunknownexporter") && text.includes("supplier");
      });
    const headerFiller = header?.closest(".radio-filler");
    const filler = headerFiller || Array.from(document.querySelectorAll(".radio-filler, div"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = normalizeText(textOf(element)).replace(/[^a-z0-9]/gi, "");
        return rect.width > 0 && rect.height > 0 &&
          text.includes("removeunknownexporter") &&
          text.includes("supplier");
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.width * aRect.height - bRect.width * bRect.height;
      })[0];

    const directCheckbox = filler?.querySelector("input[type='checkbox']");

    if (directCheckbox) {
      const switchLabel = directCheckbox.closest("label") || filler;
      const slider = switchLabel.querySelector(".slider") || switchLabel;
      switchLabel.scrollIntoView({ block: "center", inline: "nearest" });
      await humanPause(200, 500);

      if (!directCheckbox.checked) {
        await humanPause("control");
        clickElement(slider);
        await humanPause(200, 500);
      }

      if (!directCheckbox.checked) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
        if (setter) {
          setter.call(directCheckbox, true);
        } else {
          directCheckbox.checked = true;
        }
        directCheckbox.dispatchEvent(new Event("input", { bubbles: true }));
        directCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      }

      const resultsStable = await waitForResultsStable(12000);

      return {
        ok: true,
        method: "checkbox",
        checked: directCheckbox.checked,
        control: describeElement(directCheckbox),
        switchLabel: describeElement(switchLabel),
        slider: describeElement(slider),
        resultsStable
      };
    }

    const modify = findVisibleByText(["modify your data"]);
    if (modify) {
      await humanPause("control");
      clickElement(modify);
      await humanPause(500, 900);
    }

    const label = findVisibleByText(["remove unknown exporter", "unknown exporter"]);
    if (!label) {
      return {
        ok: false,
        reason: "remove unknown exporter control not found"
      };
    }

    label.scrollIntoView({ block: "center", inline: "nearest" });
    await humanPause(300, 650);

    const labelRect = label.getBoundingClientRect();
    const checkbox = Array.from(document.querySelectorAll("input[type='checkbox'], input[type='radio'], [role='checkbox'], [role='switch']"))
      .find((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const nearX = rect.left >= labelRect.left - 80 && rect.left <= labelRect.right + 80;
        const nearY = Math.abs((rect.top + rect.height / 2) - (labelRect.top + labelRect.height / 2)) < 40;
        return rect.width > 0 && rect.height > 0 && nearX && nearY;
      });

    if (checkbox) {
      const alreadyChecked = checkbox.checked || checkbox.getAttribute("aria-checked") === "true";
      if (!alreadyChecked) {
        await humanPause("control");
        clickElement(checkbox);
      }

      const resultsStable = await waitForResultsStable(12000);

      return {
        ok: true,
        alreadyChecked,
        control: describeElement(checkbox),
        resultsStable
      };
    }

    const switchTarget = label.closest("label, .radio-filler, .ant-switch, [role='switch']")?.querySelector(
      "input[type='checkbox'], input[type='radio'], [role='checkbox'], [role='switch'], .slider, .ant-switch"
    ) || label.closest("label, .radio-filler, .ant-switch, [role='switch']");

    if (switchTarget) {
      await humanPause("control");
      clickElement(switchTarget);

      const resultsStable = await waitForResultsStable(12000);

      return {
        ok: true,
        clickedSwitch: describeElement(switchTarget),
        resultsStable
      };
    }

    await humanPause("control");
    clickElement(label);
    const resultsStable = await waitForResultsStable(12000);

    return {
      ok: true,
      clickedLabel: describeElement(label),
      resultsStable
    };
  }

  async function selectImportersTab() {
    const result = clickExactControl("Importers", "button, a, [role='button']");
    const resultsStable = result.ok ? await waitForResultsStable(12000) : { ok: false, reason: "Importers tab not clicked" };

    return {
      ...result,
      ok: result.ok,
      resultsStable
    };
  }

  async function applyUserCriteriaOnce(options) {
    const hsCode = String(options.hsCode || "").trim();
    const minValue = String(options.minValue || "50000").trim();
    const maxValue = String(options.maxValue || "5000000").trim();

    await postLocalGuiLog("[조건 초기화] 기존 검색 조건을 모두 제거합니다.", "조건 초기화");
    const resetCriteria = await clearAllAppliedCriteria();
    if (!resetCriteria.ok) {
      await postLocalGuiLog("[조건 초기화 실패] 기존 검색 조건을 제거하지 못했습니다.", "조건 초기화 실패");
      return {
        ok: false,
        reason: resetCriteria.reason,
        resetCriteria
      };
    }
    await postLocalGuiLog("[조건 초기화 완료] 새 검색 조건을 적용합니다.", "조건 초기화 완료");
    await postLocalGuiLog(
      `[조건 설정] HS ${hsCode} / USD ${formatPlainNumber(minValue)} ~ ${formatPlainNumber(maxValue)}`,
      "조건 설정"
    );

    const dates = await setLastOneYearDates();
    await humanPause(700, 1200);
    const hsFilter = await applyHsCodeFilter(hsCode);
    await humanPause(700, 1200);
    const applyHs = clickExactControl("Apply", "button, [role='button']");
    const applyResultsStable = applyHs.ok ? await waitForResultsStable(12000) : { ok: false, reason: "Apply button not clicked" };

    const importersTab = await selectImportersTab();
    await humanPause(700, 1200);
    const totalValue = await applyTotalValueRange(minValue, maxValue);
    await humanPause(700, 1200);
    const removeUnknownExporter = await enableRemoveUnknownExporter();
    await waitForImporterCandidates(8000);
    await humanPause(900, 1600);
    const verification = await verifyAppliedCriteria({
      hsCode,
      minValue,
      maxValue,
      dateRange: dates.range
    });
    const stageFailureReason = [
      resetCriteria,
      dates,
      hsFilter,
      applyHs,
      importersTab,
      totalValue,
      removeUnknownExporter
    ].find((result) => result && result.ok === false)?.reason || "";

    return {
      ok: resetCriteria.ok && dates.ok && hsFilter.ok && applyHs.ok && importersTab.ok && totalValue.ok && removeUnknownExporter.ok && verification.ok,
      reason: stageFailureReason || (verification.ok ? "" : "Applied search criteria did not match the requested values."),
      criteria: {
        country: "Global",
        dataType: "Import-Global",
        tab: "Importers",
        period: "Last 1 year",
        hsCode,
        totalValueUsd: {
          min: minValue,
          max: maxValue
        },
        removeUnknownExporter: true
      },
      resetCriteria,
      dates,
      hsFilter,
      applyHs,
      applyResultsStable,
      importersTab,
      totalValue,
      removeUnknownExporter,
      verification
    };
  }

  async function applyUserCriteria(options) {
    const attempts = [];
    let lastResult = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      lastResult = await applyUserCriteriaOnce(options);
      attempts.push({
        attempt,
        ok: Boolean(lastResult.ok),
        reason: lastResult.reason || lastResult.totalValue?.reason || "",
        verification: lastResult.verification
      });

      if (lastResult.ok) {
        await humanPause(500, 900);
        await postLocalGuiLog(
          `[조건 검증 완료] HS ${options.hsCode} / USD ${formatPlainNumber(options.minValue)} ~ ${formatPlainNumber(options.maxValue)}`,
          "조건 검증 완료"
        );
        return {
          ...lastResult,
          attempts
        };
      }

      await postLocalGuiRawLog({
        type: "criteria-verification-failed",
        attempt,
        options,
        result: lastResult
      });

      if (attempt < 3) {
        await postLocalGuiLog(
          `[조건 재시도] 적용된 조건이 요청값과 달라 전체 초기화 후 다시 적용합니다 (${attempt}/3).`,
          "조건 재시도"
        );
        await humanPause(1800, 3200);
      }
    }

    await postLocalGuiLog(
      "[조건 설정 중단] 검색 조건을 3회 확인했지만 요청값과 일치하지 않습니다.",
      "조건 설정 실패"
    );
    return {
      ...(lastResult || { ok: false }),
      ok: false,
      reason: lastResult?.reason || "Applied search criteria did not match after 3 attempts.",
      attempts
    };
  }

  function clickFirstImporter() {
    const target = getImporterCandidates()[0];

    if (!target) {
      return {
        ok: false,
        reason: "first importer not found"
      };
    }

    const companyName = target.getAttribute("title") || textOf(target);
    const opened = openElementInSameTab(target);

    return {
      ok: true,
      companyName,
      opened,
      clicked: describeElement(target),
      urlAfterClick: location.href
    };
  }

  function getImporterCandidates() {
    const seen = new Set();

    return Array.from(document.querySelectorAll(".dot-blue.ellipsis-text[title]"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const companyName = (element.getAttribute("title") || textOf(element)).trim();
        const key = normalizeText(companyName);

        if (!companyName || companyName.length < 3 || !/[a-z]/i.test(companyName)) {
          return false;
        }

        if (key === "unknown" || seen.has(key)) {
          return false;
        }

        if (rect.width <= 0 || rect.height <= 0) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        const aIndex = Number(a.closest("[data-row-key], tr")?.getAttribute("data-row-key"));
        const bIndex = Number(b.closest("[data-row-key], tr")?.getAttribute("data-row-key"));

        if (Number.isFinite(aIndex) && Number.isFinite(bIndex)) {
          return aIndex - bIndex;
        }

        return aRect.top - bRect.top || aRect.left - bRect.left;
      });
  }

  function importerRowNumberFromElement(element) {
    const row = element?.closest(".G-table-row, [role='row'], tr");
    const numberCell = row ? Array.from(row.querySelectorAll(".td[title], [role='cell'][title], td[title], div[title]"))
      .find((cell) => {
        const title = String(cell.getAttribute("title") || "").trim();
        return /^\d+$/.test(title);
      }) : null;
    const title = numberCell?.getAttribute("title") || "";
    const parsed = Number.parseInt(title, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function importerCandidateSummary(candidates) {
    return candidates.map((candidate) => ({
      company: candidate.getAttribute("title") || textOf(candidate),
      rowNumber: importerRowNumberFromElement(candidate),
      key: companyKeyFromElement(candidate)
    }));
  }

  async function waitForUrlPart(part, timeoutMs = 20000) {
    return Boolean(await waitUntil(() => location.href.includes(part), timeoutMs, 300, 1000));
  }

  async function goBackToResults(resultsUrl) {
    await humanPause(500, 900);
    history.back();
    let ok = await waitForUrlPart("/search-results", 30000);

    if (!ok && resultsUrl) {
      location.href = resultsUrl;
      ok = await waitForUrlPart("/search-results", 30000);
    }

    if (!ok) {
      return false;
    }

    const candidates = await waitForImporterCandidates(20000);
    return Boolean(candidates.length);
  }

  function listPageSnapshot() {
    const candidates = getImporterCandidates();

    return {
      url: location.href,
      page: currentPaginationPage(),
      signature: importerListSignature(),
      range: candidateRowRange(candidates),
      candidateCount: candidates.length
    };
  }

  function findNextPageButton() {
    const directNext = Array.from(document.querySelectorAll(
      "a[aria-label='Next page'], button[aria-label='Next page'], a[rel='next'], button[rel='next']"
    )).find((element) => {
      if (isHelperElement(element)) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      const className = String(element.className || "");
      const disabled = element.getAttribute("aria-disabled") === "true" ||
        element.getAttribute("disabled") !== null ||
        element.closest(".disabled, .ant-pagination-disabled, [aria-disabled='true']") ||
        /\bdisabled\b/.test(className) ||
        element.disabled;

      return rect.width > 0 && rect.height > 0 && !disabled;
    });

    if (directNext) {
      return directNext;
    }

    const paginationContainers = Array.from(document.querySelectorAll(
      ".pagination, .ant-pagination, [class*='pagination'], nav[aria-label]"
    )).filter((element) => visibleElement(element));

    const scopedCandidates = paginationContainers.flatMap((container) => {
      return Array.from(container.querySelectorAll("a, button, [role='button']"));
    });

    const candidates = scopedCandidates.length
      ? scopedCandidates
      : Array.from(document.querySelectorAll(".pagination a, .pagination button, .ant-pagination a, .ant-pagination button"));

    return candidates
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = normalizeText(textOf(element));
        const aria = normalizeText(element.getAttribute("aria-label") || "");
        const title = normalizeText(element.getAttribute("title") || "");
        const className = String(element.className || "");
        const disabled = element.getAttribute("aria-disabled") === "true" ||
          element.getAttribute("disabled") !== null ||
          element.closest(".disabled, .ant-pagination-disabled, [aria-disabled='true']") ||
          /\bdisabled\b/.test(className) ||
          element.disabled;

        return rect.width > 0 && rect.height > 0 && !disabled && (
          element.getAttribute("rel") === "next" ||
          text === "next" ||
          aria === "nextpage" ||
          aria === "next" ||
          title === "nextpage" ||
          title === "next"
        );
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return bRect.top - aRect.top || bRect.right - aRect.right;
      })[0];
  }

  function isDisabledPaginationControl(element) {
    const className = String(element?.className || "");
    return !element ||
      element.getAttribute("aria-disabled") === "true" ||
      element.getAttribute("disabled") !== null ||
      element.closest(".disabled, .ant-pagination-disabled, [aria-disabled='true']") ||
      /\bdisabled\b/.test(className) ||
      element.disabled;
  }

  function paginationControls() {
    const containers = Array.from(document.querySelectorAll(
      ".pagination, .EG-pagination, .ant-pagination, [class*='pagination'], nav[aria-label]"
    )).filter((element) => visibleElement(element));
    const scoped = containers.flatMap((container) => {
      return Array.from(container.querySelectorAll("a, button, [role='button']"));
    });

    return (scoped.length ? scoped : Array.from(document.querySelectorAll(
      ".pagination a, .pagination button, .EG-pagination a, .EG-pagination button, .ant-pagination a, .ant-pagination button"
    ))).filter((element) => visibleElement(element) && !isDisabledPaginationControl(element));
  }

  function findPaginationPageButton(pageNumber) {
    const target = String(pageNumber);

    return paginationControls().find((element) => {
      const text = textOf(element).trim();
      const aria = element.getAttribute("aria-label") || "";
      const ariaPage = aria.match(/page\s+(\d+)/i)?.[1] || "";

      return text === target || ariaPage === target;
    }) || null;
  }

  function findPaginationJumpButton(direction = "forward") {
    const expected = direction === "backward" ? "jumpbackward" : "jumpforward";

    const controls = paginationControls();
    const preferred = controls.find((element) => {
      const text = normalizeText(textOf(element));
      const aria = normalizeText(element.getAttribute("aria-label") || "");
      const rel = normalizeText(element.getAttribute("rel") || "");
      const opposite = direction === "backward" ? "jumpforward" : "jumpbackward";

      if (aria.includes(opposite) || rel.includes(opposite)) {
        return false;
      }

      return aria === expected ||
        rel === expected ||
        (direction === "forward" && aria.includes("jumpforward")) ||
        (direction === "backward" && aria.includes("jumpbackward"));
    });

    if (preferred) {
      return preferred;
    }

    const ellipses = controls.filter((element) => normalizeText(textOf(element)) === "...");
    return direction === "backward" ? ellipses[0] || null : ellipses[ellipses.length - 1] || null;
  }

  function currentPaginationPage() {
    const current = document.querySelector(
      "a[aria-current='page'], button[aria-current='page'], .pagination li.active a, .pagination li.active button, .pagination li.active, .EG-pagination li.active a, .EG-pagination li.active button, .EG-pagination li.active"
    );
    if (!current) {
      return null;
    }

    const aria = current.getAttribute("aria-label") || "";
    const ariaMatch = aria.match(/page\s+(\d+)/i);
    if (ariaMatch) {
      const parsedAria = Number.parseInt(ariaMatch[1], 10);
      if (Number.isFinite(parsedAria)) {
        return parsedAria;
      }
    }

    const text = (current.textContent || "").trim();
    const parsed = Number.parseInt(text, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function describePaginationCandidate(element) {
    if (!element) {
      return null;
    }

    return {
      ...describeElement(element),
      title: element.getAttribute("title") || "",
      ariaDisabled: element.getAttribute("aria-disabled") || "",
      className: String(element.className || "").slice(0, 160)
    };
  }

  function inferImporterPageSize(rowRange = candidateRowRange(getImporterCandidates())) {
    if (Number.isFinite(rowRange.min) && Number.isFinite(rowRange.max) && rowRange.max >= rowRange.min) {
      const visibleSize = rowRange.max - rowRange.min + 1;
      if (visibleSize > 0) {
        return visibleSize;
      }
    }

    return 10;
  }

  function importerPageForRow(rowNumber, pageSize = 10) {
    const parsed = Number.parseInt(rowNumber, 10);
    const size = Math.max(1, Number.parseInt(pageSize, 10) || 10);
    return Math.max(1, Math.ceil(parsed / size) || 1);
  }

  async function waitForPaginationChange(before, timeoutMs = 25000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (await getLocalGuiStopRequested()) {
        return null;
      }

      const candidates = getImporterCandidates();
      const current = listPageSnapshot();
      const pageChanged = Number.isFinite(before.page) && Number.isFinite(current.page) && current.page !== before.page;
      const rangeChanged = Number.isFinite(before.range.max) && Number.isFinite(current.range.max) && current.range.max !== before.range.max;
      const signatureChanged = Boolean(current.signature && before.signature && current.signature !== before.signature);

      if (candidates.length && current.signature && !pageLooksBusy() && (pageChanged || rangeChanged || signatureChanged)) {
        return candidates;
      }

      await sleep(600);
    }

    return null;
  }

  async function waitForImporterPageReady(targetPage, expectedRowNumber = null, timeoutMs = 30000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (await getLocalGuiStopRequested()) {
        return null;
      }

      const candidates = getImporterCandidates();
      const current = listPageSnapshot();
      const reachedTargetPage = Number.isFinite(current.page) && current.page === targetPage;
      const range = current.range || {};
      const expectedRowVisible = !Number.isFinite(expectedRowNumber) ||
        (Number.isFinite(range.min) && Number.isFinite(range.max) && expectedRowNumber >= range.min && expectedRowNumber <= range.max);

      if (candidates.length && current.signature && !pageLooksBusy() && reachedTargetPage && expectedRowVisible) {
        const recovered = clearRecordNotFoundRecoveryIfTargetReached(candidates);
        if (recovered) {
          await postLocalGuiLog(
            `바이어 목록 복구 완료: 목표 ${targetPage}페이지에서 ${candidates.length}개 확인`,
            "복구 완료"
          );
        }
        return candidates;
      }

      await sleep(600);
    }

    return null;
  }

  function findImporterPageNavigationControl(targetPage, currentPage) {
    let control = findPaginationPageButton(targetPage);
    let mode = "page-button";

    if (!control) {
      if (!Number.isFinite(currentPage) || targetPage > currentPage) {
        control = findPaginationJumpButton("forward");
        mode = "jump-forward";
        if (!control) {
          control = findNextPageButton();
          mode = "next";
        }
      } else {
        control = findPaginationJumpButton("backward") ||
          findPaginationPageButton(Math.max(1, targetPage));
        mode = "jump-backward";
      }
    }

    return { control, mode };
  }

  async function waitForImporterPageNavigationControl(targetPage, currentPage, timeoutMs = 10000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (await getLocalGuiStopRequested()) {
        return null;
      }

      const found = findImporterPageNavigationControl(targetPage, currentPage);
      if (found.control) {
        await sleep(300);
        return found;
      }

      await sleep(350);
    }

    return null;
  }

  async function goToImporterPage(targetPage, expectedRowNumber = null) {
    const target = Math.max(1, Number.parseInt(targetPage, 10) || 1);
    const expectedRow = Number.parseInt(expectedRowNumber, 10);
    const attempts = [];
    let recordNotFoundRecoveries = currentRecordNotFoundRecoveryAttempts();

    for (let attempt = 1; attempt <= 30; attempt += 1) {
      const stopped = await abortIfGuiStopRequested();
      if (stopped) {
        return stopped;
      }

      const currentPage = currentPaginationPage();
      const before = listPageSnapshot();

      if (currentPage === target) {
        const readyCandidates = await waitForImporterPageReady(target, expectedRow, 15000);
        if (readyCandidates === null && await getLocalGuiStopRequested()) {
          return await abortIfGuiStopRequested();
        }

        const candidates = readyCandidates || [];
        if (!candidates.length && pageShowsRecordNotFound() && recordNotFoundRecoveries < MAX_RECORD_NOT_FOUND_RECOVERY) {
          recordNotFoundRecoveries += 1;
          attempts.push({
            attempt,
            mode: "recover-current-page-record-not-found",
            snapshot: listPageSnapshot(),
            recovery: recordNotFoundRecoveries
          });
          await recoverRecordNotFoundResults({
            source: "go-to-page-current",
            targetPage: target,
            expectedRowNumber: Number.isFinite(expectedRow) ? expectedRow : null
          });
          continue;
        }
        return {
          ok: Boolean(candidates.length),
          reason: candidates.length ? "" : "Target page reached but expected importer rows were not ready.",
          targetPage: target,
          expectedRowNumber: Number.isFinite(expectedRow) ? expectedRow : null,
          currentPage,
          candidateCount: candidates.length,
          candidates,
          rowRange: candidateRowRange(candidates),
          attempts
        };
      }

      let { control, mode } = findImporterPageNavigationControl(target, currentPage);

      if (!control) {
        await waitForImporterResultsReady(12000, { recoverRecordNotFound: false });
        const waited = await waitForImporterPageNavigationControl(target, currentPaginationPage(), 10000);
        control = waited?.control || null;
        mode = waited?.mode || mode;
      }

      if (!control) {
        if (pageShowsRecordNotFound() && recordNotFoundRecoveries < MAX_RECORD_NOT_FOUND_RECOVERY) {
          recordNotFoundRecoveries += 1;
          attempts.push({
            attempt,
            mode: "recover-missing-page-control-record-not-found",
            snapshot: listPageSnapshot(),
            recovery: recordNotFoundRecoveries
          });
          await recoverRecordNotFoundResults({
            source: "go-to-page-missing-control",
            targetPage: target,
            expectedRowNumber: Number.isFinite(expectedRow) ? expectedRow : null
          });
          continue;
        }

        return {
          ok: false,
          reason: `Page ${target} control not found.`,
          targetPage: target,
          currentPage,
          currentSnapshot: listPageSnapshot(),
          visibleControls: paginationControls().map((element) => ({
            text: textOf(element),
            ariaLabel: element.getAttribute("aria-label") || "",
            rel: element.getAttribute("rel") || "",
            className: String(element.className || "").slice(0, 80)
          })),
          attempts
        };
      }

      await humanPause("control");
      clickElement(control);
      await waitForPaginationChange(before, 30000);
      const stoppedAfterClick = await abortIfGuiStopRequested();
      if (stoppedAfterClick) {
        return stoppedAfterClick;
      }

      const after = listPageSnapshot();
      const recordNotFound = pageShowsRecordNotFound();

      attempts.push({
        attempt,
        mode,
        before,
        after,
        clicked: describePaginationCandidate(control),
        recordNotFound
      });

      if (recordNotFound) {
        if (recordNotFoundRecoveries < MAX_RECORD_NOT_FOUND_RECOVERY) {
          recordNotFoundRecoveries += 1;
          attempts[attempts.length - 1].recovery = recordNotFoundRecoveries;
          await recoverRecordNotFoundResults({
            source: "go-to-page-after-click",
            targetPage: target,
            expectedRowNumber: Number.isFinite(expectedRow) ? expectedRow : null
          });
          continue;
        }

        return {
          ok: false,
          reason: `Importer page ${target} showed record not found after ${MAX_RECORD_NOT_FOUND_RECOVERY} recovery attempts.`,
          targetPage: target,
          expectedRowNumber: Number.isFinite(expectedRow) ? expectedRow : null,
          currentPage: after.page,
          rowRange: after.range,
          attempts
        };
      }

      if (after.page === target) {
        const candidates = await waitForImporterPageReady(target, expectedRow, 30000);
        if (candidates === null && await getLocalGuiStopRequested()) {
          return await abortIfGuiStopRequested();
        }
        const finalSnapshot = listPageSnapshot();
        attempts[attempts.length - 1].final = finalSnapshot;

        if (!candidates?.length) {
          return {
            ok: false,
            reason: `Importer page ${target} opened but expected rows did not become ready.`,
            targetPage: target,
            expectedRowNumber: Number.isFinite(expectedRow) ? expectedRow : null,
            currentPage: finalSnapshot.page,
            rowRange: finalSnapshot.range,
            attempts
          };
        }

        return {
          ok: true,
          reason: "",
          targetPage: target,
          expectedRowNumber: Number.isFinite(expectedRow) ? expectedRow : null,
          currentPage: finalSnapshot.page,
          candidateCount: candidates.length,
          candidates,
          rowRange: finalSnapshot.range,
          attempts
        };
      }

      await sleep(800);
    }

    return {
      ok: false,
      reason: `Could not reach importer page ${target}.`,
      targetPage: target,
      expectedRowNumber: Number.isFinite(expectedRow) ? expectedRow : null,
      currentPage: currentPaginationPage(),
      rowRange: candidateRowRange(getImporterCandidates()),
      attempts
    };
  }

  async function goNextImporterPage() {
    let before = listPageSnapshot();
    const attempts = [];
    let recordNotFoundRecoveries = currentRecordNotFoundRecoveryAttempts();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const stopped = await abortIfGuiStopRequested();
      if (stopped) {
        return stopped;
      }

      before = listPageSnapshot();
      const next = findNextPageButton();

      if (!next) {
        attempts.push({
          attempt,
          ok: false,
          reason: "Next page button not found.",
          snapshot: listPageSnapshot()
        });

        if (pageShowsRecordNotFound() && recordNotFoundRecoveries < MAX_RECORD_NOT_FOUND_RECOVERY) {
          recordNotFoundRecoveries += 1;
          await recoverRecordNotFoundResults({
            source: "next-page-missing-control",
            targetPage: Number.isFinite(before.page) ? before.page + 1 : null
          });
          continue;
        }

        if (attempt === 1) {
          await selectImportersTab();
          await waitForImporterResultsReady(12000);
          continue;
        }

        break;
      }

      const clicked = describePaginationCandidate(next);
      await humanPause("control");
      clickElement(next);

      const candidates = await waitUntil(() => {
        const currentCandidates = getImporterCandidates();
        const current = listPageSnapshot();
        const pageChanged = Number.isFinite(before.page) && Number.isFinite(current.page) && current.page !== before.page;
        const rangeChanged = Number.isFinite(before.range.max) && Number.isFinite(current.range.max) && current.range.max !== before.range.max;
        const signatureChanged = Boolean(current.signature && before.signature && current.signature !== before.signature);

        if (currentCandidates.length && current.signature && !pageLooksBusy() && (signatureChanged || pageChanged || rangeChanged)) {
          return currentCandidates;
        }

        return null;
      }, attempt === 1 ? 25000 : 35000, 600, 1500);

      const after = listPageSnapshot();
      const recordNotFound = pageShowsRecordNotFound();
      attempts.push({
        attempt,
        ok: Boolean(candidates?.length),
        clicked,
        after,
        recordNotFound
      });

      if (candidates?.length) {
        const recovered = clearRecordNotFoundRecoveryIfTargetReached(candidates);
        if (recovered) {
          await postLocalGuiLog(
            `바이어 목록 복구 완료: ${after.page || "-"}페이지에서 ${candidates.length}개 확인`,
            "복구 완료"
          );
        }
        await waitForImporterResultsReady(15000);
        return {
          ok: true,
          reason: "",
          beforeSignature: before.signature,
          afterSignature: after.signature,
          beforeUrl: before.url,
          afterUrl: after.url,
          beforePage: before.page,
          afterPage: after.page,
          beforeRange: before.range,
          afterRange: after.range,
          clicked,
          currentPage: after.page,
          candidateCount: after.candidateCount,
          attempts
        };
      }

      if (recordNotFound && recordNotFoundRecoveries < MAX_RECORD_NOT_FOUND_RECOVERY) {
        recordNotFoundRecoveries += 1;
        attempts[attempts.length - 1].recovery = recordNotFoundRecoveries;
        await recoverRecordNotFoundResults({
          source: "next-page-after-click",
          targetPage: Number.isFinite(before.page) ? before.page + 1 : null
        });
        continue;
      }

      await sleep(1200 * attempt);
      await selectImportersTab();
      await waitForImporterResultsReady(12000);
    }

    const after = listPageSnapshot();
    const exhaustedRecordNotFoundRecovery = recordNotFoundRecoveries >= MAX_RECORD_NOT_FOUND_RECOVERY && pageShowsRecordNotFound();
    return {
      ok: false,
      reason: exhaustedRecordNotFoundRecovery
        ? `Importer list still showed record not found after ${MAX_RECORD_NOT_FOUND_RECOVERY} recovery attempts.`
        : "Importer list did not change after clicking next page.",
      beforeSignature: before.signature,
      afterSignature: after.signature,
      beforeUrl: before.url,
      afterUrl: after.url,
      beforePage: before.page,
      afterPage: after.page,
      beforeRange: before.range,
      afterRange: after.range,
      currentPage: after.page,
      candidateCount: after.candidateCount,
      recordNotFoundRecoveryAttempts: recordNotFoundRecoveries,
      attempts
    };
  }

  async function waitForImporterResultsReady(timeoutMs = 25000, options = {}) {
    const recoverRecordNotFound = options.recoverRecordNotFound !== false;

    await waitForResultsStable(Math.min(timeoutMs, 12000));

    let candidates = await waitForImporterCandidates(5000);
    if (candidates.length) {
      return candidates;
    }

    await selectImportersTab();
    await waitForResultsStable(12000);
    candidates = await waitForImporterCandidates(8000);
    if (candidates.length) {
      return candidates;
    }

    if (recoverRecordNotFound && pageShowsRecordNotFound()) {
      const recovered = await recoverRecordNotFoundResults({ source: "wait-for-importer-results" });
      if (recovered.length) {
        return recovered;
      }
    }

    return candidates;
  }

  async function waitForImporterCandidates(timeoutMs = 20000) {
    const candidates = await waitUntil(() => {
      const candidates = getImporterCandidates();
      if (candidates.length) {
        return candidates;
      }

      return null;
    }, timeoutMs, 500, 500);

    if (candidates?.length) {
      const recovered = clearRecordNotFoundRecoveryIfTargetReached(candidates);
      if (recovered) {
        await postLocalGuiLog(
          `바이어 목록 복구 완료: ${currentPaginationPage() || "-"}페이지에서 ${candidates.length}개 확인`,
          "복구 완료"
        );
      }
    }

    return candidates || [];
  }

  function pageShowsRecordNotFound() {
    const text = normalizeText(textOf(document.body));
    return text.includes("recordnotfound") ||
      text.includes("recordsnotfound") ||
      text.includes("norecordfound") ||
      text.includes("norecordsfound") ||
      text.includes("nodatafound");
  }

  function readRecordNotFoundRecovery() {
    try {
      const raw = sessionStorage.getItem(RECORD_NOT_FOUND_RECOVERY_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function currentRecordNotFoundRecoveryAttempts() {
    const recovery = readRecordNotFoundRecovery();
    const collectionState = readCollectionState();
    const sameTask = recovery &&
      String(recovery.queueTaskId || "") === String(collectionState?.queueTaskId || "");
    return sameTask ? Number.parseInt(recovery.attempts, 10) || 0 : 0;
  }

  function clearRecordNotFoundRecovery() {
    sessionStorage.removeItem(RECORD_NOT_FOUND_RECOVERY_KEY);
  }

  function clearRecordNotFoundRecoveryIfTargetReached(candidates = getImporterCandidates()) {
    const recovery = readRecordNotFoundRecovery();
    if (!recovery) {
      return null;
    }

    const targetPage = Number.parseInt(recovery.targetPage, 10);
    const expectedRowNumber = Number.parseInt(recovery.expectedRowNumber, 10);
    const currentPage = currentPaginationPage();
    const rowRange = candidateRowRange(candidates);
    const pageMatches = !Number.isFinite(targetPage) || currentPage === targetPage;
    const rowMatches = !Number.isFinite(expectedRowNumber) || (
      Number.isFinite(rowRange.min) &&
      Number.isFinite(rowRange.max) &&
      expectedRowNumber >= rowRange.min &&
      expectedRowNumber <= rowRange.max
    );

    if (!pageMatches || !rowMatches) {
      return null;
    }

    clearRecordNotFoundRecovery();
    return recovery;
  }

  async function recoverRecordNotFoundResults(context = {}) {
    if (await getLocalGuiStopRequested()) {
      return [];
    }

    const collectionState = readCollectionState();
    const queueTaskId = String(collectionState?.queueTaskId || "");
    const previous = readRecordNotFoundRecovery();
    const sameTask = previous && String(previous.queueTaskId || "") === queueTaskId;
    const previousAttempts = sameTask ? Number.parseInt(previous.attempts, 10) || 0 : 0;

    if (previousAttempts >= MAX_RECORD_NOT_FOUND_RECOVERY) {
      await postLocalGuiLog(
        `바이어 목록을 ${MAX_RECORD_NOT_FOUND_RECOVERY}회 새로고침했지만 복구하지 못했습니다.`,
        "복구 실패"
      );
      await postLocalGuiRawLog({
        type: "record-not-found-recovery-exhausted",
        recovery: previous,
        context,
        collectionState
      });
      return [];
    }

    const inferredTargetPage = importerPageForRow(collectionState?.resumeStartRowNumber || 1, 10);
    const recovery = {
      queueTaskId,
      attempts: previousAttempts + 1,
      maxAttempts: MAX_RECORD_NOT_FOUND_RECOVERY,
      requestedAt: new Date().toISOString(),
      url: location.href,
      page: currentPaginationPage(),
      targetPage: Number.parseInt(context.targetPage, 10) || inferredTargetPage,
      expectedRowNumber: Number.parseInt(context.expectedRowNumber, 10) || collectionState?.resumeStartRowNumber || null,
      rowRange: candidateRowRange(getImporterCandidates()),
      resumeStartRowNumber: collectionState?.resumeStartRowNumber || null,
      phase: collectionState?.phase || "results",
      context
    };
    sessionStorage.setItem(RECORD_NOT_FOUND_RECOVERY_KEY, JSON.stringify(recovery));

    if (collectionState) {
      collectionState.summary = collectionState.summary || {};
      collectionState.summary.diagnostics = {
        ...(collectionState.summary.diagnostics || {}),
        recordNotFoundRecovery: recovery
      };
      writeCollectionState(collectionState);
    }

    await postLocalGuiLog(
      `바이어 목록이 비어 있어 새로고침 복구를 시도합니다 (${recovery.attempts}/${MAX_RECORD_NOT_FOUND_RECOVERY}).`,
      "복구 시도"
    );
    await postLocalGuiRawLog({
      type: "record-not-found-reload",
      recovery
    });

    location.reload();
    return new Promise(() => {});
  }

  function companyKeyFromElement(element) {
    return normalizeText(element?.getAttribute("title") || (element ? textOf(element) : ""));
  }

  function companyKeyFromName(name) {
    return normalizeText(name);
  }

  function findNextUnvisitedImporter(candidates, visitedCompanyKeys) {
    return candidates.find((candidate) => !visitedCompanyKeys.has(companyKeyFromElement(candidate))) || null;
  }

  function findNextImporterByRowNumber(candidates, startRowNumber, visitedCompanyKeys) {
    const withRowNumbers = candidates
      .map((candidate) => ({
        candidate,
        rowNumber: importerRowNumberFromElement(candidate),
        companyKey: companyKeyFromElement(candidate)
      }))
      .filter((item) => Number.isFinite(item.rowNumber))
      .sort((a, b) => a.rowNumber - b.rowNumber);

    if (!withRowNumbers.length) {
      return findNextUnvisitedImporter(candidates, visitedCompanyKeys);
    }

    return withRowNumbers.find((item) => {
      return item.rowNumber >= startRowNumber && !visitedCompanyKeys.has(item.companyKey);
    })?.candidate || null;
  }

  function importerCandidateIdentity(candidate) {
    return {
      candidate,
      listCompanyName: candidate?.getAttribute("title") || textOf(candidate),
      rowNumber: importerRowNumberFromElement(candidate),
      companyKey: companyKeyFromElement(candidate)
    };
  }

  function sortedImporterCandidateIdentities(candidates, minimumRowNumber = 1) {
    return candidates
      .map(importerCandidateIdentity)
      .filter((item) => {
        return !Number.isFinite(item.rowNumber) || item.rowNumber >= minimumRowNumber;
      })
      .sort((a, b) => {
        const aRow = Number.isFinite(a.rowNumber) ? a.rowNumber : Number.MAX_SAFE_INTEGER;
        const bRow = Number.isFinite(b.rowNumber) ? b.rowNumber : Number.MAX_SAFE_INTEGER;
        return aRow - bRow;
      });
  }

  function pickResumeAnchorIdentity(identities, anchorKey, checked) {
    const unchecked = identities.filter((item) => {
      const rowPart = Number.isFinite(item.rowNumber) ? item.rowNumber : "rowless";
      const checkKey = `${rowPart}:${item.companyKey}`;
      return item.companyKey && !checked.has(checkKey);
    });

    const listMatched = unchecked.find((item) => item.companyKey === anchorKey);
    if (listMatched) {
      return {
        ...listMatched,
        listNameMatchedAnchor: true
      };
    }

    const sequential = unchecked[0] || null;
    return sequential
      ? {
        ...sequential,
        listNameMatchedAnchor: false
      }
      : null;
  }

  function summarizeImporterIdentities(identities) {
    return identities.map((item) => {
      const marker = item.companyKey ? "" : "!";
      return `${item.rowNumber || "-"}:${marker}${item.listCompanyName}`;
    }).join(" | ");
  }

  async function inspectResumeAnchorProfile(identity, state) {
    const stoppedBeforeLog = await abortIfGuiStopRequested();
    if (stoppedBeforeLog) {
      return {
        stopped: true,
        reason: stoppedBeforeLog.reason,
        candidates: getImporterCandidates()
      };
    }
    await postLocalGuiLog(`이어하기 위치 확인 중: ${identity.rowNumber || "-"}번 ${identity.listCompanyName}`);

    state.phase = "resumeAnchor";
        state.summary.diagnostics.resumeAnchorChecking = {
          rowNumber: identity.rowNumber || null,
          listCompanyName: identity.listCompanyName,
          listNameMatchedAnchor: Boolean(identity.listNameMatchedAnchor)
        };
    writeCollectionState(state);

    const stoppedBeforeOpen = await abortIfGuiStopRequested();
    if (stoppedBeforeOpen) {
      return {
        stopped: true,
        reason: stoppedBeforeOpen.reason,
        candidates: getImporterCandidates()
      };
    }

    await humanPause("navigation");
    openElementInSameTab(identity.candidate);
    const opened = await waitForUrlPart("/company-profile", 30000);

    if (!opened) {
      return {
        ok: false,
        reason: "Resume anchor profile did not open.",
        identity,
        candidates: getImporterCandidates()
      };
    }

    const profileUrl = location.href;
    const ready = await waitForCompanyProfileReady(45000);
    const overview = ready.ready ? extractOverviewProfile() : null;
    const profileCompanyCandidates = overview?.raw?.profileCompanyCandidates || [];
    const matchedProfileCompanyName = profileCompanyCandidates.find((candidate) => {
      return companyKeyFromName(candidate) === state.resumeAnchorBuyerKey;
    }) || "";
    const profileCompanyName = matchedProfileCompanyName || overview?.excelPinkBlock?.Company_Name || "";
    const profileCompanyKey = companyKeyFromName(profileCompanyName);

    state.phase = "results";
    writeCollectionState(state);

    const returned = await goBackToResults(state.resultsUrl);
    const candidates = returned
      ? await waitForImporterResultsReady(25000)
      : getImporterCandidates();

    return {
      ok: Boolean(profileCompanyKey),
      matched: profileCompanyKey === state.resumeAnchorBuyerKey,
      identity,
      profileUrl,
      profileCompanyName,
      profileCompanyKey,
      profileCompanyCandidates,
      ready,
      candidates
    };
  }

  async function verifyResumeAnchorOnProfilePage(state) {
    const checking = state.summary?.diagnostics?.resumeAnchorChecking || {};
    const profileReady = await waitForCompanyProfileReady(45000);
    const profileUrl = location.href;

    if (profileReady.stopped) {
      return {
        stopped: true,
        reason: "Stopped by GUI request."
      };
    }

    const overview = profileReady.ready ? extractOverviewProfile() : null;
    const profileCompanyCandidates = overview?.raw?.profileCompanyCandidates || [];
    const matchedProfileCompanyName = profileCompanyCandidates.find((candidate) => {
      return companyKeyFromName(candidate) === state.resumeAnchorBuyerKey;
    }) || "";
    const profileCompanyName = matchedProfileCompanyName || overview?.excelPinkBlock?.Company_Name || "";
    const profileCompanyKey = companyKeyFromName(profileCompanyName);
    const matched = profileCompanyKey === state.resumeAnchorBuyerKey;

    state.summary.diagnostics.resumeAnchorLastCheck = {
      excelFileIndex: state.resumeAnchorIndex || null,
      browserRowNumber: checking.rowNumber || null,
      nextBrowserRowNumber: Number.isFinite(Number(checking.rowNumber)) ? Number(checking.rowNumber) + 1 : null,
      listCompanyName: checking.listCompanyName || "",
      listNameMatchedAnchor: Boolean(checking.listNameMatchedAnchor),
      profileCompanyName,
      profileCompanyCandidates,
      matched,
      profileUrl,
      ready: profileReady
    };

    await postLocalGuiRawLog({
      type: "resume-anchor-profile-check",
      url: location.href,
      expected: {
        buyerName: state.resumeAnchorBuyerName,
        key: state.resumeAnchorBuyerKey
      },
      list: {
        rowNumber: checking.rowNumber || null,
        companyName: checking.listCompanyName || "",
        listNameMatchedAnchor: Boolean(checking.listNameMatchedAnchor)
      },
      profile: {
        companyName: profileCompanyName,
        key: profileCompanyKey,
        candidates: profileCompanyCandidates,
        ready: profileReady
      },
      matched
    });

    await postLocalGuiLog(
      `[이어하기] 상세페이지 회사명 확인: ${profileCompanyName || "(비어 있음)"} - ${matched ? "일치" : "불일치"}`,
      matched ? "이어하기" : "이어하기 중단"
    );

    if (!matched) {
      const profileName = profileCompanyName || "(empty)";
      state.active = false;
      state.summary.ok = false;
      state.summary.reason = checking.listNameMatchedAnchor
        ? `List-name anchor candidate did not match profile name: ${checking.listCompanyName || ""} -> ${profileName}`
        : "Resume anchor profile did not match.";
      state.summary.diagnostics.resumeAnchor = {
        found: false,
        stoppedAtListNameMatch: Boolean(checking.listNameMatchedAnchor),
        buyerName: state.resumeAnchorBuyerName,
        excelFileIndex: state.resumeAnchorIndex || null,
        browserRowNumber: checking.rowNumber || null,
        listCompanyName: checking.listCompanyName || "",
        profileCompanyName,
        profileCompanyCandidates,
        profileCompanyKey,
        profileReady,
        profileUrl
      };
      writeCollectionState(state);
      return resultFromCollectionState(state);
    }

    const nextRowNumber = Number.isFinite(Number(checking.rowNumber))
      ? Number(checking.rowNumber) + 1
      : Math.max(Number.parseInt(state.resumeStartRowNumber, 10) || 1, (Number.parseInt(state.resumeAnchorNextRowNumber, 10) || 1));

    state.resumeAnchorFound = true;
    state.resumeAnchorRowNumber = checking.rowNumber || null;
    state.resumeStartRowNumber = nextRowNumber;
    state.resumeAnchorNextRowNumber = nextRowNumber;
    state.phase = "results";
    state.summary.diagnostics.resumeAnchor = {
      found: true,
      buyerName: state.resumeAnchorBuyerName,
      excelFileIndex: state.resumeAnchorIndex || null,
      browserRowNumber: checking.rowNumber || null,
      nextRowNumber,
      listCompanyName: checking.listCompanyName || "",
      profileCompanyName,
      profileUrl
    };
    await postLocalGuiLog(
      `[이어하기 완료] ${checking.rowNumber || "-"}번 확인 완료, ${nextRowNumber}번부터 수집합니다.`,
      "이어하기"
    );
    writeCollectionState(state);

    const returned = await goBackToResults(state.resultsUrl);
    if (returned) {
      await waitForImporterResultsReady(25000);
      return continueQualifiedCollection(readCollectionState() || state);
    }

    return resultFromCollectionState(state, { resuming: true, reason: "Returning from resume anchor profile." });
  }

  async function resolveResumeAnchor(state, candidates) {
    if (state.resumeAnchorFound || !state.resumeAnchorBuyerKey) {
      return {
        ok: true,
        candidates
      };
    }

    const initialMinimumRowNumber = Math.max(1, Number.parseInt(state.resumeAnchorIndex, 10) || 1);
    let minimumRowNumber = Math.max(
      initialMinimumRowNumber,
      Number.parseInt(state.resumeAnchorNextRowNumber, 10) || initialMinimumRowNumber
    );
    let currentCandidates = candidates;
    let rowRange = candidateRowRange(currentCandidates);
    const checked = new Set(state.resumeAnchorChecked || []);
    await postLocalGuiLog(
      `[이어하기] 마지막 저장 파일: ${initialMinimumRowNumber}. ${state.resumeAnchorBuyerName}`,
      "이어하기"
    );

    for (let guard = 0; guard < 120; guard += 1) {
      const stopped = await abortIfGuiStopRequested();
      if (stopped) {
        state.active = false;
        state.summary.ok = false;
        state.summary.reason = stopped.reason;
        writeCollectionState(state);
        return resultFromCollectionState(state, { stopped: true, reason: stopped.reason });
      }

      minimumRowNumber = Math.max(
        initialMinimumRowNumber,
        Number.parseInt(state.resumeAnchorNextRowNumber, 10) || minimumRowNumber
      );
      rowRange = candidateRowRange(currentCandidates);
      const targetPage = importerPageForRow(minimumRowNumber, inferImporterPageSize(rowRange));
      if (currentPaginationPage() !== targetPage) {
        await postLocalGuiLog(
          `[이어하기] ${targetPage}페이지에서 위치를 찾습니다. (${minimumRowNumber}번 기준)`,
          "페이지 이동"
        );
        const jumped = await goToImporterPage(targetPage, minimumRowNumber);
        state.summary.diagnostics.lastPageJump = jumped;
        if (jumped.stopped) {
          state.active = false;
          state.summary.ok = false;
          state.summary.reason = jumped.reason;
          writeCollectionState(state);
          return resultFromCollectionState(state, { stopped: true, reason: jumped.reason });
        }

        if (jumped.ok) {
          currentCandidates = jumped.candidates?.length
            ? jumped.candidates
            : await waitForImporterResultsReady(8000);
          rowRange = candidateRowRange(currentCandidates);
        } else {
          state.summary.reason = jumped.reason || `Could not reach importer page ${targetPage}.`;
          state.active = false;
          writeCollectionState(state);
          return resultFromCollectionState(state);
        }
      }

      const identities = sortedImporterCandidateIdentities(currentCandidates, minimumRowNumber);
      const listMatchedIdentity = identities.find((item) => item.companyKey === state.resumeAnchorBuyerKey);
      await postLocalGuiLog(
        listMatchedIdentity
          ? `[이어하기] 목록에서 같은 이름 발견: ${listMatchedIdentity.rowNumber || "-"}번 ${listMatchedIdentity.listCompanyName}`
          : `[이어하기] ${currentPaginationPage() || "-"}페이지에서 같은 이름을 찾지 못해 순서대로 확인합니다.`,
        "이어하기"
      );

      const identity = pickResumeAnchorIdentity(identities, state.resumeAnchorBuyerKey, checked);

      if (identity) {
        await postLocalGuiLog(
          `[이어하기] 상세페이지 확인 중: ${identity.rowNumber || "-"}번 ${identity.listCompanyName}`,
          "이어하기"
        );

        const rowPart = Number.isFinite(identity.rowNumber) ? identity.rowNumber : "rowless";
        const checkKey = `${rowPart}:${identity.companyKey}`;
        checked.add(checkKey);
        state.resumeAnchorChecked = Array.from(checked).slice(-300);
        if (Number.isFinite(identity.rowNumber)) {
          state.resumeAnchorNextRowNumber = identity.rowNumber + 1;
          minimumRowNumber = state.resumeAnchorNextRowNumber;
        }

        const inspected = await inspectResumeAnchorProfile(identity, state);
        if (inspected.stopped) {
          state.active = false;
          state.summary.ok = false;
          state.summary.reason = inspected.reason;
          writeCollectionState(state);
          return resultFromCollectionState(state, { stopped: true, reason: inspected.reason });
        }

        await postLocalGuiLog(
          `[이어하기] 상세페이지 회사명 확인: ${inspected.profileCompanyName || "(비어 있음)"} - ${inspected.matched ? "일치" : "불일치"}`,
          inspected.matched ? "이어하기" : "이어하기 중단"
        );

        currentCandidates = inspected.candidates?.length ? inspected.candidates : await waitForImporterResultsReady(8000);
        rowRange = candidateRowRange(currentCandidates);

        state.summary.diagnostics.resumeAnchorLastCheck = {
          excelFileIndex: initialMinimumRowNumber,
          browserRowNumber: identity.rowNumber || null,
          nextBrowserRowNumber: state.resumeAnchorNextRowNumber || null,
          listCompanyName: identity.listCompanyName,
          listNameMatchedAnchor: Boolean(identity.listNameMatchedAnchor),
          profileCompanyName: inspected.profileCompanyName || "",
          profileCompanyCandidates: inspected.profileCompanyCandidates || [],
          matched: Boolean(inspected.matched),
          profileUrl: inspected.profileUrl || "",
          ready: inspected.ready || null
        };

        if (!inspected.matched) {
          if (identity.listNameMatchedAnchor) {
            const profileName = inspected.profileCompanyName || "(empty)";
            state.active = false;
            state.summary.ok = false;
            state.summary.reason = `List-name anchor candidate did not match profile name: ${identity.listCompanyName} -> ${profileName}`;
            state.summary.diagnostics.resumeAnchor = {
              found: false,
              stoppedAtListNameMatch: true,
              buyerName: state.resumeAnchorBuyerName,
              excelFileIndex: initialMinimumRowNumber,
              browserRowNumber: identity.rowNumber || null,
              listCompanyName: identity.listCompanyName,
              profileCompanyName: inspected.profileCompanyName || "",
              profileCompanyCandidates: inspected.profileCompanyCandidates || [],
              profileCompanyKey: inspected.profileCompanyKey || "",
              profileReady: inspected.ready || null,
              profileUrl: inspected.profileUrl || ""
            };
            await postLocalGuiLog(
              `[이어하기 중단] 목록명과 상세페이지 회사명이 다릅니다: ${identity.listCompanyName} / ${profileName}`,
              "이어하기 중단"
            );
            writeCollectionState(state);
            return resultFromCollectionState(state);
          }

          writeCollectionState(state);
          continue;
        }

        const nextRowNumber = Number.isFinite(identity.rowNumber)
          ? identity.rowNumber + 1
          : Math.max(state.resumeStartRowNumber || 1, minimumRowNumber + 1);

        state.resumeAnchorFound = true;
        state.resumeAnchorRowNumber = identity.rowNumber || null;
        state.resumeStartRowNumber = nextRowNumber;
        state.summary.diagnostics.resumeAnchor = {
          found: true,
          buyerName: state.resumeAnchorBuyerName,
          excelFileIndex: initialMinimumRowNumber,
          anchorIndex: initialMinimumRowNumber,
          browserRowNumber: identity.rowNumber || null,
          nextRowNumber,
          listCompanyName: identity.listCompanyName,
          profileCompanyName: inspected.profileCompanyName,
          profileUrl: inspected.profileUrl
        };
        await postLocalGuiLog(
          `[이어하기 완료] ${identity.rowNumber || "-"}번 확인 완료, ${nextRowNumber}번부터 수집합니다.`,
          "이어하기"
        );
        writeCollectionState(state);

        return {
          ok: true,
          candidates: currentCandidates,
          anchor: identity
        };
      }

      const moved = await goNextImporterPage();
      state.summary.diagnostics.lastPagination = moved;

      if (!moved.ok) {
        break;
      }

      state.summary.pages += 1;
      currentCandidates = await waitForImporterResultsReady(25000);
      rowRange = candidateRowRange(currentCandidates);
    }

    state.resumeAnchorFound = false;
    state.active = false;
    state.summary.ok = false;
    state.summary.reason = "Resume anchor buyer was not found. Collection did not start to avoid duplicate or out-of-position buyers.";
    state.summary.diagnostics.resumeAnchor = {
      found: false,
      buyerName: state.resumeAnchorBuyerName,
      excelFileIndex: initialMinimumRowNumber,
      anchorIndex: initialMinimumRowNumber,
      lastBrowserRowNumber: Number.parseInt(state.resumeAnchorNextRowNumber, 10) - 1 || null,
      rowRange: candidateRowRange(getImporterCandidates()),
      candidates: importerCandidateSummary(getImporterCandidates()).slice(0, 20)
    };
    writeCollectionState(state);

    return {
      ok: false,
      candidates: currentCandidates,
      active: false,
      reason: state.summary.reason
    };
  }

  function candidateRowRange(candidates) {
    const rowNumbers = candidates
      .map((candidate) => importerRowNumberFromElement(candidate))
      .filter((rowNumber) => Number.isFinite(rowNumber));

    if (!rowNumbers.length) {
      return { min: null, max: null };
    }

    return {
      min: Math.min(...rowNumbers),
      max: Math.max(...rowNumbers)
    };
  }

  function pageLooksBusy() {
    const busyElements = Array.from(document.querySelectorAll("[aria-busy='true'], .spinner, .loader, .loading, .ant-spin, .ngx-spinner, .overlay"))
      .filter((element) => visibleElement(element));

    return busyElements.length > 0;
  }

  function importerListSignature() {
    return getImporterCandidates()
      .slice(0, 8)
      .map((candidate) => companyKeyFromElement(candidate))
      .join("|");
  }

  async function waitForResultsStable(timeoutMs = 12000) {
    const started = Date.now();
    let lastSignature = "";
    let stableSince = 0;

    while (Date.now() - started < timeoutMs) {
      const candidates = getImporterCandidates();
      const signature = importerListSignature();

      if (!pageLooksBusy() && candidates.length && signature) {
        if (signature === lastSignature) {
          if (!stableSince) {
            stableSince = Date.now();
          }

          if (Date.now() - stableSince >= 600) {
            await sleep(250);
            return {
              ok: true,
              candidates: candidates.length,
              signature
            };
          }
        } else {
          lastSignature = signature;
          stableSince = Date.now();
        }
      } else {
        stableSince = 0;
      }

      await sleep(400);
    }

    return {
      ok: false,
      reason: "Importer results did not become stable in time.",
      candidates: getImporterCandidates().length,
      busy: pageLooksBusy(),
      signature: importerListSignature()
    };
  }

  function parsePercentForHsCode(bodyText, hsCode) {
    const escapedHsCode = hsCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rowPattern = new RegExp(`(?:^|\\s)${escapedHsCode}\\s+([\\s\\S]{0,240}?)(\\d[\\d,]*\\.\\d{2})\\s+(\\d+(?:\\.\\d+)?)`, "i");
    const match = bodyText.match(rowPattern);

    if (!match) {
      return null;
    }

    return {
      hsCode,
      importValueUsdText: match[2],
      importValuePercent: Number(match[3])
    };
  }

  async function openImportCommodityTab(hsCode) {
    const commodities = findExactControl("Commodities", "a, button, [role='button']");
    if (!commodities) {
      return {
        ok: false,
        reason: "Commodities tab not found"
      };
    }

    await humanPause("navigation");
    clickElement(commodities);
    await waitUntil(() => {
      return findExactControl("Import Commodities", "button, a, [role='button']") ||
        textOf(document.body).includes(hsCode);
    }, 15000, 500, 1000);

    const importCommodities = findExactControl("Import Commodities", "button, a, [role='button']");
    if (importCommodities) {
      await humanPause("control");
      clickElement(importCommodities);
      await humanPause(900, 1500);
    }

    return {
      ok: true
    };
  }

  async function assessCommodityValue(hsCode) {
    const code = String(hsCode || "").trim();

    if (!code) {
      return {
        ok: false,
        reason: "hs code is empty"
      };
    }

    const attempts = [];

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const opened = await openImportCommodityTab(code);
      if (!opened.ok) {
        return opened;
      }

      const parsed = await waitUntil(() => {
        const bodyText = textOf(document.body);
        return parsePercentForHsCode(bodyText, code);
      }, attempt === 1 ? 15000 : 22000, 600, 1000);

      const bodyText = textOf(document.body);
      const importRows = parseCommodityRowsFromText(bodyText, "import");
      const availableHsCodes = Array.from(new Set(importRows.map((row) => row.hsCode)));
      attempts.push({
        attempt,
        parsed: Boolean(parsed),
        hasHsCodeText: bodyText.includes(code),
        importRowCount: importRows.length,
        availableHsCodes,
        bodyTextSample: bodyText.slice(0, 500)
      });

      if (parsed) {
        return {
          ok: true,
          hsCode: code,
          importValueUsdText: parsed.importValueUsdText,
          importValuePercent: parsed.importValuePercent,
          threshold: 5,
          qualified: parsed.importValuePercent > 5,
          attempts
        };
      }

      if (importRows.length > 0 && !availableHsCodes.includes(code)) {
        return {
          ok: true,
          hsCode: code,
          importValueUsdText: "",
          importValuePercent: null,
          threshold: 5,
          qualified: false,
          missingHsCode: true,
          reason: `HS code ${code} was not found in Import Commodities.`,
          availableHsCodes,
          attempts
        };
      }

      await sleep(1200 * attempt);
      const overview = findExactControl("Overview", "a, button, [role='button']");
      if (overview) {
        await humanPause("control");
        clickElement(overview);
        await humanPause(800, 1400);
      }
    }

    return {
      ok: false,
      hsCode: code,
      qualified: null,
      reason: "HS code row could not be parsed from Import Commodities after retries",
      attempts,
      bodyTextSample: textOf(document.body).slice(0, 1600)
    };
  }

  function parseMoneyToNumber(value) {
    if (!value) {
      return null;
    }

    const match = String(value).replace(/,/g, "").match(/\$?\s*([\d.]+)\s*([KMB])?/i);
    if (!match) {
      return null;
    }

    const base = Number(match[1]);
    const suffix = (match[2] || "").toUpperCase();
    const multiplier = suffix === "B" ? 1000000000 : suffix === "M" ? 1000000 : suffix === "K" ? 1000 : 1;

    return Math.round(base * multiplier);
  }

  function firstVisibleText(selectors) {
    return Array.from(document.querySelectorAll(selectors))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && textOf(element);
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.top - bRect.top || aRect.left - bRect.left;
      })
      .map(textOf)[0] || "";
  }

  function visibleTexts(selectors) {
    const seen = new Set();

    return Array.from(document.querySelectorAll(selectors))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && textOf(element);
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.top - bRect.top || aRect.left - bRect.left;
      })
      .map(textOf)
      .filter((text) => {
        const key = companyKeyFromName(text);
        if (!key || seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  function extractOverviewProfile() {
    const bodyText = textOf(document.body);
    const beforeMenu = bodyText.split(/\sOverview\sTurnover\sCountries\s/i)[0] || "";
    const logoCompanyCandidates = visibleTexts(
      ".logo-company p.images-all, .logo-company .images-all, p.images-all, .logo-company p.images_all, .logo-company .images_all, p.images_all"
    );
    const headingCandidates = visibleTexts("h1, h2");
    let companyName = logoCompanyCandidates[0] || headingCandidates[0] || "";
    const headerWithoutUser = beforeMenu.replace(/^Kotrasub4\s+/i, "").trim();

    const homepageMatch = headerWithoutUser.match(/https?:\/\/\S+|www\.\S+/i);
    const phoneMatch = headerWithoutUser.match(/(?:\+\d[\d\s().-]{6,}\d|\b\d[\d\s().-]{7,}\d\b)/);
    const turnoverMatch = bodyText.match(/Annual Turnover[\s\S]*?Import\s+\$?\s*([\d.,]+\s*[KMB]?)[\s\S]*?Export\s+\$?\s*([\d.,]+\s*[KMB]?)/i);
    const shipmentMatch = bodyText.match(/Annual Shipment[\s\S]*?Import\s+([\d,]+)[\s\S]*?Export\s+([\d,]+)/i);

    const firstInfoIndex = [homepageMatch?.index, phoneMatch?.index]
      .filter((index) => typeof index === "number")
      .sort((a, b) => a - b)[0];
    const nameCountrySource = firstInfoIndex === undefined
      ? headerWithoutUser
      : headerWithoutUser.slice(0, firstInfoIndex).trim();
    const addressSource = firstInfoIndex === undefined
      ? ""
      : headerWithoutUser
        .slice(firstInfoIndex)
        .replace(homepageMatch?.[0] || "", "")
        .replace(phoneMatch?.[0] || "", "")
        .trim();

    const knownCountries = [
      "United States of America",
      "United Kingdom",
      "South Korea",
      "Switzerland",
      "Malaysia",
      "Vietnam",
      "Mexico",
      "France",
      "China",
      "Italy",
      "Spain",
      "India",
      "Japan"
    ];
    const countryOfOrigin = knownCountries.find((country) => {
      return normalizeText(nameCountrySource).endsWith(normalizeText(country));
    }) || "";

    if (!companyName && countryOfOrigin) {
      companyName = nameCountrySource.slice(0, nameCountrySource.length - countryOfOrigin.length).trim();
    } else if (!companyName) {
      companyName = nameCountrySource.trim();
    }

    const profileCompanyCandidates = Array.from(new Set([
      ...logoCompanyCandidates,
      ...headingCandidates,
      countryOfOrigin ? nameCountrySource.slice(0, nameCountrySource.length - countryOfOrigin.length).trim() : "",
      nameCountrySource.trim(),
      companyName
    ].map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean)));

    const address = addressSource;

    const annualImportTurnover = parseMoneyToNumber(turnoverMatch?.[1]);
    const annualExportTurnover = parseMoneyToNumber(turnoverMatch?.[2]) ?? 0;
    const annualImportShipment = shipmentMatch ? Number(shipmentMatch[1].replace(/,/g, "")) : null;
    const annualExportShipment = shipmentMatch ? Number(shipmentMatch[2].replace(/,/g, "")) : 0;

    const required = {
      companyName: Boolean(companyName),
      annualImportTurnover: annualImportTurnover !== null,
      annualImportShipment: annualImportShipment !== null
    };

    return {
      ok: required.companyName && required.annualImportTurnover && required.annualImportShipment,
      required,
      excelPinkBlock: {
        Company_Name: companyName,
        Annual_Import_Turnover: annualImportTurnover,
        Annual_Import_Shipment: annualImportShipment,
        Annual_Export_Turnover: annualExportTurnover,
        Annual_Export_Shipment: annualExportShipment,
        Country_of_Origin: countryOfOrigin,
        Address: address,
        Homepage: homepageMatch?.[0] || "",
        Phone_Number: phoneMatch?.[0] || ""
      },
      raw: {
        turnoverText: turnoverMatch?.[0] || "",
        shipmentText: shipmentMatch?.[0] || "",
        headerText: beforeMenu,
        logoCompanyCandidates,
        profileCompanyCandidates
      }
    };
  }

  async function scrapeOverviewProfile() {
    const overview = findExactControl("Overview", "a, button, [role='button']");
    if (!overview) {
      return {
        ok: false,
        reason: "Overview tab not found"
      };
    }

    await humanPause("navigation");
    clickElement(overview);
    await humanPause(1200, 1800);

    return extractOverviewProfile();
  }

  function parseCountryRowsFromText(bodyText, mode) {
    const valueLabel = mode === "export" ? "Export Value In %" : "Import Value In %";
    const startIndex = bodyText.indexOf(valueLabel);

    if (startIndex === -1) {
      return [];
    }

    let segment = bodyText.slice(startIndex + valueLabel.length);
    const chartIndex = segment.search(/\s0\s+[\d.]+[KMB]\s/i);
    if (chartIndex !== -1) {
      segment = segment.slice(0, chartIndex);
    }

    const rows = [];
    const rowPattern = /([A-Z][A-Z\s.'()&-]{1,90}?)\s+([\d,]+\.\d{2})\s+(\d+(?:\.\d+)?)/g;
    let match;

    while ((match = rowPattern.exec(segment)) && rows.length < 5) {
      const country = match[1].replace(/\s+/g, " ").trim();

      if (!country || normalizeText(country).includes("valueinusd")) {
        continue;
      }

      rows.push({
        country,
        valueUsd: Number(match[2].replace(/,/g, "")),
        percent: Number(match[3])
      });
    }

    return rows;
  }

  async function scrapeCountryBlocks() {
    const overview = await scrapeOverviewProfile();
    const exportTurnover = overview.excelPinkBlock?.Annual_Export_Turnover ?? 0;
    const countries = findExactControl("Countries", "a, button, [role='button']");

    if (!countries) {
      return {
        ok: false,
        reason: "Countries tab not found",
        overview
      };
    }

    await humanPause("navigation");
    clickElement(countries);
    await humanPause(1200, 1800);

    const importCountriesButton = findExactControl("Import Countries", "button, a, [role='button']");
    if (importCountriesButton) {
      await humanPause("control");
      clickElement(importCountriesButton);
      await humanPause(800, 1400);
    }

    const importRows = parseCountryRowsFromText(textOf(document.body), "import");
    let exportRows = [];
    let exportSkipped = false;
    let exportReason = "";

    if (exportTurnover > 0) {
      const exportCountriesButton = findExactControl("Export Countries", "button, a, [role='button']");

      if (exportCountriesButton) {
        await humanPause("control");
        clickElement(exportCountriesButton);
        await humanPause(900, 1500);
        exportRows = parseCountryRowsFromText(textOf(document.body), "export");
      } else {
        exportReason = "Export Countries tab not found";
      }
    } else {
      exportSkipped = true;
      exportReason = "Annual export turnover is 0";
    }

    return {
      ok: importRows.length > 0 && (exportSkipped || exportTurnover === 0 || exportRows.length > 0),
      excelBlueBlock: {
        Supplier_Country: importRows.map((row) => ({
          Value1: row.country,
          Value2: row.valueUsd
        })),
        Buyer_Country: exportRows.map((row) => ({
          Value1: row.country,
          Value2: row.valueUsd
        }))
      },
      counts: {
        importCountries: importRows.length,
        exportCountries: exportRows.length
      },
      exportSkipped,
      exportReason,
      overviewRequired: overview.required
    };
  }

  function parseCommodityRowsFromText(bodyText, mode) {
    const valueLabel = mode === "export" ? "Export Value In %" : "Import Value In %";
    const startIndex = bodyText.indexOf(valueLabel);

    if (startIndex === -1) {
      return [];
    }

    let segment = bodyText.slice(startIndex + valueLabel.length);
    const chartIndex = segment.search(/\s0\s+[\d.]+[KMB]\s/i);
    if (chartIndex !== -1) {
      segment = segment.slice(0, chartIndex);
    }

    const rows = [];
    const codeMatches = Array.from(segment.matchAll(/\b\d{6}\b/g));

    for (let index = 0; index < codeMatches.length && rows.length < 10; index += 1) {
      const match = codeMatches[index];
      const nextMatch = codeMatches[index + 1];
      const rowText = segment.slice(match.index, nextMatch?.index ?? segment.length);
      const valueMatch = rowText.slice(match[0].length).match(/[\d,]+\.\d{2}/);

      if (!valueMatch) {
        continue;
      }

      rows.push({
        hsCode: match[0],
        valueUsd: Number(valueMatch[0].replace(/,/g, ""))
      });
    }

    return rows;
  }

  async function scrapeCommodityBlocks() {
    const overview = await scrapeOverviewProfile();
    const exportTurnover = overview.excelPinkBlock?.Annual_Export_Turnover ?? 0;
    const commodities = findExactControl("Commodities", "a, button, [role='button']");

    if (!commodities) {
      return {
        ok: false,
        reason: "Commodities tab not found",
        overview
      };
    }

    await humanPause("navigation");
    clickElement(commodities);
    await humanPause(1200, 1800);

    const importButton = findExactControl("Import Commodities", "button, a, [role='button']");
    if (importButton) {
      await humanPause("control");
      clickElement(importButton);
      await humanPause(800, 1400);
    }

    const importRows = parseCommodityRowsFromText(textOf(document.body), "import");
    let exportRows = [];
    let exportSkipped = false;
    let exportReason = "";

    if (exportTurnover > 0) {
      const exportButton = findExactControl("Export Commodities", "button, a, [role='button']");

      if (exportButton) {
        await humanPause("control");
        clickElement(exportButton);
        await humanPause(900, 1500);
        exportRows = parseCommodityRowsFromText(textOf(document.body), "export");
      } else {
        exportReason = "Export Commodities tab not found";
      }
    } else {
      exportSkipped = true;
      exportReason = "Annual export turnover is 0";
    }

    return {
      ok: importRows.length > 0 && (exportSkipped || exportTurnover === 0 || exportRows.length > 0),
      excelCommodityBlock: {
        Import: importRows.map((row) => ({
          Value1: row.hsCode,
          Value2: row.valueUsd
        })),
        Export: exportRows.map((row) => ({
          Value1: row.hsCode,
          Value2: row.valueUsd
        }))
      },
      counts: {
        importCommodities: importRows.length,
        exportCommodities: exportRows.length
      },
      exportSkipped,
      exportReason,
      overviewRequired: overview.required
    };
  }

  function safeFileName(value) {
    return String(value || "company")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "company";
  }

  function downloadJson(data, fileName) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    return {
      ok: true,
      filename: fileName,
      verification: "local-python"
    };
  }

  async function confirmLocalJsonDownload(fileName, buyerName, hsCode) {
    const params = new URLSearchParams({
      filename: fileName,
      buyer: buyerName || "",
      hsCode: hsCode || "",
      requireExcel: "1",
      timeout: "20"
    });

    return fetchLocalGui(`/download-confirm?${params.toString()}`);
  }

  function dataCollectionFailureReason(data) {
    if (data?.reason) {
      return data.reason;
    }

    const missing = [];
    const required = data?.diagnostics?.overviewRequired;
    if (required) {
      if (!required.companyName) missing.push("company name");
      if (!required.annualImportTurnover) missing.push("annual import turnover");
      if (!required.annualImportShipment) missing.push("annual import shipment");
    }

    if (missing.length) {
      return `overview required fields missing: ${missing.join(", ")}`;
    }

    const countryCounts = data?.diagnostics?.countryCounts;
    if (countryCounts && !countryCounts.importCountries) {
      return "import country rows were not parsed";
    }

    const commodityCounts = data?.diagnostics?.commodityCounts;
    if (commodityCounts && !commodityCounts.importCommodities) {
      return "import commodity rows were not parsed";
    }

    return "data collection failed";
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }

    return `${number.toFixed(2).replace(/\.?0+$/, "")}%`;
  }

  function formatPlainNumber(value) {
    const digits = String(value || "").replace(/[^\d.]/g, "");
    const number = Number(digits);
    return Number.isFinite(number) && digits
      ? number.toLocaleString("en-US")
      : String(value || "-");
  }

  async function collectExcelData(hsCode, displayCompanyName = "") {
    const code = String(hsCode || "").trim();
    const stoppedBeforeCommodity = await abortIfGuiStopRequested();
    if (stoppedBeforeCommodity) {
      return stoppedBeforeCommodity;
    }

    const commodityValue = await assessCommodityValue(code);
    const stoppedAfterCommodity = await abortIfGuiStopRequested();
    if (stoppedAfterCommodity) {
      return stoppedAfterCommodity;
    }

    if (commodityValue.ok && commodityValue.missingHsCode) {
      await postLocalGuiLog(
        `[조건 확인] Import Commodities에 HS ${code}가 없습니다. 다음 바이어로 넘어갑니다.`,
        "HS코드 없음"
      );
      return {
        ok: false,
        skipped: true,
        downloaded: false,
        reason: commodityValue.reason,
        hsCode: code,
        commodityValue
      };
    }

    if (commodityValue.ok && commodityValue.qualified === false) {
      await postLocalGuiLog(
        `[조건 확인] HS ${code} 비중 ${formatPercent(commodityValue.importValuePercent)} - 기준 미달`,
        "조건 미달"
      );
      return {
        ok: false,
        skipped: true,
        downloaded: false,
        reason: `HS code import value percent is not greater than ${commodityValue.threshold}`,
        hsCode: code,
        commodityValue
      };
    }

    if (!commodityValue.ok || commodityValue.qualified !== true) {
      await postLocalGuiLog(
        `[조건 확인 실패] HS ${code} 비중을 확인하지 못했습니다.`,
        "조건 확인 실패"
      );
      return {
        ok: false,
        skipped: false,
        downloaded: false,
        reason: commodityValue.reason || "HS code import value percent could not be verified",
        hsCode: code,
        commodityValue,
        diagnostics: {
          commodityValue
        }
      };
    }

    await postLocalGuiLog(
      `[조건 확인] HS ${code} 비중 ${formatPercent(commodityValue.importValuePercent)} - 기준 통과`,
      "조건 통과"
    );
    await postLocalGuiLog(`[정보 수집] ${displayCompanyName || "회사 상세정보"}`);

    const overview = await scrapeOverviewProfile();
    const stoppedAfterOverview = await abortIfGuiStopRequested();
    if (stoppedAfterOverview) {
      return stoppedAfterOverview;
    }

    const countries = await scrapeCountryBlocks();
    const stoppedAfterCountries = await abortIfGuiStopRequested();
    if (stoppedAfterCountries) {
      return stoppedAfterCountries;
    }

    const commodities = await scrapeCommodityBlocks();
    const stoppedAfterCommodities = await abortIfGuiStopRequested();
    if (stoppedAfterCommodities) {
      return stoppedAfterCommodities;
    }

    const companyName = overview.excelPinkBlock?.Company_Name || "company";

    const data = {
      ok: Boolean(
        commodityValue.ok &&
        commodityValue.qualified &&
        overview.ok &&
        countries.ok &&
        commodities.ok
      ),
      hsCode: code,
      qualified: commodityValue.qualified,
      commodityValue,
      excel: {
        pink: overview.excelPinkBlock,
        blue: countries.excelBlueBlock,
        commodity: commodities.excelCommodityBlock
      },
      diagnostics: {
        overviewRequired: overview.required,
        countryCounts: countries.counts,
        commodityCounts: commodities.counts,
        countryExportSkipped: countries.exportSkipped,
        commodityExportSkipped: commodities.exportSkipped
      },
      downloaded: false
    };

    if (!data.ok) {
      data.reason = dataCollectionFailureReason(data);
    }

    if (data.ok) {
      const expectedFileName = `${safeFileName(companyName)}.json`;
      await humanPause("control");
      const downloadResult = downloadJson(data, expectedFileName);
      data.download = downloadResult;
      data.downloadFileName = downloadResult.filename || expectedFileName;

      if (!downloadResult.ok) {
        return {
          ...data,
          ok: false,
          fatal: true,
          reason: `JSON download failed: ${downloadResult.reason || "unknown download error"}`
        };
      }

      await humanPause("input");
      const confirmed = await confirmLocalJsonDownload(expectedFileName, companyName, code);
      data.downloadConfirmation = confirmed;

      if (!confirmed.ok) {
        return {
          ...data,
          ok: false,
          fatal: true,
          reason: `JSON download confirmation failed: ${confirmed.data?.reason || confirmed.reason || "unknown confirmation error"}`
        };
      }

      data.downloaded = Boolean(confirmed.data?.converted && confirmed.data?.outputFile);
      data.outputFile = confirmed.data?.outputFile || "";

      if (!data.downloaded) {
        return {
          ...data,
          ok: false,
          fatal: true,
          reason: "Excel file was not created after JSON download confirmation"
        };
      }
    }

    return data;
  }

  function readCollectionState() {
    try {
      const raw = sessionStorage.getItem(COLLECTION_STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeCollectionState(state) {
    sessionStorage.setItem(COLLECTION_STATE_KEY, JSON.stringify({
      ...state,
      updatedAt: new Date().toISOString()
    }));
  }

  function clearCollectionState() {
    sessionStorage.removeItem(COLLECTION_STATE_KEY);
    clearRecordNotFoundRecovery();
  }

  function createCollectionState(hsCode, targetCount, options = {}) {
    clearRecordNotFoundRecovery();
    const resultsUrl = location.href;
    const alreadySavedBuyers = options.alreadySavedBuyers || [];
    const resumeStartRowNumber = Math.max(1, Number.parseInt(options.resumeStartRowNumber, 10) || 1);
    const resumeAnchorBuyer = options.resumeAnchorBuyer || {};
    const queueTaskId = String(options.queueTaskId || "").trim();
    const resumeAnchorBuyerName = String(resumeAnchorBuyer.buyerName || "").trim();
    const resumeAnchorBuyerKey = companyKeyFromName(resumeAnchorBuyerName);
    const resumeAnchorIndex = Number.parseInt(resumeAnchorBuyer.index, 10) || 0;
    const savedBuyerKeys = Array.from(new Set(
      (Array.isArray(alreadySavedBuyers) ? alreadySavedBuyers : [])
        .map((buyer) => companyKeyFromName(buyer))
        .filter(Boolean)
    ));
    const initialVisitedCompanyKeys = USE_SAVED_BUYER_SKIP_RESUME ? savedBuyerKeys : [];

    return {
      active: true,
      phase: "results",
      hsCode: String(hsCode || "").trim(),
      targetCount,
      queueTaskId,
      resultsUrl,
      resumeStartRowNumber,
      resumeAnchorBuyerName,
      resumeAnchorBuyerKey,
      resumeAnchorIndex,
      resumeAnchorNextRowNumber: resumeAnchorIndex || resumeStartRowNumber,
      resumeAnchorFound: !resumeAnchorBuyerKey,
      useSavedBuyerSkipResume: USE_SAVED_BUYER_SKIP_RESUME,
      visitedCompanyKeys: initialVisitedCompanyKeys,
      summary: {
        ok: false,
        mode: "list",
        targetCount,
        queueTaskId,
        qualifiedSaved: 0,
        visited: 0,
        skipped: 0,
        failed: 0,
        pages: 1,
        companies: [],
        diagnostics: {
          resultsUrl,
          startedAt: new Date().toISOString(),
          queueTaskId,
          resumeMode: true,
          resumeStartRowNumber,
          resumeAnchorBuyerName,
          resumeAnchorIndex,
          resumeAnchorNextRowNumber: resumeAnchorIndex || resumeStartRowNumber,
          useSavedBuyerSkipResume: USE_SAVED_BUYER_SKIP_RESUME,
          alreadySavedBuyers: savedBuyerKeys.length
        }
      }
    };
  }

  function resultFromCollectionState(state, extra = {}) {
    return {
      ...(state?.summary || {}),
      ...extra,
      active: Boolean(state?.active),
      phase: state?.phase || null
    };
  }

  async function waitForCompanyProfileReady(timeoutMs = 45000) {
    let lastLength = 0;
    let stableCount = 0;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (await getLocalGuiStopRequested()) {
        return { ready: false, stopped: true };
      }

      if (!location.href.includes("/company-profile") || !findExactControl("Commodities", "a, button, [role='button']")) {
        await sleep(700);
        continue;
      }

      const bodyText = textOf(document.body);
      const overview = extractOverviewProfile();
      const logoCompanyReady = Boolean(overview.raw?.logoCompanyCandidates?.[0]);
      const lengthDelta = Math.abs(bodyText.length - lastLength);
      stableCount = lengthDelta < 80 ? stableCount + 1 : 0;
      lastLength = bodyText.length;

      if (
        bodyText.length > 800 &&
        stableCount >= 2 &&
        logoCompanyReady &&
        overview.required.companyName &&
        overview.required.annualImportTurnover &&
        overview.required.annualImportShipment
      ) {
        await sleep(1500);
        return { ready: true, stopped: false };
      }

      await sleep(700);
    }

    return { ready: false, stopped: false };
  }

  async function continueQualifiedCollection(state) {
    if (!state?.active) {
      return {
        ok: false,
        reason: "No active qualified-company collection state."
      };
    }

    if (await getLocalGuiStopRequested()) {
      clearCollectionState();
      state.active = false;
      state.summary.ok = false;
      state.summary.reason = "Stopped by GUI request.";
      await postLocalGuiLog("사용자 요청으로 작업을 중단했습니다.", "중단");
      return resultFromCollectionState(state, { stopped: true, reason: "Stopped by GUI request." });
    }

    if (state.summary.qualifiedSaved >= state.targetCount) {
      state.active = false;
      state.summary.ok = true;
      state.summary.diagnostics.finishedAt = new Date().toISOString();
      clearCollectionState();
      return resultFromCollectionState(state, { reason: "Target count reached." });
    }

    if (location.href.includes("/company-profile") && state.phase === "resumeAnchor") {
      return verifyResumeAnchorOnProfilePage(state);
    }

    if (location.href.includes("/company-profile")) {
      const profileReady = await waitForCompanyProfileReady();
      const profileUrl = location.href;
      const listCompanyName = state.currentCompany?.companyName || "company";

      if (profileReady.stopped) {
        clearCollectionState();
        state.active = false;
        state.summary.ok = false;
        state.summary.reason = "Stopped by GUI request.";
        await postLocalGuiLog("사용자 요청으로 작업을 중단했습니다.", "중단");
        return resultFromCollectionState(state, { stopped: true, reason: "Stopped by GUI request." });
      }

      if (!profileReady.ready) {
        await postLocalGuiLog(`오류 발생: ${listCompanyName} - 회사 상세정보 로딩이 끝나지 않았습니다.`);
        state.summary.failed += 1;
        state.summary.companies.push({
          companyName: listCompanyName,
          status: "failed",
          reason: "company profile did not finish rendering",
          profileUrl
        });
        await postLocalGuiBlankLine();
      } else {
        const result = await collectExcelData(state.hsCode, listCompanyName);
        if (result.stopped) {
          state.active = false;
          state.summary.ok = false;
          state.summary.reason = result.reason;
          writeCollectionState(state);
          return resultFromCollectionState(state, { stopped: true, reason: result.reason });
        }

        state.summary.visited += 1;

        if (result.downloaded) {
          const outputFileName = String(result.outputFile || "").split(/[\\/]/).pop();
          await postLocalGuiLog(
            `[엑셀 저장 완료] ${outputFileName || result.excel?.pink?.Company_Name || listCompanyName}`,
            "엑셀 저장 완료"
          );
          state.summary.qualifiedSaved += 1;
          state.summary.companies.push({
            companyName: result.excel?.pink?.Company_Name || listCompanyName,
            status: "saved",
            percent: result.commodityValue?.importValuePercent,
            downloadFileName: result.downloadFileName,
            outputFile: result.outputFile,
            profileUrl
          });
          await postLocalGuiBlankLine();
        } else if (result.skipped) {
          await postLocalGuiLog(`[조건 미달] ${listCompanyName}`, "조건 미달");
          state.summary.skipped += 1;
          state.summary.companies.push({
            companyName: listCompanyName,
            status: "skipped",
            percent: result.commodityValue?.importValuePercent ?? null,
            reason: result.reason,
            profileUrl
          });
          await postLocalGuiBlankLine();
        } else {
          await postLocalGuiLog(`[오류] ${listCompanyName} - ${friendlyReason(result.reason)}`, "오류 발생");
          state.summary.failed += 1;
          state.summary.companies.push({
            companyName: listCompanyName,
            status: "failed",
            reason: result.reason || "data collection failed",
            resultOk: result.ok,
            fatal: Boolean(result.fatal),
            profileUrl,
            diagnostics: result.diagnostics || result.download || null
          });
          await postLocalGuiBlankLine();

          if (result.fatal) {
            state.active = false;
            state.summary.ok = false;
            state.summary.reason = result.reason || "Fatal data collection error.";
            state.summary.diagnostics.lastUrl = location.href;
            state.summary.diagnostics.finishedAt = new Date().toISOString();
            writeCollectionState(state);
            return resultFromCollectionState(state);
          }
        }
      }

      const processedRowNumber = Number.parseInt(state.currentCompany?.rowNumber, 10);
      if (Number.isFinite(processedRowNumber)) {
        state.resumeStartRowNumber = processedRowNumber + 1;
        state.summary.diagnostics.nextBrowserRowNumber = state.resumeStartRowNumber;
      }

      state.currentCompany = null;
      state.phase = "results";
      writeCollectionState(state);

      if (await getLocalGuiStopRequested()) {
        clearCollectionState();
        state.active = false;
        state.summary.ok = false;
        state.summary.reason = "Stopped by GUI request.";
        await postLocalGuiLog("사용자 요청으로 작업을 중단했습니다.", "중단");
        return resultFromCollectionState(state, { stopped: true, reason: "Stopped by GUI request." });
      }

      if (state.summary.qualifiedSaved >= state.targetCount) {
        state.active = false;
        state.summary.ok = true;
        state.summary.diagnostics.finishedAt = new Date().toISOString();
        clearCollectionState();
        return resultFromCollectionState(state, { reason: "Target count reached." });
      }

      const returned = await goBackToResults(state.resultsUrl);
      if (returned) {
        await waitForImporterResultsReady(25000);
        return continueQualifiedCollection(readCollectionState() || state);
      }

      return resultFromCollectionState(state, { resuming: true, reason: "Returning to search results." });
    }

    if (!location.href.includes("/search-results")) {
      location.href = state.resultsUrl;
      const returned = await waitForUrlPart("/search-results", 30000);
      if (returned) {
        await waitForImporterResultsReady(25000);
        return continueQualifiedCollection(readCollectionState() || state);
      }

      return resultFromCollectionState(state, { resuming: true, reason: "Navigating back to search results." });
    }

    closeOpenMenus();
    document.body.click();
    await humanPause(500, 900);

    let candidates = await waitForImporterResultsReady(25000);
    if (!candidates.length) {
      const tabResult = await selectImportersTab();
      closeOpenMenus();
      await humanPause(800, 1400);
      candidates = await waitForImporterResultsReady(25000);

      if (!candidates.length) {
        state.summary.reason = tabResult.ok
          ? "No importer candidates found after opening Importers tab."
          : "No importer candidates found and Importers tab could not be opened.";
        state.active = false;
        writeCollectionState(state);
        return resultFromCollectionState(state);
      }
    }

    const anchorResolution = await resolveResumeAnchor(state, candidates);
    if (anchorResolution?.stopped || anchorResolution?.active === false || anchorResolution?.ok === false) {
      state.active = false;
      state.summary.ok = false;
      state.summary.reason = anchorResolution.reason || state.summary.reason || "Resume anchor resolution failed.";
      writeCollectionState(state);
      return resultFromCollectionState(state, {
        stopped: Boolean(anchorResolution?.stopped),
        reason: state.summary.reason
      });
    }

    candidates = anchorResolution.candidates || candidates;

    const visitedCompanyKeys = new Set(state.visitedCompanyKeys || []);
    const resumeStartRowNumber = Math.max(1, Number.parseInt(state.resumeStartRowNumber, 10) || 1);
    let rowRange = candidateRowRange(candidates);
    const targetResumePage = importerPageForRow(resumeStartRowNumber, inferImporterPageSize(rowRange));
    if (currentPaginationPage() !== targetResumePage) {
      await postLocalGuiLog(`[페이지 이동] ${targetResumePage}페이지로 이동합니다. (${resumeStartRowNumber}번 기준)`, "페이지 이동");
      const jumped = await goToImporterPage(targetResumePage, resumeStartRowNumber);
      state.summary.diagnostics.lastPageJump = jumped;
      if (jumped.stopped) {
        state.active = false;
        state.summary.ok = false;
        state.summary.reason = jumped.reason;
        writeCollectionState(state);
        return resultFromCollectionState(state, { stopped: true, reason: jumped.reason });
      }

      if (jumped.ok) {
        candidates = jumped.candidates?.length
          ? jumped.candidates
          : await waitForImporterResultsReady(8000);
        rowRange = candidateRowRange(candidates);
      } else {
        state.summary.reason = jumped.reason || `Could not reach importer page ${targetResumePage}.`;
        state.active = false;
        writeCollectionState(state);
        return resultFromCollectionState(state);
      }
    }

    let target = findNextImporterByRowNumber(candidates, resumeStartRowNumber, visitedCompanyKeys);

    while (!target && Number.isFinite(rowRange.max) && rowRange.max < resumeStartRowNumber) {
      const moved = await goNextImporterPage();
      state.summary.diagnostics.lastPagination = moved;

      if (!moved.ok) {
        state.summary.reason = moved.reason || `Could not reach resume row ${resumeStartRowNumber}.`;
        state.active = false;
        writeCollectionState(state);
        return resultFromCollectionState(state);
      }

      state.summary.pages += 1;
      candidates = await waitForImporterResultsReady(25000);
      rowRange = candidateRowRange(candidates);
      target = findNextImporterByRowNumber(candidates, resumeStartRowNumber, visitedCompanyKeys);
    }

    if (!target) {
      const moved = await goNextImporterPage();
      state.summary.diagnostics.lastPagination = moved;

      if (!moved.ok) {
        state.summary.reason = moved.reason || "Next page not found.";
        state.active = false;
        writeCollectionState(state);
        return resultFromCollectionState(state);
      }

      state.summary.pages += 1;
      candidates = await waitForImporterResultsReady(25000);
      target = findNextImporterByRowNumber(candidates, resumeStartRowNumber, visitedCompanyKeys);

      if (!target) {
        await selectImportersTab();
        await waitForImporterResultsReady(25000);
        candidates = getImporterCandidates();
        target = findNextImporterByRowNumber(candidates, resumeStartRowNumber, visitedCompanyKeys);
      }

      if (!target) {
        state.summary.reason = "No target importer candidates found after moving to next page.";
        state.summary.diagnostics.afterNextPage = {
          signature: importerListSignature(),
          candidateCount: getImporterCandidates().length,
          visitedCount: visitedCompanyKeys.size,
          resumeStartRowNumber,
          rowRange: candidateRowRange(getImporterCandidates()),
          candidates: importerCandidateSummary(getImporterCandidates()).slice(0, 20),
          pageTextSample: textOf(document.body).slice(0, 800)
        };
        state.active = false;
        await postLocalGuiLog(
          `No target buyer found after moving to the next page. Saved ${state.summary.qualifiedSaved}/${state.targetCount}.`,
          "Stopped"
        );
        writeCollectionState(state);
        return resultFromCollectionState(state);
      }
    }

    const companyName = target.getAttribute("title") || textOf(target);
    const companyKey = companyKeyFromElement(target);
    const rowNumber = importerRowNumberFromElement(target);
    visitedCompanyKeys.add(companyKey);
    await postLocalGuiLog(`[바이어 확인] ${rowNumber || "-"}번 ${companyName}`, "바이어 확인");

    state.visitedCompanyKeys = Array.from(visitedCompanyKeys);
    state.currentCompany = {
      companyName,
      companyKey,
      rowNumber
    };
    state.phase = "profile";
    writeCollectionState(state);

    await humanPause("navigation");
    const openedBy = openElementInSameTab(target);
    const opened = await waitForUrlPart("/company-profile", 30000);
    if (opened) {
      return continueQualifiedCollection(readCollectionState() || state);
    }

    return resultFromCollectionState(state, {
      resuming: true,
      reason: "Opening company profile.",
      opening: {
        companyName,
        openedBy
      }
    });
  }

  async function collectQualifiedCompanies(hsCode, targetCount = 60, options = {}) {
    if (!location.href.includes("/search-results")) {
      return {
        ok: false,
        mode: "list",
        targetCount,
        qualifiedSaved: 0,
        visited: 0,
        skipped: 0,
        failed: 0,
        pages: 1,
        companies: [],
        reason: "Run this from the search-results Importers list page."
      };
    }

    const state = createCollectionState(hsCode, targetCount, options);
    writeCollectionState(state);
    return continueQualifiedCollection(state);
  }

  async function runTotalAutomation(hsCode) {
    const state = readCollectionState();
    if (state?.active) {
      return continueQualifiedCollection(state);
    }

    if (location.href.includes("/search-results")) {
      return collectQualifiedCompanies(hsCode, 5);
    }

    if (location.href.includes("/company-profile")) {
      return collectExcelData(hsCode);
    }

    return {
      ok: false,
      reason: "Run Total on either the search-results list page or a company-profile page.",
      url: location.href
    };
  }

  async function autoResumeQualifiedCollection() {
    if (localGuiCommandRunning) {
      return;
    }

    const state = readCollectionState();
    if (!state?.active) {
      return;
    }

    showResult(resultFromCollectionState(state, { resuming: true, reason: "Auto-resume waiting for page." }));

    localGuiCommandRunning = true;
    try {
      const result = await continueQualifiedCollection(state);
      showResult(result);
      await reportFinishedCollectionToGui(result, "auto-resume");
    } catch (error) {
      const failedState = readCollectionState() || state;
      failedState.active = false;
      failedState.summary = failedState.summary || {};
      failedState.summary.ok = false;
      failedState.summary.reason = error?.message || String(error);
      failedState.summary.diagnostics = {
        ...(failedState.summary.diagnostics || {}),
        lastUrl: location.href,
        failedAt: new Date().toISOString()
      };
      writeCollectionState(failedState);
      const failedResult = resultFromCollectionState(failedState);
      showResult(failedResult);
      await reportFinishedCollectionToGui(failedResult, "auto-resume-error");
    } finally {
      localGuiCommandRunning = false;
    }
  }

  async function chooseFromDropdown(triggerText, optionTexts, searchText) {
    const trigger = findDropdownTrigger(triggerText) || findVisibleByText([triggerText]);
    if (!trigger) {
      return { ok: false, reason: `trigger not found: ${triggerText}` };
    }

    await humanPause("control");
    clickAt(trigger, 0.88);
    await humanPause(500, 900);

    const searchInput = findDropdownInputNear(trigger);

    if (searchInput && searchText) {
      dispatchValue(searchInput, searchText);
      await humanPause(700, 1200);
    }

    const option = findStrictOption(optionTexts) || findVisibleByText(optionTexts, { exact: true });
    if (!option) {
      return {
        ok: false,
        reason: `option not found: ${optionTexts.join(", ")}`,
        trigger: describeElement(trigger),
        searchInput: searchInput ? describeElement(searchInput) : null,
        candidates: visibleTextCandidates(optionTexts)
      };
    }

    await humanPause("control");
    clickElement(option);
    const selected = await waitForTriggerText(trigger, optionTexts);
    closeOpenMenus();
    await humanPause(500, 900);

    return {
      ok: true,
      selected,
      trigger: describeElement(trigger),
      option: describeElement(option)
    };
  }

  async function selectGlobalImport() {
    const nativeSelects = Array.from(document.querySelectorAll("select"));
    const selectResults = [];

    for (const select of nativeSelects) {
      const options = Array.from(select.options);
      const globalOption = options.find((option) => /global/i.test(option.textContent || option.value));
      const importGlobalOption = options.find((option) => /import[-\s]*global/i.test(option.textContent || option.value));

      if (globalOption && !select.value) {
        dispatchValue(select, globalOption.value);
        selectResults.push({ field: "country", value: globalOption.value, text: globalOption.textContent });
      } else if (importGlobalOption) {
        dispatchValue(select, importGlobalOption.value);
        selectResults.push({ field: "dataType", value: importGlobalOption.value, text: importGlobalOption.textContent });
      }
    }

    const countryResult = await chooseFromDropdown(
      "select country",
      ["global"],
      "Global"
    );

    closeOpenMenus();
    await humanPause(1000, 1600);

    const dataTypeResult = await chooseFromDropdown(
      "select data type",
      ["import-global", "import global"],
      "Import-Global"
    );

    let searchResult = { ok: false, reason: "skipped because selection failed" };

    if (countryResult.ok && dataTypeResult.ok) {
      await humanPause(800, 1400);
      const searchButton = await waitForSearchButton();

      if (searchButton) {
        await humanPause("control");
        clickElement(searchButton);
        await humanPause(1500, 2300);
        searchResult = {
          ok: true,
          button: describeElement(searchButton),
          urlAfterClick: location.href
        };
      } else {
        searchResult = {
          ok: false,
          reason: "search button not found or disabled"
        };
      }
    }

    return {
      ok: countryResult.ok && dataTypeResult.ok && searchResult.ok,
      nativeSelects: selectResults,
      country: countryResult,
      dataType: dataTypeResult,
      search: searchResult,
      bodyTextSample: textOf(document.body).slice(0, 1000)
    };
  }

  function showResult(data) {
    console.debug("[Export Genius Helper]", data);
  }

  async function fetchLocalGui(path) {
    try {
      const response = await fetch(`${LOCAL_GUI_URL}${path}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json();

      return {
        ok: response.ok && Boolean(data.ok),
        status: response.status,
        data
      };
    } catch (error) {
      return {
        ok: false,
        reason: error?.message || String(error),
        url: `${LOCAL_GUI_URL}${path}`
      };
    }
  }

  async function postLocalGuiRawLog(payload) {
    try {
      const response = await fetch(`${LOCAL_GUI_URL}/raw-log`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      return {
        ok: response.ok && Boolean(data.ok),
        status: response.status,
        data
      };
    } catch (error) {
      return {
        ok: false,
        reason: error?.message || String(error)
      };
    }
  }

  async function checkLocalGui() {
    return fetchLocalGui("/health");
  }

  async function checkLocalGuiCompatibility() {
    const health = await checkLocalGui();
    if (!health.ok) {
      return {
        ok: false,
        reason: health.data?.reason || health.reason || "GUI local server is not available.",
        health
      };
    }

    const expectedExtensionVersion = String(health.data?.expectedExtensionVersion || "").trim();
    const apiVersion = Number(health.data?.apiVersion || 0);
    if (expectedExtensionVersion && expectedExtensionVersion !== EXTENSION_VERSION) {
      return {
        ok: false,
        reason: `Extension version mismatch. Expected ${expectedExtensionVersion}, current ${EXTENSION_VERSION || "unknown"}.`,
        health
      };
    }
    if (apiVersion && apiVersion !== LOCAL_API_VERSION) {
      return {
        ok: false,
        reason: `Local API version mismatch. Expected ${LOCAL_API_VERSION}, current ${apiVersion}.`,
        health
      };
    }

    return {
      ok: true,
      health
    };
  }

  async function getLocalGuiTask() {
    return fetchLocalGui("/task");
  }

  async function getLocalGuiQueueCurrent() {
    return fetchLocalGui("/queue/current");
  }

  async function completeLocalGuiQueueTask(collection, task = null) {
    const params = new URLSearchParams({
      taskId: collection?.queueTaskId || task?.queueTaskId || "",
      saved: String(collection?.qualifiedSaved ?? ""),
      visited: String(collection?.visited ?? ""),
      reason: collection?.reason || ""
    });
    return fetchLocalGui(`/queue/complete?${params.toString()}`);
  }

  async function failLocalGuiQueueTask(reason, task = null) {
    const params = new URLSearchParams({
      taskId: task?.queueTaskId || "",
      reason: reason || "Queue automation failed."
    });
    return fetchLocalGui(`/queue/fail?${params.toString()}`);
  }

  async function reportFinishedCollectionToGui(collection, source = "auto-resume") {
    if (!collection || collection.active || collection.resuming) {
      return { ok: true, reported: false, reason: "Collection is still active." };
    }

    const state = readCollectionState();
    if (state?.summary?.diagnostics?.guiQueueReportedAt) {
      return { ok: true, reported: false, reason: "Collection was already reported." };
    }

    const report = collection.ok
      ? await completeLocalGuiQueueTask(collection)
      : await failLocalGuiQueueTask(collection.reason || "Auto-resumed queue task failed.", { queueTaskId: collection.queueTaskId || "" });

    await postLocalGuiRawLog({
      type: "queue-report",
      source,
      collection,
      report
    });

    if (!report.ok && report.data?.stale) {
      return {
        ok: true,
        reported: false,
        stale: true,
        report
      };
    }

    if (state) {
      state.summary = state.summary || {};
      state.summary.diagnostics = {
        ...(state.summary.diagnostics || {}),
        guiQueueReportedAt: new Date().toISOString(),
        guiQueueReportSource: source,
        guiQueueReportOk: Boolean(report.ok),
        guiQueueReportReason: report.data?.reason || report.reason || ""
      };
      writeCollectionState(state);
    }

    if (!report.ok) {
      await postLocalGuiLog(
        `자동 작업 결과 보고 실패: ${report.data?.reason || report.reason || "unknown error"}`,
        "오류 발생"
      );
    }

    const output = {
      ok: Boolean(report.ok),
      reported: true,
      report
    };

    if (collection.ok && report.ok && report.data && report.data.done === false) {
      await postLocalGuiLog("다음 작업을 이어서 시작합니다.", "Running task");
      await humanPause("task");
      output.nextRun = await startLocalGuiQueueAutomation();
    }

    return output;
  }

  async function postLocalGuiLog(message, status = "") {
    const params = new URLSearchParams({
      message: message || "",
      status: status || ""
    });
    return fetchLocalGui(`/log?${params.toString()}`);
  }

  async function postLocalGuiBlankLine() {
    return postLocalGuiLog("\u200b");
  }

  async function getLocalGuiCommand() {
    return fetchLocalGui("/command");
  }

  async function postLocalGuiCommandResult(command, ok, message) {
    const params = new URLSearchParams({
      id: String(command?.id || ""),
      ok: ok ? "true" : "false",
      message: message || ""
    });
    return fetchLocalGui(`/command-result?${params.toString()}`);
  }

  async function getLocalGuiStopRequested() {
    if (localExtensionStopRequested) {
      return true;
    }

    const result = await fetchLocalGui("/stop-request");
    return Boolean(result.ok && result.data?.stopRequested);
  }

  async function abortIfGuiStopRequested() {
    if (await getLocalGuiStopRequested()) {
      clearCollectionState();
      await postLocalGuiLog("사용자 요청으로 작업을 중단했습니다.", "중단");
      return {
        ok: false,
        fatal: true,
        stopped: true,
        reason: "Stopped by GUI request."
      };
    }

    return null;
  }

  async function loadLocalGuiTaskIntoPanel() {
    const result = await getLocalGuiTask();
    const task = result.data?.task;

    if (!result.ok || !task) {
      return result;
    }

    return {
      ok: true,
      loaded: true,
      task
    };
  }

  async function applyLocalGuiTaskCriteria() {
    const compatibility = await checkLocalGuiCompatibility();
    if (!compatibility.ok) {
      await postLocalGuiLog(`[연결 오류] ${compatibility.reason}`, "연결 오류");
      return compatibility;
    }

    const loaded = await loadLocalGuiTaskIntoPanel();
    const task = loaded.task;

    if (!loaded.ok || !task) {
      return loaded;
    }

    const criteria = await applyUserCriteria({
      hsCode: task.hsCode,
      minValue: task.minValue,
      maxValue: task.maxValue
    });

    await postLocalGuiLog(
      criteria.ok
        ? "[조건 설정 완료] 바이어 목록을 확인합니다."
        : `[조건 설정 실패] ${friendlyReason(criteria.totalValue?.reason || criteria.reason || "검색 조건을 적용하지 못했습니다.")}`,
      criteria.ok ? "조건 설정 완료" : "조건 설정 실패"
    );

    return {
      ok: Boolean(criteria.ok),
      loaded,
      criteria
    };
  }

  async function startLocalGuiTaskAutomation() {
    const applied = await applyLocalGuiTaskCriteria();
    const task = applied.loaded?.task;

    if (!applied.ok || !task) {
      return applied;
    }

    const targetCount = Math.max(1, Number.parseInt(task.targetCount, 10) || 5);
    const alreadySaved = Math.max(0, Number.parseInt(task.alreadySaved, 10) || 0);
    const remainingCount = Math.max(0, Number.parseInt(task.remainingCount, 10) || (targetCount - alreadySaved));

    if (remainingCount <= 0) {
      return {
        ok: true,
        skipped: true,
        reason: "Target already reached.",
        targetCount,
        alreadySaved,
        remainingCount,
        collection: {
          ok: true,
          qualifiedSaved: 0,
          targetCount: 0,
          companies: [],
          reason: "Target already reached."
        }
      };
    }

    if (!location.href.includes("/search-results")) {
      const openedResults = await waitForUrlPart("/search-results", 30000);
      if (!openedResults) {
        return {
          ok: false,
          reason: "Search results page did not open after applying criteria.",
          applied,
          url: location.href
        };
      }
    }

    const collection = await collectQualifiedCompanies(task.hsCode, remainingCount, {
      alreadySavedBuyers: task.alreadySavedBuyers || [],
      resumeStartRowNumber: alreadySaved + 1,
      resumeAnchorBuyer: task.lastSavedBuyer || {},
      queueTaskId: task.queueTaskId || ""
    });

    return {
      ok: Boolean(collection.ok),
      applied,
      targetCount,
      alreadySaved,
      remainingCount,
      queueTaskId: task.queueTaskId || "",
      collection
    };
  }

  function friendlyReason(reason = "") {
    const text = String(reason || "");
    if (text.includes("overview required fields missing")) {
      return "회사 기본 정보를 읽지 못했습니다.";
    }
    if (text.includes("download confirmation failed")) {
      return "파일 다운로드 확인에 실패했습니다.";
    }
    if (text.includes("download failed")) {
      return "파일 다운로드에 실패했습니다.";
    }
    if (text.includes("HS code import value percent")) {
      return "HS코드 비중 조건에 맞지 않습니다.";
    }
    if (text.includes("company profile did not finish rendering")) {
      return "회사 상세페이지 로딩이 끝나지 않았습니다.";
    }
    return text || "알 수 없는 오류가 발생했습니다.";
  }

  async function logCollectionForGui(task, collection, run = null) {
    if (!collection) {
      const reason = run?.criteria?.totalValue?.reason || run?.criteria?.reason || run?.reason || "Task could not start.";
      await postLocalGuiLog(`[작업 오류] ${task.company} / HS ${task.hsCode}: ${friendlyReason(reason)}`, "오류 발생");
      return;
    }

    if (collection.ok) {
      const totalSaved = Number(run?.alreadySaved || 0) + Number(collection.qualifiedSaved || 0);
      await postLocalGuiLog(`[작업 완료] ${task.company} / HS ${task.hsCode}`, "작업 완료");
      await postLocalGuiLog(`저장: ${totalSaved}/${run?.targetCount || collection.targetCount || "-"}`);
      return;
    }

    await postLocalGuiLog(
      `[작업 중단] ${task.company} / HS ${task.hsCode}: ${friendlyReason(collection.reason || run?.reason || "")}`,
      "오류 발생"
    );
  }

  async function startLocalGuiQueueAutomation() {
    const results = [];
    let guard = 0;
    let activeTask = null;

    await postLocalGuiLog("[자동화 시작] 선택한 작업을 순서대로 진행합니다.", "Monitoring");

    while (guard < 200) {
      guard += 1;

      if (await getLocalGuiStopRequested()) {
        clearCollectionState();
        await postLocalGuiLog("사용자 요청으로 작업을 중단했습니다.", "중단");
        return {
          ok: false,
          stopped: true,
          reason: "Stopped by GUI request.",
          results
        };
      }

      const current = await getLocalGuiQueueCurrent();
      if (!current.ok) {
        return {
          ok: false,
          reason: current.data?.reason || current.reason || "Could not read current queue task.",
          current,
          results
        };
      }

      if (current.data?.done) {
        return {
          ok: true,
          done: true,
          results,
          reason: "Queue completed."
        };
      }

      const task = current.data?.task;
      activeTask = task;
      await postLocalGuiBlankLine();
      await postLocalGuiLog(
        `[작업 시작] ${current.data?.queuePosition || "-"} / ${current.data?.queueTotal || "-"} - ${task.company} / HS ${task.hsCode}`,
        "작업 시작"
      );
      await postLocalGuiLog(
        `목표: ${task.targetCount}개 | 기존 저장: ${task.alreadySaved || 0}개 | 추가 수집: ${task.remainingCount || task.targetCount}개`
      );
      await humanPause("task");
      const run = await startLocalGuiTaskAutomation();
      results.push({
        queuePosition: current.data?.queuePosition,
        queueTotal: current.data?.queueTotal,
        task,
        run
      });

      await logCollectionForGui(task, run.collection, run);

      if (await getLocalGuiStopRequested()) {
        clearCollectionState();
        await postLocalGuiLog("사용자 요청으로 작업을 중단했습니다.", "중단");
        return {
          ok: false,
          stopped: true,
          reason: "Stopped by GUI request.",
          results
        };
      }

      if (!run.ok) {
        await failLocalGuiQueueTask(run.collection?.reason || run.reason || "Current queue task failed.", task);
        await postLocalGuiLog(`오류 발생: ${task.company} 작업이 중단되었습니다.`, "오류 발생");
        return {
          ok: false,
          reason: run.collection?.reason || run.reason || "Current queue task failed.",
          failedTask: task,
          run,
          results
        };
      }

      const completed = await completeLocalGuiQueueTask(run.collection, task);
      results[results.length - 1].completed = completed;

      if (!completed.ok) {
        if (completed.data?.stale) {
          await postLocalGuiRawLog({
            type: "stale-queue-complete-ignored",
            task,
            completed
          });
          continue;
        }

        await failLocalGuiQueueTask(completed.data?.reason || completed.reason || "Could not complete queue task.", task);
        await postLocalGuiLog(`오류 발생: ${task.company} 저장 파일 수를 확인하지 못했습니다.`, "오류 발생");
        return {
          ok: false,
          reason: completed.data?.reason || completed.reason || "Could not complete queue task.",
          failedTask: task,
          completed,
          results
        };
      }

      if (completed.data?.done) {
        await postLocalGuiLog("모든 선택 작업이 완료되었습니다.", "완료");
        await postLocalGuiBlankLine();
        return {
          ok: true,
          done: true,
          results,
          reason: "Queue completed."
        };
      }

      await postLocalGuiBlankLine();
      await postLocalGuiLog("다음 작업을 준비합니다.", "작업 준비");
      await humanPause("task");
    }

    await failLocalGuiQueueTask("Queue guard limit reached.", activeTask);
    await postLocalGuiLog("오류 발생: 작업 반복 횟수가 너무 많아 중단했습니다.", "오류 발생");
    return {
      ok: false,
      reason: "Queue guard limit reached.",
      results
    };
  }

  let localGuiCommandRunning = false;
  let localExtensionStopRequested = false;
  let extensionReadyReported = false;

  async function reportExtensionReady() {
    if (extensionReadyReported) {
      return true;
    }

    const result = await postLocalGuiRawLog({
      type: "extension-ready",
      version: HELPER_VERSION,
      extensionVersion: EXTENSION_VERSION,
      localApiVersion: LOCAL_API_VERSION,
      url: location.href
    });
    extensionReadyReported = Boolean(result.ok);
    return extensionReadyReported;
  }

  async function handleLocalGuiCommand(command) {
    if (!command?.action) {
      return;
    }

    if (command.action === "stop") {
      localExtensionStopRequested = true;
      clearCollectionState();
      await postLocalGuiLog("작업을 중단했습니다.", "중단");
      await postLocalGuiCommandResult(command, true, "작업 중단 요청을 처리했습니다.");
      return;
    }

    if (command.action !== "startQueue") {
      await postLocalGuiCommandResult(command, false, `알 수 없는 명령입니다: ${command.action}`);
      return;
    }

    if (localGuiCommandRunning) {
      await postLocalGuiCommandResult(command, false, "이미 자동 작업이 실행 중입니다.");
      return;
    }

    localExtensionStopRequested = false;
    localGuiCommandRunning = true;
    try {
      const result = await startLocalGuiQueueAutomation();
      await postLocalGuiRawLog({
        type: "command-result",
        command,
        result
      });
      await postLocalGuiCommandResult(
        command,
        Boolean(result.ok),
        result.ok ? "Automation completed." : `Automation stopped: ${result.reason || "error"}`
      );
    } catch (error) {
      const message = error?.message || String(error);
      await postLocalGuiLog(`Error: ${message}`, "Error");
      await postLocalGuiRawLog({
        type: "command-error",
        command,
        error: {
          message,
          stack: error?.stack || ""
        }
      });
      await postLocalGuiCommandResult(command, false, message);
    } finally {
      localGuiCommandRunning = false;
    }
  }

  async function pollLocalGuiCommands() {
    await reportExtensionReady();

    if (localGuiCommandRunning) {
      const runningResult = await getLocalGuiCommand();
      if (!runningResult.ok) {
        extensionReadyReported = false;
      }
      const runningCommand = runningResult.data?.command;
      if (runningResult.ok && runningCommand?.action === "stop") {
        await handleLocalGuiCommand(runningCommand);
      }
      return;
    }

    if (!location.href.includes("/search-results")) {
      return;
    }

    const result = await getLocalGuiCommand();
    if (!result.ok) {
      extensionReadyReported = false;
    }
    const command = result.data?.command;
    if (result.ok && command) {
      await handleLocalGuiCommand(command);
    }
  }

  window.exportGeniusHelper = {
    inspectPage,
    highlightControls,
    testFillFirstInput,
    selectGlobalImport,
    applyUserCriteria,
    clickFirstImporter,
    assessCommodityValue,
    scrapeOverviewProfile,
    scrapeCountryBlocks,
    scrapeCommodityBlocks,
    collectExcelData,
    collectQualifiedCompanies,
    runTotalAutomation,
    autoResumeQualifiedCollection,
    checkLocalGui,
    getLocalGuiTask,
    getLocalGuiQueueCurrent,
    loadLocalGuiTaskIntoPanel,
    applyLocalGuiTaskCriteria,
    startLocalGuiTaskAutomation,
    startLocalGuiQueueAutomation,
    readCollectionState,
    clearCollectionState
  };

  setTimeout(async () => {
    await reportExtensionReady();
    await pollLocalGuiCommands();
  }, 500);
  setTimeout(autoResumeQualifiedCollection, 1200);
  setInterval(pollLocalGuiCommands, 1500);

  return inspectPage();
})();

