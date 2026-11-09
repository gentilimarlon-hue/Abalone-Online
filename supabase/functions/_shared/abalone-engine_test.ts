import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyAuthoritativeMove, type SerializedState } from "./abalone-engine.ts";

function state(pieces:[string,"b"|"w"][],turn:"b"|"w"="b",radius:3|4=4,bombs:{b:string|null;w:string|null}={b:null,w:null},lost={b:0,w:0}):SerializedState {
 return {radius,pieces,turn,bombs,lost,gameOver:false,timed:false};
}
Deno.test("rejects non-canonical coordinate aliases",()=>{
 const s=state([["01,0","b"]]);
 assertThrows(()=>applyAuthoritativeMove(s,{keys:["01,0"],dq:0,dr:1}));
});
Deno.test("rejects a forged game-over flag",()=>{
 const s=state([["0,0","b"]]);s.lost.w=6;
 assertThrows(()=>applyAuthoritativeMove(s,{keys:["0,0"],dq:0,dr:1}));
});
Deno.test("rejects malformed state with duplicate coordinates under alternate spelling",()=>{
 const s=state([["1,0","b"],["01,0","w"]]);
 assertThrows(()=>applyAuthoritativeMove(s,{keys:["1,0"],dq:0,dr:1}));
});
Deno.test("rejects opponent marble, forged direction and duplicate selection",()=>{
 assertThrows(()=>applyAuthoritativeMove(state([["0,0","b"],["1,0","w"]]),{keys:["1,0"],dq:0,dr:1}));
 assertThrows(()=>applyAuthoritativeMove(state([["0,0","b"]]),{keys:["0,0"],dq:2,dr:0}));
 assertThrows(()=>applyAuthoritativeMove(state([["0,0","b"]]),{keys:["0,0","0,0"],dq:0,dr:1}));
});
Deno.test("rejects an inline move blocked by own marble",()=>{
 const s=state([["0,0","b"],["1,0","b"]]);
 assertThrows(()=>applyAuthoritativeMove(s,{keys:["0,0"],dq:1,dr:0}));
});
Deno.test("allows a clear sideways move by a straight group",()=>{
 const s=state([["-1,0","b"],["0,0","b"],["1,0","b"]]);
 const r=applyAuthoritativeMove(s,{keys:["-1,0","0,0","1,0"],dq:0,dr:1});
 const m=new Map(r.state.pieces);
 assertEquals(m.get("-1,1"),"b");assertEquals(m.get("0,1"),"b");assertEquals(m.get("1,1"),"b");
});
Deno.test("rejects a sideways move when one destination is occupied",()=>{
 const s=state([["-1,0","b"],["0,0","b"],["1,0","b"],["0,1","w"]]);
 assertThrows(()=>applyAuthoritativeMove(s,{keys:["-1,0","0,0","1,0"],dq:0,dr:1}));
});
Deno.test("single marble advances and changes turn",()=>{
 const r=applyAuthoritativeMove(state([["0,0","b"]]),{keys:["0,0"],dq:0,dr:1});
 assertEquals(r.state.pieces,[["0,1","b"]]);assertEquals(r.state.turn,"w");
});
Deno.test("rejects disconnected and non-collinear groups",()=>{
 const s=state([["0,0","b"],["2,0","b"],["0,1","b"]]);
 assertThrows(()=>applyAuthoritativeMove(s,{keys:["0,0","2,0"],dq:0,dr:1}));
});
Deno.test("rejects equal-strength push",()=>{
 const s=state([["0,0","b"],["1,0","b"],["2,0","w"],["3,0","w"]]);
 assertThrows(()=>applyAuthoritativeMove(s,{keys:["0,0","1,0"],dq:1,dr:0}));
});
Deno.test("rejects push against three opponents",()=>{
 const s=state([["-1,0","b"],["0,0","b"],["1,0","b"],["2,0","w"],["3,0","w"],["4,0","w"]]);
 assertThrows(()=>applyAuthoritativeMove(s,{keys:["-1,0","0,0","1,0"],dq:1,dr:0}));
});
Deno.test("three push two shifts opponent line correctly",()=>{
 const s=state([["-2,0","b"],["-1,0","b"],["0,0","b"],["1,0","w"],["2,0","w"]]);
 const r=applyAuthoritativeMove(s,{keys:["-2,0","-1,0","0,0"],dq:1,dr:0});
 const m=new Map(r.state.pieces);
 assertEquals(m.get("2,0"),"w");assertEquals(m.get("3,0"),"w");
 assertEquals(m.get("-1,0"),"b");assertEquals(m.get("0,0"),"b");assertEquals(m.get("1,0"),"b");
});
Deno.test("ejects a normal marble for one loss point",()=>{
 const s=state([["2,0","b"],["3,0","b"],["4,0","w"]]);
 const r=applyAuthoritativeMove(s,{keys:["2,0","3,0"],dq:1,dr:0});
 assertEquals(r.state.lost.w,1);assertEquals(r.ejected,[{color:"w",bomb:false}]);
});
Deno.test("ejecting a bomb gives two loss points and clears its marker",()=>{
 const s=state([["2,0","b"],["3,0","b"],["4,0","w"]],"b",4,{b:null,w:"4,0"});
 const r=applyAuthoritativeMove(s,{keys:["2,0","3,0"],dq:1,dr:0});
 assertEquals(r.state.lost.w,2);assertEquals(r.state.bombs.w,null);
});
Deno.test("moving own bomb sideways keeps its marker on the moved marble",()=>{
 const s=state([["-1,0","b"],["0,0","b"],["1,0","b"]],"b",4,{b:"0,0",w:null});
 const r=applyAuthoritativeMove(s,{keys:["-1,0","0,0","1,0"],dq:0,dr:1});
 assertEquals(r.state.bombs.b,"0,1");
 assertEquals(new Map(r.state.pieces).get("0,1"),"b");
});
Deno.test("rejects a move after the game has already ended",()=>{
 const s=state([["0,0","b"]],"b",3,{b:null,w:null},{b:0,w:3});
 s.gameOver=true;
 assertThrows(()=>applyAuthoritativeMove(s,{keys:["0,0"],dq:0,dr:1}));
});
Deno.test("pushed bomb remains marked at its new square",()=>{
 const s=state([["-2,0","b"],["-1,0","b"],["0,0","b"],["1,0","w"]],"b",4,{b:null,w:"1,0"});
 const r=applyAuthoritativeMove(s,{keys:["-2,0","-1,0","0,0"],dq:1,dr:0});
 assertEquals(r.state.bombs.w,"2,0");
});
Deno.test("mini board declares winner at three loss points",()=>{
 const s=state([["1,0","b"],["2,0","b"],["3,0","w"]],"b",3,{b:null,w:"3,0"},{b:0,w:1});
 const r=applyAuthoritativeMove(s,{keys:["1,0","2,0"],dq:1,dr:0});
 assertEquals(r.winner,"b");assertEquals(r.state.gameOver,true);
});
Deno.test("standard board declares winner at six loss points",()=>{
 const s=state([["2,0","b"],["3,0","b"],["4,0","w"]],"b",4,{b:null,w:"4,0"},{b:0,w:4});
 const r=applyAuthoritativeMove(s,{keys:["2,0","3,0"],dq:1,dr:0});
 assertEquals(r.winner,"b");assertEquals(r.state.lost.w,6);
});
Deno.test("does not mutate the input state",()=>{
 const s=state([["0,0","b"]]);const before=JSON.stringify(s);
 applyAuthoritativeMove(s,{keys:["0,0"],dq:0,dr:1});
 assertEquals(JSON.stringify(s),before);
});
