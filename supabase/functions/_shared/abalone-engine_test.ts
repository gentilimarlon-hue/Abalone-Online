import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyAuthoritativeMove, type SerializedState } from "./engine.ts";

function fixture():SerializedState {
 const pieces:[string,"b"|"w"][]=[];
 for(let q=0;q<=4;q++)pieces.push([`${q},-4`,"b"]);
 for(let q=-1;q<=4;q++)pieces.push([`${q},-3`,"b"]);
 for(let q=0;q<=2;q++)pieces.push([`${q},-2`,"b"]);
 for(let q=-4;q<=0;q++)pieces.push([`${q},4`,"w"]);
 for(let q=-4;q<=1;q++)pieces.push([`${q},3`,"w"]);
 for(let q=-2;q<=0;q++)pieces.push([`${q},2`,"w"]);
 return {radius:4,pieces,turn:"b",lost:{b:0,w:0},bombs:{b:"0,-4",w:"-4,4"},gameOver:false,timed:false};
}
Deno.test("rejects an opponent marble",()=>assertThrows(()=>applyAuthoritativeMove(fixture(),{keys:["-4,4"],dq:1,dr:0})));
Deno.test("rejects a forged direction",()=>assertThrows(()=>applyAuthoritativeMove(fixture(),{keys:["0,-4"],dq:2,dr:0})));
Deno.test("rejects disconnected selections",()=>assertThrows(()=>applyAuthoritativeMove(fixture(),{keys:["0,-4","4,-3"],dq:0,dr:1})));
Deno.test("moves one marble and changes turn",()=>{
 const s=fixture(); const result=applyAuthoritativeMove(s,{keys:["0,-4"],dq:0,dr:1});
 assertEquals(result.state.turn,"w");assertEquals(result.state.pieces.some(([k,c])=>k==="0,-3"&&c==="b"),false);
});
Deno.test("does not mutate the input state",()=>{
 const s=fixture();const before=JSON.stringify(s);
 try{applyAuthoritativeMove(s,{keys:["0,-4"],dq:0,dr:1});}catch{}
 assertEquals(JSON.stringify(s),before);
});
