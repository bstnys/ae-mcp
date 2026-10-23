# AE Tetris

After Effects 안에서 하는 테트리스 패널(CEP)입니다. 도킹 가능한 패널이라 작업하다 옆에 붙여 두고 할 수 있어요. macOS 전용 설치 스크립트를 제공합니다.

## 설치

```bash
./tetris/install-mac.sh
```

After Effects를 다시 시작하고 **Window > Extensions > AE Tetris**를 엽니다.

스크립트는 `extension/`을 `~/Library/Application Support/Adobe/CEP/extensions/com.aemcp.tetris`에 복사하고, 서명되지 않은 확장을 허용하도록 `com.adobe.CSXS.9~13`의 `PlayerDebugMode`를 1로 설정합니다. 지우려면 `./tetris/uninstall-mac.sh`.

## 조작

| 키 | 동작 |
|---|---|
| ← → (A D) | 이동 (꾹 누르면 연속 이동) |
| ↓ (S) | 소프트 드롭 |
| Space | 하드 드롭 |
| ↑ / X (W) | 시계 방향 회전 |
| Z | 반시계 방향 회전 |
| C / Shift | 홀드 |
| P / Esc | 일시정지 |
| R | 재시작 · Enter 시작/계속 |

화면은 패널 크기에 맞춰 통째로 커지고 작아집니다. 넓은 패널에서는 보드 양옆에 Hold와 Next·점수가 붙고, 좁고 긴 패널(옆에 도킹)에서는 Hold·Next가 보드 위로, 점수가 아래로 옮겨가 보드를 최대한 크게 보여 줍니다.

패널을 한 번 클릭해야 키 입력이 패널로 들어옵니다. 패널 밖을 클릭하면 자동으로 일시정지돼요. 게임 중에는 Space, 화살표 등을 패널이 가져가므로 AE의 프리뷰 재생이나 레이어 이동이 실행되지 않습니다.

## 규칙

현대 테트리스 가이드라인을 따릅니다: 7-bag 랜덤, SRS 회전과 벽 킥, 고스트, 홀드, 다음 블록 5개, 락 딜레이(0.5초, 최대 15회 리셋), T-스핀·백투백·콤보 점수, 10줄마다 레벨 업. 최고 점수는 패널에 저장됩니다.

## 테스트

```bash
node --test tetris/test/tetris.test.js
```
