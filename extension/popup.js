const result = document.getElementById("result");

async function runInPage(functionName) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    result.textContent = "활성 탭을 찾지 못했습니다.";
    return;
  }

  if (!tab.url?.startsWith("https://dashboard.exportgenius.in/")) {
    result.textContent = "Export Genius 대시보드 탭에서 실행하세요.";
    return;
  }

  const [{ result: pageResult }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });

  const [{ result: actionResult }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (name) => window.exportGeniusHelper[name](),
    args: [functionName],
  });

  result.textContent = JSON.stringify(actionResult || pageResult, null, 2);
}

document.getElementById("inspect").addEventListener("click", () => {
  runInPage("inspectPage").catch((error) => {
    result.textContent = String(error?.message || error);
  });
});

document.getElementById("highlight").addEventListener("click", () => {
  runInPage("highlightControls").catch((error) => {
    result.textContent = String(error?.message || error);
  });
});

document.getElementById("testFill").addEventListener("click", () => {
  runInPage("testFillFirstInput").catch((error) => {
    result.textContent = String(error?.message || error);
  });
});
