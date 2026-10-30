import {VERSION,TIERS,DIMENSIONS,buildForm,grade,exportReport} from './engine.js';
const $=id=>document.getElementById(id);
const KEYS={session:'cognitiva_v2_session',seen:'cognitiva_v2_exposure',history:'cognitiva_v2_history'};
const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let tier='screening',session=safeRead(KEYS.session,null),currentView='home';
function show(name){currentView=name;for(const view of ['home','exam','result'])$(view+'View').classList.toggle('hide',view!==name);window.scrollTo(0,0);}
function persist(){if(session)save(KEYS.session,session);}
function answer(q){return session.answers[q.id]||{};}
function current(){return session.form.items[session.index];}
function toHome(){renderHome();show('home');}
function renderHome(){
 $('dimensionCards').innerHTML=DIMENSIONS.map(d=>`<div class="domain-card"><div class="domain-icon">${d.icon}</div><h3>${esc(d.title)}</h3><p class="muted small">${esc(d.desc)}</p></div>`).join('');
 $('resumeBtn').classList.toggle('hide',!session||Boolean(session.finishedAt));
 const history=safeRead(KEYS.history,[]);
 $('historyList').innerHTML=history.length?history.map(h=>`<div class="history-row"><div><strong>${esc(h.tierName)}</strong><div class="tiny">${esc(new Date(h.date).toLocaleDateString('pt-BR'))}</div></div><span>${h.correct}/${h.total} acertos</span></div>`).join(''):'Nenhuma avaliação concluída neste dispositivo.';
}
function start(fresh){
 if(!fresh&&session&&!session.finishedAt){renderQuestion();show('exam');return;}
 if(fresh&&session&&!session.finishedAt&&Object.keys(session.answers).length&&!confirm('Iniciar outra avaliação substituirá a sessão em andamento. Continuar?'))return;
 const seed=crypto.getRandomValues(new Uint32Array(1))[0];
 const seen=safeRead(KEYS.seen,[]);
 const form=buildForm({tier,seed,seen});
 session={form,index:0,answers:{},startedAt:new Date().toISOString(),finishedAt:null};
 persist();renderQuestion();show('exam');
}
function renderQuestion(){
 const q=current(),a=answer(q),done=session.form.items.filter(x=>Number.isInteger(answer(x).choice)).length;
 $('tierLabel').textContent=`${session.form.items.length} questões`;
 $('questionDimension').textContent=DIMENSIONS.find(d=>d.id===q.domain).title;
 $('topicLabel').textContent=`Contexto: ${q.topic}`;
 $('progressLabel').textContent=`Respondidas: ${done} / ${session.form.items.length}`;
 $('questionNumber').textContent=`Questão ${session.index+1} de ${session.form.items.length}`;
 $('progressFill').style.width=`${done/session.form.items.length*100}%`;
 $('questionTitle').textContent=q.question;
 $('questionContext').textContent=q.context||'';
 $('questionContext').classList.toggle('hide',!q.context);
 $('optionList').innerHTML=q.options.map((text,i)=>`<button class="choice" data-option="${i}" aria-pressed="${a.choice===i}"><span class="choice-key">${'ABCD'[i]}</span><span>${esc(text)}</span></button>`).join('');
 document.querySelectorAll('[data-option]').forEach(btn=>btn.onclick=()=>{session.answers[q.id]={...answer(q),choice:Number(btn.dataset.option)};persist();renderQuestion()});
 $('confidenceInput').value=Number.isFinite(a.confidence)?a.confidence:50;
 $('confidenceText').textContent=Number.isFinite(a.confidence)?`${a.confidence}%`:'Não informada';
 $('notes').value=a.reasoning||'';
 $('prevBtn').disabled=session.index===0;
 $('nextBtn').textContent=session.index===session.form.items.length-1?'Concluir →':'Próxima →';
}
function move(by){session.index=Math.max(0,Math.min(session.form.items.length-1,session.index+by));persist();renderQuestion();}
function finalize(){if(session.finishedAt)return;
 const count=session.form.items.filter(q=>Number.isInteger(answer(q).choice)).length;
 if(count<session.form.items.length&&!confirm(`Você respondeu ${count} de ${session.form.items.length} questões. Concluir mesmo assim?`))return;
 session.finishedAt=new Date().toISOString();persist();
 const stats=grade(session.form,session.answers),history=safeRead(KEYS.history,[]);
 history.unshift({date:session.finishedAt,tier:session.form.tier,tierName:{screening:'Exploratória',standard:'Intermediária',deep:'Aprofundada'}[session.form.tier],total:session.form.items.length,correct:stats.correct});
 save(KEYS.history,history.slice(0,20));
 save(KEYS.seen,[...new Set([...safeRead(KEYS.seen,[]),...session.form.items.map(i=>i.id)])].slice(-10000));
 renderResults();show('result');
}
function result(){return exportReport(session.form,session.answers,session.startedAt,session.finishedAt);}
function download(text,name,type='application/json'){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const el=document.createElement('a');el.href=url;el.download=name;el.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
function prompt(){return `Analise este resultado exploratório do Cognitiva. É uma bateria NÃO padronizada, sem comparações populacionais ou estimativa de QI. Use apenas os dados fornecidos; não infira diagnósticos, percentis nem superioridade intelectual. Identifique padrões observados, explique calibração e limitações do banco (famílias paramétricas podem se repetir), compare confiança e acertos e proponha exercícios. Se as justificativas contradisserem a escolha, sinalize a ambiguidade.\n\n${JSON.stringify(result(),null,2)}`;}
function renderResults(){const score=grade(session.form,session.answers),total=session.form.items.length;
 $('resultScore').textContent=`${score.correct}/${total}`;
 $('statGrid').innerHTML=[['Acertos',`${score.correct}/${total}`],['Precisão',score.accuracy===null?'—':`${Math.round(score.accuracy*100)}%`],['Confiança média',score.meanConfidence===null?'—':`${Math.round(score.meanConfidence)}%`],['Brier',score.brier===null?'—':score.brier.toFixed(3)]].map(([name,val])=>`<div class="results-stat"><strong>${val}</strong><span class="muted small">${name}</span></div>`).join('');
 $('domainGraph').innerHTML=score.byDomain.map(d=>`<div class="dimension-item"><div class="info-line"><strong class="small">${esc(d.title)}</strong><span class="small">${d.correct}/${d.total}</span></div><div class="dimension-bar"><div class="dimension-fill" style="width:${d.correct/d.total*100}%"></div></div></div>`).join('');
 $('confidenceSummary').innerHTML=`<p class="small">${score.meanConfidence===null?'Você não registrou confiança.':`Confiança média de ${Math.round(score.meanConfidence)}%. A diferença para a taxa de acertos foi de ${Math.round(score.confidenceGap)} pontos percentuais.`}</p><p class="small">${score.brier===null?'O Brier Score não pôde ser calculado.':`Brier Score: ${score.brier.toFixed(3)} (menor é melhor, nesta amostra).`}</p>`;
 $('reviewList').innerHTML=score.entries.map((e,i)=>`<details><summary>${String(i+1).padStart(2,'0')} · ${esc(e.question)} — ${e.selected===null?'Não respondida':e.correct?'Correta':'Incorreta'}</summary><p><strong>Contexto:</strong> ${esc(e.context)}</p><p><strong>Resposta:</strong> ${e.selected===null?'—':esc(e.options[e.selected])}</p><p><strong>Correta:</strong> ${esc(e.options[e.answer])}</p><p><strong>Explicação:</strong> ${esc(e.explanation)}</p>${e.reasoning?`<p><strong>Seu raciocínio:</strong> ${esc(e.reasoning)}</p>`:''}</details>`).join('');
}
async function analyze(){const btn=$('apiBtn');btn.disabled=true;$('apiStatus').textContent='Solicitando análise. Nenhum dado é enviado sem esta ação.';try{const resp=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({results:result()})});const body=await resp.json();if(!resp.ok)throw Error(body.error||'API indisponível');$('aiResult').textContent=body.analysis;$('aiResult').classList.remove('hide');$('apiStatus').textContent='Análise interpretativa concluída. Não é avaliação clínica.';}catch(e){ $('apiStatus').textContent=`Indisponível: ${e.message}. Use Copiar análise para ChatGPT.`;}finally{btn.disabled=false;}}
$('homeLink').onclick=e=>{e.preventDefault();toHome()};
$('startBtn').onclick=()=>start(true);$('resumeBtn').onclick=()=>start(false);
document.querySelectorAll('[data-tier]').forEach(btn=>btn.onclick=()=>{tier=btn.dataset.tier;document.querySelectorAll('[data-tier]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)))});
$('confidenceInput').oninput=e=>{const q=current();session.answers[q.id]={...answer(q),confidence:Number(e.target.value)};$('confidenceText').textContent=`${e.target.value}%`;persist()};
$('notes').oninput=e=>{const q=current();session.answers[q.id]={...answer(q),reasoning:e.target.value};persist()};
$('prevBtn').onclick=()=>move(-1);$('nextBtn').onclick=()=>session.index===session.form.items.length-1?finalize():move(1);
$('finishBtn').onclick=finalize;$('pauseBtn').onclick=toHome;
$('downloadBtn').onclick=()=>download(JSON.stringify(result(),null,2),`cognitiva_${session.form.tier}_${Date.now()}.json`);
$('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText(prompt());alert('Relatório copiado. Cole em uma conversa com o ChatGPT.')}catch{download(prompt(),'cognitiva_prompt.txt','text/plain')}};
$('apiBtn').onclick=analyze;$('againBtn').onclick=()=>{session=null;localStorage.removeItem(KEYS.session);toHome()};
$('privacyBtn').onclick=()=>alert('Os resultados e as questões vistas ficam neste navegador (localStorage). Nenhum resultado é enviado automaticamente. A análise via API só envia dados quando você confirma pelo botão. Para remover dados, use Apagar meus dados.');
$('deleteBtn').onclick=()=>{if(!confirm('Apagar histórico e avaliação local deste navegador?'))return;Object.values(KEYS).forEach(k=>localStorage.removeItem(k));session=null;renderHome();};
renderHome();if(session?.finishedAt){renderResults();show('result')}
window.__COGNITIVA_V2__={buildForm,grade,version:VERSION};
