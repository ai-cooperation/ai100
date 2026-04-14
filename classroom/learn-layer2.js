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
    AI 根據你的弱項動態出題。連續答對 3 題升級難度。每 10 題會出階段報告。
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
  // Deduplicate: skip questions already in l2.questions
  const existingIds = new Set(l2.questions.map(q => q.id || q.stem));
  const rawCached = await loadCachedQuestions(state.moduleId, l2.targetFws, l2.level, 10);
  const cached = rawCached.filter(q => !existingIds.has(q.id) && !existingIds.has(q.stem));
  if(cached.length > 0){
    cached.forEach(q => {
      q.diagnosis = q.diagnosis || Object.fromEntries(
        (q.options||[]).filter(o=>o.key!==q.correct).map(o=>[o.key,{gap:q.explanation||'',followup:'想想正確答案考慮了什麼？'}])
      );
    });
    l2.questions.push(...cached);
  }

  // Step 2: Generate new questions via Groq to fill buffer
  const unanswered = l2.questions.length - l2.currentQ;
  const needed = Math.max(0, 10 - unanswered);
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

  // Randomize answer distribution — shuffle ABCD×N to ensure even spread
  const _base = ['A','B','C','D','A','B','C','D','A','B'];
  for(let i=_base.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[_base[i],_base[j]]=[_base[j],_base[i]];}
  const answerSeq = _base.slice(0, Math.min(needed, 10));

  const prompt = `你是 iPAS AI 應用規劃師考試的專業出題委員。你必須嚴格遵守以下所有規則，違反任何一條都是不合格的考題。

【學生弱項】
${fwInfo}

【難度】Level ${l2.level} — ${levelDesc}

【硬性規則 — 違反即不合格】

1. 題幹：每題必須以「某企業/某公司/某團隊/某醫院」開頭的實務情境，題幹至少 60 字，描述具體的業務問題或決策困境。禁止出「下列何者正確」「關於 X 的敘述」這種無情境的題。

2. 選項格式：每個選項 35-50 字，格式固定為「具體做法，因為/因此＋理由」。四個選項字數差距不超過 5 字。禁止出現少於 30 字的選項。

3. 選項品質：四個選項都要看起來合理。錯誤選項的理由必須是業界常見的合理誤解，不能一看就是廢話。

4. 答案分布：${needed} 題的正確答案依序為 ${answerSeq.join(',')}。嚴格按此順序，不可全部用同一個字母。

5. 不可洩題：正確選項不可以是最長的、最詳細的、或唯一有解釋的。四個選項的說服力要接近。

生成 ${Math.min(needed, 10)} 題繁體中文選擇題。

【範例 — 嚴格模仿此格式和長度】
[{"stem":"某零售企業導入 AI 推薦系統後發現，系統對高消費客群的推薦準確率達 92%，但對新客戶的推薦幾乎隨機。資料團隊發現訓練資料中新客戶行為紀錄不足 5%。下列哪種做法最能有效改善此問題？","options":[{"key":"A","text":"蒐集更多新客戶的瀏覽與購買行為資料再重新訓練，因為資料不平衡是推薦失準的根本原因"},{"key":"B","text":"對新客戶使用基於規則的冷啟動策略搭配協同過濾，因為在資料不足時混合方法比純 ML 穩健"},{"key":"C","text":"將高消費客群的模型直接套用到新客戶，因為消費行為的底層模式具有跨客群的通用遷移性"},{"key":"D","text":"增加推薦系統的模型複雜度與隱藏層數量，因為更深的網路能從有限資料中擠出更多特徵資訊"}],"correct":"B","explanation":"新客戶冷啟動問題需要混合策略，純 ML 在資料不足時不可靠"}]

回傳純 JSON（不要 markdown，不要前綴文字，直接以 [ 開頭）：`;

  let retries = 2;
  while(retries > 0){
    try {
      const text = await callGroq(prompt);
      if(!text || text.trim().length < 10) throw new Error('empty response');
      const cleaned = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
      // Try to extract JSON array even if wrapped in extra text
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if(!jsonMatch) throw new Error('no JSON array found');
      const aiQs = JSON.parse(jsonMatch[0]);
      if(!Array.isArray(aiQs) || aiQs.length === 0) throw new Error('empty array');
      const newQs = aiQs.filter(q => q.stem && q.options && q.correct).map((q,i) => ({
        ...q,
        id: `L2-${l2.totalGenerated + i + 1}`,
        model: l2.targetFws[i % l2.targetFws.length] || l2.targetFws[0],
        source: 'groq',
        diagnosis: Object.fromEntries(
          (q.options||[]).filter(o=>o.key!==q.correct).map(o=>[o.key,{
            gap: q.explanation || '思考這個選項的局限性',
            followup: '想想看，正確答案考慮了什麼你沒注意到的維度？'
          }])
        )
      }));
      if(newQs.length === 0) throw new Error('no valid questions');
      // Post-process: fix correct=longest bias by swapping option text
      newQs.forEach(q => {
        const lens = q.options.map(o => ({key:o.key, len:o.text.length}));
        const longest = lens.reduce((a,b) => a.len > b.len ? a : b);
        if(longest.key === q.correct && lens.length === 4){
          // Swap text between correct (longest) and a random wrong option
          const wrongs = q.options.filter(o => o.key !== q.correct);
          const swap = wrongs[Math.floor(Math.random() * wrongs.length)];
          const correctOpt = q.options.find(o => o.key === q.correct);
          const tmpText = correctOpt.text;
          correctOpt.text = swap.text;
          swap.text = tmpText;
          q.correct = swap.key;
        }
      });
      l2.totalGenerated += newQs.length;
      l2.questions.push(...newQs);
      cacheQuestions(state.moduleId, l2.level, newQs);
      if(!silent) renderL2Question();
      return; // success
    } catch(e){
      retries--;
      if(retries > 0) continue; // retry once
      if(!silent) area.innerHTML = `<div class="info red">出題失敗（${e.message}），請稍後重試。<br><button class="btn btn-secondary" style="margin-top:.5rem;" onclick="generateL2Questions()">重試</button></div>`;
    }
  }
}

