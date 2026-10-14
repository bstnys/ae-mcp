# ae-mcp

Claude가 화면 미러링 없이 After Effects를 직접 조작하게 해 주는 MCP 서버와 AE 확장 패널입니다.

```
Claude (Desktop / Code)
   │  MCP (stdio)
   ▼
server/  ae-mcp MCP 서버 (Node)
   │  HTTP 127.0.0.1:8642 + 실행마다 새로 만드는 토큰
   ▼
extension/  Claude Bridge 패널 (CEP)
   │  evalScript
   ▼
extension/jsx/host.jsx  (ExtendScript) → After Effects
```

- 패널은 AE가 켜질 때 백그라운드에서 자동으로 시작되고, 포트와 토큰을 `~/Library/Application Support/ae-mcp/bridge.json`에 기록합니다. MCP 서버는 매 호출마다 이 파일을 읽으므로 따로 설정할 것이 없습니다.
- Claude가 한 모든 수정은 `Claude: <작업명>` 실행 취소 그룹으로 묶여서 Cmd+Z 한 번에 되돌릴 수 있습니다.

## 요구 사항

- macOS, After Effects 2022 이상 (2026에서 사용 예정)
- Node.js 18 이상

## 설치

```bash
git clone <this repo> ~/ae-mcp
cd ~/ae-mcp
./scripts/install-mac.sh
```

설치 스크립트가 하는 일:
1. `extension/`을 `~/Library/Application Support/Adobe/CEP/extensions/com.aemcp.bridge`로 심볼릭 링크
2. 서명되지 않은 확장을 허용하도록 `com.adobe.CSXS.11~13`의 `PlayerDebugMode`를 1로 설정
3. `server/` 의존성 설치
4. Claude Console 단축키(`Ctrl+Shift+C`) 등록

그다음 After Effects를 다시 시작하고 **Window > Extensions > Claude Bridge**를 열어 초록 점을 확인한 뒤, 스크립트가 출력한 명령으로 Claude에 MCP 서버를 등록합니다.

```bash
claude mcp add after-effects -- "$(command -v node)" ~/ae-mcp/server/src/index.js
```

## Claude Console (AE 안에서 바로 입력)

FX Console처럼 단축키로 떠 있는 입력창을 열고, 할 일을 적으면 Claude가 바로 AE를 조작합니다.

- **열기:** `Ctrl+Shift+C` (또는 Window > Extensions > Claude Console)
- **Enter** 보내기 · **Shift+Enter** 줄바꿈 · **Esc** 닫기(작업 중이면 중지) · **↑/↓** 이전 입력 · **⌘N** 새 대화
- 창을 닫았다 열어도 대화가 이어집니다. 새로 시작하려면 "새 대화"를 누르세요.

**동작 방식:** 콘솔이 맥에 설치된 Claude Code를 `claude -p`로 실행하고, 이 저장소의 MCP 서버만 연결해 AE 도구만 쓰도록 허용합니다. 본인 Claude 계정 로그인을 그대로 쓰므로 API 키가 필요 없습니다. 처음 한 번만 설치하고 로그인하세요.

```bash
curl -fsSL https://claude.ai/install.sh | bash
claude   # 처음 실행 시 로그인
```

**단축키 바꾸기:** `./scripts/set-console-shortcut.sh '@$k'` (`^` Ctrl, `~` Option, `$` Shift, `@` Cmd) 후 AE 재시작. macOS의 앱 단축키 기능을 쓰므로 시스템 설정 > 키보드 > 키보드 단축키 > 앱 단축키에서도 바꿀 수 있습니다.

**선택 설정:** `~/Library/Application Support/ae-mcp/console.json`에 `{"model": "sonnet"}`처럼 모델을, `claudePath`/`nodePath`로 실행 파일 경로를 지정할 수 있습니다.

## 도구

| 도구 | 하는 일 |
|---|---|
| `ae_status` | 연결 확인, AE 버전, 활성 컴포 |
| `ae_get_project` | 프로젝트 아이템 목록(id 포함) |
| `ae_get_comp` | 컴포 설정과 레이어 목록 |
| `ae_get_layer` | 레이어 속성 트리, 값, 키프레임 수, 익스프레션 |
| `ae_get_selection` | 사용자가 AE에서 선택한 레이어/속성 |
| `ae_render_frame` | 프레임을 PNG로 렌더해 이미지로 반환 (Claude가 결과를 직접 봄) |
| `ae_create_comp` | 컴포 생성 |
| `ae_add_layer` | 솔리드, 텍스트, 셰이프(사각형/원), 널, 카메라, 라이트, 푸티지 |
| `ae_set_layer` | 이름, 켜기/끄기, 3D, 시간, 라벨, 부모, 순서 |
| `ae_delete_layer`, `ae_duplicate_layer` | 레이어 삭제/복제 |
| `ae_set_property` | 속성 값 설정 (텍스트 스타일 포함) |
| `ae_set_keyframes` | 키프레임, 보간, 이지 이즈 |
| `ae_set_expression` | 익스프레션 설정, 오류 반환 |
| `ae_apply_effect` | 이펙트 적용과 파라미터 설정 |
| `ae_import_file` | 파일 가져오기 |
| `ae_add_to_render_queue` | 렌더 큐 추가(선택적으로 렌더 시작) |
| `ae_run_jsx` | 임의 ExtendScript 실행. `AE_MCP_ALLOW_RUN_JSX=1`일 때만 노출 |

## 보안

- 브리지는 `127.0.0.1`에만 열리고, AE가 시작될 때마다 새 토큰을 만들어 권한 0600 파일에 저장합니다.
- 브라우저에서 오는 요청(`Origin` 헤더 있음)은 거부합니다.
- 임의 코드 실행 도구(`ae_run_jsx`)는 기본으로 꺼져 있습니다.

## 개발

```bash
cd server
npm install
npm test
```

테스트는 AE 스크립팅 DOM을 흉내 낸 가짜 AE(`server/test/mock-ae.js`) 위에서 `host.jsx`를 실제로 실행하고, MCP 클라이언트 → MCP 서버 → 브리지 → host.jsx 전체 경로를 검증합니다. `host.jsx`가 ES3 문법(ExtendScript)만 쓰는지도 검사합니다. 실제 AE에서의 동작은 따로 확인해야 합니다.

패널 디버깅: AE를 켠 상태에서 Chrome으로 `http://localhost:8088`(Bridge) 또는 `http://localhost:8089`(Console)를 열면 DevTools가 열립니다.

## 알려진 한계

- CEP는 Adobe가 장기적으로 UXP로 대체할 예정입니다. AE UXP가 정식 출시되면 `extension/`만 UXP로 바꾸면 되도록 MCP 서버와 브리지 프로토콜을 분리해 두었습니다.
- AE에 모달 대화상자가 열려 있으면 스크립트가 실행되지 않아 요청이 시간 초과됩니다.
- `ae_render_frame`은 AE의 `CompItem.saveFrameToPng`를 사용합니다.
