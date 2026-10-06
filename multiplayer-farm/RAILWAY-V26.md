# v2.6 Railway · 공개 URL 유지와 v2.5 복구

## 배포 방식

신규 프로젝트 생성은 Railway 무료 플랜 리소스 한도로 거절되었습니다. 새 리소스를 만들거나 플랜을 바꾸지 않고, 사용자가 허용한 **기존 Farm 서비스의 새 브랜치 재배포**를 적용합니다.

- 프로젝트 이름은 기존 `jiwoos-farm-v2-5` 유지 (이름만 v2.5; 배포 Source는 v2.6)
- Backend / Frontend / Postgres의 서비스 ID와 공개 domain 유지
- Source: `yoosb1992-create/jiwoos-farm` / `feature/v2.6-farm-content-expansion`
- PostgreSQL **`public`의 v2.5 테이블·세션·데이터 보존**
- v2.6는 시작 시 **`farm_v26` schema** 생성/마이그레이션. 모든 pool 연결의 search_path는 farm_v26만, public fallback 없음. 방 advisory lock namespace도 분리. 기존 DB migration 테스트가 동명 public.farms 보존을 검증합니다.
- 같은 URL에서도 v2.6 브라우저 저장 키는 `farm-v26-session`. v2.5의 `farm-v25-session`은 삭제하지 않습니다.
- 사용자에게 PC, 새 결제, CLI, 환경변수 설정이 필요하지 않습니다. 공개 URL에서 새 가족 농장을 만듭니다.

## 서비스 설정

[deployment/railway-v26-services.json](./deployment/railway-v26-services.json)은 Dashboard/API 설정표입니다. 자동으로 읽는 railway.json이 아닙니다. [현재 공식 IaC 문서](https://docs.railway.com/infrastructure-as-code)를 확인했고, 모바일 운영은 검증된 Dockerfiles와 Dashboard/API 설정을 유지합니다.

| 항목 | Backend | Frontend |
|---|---|---|
| Root | `/` | `/` |
| Dockerfile | `multiplayer-farm/Dockerfile` | `multiplayer-farm/Dockerfile.client` |
| Public | `backend-production-b244e.up.railway.app` | `frontend-production-a998.up.railway.app` |
| Port | 2567 | 8080 |
| Health | `/healthz` | `/healthz` |
| Region | Singapore | Singapore |
| Replicas | 1 | 1 |
| Wait for CI | 켬 | 켬 |
| Serverless | 끔 | 끔 |

기존 variables를 유지합니다. Backend의 DATABASE_URL은 기존 Postgres를 가리키고 v2.6 code가 독립 schema만 선택합니다. URL query의 `options`로 search_path를 우회하는 설정은 startup에서 거부합니다.

Backend:
```dotenv
RAILWAY_DOCKERFILE_PATH=multiplayer-farm/Dockerfile
NODE_ENV=production
HOST=0.0.0.0
PORT=2567
DATABASE_URL=${{Postgres.DATABASE_URL}}
CLIENT_ORIGINS=https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}
LAB_LATENCY_MS=0
```
Frontend:
```dotenv
RAILWAY_DOCKERFILE_PATH=multiplayer-farm/Dockerfile.client
NODE_ENV=production
HOST=0.0.0.0
PORT=8080
VITE_MULTIPLAYER_SERVER_URL=wss://${{Backend.RAILWAY_PUBLIC_DOMAIN}}
```

CI 성공 → 두 서비스 Source branch 변경 → Deploy. Backend health에서 `service=jiwoos-farm-v2.6`, `storageNamespace=farm_v26`, `database=true`, `latencyMs=0`, `tickRate=30` 확인 후 Frontend 공개 페이지/새 가족/다른 기기 참가를 확인합니다. domain과 reference variables는 바뀌지 않습니다. 이후 v2.6 branch push → CI → 자동 재배포입니다. Frontend는 compiled static server, Backend는 compiled JS를 실행합니다.

## 공개 smoke

`Multiplayer Farm v2.6 Public Smoke`는 `deployment/public-v26.json` 배포 기록이 갱신될 때, 또는 workflow_dispatch로 실행합니다. 후보 CI에는 포함하지 않아 CI→Railway 순환 대기를 피합니다. 기존 3 SDK client·2 production browser 검사를 재사용합니다. health의 서비스 버전과 namespace가 v2.6가 아니면 게임 데이터를 만들기 전에 실패합니다.

## 모바일 복구

Railway 모바일 웹 → 프로젝트 `jiwoos-farm-v2-5` → Backend와 Frontend 각각 Settings → Source → branch를 **`feature/v2.5-multiplayer-farm-rebuild`**로 변경 → 두 서비스 Deploy. 고정 복구 HEAD는 `3fad61ce6c567fe5449371e8ecf871282b6b69df`입니다. 기존 환경변수는 동일합니다.

v2.5 code는 원래대로 `public` schema와 `farm-v25-session`을 사용하므로 이전 농장/가방/세션으로 돌아옵니다. v2.6 farm_v26 schema를 삭제할 필요가 없고 다시 v2.6로 배포하면 확장 농장도 남습니다. 두 버전 사이 데이터 자동 이관은 없습니다. 기존 main/Production Sites/D1/FAMILY_ROOM/Golden Lab은 이 절차의 대상이 아닙니다.
