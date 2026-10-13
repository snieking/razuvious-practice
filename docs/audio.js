const clips = {
 taught: {file:'taught', text:'Do as I taught you!'},
 mercy: {file:'mercy', text:'Show them no mercy!'},
 warmed: {file:'warmed', text:"Hah hah, I'm just getting warmed up!"},
 stand: {file:'stand', text:'Stand and fight!'},
 show: {file:'show', text:"Show me what you've got!"},
 disappoint: {file:'disappoint', text:'You disappoint me, students!'},
 death: {file:'death', text:'An honorable... death.'}
};

// One voice at a time. Loading and playback require an explicit sound opt-in.
export class BossVoice {
 constructor(player, onCaption, onError) {
  this.player=player;this.onCaption=onCaption;this.onError=onError;
  this.enabled=false;this.paused=false;this.active=null;this.queue=[];this.revision=0;
  player.muted=true;player.preload='none';player.volume=.75;
  player.addEventListener('ended',()=>{
   if(!player.ended)return;
   this.active=null;this.next();
  });
  player.addEventListener('error',()=>{
   if(this.enabled&&this.active)this.unavailable();
  });
 }
 setEnabled(enabled) {
  this.stop();this.enabled=enabled;this.player.muted=!enabled;
  if(!enabled)return;
  // Unlock this media element inside the click gesture, without an audible quote.
  const revision=++this.revision;
  this.player.src='assets/audio/razuvious-taught.mp3';this.player.muted=true;
  this.play(revision,()=>{
   this.player.pause();this.player.currentTime=0;this.player.muted=false;
  });
 }
 say(id, {interrupt=false}={}) {
  const clip=clips[id];if(!clip)return;
  this.onCaption(clip.text);
  if(!this.enabled)return;
  if(interrupt)this.stop();
  if(this.active||this.paused) {
   if(this.active!==id&&!this.queue.includes(id))this.queue.push(id);
   if(this.queue.length>2)this.queue.shift();
   return;
  }
  this.begin(id);
 }
 begin(id) {
  const revision=++this.revision;
  this.active=id;this.player.pause();this.player.muted=false;
  this.player.src='assets/audio/razuvious-'+clips[id].file+'.mp3';
  this.player.currentTime=0;this.play(revision);
 }
 play(revision, onStarted) {
  try {
   Promise.resolve(this.player.play()).then(()=>{
    if(revision===this.revision)onStarted?.();
   }).catch(error=>{
    if(revision===this.revision&&error.name!=='AbortError')this.unavailable();
   });
  } catch {if(revision===this.revision)this.unavailable();}
 }
 next() {
  if(this.enabled&&!this.paused&&this.queue.length)this.begin(this.queue.shift());
 }
 pause() {
  this.paused=true;++this.revision;this.player.pause();
 }
 resume() {
  this.paused=false;
  if(this.enabled&&this.active){this.player.muted=false;this.play(++this.revision)}
  else this.next();
 }
 stop() {
  ++this.revision;this.player.pause();this.player.currentTime=0;
  this.active=null;this.queue=[];this.paused=false;
 }
 unavailable() {
  this.enabled=false;this.player.muted=true;this.stop();this.onError?.();
 }
}

const spellFiles={cast:'shadow-precast',release:'shadow-cast',soothe:'mind-soothe',wall:'shield-wall',taunt:'taunt'};

// Spell effects use separate tracks so a cast, its impact and a boss yell can overlap.
export class SpellSounds {
 constructor(players,onError) {
  this.enabled=false;this.paused=false;this.onError=onError;
  this.tracks=Object.fromEntries(Object.entries(spellFiles).map(([id,file])=>{
   const player=players[id],track={player,file,active:false,revision:0};
   player.muted=true;player.preload='none';player.volume=.55;
   player.addEventListener('ended',()=>{if(player.ended)track.active=false});
   player.addEventListener('error',()=>{if(this.enabled&&track.active)this.unavailable()});
   return [id,track];
  }));
 }
 setEnabled(enabled) {
  this.stop();this.enabled=enabled;
  for(const track of Object.values(this.tracks)) {
   const {player,file}=track;player.muted=!enabled;
   if(!enabled)continue;
   // Unlock every effect inside the same opt-in gesture, silently.
   player.src='assets/audio/spell-'+file+'.mp3';player.muted=true;
   this.requestPlay(track,()=>{player.pause();player.currentTime=0;player.muted=false});
  }
 }
 play(id,{loop=false}={}) {
  if(!this.enabled||this.paused)return;
  const track=this.tracks[id];if(!track)return;
  const {player,file}=track;
  player.pause();player.src='assets/audio/spell-'+file+'.mp3';player.currentTime=0;
  player.muted=false;player.loop=loop;track.active=true;this.requestPlay(track);
 }
 requestPlay(track,onStarted) {
  const revision=++track.revision;
  try {
   Promise.resolve(track.player.play()).then(()=>{
    if(revision===track.revision)onStarted?.();
   }).catch(error=>{
    if(revision===track.revision&&error.name!=='AbortError')this.unavailable();
   });
  } catch {if(revision===track.revision)this.unavailable();}
 }
 stop(id) {
  const tracks=id?[this.tracks[id]].filter(Boolean):Object.values(this.tracks);
  for(const track of tracks){++track.revision;track.player.pause();track.player.currentTime=0;track.player.loop=false;track.active=false}
  if(!id)this.paused=false;
 }
 pause() {
  this.paused=true;
  for(const track of Object.values(this.tracks)){++track.revision;track.player.pause()}
 }
 resume() {
  this.paused=false;
  if(this.enabled)for(const track of Object.values(this.tracks))if(track.active&&!track.player.ended){track.player.muted=false;this.requestPlay(track)}
 }
 unavailable() {
  this.setEnabled(false);this.onError?.();
 }
}
