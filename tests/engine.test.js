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
test('gap usa só respostas com confiança e mantém acurácia global separada',()=>{
 const form=buildForm({seed:4});const [q1,q2,q3]=form.items;
 const s=grade(form,{[q1.id]:{choice:q1.answer,confidence:80},[q2.id]:{choice:(q2.answer+1)%4,confidence:40},[q3.id]:{choice:(q3.answer+1)%4}});
 assert.equal(s.answered,3);assert.equal(s.correct,1);assert.ok(Math.abs(s.accuracy-1/3)<1e-10);
 assert.equal(s.meanConfidence,60);assert.equal(s.confidenceGap,10);
});
test('sem confiança marcada o gap é null, com ou sem respostas',()=>{
 const form=buildForm({seed:4});const [q1,q2]=form.items;
 const vazio=grade(form,{});assert.equal(vazio.meanConfidence,null);assert.equal(vazio.confidenceGap,null);
 const semConf=grade(form,{[q1.id]:{choice:q1.answer},[q2.id]:{choice:(q2.answer+1)%4}});
 assert.equal(semConf.answered,2);assert.equal(semConf.meanConfidence,null);assert.equal(semConf.confidenceGap,null);
});
test('confiança sem escolha marcada não entra na amostra do gap',()=>{
 const form=buildForm({seed:4});const [q1,q2]=form.items;
 const s=grade(form,{[q1.id]:{confidence:90},[q2.id]:{choice:q2.answer,confidence:50}});
 assert.equal(s.answered,1);assert.equal(s.meanConfidence,50);assert.equal(s.confidenceGap,-50);
});
test('com confiança em todas as respostas o gap é o anterior',()=>{
 const form=buildForm({seed:4});const answers={};
 form.items.forEach((q,i)=>answers[q.id]={choice:i%3?q.answer:(q.answer+1)%4,confidence:40+i*3});
 const s=grade(form,answers);
 assert.equal(s.answered,form.items.length);
 assert.ok(Math.abs(s.confidenceGap-(s.meanConfidence-100*s.accuracy))<1e-10);
});
test('gap corrigido não altera acurácia, Brier nem dimensões e vai para a exportação',()=>{
 const form=buildForm({seed:4});const [q1,q2]=form.items;
 const answers={[q1.id]:{choice:q1.answer,confidence:100},[q2.id]:{choice:(q2.answer+1)%4}};
 const s=grade(form,answers);const report=exportReport(form,answers,'2026-10-30T12:00:00Z','2026-10-30T12:10:00Z');
 assert.equal(s.confidenceGap,0);assert.equal(report.summary.confidenceAccuracyGapPoints,s.confidenceGap);
 assert.equal(report.summary.accuracy,s.accuracy);assert.equal(report.summary.brierScore,s.brier);
 assert.deepEqual(report.summary.byDomain,s.byDomain);
});
