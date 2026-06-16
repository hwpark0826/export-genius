from pathlib import Path
import time

from playwright.sync_api import sync_playwright


START_URL = "https://dashboard.exportgenius.in/"
TARGET_URL = "https://dashboard.exportgenius.in/search-results"
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
AUTH_STATE = Path("auth/exportgenius-edge.json")
LOGIN_TIMEOUT_SECONDS = 15 * 60


def main() -> None:
    AUTH_STATE.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=EDGE_PATH,
            headless=False,
        )
        context = browser.new_context()
        page = context.new_page()

        page.goto(START_URL, wait_until="domcontentloaded")

        print("")
        print("Edge 창에서 Export Genius에 수동으로 로그인하세요.")
        print("로그인 후 정상 search-results 화면으로 이동하면 세션을 자동 저장합니다.")

        deadline = time.monotonic() + LOGIN_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            current_url = page.url
            body_text = page.locator("body").inner_text(timeout=3000)
            is_search_results = "dashboard.exportgenius.in/search-results" in current_url
            is_error = "Something went wrong" in body_text or "Cloudflare" in page.title()
            has_rendered_content = len(body_text.strip()) > 50

            if is_search_results and has_rendered_content and not is_error:
                page.wait_for_load_state("domcontentloaded")
                context.storage_state(path=str(AUTH_STATE))
                print(f"로그인 세션을 저장했습니다: {AUTH_STATE}")
                break

            time.sleep(1)
        else:
            raise TimeoutError("제한 시간 안에 search-results 화면에 도착하지 못했습니다.")

        browser.close()


if __name__ == "__main__":
    main()
