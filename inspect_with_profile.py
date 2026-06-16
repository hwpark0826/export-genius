from pathlib import Path

from playwright.sync_api import sync_playwright


START_URL = "https://dashboard.exportgenius.in/"
TARGET_URL = "https://dashboard.exportgenius.in/search-results"
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PROFILE_DIR = Path("edge-profile/exportgenius")
SCREENSHOT = Path("debug/search-results-profile.png")


def clean(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.split())


def safe_print(value: str) -> None:
    print(value.encode("cp949", errors="replace").decode("cp949"))


def main() -> None:
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOT.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            executable_path=EDGE_PATH,
            headless=False,
            viewport={"width": 1365, "height": 768},
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(START_URL, wait_until="domcontentloaded", timeout=60000)

        safe_print("")
        safe_print("Edge 창에서 로그인한 뒤 search-results 화면으로 이동하세요.")
        safe_print("정상 페이지가 렌더링되면 자동으로 구조를 출력합니다. 최대 15분 대기합니다.")

        page.wait_for_function(
            """
            () => {
              const text = document.body?.innerText || "";
              return location.href.includes("/search-results") &&
                text.trim().length > 50 &&
                !text.includes("Something went wrong") &&
                !document.title.includes("Cloudflare");
            }
            """,
            timeout=15 * 60 * 1000,
        )
        page.wait_for_timeout(3000)
        page.screenshot(path=str(SCREENSHOT), full_page=True)

        safe_print(f"URL: {page.url}")
        safe_print(f"TITLE: {page.title()}")
        safe_print(f"SCREENSHOT: {SCREENSHOT}")

        safe_print("\nVISIBLE TEXT:")
        safe_print(clean(page.locator("body").inner_text(timeout=10000))[:4000])

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
        for index, element in enumerate(page.locator(selector).all()[:100], start=1):
            tag = element.evaluate("el => el.tagName.toLowerCase()")
            text = clean(element.inner_text(timeout=1000))
            href = element.get_attribute("href") or ""
            aria = element.get_attribute("aria-label") or ""
            safe_print(f"{index}. tag={tag} text={text[:120]} aria={aria} href={href}")

        context.close()


if __name__ == "__main__":
    main()
