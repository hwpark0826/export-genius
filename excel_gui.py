from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox

from fill_excel import fill_workbook, load_data, safe_filename


DEFAULT_TEMPLATE = Path(r"C:\Users\user\Desktop\굿아이디어\340130\3. Grupo Frabel, S.A. de C.V..xlsx")
DEFAULT_OUTPUT_DIR = Path(r"C:\Users\user\Desktop\굿아이디어\340130")


class ExcelGui:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Export Genius Excel Maker")
        self.root.geometry("720x260")
        self.root.minsize(680, 240)

        self.template_var = tk.StringVar(value=str(DEFAULT_TEMPLATE) if DEFAULT_TEMPLATE.exists() else "")
        self.json_var = tk.StringVar()
        self.json_dir_var = tk.StringVar(value=str(Path.home() / "Downloads"))
        self.output_dir_var = tk.StringVar(value=str(DEFAULT_OUTPUT_DIR) if DEFAULT_OUTPUT_DIR.exists() else "")
        self.status_var = tk.StringVar(value="JSON 파일을 선택한 뒤 엑셀을 생성하세요.")

        self.build()

    def build(self) -> None:
        frame = tk.Frame(self.root, padx=14, pady=14)
        frame.pack(fill="both", expand=True)
        frame.columnconfigure(1, weight=1)

        self.add_file_row(frame, 0, "템플릿 xlsx", self.template_var, self.choose_template)
        self.add_file_row(frame, 1, "데이터 JSON", self.json_var, self.choose_json)
        self.add_file_row(frame, 2, "JSON 폴더", self.json_dir_var, self.choose_json_dir)
        self.add_file_row(frame, 3, "저장 폴더", self.output_dir_var, self.choose_output_dir)

        create_button = tk.Button(frame, text="엑셀 생성", height=2, command=self.create_excel)
        create_button.grid(row=4, column=0, columnspan=3, sticky="ew", pady=(14, 6))

        batch_button = tk.Button(frame, text="JSON 폴더 일괄 변환", height=2, command=self.create_batch_excels)
        batch_button.grid(row=5, column=0, columnspan=3, sticky="ew", pady=(0, 8))

        status = tk.Label(frame, textvariable=self.status_var, anchor="w", justify="left", fg="#1f2937")
        status.grid(row=6, column=0, columnspan=3, sticky="ew")

    def add_file_row(self, frame: tk.Frame, row: int, label: str, variable: tk.StringVar, command) -> None:
        tk.Label(frame, text=label, anchor="w", width=12).grid(row=row, column=0, sticky="w", pady=5)
        tk.Entry(frame, textvariable=variable).grid(row=row, column=1, sticky="ew", padx=(8, 8), pady=5)
        tk.Button(frame, text="찾기", width=10, command=command).grid(row=row, column=2, sticky="e", pady=5)

    def choose_template(self) -> None:
        path = filedialog.askopenfilename(
            title="템플릿 xlsx 선택",
            filetypes=[("Excel files", "*.xlsx")],
            initialdir=str(DEFAULT_TEMPLATE.parent if DEFAULT_TEMPLATE.parent.exists() else Path.home()),
        )
        if path:
            self.template_var.set(path)

    def choose_json(self) -> None:
        downloads = Path.home() / "Downloads"
        path = filedialog.askopenfilename(
            title="데이터 JSON 선택",
            filetypes=[("JSON files", "*.json")],
            initialdir=str(downloads if downloads.exists() else Path.home()),
        )
        if path:
            self.json_var.set(path)
            self.json_dir_var.set(str(Path(path).parent))

    def choose_json_dir(self) -> None:
        path = filedialog.askdirectory(
            title="JSON 폴더 선택",
            initialdir=self.json_dir_var.get() or str(Path.home() / "Downloads"),
        )
        if path:
            self.json_dir_var.set(path)

    def choose_output_dir(self) -> None:
        path = filedialog.askdirectory(
            title="저장 폴더 선택",
            initialdir=self.output_dir_var.get() or str(Path.home()),
        )
        if path:
            self.output_dir_var.set(path)

    def create_excel(self) -> None:
        try:
            template_path = Path(self.template_var.get())
            json_path = Path(self.json_var.get())
            output_dir = Path(self.output_dir_var.get())

            if not template_path.exists():
                raise FileNotFoundError("템플릿 xlsx 파일을 찾을 수 없습니다.")
            if not json_path.exists():
                raise FileNotFoundError("데이터 JSON 파일을 찾을 수 없습니다.")
            if not output_dir.exists():
                output_dir.mkdir(parents=True, exist_ok=True)

            data = load_data(json_path)
            company_name = data.get("excel", {}).get("pink", {}).get("Company_Name") or json_path.stem
            output_path = output_dir / f"{safe_filename(company_name)}.xlsx"

            fill_workbook(template_path, json_path, output_path)

            self.status_var.set(f"생성 완료: {output_path}")
            messagebox.showinfo("완료", f"엑셀 파일을 생성했습니다.\n\n{output_path}")
        except Exception as error:
            self.status_var.set(f"오류: {error}")
            messagebox.showerror("오류", str(error))

    def create_batch_excels(self) -> None:
        try:
            template_path = Path(self.template_var.get())
            json_dir = Path(self.json_dir_var.get())
            output_dir = Path(self.output_dir_var.get())

            if not template_path.exists():
                raise FileNotFoundError("템플릿 xlsx 파일을 찾을 수 없습니다.")
            if not json_dir.exists():
                raise FileNotFoundError("JSON 폴더를 찾을 수 없습니다.")
            if not output_dir.exists():
                output_dir.mkdir(parents=True, exist_ok=True)

            json_files = sorted(json_dir.glob("*.json"), key=lambda path: path.stat().st_mtime)
            if not json_files:
                raise FileNotFoundError("선택한 폴더에 JSON 파일이 없습니다.")

            created = 0
            skipped = 0
            errors = []

            for json_path in json_files:
                try:
                    data = load_data(json_path)
                    if data.get("qualified") is False:
                        skipped += 1
                        continue

                    company_name = data.get("excel", {}).get("pink", {}).get("Company_Name") or json_path.stem
                    output_path = output_dir / f"{created + 1}. {safe_filename(company_name)}.xlsx"
                    fill_workbook(template_path, json_path, output_path)
                    created += 1
                except Exception as error:
                    errors.append(f"{json_path.name}: {error}")

            message = f"완료: {created}개 생성, {skipped}개 제외"
            if errors:
                message += f", 오류 {len(errors)}개"

            self.status_var.set(message)
            messagebox.showinfo("일괄 변환 완료", message)
        except Exception as error:
            self.status_var.set(f"오류: {error}")
            messagebox.showerror("오류", str(error))


def main() -> None:
    root = tk.Tk()
    ExcelGui(root)
    root.mainloop()


if __name__ == "__main__":
    main()
