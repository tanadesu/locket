import test from 'node:test';
import assert from 'node:assert/strict';
import { MovementTracker } from '../dist/lib/movement.mjs';
import { Charge } from '../dist/lib/charge.mjs';
import { BonusDetector } from '../dist/lib/bonuses.mjs';
import { pose } from './fixtures.mjs';
function play(kind, fps=20) {
  const tracker = new MovementTracker(), charge = new Charge(), bonuses = new BonusDetector();
  const counts = {};
  for(let i=0;i<45*fps;i++) {
    const t=i/fps, p=pose();
    const amplitude = kind==='tiny'? .025 : kind==='arms'? .12 : .23;
    const frequency = kind==='tiny'? 22 : 5;
    for(const [j,phase] of [[15,0],[16,1]]) p[j].y += Math.sin(t*frequency+phase)*amplitude;
    if(kind!=='tiny') for(const [j,phase] of [[13,0],[14,1]]) p[j].y += Math.sin(t*frequency+phase)*amplitude*.6;
    if(kind==='whole') for(const j of [0,11,12,23,24,25,26]) p[j].y += Math.sin(t*5)*([25,26].includes(j)?.05:.085);
    const motion=tracker.update(p,t*1000);
    charge.step(motion,1/fps,t);
    for(const event of bonuses.update(motion,t)) {
      counts[event.key]=(counts[event.key]||0)+1;
      if(event.key==='full') charge.fullUntil=t+3;else charge.add(event.points);
    }
  }
  return {power:Math.floor(charge.power),counts};
}
test('difficulty: fast tiny wrist shaking earns far less than broad arms and whole-body motion',()=>{
 const tiny=play('tiny'), arms=play('arms'), broad=play('broad'), whole=play('whole');
 console.log({tiny,arms,broad,whole});
 assert.ok(tiny.power<1000);assert.equal(tiny.counts.hand,undefined);assert.equal(tiny.counts.full,undefined);
 assert.ok(arms.power>tiny.power*3);assert.ok(arms.power<5000);
 assert.ok(broad.power>arms.power*1.5);assert.ok(whole.power>broad.power);
 assert.ok(broad.power>3000,'upper-body play stays viable without jumping');
});
test('difficulty: scores remain comparable at 15, 20 and 30 pose frames per second',()=>{
 const values=[15,20,30].map(fps=>play('arms',fps).power);
 assert.ok(Math.max(...values)/Math.min(...values)<1.35,values.join(', '));
});
test('difficulty: missing tracking clears recent range instead of carrying an old boost',()=>{
 const tracker=new MovementTracker();tracker.update(pose(),0);const p=pose();p[15].y-=.2;tracker.update(p,50);
 tracker.update(null,100);const first=tracker.update(pose(),150);assert.equal(first.score,0);
 const still=tracker.update(pose(),200);assert.equal(still.ranges[15],0);
});
