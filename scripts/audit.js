import {buildForm,TIERS,DIMENSIONS,FAMILIES,generateItem,grade} from '../src/engine.js';
let passed=0;
const topicCounts={};const fingerprints=new Set();
for(const tier of Object.keys(TIERS)){
 for(let seed=1;seed<=300;seed++){
  const form=buildForm({tier,seed});
  if(new Set(form.items.map(q=>q.id)).size!==form.items.length)throw Error(`Duplicidade no formulário ${tier}/${seed}`);
  for(const q of form.items){
   if(!topicCounts[q.topic])topicCounts[q.topic]=0;topicCounts[q.topic]++;
   fingerprints.add(q.id);
   if(q.options.filter(x=>x===q.options[q.answer]).length!==1)throw Error(`Gabarito ambíguo ${q.templateId}`);
  }
  const result=grade(form,{});if(result.correct!==0||result.answered!==0)throw Error('Pontuação incoerente');
  passed++;
 }
}
console.log(JSON.stringify({formsChecked:passed,distinctItemsGenerated:fingerprints.size,topics:topicCounts,templates:Object.values(FAMILIES).reduce((n,a)=>n+a.length,0),notice:'A auditoria verifica invariantes programáticos, não validade psicométrica ou equivalência de dificuldade.'},null,2));
