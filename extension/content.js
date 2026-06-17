(() => {
  const HELPER_VERSION = "v2026-06-17-pagination-resume-paths";
  const COLLECTION_STATE_KEY = "exportGeniusQualifiedCollectionState";
  const LOCAL_GUI_URL = "http://127.0.0.1:8765";

  function textOf(element) {
    return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    return Boolean(
      element.closest("#export-genius-helper-panel") ||
      element.closest("#export-genius-helper-output")
    );
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
      message: "보이는 입력창/버튼에 빨간 표시를 했습니다."
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
      message: "첫 번째 입력 가능한 필드에 test를 입력했습니다.",
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
    return String(value || "").toLowerCase().replace(/[\s\-_/+.,:()[\]{}–—]+/g, "");
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
    await new Promise((resolve) => setTimeout(resolve, 200));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 700));

    let option = findOptionNearInput(input, optionTexts);
    let usedSearch = false;

    if (!option && searchText) {
      dispatchValue(input, searchText);
      usedSearch = true;
      await new Promise((resolve) => setTimeout(resolve, 700));
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

    clickElement(option);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    closeOpenMenus();
    await new Promise((resolve) => setTimeout(resolve, 400));

    return {
      ok: true,
      usedSearch,
      input: describeElement(input),
      option: describeElement(option)
    };
  }

  function getTopFilterCombobox(kind) {
    const inputs = Array.from(document.querySelectorAll("input[role='combobox'], input[type='search']"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
          rect.top >= 100 &&
          rect.top <= 190 &&
          rect.left > 420 &&
          rect.left < 850;
      })
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

    return kind === "condition" ? inputs[1] : inputs[0];
  }

  function getTopFilterTrigger(kind) {
    const labelText = kind === "condition" ? "select condition" : "select filter";
    const label = Array.from(document.querySelectorAll("div, span, button, input, [role='button']"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = normalizeText(textOf(element) || element.getAttribute("placeholder") || "");
        return rect.width > 0 && rect.height > 0 &&
          rect.top >= 100 &&
          rect.top <= 190 &&
          rect.left > 380 &&
          rect.left < 850 &&
          text.includes(normalizeText(labelText));
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.width * aRect.height - bRect.width * bRect.height;
      })[0];

    if (label) {
      let best = label;
      let current = label;

      for (let index = 0; index < 5 && current.parentElement; index += 1) {
        current = current.parentElement;
        const rect = current.getBoundingClientRect();
        const text = normalizeText(textOf(current));

        if (
          rect.width >= 120 &&
          rect.width <= 260 &&
          rect.height >= 32 &&
          rect.height <= 70 &&
          rect.top >= 100 &&
          rect.top <= 190 &&
          text.includes(normalizeText(labelText))
        ) {
          best = current;
        }
      }

      return best;
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
        rect.height <= 70 &&
        rect.top >= 100 &&
        rect.top <= 190
      ) {
        best = current;
      }
    }

    return best;
  }

  function getTopFilterClickTarget(kind) {
    const labelText = kind === "condition" ? "select condition" : "select filter";
    const label = Array.from(document.querySelectorAll("div, span, label"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
          rect.top >= 80 &&
          rect.top <= 130 &&
          rect.left > 380 &&
          rect.left < 850 &&
          normalizeText(textOf(element)) === normalizeText(labelText);
      })
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0];

    if (!label) {
      return null;
    }

    const rect = label.getBoundingClientRect();
    const x = rect.left + 125;
    const y = rect.top - 12;
    const target = document.elementFromPoint(x, y);

    return {
      element: target || label,
      rect,
      x,
      y
    };
  }

  function clickPoint(target) {
    const element = target.element;
    const x = target.x;
    const y = target.y;

    element.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, clientX: x, clientY: y }));
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: x, clientY: y }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
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

    const pointTarget = getTopFilterClickTarget(kind);
    const trigger = pointTarget?.element || getTopFilterTrigger(kind);

    if (!trigger) {
      return {
        ok: false,
        reason: `${kind} dropdown trigger not found`
      };
    }

    trigger.scrollIntoView({ block: "center", inline: "center" });
    closeOpenMenus();
    await new Promise((resolve) => setTimeout(resolve, 200));

    if (pointTarget) {
      clickPoint(pointTarget);
    } else {
      clickAt(trigger, 0.9);
    }
    await new Promise((resolve) => setTimeout(resolve, 700));

    const anchorRect = pointTarget
      ? {
        left: pointTarget.rect.left,
        right: pointTarget.rect.left + 280,
        bottom: pointTarget.rect.top + 24
      }
      : null;
    const option = findOptionNearTrigger(trigger, optionTexts, anchorRect);

    if (!option) {
      return {
        ok: false,
        reason: `option not found near ${kind}: ${optionTexts.join(", ")}`,
        trigger: describeElement(trigger),
        clickPoint: pointTarget ? { x: Math.round(pointTarget.x), y: Math.round(pointTarget.y) } : null,
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

    clickElement(option);
    closeOpenMenus();
    await new Promise((resolve) => setTimeout(resolve, 400));

    return {
      ok: true,
      trigger: describeElement(trigger),
      clickPoint: pointTarget ? { x: Math.round(pointTarget.x), y: Math.round(pointTarget.y) } : null,
      option: describeElement(option)
    };
  }

  function getAntdTopFilterContainer(kind) {
    const selector = kind === "condition"
      ? ".select-filter-condition"
      : ".filter-select";

    return Array.from(document.querySelectorAll(selector))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top >= 90 && rect.top <= 200;
      })
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
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
    await new Promise((resolve) => setTimeout(resolve, 150));
    clickAt(selector, 0.9);
    await new Promise((resolve) => setTimeout(resolve, 500));

    let option = findAntdOption(optionTexts);
    let usedSearch = false;

    if (!option && searchInput) {
      dispatchValue(searchInput, optionTexts[0]);
      searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
      usedSearch = true;
      await new Promise((resolve) => setTimeout(resolve, 700));
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

    clickElement(option);
    closeOpenMenus();
    await new Promise((resolve) => setTimeout(resolve, 400));

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
    installSameTabWindowOpenOverride();

    const anchor = element.closest("a[href]") || element.querySelector?.("a[href]");

    if (anchor?.href) {
      location.href = anchor.href;
      return {
        usedHref: true,
        href: anchor.href
      };
    }

    element.removeAttribute?.("target");
    clickElement(element);

    return {
      usedHref: false
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

  function setLastOneYearDates() {
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
    dispatchValue(endInput, range.end);

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
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const filterResult = await chooseTopFilterSelect("filter", ["hs code", "hscode"]);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const conditionResult = await chooseTopFilterSelect("condition", ["begin with"]);
    await new Promise((resolve) => setTimeout(resolve, 2000));
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
    await sleep(700);

    const filterButton = clickExactControl("Filter", "button, [role='button']");
    await sleep(700);

    return {
      ok: filterResult.ok && conditionResult.ok && filterButton.ok,
      filter: filterResult,
      condition: conditionResult,
      details: describeElement(detailInput),
      filterButton
    };
  }

  async function applyTotalValueRange(minValue, maxValue) {
    const existingApplied = Array.from(document.querySelectorAll("div, span, p"))
      .find((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = normalizeText(textOf(element));
        return rect.width > 0 && rect.height > 0 && rect.left < 430 &&
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
      clickElement(modify);
      await sleep(700);
    }

    const leftPanelElements = Array.from(document.querySelectorAll("div, section, aside"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = normalizeText(textOf(element));
        return rect.width > 0 && rect.height > 0 && rect.left < 430 && text.includes("filters");
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return bRect.height * bRect.width - aRect.height * aRect.width;
      });

    const panel = leftPanelElements[0] || document.body;

    const label = Array.from(panel.querySelectorAll("div, span, button, p"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = normalizeText(textOf(element));
        return rect.width > 0 && rect.height > 0 && rect.left < 430 && text.includes("totalvalueusd");
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.width * aRect.height - bRect.width * bRect.height;
      })[0];

    if (!label) {
      return {
        ok: false,
        reason: "Total Value USD filter not found",
        panel: panel === document.body ? "body" : describeElement(panel)
      };
    }

    label.scrollIntoView({ block: "center", inline: "nearest" });
    await new Promise((resolve) => setTimeout(resolve, 300));

    let row = label;
    for (let index = 0; index < 4 && row.parentElement; index += 1) {
      const parent = row.parentElement;
      const rect = parent.getBoundingClientRect();
      const text = normalizeText(textOf(parent));
      if (rect.left < 430 && rect.width <= 430 && rect.height <= 90 && text.includes("totalvalueusd")) {
        row = parent;
      }
    }

    const rowRect = row.getBoundingClientRect();
    const plus = Array.from(row.querySelectorAll("button, span, div, [role='button']"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = textOf(element).trim();
        const aria = normalizeText(element.getAttribute("aria-label") || "");
        return rect.width > 0 && rect.height > 0 &&
          rect.left > rowRect.left + rowRect.width * 0.65 &&
          !aria.includes("delete") &&
          (text === "+" || text === "" || normalizeText(text).includes("add"));
      })
      .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];

    clickAt(plus || row, 0.92);
    await new Promise((resolve) => setTimeout(resolve, 800));

    const findTotalValueInputs = () => {
      const expandedRect = row.getBoundingClientRect();
      return Array.from(document.querySelectorAll("input"))
        .filter((element) => {
          if (isHelperElement(element) || element.disabled || element.readOnly) {
            return false;
          }

          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 &&
            rect.left < 520 &&
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
        plus: plus ? describeElement(plus) : null
      };
    }

    dispatchValue(inputs[0], minValue);
    dispatchValue(inputs[1], maxValue);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const addButton = Array.from(document.querySelectorAll("button, [role='button']"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.left < 420 && normalizeText(textOf(element)) === "add";
      })[0];

    if (!addButton) {
      return {
        ok: false,
        reason: "Total Value USD Add button not found",
        inputs: inputs.map(describeElement)
      };
    }

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
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (!directCheckbox.checked) {
        clickElement(slider);
        await new Promise((resolve) => setTimeout(resolve, 200));
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
      clickElement(modify);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const label = findVisibleByText(["remove unknown exporter", "unknown exporter"]);
    if (!label) {
      return {
        ok: false,
        reason: "remove unknown exporter control not found"
      };
    }

    label.scrollIntoView({ block: "center", inline: "nearest" });
    await new Promise((resolve) => setTimeout(resolve, 300));

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

    const switchX = Math.max(220, Math.min(labelRect.right - 30, 280));
    const switchY = Math.min(window.innerHeight - 20, Math.max(20, labelRect.top + labelRect.height / 2));
    const switchTarget = document.elementFromPoint(switchX, switchY);

    if (switchTarget) {
      clickPoint({
        element: switchTarget,
        x: switchX,
        y: switchY
      });

      const resultsStable = await waitForResultsStable(12000);

      return {
        ok: true,
        clickedSwitch: describeElement(switchTarget),
        resultsStable
      };
    }

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

  async function applyUserCriteria(options) {
    const hsCode = String(options.hsCode || "").trim();
    const minValue = String(options.minValue || "50000").trim();
    const maxValue = String(options.maxValue || "5000000").trim();

    const dates = setLastOneYearDates();
    await sleep(700);
    const hsFilter = await applyHsCodeFilter(hsCode);
    await sleep(700);
    const applyHs = clickExactControl("Apply", "button, [role='button']");
    const applyResultsStable = applyHs.ok ? await waitForResultsStable(12000) : { ok: false, reason: "Apply button not clicked" };

    const importersTab = await selectImportersTab();
    await sleep(700);
    let totalValue = await applyTotalValueRange(minValue, maxValue);
    if (!totalValue.ok) {
      await sleep(1200);
      totalValue = await applyTotalValueRange(minValue, maxValue);
    }
    await sleep(700);
    const removeUnknownExporter = await enableRemoveUnknownExporter();
    await waitForImporterCandidates(8000);

    return {
      ok: dates.ok && hsFilter.ok && applyHs.ok && importersTab.ok && totalValue.ok && removeUnknownExporter.ok,
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
      dates,
      hsFilter,
      applyHs,
      applyResultsStable,
      importersTab,
      totalValue,
      removeUnknownExporter
    };
  }

  function clickFirstImporter() {
    const importerHeader = Array.from(document.querySelectorAll("th, div, span"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && normalizeText(textOf(element)) === "importer";
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];

    const headerRect = importerHeader?.getBoundingClientRect();
    const candidates = Array.from(document.querySelectorAll("a, button, [role='button'], span, div"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = textOf(element);
        const looksLikeCompany = text.length > 2 && /[a-z]/i.test(text) && ![
          "check risk",
          "view shipments",
          "supply chain",
          "address"
        ].includes(text.trim().toLowerCase());

        if (!looksLikeCompany || rect.width <= 0 || rect.height <= 0) {
          return false;
        }

        if (!headerRect) {
          return rect.left > 450 && rect.top > 350;
        }

        const inImporterColumn = rect.left >= headerRect.left - 20 && rect.left <= headerRect.right + 40;
        const belowHeader = rect.top > headerRect.bottom;
        const nearFirstRows = rect.top < headerRect.bottom + 180;

        return inImporterColumn && belowHeader && nearFirstRows;
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.top - bRect.top || aRect.left - bRect.left;
      });

    const target = candidates[0];

    if (!target) {
      return {
        ok: false,
        reason: "first importer not found",
        importerHeader: importerHeader ? describeElement(importerHeader) : null
      };
    }

    const companyName = textOf(target);
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

  async function waitForUrlPart(part, timeoutMs = 20000) {
    return Boolean(await waitUntil(() => location.href.includes(part), timeoutMs, 300, 1000));
  }

  async function goBackToResults(resultsUrl) {
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

  function findNextPageButton() {
    return Array.from(document.querySelectorAll(".pagination a, .pagination button, a, button, [role='button']"))
      .filter((element) => {
        if (isHelperElement(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const text = normalizeText(textOf(element));
        const aria = normalizeText(element.getAttribute("aria-label") || "");
        const disabled = element.getAttribute("aria-disabled") === "true" ||
          element.closest(".disabled") ||
          element.disabled;

        return rect.width > 0 && rect.height > 0 && !disabled && (text === "next" || aria === "nextpage");
      })
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
  }

  async function goNextImporterPage() {
    const beforeSignature = importerListSignature();
    const next = findNextPageButton();

    if (!next) {
      return false;
    }

    clickElement(next);
    const candidates = await waitUntil(() => {
      const currentCandidates = getImporterCandidates();
      const currentSignature = importerListSignature();

      if (currentCandidates.length && currentSignature && currentSignature !== beforeSignature && !pageLooksBusy()) {
        return currentCandidates;
      }

      return null;
    }, 25000, 600, 1000);

    return Boolean(candidates.length);
  }

  async function waitForImporterResultsReady(timeoutMs = 25000) {
    await waitForResultsStable(Math.min(timeoutMs, 12000));

    let candidates = await waitForImporterCandidates(5000);
    if (candidates.length) {
      return candidates;
    }

    await selectImportersTab();
    await waitForResultsStable(12000);
    candidates = await waitForImporterCandidates(8000);
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

    return candidates || [];
  }

  function companyKeyFromElement(element) {
    return normalizeText(element?.getAttribute("title") || (element ? textOf(element) : ""));
  }

  function findNextUnvisitedImporter(candidates, visitedCompanyKeys) {
    return candidates.find((candidate) => !visitedCompanyKeys.has(companyKeyFromElement(candidate))) || null;
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

  async function assessCommodityValue(hsCode) {
    const code = String(hsCode || "").trim();

    if (!code) {
      return {
        ok: false,
        reason: "hs code is empty"
      };
    }

    const commodities = findExactControl("Commodities", "a, button, [role='button']");
    if (!commodities) {
      return {
        ok: false,
        reason: "Commodities tab not found"
      };
    }

    clickElement(commodities);
    await waitUntil(() => findExactControl("Import Commodities", "button, a, [role='button']") || textOf(document.body).includes(code), 12000, 400, 700);

    const importCommodities = findExactControl("Import Commodities", "button, a, [role='button']");
    if (importCommodities) {
      clickElement(importCommodities);
      await waitUntil(() => textOf(document.body).includes(code), 12000, 400, 700);
    }

    const bodyText = textOf(document.body);
    const parsed = parsePercentForHsCode(bodyText, code);

    if (!parsed) {
      return {
        ok: false,
        hsCode: code,
        qualified: false,
        reason: "HS code row not found in commodities text",
        bodyTextSample: bodyText.slice(0, 1600)
      };
    }

    return {
      ok: true,
      hsCode: code,
      importValueUsdText: parsed.importValueUsdText,
      importValuePercent: parsed.importValuePercent,
      threshold: 5,
      qualified: parsed.importValuePercent > 5
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

  function extractOverviewProfile() {
    const bodyText = textOf(document.body);
    const beforeMenu = bodyText.split(/\sOverview\sTurnover\sCountries\s/i)[0] || "";
    let companyName = firstVisibleText("h1, h2") || "";
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
        headerText: beforeMenu
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

    clickElement(overview);
    await new Promise((resolve) => setTimeout(resolve, 1200));

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

    clickElement(countries);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const importCountriesButton = findExactControl("Import Countries", "button, a, [role='button']");
    if (importCountriesButton) {
      clickElement(importCountriesButton);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    const importRows = parseCountryRowsFromText(textOf(document.body), "import");
    let exportRows = [];
    let exportSkipped = false;
    let exportReason = "";

    if (exportTurnover > 0) {
      const exportCountriesButton = findExactControl("Export Countries", "button, a, [role='button']");

      if (exportCountriesButton) {
        clickElement(exportCountriesButton);
        await new Promise((resolve) => setTimeout(resolve, 900));
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

    clickElement(commodities);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const importButton = findExactControl("Import Commodities", "button, a, [role='button']");
    if (importButton) {
      clickElement(importButton);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    const importRows = parseCommodityRowsFromText(textOf(document.body), "import");
    let exportRows = [];
    let exportSkipped = false;
    let exportReason = "";

    if (exportTurnover > 0) {
      const exportButton = findExactControl("Export Commodities", "button, a, [role='button']");

      if (exportButton) {
        clickElement(exportButton);
        await new Promise((resolve) => setTimeout(resolve, 900));
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

  async function collectExcelData(hsCode) {
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

    if (!commodityValue.ok || !commodityValue.qualified) {
      return {
        ok: false,
        skipped: true,
        downloaded: false,
        reason: commodityValue.ok
          ? `HS code import value percent is not greater than ${commodityValue.threshold}`
          : commodityValue.reason,
        hsCode: code,
        commodityValue
      };
    }

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
  }

  function createCollectionState(hsCode, targetCount) {
    const resultsUrl = location.href;

    return {
      active: true,
      phase: "results",
      hsCode: String(hsCode || "").trim(),
      targetCount,
      resultsUrl,
      visitedCompanyKeys: [],
      summary: {
        ok: false,
        mode: "list",
        targetCount,
        qualifiedSaved: 0,
        visited: 0,
        skipped: 0,
        failed: 0,
        pages: 1,
        companies: [],
        diagnostics: {
          resultsUrl,
          startedAt: new Date().toISOString(),
          resumeMode: true
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
      const lengthDelta = Math.abs(bodyText.length - lastLength);
      stableCount = lengthDelta < 80 ? stableCount + 1 : 0;
      lastLength = bodyText.length;

      if (
        bodyText.length > 800 &&
        stableCount >= 2 &&
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
      } else {
        await postLocalGuiLog(`정보 확인 중: ${listCompanyName}`);
        const result = await collectExcelData(state.hsCode);
        if (result.stopped) {
          state.active = false;
          state.summary.ok = false;
          state.summary.reason = result.reason;
          writeCollectionState(state);
          return resultFromCollectionState(state, { stopped: true, reason: result.reason });
        }

        state.summary.visited += 1;

        if (result.downloaded) {
          await postLocalGuiLog(`엑셀 저장 완료: ${result.excel?.pink?.Company_Name || listCompanyName}`);
          state.summary.qualifiedSaved += 1;
          state.summary.companies.push({
            companyName: result.excel?.pink?.Company_Name || listCompanyName,
            status: "saved",
            percent: result.commodityValue?.importValuePercent,
            downloadFileName: result.downloadFileName,
            outputFile: result.outputFile,
            profileUrl
          });
        } else if (result.skipped) {
          await postLocalGuiLog(`조건 미달: ${listCompanyName}`);
          state.summary.skipped += 1;
          state.summary.companies.push({
            companyName: listCompanyName,
            status: "skipped",
            percent: result.commodityValue?.importValuePercent ?? null,
            reason: result.reason,
            profileUrl
          });
        } else {
          await postLocalGuiLog(`오류 발생: ${listCompanyName} - ${friendlyReason(result.reason)}`);
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

      location.href = state.resultsUrl;
      const returned = await waitForUrlPart("/search-results", 30000);
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
    await sleep(500);

    let candidates = await waitForImporterResultsReady(25000);
    if (!candidates.length) {
      const tabResult = await selectImportersTab();
      closeOpenMenus();
      await sleep(800);
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

    const visitedCompanyKeys = new Set(state.visitedCompanyKeys || []);
    let target = findNextUnvisitedImporter(candidates, visitedCompanyKeys);

    if (!target) {
      const moved = await goNextImporterPage();
      if (!moved) {
        state.summary.reason = "Next page not found.";
        state.active = false;
        writeCollectionState(state);
        return resultFromCollectionState(state);
      }

      state.summary.pages += 1;
      candidates = await waitForImporterResultsReady(25000);
      target = findNextUnvisitedImporter(candidates, visitedCompanyKeys);

      if (!target) {
        await selectImportersTab();
        await waitForImporterResultsReady(25000);
        candidates = getImporterCandidates();
        target = findNextUnvisitedImporter(candidates, visitedCompanyKeys);
      }

      if (!target) {
        state.summary.reason = "No unvisited importer candidates found after moving to next page.";
        state.active = false;
        await postLocalGuiLog(
          `다음 페이지에서 새 바이어를 찾지 못해 중단했습니다. 현재 엑셀 ${state.summary.qualifiedSaved}/${state.targetCount}개 저장`,
          "중단"
        );
        writeCollectionState(state);
        return resultFromCollectionState(state);
      }
    }

    const companyName = target.getAttribute("title") || textOf(target);
    const companyKey = companyKeyFromElement(target);
    visitedCompanyKeys.add(companyKey);
    await postLocalGuiLog(`바이어 확인 중: ${companyName}`);

    state.visitedCompanyKeys = Array.from(visitedCompanyKeys);
    state.currentCompany = {
      companyName,
      companyKey
    };
    state.phase = "profile";
    writeCollectionState(state);

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

  async function collectQualifiedCompanies(hsCode, targetCount = 60) {
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

    const state = createCollectionState(hsCode, targetCount);
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
    const state = readCollectionState();
    if (!state?.active) {
      return;
    }

    showResult(resultFromCollectionState(state, { resuming: true, reason: "Auto-resume waiting for page." }));

    try {
      const result = await continueQualifiedCollection(state);
      showResult(result);
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
      showResult(resultFromCollectionState(failedState));
    }
  }

  async function chooseFromDropdown(triggerText, optionTexts, searchText) {
    const trigger = findDropdownTrigger(triggerText) || findVisibleByText([triggerText]);
    if (!trigger) {
      return { ok: false, reason: `trigger not found: ${triggerText}` };
    }

    clickAt(trigger, 0.88);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const searchInput = findDropdownInputNear(trigger);

    if (searchInput && searchText) {
      dispatchValue(searchInput, searchText);
      await new Promise((resolve) => setTimeout(resolve, 700));
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

    clickElement(option);
    const selected = await waitForTriggerText(trigger, optionTexts);
    closeOpenMenus();
    await new Promise((resolve) => setTimeout(resolve, 500));

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
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const dataTypeResult = await chooseFromDropdown(
      "select data type",
      ["import-global", "import global"],
      "Import-Global"
    );

    let searchResult = { ok: false, reason: "skipped because selection failed" };

    if (countryResult.ok && dataTypeResult.ok) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const searchButton = await waitForSearchButton();

      if (searchButton) {
        clickElement(searchButton);
        await new Promise((resolve) => setTimeout(resolve, 1500));
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
    let output = document.getElementById("export-genius-helper-output");
    if (!output) {
      output = document.createElement("pre");
      output.id = "export-genius-helper-output";
      output.style.position = "fixed";
      output.style.right = "12px";
      output.style.bottom = "64px";
      output.style.zIndex = "2147483647";
      output.style.width = "420px";
      output.style.maxHeight = "480px";
      output.style.overflow = "auto";
      output.style.margin = "0";
      output.style.padding = "10px";
      output.style.border = "1px solid #94a3b8";
      output.style.borderRadius = "6px";
      output.style.background = "#ffffff";
      output.style.color = "#111827";
      output.style.font = "12px/1.35 Arial, sans-serif";
      output.style.whiteSpace = "pre-wrap";
      output.style.boxShadow = "0 12px 30px rgba(15, 23, 42, 0.22)";
      document.documentElement.appendChild(output);
    }

    output.textContent = JSON.stringify(data, null, 2);
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

  async function checkLocalGui() {
    return fetchLocalGui("/health");
  }

  async function getLocalGuiTask() {
    return fetchLocalGui("/task");
  }

  async function getLocalGuiQueueCurrent() {
    return fetchLocalGui("/queue/current");
  }

  async function completeLocalGuiQueueTask(collection) {
    const params = new URLSearchParams({
      saved: String(collection?.qualifiedSaved ?? ""),
      visited: String(collection?.visited ?? ""),
      reason: collection?.reason || ""
    });
    return fetchLocalGui(`/queue/complete?${params.toString()}`);
  }

  async function failLocalGuiQueueTask(reason) {
    const params = new URLSearchParams({
      reason: reason || "Queue automation failed."
    });
    return fetchLocalGui(`/queue/fail?${params.toString()}`);
  }

  async function postLocalGuiLog(message, status = "") {
    const params = new URLSearchParams({
      message: message || "",
      status: status || ""
    });
    return fetchLocalGui(`/log?${params.toString()}`);
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

    const hsInput = document.getElementById("export-genius-helper-hs");
    const minInput = document.getElementById("export-genius-helper-min");
    const maxInput = document.getElementById("export-genius-helper-max");

    if (hsInput) {
      hsInput.value = task.hsCode || "";
    }
    if (minInput) {
      minInput.value = task.minValue || "";
    }
    if (maxInput) {
      maxInput.value = task.maxValue || "";
    }

    return {
      ok: true,
      loaded: true,
      task
    };
  }

  async function applyLocalGuiTaskCriteria() {
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

    const collection = await collectQualifiedCompanies(task.hsCode, remainingCount);

    return {
      ok: Boolean(collection.ok),
      applied,
      targetCount,
      alreadySaved,
      remainingCount,
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
      const reason = run?.criteria?.totalValue?.reason || run?.criteria?.reason || run?.reason || "작업을 시작하지 못했습니다.";
      await postLocalGuiLog(`${task.company} / HS ${task.hsCode}: ${friendlyReason(reason)}`, "오류 발생");
      return;
    }

    await postLocalGuiLog(
      `${task.company} / HS ${task.hsCode} 작업 결과: 엑셀 ${collection.qualifiedSaved || 0}개 저장`,
      "작업 확인 중"
    );
  }

  async function startLocalGuiQueueAutomation() {
    const results = [];
    let guard = 0;

    await postLocalGuiLog("자동 작업을 시작합니다.", "모니터링 중");

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
      await postLocalGuiLog(
        `${current.data?.queuePosition}/${current.data?.queueTotal} 작업 진행 중: ${task.company} / HS ${task.hsCode} - 현재 ${task.alreadySaved || 0}/${task.targetCount}, 추가 ${task.remainingCount || task.targetCount}개`,
        "작업 진행 중"
      );
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
        await failLocalGuiQueueTask(run.collection?.reason || run.reason || "Current queue task failed.");
        await postLocalGuiLog(`오류 발생: ${task.company} 작업이 중단되었습니다.`, "오류 발생");
        return {
          ok: false,
          reason: run.collection?.reason || run.reason || "Current queue task failed.",
          failedTask: task,
          run,
          results
        };
      }

      const completed = await completeLocalGuiQueueTask(run.collection);
      results[results.length - 1].completed = completed;

      if (!completed.ok) {
        await failLocalGuiQueueTask(completed.data?.reason || completed.reason || "Could not complete queue task.");
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
        return {
          ok: true,
          done: true,
          results,
          reason: "Queue completed."
        };
      }
    }

    await failLocalGuiQueueTask("Queue guard limit reached.");
    await postLocalGuiLog("오류 발생: 작업 반복 횟수가 너무 많아 중단했습니다.", "오류 발생");
    return {
      ok: false,
      reason: "Queue guard limit reached.",
      results
    };
  }

  let localGuiCommandRunning = false;

  async function handleLocalGuiCommand(command) {
    if (!command?.action) {
      return;
    }

    if (command.action === "stop") {
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

    localGuiCommandRunning = true;
    try {
      const result = await startLocalGuiQueueAutomation();
      showResult(result);
      await postLocalGuiCommandResult(
        command,
        Boolean(result.ok),
        result.ok ? "자동 작업이 완료되었습니다." : `자동 작업이 중단되었습니다: ${result.reason || "오류"}`
      );
    } catch (error) {
      const message = error?.message || String(error);
      await postLocalGuiLog(`오류 발생: ${message}`, "오류 발생");
      await postLocalGuiCommandResult(command, false, message);
      showResult({ ok: false, reason: message });
    } finally {
      localGuiCommandRunning = false;
    }
  }

  async function pollLocalGuiCommands() {
    if (localGuiCommandRunning) {
      return;
    }

    const result = await getLocalGuiCommand();
    const command = result.data?.command;
    if (result.ok && command) {
      await handleLocalGuiCommand(command);
    }
  }

  function createPanel() {
    document.getElementById("export-genius-helper-panel")?.remove();

    const panel = document.createElement("div");
    panel.id = "export-genius-helper-panel";
    panel.style.position = "fixed";
    panel.style.right = "12px";
    panel.style.bottom = "12px";
    panel.style.zIndex = "2147483647";
    panel.style.display = "flex";
    panel.style.gap = "6px";
    panel.style.padding = "6px";
    panel.style.border = "1px solid #94a3b8";
    panel.style.borderRadius = "6px";
    panel.style.background = "#ffffff";
    panel.style.boxShadow = "0 8px 24px rgba(15, 23, 42, 0.2)";
    panel.style.alignItems = "center";
    panel.style.flexWrap = "wrap";
    panel.style.maxWidth = "520px";

    const version = document.createElement("div");
    version.textContent = HELPER_VERSION;
    version.style.width = "100%";
    version.style.font = "11px Arial, sans-serif";
    version.style.color = "#475569";
    panel.appendChild(version);

    const fields = document.createElement("div");
    fields.style.display = "flex";
    fields.style.gap = "6px";
    fields.style.alignItems = "center";

    const hsInput = document.createElement("input");
    hsInput.id = "export-genius-helper-hs";
    hsInput.placeholder = "HS";
    hsInput.value = "340130";
    hsInput.style.width = "76px";
    hsInput.style.height = "28px";
    hsInput.style.border = "1px solid #94a3b8";
    hsInput.style.borderRadius = "5px";
    hsInput.style.padding = "0 6px";
    hsInput.style.font = "12px Arial, sans-serif";

    const minInput = document.createElement("input");
    minInput.id = "export-genius-helper-min";
    minInput.placeholder = "Min";
    minInput.value = "50000";
    minInput.style.width = "82px";
    minInput.style.height = "28px";
    minInput.style.border = "1px solid #94a3b8";
    minInput.style.borderRadius = "5px";
    minInput.style.padding = "0 6px";
    minInput.style.font = "12px Arial, sans-serif";

    const maxInput = document.createElement("input");
    maxInput.id = "export-genius-helper-max";
    maxInput.placeholder = "Max";
    maxInput.value = "5000000";
    maxInput.style.width = "92px";
    maxInput.style.height = "28px";
    maxInput.style.border = "1px solid #94a3b8";
    maxInput.style.borderRadius = "5px";
    maxInput.style.padding = "0 6px";
    maxInput.style.font = "12px Arial, sans-serif";

    fields.appendChild(hsInput);
    fields.appendChild(minInput);
    fields.appendChild(maxInput);
    panel.appendChild(fields);

    const buttons = [
      ["확인", () => showResult(inspectPage())],
      ["표시", () => showResult(highlightControls())],
      ["입력", () => showResult(testFillFirstInput())],
      ["Global", async () => showResult(await selectGlobalImport())],
      ["GUI", async () => showResult(await checkLocalGui())],
      ["작업", async () => showResult(await getLocalGuiTask())],
      ["가져오기", async () => showResult(await loadLocalGuiTaskIntoPanel())],
      ["작업적용", async () => showResult(await applyLocalGuiTaskCriteria())],
      ["작업시작", async () => showResult(await startLocalGuiTaskAutomation())],
      ["전체작업", async () => showResult(await startLocalGuiQueueAutomation())],
      ["Stop", () => {
        clearCollectionState();
        showResult({ ok: true, stopped: true, reason: "Qualified-company collection state cleared." });
      }],
      ["조건", async () => showResult(await applyUserCriteria({
        hsCode: hsInput.value,
        minValue: minInput.value,
        maxValue: maxInput.value
      }))],
      ["전체", async () => showResult(await runTotalAutomation(hsInput.value))],
      ["닫기", () => document.getElementById("export-genius-helper-output")?.remove()]
    ];

    buttons.forEach(([label, action]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.height = "30px";
      button.style.minWidth = "44px";
      button.style.border = "1px solid #2563eb";
      button.style.borderRadius = "5px";
      button.style.background = "#2563eb";
      button.style.color = "#ffffff";
      button.style.font = "12px Arial, sans-serif";
      button.style.cursor = "pointer";
      button.addEventListener("click", action);
      panel.appendChild(button);
    });

    document.documentElement.appendChild(panel);
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

  createPanel();
  setTimeout(autoResumeQualifiedCollection, 1200);
  setInterval(pollLocalGuiCommands, 1500);

  return inspectPage();
})();
