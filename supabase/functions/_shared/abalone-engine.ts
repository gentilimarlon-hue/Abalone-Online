export type Color = "b" | "w";
export type SerializedState = {
  radius: 3 | 4;
  pieces: [string, Color][];
  turn: Color;
  lost: { b: number; w: number };
  bombs: { b: string | null; w: string | null };
  gameOver: boolean;
  timed?: boolean;
};
export type MoveCommand = { keys: string[]; dq: number; dr: number };
export type MoveResult = { state: SerializedState; winner: Color | null; ejected: { color: Color; bomb: boolean }[] };

const DIRS: [number, number][] = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const key = (q:number,r:number) => `${q},${r}`;
const coords = (k:string):[number,number] => k.split(",").map(Number) as [number,number];
const inside = (q:number,r:number,radius:number) => Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r)) <= radius;

function validateState(s: SerializedState) {
  if (!s || ![3,4].includes(s.radius) || !Array.isArray(s.pieces) || !s.lost ||
      !["b","w"].includes(s.turn) || !s.bombs || typeof s.gameOver !== "boolean") throw new Error("Invalid game state");
  const seen = new Set<string>();
  for (const entry of s.pieces) {
    if (!Array.isArray(entry) || entry.length!==2 || !["b","w"].includes(entry[1])) throw new Error("Invalid marble");
    const [k] = entry; const [q,r] = coords(k);
    if (!Number.isInteger(q)||!Number.isInteger(r)||!inside(q,r,s.radius)||seen.has(k)) throw new Error("Invalid marble position");
    seen.add(k);
  }
  for (const color of ["b","w"] as Color[]) {
    const bomb=s.bombs[color];
    if (bomb!==null && (!seen.has(bomb) || s.pieces.find(p=>p[0]===bomb)?.[1]!==color)) throw new Error("Invalid bomb position");
    if (!Number.isInteger(s.lost[color]) || s.lost[color]<0 || s.lost[color]>20) throw new Error("Invalid loss counter");
  }
}

export function applyAuthoritativeMove(input: SerializedState, command: MoveCommand): MoveResult {
  validateState(input);
  if (input.gameOver) throw new Error("Game already finished");
  const {keys,dq,dr}=command;
  if (!Array.isArray(keys)||keys.length<1||keys.length>3||new Set(keys).size!==keys.length ||
      !DIRS.some(([a,b])=>a===dq&&b===dr)) throw new Error("Invalid move command");
  const pieces=new Map(input.pieces), radius=input.radius, turn=input.turn;
  if(keys.some(k=>pieces.get(k)!==turn))throw new Error("Selected marble does not belong to active player");
  const arr=keys.map(coords);
  let axis:[number,number]|null=null;
  if(keys.length>1) for(const [aq,ar] of DIRS){
    const sorted=[...arr].sort((a,b)=>(a[0]*aq+a[1]*ar)-(b[0]*aq+b[1]*ar));
    if(sorted.every((p,i)=>i===0||(p[0]-sorted[i-1][0]===aq&&p[1]-sorted[i-1][1]===ar))){axis=[aq,ar];break;}
  }
  if(keys.length>1&&!axis)throw new Error("Selected marbles must form a straight line");
  const parallel=!!axis && ((dq===axis[0]&&dr===axis[1])||(dq===-axis[0]&&dr===-axis[1]));
  const inline=keys.length===1 || parallel;
  if(keys.length>1 && !axis)throw new Error("Invalid group");
  // A multi-marble group may move sideways only perpendicular to its own axis.
  if(!inline && axis && (dq===axis[0]&&dr===axis[1] || dq===-axis[0]&&dr===-axis[1]))throw new Error("Invalid sidestep");
  const ordered=[...arr].sort((a,b)=>(b[0]*dq+b[1]*dr)-(a[0]*dq+a[1]*dr));
  const front=ordered[0];
  const opponents:string[]=[];
  if(inline){
    let q=front[0]+dq,r=front[1]+dr;
    while(inside(q,r,radius)&&pieces.has(key(q,r))&&pieces.get(key(q,r))!==turn){opponents.push(key(q,r));q+=dq;r+=dr;}
    if(opponents.length && (opponents.length>=keys.length || opponents.length>2 || (inside(q,r,radius)&&pieces.has(key(q,r))))) throw new Error("Illegal push");
    if(inside(q,r,radius)&&pieces.has(key(q,r))&&pieces.get(key(q,r))===turn)throw new Error("Own marble blocks the move");
    if(!opponents.length && !inside(front[0]+dq,front[1]+dr,radius))throw new Error("Move leaves board");
  } else {
    for(const [q,r] of arr.map(([x,y])=>[x+dq,y+dr] as [number,number])){
      if(!inside(q,r,radius)||pieces.has(key(q,r)))throw new Error("Illegal sidestep");
    }
  }
  const destinations=arr.map(([q,r])=>key(q+dq,r+dr));
  if(destinations.some(k=>!inside(...coords(k),radius)))throw new Error("Move leaves board");
  const oldBombs={...input.bombs}, bombs={...input.bombs};
  for(let i=0;i<keys.length;i++)if(bombs[turn]===keys[i])bombs[turn]=destinations[i];
  for(const k of keys)pieces.delete(k);
  const lost={...input.lost}, ejected:{color:Color;bomb:boolean}[]=[];
  for(const op of [...opponents].reverse()){
    const [q,r]=coords(op), dest=key(q+dq,r+dr), victim=pieces.get(op);
    if(!victim)throw new Error("Invalid push state");
    const isBomb=oldBombs[victim]===op;
    pieces.delete(op);
    if(inside(q+dq,r+dr,radius)){
      pieces.set(dest,victim);
      if(isBomb)bombs[victim]=dest;
    } else {
      lost[victim]+=isBomb?2:1;
      ejected.push({color:victim,bomb:isBomb});
      if(isBomb)bombs[victim]=null;
    }
  }
  destinations.forEach(k=>pieces.set(k,turn));
  const winner=lost.b>=(radius===3?3:6)?"w":lost.w>=(radius===3?3:6)?"b":null;
  const state:SerializedState={radius,pieces:[...pieces.entries()],turn:winner?turn:(turn==="b"?"w":"b"),lost,bombs,gameOver:!!winner,timed:false};
  return {state,winner,ejected};
}
