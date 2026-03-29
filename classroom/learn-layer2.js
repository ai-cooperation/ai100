// ═══════════════════════════════════════════════════════
//  LAYER 2: ADAPTIVE PRACTICE + SIMULATED EXAM
//  Loaded by learn.html after main script
// ═══════════════════════════════════════════════════════

// ─── Dual-Key Architecture ───
// Groq: fast question generation (Llama 4 Scout, <3s for 10 questions)
// Gemini: AI追問 (quality Socratic dialogue, existing callGemini)
// ─── Token Usage Tracking ───
let tokenUsage = { groq_in:0, groq_out:0, gemini_in:0, gemini_out:0, calls:0 };

function updateTokenDisplay(){
  let el = document.getElementById('tokenStats');
  if(!el){
    el = document.createElement('div');
    el.id = 'tokenStats';
    el.style.cssText = 'position:fixed;top:2.5rem;left:.5rem;font-size:.65rem;color:#9AA0A6;z-index:99;pointer-events:none;';
    document.body.appendChild(el);
  }
  const totalIn = tokenUsage.groq_in + tokenUsage.gemini_in;
  const totalOut = tokenUsage.groq_out + tokenUsage.gemini_out;
  el.textContent = `API ${tokenUsage.calls} | ${(totalIn/1000).toFixed(1)}K↑ ${(totalOut/1000).toFixed(1)}K↓`;
}

// API keys now stored server-side in Cloudflare Worker
// LEARN_API_PROXY is defined in learn.html

async function callGroq(prompt, maxTokens){
  const models = ['meta-llama/llama-4-scout-17b-16e-instruct','qwen/qwen3-32b'];
  for(const model of models){
    try {
      const res = await fetch(`${LEARN_API_PROXY}/api/groq`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model, messages:[{role:'user',content:prompt}], max_tokens:maxTokens||4096, temperature:0.7})
      });
      if(res.status === 429) continue;
      if(!res.ok) continue;
      const data = await res.json();
      const u = data.usage || {};
      tokenUsage.groq_in += u.prompt_tokens || 0;
      tokenUsage.groq_out += u.completion_tokens || 0;
      tokenUsage.calls++;
      updateTokenDisplay();
      return data.choices?.[0]?.message?.content || '';
    } catch(e){ continue; }
  }
  // Fallback to Gemini if Groq fails
  return callGemini(prompt);
}

// ─── Question Cache (Firebase) ───
// AI-generated questions stored in Firebase, reused for students with same weak spots
function cacheQuestions(moduleId, level, questions){
  try {
    if(typeof firebase === 'undefined') return;
    questions.forEach(q => {
      if(!q.id || !q.stem) return;
      firebase.database().ref(`learn/question_pool/${moduleId}/${q.id}`).set({
        stem: q.stem,
        options: q.options,
        correct: q.correct,
        explanation: q.explanation || '',
        model: q.model || '',
        level: level,
        source: 'ai_generated',
        created: firebase.database.ServerValue.TIMESTAMP
      });
    });
  } catch(e){ /* silent */ }
}

async function loadCachedQuestions(moduleId, targetFws, level, limit){
  try {
    if(typeof firebase === 'undefined') return [];
    const snap = await firebase.database().ref(`learn/question_pool/${moduleId}`)
      .orderByChild('level').equalTo(level).limitToFirst(limit||20).once('value');
    const cached = [];
    snap.forEach(child => {
      const q = child.val();
      if(q && q.stem){
        cached.push({...q, id:'CACHE-'+child.key, source:'cached'});
      }
    });
    // Shuffle
    for(let i=cached.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [cached[i],cached[j]]=[cached[j],cached[i]];
    }
    return cached.slice(0, limit||10);
  } catch(e){ return []; }
}

// ─── Layer 2 State ───
let l2 = {
  level: 1,           // 1-4 difficulty
  questions: [],       // AI-generated + pool
  currentQ: 0,
  answers: {},
  scores: {},
  correctStreak: 0,    // consecutive corrects → level up
  wrongInLevel: 0,     // wrongs in current level → stay
  targetFws: [],       // weak frameworks to practice
  totalGenerated: 0
};

