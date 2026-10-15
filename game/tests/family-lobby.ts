import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../../app/page";
import { FamilyStatus, FamilyRoster } from "../../app/family/FamilyStatus";
import { FamilyLobby } from "../../app/family/FamilyLobby";
const home = renderToStaticMarkup(createElement(Home));
for (const label of ["혼자 하기", "가족 농장", "맵 편집기"]) assert.ok(home.includes(label));
const lobby = renderToStaticMarkup(createElement(FamilyLobby, { onBack: () => {}, onEnter: () => {} }));
for (const label of ["농장 만들기", "초대 코드", "닉네임", "최근 참가한 가족 농장"]) assert.ok(lobby.includes(label));
assert.ok(lobby.includes('maxLength="20"') || lobby.includes('maxlength="20"'));
console.log("Family lobby: single/family/editor entry and room forms rendered");

const panel = renderToStaticMarkup(createElement(FamilyStatus, { session: {room:{id:"r", name:"농장", nickname:"A", inviteCode:"ABCDEFGH",playerId:"A"}}, mapId:"farm" }));
for (const label of ["가족 0명", "연결 중", "초대 코드", "복사"]) assert.ok(panel.includes(label));
assert.ok(panel.startsWith("<details")); assert.ok(!panel.includes(" open="));
const pose = {mapId:"farm",x:100,y:100,facing:"down" as const,moving:false,selectedTool:"hand" as const,lastSeen:1};
const roster = renderToStaticMarkup(createElement(FamilyRoster,{ownId:"A",mapId:"farm",players:[{...pose,playerId:"A",nickname:"수빈"},{...pose,playerId:"B",nickname:"지우",mapId:"town"}]}));
for(const label of ["수빈 (나)","지우","같은 맵","다른 맵"]) assert.ok(roster.includes(label));
