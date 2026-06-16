from pathlib import Path

from playwright.sync_api import sync_playwright


TARGET_URL = "https://dashboard.exportgenius.in/search-results"
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
AUTH_STATE = Path("auth/exportgenius-edge.json")
SCREENSHOT = Path("debug/search-results.png")


def clean(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.split())


def safe_print(value: str) -> None:
    print(value.encode("cp949", errors="replace").decode("cp949"))


def main() -> None:
    if not AUTH_STATE.exists():
        raise FileNotFoundError(f"세션 파일이 없습니다: {AUTH_STATE}")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=EDGE_PATH,
            headless=False,
        )
        context = browser.new_context(storage_state=str(AUTH_STATE))
        page = context.new_page()

        page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(10000)
        SCREENSHOT.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SCREENSHOT), full_page=True)

        safe_print(f"URL: {page.url}")
        safe_print(f"TITLE: {page.title()}")
        safe_print(f"SCREENSHOT: {SCREENSHOT}")
        safe_print(f"FRAME COUNT: {len(page.frames)}")
        for index, frame in enumerate(page.frames, start=1):
            safe_print(f"FRAME {index}: {frame.url}")

        html = page.locator("body").evaluate("el => el.innerHTML")
        safe_print(f"BODY HTML LENGTH: {len(html)}")
        safe_print(f"BODY HTML SAMPLE: {clean(html)[:1000]}")

        safe_print("\nVISIBLE TEXT:")
        body_text = clean(page.locator("body").inner_text(timeout=10000))
        safe_print(body_text[:4000])

        safe_print("\nINPUTS:")
        for index, element in enumerate(page.locator("input, textarea, select").all(), start=1):
            tag = element.evaluate("el => el.tagName.toLowerCase()")
            input_type = element.get_attribute("type") or ""
            name = element.get_attribute("name") or ""
            placeholder = element.get_attribute("placeholder") or ""
            aria = element.get_attribute("aria-label") or ""
            value = element.input_value() if tag in {"input", "textarea", "select"} else ""
            safe_print(
                f"{index}. tag={tag} type={input_type} name={name} "
                f"placeholder={placeholder} aria={aria} value={value}"
            )

        safe_print("\nBUTTONS/LINKS:")
        selector = "button, a, [role=button], [role=link]"
        for index, element in enumerate(page.locator(selector).all()[:80], start=1):
            tag = element.evaluate("el => el.tagName.toLowerCase()")
            text = clean(element.inner_text(timeout=1000))
            href = element.get_attribute("href") or ""
            aria = element.get_attribute("aria-label") or ""
            safe_print(f"{index}. tag={tag} text={text[:120]} aria={aria} href={href}")

        browser.close()


if __name__ == "__main__":
    main()
