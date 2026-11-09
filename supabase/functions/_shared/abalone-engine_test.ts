import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyAuthoritativeMove, type SerializedState } from "./abalone-engine.ts";

function fixture():SerializedState {
 return {radius:4,pieces:[["0,0","b"],["1,0","w"],["-3,0","b"],["3,0","w"]],
  turn:"b",lost:{b:0,w:0},bombs:{b:"-3,0",w:"3,0"},gameOver:false,timed:false};
}
Deno.test("rejects an opponent marble",()=>assertThrows(()=>applyAuthoritativeMove(fixture(),{keys:["1,0"],dq:0,dr:1})));
Deno.test("rejects a forged direction",()=>assertThrows(()=>applyAuthoritativeMove(fixture(),{keys:["0,0"],dq:2,dr:0})));
Deno.test("rejects duplicate selections",()=>assertThrows(()=>applyAuthoritativeMove(fixture(),{keys:["0,0","0,0"],dq:0,dr:1})));
Deno.test("moves a marble into an empty cell and changes turn",()=>{
 const result=applyAuthoritativeMove(fixture(),{keys:["0,0"],dq:0,dr:1});
 assertEquals(result.state.turn,"w");
 assertEquals(result.state.pieces.some(([k,c])=>k==="0,1"&&c==="b"),true);
});
Deno.test("does not mutate the input state",()=>{
 const s=fixture();const before=JSON.stringify(s);
 applyAuthoritativeMove(s,{keys:["0,0"],dq:0,dr:1});
 assertEquals(JSON.stringify(s),before);
});
