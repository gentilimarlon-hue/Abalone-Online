
(() => {
const svg=document.getElementById('board'), status=document.getElementById('status'), hint=document.getElementById('hint');
let boardRadius=4,timed=false,timeLeft={b:0,w:0},timerHandle=null,timerStarted=false,timeLimitSeconds=0;
let multiplayer=false, onlineRoomCode=null, onlineToken=null, onlineColor=null, onlineStatus='offline';
let pollHandle=null, lastRemoteUpdatedAt=null, onlineBusy=false;
const SUPABASE_URL='https://mduejbovvxpdvziqyoea.supabase.co';
const SUPABASE_KEY='sb_publishable_D2hDu69XXNM0kEt2V8ocqQ_21ZK5lGI';
const cells=[], map=new Map(); let pieces=new Map(), turn='b', selected=[], lost={b:0,w:0}, gameOver=false, bombs={b:null,w:null};
const dirs=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const key=(q,r)=>q+','+r;
function buildBoard(radius){boardRadius=radius;cells.length=0;map.clear();for(let r=-radius;r<=radius;r++)for(let q=Math.max(-radius,-r-radius);q<=Math.min(radius,-r+radius);q++){let c={q,r};cells.push(c);map.set(key(q,r),c)}}
buildBoard(4);
function init(radius=4,isTimed=false,minutes=0){
 if(timerHandle){clearInterval(timerHandle);timerHandle=null;}
 buildBoard(radius);timed=isTimed;timeLeft={b:minutes*60,w:minutes*60};timeLimitSeconds=minutes*60;timerStarted=false;
 pieces=new Map();lost={b:0,w:0};turn='b';selected=[];gameOver=false;
 if(radius===4){
  for(let q=0;q<=4;q++)pieces.set(key(q,-4),'b');
  for(let q=-1;q<=4;q++)pieces.set(key(q,-3),'b');
  for(let q=0;q<=2;q++)pieces.set(key(q,-2),'b');
  for(let q=-4;q<=0;q++)pieces.set(key(q,4),'w');
  for(let q=-4;q<=1;q++)pieces.set(key(q,3),'w');
  for(let q=-2;q<=0;q++)pieces.set(key(q,2),'w');
 }else{
  for(let q=0;q<=3;q++)pieces.set(key(q,-3),'b');
  for(let q=0;q<=2;q++)pieces.set(key(q,-2),'b');
  for(let q=-3;q<=0;q++)pieces.set(key(q,3),'w');
  for(let q=-2;q<=0;q++)pieces.set(key(q,2),'w');
 }
 const bk=[...pieces.keys()].filter(k=>pieces.get(k)==='b'),wk=[...pieces.keys()].filter(k=>pieces.get(k)==='w');
 bombs.b=bk[Math.floor(Math.random()*bk.length)];bombs.w=wk[Math.floor(Math.random()*wk.length)];
 if(timed)updateTimer();
 draw();updateUI();
}
function startTimer(){
 if(!timed||timerStarted||gameOver)return;
 timerStarted=true;
 updateTimer();
 timerHandle=setInterval(()=>{
  if(gameOver){clearInterval(timerHandle);timerHandle=null;return;}
  const active=turn;
  timeLeft[active]=Math.max(0,timeLeft[active]-1);
  updateTimer();
  if(timeLeft[active]<=0){
   gameOver=true;clearInterval(timerHandle);timerHandle=null;
   const winner=active==='b'?'w':'b';
   status.textContent=(active==='b'?'Schwarz':'Weiß')+' hat keine Zeit mehr. '+(winner==='b'?'Schwarz':'Weiß')+' gewinnt!';
   updateUI();showWinAnimation(winner);
  }
 },1000);
}
function updateTimer(){
 const fmt=v=>Math.floor(v/60)+':'+String(v%60).padStart(2,'0');
 const active=turn;
 const black=document.getElementById('blackClock'),white=document.getElementById('whiteClock');
 black.textContent=fmt(timeLeft.b);white.textContent=fmt(timeLeft.w);
 black.classList.toggle('visible',timed);white.classList.toggle('visible',timed);
 black.classList.toggle('running',timed&&active==='b'&&timerStarted);
 white.classList.toggle('running',timed&&active==='w'&&timerStarted);
 const arrowB=document.createElement('span');arrowB.className='clock-arrow';arrowB.textContent=active==='b'?'▶':'';
 const arrowW=document.createElement('span');arrowW.className='clock-arrow';arrowW.textContent=active==='w'?'▶':'';
 black.prepend(arrowB);white.prepend(arrowW);
}
function xy(q,r){const z=4/boardRadius;return {x:180+(q*20+r*10)*z,y:160+r*17.32*z}}
function el(tag,attrs={}){let n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n}
function groupAxis(){if(selected.length<2)return null;let a=selected.map(k=>k.split(',').map(Number));for(const [dq,dr] of dirs){if(a.every(([q,r])=>a.some(([x,y])=>x===q+dq&&y===r+dr)||a.some(([x,y])=>x===q-dq&&y===r-dr))){let sorted=a.slice().sort((u,v)=>(u[0]*dq+u[1]*dr)-(v[0]*dq+v[1]*dr));let ok=true;for(let i=1;i<sorted.length;i++)if(sorted[i][0]-sorted[i-1][0]!==dq||sorted[i][1]-sorted[i-1][1]!==dr)ok=false;if(ok)return [dq,dr]}}return null}
function isLine(keys){if(keys.length<=1)return true;let arr=keys.map(k=>k.split(',').map(Number));for(const [dq,dr] of dirs){const s=arr.slice().sort((a,b)=>(a[0]*dq+a[1]*dr)-(b[0]*dq+b[1]*dr));if(s.every((p,i)=>i===0||(p[0]-s[i-1][0]===dq&&p[1]-s[i-1][1]===dr)))return true}return false}
function selectedSet(){return new Set(selected)}
function legalMove(keys,dq,dr){
 if(!keys.length||keys.length>3||keys.some(k=>pieces.get(k)!==turn)||!isLine(keys))return null;
 const arr=keys.map(k=>k.split(',').map(Number));let axis=null;
 if(keys.length>1){for(const [aq,ar] of dirs){let s=arr.slice().sort((a,b)=>(a[0]*aq+a[1]*ar)-(b[0]*aq+b[1]*ar));if(s.every((p,i)=>i===0||(p[0]-s[i-1][0]===aq&&p[1]-s[i-1][1]===ar))){axis=[aq,ar];break}}}
 const inline=keys.length===1||(axis&&(Math.abs(dq)===Math.abs(axis[0])&&Math.abs(dr)===Math.abs(axis[1])||dq===axis[0]&&dr===axis[1]||dq===-axis[0]&&dr===-axis[1]));
 if(!inline){
   if(keys.length<2)return null;
   let dest=arr.map(([q,r])=>key(q+dq,r+dr));
   if(dest.some(k=>!map.has(k)||pieces.has(k)))return null;
   return {keys,dest,push:[]};
 }
 let front=arr.slice().sort((a,b)=>(b[0]*dq+b[1]*dr)-(a[0]*dq+a[1]*dr))[0];
 let ownFront=key(front[0],front[1]), next=key(front[0]+dq,front[1]+dr);
 // ensure the move direction is along the selected group's axis
 if(keys.length>1&&axis&&!((dq===axis[0]&&dr===axis[1])||(dq===-axis[0]&&dr===-axis[1])))return null;
 if(!map.has(next))return null;
 if(!pieces.has(next))return {keys,dest:arr.map(([q,r])=>key(q+dq,r+dr)),push:[]};
 // Push opponents only if moving toward the front of group and group is stronger.
 let opponents=[],q=front[0]+dq,r=front[1]+dr;
 while(map.has(key(q,r))&&pieces.has(key(q,r))&&pieces.get(key(q,r))!==turn){opponents.push(key(q,r));q+=dq;r+=dr}
 if(opponents.length===0||opponents.length>=keys.length||opponents.length>2)return null;
 if(map.has(key(q,r))&&pieces.has(key(q,r)))return null;
 return {keys,dest:arr.map(([x,y])=>key(x+dq,y+dr)),push:opponents, pushEnd:map.has(key(q,r))?key(q,r):null, dq,dr};
}
function draw(){
 svg.innerHTML='';
 let defs=el('defs');
 let gb=el('radialGradient',{id:'blackGrad',cx:'30%',cy:'23%',r:'78%'});gb.append(el('stop',{offset:'0%','stop-color':'#858585'}),el('stop',{offset:'13%','stop-color':'#555'}),el('stop',{offset:'43%','stop-color':'#202020'}),el('stop',{offset:'78%','stop-color':'#080808'}),el('stop',{offset:'100%','stop-color':'#000'}));
 let gw=el('radialGradient',{id:'whiteGrad',cx:'29%',cy:'21%',r:'80%'});gw.append(el('stop',{offset:'0%','stop-color':'#ffffff'}),el('stop',{offset:'17%','stop-color':'#fffefa'}),el('stop',{offset:'43%','stop-color':'#f5f3ed'}),el('stop',{offset:'72%','stop-color':'#dedbd2'}),el('stop',{offset:'91%','stop-color':'#b9b8b2'}),el('stop',{offset:'100%','stop-color':'#858783'}));
 let shine=el('radialGradient',{id:'marbleShine',cx:'35%',cy:'20%',r:'75%'});shine.append(el('stop',{offset:'0%','stop-color':'#fff','stop-opacity':'.8'}),el('stop',{offset:'35%','stop-color':'#fff','stop-opacity':'.22'}),el('stop',{offset:'100%','stop-color':'#fff','stop-opacity':'0'}));
 defs.append(gb,gw,shine);svg.append(defs);
 let selectedKeys=selectedSet();
 for(const c of cells){let {x,y}=xy(c.q,c.r),k=key(c.q,c.r);let circle=el('circle',{cx:x,cy:y,r:9.1,class:'hole'+(selectedKeys.has(k)?' selected':'')});circle.addEventListener('click',()=>tap(k));svg.append(circle);
  if(pieces.has(k)){
    let color=pieces.get(k);
    let shade=el('ellipse',{cx:x+.35,cy:y+1.25,rx:7.65,ry:7.1,fill:'#000','fill-opacity':'.28','pointer-events':'none'});svg.append(shade);
    let m=el('circle',{cx:x,cy:y,r:7.8,class:'marble '+(color==='b'?'b':'w')});m.style.pointerEvents='none';svg.append(m);
    let gloss=el('ellipse',{cx:x-2.0,cy:y-2.5,rx:4.5,ry:3.25,fill:'url(#marbleShine)','pointer-events':'none'});svg.append(gloss);
    let glint=el('ellipse',{cx:x-2.8,cy:y-3.1,rx:1.35,ry:.85,fill:'#fff','fill-opacity':color==='b'?'.72':'.52','pointer-events':'none'});svg.append(glint);
    if(bombs[color]===k){
      let cross=el('g',{stroke:'#f21f2f','stroke-width':'2.8','stroke-linecap':'round','pointer-events':'none'});
      cross.append(el('line',{x1:x-3.5,y1:y-3.5,x2:x+3.5,y2:y+3.5}),el('line',{x1:x+3.5,y1:y-3.5,x2:x-3.5,y2:y+3.5}));
      svg.append(cross);
    }
  }
 }
}
function lineForMove(baseKeys,dq,dr){
 // Es werden ausschließlich die ausdrücklich ausgewählten Kugeln bewegt.
 // Bei einer Reihe müssen daher alle Kugeln der Gruppe einzeln markiert sein.
 return baseKeys.slice();
}
function tap(k){
 if(gameOver)return;
 if(multiplayer && (onlineStatus!=='playing' || turn!==onlineColor || onlineBusy)){
   status.textContent = onlineStatus==='waiting' ? 'Warte noch auf den zweiten Spieler.' : (turn!==onlineColor ? 'Der andere Spieler ist am Zug.' : 'Synchronisiere …');
   return;
 }
 // A player can tap the opposing marble being pushed, or the empty field
 // beyond it. Try all six directions, inferring a whole own line if needed.
 if(selected.length){
   for(const [dq,dr] of dirs){
     const autoKeys=lineForMove(selected,dq,dr);
     const mv=legalMove(autoKeys,dq,dr);
     if(mv&&(mv.dest.includes(k)||mv.push.includes(k))){
       applyMove(mv);return;
     }
   }
 }
 if(!pieces.has(k))return;
 if(pieces.get(k)!==turn){
   status.textContent='Wähle alle eigenen Kugeln der Gruppe aus und tippe anschließend auf das Zielfeld.';
   return;
 }
 if(selected.includes(k)){selected=selected.filter(x=>x!==k)}else{
   if(selected.length===0)selected=[k];
   else if(selected.length<3&&isLine([...selected,k])&&selected.some(s=>{
     let [q,r]=s.split(',').map(Number),[x,y]=k.split(',').map(Number);
     return dirs.some(([dq,dr])=>q+dq===x&&r+dr===y)
   })){selected.push(k)}
   else selected=[k];
 }
 draw();updateUI();
}
function showKnockoutAnimation(kind){
 const overlay=document.getElementById('fxOverlay');
 overlay.innerHTML='';
 const caption=document.createElement('div');caption.className='fx-caption';
 const ufo=document.createElement('div');ufo.className='fx-ufo';ufo.textContent='🛸';
 const beam=document.createElement('div');beam.className='fx-beam';
 const sniper=document.createElement('div');sniper.className='fx-sniper';sniper.textContent='🎯';
 const shot=document.createElement('div');shot.className='fx-shot';shot.textContent='💥';
 const ball=document.createElement('div');ball.className='fx-ball';ball.textContent='⚫';
 const hole=document.createElement('div');hole.className='fx-blackhole';hole.textContent='🌀';
 const tractor=document.createElement('div');tractor.className='fx-tractor';tractor.textContent='🛰️';
 if(kind==='bomb'){
   caption.textContent='💣 BOOM! EXTRA SCHADEN';
   overlay.append(caption,hole,shot,ball);
 } else {
   const variant=Math.floor(Math.random()*4);
   if(variant===0){caption.textContent='🛸 UFO-KUGEL-ENTFÜHRUNG';overlay.append(caption,ufo,beam,ball)}
   else if(variant===1){caption.textContent='🎯 RETRO-KUGEL-SCHUSS';overlay.append(caption,sniper,shot,ball)}
   else if(variant===2){caption.textContent='🌀 KUGEL IM WURMLOCH';overlay.append(caption,hole,ball)}
   else {caption.textContent='🛰️ TRAKTORSTRAHL AKTIV';overlay.append(caption,tractor,ball)}
 }
 overlay.classList.add('show');
 setTimeout(()=>{overlay.classList.remove('show');overlay.innerHTML=''},2700);
}
function showBombExplosion(){
 const overlay=document.getElementById('fxOverlay');
 overlay.innerHTML='';overlay.className='bomb-show';
 const core=document.createElement('div');core.className='blast-core';overlay.append(core);
 for(let i=0;i<34;i++){
  const f=document.createElement('i');f.className='flame';
  const angle=(Math.PI*2*i/34)+(Math.random()-.5)*.3;
  const distance=18+Math.random()*48;
  f.style.setProperty('--x',(50+Math.cos(angle)*distance)+'%');
  f.style.setProperty('--y',(50+Math.sin(angle)*distance)+'%');
  f.style.setProperty('--w',(8+Math.random()*18)+'vw');
  f.style.setProperty('--h',(32+Math.random()*58)+'vh');
  f.style.setProperty('--rot',(Math.random()*70-35)+'deg');
  f.style.setProperty('--blur',(Math.random()*3)+'px');
  f.style.setProperty('--delay',(Math.random()*.16)+'s');
  f.style.setProperty('--dur',(1.1+Math.random()*.65)+'s');
  f.style.setProperty('--dx',((Math.random()-.5)*45)+'vw');
  f.style.setProperty('--dy',((Math.random()-.5)*55)+'vh');
  overlay.append(f);
 }
 setTimeout(()=>{if(overlay.className==='bomb-show'){overlay.className='';overlay.innerHTML=''}},2300);
}
function showWinAnimation(winner){
 const overlay=document.getElementById('fxOverlay');
 overlay.innerHTML='';overlay.className='win-show';
 const title=document.createElement('div');title.className='win-title';title.textContent='WIN!';
 const subtitle=document.createElement('div');subtitle.className='win-subtitle';
 subtitle.textContent=(winner==='b'?'Schwarz':'Weiß')+' gewinnt!';
 overlay.append(title,subtitle);
 for(let i=0;i<90;i++){
  const piece=document.createElement('i');piece.className='confetti';
  piece.style.left=(Math.random()*100)+'%';
  piece.style.background=['#f5d36f','#fff1c2','#e7a93b','#d8e7db','#c98b42','#ffffff'][i%6];
  piece.style.setProperty('--delay',(Math.random()*1.5)+'s');
  piece.style.setProperty('--fall-time',(2.8+Math.random()*2.4)+'s');
  piece.style.setProperty('--drift',((Math.random()-.5)*180)+'px');
  piece.style.setProperty('--spin',(Math.random()*360)+'deg');
  overlay.append(piece);
 }
 setTimeout(()=>{overlay.className='';overlay.innerHTML=''},7000);
}
function checkWinner(){
 const winningThreshold=boardRadius===3?3:6;
 if(lost.b>=winningThreshold)return 'w';
 if(lost.w>=winningThreshold)return 'b';
 return null;
}
async function applyMove(mv){
 startTimer();
 const oldPieces=new Map(pieces);
 const oldBombs={...bombs};
 let knockedOff=[], bombKnocked=null;
 // Move the bomb marker together with its exact marble identity.
 // Update the marker before mutating the board, based on the source->destination mapping.
 for(let i=0;i<mv.keys.length;i++){
   if(bombs[turn]===mv.keys[i]) bombs[turn]=mv.dest[i];
 }
 // Remove own marbles, then shift any pushed opponents from front to back.
 for(const k of mv.keys)pieces.delete(k);
 if(mv.push.length){
   for(const op of mv.push.slice().reverse()){
     let [q,r]=op.split(',').map(Number),dest=key(q+mv.dq,r+mv.dr);
     const victim=oldPieces.get(op);
     const isBomb=oldBombs[victim]===op;
     pieces.delete(op);
     if(isBomb){
       if(map.has(dest)) bombs[victim]=dest;
       else bombs[victim]=null;
     }
     if(map.has(dest)){
       pieces.set(dest,victim);
     } else {
       knockedOff.push({key:op,color:victim,isBomb});
       if(isBomb)bombKnocked={key:op,color:victim};
     }
   }
 }
 for(let i=0;i<mv.keys.length;i++)pieces.set(mv.dest[i],turn);

 // Every ejected marble is one point; a bomb is worth two points to the opponent.
 for(const victim of knockedOff){
   lost[victim.color]+=victim.isBomb?2:1;
   if(victim.isBomb)bombs[victim.color]=null;
 }
 const explosion=!!bombKnocked;
 // Bombs still count as two points when ejected; adjacent marbles are unaffected.
 selected=[];
 const winner=checkWinner();
 if(winner){gameOver=true;if(timerHandle){clearInterval(timerHandle);timerHandle=null;}status.textContent=(winner==='b'?'Schwarz':'Weiß')+' gewinnt!';}
 else {turn=turn==='b'?'w':'b';status.textContent=(turn==='b'?'Schwarz':'Weiß')+' ist am Zug.';}
 draw();updateUI();
 if(winner)showWinAnimation(winner);
  else if(bombKnocked)showBombExplosion();
  else if(knockedOff.length)showKnockoutAnimation('normal');
 if(multiplayer) await sendOnlineState(winner);
}
function updatePlayerLabels(){
 const bName=document.getElementById('blackPlayerName'),wName=document.getElementById('whitePlayerName');
 const bRating=document.getElementById('blackPlayerRating'),wRating=document.getElementById('whitePlayerRating');
 if(!multiplayer){
  bName.textContent='Schwarz';wName.textContent='Weiß';bRating.textContent='';wRating.textContent='';return;
 }
 const mine=currentPlayer?currentPlayer.username:'Gast';
 const myRating=currentPlayer?currentPlayer.rating+' Punkte':'ohne Wertung';
 if(onlineColor==='b'){bName.textContent=mine;wName.textContent='Mitspieler';bRating.textContent=myRating;wRating.textContent='';}
 else{wName.textContent=mine;bName.textContent='Mitspieler';wRating.textContent=myRating;bRating.textContent='';}
}
function updateUI(){
 updatePlayerLabels();
 document.getElementById('pBlack').classList.toggle('active',turn==='b'&&!gameOver);
 document.getElementById('pWhite').classList.toggle('active',turn==='w'&&!gameOver);
 document.getElementById('blackCount').textContent=[...pieces.values()].filter(c=>c==='b').length+' Kugeln · '+lost.b+' Verlustpunkte';
 document.getElementById('whiteCount').textContent=[...pieces.values()].filter(c=>c==='w').length+' Kugeln · '+lost.w+' Verlustpunkte';
 if(!gameOver&&selected.length){status.textContent=(turn==='b'?'Schwarz':'Weiß')+': '+selected.length+' Kugel(n) ausgewählt. Tippe auf ein angrenzendes Zielfeld.'}
 if(hint)hint.textContent=selected.length?'Du kannst nur die hinterste Kugel auswählen: tippe dann auf das Zielfeld in Bewegungsrichtung. Zusammenhängende eigene Kugeln werden automatisch mitgezogen.':'Wähle eine eigene Kugel und tippe auf das Zielfeld. Für einen Schiebezug erkennt das Spiel zusammenhängende eigene Kugeln automatisch.';
}
document.getElementById('clear').addEventListener('click',()=>{selected=[];draw();updateUI();status.textContent=(turn==='b'?'Schwarz':'Weiß')+' ist am Zug. Auswahl aufgehoben.'});
document.getElementById('newGame').addEventListener('click',()=>{if(confirm('Neues Spiel starten? Der aktuelle Spielstand geht verloren.'))init(boardRadius,timed,timeLimitSeconds/60)});
// Hauptmenü und Spielmodi
const loginScreen=document.getElementById('loginScreen');
const mainMenu=document.getElementById('mainMenu');
const leaderboardScreen=document.getElementById('leaderboardScreen');\nconst localMenu=document.getElementById('localMenu');
const multiMenu=document.getElementById('multiMenu');
const roomScreen=document.getElementById('roomScreen');
const timeMenu=document.getElementById('timeMenu');
const gameScreen=document.getElementById('gameScreen');
function showScreen(screen){
 [loginScreen,mainMenu,leaderboardScreen,localMenu,multiMenu,roomScreen,timeMenu,gameScreen].forEach(el=>el.classList.remove('active'));
 screen.classList.add('active');
 document.body.classList.remove('fullscreen-mode');
}

let currentPlayer=null, isGuest=true, pendingInvite=null;
const DEVICE_KEY='abalone_device_token_v1';
function getDeviceToken(){
 let token=localStorage.getItem(DEVICE_KEY);
 if(!token){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);token=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem(DEVICE_KEY,token);}
 return token;
}
function renderProfile(){
 const pill=document.getElementById('profilePill');
 if(!currentPlayer){pill.style.display='none';return;}
 pill.style.display='block';document.getElementById('profileButton').textContent=currentPlayer.username+' · '+currentPlayer.rating;
}
function enterAsGuest(){currentPlayer=null;isGuest=true;renderProfile();showScreen(mainMenu);continuePendingInvite();}
async function loginPlayer(){
 const name=document.getElementById('playerNameInput').value.trim(), message=document.getElementById('loginMessage'), button=document.getElementById('accountLoginBtn');
 if(name.length<3){message.textContent='Bitte gib einen Namen mit mindestens 3 Zeichen ein.';return;}
 button.disabled=true;message.textContent='Account wird geladen …';
 try{const result=await rpc('abalone_register_player',{p_username:name,p_device_token:getDeviceToken()});currentPlayer=result;isGuest=false;renderProfile();showScreen(mainMenu);continuePendingInvite();}
 catch(e){message.textContent=e.message||'Anmeldung fehlgeschlagen.';}
 finally{button.disabled=false;}
}
async function restorePlayer(){
 const token=localStorage.getItem(DEVICE_KEY);if(!token)return false;
 try{const player=await rpc('abalone_get_player',{p_device_token:token});if(player){currentPlayer=player;isGuest=false;renderProfile();return true;}}catch(e){console.warn(e);}
 return false;
}
document.getElementById('accountLoginBtn').addEventListener('click',loginPlayer);
document.getElementById('playerNameInput').addEventListener('keydown',e=>{if(e.key==='Enter')loginPlayer();});
document.getElementById('guestContinueBtn').addEventListener('click',enterAsGuest);
document.getElementById('profileButton').addEventListener('click',()=>{
 const actions=document.getElementById('profileActions');actions.style.display=actions.style.display==='block'?'none':'block';
 const locked=multiplayer&&onlineStatus==='playing'&&!gameOver, logout=document.getElementById('logoutButton');
 logout.disabled=locked;logout.style.opacity=locked?'.4':'1';logout.title=locked?'Während eines laufenden Online-Spiels nicht möglich':'';
});
document.getElementById('logoutButton').addEventListener('click',()=>{
 if(multiplayer&&onlineStatus==='playing'&&!gameOver)return;
 currentPlayer=null;isGuest=true;document.getElementById('profileActions').style.display='none';renderProfile();showScreen(loginScreen);document.getElementById('loginMessage').textContent='Abgemeldet. Gib deinen bisherigen Spielernamen erneut ein, um dich anzumelden.';
});
function continuePendingInvite(){if(!pendingInvite)return;const code=pendingInvite;pendingInvite=null;document.getElementById('roomCodeInput').value=code;showScreen(multiMenu);joinOnlineRoom(code);}

async function loadLeaderboard(){
 const box=document.getElementById('leaderboardContent');
 const stats=document.getElementById('myStatsContent');
 box.textContent='Rangliste wird geladen …';
 if(!currentPlayer){
  stats.innerHTML='<b>Deine Statistik</b><p class="hint">Melde dich mit einem Spielernamen an, um dein Rating und deine Spielstatistik zu sehen. Als Gast spielst du ohne Wertung.</p>';
 }else{
  stats.innerHTML='<b>Deine Statistik</b><p class="hint">Spielerdaten werden geladen …</p>';
 }
 try{
  if(currentPlayer){
   try{
    const fresh=await rpc('abalone_get_player',{p_device_token:getDeviceToken()});
    if(fresh){currentPlayer=fresh;renderProfile();}
   }catch(e){console.warn('Spielerstatistik konnte nicht aktualisiert werden:',e);}
  }
  const rows=await rpc('abalone_get_leaderboard',{p_limit:20});
  if(currentPlayer){
   const me=currentPlayer;
   const rank=Array.isArray(rows)?rows.findIndex(p=>String(p.username).toLowerCase()===String(me.username).toLowerCase()):-1;
   const rankText=rank>=0?'Platz '+(rank+1)+' der Top 20':'Nicht unter den Top 20';
   const games=Number(me.games_played)||0,wins=Number(me.wins)||0,losses=Number(me.losses)||0;
   stats.innerHTML='<b>Deine Statistik</b><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px">'+
    '<div><div class="hint">Rating</div><strong style="font-size:1.35rem">'+(Number(me.rating)||270)+'</strong></div>'+
    '<div><div class="hint">Rang</div><strong>'+rankText+'</strong></div>'+
    '<div><div class="hint">Gespielte Partien</div><strong>'+games+'</strong></div>'+
    '<div><div class="hint">Siege / Niederlagen</div><strong>'+wins+' / '+losses+'</strong></div></div>';
  }
  if(!rows||!rows.length){box.textContent='Noch keine gewerteten Spieler in der Rangliste.';return;}
  box.innerHTML='<b>Rangliste · Top 20</b><div style="display:grid;grid-template-columns:36px 1fr auto;gap:9px;font-weight:700;padding:12px 0 5px"><span>Pl.</span><span>Spieler</span><span>Punkte</span></div>'+rows.map((p,i)=>{
   const mine=currentPlayer&&String(p.username).toLowerCase()===String(currentPlayer.username).toLowerCase();
   return '<div style="display:grid;grid-template-columns:36px 1fr auto;gap:9px;padding:10px 7px;border-top:1px solid #ffffff22;border-radius:7px;'+(mine?'background:#d5b77a22;':'')+'"><span>'+(i+1)+'.</span><span>'+escapeHtml(p.username)+(mine?' <small>(Du)</small>':'')+'</span><b>'+Number(p.rating||0)+'</b></div>';
  }).join('');
 }catch(e){
  box.textContent='Rangliste noch nicht verfügbar: '+e.message;
  if(currentPlayer)stats.textContent='Deine Statistik konnte nicht geladen werden.';
 }
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
document.getElementById('leaderboardButton').addEventListener('click',()=>{showScreen(leaderboardScreen);loadLeaderboard();});
document.getElementById('leaderboardBack').addEventListener('click',()=>showScreen(mainMenu));
\nfunction startGame(radius,isTimed,minutes){
 multiplayer=false; onlineStatus='offline'; onlineRoomCode=null; onlineToken=null; onlineColor=null;
 if(pollHandle){clearInterval(pollHandle);pollHandle=null;}
 document.getElementById('gameModeNotice').textContent='Lokales Spiel: Beide Personen spielen abwechselnd an diesem Gerät.';
 document.getElementById('onlineRoomInfo').style.display='none';
 showScreen(gameScreen);
 init(radius,isTimed,minutes);
}
document.getElementById('singleplayerMode').addEventListener('click',()=>showScreen(localMenu));
document.getElementById('multiplayerMode').addEventListener('click',()=>{
 showScreen(multiMenu);
 const fromUrl=new URLSearchParams(location.search).get('room');
 if(fromUrl) document.getElementById('roomCodeInput').value=fromUrl.toUpperCase();
});
document.getElementById('localBack').addEventListener('click',()=>showScreen(mainMenu));
document.getElementById('multiBack').addEventListener('click',()=>showScreen(mainMenu));
document.getElementById('standardMode').addEventListener('click',()=>startGame(4,false,0));
document.getElementById('smallMode').addEventListener('click',()=>startGame(3,false,0));
document.getElementById('timedMode').addEventListener('click',()=>showScreen(timeMenu));
document.getElementById('timeBack').addEventListener('click',()=>showScreen(localMenu));
document.querySelectorAll('.time-choice').forEach(button=>{
 button.addEventListener('click',()=>startGame(4,true,Number(button.dataset.minutes)));
});
document.getElementById('backMenu').addEventListener('click',()=>{
 if(timerHandle){clearInterval(timerHandle);timerHandle=null;}
 if(pollHandle){clearInterval(pollHandle);pollHandle=null;}
 multiplayer=false; onlineStatus='offline';
 showScreen(mainMenu);
});

function serializeState(){
 return {radius:boardRadius,pieces:[...pieces.entries()],turn,lost,bombs,gameOver,timed:false};
}
function restoreState(s){
 if(!s || !Array.isArray(s.pieces)) throw new Error('Ungültiger Spielstand vom Server.');
 if(timerHandle){clearInterval(timerHandle);timerHandle=null;}
 timed=false;timerStarted=false;timeLimitSeconds=0;timeLeft={b:0,w:0};
 buildBoard(Number(s.radius)===3?3:4);
 pieces=new Map(s.pieces); turn=s.turn==='w'?'w':'b';
 lost={b:Number(s.lost?.b)||0,w:Number(s.lost?.w)||0};
 bombs={b:s.bombs?.b||null,w:s.bombs?.w||null};
 gameOver=!!s.gameOver;selected=[];
 draw();updateUI();
}
async function rpc(name,args){
 const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{
  method:'POST',
  headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'},
  body:JSON.stringify(args)
 });
 const body=await response.text();
 let data;try{data=body?JSON.parse(body):null}catch{data=body}
 if(!response.ok) throw new Error(data?.message||data?.hint||data?.details||('Supabase-Fehler '+response.status));
 return data;
}
function setOnlineNotice(text){
 const el=document.getElementById('onlineRoomInfo');
 el.style.display='block';el.textContent=text;
}
async function createOnlineRoom(radius){
 try{
  multiplayer=true;onlineStatus='waiting';onlineColor='b';
  showScreen(gameScreen);init(radius,false,0);
  const result=await rpc('abalone_create_room',{p_mode:radius===3?'mini':'standard',p_minutes:null,p_initial_state:serializeState()});
  onlineRoomCode=result.room_code;onlineToken=result.player_token;onlineColor=result.player_color||'b';
  const invite=new URL(location.href);invite.search='?room='+encodeURIComponent(onlineRoomCode);invite.hash='';
  const inviteUrl=invite.toString();
  document.getElementById('roomCodeDisplay').textContent=onlineRoomCode;
  document.getElementById('inviteLinkDisplay').value=inviteUrl;
  document.getElementById('roomWaitText').textContent='Raum erstellt. Teile den Link; dein Mitspieler wird beim Öffnen automatisch in den Raum geleitet.';
  document.getElementById('copyCodeBtn').onclick=()=>copyText(onlineRoomCode,'Code');
  document.getElementById('copyInviteBtn').onclick=()=>copyText(inviteUrl,'Einladungslink');
  showScreen(roomScreen);
  document.getElementById('gameModeNotice').textContent='Online-Spiel · Schwarz';
  setOnlineNotice('Raum '+onlineRoomCode+' · Du spielst Schwarz.');
  startPolling();
 }catch(e){multiplayer=false;onlineStatus='offline';showScreen(multiMenu);document.getElementById('multiMessage').textContent='Fehler beim Erstellen: '+e.message;}
}
async function joinOnlineRoom(code){
 try{
  code=(code||'').trim().toUpperCase();
  if(!/^[A-F0-9]{6}$/.test(code)) throw new Error('Bitte einen gültigen sechsstelligen Einladungscode eingeben.');
  const result=await rpc('abalone_join_room',{p_room_code:code});
  multiplayer=true;onlineRoomCode=result.room_code;onlineToken=result.player_token;onlineColor=result.player_color||'w';onlineStatus='playing';
  restoreState(result.state);
  showScreen(gameScreen);
  document.getElementById('gameModeNotice').textContent='Online-Spiel · Weiß';
  setOnlineNotice('Raum '+onlineRoomCode+' · Du spielst Weiß.');
  lastRemoteUpdatedAt=null;startPolling();
 }catch(e){
  document.getElementById('multiMessage').textContent='Automatischer Beitritt nicht möglich: '+e.message+' Du kannst es erneut versuchen, indem du auf „Spiel beitreten“ tippst.';
  showScreen(multiMenu);
 }
}
async function copyText(value,label='Text'){
 const feedback=document.getElementById('roomWaitText');
 try{
  if(navigator.clipboard && window.isSecureContext){
   await navigator.clipboard.writeText(value);
  }else{
   const field=document.createElement('textarea');
   field.value=value;field.setAttribute('readonly','');
   field.style.position='fixed';field.style.opacity='0';field.style.left='-9999px';
   document.body.appendChild(field);field.select();field.setSelectionRange(0,field.value.length);
   const copied=document.execCommand('copy');field.remove();
   if(!copied) throw new Error('Kopieren durch den Browser blockiert');
  }
  feedback.textContent=label+' wurde kopiert. Du kannst ihn jetzt verschicken.';
 }catch(e){
  const field=document.createElement('textarea');field.value=value;
  field.style.position='fixed';field.style.left='8px';field.style.right='8px';field.style.bottom='16px';
  field.style.zIndex='10000';field.style.padding='12px';field.style.fontSize='16px';
  document.body.appendChild(field);field.focus();field.select();
  feedback.textContent='Automatisches Kopieren blockiert. Der Text ist markiert – bitte „Kopieren“ wählen.';
 }
}
async function sendOnlineState(winner){
 if(!multiplayer||!onlineRoomCode||!onlineToken)return;
 onlineBusy=true;
 try{
  await rpc('abalone_submit_state',{
   p_room_code:onlineRoomCode,p_player_token:onlineToken,p_state:serializeState(),
   p_next_turn:turn,p_winner:winner||null
  });
  const latest=await rpc('abalone_get_room',{p_room_code:onlineRoomCode,p_player_token:onlineToken});
  lastRemoteUpdatedAt=latest.updated_at;
  if(winner && updatePending) setTimeout(()=>location.reload(),5000);
 }catch(e){
  status.textContent='Synchronisierung fehlgeschlagen: '+e.message+' · Bitte nicht weiterspielen und Verbindung prüfen.';
 }finally{onlineBusy=false;}
}
async function pollOnlineRoom(){
 if(!multiplayer||!onlineRoomCode||!onlineToken)return;
 try{
  const remote=await rpc('abalone_get_room',{p_room_code:onlineRoomCode,p_player_token:onlineToken});
  if(remote.status==='playing' && onlineStatus==='waiting'){
   onlineStatus='playing';showScreen(gameScreen);
   document.getElementById('roomWaitText').textContent='Mitspieler ist beigetreten.';
   status.textContent='Mitspieler ist da. Schwarz beginnt.';
  }
  if(remote.updated_at && remote.updated_at!==lastRemoteUpdatedAt){
   if(lastRemoteUpdatedAt!==null && remote.state) restoreState(remote.state);
   lastRemoteUpdatedAt=remote.updated_at;
  }
  if(remote.status==='finished' && remote.winner){
   gameOver=true;updateUI();
   if(updatePending) setTimeout(()=>location.reload(),5000);
  }
 }catch(e){status.textContent='Verbindung wird wiederhergestellt …';}
}
function startPolling(){
 if(pollHandle)clearInterval(pollHandle);
 pollOnlineRoom();
 pollHandle=setInterval(pollOnlineRoom,1800);
}
document.getElementById('onlineStandard').addEventListener('click',()=>createOnlineRoom(4));
document.getElementById('onlineMini').addEventListener('click',()=>createOnlineRoom(3));
document.getElementById('joinRoomBtn').addEventListener('click',()=>joinOnlineRoom(document.getElementById('roomCodeInput').value));
const initialInvite=new URLSearchParams(location.search).get('room');
pendingInvite=initialInvite?initialInvite.toUpperCase():null;
(async()=>{const restored=await restorePlayer();if(restored){showScreen(mainMenu);continuePendingInvite();}
else{showScreen(loginScreen);if(pendingInvite)document.getElementById('loginMessage').textContent='Einladung erkannt. Bitte melde dich an oder fahre als Gast fort, um beizutreten.';}})();

// Versionsprüfung: Pages liefert neue index.html/version.json; bei laufendem Match
// wird ein Reload bis zum Ende aufgeschoben, damit kein Spielzug verloren geht.
const APP_VERSION='20.3.0';
let updatePending=false;
// Versionsprüfung ohne automatischen Reload: Ein Versionsunterschied darf
// niemals eine Reload-Schleife auslösen. Aktualisierungen erfolgen manuell.
async function checkAppVersion(){
 try{
  const response=await fetch('./version.json?check='+Date.now(),{cache:'no-store'});
  if(!response.ok)return;
  const remote=await response.json();
  if(remote.version && remote.version!==APP_VERSION) updatePending=true;
 }catch(e){}
}
checkAppVersion();

// Kein Spiel wird vor der Auswahl automatisch gestartet.
})();