// ─── Entry point: called from Final Report ───
function goLayer2(){
  showScreen('screenLayer2');
  l2 = {level:1,questions:[],currentQ:0,answers:{},scores:{},correctStreak:0,wrongInLevel:0,targetFws:[...state.weakFws],totalGenerated:0};

  const mod = MODULES[state.moduleId];
  if(!mod) return;

  // Determine target frameworks
  if(l2.targetFws.length === 0){
    // All strong → practice all at higher difficulty
    l2.level = 2;
    l2.targetFws = mod.frameworks.map(f=>f.id);
  }

  const fwNames = l2.targetFws.map(fid => mod.frameworks.find(f=>f.id===fid)?.name).filter(Boolean);
  document.getElementById('l2subtitle').textContent = `聚焦：${fwNames.join('、')}`;
  document.getElementById('l2Info').innerHTML = `
    <strong>Level ${l2.level} — ${['基礎概念','雙概念混合','企業情境','陷阱題'][l2.level-1]}</strong><br>
    AI 會根據你的弱項動態出題。連續答對 3 題升級難度，累計 10 題後可進入模擬考。
  `;
  renderL2Level();
  generateL2Questions();
}

function renderL2Level(){
  const labels = ['Level 1 基礎','Level 2 混合','Level 3 情境','Level 4 陷阱'];
  document.getElementById('l2LevelBar').innerHTML = `
    <div style="display:flex;gap:4px;margin-bottom:.5rem;">
      ${labels.map((lb,i) => `<div style="flex:1;height:6px;border-radius:3px;background:${i<l2.level?'var(--blue)':'var(--g200)'};"></div>`).join('')}
    </div>
    <div style="font-size:.85rem;color:var(--g600);text-align:center;">${labels[l2.level-1]} | 已答 ${Object.keys(l2.answers).length} 題 | 連續正確 ${l2.correctStreak}</div>
  `;
}

