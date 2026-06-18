# Export Genius 자동 저장 도구

Export Genius 검색 결과에서 조건에 맞는 바이어를 자동으로 확인하고, 최종 결과를 템플릿 기반 Excel 파일로 저장하는 자동화 도구입니다.

Python GUI가 로컬 서버를 실행하고, Edge 확장프로그램이 Export Genius 페이지에서 조건 적용과 바이어 순회를 담당합니다. 직원은 GUI에서만 시작/중단을 조작하며, 확장프로그램 버튼을 직접 누르지 않는 흐름을 기준으로 설계되어 있습니다.

## 주요 기능

- 입력 Excel에서 업체명, HS코드, USD 범위 작업 목록 생성
- 업체/HS코드별 저장 폴더 자동 생성
- Export Genius 검색 조건 자동 적용
- 조건에 맞는 바이어를 목표 개수만큼 수집
- JSON은 임시 파일로만 사용하고 최종 결과는 `.xlsx`로 저장
- 기존 저장 파일을 인정한 이어하기 지원
- 작업 여러 개를 큐로 실행
- GUI에서 진행 로그와 개발자용 원문 로그 확인

## 구성 파일

- `excel_gui.py`: 직원용 GUI, 로컬 서버, 큐 관리, JSON 확인 및 Excel 변환
- `fill_excel.py`: JSON 데이터를 템플릿 Excel에 채우는 변환 로직
- `extension/content.js`: Export Genius 페이지 자동화 content script
- `extension/manifest.json`: Edge 확장프로그램 설정
- `extension/popup.html`, `extension/popup.css`: 최소화된 확장프로그램 팝업 UI
- `requirements.txt`: Python 의존성

## 실행 준비

1. Python 패키지를 설치합니다.

```powershell
pip install -r requirements.txt
```

2. Edge에서 확장프로그램을 로드합니다.

- `edge://extensions` 접속
- 개발자 모드 활성화
- `압축 해제된 확장 로드`
- `extension` 폴더 선택

3. GUI를 실행합니다.

```powershell
python excel_gui.py
```

GUI 실행 시 로컬 서버가 함께 시작됩니다.

```text
http://127.0.0.1:8765
```

## 기본 사용 흐름

1. GUI에서 입력 Excel, 템플릿 Excel, 다운로드 폴더, 최종 저장 폴더를 선택합니다.
2. `선택 내용 확인`으로 파일 경로를 확인합니다.
3. `다음: 작업 확인`으로 작업 목록을 불러옵니다.
4. 실행할 작업을 체크하고 목표 개수를 설정합니다.
5. `다음: 모니터링`으로 이동합니다.
6. Edge에서 Export Genius 페이지를 열고 로그인합니다.
7. GUI에서 `모니터링 시작`을 누릅니다.
8. 작업 중단이 필요하면 GUI에서 `모니터링 중단`을 누릅니다.

## 저장 기준

자동화 성공 기준은 JSON 다운로드가 아니라 실제 `.xlsx` 파일 생성입니다.

- JSON 다운로드 성공만으로는 성공 처리하지 않습니다.
- GUI가 JSON을 확인하고 Excel 변환까지 완료해야 저장 성공으로 인정합니다.
- 기존 Excel 파일은 삭제하지 않습니다.
- 이어하기 시 기존 Excel 파일 개수를 목표 수량에 포함합니다.

## 이어하기 방식

이어하기는 최종 저장 폴더 안의 기존 Excel 파일을 기준으로 계산합니다.

- 기존 파일 번호와 바이어명을 읽어 마지막 저장 위치를 추정합니다.
- 브라우저 목록 번호와 Excel 파일 번호가 다를 수 있으므로 상세페이지 회사명을 2차 확인합니다.
- 목록명과 상세페이지 회사명이 다를 수 있는 Export Genius 특성을 고려합니다.
- 같은 작업의 번호 없는 기존 폴더와 번호가 붙은 새 폴더를 모두 이어하기 기준에 포함합니다.

## 작업 큐 안정화

여러 작업을 한 번에 실행할 때 작업 간 완료 보고가 섞이지 않도록 각 큐 작업에 `queueTaskId`를 부여합니다.

- 확장프로그램은 완료/실패 보고 시 `queueTaskId`를 함께 전달합니다.
- GUI는 현재 작업의 `queueTaskId`와 다르면 오래된 보고로 판단하고 무시합니다.
- 자동 재개나 브라우저 새로고침으로 늦게 도착한 보고가 다음 작업을 잘못 완료 처리하지 않도록 방지합니다.

## 로그

GUI 모니터링 로그는 직원이 이해하기 쉬운 진행 단계 중심으로 표시됩니다.

- 자동화 시작
- 작업 시작
- 조건 설정
- 이어하기 위치 확인
- 바이어 확인
- 조건 확인
- 정보 수집
- Excel 생성/저장 완료
- 조건 미달
- 작업 완료/중단

개발자용 원문 로그는 GUI의 `원문 로그 보기` 버튼에서 별도 창으로 확인할 수 있습니다.

## 확장프로그램 업데이트 후 확인

`extension/content.js` 또는 `manifest.json`을 수정한 뒤에는 항상 아래 순서로 확인합니다.

1. `edge://extensions`에서 확장프로그램 새로고침
2. Export Genius 페이지 새로고침
3. GUI에서 모니터링 시작

## 검증 명령

Python 파일 문법 검증:

```powershell
python -m py_compile excel_gui.py fill_excel.py
```

manifest JSON 검증:

```powershell
python -c "import json; json.load(open('extension/manifest.json', encoding='utf-8')); print('manifest ok')"
```

## 주의사항

- Export Genius 페이지 구조가 바뀌면 DOM 탐색 로직 수정이 필요할 수 있습니다.
- 화면 좌표 기반 자동화가 아니라 DOM/HTML 기반 탐색을 원칙으로 합니다.
- 바이어 목록이 `Record not found`로 비정상 표시되면 자동 새로고침 복구를 제한 횟수만큼 시도합니다.
- 기존 결과 Excel 파일은 자동으로 삭제하지 않습니다.
- 최종 산출물은 저장 폴더의 `.xlsx` 파일입니다.
