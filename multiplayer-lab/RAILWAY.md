# 휴대폰으로 Multiplayer Lab 배포하기

이 안내는 Android Chrome의 Railway 웹 대시보드만 사용합니다. 앱·PC·터미널·Node.js·Docker를 설치하지 않아도 됩니다. 설정이 화면에서 잘리면 Chrome의 **데스크톱 사이트** 표시를 켭니다.

**현재 상태: 인증 전입니다.** Railway `/new`에서 로그인 창의 **Continue with GitHub / Log in using email**까지 확인했습니다. 로그인하지 않았으며 프로젝트, Backend/Frontend 서비스, 공개 URL은 아직 만들지 않았습니다. 아래 설정은 실제 배포 완료 기록이 아닙니다. 계정 로그인과 GitHub 연결은 계정 소유자가 먼저 완료해야 합니다.

## 1. 로그인과 빈 Lab 프로젝트

1. 휴대폰에서 [Railway](https://railway.com/new)를 열고 로그인합니다. GitHub 로그인을 쓰거나 이메일 로그인 후 GitHub를 연결합니다.
2. Railway GitHub App의 저장소 접근을 설정할 때 **Only select repositories → `yoosb1992-create/jiwoos-farm`**만 선택합니다. 다른 저장소를 가져오거나 예제 저장소를 fork할 필요가 없습니다.
3. **New Project → Empty project**로 새 프로젝트를 만들고 이름을 `jiwoos-farm-multiplayer-lab`으로 정합니다. 기존 Production 프로젝트를 선택하지 않습니다.
4. 프로젝트의 **Create → Empty Service**로 서비스 두 개를 추가하고 각각 정확히 **Backend**, **Frontend**로 이름을 정합니다. 대소문자가 뒤의 변수 참조와 일치해야 합니다. 빈 서비스 생성의 staged changes를 **Deploy**로 적용합니다.

Railway 계정에는 배포가 가능한 trial 또는 plan이 필요합니다. trial의 한도·검증 상태는 계정마다 다를 수 있고, 유료 plan은 사용량 비용이 발생할 수 있습니다. 계정에 표시되는 내용을 확인하세요. [공식 trial](https://docs.railway.com/pricing/free-trial) · [공식 plans](https://docs.railway.com/pricing/plans)

## 2. 서비스 설정과 공개 도메인 먼저 준비

두 서비스에 아래 값을 설정합니다. 먼저 코드를 배포하지 않고 빈 서비스의 설정과 도메인을 준비하면, Frontend 최초 빌드에 실제 Backend 주소를 넣을 수 있습니다.

| 대시보드 항목 | Backend | Frontend |
|---|---|---|
| Settings → Root Directory | `/multiplayer-lab` | `/multiplayer-lab` |
| Variables → `PORT` | `2567` | `8080` |
| Variables → `RAILWAY_DOCKERFILE_PATH` | `Dockerfile` | `Dockerfile.client` |
| Settings → Healthcheck Path | `/healthz` | `/healthz` |
| Region | Southeast Asia Metal / Singapore | Backend와 동일 |
| Replicas | `1` | `1` |
| Serverless | 끔 | 끔 |
| Custom Build Command | 비워 둠: Dockerfile 사용 | 비워 둠: Dockerfile 사용 |
| Custom Start Command | 비워 둠: Docker CMD 사용 | 비워 둠: Docker CMD 사용 |
| Database / Volume / Pre-deploy command | 추가하지 않음 | 추가하지 않음 |

싱가포르 리전 ID는 `asia-southeast1-eqsg3a`입니다. 한국과의 실제 RTT는 HUD로 확인해야 합니다. Backend의 방 상태는 프로세스 메모리에 있으므로 한 replica로 유지합니다. Serverless 중지·재시작과 재배포는 기존 방을 보존하지 않습니다.

1. `PORT`와 Dockerfile 변수를 각각 입력하고 설정 변경을 저장합니다.
2. 각 서비스에서 **Settings → Networking → Public Networking → Generate Domain**을 누릅니다.
3. 도메인의 target port를 **Backend 2567**, **Frontend 8080**으로 지정합니다. 아직 성공한 배포가 없어도 명시한 `PORT`로 도메인을 준비할 수 있습니다. `PORT`와 target port는 반드시 같아야 합니다.
4. 두 서비스에 실제 `*.up.railway.app` 공개 도메인이 생겼는지 확인합니다. HTTPS 인증서는 Railway가 관리합니다.

`/multiplayer-lab`가 build context이므로 Dockerfile 변수에 `/multiplayer-lab/Dockerfile.client`를 다시 붙이지 않습니다. 두 서비스를 서로 다른 `client/`, `server/` 하위 디렉터리에서 빌드하면 공용 소스와 lockfile이 빠집니다.

## 3. 서비스별 Variables 붙여넣기

두 도메인이 준비되면 각 서비스의 **Variables → Raw Editor**에 해당 블록을 넣습니다. 블록은 서로 다른 서비스에 적용합니다. 기존에 넣은 `PORT`와 Dockerfile 변수는 같은 값으로 유지합니다.

**Backend:**

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=2567
RAILWAY_DOCKERFILE_PATH=Dockerfile
CLIENT_ORIGINS=https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}
LAB_LATENCY_MS=0
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30
```

**Frontend:**

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=8080
RAILWAY_DOCKERFILE_PATH=Dockerfile.client
VITE_MULTIPLAYER_SERVER_URL=wss://${{Backend.RAILWAY_PUBLIC_DOMAIN}}
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30
```

`${{...}}`는 Railway가 실제 값으로 바꾸는 **reference variable**입니다. 직접 만든 예시 주소가 아닙니다. `RAILWAY_PUBLIC_DOMAIN`은 프로토콜 없는 호스트 이름이므로 위처럼 `https://` 또는 `wss://`를 앞에 붙입니다. `CLIENT_ORIGINS`에는 경로·마지막 슬래시를 붙이지 않습니다.

Frontend의 값은 브라우저가 접속할 공개 WSS 주소입니다. `localhost`, 사설 IP, `*.railway.internal`을 넣지 않습니다. `Dockerfile.client`는 build stage에서 `ARG VITE_MULTIPLAYER_SERVER_URL`을 받아 Vite build에 포함합니다. **Backend 도메인을 변경하면 Frontend를 다시 빌드·배포**해야 하며, 이미지를 단순 재시작하는 것으로는 주소가 바뀌지 않습니다. Frontend 도메인을 변경하면 Backend의 origin 설정도 적용해야 합니다.

두 서비스가 상대 공개 도메인을 참조하는 구성은 Railway 공식 monorepo 안내에도 있습니다. 함께 배포할 때 순환 참조는 병렬로 처리되며, GitHub push 배포는 원래 서비스별 독립 실행입니다. 어느 서비스가 먼저 준비된다고 가정하지 말고 둘 다 정상인지 확인합니다.

## 4. 정확한 저장소·실험 브랜치 연결

두 서비스의 **Settings → Source**를 각각 설정합니다.

| 항목 | 두 서비스 공통 값 |
|---|---|
| Repository | `yoosb1992-create/jiwoos-farm` |
| Branch / deployment trigger | `experiment/v2.4-multiplayer-lab-colyseus` |
| Root Directory 재확인 | `/multiplayer-lab` |
| Autodeploy | 켬 |
| Wait for CI | 켬 |

Source를 연결할 때 기본 브랜치가 표시되면 **실험 브랜치로 바꾼 뒤** 변경을 적용합니다. staged changes 검토 화면에서 두 서비스의 저장소·브랜치·Root Directory·변수를 확인하고 **Deploy**합니다. `main`이나 기존 Production 브랜치를 배포 대상으로 남기지 않습니다.

이 저장소의 `.github/workflows/multiplayer-lab.yml`은 실험 브랜치 push에서 Lab 테스트, 빌드, Docker 이미지 검증을 수행합니다. **Wait for CI**는 GitHub Actions workflow들의 결과를 기다리게 합니다. 보이지 않거나 켤 수 없다면 연결한 GitHub 계정의 저장소 contributor 권한, Railway GitHub App의 이 저장소 접근, 요청된 권한 업데이트를 확인합니다. CI가 실패한 커밋을 배포하기 위해 이 설정을 끄지 않습니다.

Watch Paths를 사용하는 경우 두 서비스에 `/multiplayer-lab/**`와 `/.github/workflows/multiplayer-lab.yml`을 포함합니다. 문서만 바뀌어도 Lab CI가 실행될 수 있습니다. 해당 경로와 관계없는 커밋을 억지로 재배포할 필요는 없습니다.

## 5. 휴대폰에서 실제 배포 확인

1. 두 서비스의 Deployments가 성공했는지 확인합니다. Backend 로그가 컴파일된 Node 서버, Frontend 로그가 정적 HTTP 서비스인지 확인합니다. 둘 다 Dockerfile로 빌드되어야 합니다.
2. 휴대폰 주소창에서 **Backend HTTPS 주소 + `/healthz`**를 엽니다. `status: "ok"`, `service: "jiwoos-multiplayer-lab"`, `tickRate: 30`, `latencyMs: 0`을 확인합니다.
3. **Frontend HTTPS 주소 + `/healthz`**에서 `status: "ok"`, `service: "jiwoos-multiplayer-lab-client"`를 확인합니다.
4. **Frontend의 HTTPS 기본 주소**를 열어 Lab 화면과 방 만들기를 확인합니다. Backend의 기본 주소에 게임 화면이 없는 것은 정상입니다.
5. Frontend 주소를 두 번째 휴대폰에서 엽니다. A가 만든 방 코드를 B에 입력해 참가합니다. A Wi-Fi / B 5G 조합으로 인원 2와 양방향 이동을 확인합니다.
6. [README의 실기기 benchmark](./README.md#휴대폰태블릿-benchmark)를 수행합니다. `/healthz` 성공만으로 멀티플레이 품질까지 검증된 것은 아닙니다.

공유할 주소는 **Frontend HTTPS URL 하나**입니다. 이 문서에는 아직 실제 배포 주소를 기입하지 않았습니다.

| 배포 기록 | 실제 배포 후 기록 |
|---|---|
| Frontend 공개 HTTPS URL | 미생성 |
| Backend 공개 HTTPS/WSS 호스트 | 미생성 |
| 배포한 실험 브랜치 commit SHA | 미배포 |
| 두 `/healthz` 확인 | 미실시 |
| 공개 WSS 자동 smoke | 미실시 |
| 실제 Android Wi-Fi + 5G | 미실시 |

공개 자동 smoke는 유지보수자/CI가 실제 주소로 실행합니다. 휴대폰 사용자에게 명령 실행을 요구하지 않습니다. 안내와 실행 기준은 [DEVELOPMENT.md](./DEVELOPMENT.md#공개-배포-자동-smoke--유지보수자ci용)에 있습니다.

## 연결되지 않을 때

| 증상 | 대시보드에서 확인할 값 |
|---|---|
| Frontend build 실패: 서버 주소 누락 | 실제 Backend 도메인 생성 여부, Frontend의 `VITE_MULTIPLAYER_SERVER_URL` 참조, `Dockerfile.client` 선택 |
| 502 또는 healthcheck 실패 | 해당 서비스의 `PORT`, 도메인 target port, `/healthz`, 실행 로그 |
| 화면은 열리지만 방 만들기 실패 | Backend health, Frontend 빌드의 WSS 주소, Backend `CLIENT_ORIGINS`가 실제 Frontend HTTPS origin인지 |
| 도메인을 바꾼 뒤 예전 서버로 접속 | Frontend 새 build/deploy 후 페이지 새로고침 |
| 배포가 WAITING | 해당 커밋의 GitHub Actions 진행·성공 여부와 Wait for CI 권한 |
| 재배포 이후 기존 방이 없어짐 | 메모리 Room의 정상적인 한계. 새 방 생성 |
| 한 기기만 연결 안 됨 | 같은 Frontend URL·방 코드 대소문자, 네트워크 차단, HUD 연결 상태 |

## 설정 파일에 관한 주의

2026-10-06 공식 문서 확인 기준, 예전 **Config as Code (`railway.json` / `railway.toml`)는 deprecated**이며 새 서비스는 사용을 시작할 수 없습니다. legacy 서비스도 2026-12-01 이후 읽기가 중단된다고 안내됩니다. 이 Lab은 JSON 파일이 두 서비스를 자동 생성한다고 가정하지 않습니다.

대체 기능인 Railway Infrastructure as Code는 CLI로 적용하는 별도 기능입니다. 이 모바일 설정 안내에서는 대시보드와 GitHub 연동을 사용합니다. Dockerfile 두 개는 이미지 빌드 정의이며, 서비스 생성·GitHub 권한·도메인·환경변수는 위 과정으로 연결해야 합니다.

## 확인한 공식 문서

- [빈 프로젝트와 두 서비스 / monorepo 배포](https://docs.railway.com/guides/deploying-a-monorepo)
- [Root Directory와 Watch Paths](https://docs.railway.com/deployments/monorepo)
- [Dockerfile 선택과 build ARG](https://docs.railway.com/builds/dockerfiles)
- [Variables / Raw Editor](https://docs.railway.com/variables), [변수 reference](https://docs.railway.com/variables/reference)
- [Public Networking](https://docs.railway.com/networking/public-networking), [Healthchecks](https://docs.railway.com/deployments/healthchecks)
- [GitHub autodeploy / Wait for CI](https://docs.railway.com/deployments/github-autodeploys)
- [배포 순서와 순환 참조](https://docs.railway.com/deployments/deployment-actions)
- [Regions](https://docs.railway.com/deployments/regions), [Serverless](https://docs.railway.com/deployments/serverless), [종료 유예](https://docs.railway.com/deployments/deployment-teardown)
- [Infrastructure as Code / 기존 Config as Code 폐기 안내](https://docs.railway.com/infrastructure-as-code)