async function generateL2Questions(silent){
  const area = document.getElementById('l2QuizArea');
  if(!silent) area.innerHTML = '<div class="info purple" style="text-align:center;"><strong>AI 正在出題...</strong></div>';

  const mod = MODULES[state.moduleId];

  // Step 1: Try loading cached questions from Firebase first
  const cached = await loadCachedQuestions(state.moduleId, l2.targetFws, l2.level, 3);
  if(cached.length > 0){
    cached.forEach(q => {
      q.diagnosis = q.diagnosis || Object.fromEntries(
        (q.options||[]).filter(o=>o.key!==q.correct).map(o=>[o.key,{gap:q.explanation||'',followup:'想想正確答案考慮了什麼？'}])
      );
    });
    l2.questions.push(...cached);
  }

  // Step 2: Generate new questions via Groq (fast) to fill the rest
  const needed = 5 - cached.length;
  if(needed <= 0){
    if(!silent) renderL2Question();
    return;
  }

  const fwInfo = l2.targetFws.map(fid => {
    const fw = mod.frameworks.find(f=>f.id===fid);
    const wrongQs = mod.questions.filter(q => q.model===fid && state.phase3.answers[q.id]!==q.correct);
    const gaps = wrongQs.map(q => state.phase3.answers[q.id] ? q.diagnosis[state.phase3.answers[q.id]]?.gap : '').filter(Boolean);
    return `心智模型「${fw?.name}」：${fw?.desc}\n學生盲區：${gaps.join('；') || '需確認深度'}`;
  }).join('\n\n');

  const levelDesc = [
    '單一概念情境題，測試基本理解。四選一，一個正確答案。',
    '雙概念混合題，同時涉及兩個心智模型。需要整合思考。',
    '企業實務情境題，模擬真實 iPAS 考試風格（跨領域：技術+法規+導入）。選項要「每個都看起來合理」。',
    '陷阱題，選項差異微妙。測試概念精確度。可用「下列何者錯誤」格式。'
  ][l2.level-1];

  const prompt = `你是 iPAS AI 應用規劃師考試出題引擎。

學生資料：
${fwInfo}

難度等級：Level ${l2.level} — ${levelDesc}

考試方向（2026 iPAS 趨勢）：
- 情境判斷題為主，不考純記憶
- 跨領域混合（技術 + 法規 + 導入）
- AI 基本法七大原則是新考點
- Agentic AI / MCP / RAG 是科二重點

請生成 ${needed} 題繁體中文選擇題。每題需要有企業實務場景。

【選項撰寫規則 — 嚴格遵守】
1. 每個選項固定 35-50 字，四個選項字數必須幾乎相同
2. 四個選項都必須包含「理由」，格式統一為「做法＋因為/因此＋理由」
3. 錯誤選項的理由要寫得有說服力，是常見的合理誤解，不能一看就知道是錯的
4. 正確答案不可以是唯一有解釋的選項
5. 先寫好四個等長選項，最後才決定哪個是正確答案

回傳格式（純 JSON，不要 markdown code block）：
[{"stem":"題目","options":[{"key":"A","text":"選項"},{"key":"B","text":"選項"},{"key":"C","text":"選項"},{"key":"D","text":"選項"}],"correct":"C","explanation":"30字解析"}]`;

  try {
    const text = await callGroq(prompt);
    const cleaned = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const aiQs = JSON.parse(cleaned);
    const newQs = aiQs.map((q,i) => ({
      ...q,
      id: `L2-${l2.totalGenerated + i + 1}`,
      model: l2.targetFws[i % l2.targetFws.length] || l2.targetFws[0],
      source: 'groq',
      diagnosis: Object.fromEntries(
        q.options.filter(o=>o.key!==q.correct).map(o=>[o.key,{
          gap: q.explanation || '思考這個選項的局限性',
          followup: '想想看，正確答案考慮了什麼你沒注意到的維度？'
        }])
      )
    }));
    l2.totalGenerated += newQs.length;
    l2.questions.push(...newQs);
    // Cache new questions to Firebase for reuse
    cacheQuestions(state.moduleId, l2.level, newQs);
    if(!silent) renderL2Question();
  } catch(e){
    if(!silent) area.innerHTML = `<div class="info red">出題失敗，請稍後重試。<br><button class="btn btn-secondary" style="margin-top:.5rem;" onclick="generateL2Questions()">重試</button></div>`;
  }
}

let _l2Generating = false; // prevent concurrent generation

function renderL2Question(){
  const area = document.getElementById('l2QuizArea');

  // Prefetch: when 2 questions left in buffer, generate more in background
  const remaining = l2.questions.length - l2.currentQ;
  if(remaining <= 2 && !_l2Generating && Object.keys(l2.answers).length < 30){
    _l2Generating = true;
    generateL2Questions(true).finally(()=>{ _l2Generating = false; });
  }

  if(l2.currentQ >= l2.questions.length){
    // Need more questions
    if(Object.keys(l2.answers).length >= 10){
      area.innerHTML = `
        <div class="info green" style="text-align:center;">
          <strong>Layer 2 練習完成！</strong><br>
          已答 ${Object.keys(l2.answers).length} 題，最高達到 Level ${l2.level}<br>
          <button class="btn btn-primary" style="margin-top:1rem;" onclick="goExam()">進入模擬考 →</button>
          <button class="btn btn-secondary" style="margin-top:.5rem;" onclick="generateL2Questions()">繼續練習</button>
        </div>`;
    } else {
      generateL2Questions();
    }
    return;
  }

  const q = l2.questions[l2.currentQ];
  const mod = MODULES[state.moduleId];
  const fw = mod?.frameworks?.find(f=>f.id===q.model);
  const answered = Object.keys(l2.answers).length;

  area.innerHTML = `
    <div class="fade-in">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">
        <span style="font-size:.85rem;color:var(--g600);">第 ${answered+1} 題 ${fw ? '| '+fw.name : ''}</span>
        <span style="font-size:.8rem;padding:.2rem .6rem;border-radius:8px;background:var(--blue-lt);color:var(--blue);font-weight:700;">Level ${l2.level}</span>
      </div>
      <div class="quiz-stem">${q.stem}</div>
      <div id="l2Opts-${q.id}">
        ${q.options.map(o => `
          <button class="option-btn" onclick="answerL2('${q.id}','${o.key}')">
            <span class="opt-label">${o.key}</span>${o.text}
          </button>
        `).join('')}
      </div>
      <div id="l2Fb-${q.id}" style="margin-top:1rem;"></div>
    </div>
  `;

  // Update progress
  document.getElementById('l2Progress').innerHTML = `
    <span class="dim" style="font-size:.85rem;">答對率：${calcL2Accuracy()}% | 目標：10 題以上可進入模擬考</span>
  `;
}

