# 업비트 이동평균선 알림

업비트 분봉에서 **단기 이평선(MA50)이 장기 이평선(MA200)에 도달·교차**하면 텔레그램으로 알림을 보냅니다.

- 서버 없음 — GitHub Actions cron이 5분마다 실행 (public 레포는 무료)
- 설치 없음 — Node 20 내장 기능만 사용, 의존성 0개
- **회고 대시보드 PWA** — 오늘/이번 주에 뜬 신호와 그 이후 성과를 돌아보기 (GitHub Pages)

```
업비트 API  →  GitHub Actions (5분 cron)  →  텔레그램 알림
                      ↓
        state.json (중복 방지) + history/ (신호 이력)
                      ↓
        GitHub Pages가 정적 서빙 → PWA 회고 대시보드
```

---

## 설정 (약 5분, 1회)

### 1. 텔레그램 봇 만들기

1. 텔레그램에서 [@BotFather](https://t.me/BotFather) 검색 → `/newbot` → 이름 입력
2. 받은 **토큰**을 복사 (`123456:ABC-DEF...` 형태)
3. 방금 만든 봇과의 채팅방을 열고 아무 메시지나 한 번 전송 ← **이 단계를 빼먹으면 알림이 안 갑니다**

### 2. chat_id 확인

로컬에서 한 번만 실행합니다.

```bash
TELEGRAM_BOT_TOKEN=붙여넣기 npm run chat-id
```

출력된 숫자가 `chat_id`입니다.

### 3. GitHub Secrets 등록

레포 **Settings → Secrets and variables → Actions → New repository secret**

| 이름 | 값 |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | BotFather 토큰 |
| `TELEGRAM_CHAT_ID` | 2단계에서 확인한 숫자 |

### 4. 워크플로 권한 켜기

**Settings → Actions → General → Workflow permissions** 에서
`Read and write permissions` 선택 후 저장. (알림 기록인 `state.json`을 커밋해야 중복 알림이 안 갑니다.)

### 5. 동작 확인

**Actions → Upbit MA Watch → Run workflow → mode: `status`** 를 실행하면
현재 이평선 상태 요약이 텔레그램으로 바로 옵니다. 메시지가 오면 설정 끝입니다.

이후로는 5분마다 자동으로 돌면서 **시그널이 있을 때만** 알림을 보냅니다.

---

## 감시할 코인 바꾸기

`config.json` 만 수정하고 커밋하면 됩니다.

```json
{
  "markets": ["KRW-BTC", "KRW-ETH", "KRW-XRP", "KRW-SOL"],
  "candleUnit": 15,
  "periods": { "short": 50, "long": 200 },
  "alerts": {
    "goldenCross": true,
    "deadCross": true,
    "proximity": true,
    "proximityThresholdPct": 0.3
  },
  "lookbackCandles": 8,
  "confirmOnClosedCandle": true
}
```

| 항목 | 설명 |
| --- | --- |
| `markets` | 감시할 마켓 코드. 업비트 표기 그대로 (`KRW-BTC`) |
| `candleUnit` | 분봉 단위. `1, 3, 5, 10, 15, 30, 60, 240` |
| `periods` | 이평선 기간. **캔들 개수 기준** (아래 참고) |
| `alerts.goldenCross` | 단기선이 장기선을 위로 뚫을 때 알림 |
| `alerts.deadCross` | 단기선이 장기선을 아래로 뚫을 때 알림 |
| `alerts.proximity` | 교차 전 **"도달"** 알림 — 두 선의 이격이 임계치 안으로 들어온 순간 1회 |
| `alerts.proximityThresholdPct` | 근접 판정 기준(%). `0.3` = 이격 0.3% 이내 |
| `lookbackCandles` | 매 실행마다 되짚어 보는 과거 캔들 수. cron이 밀려도 놓치지 않게 해 줍니다 |
| `confirmOnClosedCandle` | `true`면 **마감된 캔들**로만 판정 (진행 중인 캔들은 값이 계속 바뀌어 헛알림의 원인) |

### `periods`는 "일"이 아니라 "봉 개수"입니다

15분봉의 `MA50`은 **최근 50개 봉**(= 12.5시간), `MA200`은 **200개 봉**(= 50시간)의 평균입니다.
차트에서 흔히 말하는 "15분봉 50선/200선"과 같은 의미입니다.

일봉 기준 50일선·200일선을 15분봉 위에 그리려면 `{ "short": 4800, "long": 19200 }`가 되는데,
업비트는 한 번에 200개씩만 주기 때문에 실행마다 약 100번을 호출해야 합니다. 그럴 땐 `candleUnit`을
`240`(4시간봉, `short: 300 / long: 1200`)으로 두는 편이 훨씬 가볍습니다.

---

## 알림 예시

```
🟢 골든크로스 · BTC (15분봉)

종가: 98,500,000
MA50: 98,123,457
MA200: 98,082,111
이격: 0.042% (MA50이 MA200 위)
캔들: 2026-09-15 14:30:00 KST

업비트에서 보기
```

알림 종류는 🟢 골든크로스 / 🔴 데드크로스 / 🟡 근접 세 가지입니다.

---

## 회고 대시보드 (PWA)

**Settings → Pages → Source: GitHub Actions** 로 켜면 `Deploy PWA` 워크플로가 배포합니다.
`https://<사용자명>.github.io/upbit-notifier/` 에서 열리고, 모바일 브라우저의 "홈 화면에 추가"로 앱처럼 설치됩니다.

| 탭 | 내용 |
| --- | --- |
| **현재** | 감시 종목의 지금 이격률. 교차에 가까운 순으로 정렬 |
| **오늘** | 오늘(KST 0시~) 뜬 신호와 그 이후 성과 |
| **이번 주** | 이번 주(월요일~) 기준 같은 내용 |

회고 탭에서 보는 것:

- **신호 이력** — 언제 어떤 코인에서 무슨 신호가 떴는지, 당시 가격, 그리고 **신호 후 1시간 / 4시간 / 24시간
  가격이 어떻게 움직였는지**
- **신호별 성과** — 골든 / 데드 / 근접 각각의 평균 성과. "어떤 신호가 실제로 맞았나"를 보는 곳입니다
- **코인별 성과** — 종목별 신호 건수와 평균 성과

**입력할 것이 없습니다.** 알림이 나갈 때 워크플로가 `history/YYYY-MM.json`에 신호를 쌓고 커밋하면,
대시보드는 그 파일을 그대로 읽습니다. 그래서 서버도 DB도 로그인도 필요 없고, 어느 기기에서 열어도 같은
내용이 보입니다. 알림이 한 번도 안 나갔다면 이력이 비어 있는 게 정상입니다.

> 성과는 신호 발생 당시 **종가 대비** 가격 변화입니다. 아직 그 시점이 지나지 않았으면 `—`로 표시됩니다.
> 매매 손익이 아니라 신호 자체의 적중도를 보는 수치입니다.

---

## 로컬에서 실행

```bash
npm test              # 이평선·시그널 로직 테스트
npm run check:dry     # 알림 전송 없이 콘솔로 확인
TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... npm run check   # 실제 전송
node src/notify.js --status   # 시그널과 무관하게 현재 상태 1회 전송
```

---

## 레포는 public이어야 합니다

**private 레포는 Actions 실행 시간이 월 무료 한도(Free 2,000분 / Pro 3,000분)에서 차감되고, 실행 1건이
1분 미만이어도 1분으로 올려 계산됩니다.** 5분 주기는 월 약 8,600회라 한도를 한참 넘습니다.
public 레포는 표준 러너가 무료 무제한이고 GitHub Pages도 무료라, 이 프로젝트는 public을 전제로 합니다.

전환: **Settings → General → 맨 아래 Danger Zone → Change repository visibility → Make public**

public으로 바꿔도 **텔레그램 토큰은 안전합니다.** 토큰은 코드가 아니라 GitHub Secrets에 있고,
Secrets는 레포가 공개돼도 공개되지 않습니다. 대신 감시 종목(`config.json`)과 알림 기록(`state.json`),
그리고 **기존 커밋에 남아 있는 작성자 이메일 주소**는 누구나 볼 수 있게 됩니다.

> 커밋 이메일을 감추고 싶다면 GitHub **Settings → Emails → Keep my email addresses private**를 켜세요.
> 다만 이미 커밋된 기록에는 소급 적용되지 않아, 히스토리를 다시 써야 합니다.

## 알아둘 점

- **cron 지연**: GitHub Actions 스케줄은 혼잡하면 수 분 늦게 돕니다(특히 매시 정각). 그래서 `:02, :07, :12 ...`에
  돌도록 2분 밀어 뒀고, `lookbackCandles`(기본 8봉 = 2시간)만큼 과거를 다시 훑기 때문에 실행이 몇 번 밀려도
  시그널은 놓치지 않습니다.
- **알림 지연**: 값이 계속 바뀌는 진행 중인 캔들은 판정에서 빼므로, 봉 마감 후 알림까지 `실행 주기 + 밀림`만큼
  걸립니다. 5분 주기면 보통 5분 안쪽입니다.
- **중복 방지**: 보낸 시그널의 캔들 시각을 `state.json`에 기록하고 워크플로가 커밋합니다.
  그래서 알림이 발생한 날에만 `chore: 알림 상태 갱신` 커밋이 쌓입니다.
- **최초 실행**: 과거 시그널이 한꺼번에 오지 않도록, 처음 도는 마켓은 마지막 캔들만 확인합니다.
- **이력은 알림과 함께 쌓입니다**: 대시보드의 회고 탭은 지나간 가격을 다시 계산하는 게 아니라, 실제로 나간
  알림을 기록한 것입니다. 그래서 워크플로를 켠 시점부터 쌓이기 시작합니다.
- **60일 자동 비활성화**: public 레포의 스케줄 워크플로는 레포 활동이 60일간 없으면 GitHub이 자동으로 끕니다.
  알림이 뜸한 기간에도 꺼지지 않도록, 마지막 커밋이 45일을 넘기면 워크플로가 `.heartbeat` 파일을 갱신해 커밋합니다.
- **호출 제한**: 업비트 시세 API는 초당 10회 제한이며, 요청 사이에 150ms를 둡니다. 코인 10~20개까지는 여유롭습니다.
- **카카오톡 대신 텔레그램인 이유**: 카카오 "나에게 보내기"는 OAuth 액세스 토큰이 6시간마다 만료돼
  리프레시 로직과 재인증 관리가 필요합니다. 1인용으로는 텔레그램이 압도적으로 손이 덜 갑니다.

## 파일 구조

```
config.json                 감시 대상·이평선 설정
state.json                  알림 중복 방지 기록 (자동 생성·커밋)
history/YYYY-MM.json        발생한 신호 이력 (자동 생성·커밋, 대시보드가 읽음)
src/notify.js               진입점: 조회 → 판정 → 전송 → 상태 저장
src/indicators.js           SMA 계산, 교차·근접 판정 (PWA와 공용)
src/upbit.js                업비트 캔들 조회 (페이지네이션·재시도)
src/telegram.js             메시지 포맷·전송
src/history.js              신호 이력 기록 (월별 파일 + index.json)
src/period.js               KST 기준 오늘/이번 주 범위, 신호 후 성과 계산
src/review-stats.js         신호별·코인별 성과 집계
src/get-chat-id.js          chat_id 확인용 1회성 스크립트
index.html, app.js, sw.js   PWA 껍데기
web/                        대시보드 화면 (현재 / 회고)
.github/workflows/          watch(5분 cron) · test · pages
```
