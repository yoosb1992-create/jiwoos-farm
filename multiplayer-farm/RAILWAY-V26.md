# v2.6 Railway · 모바일만으로 운영

## 현재 상태

2026-10-06 신규 `jiwoos-farm-v2-6` 생성 요청이 무료 플랜 리소스 한도로 거절되었습니다. 프로젝트/Backend/Frontend/Postgres가 아직 생성되지 않았고 **v2.6 공개 URL도 아직 없습니다**. `jiwoos-farm-v2-5`와 `jiwoos-farm-multiplayer-lab`은 그대로입니다. 결제·플랜 변경은 사용자가 Railway 모바일 웹에서 직접 승인해야 합니다.

로그인 → 워크스페이스 Settings → Billing/Plans에서 현재 한도와 업그레이드 내용을 확인하세요. 버튼 이름은 계정 화면에 따라 다를 수 있습니다. 결제를 임의 진행하거나 기존 프로젝트를 지워 한도를 확보하지 않습니다. 한도가 해결되면 연결된 Railway 앱으로 아래 신규 구성을 적용할 수 있으며 PC/CLI가 필요하지 않습니다.

## 배포 구성

[deployment/railway-v26-services.json](./deployment/railway-v26-services.json)은 검토 가능한 Dashboard/API 설정표입니다. Railway가 자동으로 읽는 `railway.json`은 아닙니다. 새 서비스에 더 이상 지원되지 않는 구식 config 파일을 추가하지 않았습니다. [공식 IaC 안내](https://docs.railway.com/infrastructure-as-code) 확인 기준: 2026-10-06. 모바일 작업에는 기존 Dockerfiles + Dashboard/API 설정을 사용합니다.

1. **새 프로젝트** `jiwoos-farm-v2-6`. 새 **PostgreSQL** template. 비밀번호는 Railway 생성값, DB 공개 TCP proxy 불필요. Singapore(region `asia-southeast1-eqsg3a` 또는 계정에서 제공하는 Singapore), 영구 volume 유지.
2. 빈 서비스 **Backend**, **Frontend** 생성. 기존 v2.5 서비스는 수정하지 않습니다. 두 서비스 public domain부터 생성합니다(포트 Backend2567/Frontend8080).
3. 아래 variables와 Build/Deploy 설정을 저장합니다. Source는 둘 다 **`yoosb1992-create/jiwoos-farm` → `feature/v2.6-farm-content-expansion`**, Root Directory **`/`**, **Wait for CI 켬**, health **`/healthz`**, 1 replica, Serverless 끔. Backend Dockerfile `multiplayer-farm/Dockerfile`, Frontend `multiplayer-farm/Dockerfile.client`. root의 다른 게임을 빌드하지 않습니다.
4. CI 성공 확인 후 Deploy. Backend health에서 `service=jiwoos-farm-v2.6`, `database=true`, `latencyMs=0`, `tickRate=30`. Frontend에서 새 가족 생성/다른 휴대폰 참가. 이후 **새 브랜치 push → CI → 자동 재배포**, 주소는 유지됩니다.

Backend variables (서비스 이름을 정확히 유지):
```dotenv
RAILWAY_DOCKERFILE_PATH=multiplayer-farm/Dockerfile
NODE_ENV=production
HOST=0.0.0.0
PORT=2567
DATABASE_URL=${{Postgres.DATABASE_URL}}
CLIENT_ORIGINS=https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}
LAB_LATENCY_MS=0
```
Frontend variables:
```dotenv
RAILWAY_DOCKERFILE_PATH=multiplayer-farm/Dockerfile.client
NODE_ENV=production
HOST=0.0.0.0
PORT=8080
VITE_MULTIPLAYER_SERVER_URL=wss://${{Backend.RAILWAY_PUBLIC_DOMAIN}}
```

공개 도메인은 reference variable로 연결되므로 매 배포 때 손으로 입력하지 않습니다. Frontend 주소는 build-time 변수입니다. Backend domain을 처음 발급한 뒤 Frontend를 build해야 합니다. Frontend는 컴파일된 정적 파일을 Node static server로 제공하며 `vite preview`를 쓰지 않습니다. Backend는 compiled JS, PORT·0.0.0.0, graceful shutdown, startup DB migration을 사용합니다.

## 공개 smoke

공개 domain 생성 후 GitHub 모바일 웹 → Actions → **Multiplayer Farm v2.6 Public Smoke** → Run workflow → branch `feature/v2.6-farm-content-expansion` → Frontend/Backend HTTPS 주소 입력. 기존 3 SDK client·두 production browser 검사를 사용합니다. 후보 CI와 분리해 배포 전 CI가 아직 없는 공개 서버에 의존하지 않게 합니다.

## 복구

- 기존 v2.5 주소와 `3fad61ce6c567fe5449371e8ecf871282b6b69df`는 유지합니다.
- v2.6 장애 때 v2.5 URL로 돌아가면 기존 v2.5 데이터가 그대로입니다.
- v2.6 JSON version2 DB를 v2.5 runtime에 연결하지 않습니다. v2.6 서버를 이전 v2.6 정상 commit으로 되돌리거나 새 v2.6 서버에서 저장본을 복구합니다.
- 두 버전 사이 농장/세션/인벤토리 공유·자동 이관은 하지 않습니다.