function answerL2(qid, chosen){
  const q = l2.questions.find(x=>x.id===qid);
  if(!q || l2.answers[qid]) return;
  const isCorrect = chosen === q.correct;

  // Lock options
  document.querySelectorAll(`#l2Opts-${qid} .option-btn`).forEach(b=>b.classList.add('locked'));
  document.querySelector(`#l2Opts-${qid} .option-btn:nth-child(${['A','B','C','D'].indexOf(q.correct)+1})`).classList.add('correct');
  if(!isCorrect) document.querySelector(`#l2Opts-${qid} .option-btn:nth-child(${['A','B','C','D'].indexOf(chosen)+1})`).classList.add('wrong');

  l2.answers[qid] = chosen;
  l2.scores[qid] = q.options.find(o=>o.key===chosen)?.depth || 1;

  // Difficulty adaptation
  if(isCorrect){
    l2.correctStreak++;
    l2.wrongInLevel = 0;
    if(l2.correctStreak >= 3 && l2.level < 4){
      l2.level++;
      l2.correctStreak = 0;
    }
  } else {
    l2.correctStreak = 0;
    l2.wrongInLevel++;
    if(l2.wrongInLevel >= 2 && l2.level > 1){
      l2.level--;
      l2.wrongInLevel = 0;
    }
  }

  // Feedback
  const fb = document.getElementById(`l2Fb-${qid}`);
  const mod = MODULES[state.moduleId];
  const fw = mod?.frameworks?.find(f=>f.id===q.model);

  if(isCorrect){
    fb.innerHTML = `
      <div class="info green"><strong>正確！</strong> ${q.explanation || ''}</div>
      ${l2.correctStreak === 0 && l2.level > 1 ? '<div class="info blue" style="margin-top:.5rem;"><strong>升級！</strong> 進入 Level '+l2.level+'</div>' : ''}
      <button class="btn btn-primary btn-block" onclick="nextL2()" style="margin-top:.5rem;">下一題 →</button>
    `;
  } else {
    const diag = q.diagnosis?.[chosen];
    fb.innerHTML = `
      <div class="info red"><strong>答案是 ${q.correct}</strong>。${q.explanation || ''}</div>
      ${diag ? `<div class="info gold" style="margin-top:.5rem;"><strong>你的盲區：</strong>${diag.gap}</div>` : ''}
      ${fw ? `<div style="margin-top:.5rem;font-size:.9rem;color:var(--g600);">→ 回顧心智模型「${fw.name}」：${fw.desc}</div>` : ''}
      <button class="btn btn-secondary btn-block" onclick="nextL2()" style="margin-top:.5rem;">下一題 →</button>
    `;
  }

  renderL2Level();
  saveSession();
  saveBlindSpot(q, chosen, isCorrect);
}

function nextL2(){
  l2.currentQ++;
  renderL2Question();
  window.scrollTo(0, document.getElementById('l2QuizArea').offsetTop - 60);
}

function calcL2Accuracy(){
  const total = Object.keys(l2.answers).length;
  if(total === 0) return 0;
  const correct = l2.questions.filter(q => l2.answers[q.id] === q.correct).length;
  return Math.round(correct / total * 100);
}

// ═══════════════════════════════════════════════════════
//  SIMULATED EXAM (50 questions, 75 min)
// ═══════════════════════════════════════════════════════

let exam = {
  questions: [],
  answers: {},
  currentQ: 0,
  startTime: null,
  timerInterval: null,
  timeLimit: 75 * 60 * 1000 // 75 minutes in ms
};

