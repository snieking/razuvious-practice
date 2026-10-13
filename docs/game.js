import * as THREE from './vendor/three.module.min.js';
import {BossVoice,SpellSounds} from './audio.js?v=2';
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
 const settings={latency:1000,handoff:10,resists:false,movement:'classic',...readSaved('razuvious.settings.v1',{})};
 settings.latency=[800,1000,1200].includes(Number(settings.latency))?Number(settings.latency):1000;
 const defaultBindings={soothe:'1',macro:'5'},savedBindings=readSaved('razuvious.bindings.v1',{});
 let bindings=Object.fromEntries(Object.entries(defaultBindings).map(([name,key])=>[name,savedBindings[name]||key]));
 const MC_MACRO="#showtooltip\n/cast [nopet,harm] Mind Control\n/targetexact [pet] Instructor Razuvious\n/targetexact [pet] Grand Widow Faerlina\n/petattack\n/cast Shield Wall\n/cast Taunt\n/cast Widow's Embrace";
 const rampHalfWidth=7.1,rampSides=[-rampHalfWidth,rampHalfWidth];
 // Cover and movement use the same wall footprints as the rendered room.
 const rampWalls=rampSides.flatMap(x=>[{x,z:24,w:1.3,d:12.2,h:2.5,y:1.7,angle:0,kind:'rail'},...[18,24,30].map(z=>({x,z,w:2.1,d:2.1,h:3.4,y:1.6,angle:0,kind:'pillar'}))]);
 // Leave the central entry open; the pit wall continues into both ramp corners.
 const outerWalls=Array.from({length:32},(_,n)=>{const angle=n/32*Math.PI*2;return{x:Math.sin(angle)*25.6,z:-6+Math.cos(angle)*25.6,w:5.5,d:1.8,h:6.8,y:3.25,angle,n}}).filter(w=>w.z<=15||Math.abs(w.x)>rampHalfWidth);
 const roomWalls=[...rampWalls,...outerWalls];
 const auraAssets={soothe:'assets/soothe.png',taunt:'assets/taunt-debuff.jpg',exhaustion:'assets/exhaustion.jpg',wall:'assets/wall.jpg'};
 const auraImages={};
 const configs={
  pull:{title:'Own the pull.',description:'Soothe your add, take control, then bring Razuvious behind the ramp corner before he can shout at the raid.',opening:'Patience is a priest skill.',intro:'Soothe A from the left edge of the open ramp. Read the clockwise patrol before approaching.',steps:[['Soothe your add','Select A on the left, then use Mind Soothe.'],['Find your window','Get within 20 yd while the boss is away.'],['Let control register','After the 3s cast, stand still for about 1s.'],['Use the same macro','It targets Razuvious and uses Wall, then Taunt.'],['Hide the boss','Keep Razuvious out of sight of the raid up the ramp.']]},
  handoff:{title:'Take the next turn.',description:'Choose an available understudy and take over before your partner loses protection. Keep the boss hidden from the raid up the ramp.',opening:'Your partner is counting on you.',intro:'A is your partner\'s tank. Two other adds have Mind Exhaustion. Check their debuffs and choose the available one.',steps:[['Choose an available add','Avoid your partner\'s add and any with Mind Exhaustion.'],['Establish control','After the 3s cast, stand still for about 1s.'],['Prepare the handoff','The macro targets Razuvious. Close to 5 yd.'],['Take over safely','Use the same macro for Wall and Taunt.'],['Keep the raid covered','Hold the boss behind the ramp corner.']]}
 };
 let mode='pull', guided=true, bossVoice, spellSounds, tactical=false;
 let state, keys=new Set(), lastFrame=performance.now(), visualTime=0, lastUI=0;
 let overlayCtx=dom.overlay.getContext('2d'), roomView, fallbackCtx, renderPoints=[];
 let viewWidth=0,viewHeight=0,displayScale=1,dialogsPaused=false,cameraOrbit=0,cameraDistance=14,cameraPitch=Math.atan(.48),minimapZoom=1,pointerDrag=null,mouseButtons=0,pointerLocked=false,intendedUnlock=false,hoveredNpc=null,frameDelta=1/60;
 const icon=(name)=>'<svg><use href="#i-'+name+'"/></svg>';
 function newAdd(id,x,z){return{id,x,z,start:{x,z},health:100,soothe:0,wall:0,wallCD:0,tauntCD:0,immune:0,controlled:false,attacking:false,angle:Math.PI,moving:false}}
 function reset(startNow=false){
  bossVoice?.stop();spellSounds?.stop();
  keys.clear();clearMouseInput();cameraOrbit=0;cameraPitch=Math.atan(.48);const handoff=mode==='handoff';
  state={status:'ready',t:0,priest:{id:'you',x:-4.5,z:handoff?27:31,angle:Math.PI,health:100,mana:100},raid:[{id:'raid1',x:-13,z:33,angle:Math.PI,health:100},{id:'raid2',x:-15,z:33,angle:Math.PI,health:100},{id:'partner',x:-11.5,z:34,angle:Math.PI,health:100}],adds:[newAdd('A',-5,8),newAdd('B',10,5),newAdd('C',-10,-17),newAdd('D',10,-17)],boss:{id:'boss',x:8,z:-16,angle:0,health:100},target:'A',pet:null,cast:null,registration:0,channel:0,gcd:0,combat:false,aggro:null,taunt:0,partner:0,partnerChannel:0,steps:[false,false,false,false,false],penalties:0,notes:[],logs:[],toast:null,hold:0,coverState:null,wallAtTaunt:0,handoffMargin:null,mark:false,latency:settings.latency/1000,resists:!!settings.resists,warning:false,shout:handoff?8:25,shoutCast:0,history:[],patrolOffset:Math.random()*(guided?6:40),challenge:!guided,success:false};
  if(handoff){
   const a=state.adds[0],candidates=state.adds.slice(1),available=Math.floor(Math.random()*candidates.length);
   a.x=-13.2;a.z=14;a.wall=Number(settings.handoff);a.controlled=true;
   candidates.forEach((add,i)=>{add.x=[-2,1.5,3][i];add.z=[10,12,15][i];add.immune=i===available?0:20+Math.floor(Math.random()*31)});
   state.target=candidates.find(add=>add.immune>0).id;state.boss.x=-10;state.boss.z=15;state.boss.angle=-Math.PI/2;state.combat=true;state.aggro='A';state.taunt=Number(settings.handoff);state.partner=Number(settings.handoff);state.partnerChannel=Number(settings.handoff)+2.4;
  }
  dom.result.hidden=true;dom.result.classList.remove('failed');dom.opening.hidden=false;dom.viewport.classList.add('ready');$('#pause-button').innerHTML=icon('clock')+' Pause';$('.paused-badge')?.remove();
  const config=configs[mode];$('#drill-title').textContent=config.title;$('#drill-description').textContent=config.description;$('#drill-number').textContent=(handoff?'02':'01')+' / 02';
  renderOpening();
  $('#checklist').innerHTML=config.steps.map(([title,detail])=>'<li><div><strong>'+title+'</strong><small>'+detail+'</small></div></li>').join('');
  $('#priest-note').textContent=handoff?'Mind Exhaustion prevents MC for 60s after an add is released. Choose an available add, then allow 3s to cast plus about 1s to register.':'The camera swaps as soon as MC lands. Stand still for about 1s after the swap. Moving too soon breaks control.';
  dom.log.innerHTML='';addLog(handoff?'Your partner holds A. Check Mind Exhaustion before choosing the next add.':'The room is quiet. Keep it that way.');updateUI();
  if(startNow)start();
 }
 function renderOpening(){
  const handoff=mode==='handoff',config=configs[mode];
  dom.opening.innerHTML='<div class="eyebrow">'+(handoff?'THE HANDOFF · DRILL 02':'THE PULL · DRILL 01')+'</div><h2>Use this Mind Control macro.</h2><p class="opening-intro">'+config.intro+'</p><div class="macro-briefing"><section><strong>Copy into WoW</strong><pre class="macro-code opening-macro" id="opening-macro"></pre><button class="copy-macro" id="opening-copy">Copy macro</button></section><section class="macro-usage"><strong>This is the button to press <kbd>'+bindings.macro+'</kbd></strong><ol><li>'+(handoff?'Check the adds\' debuffs. Target one without Mind Exhaustion that your partner is not controlling.':'Target understudy A. Use Mind Soothe before approaching.')+' Press <kbd>'+bindings.macro+'</kbd> once to cast Mind Control.</li><li>The camera switches when the <strong>3-second cast</strong> lands. Stay still for <strong>about 1 more second</strong> before moving the add or pressing the macro again.</li><li>Press <kbd>'+bindings.macro+'</kbd> again. The macro targets Razuvious, sends the add in and uses Shield Wall, then Taunt. Repeat when the boss is within 5 yd.</li></ol><p>Bind this macro to the same key in WoW. The Faerlina lines do nothing in this encounter.</p></section></div><button class="primary" id="begin-button">'+icon('play')+' Begin practice <kbd>ENTER</kbd></button>';
  $('#opening-macro').textContent=MC_MACRO;$('#opening-copy').onclick=()=>copyMacro($('#opening-copy'));$('#begin-button').addEventListener('click',start);
 }
 async function copyMacro(button){try{await navigator.clipboard.writeText(MC_MACRO);button.textContent='Copied'}catch{button.textContent='Select and copy the macro above'}}
 function start(){if(state.status!=='ready')return;state.status='running';dom.opening.hidden=true;dom.viewport.classList.remove('ready');stats.runs++;saveStats();addLog(mode==='pull'?'Soothe A from the left side. Watch the clockwise patrol before stepping down.':'Partner: "My wall is fading. Keep him behind the corner."');toast(mode==='pull'?'A is selected. Use '+bindings.soothe+' to Soothe, then '+bindings.macro+' for the MC macro.':'Check Mind Exhaustion. Choose an available add, then use '+bindings.macro+' for MC.',false,5);dom.viewport.focus({preventScroll:true});if(mode==='handoff')bossYell('mercy')}
 function saveStats(){persist('razuvious.stats.v1',stats);$('#runs').textContent=pad(stats.runs);$('#clean').textContent=pad(stats.clean);$('#best').textContent=stats.best||'--'}
 function addLog(message,type=''){const entry={t:state.t,message,type};state.logs.push(entry);const div=document.createElement('div');div.className='log-entry '+type;const time=document.createElement('time');time.textContent=clock(state.t);const span=document.createElement('span');span.textContent=message;div.append(time,span);dom.log.append(div);if(dom.log.childElementCount>40)dom.log.firstChild.remove();dom.log.scrollTop=dom.log.scrollHeight;}
 function toast(message,error=false,duration=3){state.toast={message,error,until:state.t+duration};updateUI()}
 function penalty(message,n=8){state.penalties+=n;if(!state.notes.includes(message))state.notes.push(message)}
 function bossYell(id,options){bossVoice?.say(id,options)}
 function spellSound(id,options){spellSounds?.play(id,options)}
 function updateSoundButton(){const enabled=!!bossVoice?.enabled,button=$('#sound-button');button.style.color=enabled?'#e4c879':'';button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'Mute game audio':'Enable original game audio');button.title=enabled?'Original boss voices and spell sounds on. Click to mute.':'Original boss voices and spell sounds muted. Click to enable.';button.innerHTML=icon(enabled?'volume':'volume-off')+'<span>Sound '+(enabled?'on':'off')+'</span>'}
 function soundUnavailable(){bossVoice?.setEnabled(false);spellSounds?.setEnabled(false);updateSoundButton();toast('Audio could not play. Click Sound off to try again.',true,5)}
 const getTarget=()=>state.target==='boss'?state.boss:state.adds.find(a=>a.id===state.target);
 const pet=()=>state.adds.find(a=>a.id===state.pet);
 const controlledActor=()=>pet()||state.priest;
 const rightMouseHeld=()=>!!(mouseButtons&2);
 function movementInput(){const strafeKeys=settings.movement==='strafe'||rightMouseHeld();return{forward:(keys.has('w')||(mouseButtons&3)===3?1:0)-(keys.has('s')?1:0),strafe:(keys.has('e')||strafeKeys&&keys.has('d')?1:0)-(keys.has('q')||strafeKeys&&keys.has('a')?1:0),turn:strafeKeys?0:(keys.has('a')?1:0)-(keys.has('d')?1:0)}}
 function selectTarget(id){state.target=id;updateUI()}
 function cycleTarget(){if(state.pet&&state.target===state.pet){selectTarget('boss');return}const order=state.pet?['boss',...state.adds.map(a=>a.id)]:mode==='handoff'?['B','C','D','A','boss']:['A','B','boss','C','D'];selectTarget(order[(order.indexOf(state.target)+1)%order.length])}
 function wallPoint(point,wall){const dx=point.x-wall.x,dz=point.z-wall.z,c=Math.cos(wall.angle),s=Math.sin(wall.angle);return{x:dx*c-dz*s,z:dx*s+dz*c}}
 function wallBlocks(a,b,wall){
  const from=wallPoint(a,wall),to=wallPoint(b,wall);let enter=0,exit=1;
  for(const [axis,half] of [['x',wall.w/2],['z',wall.d/2]]){
   const delta=to[axis]-from[axis];
   if(Math.abs(delta)<1e-8){if(Math.abs(from[axis])>half)return false;continue}
   const t1=(-half-from[axis])/delta,t2=(half-from[axis])/delta;
   enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));if(enter>exit)return false;
  }
  return exit>1e-5&&enter<1-1e-5;
 }
 function los(a,b){return !roomWalls.some(wall=>wallBlocks(a,b,wall))}
 function manaUsers(){return [state.priest,...state.raid]}
 function raidCovered(){return manaUsers().every(u=>!los(u,state.boss))}
 function shoutTargets(){return manaUsers().filter(u=>u.health>0&&los(u,state.boss)&&distance(u,state.boss)<=45)}
 function usablePoint(x,z){if(x<-28||x>28||z<-29||z>35)return false;return !roomWalls.some(wall=>{const p=wallPoint({x,z},wall);return Math.abs(p.x)<wall.w/2+.35&&Math.abs(p.z)<wall.d/2+.35})}
 function stepEntity(e,dx,dz,speed,dt){const l=Math.hypot(dx,dz);if(!l){e.moving=false;return}dx/=l;dz/=l;const x=e.x+dx*speed*dt,z=e.z+dz*speed*dt;if(usablePoint(x,e.z))e.x=x;if(usablePoint(e.x,z))e.z=z;e.angle=Math.atan2(dx,dz);e.moving=true}
 function action(name){
  if(state.status!=='running'){if(state.status==='ready')toast('Begin practice to use abilities.');return}
  state.history.push({t:state.t,action:name,target:state.target});
  if(name==='release'){if(state.pet||state.cast||state.registration>0)breakControl('You pressed Escape and cancelled Mind Control.');return}
  if(name==='macro'){
   if(!state.pet){action('mc');return}
   if(state.registration>0){toast('Stand still. Control is settling for '+state.registration.toFixed(1)+'s.',true,2);return}
   // Faerlina is absent, so her /targetexact line leaves Razuvious selected.
   selectTarget('boss');
   action('attack');action('wall');action('taunt');return;
  }
  if(['soothe','mc','heal'].includes(name)&&state.pet){breakControl('You cast a priest spell during Mind Control. Use the MC macro while channeling.');return}
  if(state.registration>0){toast('Control is still settling. Stand still for about 1s after the cast.',true,2);return}
  if(state.cast){if(['mc','soothe'].includes(name))toast('Mind Control is still casting. Keep still.');else toast('No pet abilities until control registers.',true);return}
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
   target.soothe=15;addLog('Mind Soothe on '+target.id+'. Detection range reduced for 15s.','success');spellSound('release');spellSound('soothe');
   if(mode==='pull'){state.steps[0]=true;toast('Add soothed. Get within 20 yd and wait for the patrol to move away.',false,5)}
   return;
  }
  if(name==='mc'){
   if(isTranslating()){toast('Stop moving before you begin Mind Control.',true);return}
   if(state.gcd>0){toast('Wait for the global cooldown.');return}
   if(!target||target.id==='boss'){toast('Razuvious cannot be Mind Controlled. Select an understudy.',true);return}
   if(target.controlled){toast('Your partner already controls that add. Take a free understudy.',true);return}
   if(target.immune>0){toast('Mind Exhaustion: '+target.immune.toFixed(1)+'s before this add can be controlled again.',true);return}
   if(distance(state.priest,target)>20){toast('Out of range. Mind Control needs 20 yd or less.',true);return}
   if(!los(state.priest,target)){toast('No line of sight to the understudy. Move around the ramp wall.',true);return}
   state.steps[mode==='pull'?1:0]=true;state.cast={target:target.id,left:3};state.gcd=1.5;state.priest.mana-=10;keys.clear();state.priest.angle=Math.atan2(target.x-state.priest.x,target.z-state.priest.z);addLog('Casting Mind Control on '+target.id+'.');spellSound('cast',{loop:true});return;
  }
  if(name==='wall'){
   if(p.wallCD>0){toast('Shield Wall cooldown: '+p.wallCD.toFixed(1)+'s.',true);return}
   p.wall=20;p.wallCD=30;state.wallAtTaunt=state.t;addLog(p.id+': Shield Wall up. 75% damage reduction for 20s.','success');toast('Shield Wall is up. Target Razuvious and Taunt within 5 yd.',false,4);spellSound('wall');return;
  }
  if(name==='attack'){
   if(!target||target.id===p.id||target.controlled){toast('Select Razuvious for Pet attack.',true);return}
   if(target.id!=='boss'){toast('Attack Razuvious. Keep the other understudies alive.',true);penalty('You attacked another understudy.',5);return}
   p.attacking=true;toast('Understudy moving to attack. Taunt requires melee range.',false,2);return;
  }
  if(name==='taunt'){
   if(state.target!=='boss'){toast('Use the MC macro to target Instructor Razuvious.',true);return}
   if(p.tauntCD>0){toast('Taunt cooldown: '+p.tauntCD.toFixed(1)+'s.',true);return}
   if(distance(p,state.boss)>5){toast('Too far away. Move your understudy or press the macro to send it in. Taunt needs 5 yd.',true);return}
   if(p.wall<=0){fail('Taunt without Shield Wall.','Protect your understudy before Taunt. The boss can kill an unprotected add in a few hits.');return}
   const margin=mode==='handoff'?state.partner:null;state.handoffMargin=margin;
   if(mode==='handoff'&&margin>5)penalty('You taunted early. Let your partner use more of their wall.',Math.round((margin-5)*3));
   if(mode==='handoff'&&margin<=0)penalty('Your partner lost Shield Wall before your Taunt.',20);
   if(state.t-state.wallAtTaunt>4)penalty('You used Shield Wall too early before your Taunt.',8);
   state.aggro=p.id;state.taunt=20;p.tauntCD=60;p.attacking=true;state.steps[2]=true;state.steps[3]=true;state.hold=0;state.partnerChannel=Math.min(state.partnerChannel,1.2);addLog(p.id+' taunted Razuvious'+(margin!==null?' with '+Math.max(0,margin).toFixed(1)+'s left.':'.'),'success');toast(raidCovered()?'You have the boss. Keep him hidden from the raid. Use the same macro.':'You have the boss. Move your add behind the left ramp corner to hide Razuvious.',false,5);spellSound('taunt');bossYell(['warmed','stand','show'][Math.floor(Math.random()*3)]);return;
  }
 }
 function releaseAdd(add){add.controlled=false;add.immune=60;add.attacking=false}
 function breakControl(reason){const p=pet();if(p)releaseAdd(p);state.pet=null;state.cast=null;state.registration=0;state.channel=0;addLog('Mind Control broken.','error');fail('Mind Control broke.',reason)}
 function fail(title,reason){if(state.status!=='running')return;state.status='failed';keys.clear();clearMouseInput();state.success=false;spellSounds?.stop();addLog(title,'error');const fatal=[state.priest,...state.raid,...state.adds].some(entity=>entity.health<=0);bossYell(fatal?'death':'disappoint',{interrupt:true});state.toast=null;dom.result.hidden=false;dom.result.classList.add('failed');dom.result.innerHTML='<div class="eyebrow">ATTEMPT '+pad(stats.runs)+'</div><h2>'+title+'</h2><p>'+reason+'</p><div class="result-detail">'+(mode==='pull'?'Soothe → position → MC → wait → Wall → Taunt':'MC → wait → boss target → Wall → Taunt')+'</div><button class="primary" id="retry-button">'+icon('reset')+' Try again <kbd>R</kbd></button><button class="secondary-result" id="review-button">Review the field guide</button>';$('#retry-button').onclick=()=>reset(true);$('#review-button').onclick=()=>openDialog('guide');updateUI()}
 function success(){
  if(state.status!=='running')return;
  state.status='success';state.success=true;keys.clear();clearMouseInput();
  const score=clamp(100-state.penalties,0,100);if(score>=90)stats.clean++;stats.best=Math.max(stats.best,score);saveStats();addLog('Clean control. Drill complete.','success');
  dom.result.hidden=false;dom.result.classList.remove('failed');
  const pull=mode==='pull',detail=pull?'Razuvious is behind the wall. Shield Wall and Taunt are active.':'Taunt landed '+Math.max(0,state.handoffMargin).toFixed(1)+'s before the outgoing wall expired.';
  const note=state.notes[0]||(pull?'Next, practice taking over before another priest loses protection.':'Razuvious stayed hidden from mana users for 6 seconds.');
  dom.result.innerHTML='<div class="eyebrow">'+(score>=90?'CLEAN RUN':'DRILL COMPLETE')+'</div><h2>'+(pull?'Pull complete.':'A clean change of hands.')+'</h2><div class="result-score">'+score+'<small> / 100</small></div><p>'+detail+'</p><div class="result-detail">'+note+'</div>'+(pull?'<button class="primary" id="next-button">'+icon('play')+' Continue with the handoff</button><button class="secondary-result" id="retry-button">Practice the pull again <kbd>R</kbd></button>':'<button class="primary" id="retry-button">'+icon('reset')+' Practice again <kbd>R</kbd></button><button class="secondary-result" id="next-button">Practice the pull →</button>');
  $('#retry-button').onclick=()=>reset(true);$('#next-button').onclick=()=>changeMode(pull?'handoff':'pull');updateUI();
 }
 function update(dt){
  if(state.status!=='running')return;state.t+=dt;state.gcd=Math.max(0,state.gcd-dt);
  for(const a of state.adds){a.soothe=Math.max(0,a.soothe-dt);a.wall=Math.max(0,a.wall-dt);a.wallCD=Math.max(0,a.wallCD-dt);a.tauntCD=Math.max(0,a.tauntCD-dt);a.immune=Math.max(0,a.immune-dt);a.moving=false}
  state.taunt=Math.max(0,state.taunt-dt);
  const actor=controlledActor(),{forward,strafe,turn}=movementInput();
  actor.angle+=turn*2.4*dt;
  if(forward||strafe){
   if(state.cast){breakControl('You moved your priest during the 3-second cast. Stand still until the cast and registration pause finish.');return}
   if(state.registration>0){breakControl('You moved during the 1-second registration pause. The camera switches immediately, but you must stand still for about 1s before moving the understudy.');return}
   const heading=actor.angle,dx=Math.sin(heading)*forward-Math.cos(heading)*strafe,dz=Math.cos(heading)*forward+Math.sin(heading)*strafe;
   stepEntity(actor,dx,dz,(actor.id==='you'?5:4.6)*(forward<0?.65:1),dt);actor.angle=heading;if(actor.id!=='you')actor.attacking=false;
  }else actor.moving=false;
  if(!state.combat){
   const pathTime=(state.t+state.patrolOffset)%40,segment=Math.floor(pathTime/10),local=pathTime%10;const phase=Math.PI/4-segment*Math.PI/2-Math.max(0,local-2)/8*Math.PI/2;state.boss.x=Math.cos(phase)*11;state.boss.z=-6-Math.sin(phase)*11;state.boss.angle=Math.atan2(Math.sin(phase),Math.cos(phase));state.boss.moving=local>2;
   for(const a of state.adds){const detect=a.soothe>0?10:20;if(distance(state.priest,a)<detect&&los(state.priest,a)){fail('You pulled an understudy.','You entered '+a.id+'\'s detection range'+(a.soothe>0?' even with Mind Soothe active.':' without Mind Soothe.')+' Soothe before approaching, then stay outside the reduced range.');return}}
   if(distance(state.priest,state.boss)<22&&los(state.priest,state.boss)){fail('The patrol caught you.','Wait farther up the ramp until Razuvious is on the far side. Mind Soothe on an understudy does not protect you from the boss.');return}
  }
  if(state.cast){
   const a=state.adds.find(a=>a.id===state.cast.target);if(!los(state.priest,a)||distance(state.priest,a)>20.2){breakControl('You lost line of sight or moved out of cast range before MC completed.');return}
   state.cast.left-=dt;
   if(state.cast.left<=0){
    if(state.resists&&Math.random()<.1){fail('Mind Control resisted.','Your spell did not land. On a real pull, call the resist immediately so the raid can cover or reset.');return}
    const targetID=state.cast.target;state.cast=null;state.registration=state.latency;state.pet=targetID;a.controlled=true;state.channel=60;spellSounds?.stop('cast');spellSound('release');
    if(!state.combat){state.combat=true;state.aggro='you';addLog('Mind Control landed. Razuvious is coming.');bossYell('taught');}
    state.steps[mode==='pull'?2:1]=false;toast('Cast finished. Stand still for about 1s while control registers.',false,1.5);return;
   }
  }
  if(state.registration>0){state.registration-=dt;if(state.registration<=0){state.registration=0;state.steps[mode==='pull'?2:1]=true;addLog('Control registered. Movement and the macro are ready.','success');toast('Control ready. Press the same macro to target Razuvious and tank.',false,4)}}
  if(state.pet){
   state.channel-=dt;const p=pet();
   if(state.channel<=0){breakControl('The 60-second channel expired. Arrange the next handoff before your MC ends.');return}
   // LOS is checked while landing the cast, not while maintaining possession.
   if(distance(state.priest,p)>100){breakControl('Your understudy moved beyond the simulated 100 yd possession limit. Keep it close to the priest.');return}
   if(p.attacking&&distance(p,state.boss)>3.8)stepEntity(p,state.boss.x-p.x,state.boss.z-p.z,4.5,dt);
   if(p.attacking&&distance(p,state.boss)<=5)state.steps[2]=true;
   if(state.aggro===p.id){
    const covered=raidCovered();state.steps[4]=covered;
    if(covered!==state.coverState){state.coverState=covered;addLog(covered?'Boss hidden from mana users. Keep this position.':'Mana users are exposed. Move the boss behind the ramp corner.',covered?'success':'error');toast(covered?'Raid covered. Hold this position.':'Raid exposed. Move Razuvious behind the left ramp corner.',!covered,5)}
    state.hold=covered&&p.wall>0?state.hold+dt:0;
    if(mode==='pull'?covered&&p.wall>0&&state.taunt>0&&state.steps[2]&&state.steps[3]:state.hold>=6){success();return}
   }
  }
  if(state.combat){
   if(mode==='handoff'){
    state.partner=Math.max(0,state.partner-dt);state.partnerChannel-=dt;
    if(state.partner<4.5&&!state.warning&&state.aggro==='A'){state.warning=true;addLog('Partner: "Wall nearly gone. Your turn."');toast('Partner wall: '+state.partner.toFixed(1)+'s. Shield Wall, then Taunt!',false,4)}
    if(state.partnerChannel<=0&&state.adds[0].controlled){releaseAdd(state.adds[0]);addLog('Partner released A. Mind Exhaustion: 60s.');if(state.aggro==='A'){fail('Your partner lost control.','The outgoing priest\'s channel ended before you took over. Begin MC earlier, wait for registration, then Wall and Taunt.');return}}
   }
   let tank=state.aggro==='you'?state.priest:state.adds.find(a=>a.id===state.aggro);
   if(tank){
    const d=distance(state.boss,tank);if(d>3.2)stepEntity(state.boss,tank.x-state.boss.x,tank.z-state.boss.z,6.4,dt);else{state.boss.angle=Math.atan2(tank.x-state.boss.x,tank.z-state.boss.z);if(tank.id==='you'){state.priest.health=0;fail('Razuvious reached your priest.','Get your understudy in melee range and Taunt as soon as control registers. Use Shield Wall first.');return}tank.health-=dt*(tank.wall>0?2:36);if(tank.health<=0){fail('The understudy died.','Shield Wall ran out while the add was still tanking. Have the next priest take over before protection fades.');return}}
   }
   // Losing a taunt does not erase threat. The current tank keeps the boss.
   state.shout-=dt;if(state.shout<=1.5&&state.shoutCast===0){state.shoutCast=1.5;toast(raidCovered()?'Disrupting Shout incoming. The raid is behind cover.':'Disrupting Shout incoming. Hide the boss from mana users now.',!raidCovered(),2)}
   if(state.shout<=0){state.shout=25;state.shoutCast=0;const exposed=shoutTargets();addLog('Razuvious used Disrupting Shout.');if(exposed.length){for(const u of exposed)u.health=0;state.priest.mana=0;fail('Disrupting Shout hit the raid.','Razuvious could see mana users. Move the boss behind the ramp corner while your understudy tanks him.');return}addLog('Disrupting Shout missed the mana users. The corner blocked it.','success')}
  }
 }
 function targetAuras(target){
  if(!target)return [];
  const auras=[];
  if(target.soothe>0)auras.push({id:'soothe',name:'Mind Soothe',left:target.soothe,duration:15,debuff:true});
  if(target.id==='boss'&&state.taunt>0)auras.push({id:'taunt',name:'Taunt',left:state.taunt,duration:20,debuff:true});
  if(target.immune>0)auras.push({id:'exhaustion',name:'Mind Exhaustion',left:target.immune,duration:60,debuff:true});
  if(target.wall>0)auras.push({id:'wall',name:'Shield Wall',left:target.wall,duration:20,debuff:false});
  return auras;
 }
 function auraMarkup(aura){
  const label=aura.name+', '+Math.ceil(aura.left)+' seconds remaining',sweep=clamp(1-aura.left/aura.duration,0,1)*360;
  return '<span class="wow-buff'+(aura.debuff?' wow-debuff':'')+'" role="img" aria-label="'+label+'" title="'+label+'" style="background-image:url('+auraAssets[aura.id]+')"><i class="aura-sweep" style="background:conic-gradient(#0008 '+sweep+'deg,transparent 0)"></i><b aria-hidden="true">'+Math.ceil(aura.left)+'</b></span>';
 }
 function updateUI(){
  if(!state)return;const p=pet(),target=getTarget(),actor=controlledActor();
  const targetFriendly=!!target?.controlled;
  $('.target-frame').classList.toggle('friendly',targetFriendly);$('.target-frame').classList.toggle('hostile',!targetFriendly);
  $('#target-name').textContent=state.target==='boss'?'Instructor Razuvious':'Deathknight Understudy '+state.target;
  $('#target-level').textContent=state.target==='boss'?'??':'60';
  if(roomView?.portraits){$('#target-portrait').style.backgroundImage='url('+roomView.portraits[state.target==='boss'?'boss':'add']+')';$('.priest-portrait').style.backgroundImage='url('+roomView.portraits.priest+')';$('.pet-portrait').style.backgroundImage='url('+roomView.portraits.add+')'}
  $('#target-health').style.width=clamp(target?.health??100,0,100)+'%';$('#target-health-text').textContent=Math.ceil(Math.max(0,target?.health??100))+'%';
  $('.player-frame .health-bar i').style.width=state.priest.health+'%';$('#player-health-text').textContent=Math.ceil(state.priest.health)+'%';$('#mana-bar').style.width=state.priest.mana+'%';
  let tstatus=target?distance(actor,target).toFixed(1)+' yd · '+(state.target==='boss'?'Boss':'Understudy '+state.target):'No target';
  if(target?.immune>0)tstatus+=' · Exhausted '+target.immune.toFixed(0)+'s';else if(target?.soothe>0)tstatus+=' · Soothed '+target.soothe.toFixed(0)+'s';else if(targetFriendly)tstatus+=' · '+(state.target===state.pet?'Your minion':'Partner');$('#target-state').textContent=tstatus;
  $('#target-auras').innerHTML=targetAuras(target).map(auraMarkup).join('');
  $('#player-state').textContent=state.cast?'Casting Mind Control':state.registration>0?'Stand still · '+state.registration.toFixed(1)+'s':p?'Channeling Mind Control':state.mark?'Mark of the Wild':state.combat?'In combat':'Ready to pull';
  $('#mark-buff').hidden=!state.mark;$('#mc-buff').hidden=!p;
  $('#pet-frame').hidden=!p;
  if(p){$('#pet-name').textContent='Deathknight Understudy '+p.id;$('#pet-channel-time').textContent=Math.ceil(state.channel);$('#pet-health').style.width=Math.max(0,p.health)+'%';$('#pet-wall-buff').hidden=p.wall<=0;$('#pet-wall-buff').textContent=p.wall>0?Math.ceil(p.wall):''}
  $('#action-owner').textContent=p?'UNDERSTUDY '+p.id+(state.registration>0?' · STAND STILL':' · SAME MC MACRO'):'MIND SOOTHE + MC MACRO';
  $('#elapsed').textContent=clock(state.t);$('#scene-mode').textContent=state.status==='paused'?'PAUSED':!state.combat?'CLOCKWISE PATROL':guided?'GUIDED PRACTICE':'RAID NIGHT';
  $('.quest-tracker').classList.toggle('unassisted',!guided);
  $('#coverage-status').hidden=!state.combat||state.status==='ready';const covered=raidCovered();$('#coverage-status').classList.toggle('exposed',!covered);$('#coverage-label').textContent=covered?'RAID COVERED':'RAID EXPOSED';$('#coverage-detail').textContent=covered?'Boss hidden from mana users':'Move the boss behind the corner';$('#shout-time').textContent='Shout '+Math.max(0,state.shout).toFixed(1)+'s';$('#safe-hold').textContent=mode==='pull'?(p?.wall>0&&state.taunt>0?'Wall + Taunt active':'Wall, then Taunt'):'Safe hold '+Math.min(6,state.hold).toFixed(1)+' / 6s';
  const checkItems=$$('#checklist li'),active=state.steps.indexOf(false);checkItems.forEach((li,i)=>{li.classList.toggle('done',!!state.steps[i]);li.classList.toggle('active',i===active)});
  dom.cast.hidden=!state.cast&&!state.pet;
  if(state.cast){dom.cast.classList.remove('channel');$('#cast-label').textContent='Mind Control';$('#cast-time').textContent=Math.max(0,state.cast.left).toFixed(1)+'s';$('#cast-fill').style.width=(1-state.cast.left/3)*100+'%'}
  else if(p){dom.cast.classList.add('channel');$('#cast-label').textContent='Channeling';$('#cast-time').textContent=state.channel.toFixed(1)+'s';$('#cast-fill').style.width=state.channel/60*100+'%'}
  dom.timers.hidden=!state.combat||state.status==='ready';const remaining=mode==='handoff'&&state.aggro==='A'?state.partner:p?.wall||0;$('#tank-name').textContent=state.aggro===state.pet&&state.pet?'UNDERSTUDY '+state.pet:mode==='handoff'?'PARTNER · UNDERSTUDY A':'BOSS UNTANKED';$('#wall-time').textContent=remaining.toFixed(1)+'s';$('#wall-bar').style.width=clamp(remaining/(state.aggro===state.pet?20:Number(settings.handoff)),0,1)*100+'%';$('#timer-detail').textContent='Shield Wall · Taunt '+state.taunt.toFixed(1)+'s';dom.timers.classList.toggle('urgent',remaining<4);
  const showToast=state.toast&&state.toast.until>=state.t&&state.status==='running'&&(guided||state.toast.error);dom.callout.hidden=!showToast;if(showToast){$('#callout-text').textContent=state.toast.message;dom.callout.classList.toggle('error',state.toast.error)}
 }
 function changeMode(newMode){mode=newMode;$$('[data-mode]').forEach(b=>{const chosen=b.dataset.mode===mode;b.classList.toggle('selected',chosen);b.setAttribute('aria-selected',chosen)});reset()}
 function pause(){if(!['running','paused'].includes(state.status))return;if(state.status==='running'){state.status='paused';keys.clear();clearMouseInput();bossVoice?.pause();spellSounds?.pause();const badge=document.createElement('div');badge.className='paused-badge';badge.textContent='Practice paused';dom.viewport.append(badge);$('#pause-button').innerHTML=icon('play')+' Resume'}else{state.status='running';bossVoice?.resume();spellSounds?.resume();$('.paused-badge')?.remove();$('#pause-button').innerHTML=icon('clock')+' Pause'}updateUI()}
 function openDialog(name){
  if(state.status==='running'){pause();dialogsPaused=true}$('#'+name+'-dialog').showModal();
  if(name==='guide')showGuide('controls');
  if(name==='settings'){$('#latency-setting').value=settings.latency;$('#handoff-setting').value=settings.handoff;$('#movement-setting').value=settings.movement;$('#resist-setting').checked=settings.resists;$('#binding-error').hidden=true;$$('[data-binding]').forEach(input=>input.value=bindings[input.dataset.binding])}
 }
 function closeDialog(dialog){dialog.close();if(dialogsPaused){dialogsPaused=false;if(state.status==='paused')pause()}}
 function showGuide(tab){
  $$('[data-guide]').forEach(b=>b.classList.toggle('selected',b.dataset.guide===tab));
  const content={
   controls:'<p>Sound starts off. Use the footer sound button to enable the original Razuvious recordings and Classic spell sounds. Quotes also appear in the combat log. Mind Soothe, MC casting and completion, Shield Wall and Taunt use their original effects. Pausing pauses audio; restarting stops it.</p><p>The two spell buttons are Mind Soothe <kbd>'+bindings.soothe+'</kbd> and the Mind Control macro <kbd>'+bindings.macro+'</kbd>. Match them to your raid bindings in settings.</p><div class="guide-grid"><div><kbd>W</kbd> Forward. <kbd>S</kbd> Backward.<br><kbd>A</kbd><kbd>D</kbd> Turn. <kbd>Q</kbd><kbd>E</kbd> Strafe.<br>A/D strafing is available in settings.</div><div>Hold right-click to steer with the mouse. A/D strafe while held. Both mouse buttons move forward. Left-drag orbits the camera. Scroll changes camera distance.</div><div>Click an enemy body, marker or nameplate to target it. <kbd>Tab</kbd> cycles targets. After MC, the next Tab targets Razuvious.</div><div><kbd>Esc</kbd> Cancels MC.<br><kbd>P</kbd> Pause. <kbd>R</kbd> Restart.<br><kbd>F</kbd> Also runs the macro unless rebound.</div></div><ol class="guide-list"><li>On the pull, Soothe A from the left side before entering MC range. On the handoff, your partner holds A. Check the other adds for Mind Exhaustion and choose one without it.</li><li>Target the free understudy and press <kbd>'+bindings.macro+'</kbd> once. The camera switches when the 3s cast lands. Stand still for about 1s more before moving or using the macro again.</li><li>Press the same macro again. It targets Razuvious, orders an attack, uses Shield Wall and then Taunt. Repeat when the boss reaches 5 yd. Keep him hidden from the raid on the left.</li></ol><p>Copy this into WoW and bind it to the same key. The macro automatically targets Razuvious while you have a pet. Its Faerlina lines have no effect in this room.</p><pre class="macro-code"></pre><button class="copy-macro">Copy Razuvious macro</button>',
   mechanics:'<ul class="guide-list"><li><strong>Mind Soothe.</strong> Instant, 40 yd range, 1.5s global cooldown. Reduces the target\'s detection range by 10 yd for 15s. It does not soothe Razuvious when cast on an add.</li><li><strong>Mind Control.</strong> 3s cast, 20 yd cast range, up to 60s channel. Stand still during the cast, then about 1s more for registration. The camera and pet frame switch to the add as soon as the cast lands. Stand still for about 1s after that switch while control registers. Initial casting requires line of sight. Losing line of sight after control is established does not, by itself, end the channel. Priest spells and Escape cancel control.</li><li><strong>Shield Wall.</strong> 75% damage reduction for 20s, 30s cooldown. Use it before Taunt. It is an understudy ability, not the priest\'s Power Word: Shield.</li><li><strong>Taunt.</strong> 5 yd range, 20s forced attack, 60s cooldown. Auto attacks build threat, so expiry does not automatically make the boss change targets. Rotate before protection or control expires.</li><li><strong>Mind Exhaustion.</strong> Releasing an understudy leaves it immune to another MC for 60s. Its Mind Exhaustion icon and countdown appear on the target frame and above its nameplate. Choose an available add without that debuff.</li><li><strong>Positioning.</strong> Razuvious uses Disrupting Shout about every 25s. It hits mana users who can see him. Move the boss behind the ramp corner with your understudy and keep the raid behind the wall. This drill does not require healer line of sight to the understudy or healing while Shield Wall is active.</li></ul>',
   sources:'<p>Based on the level-60, 40-player Classic encounter. The room is a procedural reconstruction of the circular training floor, four understudies and entry ramp. It is not a copy of the game map.</p><div class="guide-links"><a href="https://www.wowhead.com/classic/npc=16061/instructor-razuvious#sounds" target="_blank" rel="noopener noreferrer">Wowhead · Original Razuvious voice recordings ↗</a><a href="https://warcraft.wiki.gg/wiki/Instructor_Razuvious_(Classic)" target="_blank" rel="noopener noreferrer">Classic encounter notes · 60s Mind Exhaustion ↗</a><a href="https://www.reddit.com/r/classicwow/comments/lbwj6q/mind_control_on_razuvious_breaking_from_los/" target="_blank" rel="noopener noreferrer">Classic priest reports · MC and line of sight ↗</a><a href="https://warcraft.wiki.gg/wiki/Channeling" target="_blank" rel="noopener noreferrer">Warcraft Wiki · Channeled spells and line of sight ↗</a><a href="https://www.wowhead.com/classic/guide/instructor-razuvious-naxxramas-raid-strategy" target="_blank" rel="noopener noreferrer">Wowhead · Classic Razuvious encounter guide ↗</a><a href="https://www.wowhead.com/classic/spell=29060/taunt" target="_blank" rel="noopener noreferrer">Classic spell data · Taunt ↗</a><a href="https://www.wowhead.com/classic/spell=29061/shield-wall" target="_blank" rel="noopener noreferrer">Classic spell data · Shield Wall ↗</a><a href="https://www.wowhead.com/classic/spell=10953/mind-soothe" target="_blank" rel="noopener noreferrer">Classic spell data · Mind Soothe ↗</a><a href="https://wowwiki-archive.fandom.com/wiki/Instructor_Razuvious_(original)" target="_blank" rel="noopener noreferrer">Original encounter notes · Mind Soothe pull ↗</a><a href="https://www.sageguide.net/naxxramas" target="_blank" rel="noopener noreferrer">Sage Guide · Room and ramp positioning reference ↗</a></div><p>Boss voices and spell effects are original Blizzard recordings. The trainer plays Razuvious\'s death line when a priest, raid member or understudy dies.</p><p><strong>Training approximations.</strong> Room scale, detection radii, the clockwise patrol path, movement, line of sight and damage are estimates. Cover checks use the visible ramp rails, corner pillars and outer wall footprints. The raid stands on the left platform up the ramp. The HUD and camera follow the Classic layout, with procedural character and room models. The registration pause is about 1s after the 3s cast, adjustable from 0.8s to 1.2s for practice. The outgoing partner\'s channel ends 2.4s after the wall to make late handoffs visible. A 100 yd possession limit follows original-era notes, not a verified current-server distance.</p><p>The channel LOS rule is based on first-hand Classic priest reports and channeling documentation. A Blizzard statement specific to Razuvious MC was not found.</p><p>Guided mode shows detection circles and the patrol. Raid night hides these aids. Optional resists use a deliberately exaggerated 10% rate. Random heartbeat breaks, full threat tables, talents, server batching and the wider raid are not simulated. This tool trains the sequence and timing; confirm positioning and spell behavior with your raid.</p><p>Spell icons are Blizzard game assets. Mind Soothe and Taunt use the supplied icons; other icons come from Wowhead. World of Warcraft belongs to Blizzard Entertainment. This trainer is independent. Progress is stored only in your browser.</p>'
  };
  $('#guide-content').innerHTML=content[tab];if(tab==='controls'){const code=$('#guide-content .macro-code'),button=$('#guide-content .copy-macro');code.textContent=MC_MACRO;button.onclick=()=>copyMacro(button)}
 }
 function normalizeBinding(value){
  const parts=value.trim().split('+').map(p=>p.trim().toLowerCase()),key=parts.pop();
  const aliases={control:'Ctrl',ctrl:'Ctrl',shift:'Shift',alt:'Alt',option:'Alt',meta:'Meta',cmd:'Meta',command:'Meta'};
  if(!key||!(/^[a-z0-9]$/.test(key)||/^f([1-9]|1[0-2])$/.test(key)||['space','-','='].includes(key)))return null;
  if(parts.some(p=>!aliases[p]))return null;
  const mods=new Set(parts.map(p=>aliases[p]));
  return ['Ctrl','Alt','Shift','Meta'].filter(p=>mods.has(p)).concat(key.length===1?key.toUpperCase():key==='space'?'Space':key.toUpperCase()).join('+');
 }
 function eventBinding(e){
  const code=e.code||'',key=/^Digit[0-9]$/.test(code)?code.slice(-1):/^Key[A-Z]$/.test(code)?code.slice(-1):code==='Space'?'Space':e.key.length===1?e.key.toUpperCase():e.key.toUpperCase();
  return [e.ctrlKey?'Ctrl':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.metaKey?'Meta':null,key].filter(Boolean).join('+');
 }
 function shortBinding(value){return value.replace('Ctrl+','C-').replace('Shift+','S-').replace('Alt+','A-').replace('Meta+','M-')}
 function updateBindings(){
  dom.viewport.setAttribute('aria-label','Practice arena. W and S move, A and D '+(settings.movement==='classic'?'turn, Q and E strafe':'strafe')+'. Hold right-click to steer; A and D strafe while held. Both mouse buttons move forward. '+bindings.soothe+' Mind Soothe, '+bindings.macro+' MC macro. Only these two spell buttons are used. Bindings are configurable.');
  $$('[data-bind]').forEach(button=>{const key=bindings[button.dataset.bind];button.querySelector('.spell-art b').textContent=shortBinding(key);button.setAttribute('aria-keyshortcuts',key);button.dataset.tooltip ||= button.getAttribute('title')||button.querySelector('span:last-child').textContent;button.setAttribute('title',button.dataset.tooltip+' · '+key)});
 }
 function isTranslating(){const input=movementInput();return !!(input.forward||input.strafe)}
 function clearMouseInput(){
  mouseButtons=0;pointerDrag=null;hoveredNpc=null;dom.viewport.classList.remove('mouse-look','npc-hover');
  if(document.pointerLockElement===dom.viewport){intendedUnlock=true;document.exitPointerLock?.()}
 }
 function targetAt(x,y){
  const targets=renderPoints.filter(p=>['A','B','C','D','boss'].includes(p.id));
  const nameHit=targets.filter(p=>Math.abs(p.x-x)<=p.width/2+9&&y>=p.y-17&&y<=p.y+15||p.marker&&Math.abs(p.marker.x-x)<=15&&Math.abs(p.marker.y-y)<=15||p.auras&&x>=p.auras.left-5&&x<=p.auras.right+5&&y>=p.auras.top-5&&y<=p.auras.bottom+5).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
  if(nameHit)return nameHit.id;
  const exact=roomView?.pickNpc(x,y);if(exact)return exact;
  const bodies=targets.filter(p=>p.body&&x>=p.body.left-18&&x<=p.body.right+18&&y>=p.body.top-14&&y<=p.body.bottom+18);
  bodies.sort((a,b)=>bodyHitScore(a.body,x,y)-bodyHitScore(b.body,x,y));if(bodies[0])return bodies[0].id;
  return targets.filter(p=>Math.abs(p.x-x)<=p.width/2+22&&Math.abs(p.y-y)<=48).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0]?.id||null;
 }
 function bodyHitScore(box,x,y){return Math.hypot((x-(box.left+box.right)/2)/Math.max(1,(box.right-box.left)/2),(y-(box.top+box.bottom)/2)/Math.max(1,(box.bottom-box.top)/2))}
 function updateHover(clientX,clientY){
  const rect=dom.viewport.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top;hoveredNpc=x>=0&&x<=rect.width&&y>=0&&y<=rect.height?targetAt(x,y):null;dom.viewport.classList.toggle('npc-hover',!!hoveredNpc);
 }
 function beginMouse(e){
  if(e.button!==0&&e.button!==2||$('dialog[open]'))return;
  const inWorld=e.target===dom.room||e.target===dom.overlay||e.target===dom.viewport||document.pointerLockElement===dom.viewport;if(!inWorld)return;
  e.preventDefault();dom.viewport.focus({preventScroll:true});const previous=mouseButtons;mouseButtons|=e.button===0?1:2;
  pointerDrag??={button:e.button,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false,chord:false};
  if((mouseButtons&3)===3){pointerDrag.chord=true;pointerDrag.moved=true}
  if(rightMouseHeld()&&!(previous&2)){
   const actor=controlledActor();actor.angle+=cameraOrbit;cameraOrbit=0;hoveredNpc=null;dom.viewport.classList.remove('npc-hover');dom.viewport.classList.add('mouse-look');
   if(state.status==='running'&&dom.viewport.requestPointerLock){try{const promise=dom.viewport.requestPointerLock();promise?.catch(()=>{})}catch{ /* Pointer capture still supports held right-drag. */ }}
  }
 }
 function moveMouse(e){
  if(!pointerDrag){if(e.target===dom.room||e.target===dom.overlay||e.target===dom.viewport)updateHover(e.clientX,e.clientY);return}
  const locked=document.pointerLockElement===dom.viewport,dx=locked?e.movementX:e.clientX-pointerDrag.x,dy=locked?e.movementY:e.clientY-pointerDrag.y;
  pointerDrag.x=e.clientX;pointerDrag.y=e.clientY;pointerDrag.moved ||= locked&&(Math.abs(dx)+Math.abs(dy)>0)||Math.hypot(e.clientX-pointerDrag.startX,e.clientY-pointerDrag.startY)>5;
  if(rightMouseHeld()){
   const actor=controlledActor();actor.angle-=dx*.006;cameraOrbit=0;cameraPitch=clamp(cameraPitch+dy*.005,-.08,1.08);if(actor.id!=='you'&&(dx||dy))actor.attacking=false;
  }else if(mouseButtons&1&&pointerDrag.moved){cameraOrbit-=dx*.006;cameraPitch=clamp(cameraPitch+dy*.005,-.08,1.08)}
 }
 function endMouse(e){
  if(!pointerDrag)return;const click=e.button===0&&!(mouseButtons&2)&&!pointerDrag.moved&&!pointerDrag.chord;
  mouseButtons&=~(e.button===0?1:e.button===2?2:0);
  if(click){const rect=dom.viewport.getBoundingClientRect(),id=targetAt(e.clientX-rect.left,e.clientY-rect.top);if(id)selectTarget(id)}
  if(!rightMouseHeld()){dom.viewport.classList.remove('mouse-look');if(document.pointerLockElement===dom.viewport){intendedUnlock=true;document.exitPointerLock?.()}}
  if(!mouseButtons){pointerDrag=null;updateHover(e.clientX,e.clientY)}
 }
 function initEvents(){
  bossVoice=new BossVoice($('#boss-voice'),text=>addLog('Instructor Razuvious yells: '+text,'boss'),soundUnavailable);
  spellSounds=new SpellSounds(Object.fromEntries($$('[data-spell-audio]').map(player=>[player.dataset.spellAudio,player])),soundUnavailable);updateSoundButton();
  for(const [id,url] of Object.entries(auraAssets)){const image=new Image();image.src=url;auraImages[id]=image}
  updateBindings();
  $$('[data-mode]').forEach(b=>b.onclick=()=>changeMode(b.dataset.mode));$$('[data-action]').forEach(b=>b.onclick=()=>{action(b.dataset.action);dom.viewport.focus({preventScroll:true})});$$('[data-dialog]').forEach(b=>b.onclick=()=>openDialog(b.dataset.dialog));$('#training-nav').onclick=e=>{e.preventDefault();dom.viewport.scrollIntoView({behavior:'smooth',block:'center'})};$$('[data-guide]').forEach(b=>b.onclick=()=>showGuide(b.dataset.guide));$$('.close-dialog').forEach(b=>b.onclick=()=>closeDialog(b.closest('dialog')));
  $$('dialog').forEach(d=>{d.addEventListener('cancel',event=>{event.preventDefault();closeDialog(d)});d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d)}})});
  $('#save-settings').onclick=()=>{
   const next={},used=new Set(),movement=$('#movement-setting').value;let error='';
   $$('[data-binding]').forEach(input=>{const value=normalizeBinding(input.value);if(!value)error='Use a letter, number, F-key or a combination such as Shift+G.';else if(used.has(value))error='Each ability needs a different key.';else if(['W','S',...(movement==='classic'?['A','D','Q','E']:['A','D'])].includes(value))error=value+' is used for movement. Add a modifier or choose another key.';else{next[input.dataset.binding]=value;used.add(value)}});
   $('#binding-error').hidden=!error;if(error){$('#binding-error').textContent=error;return}
   bindings=next;settings.latency=Number($('#latency-setting').value);settings.handoff=Number($('#handoff-setting').value);settings.movement=movement;settings.resists=$('#resist-setting').checked;
   persist('razuvious.bindings.v1',bindings);persist('razuvious.settings.v1',settings);updateBindings();closeDialog($('#settings-dialog'));if(state.status==='ready')reset();
  };
  $('#restart-button').onclick=()=>reset();$('#pause-button').onclick=pause;
  $('#guided-button').onclick=()=>setDifficulty(true);$('#raid-button').onclick=()=>setDifficulty(false);
  $('#camera-button').onclick=()=>{tactical=!tactical;$('#camera-button').textContent=tactical?'Player view':'Map view';$('#camera-button').setAttribute('aria-label',tactical?'Switch to player view':'Switch to tactical view');roomView?.setCamera(tactical)};
  $('#map-zoom-in').onclick=()=>{minimapZoom=clamp(minimapZoom*1.2,.7,2)};$('#map-zoom-out').onclick=()=>{minimapZoom=clamp(minimapZoom/1.2,.7,2)};
  $('#sound-button').onclick=()=>{const enabled=!bossVoice.enabled;bossVoice.setEnabled(enabled);spellSounds.setEnabled(enabled);if(state.status==='paused'){bossVoice.pause();spellSounds.pause()}updateSoundButton()};
  $('#fullscreen-button').onclick=async()=>{try{const panel=$('.arena-panel');if(document.fullscreenElement)await document.exitFullscreen();else await panel.requestFullscreen()}catch{toast('Fullscreen is unavailable in this browser.',false,3)}};
  window.addEventListener('keydown',e=>{
   if($('dialog[open]')||e.target.matches('input,select,textarea'))return;
   const key=e.key.toLowerCase(),combination=eventBinding(e),ability=Object.keys(bindings).find(name=>bindings[name]===combination);
   if(ability){e.preventDefault();if(!e.repeat)action(ability);return}
   if(e.metaKey||e.ctrlKey||e.altKey)return;
   if(key==='tab'&&!e.target.closest('.arena-panel'))return;
   if(['tab',' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();
   if(['w','a','s','d','q','e'].includes(key)){e.preventDefault();keys.add(key);return}
   const arrow={arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'};if(arrow[key]){keys.add(arrow[key]);return}
   if(e.repeat)return;
   if(key==='enter'){if(state.status==='ready')start();else if(state.status==='paused')pause()}
   if(key==='tab')cycleTarget();if(key==='r')reset(true);if(key==='p')pause();if(key==='escape'){clearMouseInput();action('release')};
   if(key==='f')action('macro');
  });
  window.addEventListener('keyup',e=>{const key=e.key.toLowerCase();keys.delete(key);const arrow={arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'};if(arrow[key])keys.delete(arrow[key])});
  function suspendAudio(){keys.clear();clearMouseInput();if(state.status==='running')pause();else{bossVoice.stop();spellSounds.stop()}}
  window.addEventListener('blur',suspendAudio);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendAudio()});
  dom.viewport.addEventListener('contextmenu',e=>e.preventDefault());
  // Mouse events keep both buttons available while pointer lock is active.
  dom.viewport.addEventListener('mousedown',beginMouse);
  document.addEventListener('mousemove',moveMouse);document.addEventListener('mouseup',endMouse);
  document.addEventListener('pointerlockchange',()=>{
   const wasLocked=pointerLocked;pointerLocked=document.pointerLockElement===dom.viewport;
   if(pointerLocked){if(!rightMouseHeld()||state.status!=='running'){intendedUnlock=true;document.exitPointerLock?.()}return}
   if(wasLocked){const escaped=!intendedUnlock&&document.hasFocus()&&!document.hidden;intendedUnlock=false;clearMouseInput();if(escaped&&state.status==='running')action('release')}
  });
  document.addEventListener('pointerlockerror',()=>{intendedUnlock=false});
  dom.viewport.addEventListener('pointerdown',e=>{
   if(e.target!==dom.room&&e.target!==dom.overlay&&e.target!==dom.viewport)return;
   dom.viewport.setPointerCapture(e.pointerId);
   if(e.pointerType!=='mouse'){e.preventDefault();pointerDrag={button:0,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false,chord:false,touch:true};mouseButtons=1;dom.viewport.focus({preventScroll:true})}
  });
  dom.viewport.addEventListener('pointermove',e=>{if(pointerDrag?.touch)moveMouse(e)});
  dom.viewport.addEventListener('pointerup',e=>{if(pointerDrag?.touch)endMouse({...e,button:0,clientX:e.clientX,clientY:e.clientY})});
  dom.viewport.addEventListener('pointercancel',()=>{if(document.pointerLockElement!==dom.viewport)clearMouseInput()});
  dom.viewport.addEventListener('pointerleave',()=>{if(!mouseButtons){hoveredNpc=null;dom.viewport.classList.remove('npc-hover')}});
  dom.viewport.addEventListener('wheel',e=>{if(e.target!==dom.room&&e.target!==dom.overlay)return;e.preventDefault();cameraDistance=clamp(cameraDistance+e.deltaY*.012,8,25)},{passive:false});
  $$('[data-move]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(b.dataset.move);b.setPointerCapture(e.pointerId)});b.addEventListener('pointerup',()=>keys.delete(b.dataset.move));b.addEventListener('pointercancel',()=>keys.delete(b.dataset.move))});
  new ResizeObserver(resize).observe(dom.viewport);
 }
 function setDifficulty(value){guided=value;$('#guided-button').classList.toggle('selected',value);$('#raid-button').classList.toggle('selected',!value);$('#guided-button').setAttribute('aria-pressed',value);$('#raid-button').setAttribute('aria-pressed',!value);if(state.status==='ready')reset();else updateUI()}
 function resize(){const rect=dom.viewport.getBoundingClientRect();viewWidth=rect.width;viewHeight=rect.height;displayScale=Math.min(window.devicePixelRatio||1,2);dom.overlay.width=viewWidth*displayScale;dom.overlay.height=viewHeight*displayScale;overlayCtx.setTransform(displayScale,0,0,displayScale,0,0);roomView?.resize(viewWidth,viewHeight);if(fallbackCtx){dom.room.width=viewWidth*displayScale;dom.room.height=viewHeight*displayScale;fallbackCtx.setTransform(displayScale,0,0,displayScale,0,0)}}
 function ground(z){return z<=18?0:z>=31?2.1:(z-18)/13*2.1}
 function initRoom(){
  if(!THREE){fallbackCtx=dom.room.getContext('2d');return}
  try{
   const T=THREE,scene=new T.Scene();scene.background=new T.Color('#242039');scene.fog=new T.Fog('#242039',50,115);
   const renderer=new T.WebGLRenderer({canvas:dom.room,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
   const followCamera=new T.PerspectiveCamera(52,1,.1,180),mapCamera=new T.OrthographicCamera(-40,40,35,-35,.1,200);let camera=followCamera,lastActor=null;const target=new T.Vector3(0,0,3);
   scene.add(new T.HemisphereLight('#c3a9ee','#252339',2.3));const sun=new T.DirectionalLight('#ead1af',2.2);sun.position.set(-24,48,24);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:110});sun.shadow.bias=-.0008;sun.shadow.normalBias=.08;scene.add(sun);
   const greenLight=new T.PointLight('#bedb8a',80,35,1.5);greenLight.position.set(0,2,-6);scene.add(greenLight);
   let seed=8847;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646};
   const stoneCanvas=document.createElement('canvas');stoneCanvas.width=stoneCanvas.height=512;const c=stoneCanvas.getContext('2d');c.fillStyle='#27282d';c.fillRect(0,0,512,512);
   const vertices=[];for(let j=0;j<=8;j++){vertices[j]=[];for(let i=0;i<=8;i++)vertices[j][i]={x:i*64+(i===0||i===8?0:(rand()-.5)*23),y:j*64+(j===0||j===8?0:(rand()-.5)*23)}}
   for(let j=0;j<8;j++)for(let i=0;i<8;i++){const p=[vertices[j][i],vertices[j][i+1],vertices[j+1][i+1],vertices[j+1][i]],brightness=Math.floor(61+rand()*20);c.beginPath();p.forEach((v,k)=>k?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.closePath();c.fillStyle='rgb('+brightness+','+(brightness+1)+','+(brightness+9)+')';c.fill();c.strokeStyle='#292c32';c.lineWidth=4;c.stroke();c.strokeStyle='#74707835';c.lineWidth=1;c.stroke();for(let n=0;n<15;n++){c.fillStyle=rand()>.5?'#ffffff07':'#00000009';c.fillRect(i*64+rand()*60,j*64+rand()*60,1+rand()*7,1)}}
   const texture=new T.CanvasTexture(stoneCanvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(2.5,2.5);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
   const floorMat=new T.MeshStandardMaterial({map:texture,color:'#ada6b4',roughness:1}),wallMat=new T.MeshStandardMaterial({color:'#5b4a80',roughness:.95}),edgeMat=new T.MeshStandardMaterial({color:'#776295',roughness:1}),darkMat=new T.MeshStandardMaterial({color:'#323b43',roughness:1}),metalMat=new T.MeshStandardMaterial({color:'#707b79',roughness:.6,metalness:.6});
   const mesh=(geo,mat,x=0,y=0,z=0,parent=scene)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m};
   const box=(w,h,d,mat,x,y,z,parent=scene)=>mesh(new T.BoxGeometry(w,h,d),mat,x,y,z,parent);
   box(65,1,76,darkMat,0,-1.1,1);const floor=mesh(new T.CircleGeometry(24.5,80),floorMat,0,.02,-6);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
   const rim=mesh(new T.RingGeometry(23.5,25,80),edgeMat,0,.04,-6);rim.rotation.x=-Math.PI/2;
   const sigil=document.createElement('canvas');sigil.width=sigil.height=512;const s=sigil.getContext('2d');s.fillStyle='#484a36';s.beginPath();s.arc(256,256,251,0,Math.PI*2);s.fill();const glow=s.createRadialGradient(256,256,5,256,256,240);glow.addColorStop(0,'#c2b365');glow.addColorStop(.28,'#918654');glow.addColorStop(1,'#474837');s.fillStyle=glow;s.fill();s.strokeStyle='#b5aa6c';for(const r of [130,166,184,239]){s.lineWidth=r===184?9:3;s.beginPath();s.arc(256,256,r,0,Math.PI*2);s.stroke()}for(let n=0;n<16;n++){s.save();s.translate(256,256);s.rotate(n/16*Math.PI*2);s.fillStyle='#aaa169';s.font='bold 27px Georgia';s.fillText(['ᛉ','ᛟ','ᚷ','ᛞ'][n%4],-10,-204);s.restore()}s.beginPath();for(let n=0;n<16;n++){const r=n%2?55:112,angle=n/16*Math.PI*2;n?s.lineTo(256+Math.cos(angle)*r,256+Math.sin(angle)*r):s.moveTo(256+Math.cos(angle)*r,256+Math.sin(angle)*r)}s.closePath();s.strokeStyle='#d4c17b';s.lineWidth=3;s.stroke();
   const sigTex=new T.CanvasTexture(sigil);sigTex.colorSpace=T.SRGBColorSpace;const center=mesh(new T.CircleGeometry(6,64),new T.MeshStandardMaterial({map:sigTex,roughness:1,emissive:'#766133',emissiveIntensity:.3}),0,.045,-6);center.rotation.x=-Math.PI/2;
   const circleBand=mesh(new T.RingGeometry(6,6.8,64),edgeMat,0,.04,-6);circleBand.rotation.x=-Math.PI/2;
   // Pit wall, buttresses, arches and green braziers.
   for(const {x,z,w,h,d,y,angle:a,n} of outerWalls){const wall=box(w,h,d,wallMat,x,y,z);wall.rotation.y=a;const foot=box(5.55,.55,2.2,edgeMat,x,.3,z);foot.rotation.y=a;const cap=box(5.55,.5,2.2,edgeMat,x,6.7,z);cap.rotation.y=a;
    for(let row=1;row<5;row++){const joint=box(5.5,.045,1.83,darkMat,x,row*1.3,z);joint.rotation.y=a}
    if(n%3===0){const column=mesh(new T.CylinderGeometry(.8,1,8,6),edgeMat,x,4,z);box(2.2,.7,2.2,darkMat,x,.35,z);box(2,.55,2,edgeMat,x,7.7,z);const alcove=box(2.4,3.8,.3,darkMat,x-Math.sin(a)*1,z?3.7:3.7,z-Math.cos(a)*1);alcove.rotation.y=a;const frame=mesh(new T.TorusGeometry(1.25,.12,6,12,Math.PI),metalMat,x-Math.sin(a)*1.25,5.35,z-Math.cos(a)*1.25);frame.rotation.y=a;column.receiveShadow=true}
   }
   for(const [x,z] of [[-18,7],[18,7],[-20,-15],[20,-15],[-8,-29],[8,-29]]){box(1.6,1.4,1.6,darkMat,x,.7,z);mesh(new T.CylinderGeometry(1.15,.6,.7,8),metalMat,x,1.65,z);const flame=mesh(new T.ConeGeometry(.55,1.6,6),new T.MeshStandardMaterial({color:'#c4eaa2',emissive:'#7cc894',emissiveIntensity:2.2,transparent:true,opacity:.85}),x,2.65,z);const light=new T.PointLight('#98d5a1',35,14,2);light.position.set(x,3,z);scene.add(light);flame.userData.flame=true}
   for(let n=0;n<13;n++){const z=18+n;box(12.8,.28,1.08,floorMat,0,.16*n,z);box(14,.28,1.08,floorMat,-15,.16*n,z)}
   box(57,.9,7,edgeMat,0,1.62,34);box(57,.1,7,floorMat,0,2.11,34);
   for(const {x,z,w,h,d,y,kind} of rampWalls){box(w,h,d,kind==='rail'?wallMat:edgeMat,x,y,z);if(kind==='rail')box(1.7,.3,12.6,edgeMat,x,3,z);else box(2.3,.25,2.3,darkMat,x,3.32,z)}
   // Weapon racks on the flanks of the training ring.
   for(const x of [-22,22]){box(.3,2.3,5,metalMat,x,1.3,-4);for(let n=0;n<5;n++){const sword=box(.11,2.4,.2,edgeMat,x,1.9,-6+n);sword.rotation.z=x>0?-.3:.3;box(.7,.08,.15,metalMat,x,2.5,-6+n)}}
   const models={},npcMeshes=[];const raycaster=new T.Raycaster(),pickPoint=new T.Vector2();
   function character(id,kind){const group=new T.Group();scene.add(group);const boss=kind==='boss',priest=kind==='priest',bodyMat=new T.MeshStandardMaterial({color:boss?'#21549c':priest?'#356bb0':'#8a8299',roughness:.7,metalness:priest?.05:.55}),trim=new T.MeshStandardMaterial({color:boss?'#729ece':priest?'#b9bbd9':'#c3bbce',roughness:.7,metalness:.6}),skin=new T.MeshStandardMaterial({color:boss?'#b6b0bc':priest?'#d0c4ba':'#d2afa0',roughness:.95}),cloth=new T.MeshStandardMaterial({color:priest?'#193b85':boss?'#153055':'#3c3747',roughness:1});
    mesh(new T.CylinderGeometry(.65,.8,1.4,8),bodyMat,0,1.8,0,group);if(priest){mesh(new T.ConeGeometry(1.05,2.5,8),cloth,0,1.24,0,group);mesh(new T.SphereGeometry(.61,10,8,0,Math.PI*2,0,Math.PI*.52),cloth,0,3.07,0,group);mesh(new T.SphereGeometry(.59,10,8,2.55,4.38,Math.PI*.4,Math.PI*.55),cloth,0,3.02,0,group)}else{for(const x of [-.4,.4]){box(.45,1.05,.55,bodyMat,x,.67,0,group);box(.48,.34,.85,darkMat,x,.2,.15,group)}}
    mesh(new T.SphereGeometry(.47,12,10),skin,0,2.98,priest?.22:.06,group);
    const eyes=new T.MeshStandardMaterial({color:boss?'#99d9ff':'#201f27',emissive:boss?'#4797ed':'#000000',emissiveIntensity:boss?.6:0});
    for(const x of [-.16,.16])mesh(new T.SphereGeometry(.055,6,6),eyes,x,3.02,priest?.66:.485,group);
    mesh(new T.ConeGeometry(.08,.21,5),skin,0,2.92,priest?.68:.48,group).rotation.x=Math.PI/2;
    box(.18,.035,.035,darkMat,0,2.79,priest?.65:.49,group);
    if(boss){mesh(new T.SphereGeometry(.54,8,6,0,Math.PI*2,0,Math.PI*.56),bodyMat,0,3.14,0,group);for(const x of [-.34,.34]){const horn=mesh(new T.ConeGeometry(.15,.95,5),trim,x,3.7,0,group);horn.rotation.z=x<0?.4:-.4}}
    else if(!priest){const hair=new T.MeshStandardMaterial({color:'#a85229',roughness:1});mesh(new T.SphereGeometry(.5,10,8,0,Math.PI*2,0,Math.PI*.49),hair,0,3.05,0,group);box(.15,.5,.65,hair,-.38,2.94,-.07,group);box(.15,.5,.65,hair,.38,2.94,-.07,group)}
    for(const x of [-.9,.9]){mesh(new T.DodecahedronGeometry(boss?.67:.5,0),trim,x,2.52,0,group);box(.35,1.1,.4,bodyMat,x,1.96,.04,group);mesh(new T.SphereGeometry(.22,6,6),skin,x,1.35,.09,group)}
    const cape=box(1.12,1.9,.1,cloth,0,1.7,-.63,group);cape.rotation.x=-.17;
    if(priest){mesh(new T.CylinderGeometry(.06,.06,3.4,5),trim,1.02,1.75,.2,group);mesh(new T.OctahedronGeometry(.28),new T.MeshStandardMaterial({color:'#c8ddea',emissive:'#739db9',emissiveIntensity:1}),1.02,3.45,.2,group)}else{box(.18,2.4,.1,trim,1.05,1.55,.3,group);box(.8,.12,.22,trim,1.05,2.6,.3,group);const shield=mesh(new T.CylinderGeometry(.65,.65,.17,6),bodyMat,-1,1.7,.45,group);shield.rotation.x=Math.PI/2;mesh(new T.OctahedronGeometry(.25),trim,-1,1.7,.6,group)}
    if(!priest)for(const object of group.children){object.userData.npcId=id;npcMeshes.push(object)}
    if(boss)group.scale.setScalar(1.32);const shadow=mesh(new T.CircleGeometry(boss?1.5:1.1,24),new T.MeshBasicMaterial({color:'#050a0b',transparent:true,opacity:.3,depthWrite:false}),0,.055,0,group);shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;
    const ring=mesh(new T.RingGeometry(1.3,1.46,40),new T.MeshBasicMaterial({color:'#c2d796',transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}),0,.07,0,group);ring.rotation.x=-Math.PI/2;ring.castShadow=false;
    const barrier=mesh(new T.SphereGeometry(1.75,18,12),new T.MeshBasicMaterial({color:'#8aaad9',transparent:true,opacity:.14,wireframe:true,depthWrite:false}),0,1.8,0,group);barrier.visible=false;
    models[id]={group,ring,barrier};return group;
   }
   character('you','priest');for(const id of ['A','B','C','D'])character(id,'add');character('boss','boss');for(const id of ['raid1','raid2','partner'])character(id,'priest').scale.setScalar(.87);
   const tetherGeo=new T.BufferGeometry().setFromPoints([new T.Vector3(0,0,0),new T.Vector3(0,0,0)]);const tether=new T.Line(tetherGeo,new T.LineDashedMaterial({color:'#b7a4d8',dashSize:.5,gapSize:.3,transparent:true,opacity:.7}));scene.add(tether);
   const rings={};for(const id of ['A','B','C','D','boss']){const ring=mesh(new T.RingGeometry(.98,1,80),new T.MeshBasicMaterial({color:id==='boss'?'#c27b58':'#e0b786',transparent:true,opacity:.16,side:T.DoubleSide,depthWrite:false}),0,.09,0);ring.rotation.x=-Math.PI/2;ring.castShadow=false;rings[id]=ring}
   const patrol=mesh(new T.RingGeometry(10.95,11.04,90),new T.MeshBasicMaterial({color:'#afb8a1',transparent:true,opacity:.22,side:T.DoubleSide,depthWrite:false}),0,.06,-6);patrol.rotation.x=-Math.PI/2;patrol.castShadow=false;
   const castRange=mesh(new T.RingGeometry(19.9,20,90),new T.MeshBasicMaterial({color:'#a6c5cb',transparent:true,opacity:.14,side:T.DoubleSide,depthWrite:false}),0,.08,0);castRange.rotation.x=-Math.PI/2;castRange.castShadow=false;
   // HUD portraits use the same characters as the room.
   const portraits={};
   try{
    const portraitRenderer=new T.WebGLRenderer({antialias:true,alpha:false});portraitRenderer.setSize(128,128);portraitRenderer.outputColorSpace=T.SRGBColorSpace;portraitRenderer.toneMapping=T.ACESFilmicToneMapping;portraitRenderer.toneMappingExposure=1.4;
    const portraitScene=new T.Scene();portraitScene.background=new T.Color('#182039');portraitScene.add(new T.HemisphereLight('#dfd2fb','#333348',3));const faceLight=new T.DirectionalLight('#fff0cf',3);faceLight.position.set(-3,5,5);portraitScene.add(faceLight);
    const portraitCamera=new T.PerspectiveCamera(34,1,.1,20);portraitCamera.position.set(.28,3.15,3.5);portraitCamera.lookAt(0,2.95,0);
    for(const [kind,id] of [['priest','you'],['add','B'],['boss','boss']]){const clone=models[id].group.clone();clone.scale.setScalar(1);clone.rotation.y=-.16;clone.children.filter(o=>o.geometry?.type==='RingGeometry'||o.geometry?.type==='CircleGeometry').forEach(o=>o.visible=false);portraitScene.add(clone);portraitRenderer.render(portraitScene,portraitCamera);portraits[kind]=portraitRenderer.domElement.toDataURL('image/png');portraitScene.remove(clone)}
    portraitRenderer.dispose();
   }catch{ /* The unit frames keep their colored portrait backgrounds. */ }
   let width=1,height=1;
   function setCamera(top){camera=top?mapCamera:followCamera;lastActor=null;mapCamera.position.set(0,85,3);mapCamera.lookAt(target)}
   function updateCamera(){
    if(tactical)return;const actor=controlledActor(),changed=lastActor!==actor.id;if(changed){cameraOrbit=0;lastActor=actor.id}
    const heading=actor.angle+cameraOrbit;
    const desired=new T.Vector3(actor.x-Math.sin(heading)*cameraDistance,ground(actor.z)+Math.max(.6,cameraDistance*Math.tan(cameraPitch)+2),actor.z-Math.cos(heading)*cameraDistance);
    const look=new T.Vector3(actor.x+Math.sin(heading)*2,ground(actor.z)+2.5,actor.z+Math.cos(heading)*2);
    if(changed||rightMouseHeld())camera.position.copy(desired);else camera.position.lerp(desired,1-Math.exp(-14*frameDelta));
    camera.lookAt(look);
   }
   roomView={portraits,pickNpc(x,y){pickPoint.set(x/width*2-1,1-y/height*2);raycaster.setFromCamera(pickPoint,camera);return raycaster.intersectObjects(npcMeshes,false)[0]?.object.userData.npcId||null},bodyBounds(e){
    const box=new T.Box3().setFromObject(models[e.id].group),points=[];
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const v=new T.Vector3(x,y,z).project(camera);if(v.z>=-1&&v.z<=1)points.push({x:(v.x*.5+.5)*width,y:(-v.y*.5+.5)*height})}
    if(!points.length)return null;const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));if(right<0||left>width||bottom<0||top>height)return null;
    const cx=(left+right)/2,cy=(top+bottom)/2,halfWidth=Math.max(27,(right-left)/2),halfHeight=Math.max(32,(bottom-top)/2);return{left:cx-halfWidth,right:cx+halfWidth,top:cy-halfHeight,bottom:cy+halfHeight};
   },resize(w,h){width=w;height=h;renderer.setSize(w,h,false);followCamera.aspect=w/h;followCamera.updateProjectionMatrix();const vertical=35;mapCamera.left=-vertical*w/h;mapCamera.right=vertical*w/h;mapCamera.top=vertical;mapCamera.bottom=-vertical;mapCamera.updateProjectionMatrix()},setCamera,project(e,y=4){const v=new T.Vector3(e.x,ground(e.z)+y,e.z).project(camera);return{x:(v.x*.5+.5)*width,y:(-v.y*.5+.5)*height,visible:v.z>=-1&&v.z<=1&&Math.abs(v.x)<1.15&&Math.abs(v.y)<1.15}},render(){
    for(const e of [state.priest,...state.adds,state.boss,...state.raid]){const m=models[e.id];m.group.position.set(e.x,ground(e.z),e.z);m.group.rotation.y=e.angle||0;m.group.position.y+=e.moving?Math.sin(visualTime*13)*.06:0;m.ring.visible=e.id===state.target||e.id===state.pet||e.id===hoveredNpc||e.id==='you'&&tactical;m.ring.material.color.set(e.id===hoveredNpc&&e.id!==state.target?'#ffe394':e.id===state.pet?'#16ff39':e.id==='you'?'#acd6df':e.controlled?'#16ff39':'#ef3224');m.ring.material.opacity=e.id===hoveredNpc&&e.id!==state.target?.55:.8;m.barrier.visible=e.wall>0;m.barrier.rotation.y=visualTime*.3;if(rings[e.id]&&e.id!=='boss'){const r=rings[e.id],rad=e.soothe>0?10:20;r.position.set(e.x,.1,e.z);r.scale.setScalar(rad);r.visible=guided&&!state.combat;r.material.color.set(e.soothe>0?'#a9cc85':'#cfaa77')}}
    rings.boss.position.set(state.boss.x,.11,state.boss.z);rings.boss.scale.setScalar(22);rings.boss.visible=guided&&!state.combat;patrol.visible=guided&&!state.combat;castRange.visible=guided&&!state.pet;castRange.position.set(state.priest.x,ground(state.priest.z)+.12,state.priest.z);
    tether.visible=!!state.pet||!!state.cast;const endpoint=pet()||state.adds.find(a=>a.id===state.cast?.target);if(endpoint){const pos=tether.geometry.attributes.position;pos.setXYZ(0,state.priest.x,ground(state.priest.z)+2.4,state.priest.z);pos.setXYZ(1,endpoint.x,ground(endpoint.z)+2.2,endpoint.z);pos.needsUpdate=true;tether.computeLineDistances()}
    scene.traverse(o=>{if(o.userData.flame)o.scale.y=1+Math.sin(visualTime*5+o.position.x)*.15});updateCamera();renderer.render(scene,camera);
   }};setCamera(false);
  }catch(e){console.warn('3D unavailable; using tactical canvas.',e.message);dom.room.replaceWith(dom.room.cloneNode());dom.room=$('#room');fallbackCtx=dom.room.getContext('2d');$('#camera-button').hidden=true}
 }
 function fallbackProject(e,y=0){const scale=Math.min(viewWidth/66,viewHeight/71);return{x:viewWidth/2+e.x*scale,y:viewHeight/2+(e.z+1)*scale-y*.8}}
 function drawFallback(){const c=fallbackCtx;c.clearRect(0,0,viewWidth,viewHeight);c.fillStyle='#252c32';c.fillRect(0,0,viewWidth,viewHeight);const sc=Math.min(viewWidth/66,viewHeight/71),center=fallbackProject({x:0,z:-6});c.beginPath();c.arc(center.x,center.y,24.5*sc,0,Math.PI*2);c.fillStyle='#484751';c.fill();c.lineWidth=8;c.strokeStyle='#5d5e6e';c.stroke();c.strokeStyle='#807c6355';for(const r of [6,6.8,11]){c.beginPath();c.arc(center.x,center.y,r*sc,0,Math.PI*2);c.stroke()}for(const x of [-7.1,7.1]){const p=fallbackProject({x,z:18}),q=fallbackProject({x,z:31});c.strokeStyle='#787789';c.lineWidth=sc;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke()}for(const e of [state.priest,...state.adds,state.boss]){const p=fallbackProject(e);if(guided&&!state.combat&&e.id!=='you'){c.beginPath();c.arc(p.x,p.y,(e.id==='boss'?22:e.soothe>0?10:20)*sc,0,Math.PI*2);c.lineWidth=1;c.strokeStyle=e.soothe>0?'#b5ce7950':'#cd967540';c.stroke()}c.beginPath();c.arc(p.x,p.y,(e.id==='boss'?1.7:1.1)*sc,0,Math.PI*2);c.fillStyle=e.id==='you'?'#add4de':e.id==='boss'?'#c97964':'#abb5a0';c.fill();if(e.id===state.target){c.strokeStyle='#decb9a';c.lineWidth=2;c.stroke()}}}
 function drawNameplateAuras(c,auras,x,top,size){
  const gap=5,total=auras.length*size+(auras.length-1)*gap;
  auras.forEach((aura,i)=>{
   const left=x-total/2+i*(size+gap),image=auraImages[aura.id];
   c.fillStyle='#0c0810';c.fillRect(left-2,top-2,size+4,size+4);
   if(image?.complete&&image.naturalWidth)c.drawImage(image,left,top,size,size);
   const elapsed=clamp(1-aura.left/aura.duration,0,1)*Math.PI*2;
   c.save();c.beginPath();c.rect(left,top,size,size);c.clip();c.beginPath();c.moveTo(left+size/2,top+size/2);c.arc(left+size/2,top+size/2,size,-Math.PI/2,-Math.PI/2+elapsed);c.closePath();c.fillStyle='#0008';c.fill();c.restore();
   c.strokeStyle='#b32e2b';c.lineWidth=2;c.strokeRect(left-1,top-1,size+2,size+2);
   c.textAlign='center';c.font='bold 11px Arial';c.strokeStyle='#080609';c.lineWidth=3;c.strokeText(Math.ceil(aura.left),left+size/2,top+size+12);c.fillStyle='#fff7df';c.fillText(Math.ceil(aura.left),left+size/2,top+size+12);
  });
 }
 function drawOverlay(){
  const c=overlayCtx;c.clearRect(0,0,viewWidth,viewHeight);renderPoints=[];
  const projection=(e,y)=>roomView?roomView.project(e,y):{...fallbackProject(e,y),visible:true};
  const actor=controlledActor();
  if(guided){for(const [label,e] of [['ENTRY RAMP',{x:0,z:27}],['TRAINING FLOOR',{x:0,z:-24}]]){const p=projection(e,.15);if(!p.visible)continue;c.font=(tactical?'9':'11')+'px Arial';c.textAlign='center';c.fillStyle='#d3c2e280';c.shadowColor='#000';c.shadowBlur=3;c.fillText(label,p.x,p.y+13);c.shadowBlur=0}}
  for(const e of [...state.adds,state.boss,state.priest,...state.raid]){
   if(e.id==='you'&&!tactical||e.id.startsWith('raid')||e.id==='partner')continue;
   const selected=e.id===state.target,controlled=e.controlled,label=e.id==='you'?'Your priest':e.id==='boss'?'Instructor Razuvious':'Deathknight Understudy '+e.id;
   const pt=projection(e,e.id==='boss'?5.7:4.2);if(!tactical&&distance(actor,e)>43)continue;const body=roomView?roomView.bodyBounds(e):(()=>{const center=projection(e,1.5);return{left:center.x-27,right:center.x+27,top:center.y-32,bottom:center.y+32}})();if(!pt.visible&&!body)continue;
   const auras=targetAuras(e).filter(aura=>aura.debuff),auraSize=tactical?22:27,auraTop=pt.y-auraSize-29,markerY=auras.length?auraTop-17:pt.y-(tactical?21:30);
   const font=tactical?(e.id==='boss'?12:11):(selected?15:13);c.font=(selected?'600 ':'')+font+'px Arial';const width=c.measureText(label).width+16;renderPoints.push({id:e.id,x:pt.x,y:pt.y,width,body,marker:e.id!=='boss'&&e.id!=='you'?{x:pt.x,y:markerY}:null,auras:auras.length?{left:pt.x-(auras.length*(auraSize+5)-5)/2,right:pt.x+(auras.length*(auraSize+5)-5)/2,top:auraTop-2,bottom:auraTop+auraSize+15}:null});if(!pt.visible)continue;
   c.textAlign='center';c.shadowColor='#000';c.shadowBlur=4;c.lineWidth=3;c.strokeStyle='#101014';c.strokeText(label,pt.x,pt.y);c.fillStyle=e.id==='you'?'#c5e5e6':controlled?'#35f14a':'#ed5141';c.fillText(label,pt.x,pt.y);c.shadowBlur=0;
   if(selected){const barWidth=Math.min(width*.7,100);c.fillStyle='#171515bb';c.fillRect(pt.x-barWidth/2,pt.y+5,barWidth,5);c.fillStyle=controlled?'#25c832':'#b7251a';c.fillRect(pt.x-barWidth/2,pt.y+5,barWidth*e.health/100,5)}
   if(auras.length)drawNameplateAuras(c,auras,pt.x,auraTop,auraSize);
   if(e.id!=='boss'&&e.id!=='you'){
    const colors={A:'#d970ee',B:'#ffe54a',C:'#50a9ed',D:'#e97e34'};c.fillStyle=colors[e.id];c.strokeStyle='#f0e3b577';c.lineWidth=1;c.beginPath();
    if(e.id==='A'){c.moveTo(pt.x,markerY-9);c.lineTo(pt.x+7,markerY);c.lineTo(pt.x,markerY+9);c.lineTo(pt.x-7,markerY);c.closePath()}
    else if(e.id==='B'){for(let n=0;n<10;n++){const angle=-Math.PI/2+n*Math.PI/5,r=n%2?4:9;n?c.lineTo(pt.x+Math.cos(angle)*r,markerY+Math.sin(angle)*r):c.moveTo(pt.x+Math.cos(angle)*r,markerY+Math.sin(angle)*r)}c.closePath()}
    else if(e.id==='C')c.rect(pt.x-6,markerY-6,12,12);else c.arc(pt.x,markerY,7,0,Math.PI*2);c.fill();c.stroke();
    if(controlled&&e.id===state.pet&&!tactical){c.font='12px Arial';c.fillStyle='#35f14a';c.fillText("<Your priest's Minion>",pt.x,pt.y+23)}
   }
  }
 }
 function drawMinimap(){
  const canvas=$('#minimap'),c=canvas.getContext('2d');if(canvas.width!==220){canvas.width=canvas.height=220}const scale=2.75*minimapZoom,project=e=>({x:110+e.x*scale,y:98+(e.z+6)*scale});
  c.clearRect(0,0,220,220);c.save();c.beginPath();c.arc(110,110,109,0,Math.PI*2);c.clip();c.fillStyle='#272337';c.fillRect(0,0,220,220);
  const floor=project({x:0,z:-6});c.beginPath();c.arc(floor.x,floor.y,24.5*scale,0,Math.PI*2);c.fillStyle='#4a415c';c.fill();c.strokeStyle='#776a86';c.lineWidth=3;c.stroke();
  c.beginPath();c.arc(floor.x,floor.y,6*scale,0,Math.PI*2);c.fillStyle='#c1a345';c.fill();
  for(const x of [-7.1,7.1]){const a=project({x,z:18}),b=project({x,z:31});c.strokeStyle='#a196b0';c.lineWidth=4;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke()}
  if(guided&&!state.combat){c.beginPath();c.arc(floor.x,floor.y,11*scale,0,Math.PI*2);c.setLineDash([3,3]);c.strokeStyle='#c2aa6e70';c.lineWidth=1;c.stroke();c.setLineDash([])}
  for(const e of [...state.adds,state.boss,...state.raid]){const p=project(e);c.beginPath();c.arc(p.x,p.y,e.id==='boss'?4:2.5,0,Math.PI*2);c.fillStyle=e.id==='boss'?'#ff4231':e.controlled?'#32e758':e.id.startsWith('raid')||e.id==='partner'?'#aaaaff':'#dfb844';c.fill()}
  const actor=controlledActor(),p=project(actor);c.save();c.translate(p.x,p.y);c.rotate(-actor.angle);c.beginPath();c.moveTo(0,8);c.lineTo(-5,-5);c.lineTo(0,-2);c.lineTo(5,-5);c.closePath();c.fillStyle='#fff098';c.shadowColor='#000';c.shadowBlur=3;c.fill();c.restore();c.restore();
 }
 function roundedRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y)}
 function frame(now){const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;frameDelta=dt;visualTime+=dt;update(dt);if(roomView)roomView.render();else if(fallbackCtx)drawFallback();drawOverlay();drawMinimap();if(now-lastUI>70){updateUI();lastUI=now}requestAnimationFrame(frame)}
 saveStats();reset();initRoom();initEvents();resize();requestAnimationFrame(frame);
})();
