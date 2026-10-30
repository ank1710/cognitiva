import test from 'node:test';
import assert from 'node:assert/strict';
import {buildForm,grade,TIERS,DIMENSIONS,generateItem,FAMILIES,exportReport} from '../src/engine.js';

test('tiers 20 / 60 / 120, balanceados entre cinco dimensões',()=>{
 for(const [tier,n] of Object.entries(TIERS)){
  const form=buildForm({tier,seed:1959});assert.equal(form.items.length,n);
  for(const dim of DIMENSIONS)assert.equal(form.items.filter(q=>q.domain===dim.id).length,n/5);
 }
});
test('variedade determinística: mesma semente dá mesma prova; outra semente varia',()=>{
 const a=buildForm({tier:'standard',seed:2026});const b=buildForm({tier:'standard',seed:2026});const c=buildForm({tier:'standard',seed:2027});
 assert.deepEqual(a.items,b.items);assert.notDeepEqual(a.items,c.items);
});
test('nenhuma prova tem IDs duplicados ou opções repetidas',()=>{
 for(const [tier,n] of Object.entries(TIERS))for(let seed=1;seed<=80;seed++){
  const form=buildForm({tier,seed});assert.equal(new Set(form.items.map(q=>q.id)).size,n);
  for(const q of form.items){assert.equal(q.options.length,4);assert.equal(new Set(q.options).size,4);assert.ok(q.answer>=0&&q.answer<4);assert.ok(q.explanation?.length>5);}
 }
});
test('nenhuma questão depende do contexto profissional do usuário original',()=>{
 for(const d of DIMENSIONS)for(const t of FAMILIES[d.id])for(let seed=1;seed<=30;seed++){
  const q=generateItem(t,seed);assert.doesNotMatch(q.question+' '+q.context,/MuleSoft|GitHub|BMW|Salesforce|Playwright|API Gateway|k6|endpoint/i);
 }
});
test('correção local e Brier não tratam resposta não marcada como erro calibrado',()=>{
 const form=buildForm({seed:4});const [q1,q2]=form.items;
 const answers={[q1.id]:{choice:q1.answer,confidence:90},[q2.id]:{choice:(q2.answer+1)%4,confidence:30}};
 const s=grade(form,answers);assert.equal(s.correct,1);assert.equal(s.answered,2);assert.ok(Math.abs(s.brier-0.05)<1e-10);
 const exportData=exportReport(form,answers,'2026-10-30T12:00:00Z','2026-10-30T12:10:00Z');assert.equal(exportData.responses.length,20);assert.equal(exportData.summary.answered,2);
});
test('histórico de exposição reduz repetição em novas provas',()=>{
 const first=buildForm({tier:'screening',seed:10});const seen=first.items.map(x=>x.id);
 const second=buildForm({tier:'screening',seed:11,seen});
 assert.equal(second.items.filter(q=>seen.includes(q.id)).length,0);
});