function goExam(){
  showScreen('screenExam');
  exam = {questions:[],answers:{},currentQ:0,startTime:null,timerInterval:null,timeLimit:75*60*1000};

  // Show loading — generate ALL questions before starting timer
  document.getElementById('examTimer').textContent = '組卷中...';
  document.getElementById('examArea').innerHTML = `
    <div class="info purple" style="text-align:center;">
      <strong>AI 正在組卷...</strong><br>
      <span id="examLoadProgress">準備題庫中</span>
    </div>`;
  document.getElementById('examNav').innerHTML = '';

  generateExamQuestions();
}

function updateExamTimer(){
  const elapsed = Date.now() - exam.startTime;
  const remaining = Math.max(0, exam.timeLimit - elapsed);
  const min = Math.floor(remaining / 60000);
  const sec = Math.floor((remaining % 60000) / 1000);
  const el = document.getElementById('examTimer');
  if(el){
    el.textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    el.style.color = remaining < 5*60*1000 ? 'var(--red)' : 'var(--navy)';
  }
  if(remaining <= 0){
    clearInterval(exam.timerInterval);
    finishExam();
  }
}

async function generateExamQuestions(){
  const mod = MODULES[state.moduleId];
  if(!mod) return;

  // Mix: use existing module questions (shuffled) + AI-generated
  const pool = [...mod.questions];
  // Shuffle
  for(let i = pool.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [pool[i],pool[j]] = [pool[j],pool[i]];
  }

  // Take up to 25 from existing pool (shuffle)
  const fromPool = pool.slice(0, Math.min(25, pool.length)).map(q=>({...q, id:'EX-'+q.id, source:'pool'}));
  exam.questions = fromPool;

  const progressEl = document.getElementById('examLoadProgress');
  if(progressEl) progressEl.textContent = `題庫已載入 ${fromPool.length} 題，AI 生成中...`;

  // Generate remaining via AI (in batches of 10)
  const needed = 50 - fromPool.length;
  const batchSize = 10;
  const batches = Math.ceil(needed / batchSize);

  for(let b = 0; b < batches; b++){
    const count = Math.min(batchSize, needed - b * batchSize);
    const fws = mod.frameworks.map(f=>`${f.name}：${f.desc}`).join('\n');

    const prompt = `你是 iPAS AI 應用規劃師初級模擬考出題引擎。

考試資訊：科目一+科目二混合，75 分鐘 50 題，70 分及格。
2026 年考試趨勢：情境判斷題為主，跨領域混合，AI 基本法+Agentic AI 是新考點。

本模組「${mod.name}」的心智模型：
${fws}

請生成 ${count} 題選擇題，混合以下題型：
- 40% 情境判斷題（企業場景）
- 30% 概念應用題（不是純背誦）
- 20% 跨概念混合題
- 10% 陷阱題（「下列何者錯誤」）

【選項撰寫規則 — 嚴格遵守】
1. 每個選項固定 35-50 字，四個選項字數必須幾乎相同
2. 四個選項都必須包含「理由」，格式統一為「做法＋因為/因此＋理由」
3. 錯誤選項的理由要寫得有說服力，是常見的合理誤解，不能一看就知道是錯的
4. 正確答案不可以是唯一有解釋的選項
5. 先寫好四個等長選項，最後才決定哪個是正確答案

回傳純 JSON（不要 markdown code block）：
[{"stem":"題目","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correct":"C","explanation":"30字解析"}]`;

    try {
      const text = await callGroq(prompt, 8192);
      const cleaned = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
      const aiQs = JSON.parse(cleaned);
      const mapped = aiQs.map((q,i)=>({
        ...q,
        id: `EX-AI-${b*batchSize+i+1}`,
        model: mod.frameworks[Math.floor(Math.random()*mod.frameworks.length)]?.id || 'F1',
        source: 'groq',
        diagnosis: {}
      }));
      exam.questions.push(...mapped);
      // Cache for reuse
      cacheQuestions(state.moduleId, 3, mapped);
      if(progressEl) progressEl.textContent = `已生成 ${exam.questions.length} / 50 題...`;
    } catch(e){
      console.warn('Exam generation batch failed');
    }
    // Small delay between batches
    if(b < batches - 1) await new Promise(r=>setTimeout(r, 2000));
  }

  // If still short of 50, pad from pool (re-shuffle and add remaining)
  if(exam.questions.length < 50 && pool.length > fromPool.length){
    const extra = pool.slice(fromPool.length).map(q=>({...q, id:'EX2-'+q.id, source:'pool'}));
    exam.questions.push(...extra.slice(0, 50 - exam.questions.length));
  }

  // If still short, try cached questions from Firebase
  if(exam.questions.length < 50){
    const cached = await loadCachedQuestions(state.moduleId, [], 3, 50 - exam.questions.length);
    exam.questions.push(...cached);
  }

  if(progressEl) progressEl.textContent = `組卷完成！共 ${exam.questions.length} 題`;

  // Shuffle all questions
  for(let i = exam.questions.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [exam.questions[i],exam.questions[j]] = [exam.questions[j],exam.questions[i]];
  }

  // NOW start the timer and show first question
  exam.startTime = Date.now();
  exam.timerInterval = setInterval(updateExamTimer, 1000);
  updateExamTimer();
  renderExamQuestion();
}

