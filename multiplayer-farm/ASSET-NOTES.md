# v2.6 asset / audio notes

- 원본 저장소 `public/assets/`의 집·나무·꽃·땅·NPC·캐릭터·기존 도구를 참조합니다. 원본 파일의 라이선스·출처 기록은 변경하지 않았으며, 기존 자산의 외부 출처를 새롭게 보증하지 않습니다.
- v2.6 `client/art.ts`의 작물/물고기 아이콘, 소/양, 허수아비, 게시판, 다리, 요리 아이콘, 배경 질감은 이번 작업에서 직접 작성한 Canvas drawing code입니다. 다운로드한 외부 이미지/스타듀밸리 자산은 없습니다.
- `client/audio.ts`의 멜로디, 효과음, noise ambience는 직접 작성한 Web Audio oscillator/noise 합성입니다. 외부 음악/녹음/샘플/멜로디를 복사하지 않았습니다.
- 공통 팔레트는 `shared/expansion.ts`의 SEASON_INFO, 작물 color, 계절 식생 tint. 큰 배경 texture는 장소/계절이 바뀔 때 한 번 만들며 이전 texture를 파기합니다. 매 frame Canvas upload는 하지 않습니다.
- 기존 sprite 스타일을 살린 일관된 따뜻한 세미 픽셀 그림을 우선했습니다. 모든 자산이 실사풍 고해상도 신규 그림인 것은 아닙니다.