let _l2Generating = false; // prevent concurrent generation

function renderL2Question(){
  const area = document.getElementById('l2QuizArea');

  // Prefetch: when 4 questions left in buffer, generate more in background
  const remaining = l2.questions.length - l2.currentQ;
  if(remaining <= 4 && !_l2Generating && Object.keys(l2.answers).length < 50){
    _l2Generating = true;
    generateL2Questions(true).finally(()=>{ _l2Generating = false; });
  }

  const answered = Object.keys(l2.answers).length;

  // Every 10 questions → show interim report with progress analysis
  if(answered > 0 && answered % 10 === 0 && !l2._reportShown){
    l2._reportShown = true; // prevent showing twice for same milestone
    const correct = l2.questions.filter(q => l2.answers[q.id] === q.correct).length;
    const pct = Math.round(correct / answered * 100);
    const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--gold)' : 'var(--red)';
    const emoji = pct >= 70 ? '🎯' : pct >= 40 ? '📈' : '💪';
    const msg = pct >= 70 ? '表現不錯！可以挑戰模擬考了。' : pct >= 40 ? '有進步空間，建議再練 10 題鞏固。' : '建議回去看對應講座，再來練習。';
    area.innerHTML = `
      <div class="info blue" style="text-align:center;">
        <strong>${emoji} ${answered} 題階段報告</strong><br>
        <div style="font-size:2rem;font-weight:900;color:${color};margin:.5rem 0;">${pct}%</div>
        <div>答對 ${correct}/${answered} 題 | 目前 Level ${l2.level}</div>
        <div style="margin-top:.5rem;color:var(--g600);">${msg}</div>
        <div style="margin-top:1rem;display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="generateL2Questions()">繼續練習 10 題 →</button>
          <button class="btn btn-gold" onclick="goExam()">進入模擬考（50 題）</button>
        </div>
      </div>`;
    return;
  }

  // Skip already-answered questions (duplicates from cache reload)
  while(l2.currentQ < l2.questions.length && l2.answers[l2.questions[l2.currentQ].id]){
    l2.currentQ++;
  }

  if(l2.currentQ >= l2.questions.length){
    // Buffer exhausted — show loading and generate more
    area.innerHTML = `<div class="info purple" style="text-align:center;"><strong>AI 正在出題...</strong><br><span style="font-size:.85rem;color:var(--g400);">約需 3-5 秒</span></div>`;
    if(!_l2Generating){
      generateL2Questions();
    }
    return;
  }

  const q = l2.questions[l2.currentQ];
  const mod = MODULES[state.moduleId];
  const fw = mod?.frameworks?.find(f=>f.id===q.model);

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
    <span class="dim" style="font-size:.85rem;">答對率：${calcL2Accuracy()}% | ${10 - (Object.keys(l2.answers).length % 10 || 10)} 題後出階段報告</span>
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
  l2._reportShown = false;
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

    // Randomize answer keys per batch — shuffle to ensure even ABCD spread
    const _examBase = ['A','B','C','D','A','B','C','D','A','B'].slice(0,count);
    for(let i=_examBase.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[_examBase[i],_examBase[j]]=[_examBase[j],_examBase[i]];}
    const answerSeq = _examBase;

    const prompt = `你是 iPAS AI 應用規劃師初級模擬考的專業出題委員。嚴格遵守以下所有規則。

【考試資訊】科目一+科目二混合，75 分鐘 50 題，70 分及格。
【模組】${mod.name}
【心智模型】
${fws}

【硬性規則 — 違反即不合格】

1. 題幹：每題必須有實務情境（「某企業/某公司/某團隊」開頭），題幹至少 60 字，描述具體業務問題。禁止「下列何者正確」「關於 X」這種無場景的題。

2. 選項格式：每個選項 35-50 字，格式「具體做法，因為/因此＋理由」。四選項字數差距 ≤ 5 字。禁止少於 30 字的選項。

3. 選項品質：錯誤選項必須是業界常見誤解，不能一看就錯。正確選項不可以是最長或最詳細的。

4. 答案分布：${count} 題的正確答案依序為 ${answerSeq.join(',')}。嚴格按此順序。

5. 題型分配：情境判斷 40%、概念應用 30%、跨概念混合 20%、陷阱題 10%。

生成 ${count} 題繁體中文選擇題。

【範例 — 嚴格模仿此格式和長度】
[{"stem":"某零售企業導入 AI 推薦系統後發現，系統對高消費客群的推薦準確率達 92%，但對新客戶的推薦幾乎隨機。資料團隊發現訓練資料中新客戶行為紀錄不足 5%。下列哪種做法最能有效改善此問題？","options":[{"key":"A","text":"蒐集更多新客戶的瀏覽與購買行為資料再重新訓練，因為資料不平衡是推薦失準的根本原因"},{"key":"B","text":"對新客戶使用基於規則的冷啟動策略搭配協同過濾，因為在資料不足時混合方法比純 ML 穩健"},{"key":"C","text":"將高消費客群的模型直接套用到新客戶，因為消費行為的底層模式具有跨客群的通用遷移性"},{"key":"D","text":"增加推薦系統的模型複雜度與隱藏層數量，因為更深的網路能從有限資料中擠出更多特徵資訊"}],"correct":"B","explanation":"新客戶冷啟動問題需要混合策略，純 ML 在資料不足時不可靠"}]

回傳純 JSON（不要 markdown，不要前綴文字，直接以 [ 開頭）：`;

    try {
      const text = await callGroq(prompt, 8192);
      if(!text || text.trim().length < 10) throw new Error('empty');
      const cleaned = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if(!jsonMatch) throw new Error('no JSON');
      const aiQs = JSON.parse(jsonMatch[0]);
      const mapped = aiQs.filter(q => q.stem && q.options && q.correct).map((q,i)=>({
        ...q,
        id: `EX-AI-${b*batchSize+i+1}`,
        model: mod.frameworks[Math.floor(Math.random()*mod.frameworks.length)]?.id || 'F1',
        source: 'groq',
        diagnosis: {}
      }));
      // Post-process: fix correct=longest bias
      mapped.forEach(q => {
        const lens = q.options.map(o => ({key:o.key, len:o.text.length}));
        const longest = lens.reduce((a,b) => a.len > b.len ? a : b);
        if(longest.key === q.correct && lens.length === 4){
          const wrongs = q.options.filter(o => o.key !== q.correct);
          const swap = wrongs[Math.floor(Math.random() * wrongs.length)];
          const correctOpt = q.options.find(o => o.key === q.correct);
          const tmpText = correctOpt.text;
          correctOpt.text = swap.text;
          swap.text = tmpText;
          q.correct = swap.key;
        }
      });
      exam.questions.push(...mapped);
      cacheQuestions(state.moduleId, 3, mapped);
      if(progressEl) progressEl.textContent = `已生成 ${exam.questions.length} / 50 題...`;
    } catch(e){
      console.warn('Exam generation batch failed:', e.message);
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

    // Per-user answer log (for registered users)
    if(state.uid){
      firebase.database().ref(`learn/users_auth/${state.uid}/answers/${state.moduleId}/${question.id}`).set({
        chosen: chosen,
        correct: isCorrect,
        ts: firebase.database.ServerValue.TIMESTAMP
      });
    }

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