function renderExamQuestion(){
  const area = document.getElementById('examArea');
  if(exam.currentQ >= exam.questions.length){
    finishExam();
    return;
  }

  const q = exam.questions[exam.currentQ];
  const total = exam.questions.length;

  area.innerHTML = `
    <div class="fade-in">
      <div class="quiz-stem">
        <span class="q-num">${exam.currentQ+1} / ${total}</span>
        ${q.stem}
      </div>
      <div id="examOpts-${q.id}">
        ${q.options.map(o => `
          <button class="option-btn" onclick="answerExam('${q.id}','${o.key}')">
            <span class="opt-label">${o.key}</span>${o.text}
          </button>
        `).join('')}
      </div>
    </div>
  `;

  // Navigation
  document.getElementById('examNav').innerHTML = `
    <span style="font-size:.85rem;color:var(--g600);">已答 ${Object.keys(exam.answers).length} / ${total}</span>
    ${Object.keys(exam.answers).length >= Math.min(exam.questions.length, 50) - 1
      ? '<button class="btn btn-red" onclick="finishExam()">交卷</button>'
      : ''}
  `;
}

function answerExam(qid, chosen){
  if(exam.answers[qid]) return; // already answered
  exam.answers[qid] = chosen;

  // Brief highlight then move on
  const q = exam.questions.find(x=>x.id===qid);
  document.querySelectorAll(`#examOpts-${qid} .option-btn`).forEach(b=>b.classList.add('locked'));

  // Auto-advance after 300ms
  setTimeout(()=>{
    exam.currentQ++;
    if(exam.currentQ >= exam.questions.length){
      finishExam();
    } else {
      renderExamQuestion();
      window.scrollTo(0, document.getElementById('examArea').offsetTop - 60);
    }
  }, 300);
}

