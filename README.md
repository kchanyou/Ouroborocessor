# Ouroborocessor

Ouroborocessor는 장편 원고를 위한 로컬 우선 글쓰기 앱이다. 원고를 폴더와 문서의 트리로 정리하고, 여러 문서를 탭으로 열어 작업할 수 있다. 프로젝트 파일은 사용자가 고른 폴더에 남는다.

현재 버전은 `0.1.0-beta.1`. macOS 11 이상 Apple Silicon 환경을 우선 검증 중이며, 서명·공증이 끝나기 전의 빌드는 개발용으로만 제공한다.

## 주요 기능

- 폴더와 원고의 트리 구조, 드래그 앤 드롭 재배치
- 여러 문서를 여는 탭과 키보드 단축키
- 주 창과 옆 창으로 나누는 분할 보기. 탭을 끌어 옮기거나 `⌘\`로 나누고, 양쪽에서 편집하거나 옆에 자료를 띄운다
- 본문 이미지 삽입·드롭·재배치와 대체 텍스트
- 프로젝트 검색·바꾸기, 장면별 이력, 충돌 사본
- 인물·장소·설정 자료 카드와 원고 링크
- Markdown 백업과 DOCX 내보내기
- 글자 크기, 줄 간격, 자간, 본문 폭 설정
- 에디터 배경 테마(종이·세피아·안개·슬레이트·밤·직접 지정)와 글꼴(명조·고딕·둥근 고딕·고정폭·설치된 글꼴) 선택
- 한국어, 영어, 스페인어, 일본어, 중국어 간체 인터페이스
- 계정·광고·분석·클라우드 동기화 없는 로컬 작업

## 저장 방식

`.story` 폴더가 프로젝트의 원본이다. 원고 본문은 개별 파일로 저장하고 `project.json`이 트리와 메타데이터를 관리한다. 자동 저장은 외부 변경을 감지하며, 저장 실패 시 편집 내용을 복구 초안에 남긴다.

프로젝트 형식과 안전장치는 [저장 및 복구](docs/SAVE_SAFETY.md), [DOCX 내보내기](docs/DOCX_EXPORT.md) 문서에 정리되어 있다.

## 개발

필수 환경:

- Node.js 22.12 이상
- Rust stable
- [Tauri 2 플랫폼별 시스템 의존성](https://v2.tauri.app/start/prerequisites/)

```bash
npm install
npm run tauri dev
```

웹 UI만 실행하려면 `npm run dev` 사용.

## 검증

```bash
npm run check
```

이 명령은 문서 링크, 웹 테스트와 빌드, Rust 형식과 테스트를 한 번에 확인한다. 같은 검사는 GitHub의 pull request와 `main` 브랜치 갱신 때도 실행된다.

`npm run release:beta`는 테스트, 오픈소스 고지 생성, macOS 앱과 DMG 생성, 내부 출시 관문을 순서대로 실행한다.

## 코드 구성

- `src/`: React UI, 편집기, 프로젝트 상태와 접근성 동작
- `src-tauri/src/`: 파일 저장, 충돌 보호, 이력, 이미지와 내보내기
- `scripts/`: 오픈소스 고지와 출시 검사
- `docs/`: 사용자 안내, 설계 결정, 검증 기록

문서 안내는 [docs/README.md](docs/README.md) 참고.

## 공개 베타 상태

1.0 기능 범위는 동결 상태이고, 2026-09-29의 UI 개선은 예외로 추가했다([출시 범위](docs/RELEASE_FREEZE.md)). 공개 배포 전 남은 필수 작업은 Developer ID 서명·공증과 공식 다운로드 URL 확정이다. 최신 상태는 [공개 베타 안내](docs/PUBLIC_BETA_RELEASE.md)에 기록한다.

## 개인정보와 사용권

- [개인정보 처리 안내](docs/PRIVACY.md)
- [무료 사용권](docs/FREEWARE_LICENSE.md)
- [오픈소스 고지](docs/OPEN_SOURCE_NOTICES.md)
- [보안 문제 제보](SECURITY.md)
- [기여 안내](CONTRIBUTING.md)

이 저장소의 공개는 별도의 오픈소스 사용권 부여를 의미하지 않는다. 소프트웨어 사용 조건은 `LICENSE`와 무료 사용권 문서 적용.

Copyright © 2026 김찬영(Kim Chanyoung)  
문의: `qurioturio@gmail.com`
