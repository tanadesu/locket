import test from 'node:test';
import assert from 'node:assert/strict';
import { MovementTracker } from '../dist/lib/movement.mjs';
import { BonusDetector } from '../dist/lib/bonuses.mjs';
import { Charge } from '../dist/lib/charge.mjs';
import { pose, shifted } from './fixtures.mjs';

function squatSequence(ankles = true, depth = .075) {
  const tracker = new MovementTracker(), detector = new BonusDetector();
  const charge = new Charge(), events = []; let rejected = 0;
  for (let i = 0; i < 240; i++) {
    const time = i * .05, p = pose();
    const shift = depth * (1 - Math.cos(time * Math.PI)) / 2;
    for(const j of [0,11,12,13,14,15,16,23,24,25,26]) p[j].y += shift * ([25,26].includes(j) ? .3 : 1);
    if (!ankles) { p[27].visibility = 0; p[28].visibility = 0; }
    const motion=tracker.update(p, time*1000);
    if(motion.cameraShift)rejected++;
    charge.step(motion,.05,time);
    for(const event of detector.update(motion,time)) { events.push(event);charge.applyBonus(event,time); }
  }
  return {events,charge,rejected};
}
test('squat: real movement pipeline recognizes repeated squats with feet or just knees visible',()=>{
  for(const ankles of [true,false]) {
    const result=squatSequence(ankles);
    assert.ok(result.events.filter(e=>e.key==='squat').length>=4,JSON.stringify(result.events));
    assert.ok(result.charge.power>1000);
    assert.equal(result.rejected,0);
  }
});
test('squat: shallow bobbing does not trigger; planted feet are not camera shake',()=>{
  assert.equal(squatSequence(true,.015).events.filter(e=>e.key==='squat').length,0);
  const tracker = new MovementTracker();tracker.update(pose(),0);
  const shiftedPose=shifted(pose(),.025,.025);assert.equal(tracker.update(shiftedPose,50).cameraShift,true);
});
test('speed: sustained fast arm motion boosts, but tiny wrist shaking does not',()=>{
  const detector = new BonusDetector();let events=[];
  const motion={valid:true,dt:.05,scale:.25,hipY:.55,shoulderY:.3,headY:.14,ankleY:.9,
    speeds:{15:2,13:1},ranges:{15:.5,13:.2}};
  for(let i=0;i<20;i++)events.push(...detector.update(motion,i*.05));
  const speed=events.filter(e=>e.key==='speed');assert.equal(speed.length,1);assert.equal(speed[0].points,100);
  detector.reset();events=[];
  for(let i=0;i<20;i++)events.push(...detector.update({...motion,speeds:{15:4},ranges:{15:.1}},i*.05));
  assert.equal(events.length,0);
});
test('boost: immediate points, timed multiplier, no multiplying boosts together, no points while still',()=>{
 const charge=new Charge();charge.applyBonus({key:'squat',label:'SQUAT BOOST',points:220,multiplier:1.6,duration:3},5);
 assert.equal(charge.power,220);assert.equal(charge.getBoost(6).multiplier,1.6);
 charge.applyBonus({key:'speed',label:'SPEED BOOST',points:100,multiplier:1.4,duration:2},7);
 assert.equal(charge.getBoost(7.5).multiplier,1.6);assert.equal(charge.getBoost(8.5).multiplier,1.4);assert.equal(charge.getBoost(9).multiplier,1);
 charge.step({valid:false},1,7);assert.equal(charge.power,320);charge.reset();assert.equal(charge.getBoost(0).multiplier,1);
});