function finishExam(){
  clearInterval(exam.timerInterval);
  showScreen('screenExamResult');

  const total = exam.questions.length;
  const answered = Object.keys(exam.answers).length;
  const correct = exam.questions.filter(q => exam.answers[q.id] === q.correct).length;
  const score = total > 0 ? Math.round(correct / total * 100) : 0;
  const passed = score >= 70;
  const elapsed = Math.round((Date.now() - exam.startTime) / 60000);

  document.getElementById('examResultInfo').innerHTML = `
    <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-bottom:1.5rem;">
      <div class="card" style="min-width:140px;text-align:center;">
        <div style="font-size:3rem;font-weight:900;color:${passed?'var(--green)':'var(--red)'};">${score}</div>
        <div style="font-size:.85rem;color:var(--g600);">分數（70 及格）</div>
      </div>
      <div class="card" style="min-width:140px;text-align:center;">
        <div style="font-size:2rem;font-weight:900;color:var(--blue);">${correct}/${answered}</div>
        <div style="font-size:.85rem;color:var(--g600);">答對</div>
      </div>
      <div class="card" style="min-width:140px;text-align:center;">
        <div style="font-size:2rem;font-weight:900;color:var(--gold);">${elapsed} 分</div>
        <div style="font-size:.85rem;color:var(--g600);">用時</div>
      </div>
    </div>
    <div class="info ${passed?'green':'red'}" style="text-align:center;font-size:1.1rem;">
      <strong>${passed ? '恭喜通過！預估真實考試及格率高' : '未達及格標準，建議回到 Layer 1 加強弱項'}</strong>
    </div>
  `;

  // Detail: per-framework accuracy
  const mod = MODULES[state.moduleId];
  if(mod){
    const fwStats = {};
    mod.frameworks.forEach(f => { fwStats[f.id] = {correct:0,total:0,name:f.name}; });
    exam.questions.forEach(q => {
      if(fwStats[q.model]){
        fwStats[q.model].total++;
        if(exam.answers[q.id] === q.correct) fwStats[q.model].correct++;
      }
    });

    const detailHtml = Object.entries(fwStats).filter(([_,s])=>s.total>0).map(([fid,s])=>{
      const pct = Math.round(s.correct/s.total*100);
      const color = pct >= 70 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';
      return `<div class="weak-item">
        <span class="weak-badge" style="background:${color};min-width:50px;text-align:center;">${pct}%</span>
        <div><strong>${s.name}</strong><span class="dim" style="margin-left:.5rem;">${s.correct}/${s.total}</span></div>
      </div>`;
    }).join('');

    document.getElementById('examResultDetail').innerHTML = `
      <h3 style="margin:1.5rem 0 .8rem;">各概念掌握度</h3>
      ${detailHtml}
      <h3 style="margin:1.5rem 0 .8rem;">錯題回顧</h3>
      <div id="examWrongReview"></div>
    `;

    // Show wrong questions with full explanations
    const wrongQs = exam.questions.filter(q => exam.answers[q.id] && exam.answers[q.id] !== q.correct);
    document.getElementById('examWrongReview').innerHTML = wrongQs.slice(0,15).map((q,i) => {
      const yourChoice = q.options.find(o=>o.key===exam.answers[q.id]);
      const correctChoice = q.options.find(o=>o.key===q.correct);
      const fw = mod?.frameworks?.find(f=>f.id===q.model);
      return `<div class="card" style="margin-bottom:1rem;border-left:4px solid var(--red);">
        <p style="font-weight:700;font-size:.95rem;margin-bottom:.8rem;">第 ${exam.questions.indexOf(q)+1} 題：${q.stem}</p>
        <p style="font-size:.9rem;color:var(--red);margin-bottom:.3rem;">
          <strong>你選 ${exam.answers[q.id]}：</strong>${yourChoice?.text || ''}
        </p>
        <p style="font-size:.9rem;color:var(--green);margin-bottom:.5rem;">
          <strong>正確 ${q.correct}：</strong>${correctChoice?.text || ''}
        </p>
        ${q.explanation ? `<p style="font-size:.9rem;color:var(--navy);background:var(--blue-lt);padding:.5rem .8rem;border-radius:8px;margin-top:.5rem;"><strong>解析：</strong>${q.explanation}</p>` : ''}
        ${fw ? `<p style="font-size:.8rem;color:var(--g400);margin-top:.4rem;">→ 心智模型：${fw.name}</p>` : ''}
      </div>`;
    }).join('') || '<p class="dim">沒有錯題，表現優秀！</p>';
  }

  saveSession();
  saveProgress('exam_complete');
}

// ═══════════════════════════════════════════════════════
//  FIREBASE BLIND SPOT COLLECTION
// ═══════════════════════════════════════════════════════

