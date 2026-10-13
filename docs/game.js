import * as THREE from './vendor/three.module.min.js';
/* Razuvious practice. All encounter state stays in this browser. */
(() => {
 'use strict';
 const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)), distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const dom={viewport:$('#viewport'),room:$('#room'),overlay:$('#overlay'),opening:$('#opening-card'),result:$('#result-card'),cast:$('#castbar'),callout:$('#coach-callout'),log:$('#log'),timers:$('#combat-timers')};
 const pad=n=>String(Math.floor(n)).padStart(2,'0'), clock=t=>pad(t/60)+':'+pad(t%60);
 function readSaved(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}}
 function persist(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
 const stats=readSaved('razuvious.stats.v1',{runs:0,clean:0,best:0});
 const settings=readSaved('razuvious.settings.v1',{latency:200,handoff:10,mark:false,resists:false});
 const configs={
  pull:{title:'Own the pull.',description:'A clean pull starts before Mind Control. Get in range without waking up the room.',opening:'Patience is a priest skill.',intro:'Soothe the front adds. Read the patrol.<br>Take control before taking a step.',steps:[['Soothe the front adds','Select A and B, then use Mind Soothe.'],['Find your window','Get within 20 yd while the boss is away.'],['Let control register','Finish the cast. Wait for the pet bar.'],['Wall, then Taunt','Target Razuvious. Protect your add first.']]},
  handoff:{title:'Take the next turn.',description:'Your partner is tanking. Take a free understudy and be ready before their protection runs out.',opening:'Your partner is counting on you.',intro:'Take understudy B. Let control register.<br>Wall and Taunt before their wall expires.',steps:[['Choose the next add','Understudy A is occupied. Take B.'],['Establish control','Cast MC. Let the pet bar register.'],['Prepare the handoff','Target Razuvious. Close to 5 yd.'],['Take over safely','Wall, then Taunt with time to spare.']]}
 };
 let mode='pull', guided=true, sound=false, audioContext, tactical=false;
 let state, keys=new Set(), lastFrame=performance.now(), visualTime=0, lastUI=0;
 let overlayCtx=dom.overlay.getContext('2d'), roomView, fallbackCtx, renderPoints=[];
 let viewWidth=0,viewHeight=0,displayScale=1,dialogsPaused=false;
 const icon=(name)=>'<svg><use href="#i-'+name+'"/></svg>';
 function newAdd(id,x,z){return{id,x,z,start:{x,z},health:100,soothe:0,wall:0,wallCD:0,tauntCD:0,immune:0,controlled:false,attacking:false,angle:Math.PI,moving:false}}
 function reset(startNow=false){
  keys.clear();const handoff=mode==='handoff';
  state={status:'ready',t:0,priest:{id:'you',x:handoff?3:-4,z:handoff?28:31,angle:Math.PI,health:100,mana:100},adds:[newAdd('A',-10,5),newAdd('B',10,5),newAdd('C',-10,-17),newAdd('D',10,-17)],boss:{id:'boss',x:8,z:-16,angle:0,health:100},target:handoff?'B':'A',pet:null,cast:null,registration:0,channel:0,gcd:0,combat:false,aggro:null,taunt:0,partner:0,partnerChannel:0,steps:[false,false,false,false],penalties:0,notes:[],logs:[],toast:null,hold:0,wallAtTaunt:0,handoffMargin:null,mark:!!settings.mark,latency:settings.latency/1000,resists:!!settings.resists,warning:false,shout:25,shoutCast:0,history:[],patrolOffset:Math.random()*(guided?6:40),challenge:!guided,success:false};
  if(handoff){const a=state.adds[0],b=state.adds[1];a.x=-2;a.z=14;a.wall=Number(settings.handoff);a.controlled=true;b.x=4;b.z=17;state.boss.x=-1;state.boss.z=11;state.boss.angle=0;state.combat=true;state.aggro='A';state.taunt=Number(settings.handoff);state.partner=Number(settings.handoff);state.partnerChannel=Number(settings.handoff)+2.4;state.steps[0]=true}
  dom.result.hidden=true;dom.result.classList.remove('failed');dom.opening.hidden=false;dom.viewport.classList.add('ready');$('#pause-button').innerHTML=icon('clock')+' Pause';$('.paused-badge')?.remove();
  const config=configs[mode];$('#drill-title').textContent=config.title;$('#drill-description').textContent=config.description;$('#drill-number').textContent=(handoff?'02':'01')+' / 02';
  dom.opening.innerHTML='<div class="eyebrow">THE '+(handoff?'HANDOFF · DRILL 02':'PULL · DRILL 01')+'</div><h2>'+config.opening+'</h2><p>'+config.intro+'</p><button class="primary" id="begin-button">'+icon('play')+' Begin practice <kbd>ENTER</kbd></button><span class="opening-note">No repair bill. As many pulls as it takes.</span>';
  $('#begin-button').addEventListener('click',start);
  $('#checklist').innerHTML=config.steps.map(([title,detail])=>'<li><div><strong>'+title+'</strong><small>'+detail+'</small></div></li>').join('');
  $('#priest-note').textContent=handoff?'Shield Wall first, then Taunt. Start MC early enough to finish the cast and the registration pause before your partner needs you.':'After MC finishes casting, wait for control to register. Moving too soon moves your priest and breaks the channel.';
  dom.log.innerHTML='';addLog(handoff?'Your partner holds A. Understudy B is free.':'The room is quiet. Keep it that way.');updateUI();
  if(startNow)start();
 }
 function start(){if(state.status!=='ready')return;state.status='running';dom.opening.hidden=true;dom.viewport.classList.remove('ready');stats.runs++;saveStats();addLog(mode==='pull'?'Soothe A and B. Watch Razuvious before stepping down.':'Partner: "My wall is fading. Get ready."');toast(mode==='pull'?'Select a front add and press 1 to Mind Soothe.':'B is free. Cast Mind Control now, then wait for the pet bar.',false,5);dom.viewport.focus({preventScroll:true});tone(440,.09)}
 function saveStats(){persist('razuvious.stats.v1',stats);$('#runs').textContent=pad(stats.runs);$('#clean').textContent=pad(stats.clean);$('#best').textContent=stats.best||'--'}
 function addLog(message,type=''){const entry={t:state.t,message,type};state.logs.push(entry);const div=document.createElement('div');div.className='log-entry '+type;const time=document.createElement('time');time.textContent=clock(state.t);const span=document.createElement('span');span.textContent=message;div.append(time,span);dom.log.append(div);if(dom.log.childElementCount>40)dom.log.firstChild.remove();dom.log.scrollTop=dom.log.scrollHeight;}
 function toast(message,error=false,duration=3){state.toast={message,error,until:state.t+duration};if(error)tone(150,.09);updateUI()}
 function penalty(message,n=8){state.penalties+=n;if(!state.notes.includes(message))state.notes.push(message)}
 function tone(freq,duration=.1){if(!sound)return;try{audioContext??=new (window.AudioContext||window.webkitAudioContext)();audioContext.resume();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.07,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration)}catch{}}
 const getTarget=()=>state.target==='boss'?state.boss:state.adds.find(a=>a.id===state.target);
 const pet=()=>state.adds.find(a=>a.id===state.pet);
 function selectTarget(id){state.target=id;updateUI();tone(350,.035)}
 function cycleTarget(){if(state.pet&&state.target===state.pet){selectTarget('boss');return}const order=state.pet?['boss',...state.adds.map(a=>a.id)]:mode==='handoff'?['B','C','D','A','boss']:['A','B','boss','C','D'];selectTarget(order[(order.indexOf(state.target)+1)%order.length])}
 function los(a,b){
  // The two ramp rails are the room's cover. This is an approximate collision model.
  for(const x of [-7.1,7.1]){if(Math.abs(a.x-b.x)<.001)continue;const u=(x-a.x)/(b.x-a.x);if(u>0&&u<1){const z=a.z+(b.z-a.z)*u;if(z>18&&z<30)return false}}
  return true;
 }
 function usablePoint(x,z){if(x<-28||x>28||z<-29||z>35)return false;for(const rx of [-7.1,7.1])if(Math.abs(x-rx)<.8&&z>18&&z<30)return false;return true}
 function stepEntity(e,dx,dz,speed,dt){const l=Math.hypot(dx,dz);if(!l){e.moving=false;return}dx/=l;dz/=l;const x=e.x+dx*speed*dt,z=e.z+dz*speed*dt;if(usablePoint(x,e.z))e.x=x;if(usablePoint(e.x,z))e.z=z;e.angle=Math.atan2(dx,dz);e.moving=true}
 function action(name){
  if(state.status!=='running'){if(state.status==='ready')toast('Begin practice to use abilities.');return}
  state.history.push({t:state.t,action:name,target:state.target});
  if(name==='release'){if(state.pet||state.cast||state.registration>0)breakControl('You pressed Escape and cancelled Mind Control.');return}
  if(name==='macro'){
   if(state.mark){state.mark=false;addLog('Macro removed Mark of the Wild.','success')}
   if(!state.pet){action('mc');return}
   // The supplied macro does not change target. Both pet spells are off the GCD.
   action('attack');action('wall');action('taunt');return;
  }
  if(state.registration>0){toast('Control has not registered yet. Wait for the pet bar.',true,2);return}
  if(state.cast){if(['mc','soothe'].includes(name))toast('Mind Control is still casting. Keep still.');else toast('No pet abilities until control registers.',true);return}
  if(['soothe','mc','heal'].includes(name)&&state.pet){breakControl('You cast a priest spell during Mind Control. Use the pet bar while channeling.');return}
  const target=getTarget(), p=pet();
  if(['wall','taunt','attack'].includes(name)&&!p){toast('Mind Control an understudy before using pet abilities.',true);return}
  if(name==='soothe'){
   if(state.gcd>0){toast('Mind Soothe is on the global cooldown.');return}
   if(!target||target.id==='boss'){toast('Select a Deathknight Understudy to Soothe.',true);return}
   if(target.controlled){toast('That understudy is already controlled.',true);return}
   if(distance(state.priest,target)>40){toast('Mind Soothe needs a target within 40 yd.',true);return}
   if(!los(state.priest,target)){toast('Target is behind the ramp wall. Find line of sight.',true);return}
   state.gcd=1.5;state.priest.mana=Math.max(0,state.priest.mana-1.2);
   if(state.resists&&Math.random()<.1){fail('Mind Soothe resisted.','A resisted Soothe can aggro the target. This attempt used the optional training resist rate.');return}
   target.soothe=15;addLog('Mind Soothe on '+target.id+'. Detection range reduced for 15s.','success');tone(590,.1);
   if(state.adds[0].soothe>0&&state.adds[1].soothe>0){state.steps[0]=true;toast('Front adds soothed. Get within 20 yd and wait for the patrol to move away.',false,5)}
   return;
  }
  if(name==='mc'){
   if(keys.size>0){toast('Stop moving before you begin Mind Control.',true);return}
   if(state.gcd>0){toast('Wait for the global cooldown.');return}
   if(!target||target.id==='boss'){toast('Razuvious cannot be Mind Controlled. Select an understudy.',true);return}
   if(target.controlled){toast('Your partner already controls that add. Take a free understudy.',true);return}
   if(target.immune>0){toast('Mind Exhaustion: '+target.immune.toFixed(1)+'s before this add can be controlled again.',true);return}
   if(distance(state.priest,target)>20){toast('Out of range. Mind Control needs 20 yd or less.',true);return}
   if(!los(state.priest,target)){toast('No line of sight to the understudy. Move around the ramp wall.',true);return}
   if(state.mark){penalty('You cast MC with Mark of the Wild still active.',10);addLog('Mark of the Wild is still active. Your macro can remove it.','error')}
   state.steps[mode==='pull'?1:0]=true;state.cast={target:target.id,left:3};state.gcd=1.5;state.priest.mana-=10;keys.clear();state.priest.angle=Math.atan2(target.x-state.priest.x,target.z-state.priest.z);addLog('Casting Mind Control on '+target.id+'.');tone(270,.2);return;
  }
  if(name==='wall'){
   if(p.wallCD>0){toast('Shield Wall cooldown: '+p.wallCD.toFixed(1)+'s.',true);return}
   p.wall=20;p.wallCD=30;state.wallAtTaunt=state.t;addLog(p.id+': Shield Wall up. 75% damage reduction for 20s.','success');toast('Shield Wall is up. Target Razuvious and Taunt within 5 yd.',false,4);tone(480,.12);return;
  }
  if(name==='attack'){
   if(!target||target.id===p.id||target.controlled){toast('Select Razuvious for Pet attack.',true);return}
   if(target.id!=='boss'){toast('Attack Razuvious. Keep the other understudies alive.',true);penalty('You attacked another understudy.',5);return}
   p.attacking=true;toast('Understudy moving to attack. Taunt requires melee range.',false,2);return;
  }
  if(name==='taunt'){
   if(state.target!=='boss'){toast('Target Instructor Razuvious first. The macro does not target him for you.',true);return}
   if(p.tauntCD>0){toast('Taunt cooldown: '+p.tauntCD.toFixed(1)+'s.',true);return}
   if(distance(p,state.boss)>5){toast('Too far away. Move your understudy or use Pet attack. Taunt needs 5 yd.',true);return}
   if(p.wall<=0){fail('Taunt without Shield Wall.','Protect your understudy before Taunt. The boss can kill an unprotected add in a few hits.');return}
   const margin=mode==='handoff'?state.partner:null;state.handoffMargin=margin;
   if(mode==='handoff'&&margin>5)penalty('You taunted early. Let your partner use more of their wall.',Math.round((margin-5)*3));
   if(mode==='handoff'&&margin<=0)penalty('Your partner lost Shield Wall before your Taunt.',20);
   if(state.t-state.wallAtTaunt>4)penalty('You used Shield Wall too early before your Taunt.',8);
   state.aggro=p.id;state.taunt=20;p.tauntCD=60;p.attacking=true;state.steps[2]=true;state.steps[3]=true;if(mode==='pull'&&!state.steps[0]){penalty('The second front add was not soothed. Practice preparing both.',8);addLog('Only one front add was soothed. Your approach worked, but preparation was incomplete.','error')}state.hold=0;state.partnerChannel=Math.min(state.partnerChannel,1.2);addLog(p.id+' taunted Razuvious'+(margin!==null?' with '+Math.max(0,margin).toFixed(1)+'s left.':'.'),'success');toast('You have the boss. Hold steady. Pet abilities only.',false,5);tone(760,.15);return;
  }
 }
 function breakControl(reason){const p=pet();if(p){p.controlled=false;p.immune=45;p.attacking=false}state.pet=null;state.cast=null;state.registration=0;state.channel=0;addLog('Mind Control broken.','error');fail('Mind Control broke.',reason)}
 function fail(title,reason){if(state.status!=='running')return;state.status='failed';keys.clear();state.success=false;tone(170,.35);addLog(title,'error');state.toast=null;dom.result.hidden=false;dom.result.classList.add('failed');dom.result.innerHTML='<div class="eyebrow">ATTEMPT '+pad(stats.runs)+'</div><h2>'+title+'</h2><p>'+reason+'</p><div class="result-detail">'+(mode==='pull'?'Soothe → position → MC → wait → Wall → Taunt':'MC → wait → boss target → Wall → Taunt')+'</div><button class="primary" id="retry-button">'+icon('reset')+' Try again <kbd>R</kbd></button><button class="secondary-result" id="review-button">Review the field guide</button>';$('#retry-button').onclick=()=>reset(true);$('#review-button').onclick=()=>openDialog('guide');updateUI()}
 function success(){if(state.status!=='running')return;state.status='success';state.success=true;keys.clear();const score=clamp(100-state.penalties,0,100);if(score>=90)stats.clean++;stats.best=Math.max(stats.best,score);saveStats();tone(660,.2);addLog('Clean control. Drill complete.','success');dom.result.hidden=false;dom.result.classList.remove('failed');const detail=mode==='handoff'?'Taunt landed '+Math.max(0,state.handoffMargin).toFixed(1)+'s before the outgoing wall expired.':'Safe approach, registered control, Shield Wall before Taunt.';dom.result.innerHTML='<div class="eyebrow">'+(score>=90?'CLEAN RUN':'DRILL COMPLETE')+'</div><h2>'+(mode==='pull'?'The room is yours.':'A clean change of hands.')+'</h2><div class="result-score">'+score+'<small> / 100</small></div><p>'+detail+'</p><div class="result-detail">'+(state.notes[0]||'You held Razuvious safely for 6 seconds.')+'</div><button class="primary" id="retry-button">'+icon('reset')+' Practice again <kbd>R</kbd></button><button class="secondary-result" id="next-button">'+(mode==='pull'?'Practice the handoff →':'Practice the pull →')+'</button>';$('#retry-button').onclick=()=>reset(true);$('#next-button').onclick=()=>changeMode(mode==='pull'?'handoff':'pull');updateUI()}
 function update(dt){
  if(state.status!=='running')return;state.t+=dt;state.gcd=Math.max(0,state.gcd-dt);
  for(const a of state.adds){a.soothe=Math.max(0,a.soothe-dt);a.wall=Math.max(0,a.wall-dt);a.wallCD=Math.max(0,a.wallCD-dt);a.tauntCD=Math.max(0,a.tauntCD-dt);a.immune=Math.max(0,a.immune-dt);a.moving=false}
  state.taunt=Math.max(0,state.taunt-dt);
  let dx=(keys.has('d')?1:0)-(keys.has('a')?1:0),dz=(keys.has('s')?1:0)-(keys.has('w')?1:0);
  if(dx||dz){
   if(state.cast){breakControl('You moved your priest during the 3-second cast. Stand still until the cast and registration pause finish.');return}
   if(state.registration>0){breakControl('You moved before control registered. That moved your priest and broke MC. Wait for the green channel bar and pet abilities.');return}
   const e=pet()||state.priest;stepEntity(e,dx,dz,e.id==='you'?5:4.6,dt);if(e.id!=='you')e.attacking=false;
  }else state.priest.moving=false;
  if(!state.combat){
   const pathTime=(state.t+state.patrolOffset)%40,segment=Math.floor(pathTime/10),local=pathTime%10;const phase=Math.PI/4+segment*Math.PI/2+Math.max(0,local-2)/8*Math.PI/2;state.boss.x=Math.cos(phase)*11;state.boss.z=-6-Math.sin(phase)*11;state.boss.angle=Math.atan2(-Math.sin(phase),-Math.cos(phase));
   for(const a of state.adds){const detect=a.soothe>0?10:20;if(distance(state.priest,a)<detect&&los(state.priest,a)){fail('You pulled an understudy.','You entered '+a.id+'\'s detection range'+(a.soothe>0?' even with Mind Soothe active.':' without Mind Soothe.')+' Soothe before approaching, then stay outside the reduced range.');return}}
   if(distance(state.priest,state.boss)<22&&los(state.priest,state.boss)){fail('The patrol caught you.','Wait farther up the ramp until Razuvious is on the far side. Mind Soothe on an understudy does not protect you from the boss.');return}
  }
  if(state.cast){
   const a=state.adds.find(a=>a.id===state.cast.target);if(!los(state.priest,a)||distance(state.priest,a)>20.2){breakControl('You lost line of sight or moved out of cast range before MC completed.');return}
   state.cast.left-=dt;
   if(state.cast.left<=0){
    if(state.resists&&Math.random()<.1){fail('Mind Control resisted.','Your spell did not land. On a real pull, call the resist immediately so the raid can cover or reset.');return}
    const targetID=state.cast.target;state.cast=null;state.registration=state.latency;state.pet=targetID;a.controlled=true;state.channel=60;
    if(!state.combat){state.combat=true;state.aggro='you';addLog('Mind Control landed. Razuvious is coming.');}
    state.steps[mode==='pull'?2:1]=false;toast('Cast finished. Do not move until control registers.',false,1.5);return;
   }
  }
  if(state.registration>0){state.registration-=dt;if(state.registration<=0){state.registration=0;state.steps[mode==='pull'?2:1]=true;addLog('Control registered. Pet bar active.','success');toast('You control '+state.pet+'. Target Razuvious. Wall, then Taunt.',false,4);tone(620,.08)}}
  if(state.pet){
   state.channel-=dt;const p=pet();
   if(state.channel<=0){breakControl('The 60-second channel expired. Arrange the next handoff before your MC ends.');return}
   if(!los(state.priest,p)){breakControl('Your understudy crossed behind the ramp wall. Keep line of sight between your priest and the controlled add.');return}
   if(distance(state.priest,p)>100){breakControl('Your understudy moved beyond the simulated 100 yd possession limit. Keep it close to the priest.');return}
   if(p.attacking&&distance(p,state.boss)>3.8)stepEntity(p,state.boss.x-p.x,state.boss.z-p.z,4.5,dt);
   if(p.attacking&&distance(p,state.boss)<=5)state.steps[2]=true;
   if(state.aggro===p.id){state.hold+=dt;if(state.hold>=6&&p.wall>0){success();return}}
  }
  if(state.combat){
   if(mode==='handoff'){
    state.partner=Math.max(0,state.partner-dt);state.partnerChannel-=dt;
    if(state.partner<4.5&&!state.warning&&state.aggro==='A'){state.warning=true;addLog('Partner: "Wall nearly gone. Your turn."');toast('Partner wall: '+state.partner.toFixed(1)+'s. Shield Wall, then Taunt!',false,4);tone(720,.1)}
    if(state.partnerChannel<=0&&state.adds[0].controlled){state.adds[0].controlled=false;state.adds[0].immune=45;addLog('Partner released A. Mind Exhaustion: 45s.');if(state.aggro==='A'){fail('Your partner lost control.','The outgoing priest\'s channel ended before you took over. Begin MC earlier, wait for registration, then Wall and Taunt.');return}}
   }
   let tank=state.aggro==='you'?state.priest:state.adds.find(a=>a.id===state.aggro);
   if(tank){
    const d=distance(state.boss,tank);if(d>3.2)stepEntity(state.boss,tank.x-state.boss.x,tank.z-state.boss.z,6.4,dt);else{state.boss.angle=Math.atan2(tank.x-state.boss.x,tank.z-state.boss.z);if(tank.id==='you'){fail('Razuvious reached your priest.','Get your understudy in melee range and Taunt as soon as control registers. Use Shield Wall first.');return}tank.health-=dt*(tank.wall>0?2:36);if(tank.wall>0)tank.health=Math.min(100,tank.health+dt*3);if(tank.health<=0){fail('The understudy died.','Shield Wall ran out while the add was still tanking. Have the next priest take over before protection fades.');return}}
   }
   // Losing a taunt does not erase threat. The current tank keeps the boss.
   state.shout-=dt;if(state.shout<=1.5&&state.shoutCast===0){state.shoutCast=1.5;toast('Disrupting Shout incoming. The ramp wall provides cover.',false,2)}
   if(state.shout<=0){state.shout=25;state.shoutCast=0;addLog('Razuvious used Disrupting Shout.');if(los(state.priest,state.boss)&&distance(state.priest,state.boss)<45){state.priest.mana=Math.max(0,state.priest.mana-50);penalty('Your priest was exposed to Disrupting Shout.',12);toast('Disrupting Shout hit your priest. Use the ramp wall for cover.',true,4)}}
  }
 }
 function updateUI(){
  if(!state)return;const p=pet(),target=getTarget(),actor=p&&state.registration<=0?p:state.priest;
  $('#target-portrait').textContent=state.target==='boss'?'☠':state.target;$('#target-name').innerHTML=(state.target==='boss'?'Razuvious':'Understudy '+state.target)+' <span>'+(state.target==='boss'?'?? BOSS':'60 ELITE')+'</span>';
  $('#target-health').style.width=(target?.health??100)+'%';$('#mana-bar').style.width=state.priest.mana+'%';
  let tstatus=target?'Target · '+distance(actor,target).toFixed(1)+' yd':'No target';if(target?.immune>0)tstatus='Mind Exhaustion · '+target.immune.toFixed(1)+'s';else if(target?.soothe>0)tstatus+=' · Soothed '+target.soothe.toFixed(0)+'s';else if(target?.controlled)tstatus+=' · '+(state.target===state.pet?'Yours':'Partner');$('#target-state').textContent=tstatus;
  $('#player-state').textContent=state.cast?'Casting Mind Control':state.registration>0?'Waiting for control...':p?'Controlling '+p.id+' · '+state.channel.toFixed(0)+'s':state.mark?'Mark of the Wild active':state.combat?'In combat':'Ready to pull';
  $('#action-owner').innerHTML='<span class="online-dot"></span> '+(p&&state.registration<=0?'UNDERSTUDY '+p.id+' · PET ABILITIES':'PRIEST ABILITIES');
  $$('.pet-spell').forEach(b=>b.classList.toggle('unavailable',!p||state.registration>0));
  $('.wall-art .cooldown').textContent=p?.wallCD>0?Math.ceil(p.wallCD):'';$('.taunt-art .cooldown').textContent=p?.tauntCD>0?Math.ceil(p.tauntCD):'';
  $('#elapsed').textContent=clock(state.t);$('#scene-mode').textContent=state.status==='paused'?'PAUSED':guided?'GUIDED PRACTICE':'RAID NIGHT';
  const checkItems=$$('#checklist li');let active=state.steps.indexOf(false);checkItems.forEach((li,i)=>{li.classList.toggle('done',!!state.steps[i]);li.classList.toggle('active',i===active)});
  dom.cast.hidden=!state.cast&&!state.pet;
  if(state.cast){dom.cast.classList.remove('channel');$('#cast-label').textContent='Mind Control · casting';$('#cast-time').textContent=Math.max(0,state.cast.left).toFixed(1)+'s';$('#cast-fill').style.width=(1-state.cast.left/3)*100+'%'}
  else if(p){dom.cast.classList.toggle('channel',state.registration<=0);$('#cast-label').textContent=state.registration>0?'Wait for control...':'Mind Control · '+p.id;$('#cast-time').textContent=state.registration>0?Math.max(0,state.registration).toFixed(1)+'s':state.channel.toFixed(1)+'s';$('#cast-fill').style.width=(state.registration>0?100:state.channel/60*100)+'%'}
  dom.timers.hidden=!state.combat;let remaining=mode==='handoff'&&state.aggro==='A'?state.partner:p?.wall||0;$('#tank-name').textContent=state.aggro===state.pet&&state.pet?'YOUR UNDERSTUDY '+state.pet:mode==='handoff'?'OTHER PRIEST':'BOSS UNTANKED';$('#wall-time').textContent=remaining.toFixed(1)+'s';$('#wall-bar').style.width=clamp(remaining/(state.aggro===state.pet?20:Number(settings.handoff)),0,1)*100+'%';$('#timer-detail').textContent='Shield Wall · Taunt '+state.taunt.toFixed(1)+'s';dom.timers.classList.toggle('urgent',remaining<4);
  const showToast=state.toast&&state.toast.until>=state.t&&state.status==='running';dom.callout.hidden=!showToast;if(showToast){$('#callout-text').textContent=state.toast.message;dom.callout.classList.toggle('error',state.toast.error)}
 }
 function changeMode(newMode){mode=newMode;$$('[data-mode]').forEach(b=>{const chosen=b.dataset.mode===mode;b.classList.toggle('selected',chosen);b.setAttribute('aria-selected',chosen)});reset()}
 function pause(){if(!['running','paused'].includes(state.status))return;if(state.status==='running'){state.status='paused';keys.clear();const badge=document.createElement('div');badge.className='paused-badge';badge.textContent='Practice paused';dom.viewport.append(badge);$('#pause-button').innerHTML=icon('play')+' Resume'}else{state.status='running';$('.paused-badge')?.remove();$('#pause-button').innerHTML=icon('clock')+' Pause'}updateUI()}
 function openDialog(name){if(state.status==='running'){pause();dialogsPaused=true}$('#'+name+'-dialog').showModal();if(name==='guide')showGuide('controls');if(name==='settings'){$('#latency-setting').value=settings.latency;$('#handoff-setting').value=settings.handoff;$('#mark-setting').checked=settings.mark;$('#resist-setting').checked=settings.resists}}
 function closeDialog(dialog){dialog.close();if(dialogsPaused){dialogsPaused=false;if(state.status==='paused')pause()}}
 function showGuide(tab){
  $$('[data-guide]').forEach(b=>b.classList.toggle('selected',b.dataset.guide===tab));
  const macro='#showtooltip Mind Control\n/cancelaura Mark of the Wild\n/cancelaura Gift of the Wild\n/cast [nopet,harm] Mind Control\n/petattack\n/cast Shield Wall\n/cast Taunt';
  const content={
   controls:'<p>Click an enemy or its nameplate to target it. Begin with <kbd>Enter</kbd>. The numbered buttons also work with touch.</p><div class="guide-grid"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move the priest, or your controlled add. Directions follow the room: W goes toward the far wall.</div><div><kbd>Tab</kbd> Cycle targets.<br>Once controlled, the next Tab targets Razuvious.</div><div><kbd>1</kbd> Mind Soothe<br><kbd>2</kbd> Mind Control</div><div><kbd>3</kbd> Shield Wall<br><kbd>4</kbd> Taunt<br><kbd>5</kbd> Pet attack</div><div><kbd>F</kbd> Your MC macro. First press casts MC. Once control registers, select the boss and press again. Repeat when he enters Taunt range.</div><div><kbd>Esc</kbd> Cancel MC.<br><kbd>H</kbd> Cast a priest heal, which breaks MC.<br><kbd>P</kbd> Pause. <kbd>R</kbd> Restart.</div></div><p>The macro does not select Razuvious. Retarget him during the MC cast or after the pet bar appears. Widow\'s Embrace and Destroy egg belong to other encounters and are omitted from this drill.</p><pre class="macro-code"></pre><button class="copy-macro">Copy Razuvious macro</button>',
   mechanics:'<ul class="guide-list"><li><strong>Mind Soothe.</strong> Instant, 40 yd range, 1.5s global cooldown. Reduces the target\'s detection range by 10 yd for 15s. It does not soothe Razuvious when cast on an add.</li><li><strong>Mind Control.</strong> 3s cast, 20 yd cast range, up to 60s channel. Stand still through the cast and registration pause. Movement then controls the add. Priest spells and Escape cancel control.</li><li><strong>Shield Wall.</strong> 75% damage reduction for 20s, 30s cooldown. Use it before Taunt. It is an understudy ability, not the priest\'s Power Word: Shield.</li><li><strong>Taunt.</strong> 5 yd range, 20s forced attack, 60s cooldown. Auto attacks build threat, so expiry does not automatically make the boss change targets. Rotate before protection or control expires.</li><li><strong>Mind Exhaustion.</strong> Releasing an understudy leaves it immune to another MC for 45s. Choose a different available add.</li><li><strong>Positioning.</strong> Keep the boss at the ramp\'s foot. Priests and healers use the railing for cover from Disrupting Shout while maintaining line of sight to the controlled add.</li></ul>',
   sources:'<p>Based on the level-60, 40-player Classic encounter. The room is a procedural reconstruction of the circular training floor, four understudies and entry ramp. It is not a copy of the game map.</p><div class="guide-links"><a href="https://www.wowhead.com/classic/guide/instructor-razuvious-naxxramas-raid-strategy" target="_blank" rel="noopener noreferrer">Wowhead · Classic Razuvious encounter guide ↗</a><a href="https://www.wowhead.com/classic/spell=29060/taunt" target="_blank" rel="noopener noreferrer">Classic spell data · Taunt ↗</a><a href="https://www.wowhead.com/classic/spell=29061/shield-wall" target="_blank" rel="noopener noreferrer">Classic spell data · Shield Wall ↗</a><a href="https://www.wowhead.com/classic/spell=10953/mind-soothe" target="_blank" rel="noopener noreferrer">Classic spell data · Mind Soothe ↗</a><a href="https://wowwiki-archive.fandom.com/wiki/Instructor_Razuvious_(original)" target="_blank" rel="noopener noreferrer">Original encounter notes · Mind Soothe pull ↗</a><a href="https://www.sageguide.net/naxxramas" target="_blank" rel="noopener noreferrer">Sage Guide · Room and ramp positioning reference ↗</a></div><p><strong>Training approximations.</strong> Room scale, detection radii, the patrol path, movement, line of sight, damage and healing are estimates. The 200–600 ms registration delay is configurable practice latency. The outgoing partner\'s channel ends 2.4s after the wall to make late handoffs visible. A 100 yd possession limit follows original-era notes, not a verified current-server distance.</p><p>Guided mode shows detection circles and the patrol. Raid night hides these aids. Optional resists use a deliberately exaggerated 10% rate. Random heartbeat breaks, full threat tables, talents, server batching and the wider raid are not simulated. This tool trains the sequence and timing; confirm positioning and spell behavior with your raid.</p><p>Spell icons are Blizzard game assets served by Wowhead. World of Warcraft belongs to Blizzard Entertainment. This trainer is independent. Progress is stored only in your browser.</p>'
  };
  $('#guide-content').innerHTML=content[tab];if(tab==='controls'){$('.macro-code').textContent=macro;$('.copy-macro').onclick=async()=>{try{await navigator.clipboard.writeText(macro);$('.copy-macro').textContent='Copied'}catch{$('.copy-macro').textContent='Select the macro above to copy'}}}
 }
 function initEvents(){
  $$('[data-mode]').forEach(b=>b.onclick=()=>changeMode(b.dataset.mode));$$('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));$$('[data-dialog]').forEach(b=>b.onclick=()=>openDialog(b.dataset.dialog));$('#training-nav').onclick=()=>dom.viewport.scrollIntoView({behavior:'smooth',block:'center'});$$('[data-guide]').forEach(b=>b.onclick=()=>showGuide(b.dataset.guide));$$('.close-dialog').forEach(b=>b.onclick=()=>closeDialog(b.closest('dialog')));
  $$('dialog').forEach(d=>{d.addEventListener('cancel',event=>{event.preventDefault();closeDialog(d)});d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d)}})});
  $('#save-settings').onclick=()=>{settings.latency=Number($('#latency-setting').value);settings.handoff=Number($('#handoff-setting').value);settings.mark=$('#mark-setting').checked;settings.resists=$('#resist-setting').checked;persist('razuvious.settings.v1',settings);closeDialog($('#settings-dialog'));if(state.status==='ready')reset()};
  $('#restart-button').onclick=()=>reset();$('#pause-button').onclick=pause;
  $('#guided-button').onclick=()=>setDifficulty(true);$('#raid-button').onclick=()=>setDifficulty(false);
  $('#camera-button').onclick=()=>{tactical=!tactical;$('#camera-button').innerHTML=tactical?'TOP <span>↗</span>':'3D <span>↗</span>';$('#camera-button').setAttribute('aria-label',tactical?'Switch to 3D view':'Switch to tactical view');roomView?.setCamera(tactical)};
  $('#sound-button').onclick=()=>{sound=!sound;$('#sound-button').style.color=sound?'#c9dda6':'';$('#sound-button').setAttribute('aria-pressed',sound);$('#sound-button').setAttribute('aria-label',sound?'Disable sound':'Enable sound');tone(440,.1)};
  $('#fullscreen-button').onclick=async()=>{try{const panel=$('.arena-panel');if(document.fullscreenElement)await document.exitFullscreen();else await panel.requestFullscreen()}catch{toast('Fullscreen is unavailable in this browser.',false,3)}};
  window.addEventListener('keydown',e=>{
   if($('dialog[open]')||e.target.matches('input,select,textarea')||e.metaKey||e.ctrlKey||e.altKey)return;
   const key=e.key.toLowerCase();if(key==='tab'&&!e.target.closest('.arena-panel'))return;if(['tab',' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();
   if(e.repeat&&['1','2','3','4','5','f','r','p','enter'].includes(key))return;
   if(['w','a','s','d'].includes(key)){e.preventDefault();keys.add(key)}
   const arrow={arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'};if(arrow[key])keys.add(arrow[key]);
   if(key==='enter'){if(state.status==='ready')start();else if(state.status==='paused')pause()}
   if(key==='tab')cycleTarget();if(key==='r')reset(true);if(key==='p')pause();if(key==='escape')action('release');
   const abilities={'1':'soothe','2':'mc','3':'wall','4':'taunt','5':'attack','f':'macro','h':'heal'};if(abilities[key])action(abilities[key]);
  });
  window.addEventListener('keyup',e=>{const key=e.key.toLowerCase();keys.delete(key);const arrow={arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'};if(arrow[key])keys.delete(arrow[key])});window.addEventListener('blur',()=>{keys.clear();if(state.status==='running')pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.status==='running')pause()});
  dom.viewport.addEventListener('pointerdown',e=>{if(e.target!==dom.room&&e.target!==dom.overlay)return;const bounds=dom.viewport.getBoundingClientRect(),x=e.clientX-bounds.left,y=e.clientY-bounds.top;const point=renderPoints.filter(p=>Math.abs(p.x-x)<Math.max(p.width/2,20)&&Math.abs(p.y-y)<35).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];if(point&&point.id!=='you'&&point.id!=='partner')selectTarget(point.id);dom.viewport.focus({preventScroll:true})});
  $$('[data-move]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(b.dataset.move);b.setPointerCapture(e.pointerId)});b.addEventListener('pointerup',()=>keys.delete(b.dataset.move));b.addEventListener('pointercancel',()=>keys.delete(b.dataset.move))});
  new ResizeObserver(resize).observe(dom.viewport);
 }
 function setDifficulty(value){guided=value;$('#guided-button').classList.toggle('selected',value);$('#raid-button').classList.toggle('selected',!value);$('#guided-button').setAttribute('aria-pressed',value);$('#raid-button').setAttribute('aria-pressed',!value);if(state.status==='ready')reset();else updateUI()}
 function resize(){const rect=dom.viewport.getBoundingClientRect();viewWidth=rect.width;viewHeight=rect.height;displayScale=Math.min(window.devicePixelRatio||1,2);dom.overlay.width=viewWidth*displayScale;dom.overlay.height=viewHeight*displayScale;overlayCtx.setTransform(displayScale,0,0,displayScale,0,0);roomView?.resize(viewWidth,viewHeight);if(fallbackCtx){dom.room.width=viewWidth*displayScale;dom.room.height=viewHeight*displayScale;fallbackCtx.setTransform(displayScale,0,0,displayScale,0,0)}}
 function ground(z){return z<=18?0:z>=31?2.1:(z-18)/13*2.1}
 function initRoom(){
  if(!THREE){fallbackCtx=dom.room.getContext('2d');return}
  try{
   const T=THREE,scene=new T.Scene();scene.background=new T.Color('#222c30');scene.fog=new T.Fog('#222c30',90,175);
   const renderer=new T.WebGLRenderer({canvas:dom.room,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
   const camera=new T.OrthographicCamera(-40,40,30,-30,.1,200);const target=new T.Vector3(0,0,3);
   scene.add(new T.HemisphereLight('#b9c6dd','#3c3635',2));const sun=new T.DirectionalLight('#e4e0c2',2.8);sun.position.set(-24,48,24);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:110});sun.shadow.bias=-.0008;sun.shadow.normalBias=.08;scene.add(sun);
   const greenLight=new T.PointLight('#bedb8a',80,35,1.5);greenLight.position.set(0,2,-6);scene.add(greenLight);
   let seed=8847;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646};
   const stoneCanvas=document.createElement('canvas');stoneCanvas.width=stoneCanvas.height=512;const c=stoneCanvas.getContext('2d');c.fillStyle='#27282d';c.fillRect(0,0,512,512);
   const vertices=[];for(let j=0;j<=8;j++){vertices[j]=[];for(let i=0;i<=8;i++)vertices[j][i]={x:i*64+(i===0||i===8?0:(rand()-.5)*23),y:j*64+(j===0||j===8?0:(rand()-.5)*23)}}
   for(let j=0;j<8;j++)for(let i=0;i<8;i++){const p=[vertices[j][i],vertices[j][i+1],vertices[j+1][i+1],vertices[j+1][i]],brightness=Math.floor(61+rand()*20);c.beginPath();p.forEach((v,k)=>k?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.closePath();c.fillStyle='rgb('+brightness+','+(brightness+1)+','+(brightness+9)+')';c.fill();c.strokeStyle='#292c32';c.lineWidth=4;c.stroke();c.strokeStyle='#74707835';c.lineWidth=1;c.stroke();for(let n=0;n<15;n++){c.fillStyle=rand()>.5?'#ffffff07':'#00000009';c.fillRect(i*64+rand()*60,j*64+rand()*60,1+rand()*7,1)}}
   const texture=new T.CanvasTexture(stoneCanvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(6,6);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
   const floorMat=new T.MeshStandardMaterial({map:texture,color:'#ada6b4',roughness:1}),wallMat=new T.MeshStandardMaterial({color:'#555366',roughness:.95}),edgeMat=new T.MeshStandardMaterial({color:'#666674',roughness:1}),darkMat=new T.MeshStandardMaterial({color:'#323b43',roughness:1}),metalMat=new T.MeshStandardMaterial({color:'#707b79',roughness:.6,metalness:.6});
   const mesh=(geo,mat,x=0,y=0,z=0,parent=scene)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m};
   const box=(w,h,d,mat,x,y,z,parent=scene)=>mesh(new T.BoxGeometry(w,h,d),mat,x,y,z,parent);
   box(65,1,76,darkMat,0,-1.1,1);const floor=mesh(new T.CircleGeometry(24.5,80),floorMat,0,.02,-6);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
   const rim=mesh(new T.RingGeometry(23.5,25,80),edgeMat,0,.04,-6);rim.rotation.x=-Math.PI/2;
   const sigil=document.createElement('canvas');sigil.width=sigil.height=512;const s=sigil.getContext('2d');s.fillStyle='#484a36';s.beginPath();s.arc(256,256,251,0,Math.PI*2);s.fill();const glow=s.createRadialGradient(256,256,5,256,256,240);glow.addColorStop(0,'#c2b365');glow.addColorStop(.28,'#918654');glow.addColorStop(1,'#474837');s.fillStyle=glow;s.fill();s.strokeStyle='#b5aa6c';for(const r of [130,166,184,239]){s.lineWidth=r===184?9:3;s.beginPath();s.arc(256,256,r,0,Math.PI*2);s.stroke()}for(let n=0;n<16;n++){s.save();s.translate(256,256);s.rotate(n/16*Math.PI*2);s.fillStyle='#aaa169';s.font='bold 27px Georgia';s.fillText(['ᛉ','ᛟ','ᚷ','ᛞ'][n%4],-10,-204);s.restore()}s.beginPath();for(let n=0;n<16;n++){const r=n%2?55:112,angle=n/16*Math.PI*2;n?s.lineTo(256+Math.cos(angle)*r,256+Math.sin(angle)*r):s.moveTo(256+Math.cos(angle)*r,256+Math.sin(angle)*r)}s.closePath();s.strokeStyle='#d4c17b';s.lineWidth=3;s.stroke();
   const sigTex=new T.CanvasTexture(sigil);sigTex.colorSpace=T.SRGBColorSpace;const center=mesh(new T.CircleGeometry(6,64),new T.MeshStandardMaterial({map:sigTex,roughness:1,emissive:'#766133',emissiveIntensity:.3}),0,.045,-6);center.rotation.x=-Math.PI/2;
   const circleBand=mesh(new T.RingGeometry(6,6.8,64),edgeMat,0,.04,-6);circleBand.rotation.x=-Math.PI/2;
   // Cutaway outer wall, buttresses, arches and green braziers.
   for(let n=0;n<32;n++){const a=n/32*Math.PI*2,x=Math.sin(a)*25.6,z=-6+Math.cos(a)*25.6;if(z>15)continue;const wall=box(5.5,6.8,1.8,wallMat,x,3.25,z);wall.rotation.y=a;const foot=box(5.55,.55,2.2,edgeMat,x,.3,z);foot.rotation.y=a;const cap=box(5.55,.5,2.2,edgeMat,x,6.7,z);cap.rotation.y=a;
    for(let row=1;row<5;row++){const joint=box(5.5,.045,1.83,darkMat,x,row*1.3,z);joint.rotation.y=a}
    if(n%3===0){const column=mesh(new T.CylinderGeometry(.8,1,8,6),edgeMat,x,4,z);box(2.2,.7,2.2,darkMat,x,.35,z);box(2,.55,2,edgeMat,x,7.7,z);const alcove=box(2.4,3.8,.3,darkMat,x-Math.sin(a)*1,z?3.7:3.7,z-Math.cos(a)*1);alcove.rotation.y=a;const frame=mesh(new T.TorusGeometry(1.25,.12,6,12,Math.PI),metalMat,x-Math.sin(a)*1.25,5.35,z-Math.cos(a)*1.25);frame.rotation.y=a;column.receiveShadow=true}
   }
   for(const [x,z] of [[-18,7],[18,7],[-20,-15],[20,-15],[-8,-29],[8,-29]]){box(1.6,1.4,1.6,darkMat,x,.7,z);mesh(new T.CylinderGeometry(1.15,.6,.7,8),metalMat,x,1.65,z);const flame=mesh(new T.ConeGeometry(.55,1.6,6),new T.MeshStandardMaterial({color:'#c4eaa2',emissive:'#7cc894',emissiveIntensity:2.2,transparent:true,opacity:.85}),x,2.65,z);const light=new T.PointLight('#98d5a1',35,14,2);light.position.set(x,3,z);scene.add(light);flame.userData.flame=true}
   for(let n=0;n<13;n++){const z=18+n;box(12.8,.28,1.08,floorMat,0,.16*n,z)}
   box(57,.9,7,edgeMat,0,1.62,34);box(57,.1,7,floorMat,0,2.11,34);
   for(const x of [-7.1,7.1]){box(1.3,2.5,12.2,wallMat,x,1.7,24);box(1.7,.3,12.6,edgeMat,x,3,24);for(const z of [18,24,30]){box(2.1,3.4,2.1,edgeMat,x,1.6,z);box(2.3,.25,2.3,darkMat,x,3.32,z)}}
   // Weapon racks on the flanks of the training ring.
   for(const x of [-22,22]){box(.3,2.3,5,metalMat,x,1.3,-4);for(let n=0;n<5;n++){const sword=box(.11,2.4,.2,edgeMat,x,1.9,-6+n);sword.rotation.z=x>0?-.3:.3;box(.7,.08,.15,metalMat,x,2.5,-6+n)}}
   const models={};
   function character(id,kind){const group=new T.Group();scene.add(group);const boss=kind==='boss',priest=kind==='priest',bodyMat=new T.MeshStandardMaterial({color:boss?'#603d39':priest?'#5a7390':'#596b72',roughness:.7,metalness:priest?.05:.55}),trim=new T.MeshStandardMaterial({color:boss?'#b99a62':priest?'#b9c5b8':'#abb6ad',roughness:.7,metalness:.6}),skin=new T.MeshStandardMaterial({color:boss?'#bba893':priest?'#d0c4ba':'#a1b0a9',roughness:.95}),cloth=new T.MeshStandardMaterial({color:priest?'#5e6082':boss?'#642f30':'#31434b',roughness:1});
    mesh(new T.CylinderGeometry(.65,.8,1.4,8),bodyMat,0,1.8,0,group);if(priest){mesh(new T.ConeGeometry(1.05,2.5,8),cloth,0,1.24,0,group);mesh(new T.ConeGeometry(.85,.9,8),cloth,0,3,0,group)}else{for(const x of [-.4,.4]){box(.45,1.05,.55,bodyMat,x,.67,0,group);box(.48,.34,.85,darkMat,x,.2,.15,group)}}
    mesh(new T.SphereGeometry(.47,10,8),skin,0,2.98,0,group);if(!priest){const helm=mesh(new T.SphereGeometry(.53,8,6,0,Math.PI*2,0,Math.PI*.67),bodyMat,0,3.1,0,group);box(.2,.65,.12,trim,0,3.15,.47,group);if(boss)for(const x of [-.3,.3]){const horn=mesh(new T.ConeGeometry(.14,.9,5),trim,x,3.7,0,group);horn.rotation.z=x<0?.4:-.4}}
    for(const x of [-.9,.9]){mesh(new T.DodecahedronGeometry(boss?.67:.5,0),trim,x,2.52,0,group);box(.35,1.1,.4,bodyMat,x,1.96,.04,group);mesh(new T.SphereGeometry(.22,6,6),skin,x,1.35,.09,group)}
    const cape=box(1.12,1.9,.1,cloth,0,1.7,-.63,group);cape.rotation.x=-.17;
    if(priest){mesh(new T.CylinderGeometry(.06,.06,3.4,5),trim,1.02,1.75,.2,group);mesh(new T.OctahedronGeometry(.28),new T.MeshStandardMaterial({color:'#c8ddea',emissive:'#739db9',emissiveIntensity:1}),1.02,3.45,.2,group)}else{box(.18,2.4,.1,trim,1.05,1.55,.3,group);box(.8,.12,.22,trim,1.05,2.6,.3,group);const shield=mesh(new T.CylinderGeometry(.65,.65,.17,6),bodyMat,-1,1.7,.45,group);shield.rotation.x=Math.PI/2;mesh(new T.OctahedronGeometry(.25),trim,-1,1.7,.6,group)}
    if(boss)group.scale.setScalar(1.32);const shadow=mesh(new T.CircleGeometry(boss?1.5:1.1,24),new T.MeshBasicMaterial({color:'#050a0b',transparent:true,opacity:.3,depthWrite:false}),0,.055,0,group);shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;
    const ring=mesh(new T.RingGeometry(1.3,1.46,40),new T.MeshBasicMaterial({color:'#c2d796',transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}),0,.07,0,group);ring.rotation.x=-Math.PI/2;ring.castShadow=false;
    const barrier=mesh(new T.SphereGeometry(1.75,18,12),new T.MeshBasicMaterial({color:'#8aaad9',transparent:true,opacity:.14,wireframe:true,depthWrite:false}),0,1.8,0,group);barrier.visible=false;
    models[id]={group,ring,barrier};return group;
   }
   character('you','priest');for(const id of ['A','B','C','D'])character(id,'add');character('boss','boss');const partnerModel=character('partner','priest');partnerModel.scale.setScalar(.87);
   const tetherGeo=new T.BufferGeometry().setFromPoints([new T.Vector3(0,0,0),new T.Vector3(0,0,0)]);const tether=new T.Line(tetherGeo,new T.LineDashedMaterial({color:'#b7a4d8',dashSize:.5,gapSize:.3,transparent:true,opacity:.7}));scene.add(tether);
   const rings={};for(const id of ['A','B','C','D','boss']){const ring=mesh(new T.RingGeometry(.98,1,80),new T.MeshBasicMaterial({color:id==='boss'?'#c27b58':'#e0b786',transparent:true,opacity:.16,side:T.DoubleSide,depthWrite:false}),0,.09,0);ring.rotation.x=-Math.PI/2;ring.castShadow=false;rings[id]=ring}
   const patrol=mesh(new T.RingGeometry(10.95,11.04,90),new T.MeshBasicMaterial({color:'#afb8a1',transparent:true,opacity:.22,side:T.DoubleSide,depthWrite:false}),0,.06,-6);patrol.rotation.x=-Math.PI/2;patrol.castShadow=false;
   const castRange=mesh(new T.RingGeometry(19.9,20,90),new T.MeshBasicMaterial({color:'#a6c5cb',transparent:true,opacity:.14,side:T.DoubleSide,depthWrite:false}),0,.08,0);castRange.rotation.x=-Math.PI/2;castRange.castShadow=false;
   let width,height;function setCamera(top){camera.position.set(top?0:36,top?85:54,top?3:64);camera.lookAt(target)}
   roomView={resize(w,h){width=w;height=h;renderer.setSize(w,h,false);const vertical=35;camera.left=-vertical*w/h;camera.right=vertical*w/h;camera.top=vertical;camera.bottom=-vertical;camera.updateProjectionMatrix()},setCamera,project(e,y=4){const v=new T.Vector3(e.x,ground(e.z)+y,e.z).project(camera);return{x:(v.x*.5+.5)*width,y:(-v.y*.5+.5)*height}},render(){
    for(const e of [state.priest,...state.adds,state.boss]){const m=models[e.id];m.group.position.set(e.x,ground(e.z),e.z);m.group.rotation.y=e.angle||0;m.group.position.y+=e.moving?Math.sin(visualTime*13)*.06:0;m.ring.visible=e.id===state.target||e.id==='you'||e.id===state.pet;m.ring.material.color.set(e.id==='you'?'#acd6df':e.id===state.pet?'#afdda4':'#d7c593');m.barrier.visible=e.wall>0;m.barrier.rotation.y=visualTime*.3;if(e.id!=='you'&&e.id!=='boss'){const r=rings[e.id],rad=e.soothe>0?10:20;r.position.set(e.x,.1,e.z);r.scale.setScalar(rad);r.visible=guided&&!state.combat;r.material.color.set(e.soothe>0?'#a9cc85':'#cfaa77')}}
    partnerModel.visible=mode==='handoff';partnerModel.position.set(-9,ground(28),28);partnerModel.rotation.y=Math.PI;
    rings.boss.position.set(state.boss.x,.11,state.boss.z);rings.boss.scale.setScalar(22);rings.boss.visible=guided&&!state.combat;patrol.visible=guided&&!state.combat;castRange.visible=guided&&!state.pet;castRange.position.set(state.priest.x,ground(state.priest.z)+.12,state.priest.z);
    tether.visible=!!state.pet||!!state.cast;let endpoint=pet()||state.adds.find(a=>a.id===state.cast?.target);if(endpoint){const pos=tether.geometry.attributes.position;pos.setXYZ(0,state.priest.x,ground(state.priest.z)+2.4,state.priest.z);pos.setXYZ(1,endpoint.x,ground(endpoint.z)+2.2,endpoint.z);pos.needsUpdate=true;tether.computeLineDistances()}
    scene.traverse(o=>{if(o.userData.flame){o.scale.y=1+Math.sin(visualTime*5+o.position.x)*.15}});renderer.render(scene,camera)
   }};setCamera(false);
  }catch(e){console.warn('3D unavailable; using tactical canvas.',e.message);dom.room.replaceWith(dom.room.cloneNode());dom.room=$('#room');fallbackCtx=dom.room.getContext('2d');$('#camera-button').hidden=true}
 }
 function fallbackProject(e,y=0){const scale=Math.min(viewWidth/66,viewHeight/71);return{x:viewWidth/2+e.x*scale,y:viewHeight/2+(e.z+1)*scale-y*.8}}
 function drawFallback(){const c=fallbackCtx;c.clearRect(0,0,viewWidth,viewHeight);c.fillStyle='#252c32';c.fillRect(0,0,viewWidth,viewHeight);const sc=Math.min(viewWidth/66,viewHeight/71),center=fallbackProject({x:0,z:-6});c.beginPath();c.arc(center.x,center.y,24.5*sc,0,Math.PI*2);c.fillStyle='#484751';c.fill();c.lineWidth=8;c.strokeStyle='#5d5e6e';c.stroke();c.strokeStyle='#807c6355';for(const r of [6,6.8,11]){c.beginPath();c.arc(center.x,center.y,r*sc,0,Math.PI*2);c.stroke()}for(const x of [-7.1,7.1]){const p=fallbackProject({x,z:18}),q=fallbackProject({x,z:31});c.strokeStyle='#787789';c.lineWidth=sc;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke()}for(const e of [state.priest,...state.adds,state.boss]){const p=fallbackProject(e);if(guided&&!state.combat&&e.id!=='you'){c.beginPath();c.arc(p.x,p.y,(e.id==='boss'?22:e.soothe>0?10:20)*sc,0,Math.PI*2);c.lineWidth=1;c.strokeStyle=e.soothe>0?'#b5ce7950':'#cd967540';c.stroke()}c.beginPath();c.arc(p.x,p.y,(e.id==='boss'?1.7:1.1)*sc,0,Math.PI*2);c.fillStyle=e.id==='you'?'#add4de':e.id==='boss'?'#c97964':'#abb5a0';c.fill();if(e.id===state.target){c.strokeStyle='#decb9a';c.lineWidth=2;c.stroke()}}}
 function drawOverlay(){
  const c=overlayCtx;c.clearRect(0,0,viewWidth,viewHeight);renderPoints=[];
  const projection=(e,y)=>roomView?roomView.project(e,y):fallbackProject(e,y);
  // Ground labels establish the ramp direction and raid staging area.
  if(guided){for(const [label,e] of [['ENTRY RAMP',{x:0,z:27}],['TRAINING FLOOR',{x:0,z:-24}]]){const p=projection(e,.1);c.font='7px Arial';c.textAlign='center';c.fillStyle='#cbd6c079';c.fillText(label,p.x,p.y)}}
  const entities=[...state.adds,state.boss,state.priest];
  for(const e of entities){const selected=e.id===state.target,controlled=e.id===state.pet,label=e.id==='you'?'YOU':e.id==='boss'?'Instructor Razuvious':'Understudy '+e.id;const pt=projection(e,e.id==='boss'?6:4.4),font=e.id==='boss'?9:8;c.font=(selected?'600 ':'')+font+'px Arial';const width=c.measureText(label).width+14;renderPoints.push({id:e.id,x:pt.x,y:pt.y,width});
   c.textAlign='center';c.fillStyle=selected?'#171e19dc':'#152020a6';roundedRect(c,pt.x-width/2,pt.y-9,width,15,3);c.fill();if(selected){c.strokeStyle='#c3cba072';c.lineWidth=.7;c.stroke()}c.fillStyle=e.id==='boss'?'#ebbaa0':e.id==='you'?'#c5e5e6':controlled?'#d2eab2':'#d2d8c9';c.fillText(label,pt.x,pt.y+1);
   if(e.id!=='you'&&e.id!=='boss'){const barWidth=width*.7;c.fillStyle='#16201bbd';c.fillRect(pt.x-barWidth/2,pt.y+8,barWidth,2);c.fillStyle=controlled?'#a4cd7d':'#98a484';c.fillRect(pt.x-barWidth/2,pt.y+8,barWidth*e.health/100,2);if(e.soothe>0){c.font='7px Arial';c.fillStyle='#cee3aa';c.fillText('Soothed '+Math.ceil(e.soothe)+'s',pt.x,pt.y-15)}else if(e.immune>0){c.font='7px Arial';c.fillStyle='#c6acdd';c.fillText('Exhausted '+Math.ceil(e.immune)+'s',pt.x,pt.y-15)}else if(e.wall>0){c.font='7px Arial';c.fillStyle='#b6cfea';c.fillText('Wall '+Math.ceil(e.wall)+'s',pt.x,pt.y-15)}}
  }
  if(state.pet&&distance(state.priest,pet())>20&&guided){const p=projection(state.priest,5.5);c.font='8px Arial';c.fillStyle='#e0bf8e';c.fillText('Keep your understudy close',p.x,p.y-10)}
 }
 function roundedRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y)}
 function frame(now){const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;visualTime+=dt;update(dt);if(roomView)roomView.render();else if(fallbackCtx)drawFallback();drawOverlay();if(now-lastUI>70){updateUI();lastUI=now}requestAnimationFrame(frame)}
 saveStats();reset();initRoom();initEvents();resize();requestAnimationFrame(frame);
})();
