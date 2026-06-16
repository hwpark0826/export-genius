from pathlib import Path

from playwright.sync_api import sync_playwright


TARGET_URL = "https://dashboard.exportgenius.in/search-results"
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
AUTH_STATE = Path("auth/exportgenius-edge.json")


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

        page.goto(TARGET_URL, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

        print(f"현재 URL: {page.url}")
        print(f"페이지 제목: {page.title()}")

        browser.close()


if __name__ == "__main__":
    main()