function saveBlindSpot(question, chosen, isCorrect){
  try {
    if(typeof firebase === 'undefined') return;
    const mod = MODULES[state.moduleId];
    if(!mod) return;

    // Per-question analytics
    const qRef = firebase.database().ref(`learn/analytics/questions/${state.moduleId}/${question.id}`);
    qRef.transaction(data => {
      if(!data) data = {attempts:0,correct:0,wrong_choices:{}};
      data.attempts = (data.attempts||0) + 1;
      if(isCorrect){
        data.correct = (data.correct||0) + 1;
      } else {
        if(!data.wrong_choices) data.wrong_choices = {};
        data.wrong_choices[chosen] = (data.wrong_choices[chosen]||0) + 1;
      }
      return data;
    });

    // Per-framework analytics
    if(!isCorrect && question.model){
      const fwRef = firebase.database().ref(`learn/analytics/frameworks/${state.moduleId}/${question.model}`);
      fwRef.transaction(data => {
        if(!data) data = {total_wrong:0,gaps:{}};
        data.total_wrong = (data.total_wrong||0) + 1;
        // Record the gap
        const gap = question.diagnosis?.[chosen]?.gap || 'unknown';
        if(!data.gaps) data.gaps = {};
        data.gaps[gap] = (data.gaps[gap]||0) + 1;
        return data;
      });
    }

    // Per-module completion stats
    const modRef = firebase.database().ref(`learn/analytics/modules/${state.moduleId}`);
    modRef.transaction(data => {
      if(!data) data = {total_students:0};
      return data;
    });

  } catch(e){ /* silent */ }
}

// Track module completion
function saveModuleCompletion(){
  try {
    if(typeof firebase === 'undefined') return;
    const modRef = firebase.database().ref(`learn/analytics/modules/${state.moduleId}`);
    modRef.transaction(data => {
      if(!data) data = {total_students:0};
      data.total_students = (data.total_students||0) + 1;
      data.last_completion = firebase.database.ServerValue.TIMESTAMP;
      return data;
    });
  } catch(e){ /* silent */ }
}

// ═══════════════════════════════════════════════════════
//  WIRE UP: Final Report → Layer 2 / Exam buttons
// ═══════════════════════════════════════════════════════

// Override renderFinalReport to add Layer 2 entry
const _origRenderFinalReport = window.renderFinalReport;
window.renderFinalReport = function(){
  _origRenderFinalReport();
  saveModuleCompletion();

  const actWrap = document.getElementById('finalActions');
  if(!actWrap) return;

  const hasWeakness = (state.weakFws || []).length > 0;
  actWrap.innerHTML = `
    <div style="display:flex;gap:.8rem;justify-content:center;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="goLayer2()" style="font-size:1rem;padding:.8rem 2rem;">
        ${hasWeakness ? '開始 Layer 2 弱項練習 →' : '進入 Layer 2 進階練習 →'}
      </button>
      <button class="btn btn-gold" onclick="goExam()" style="font-size:1rem;padding:.8rem 2rem;">
        直接模擬考（50題）
      </button>
    </div>
    <button class="btn btn-secondary btn-block" onclick="location.reload()" style="margin-top:.8rem;max-width:320px;margin-left:auto;margin-right:auto;">
      返回首頁
    </button>
  `;
};

// Also add Layer 2 entry from returning user dashboard
const _origResumeWeak = window.resumeWeakPractice;
window.resumeWeakPractice = function(){
  const saved = loadSession();
  if(!saved) return;
  state.name = saved.name;
  state.email = saved.email || '';
  state.moduleId = saved.moduleId;
  state.phase1 = saved.phase1 || {ratings:{}};
  state.phase2 = saved.phase2 || {choices:{}};
  state.phase3 = saved.phase3 || {answers:{},scores:{}};
  state.weakFws = saved.weakFws || [];
  state.startTime = Date.now();

  if(state.weakFws.length === 0){
    const mod = MODULES[state.moduleId];
    if(mod){
      const fwScores = {};
      mod.frameworks.forEach(f => { fwScores[f.id] = {total:0,count:0}; });
      mod.questions.forEach(q => {
        const score = state.phase3.scores?.[q.id] || 0;
        if(fwScores[q.model]){ fwScores[q.model].total += score; fwScores[q.model].count++; }
      });
      state.weakFws = Object.entries(fwScores).filter(([_,fs]) => fs.count>0 && fs.total/fs.count < 3).map(([fid])=>fid);
    }
  }

  // Go directly to Layer 2 instead of Phase 5
  goLayer2();
};
