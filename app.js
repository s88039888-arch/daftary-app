/* ============================================================
   دفتري — تطبيق متابعة الدروس الخصوصية
   تخزين محلي بالكامل (localStorage) — يشتغل من غير نت
   ============================================================ */

const DB_KEY = 'daftary_v1';
const AVATAR_COLORS = ['#C9702F','#4C8A5E','#3E6B99','#9C5FA8','#C85A44','#5B8AA6','#A67C3D'];

let DB = loadDB();
let currentScreen = 'home';
let currentWeekOffset = 0;
let moneyPeriod = 'month';
let activeLessonDetailId = null;
let activeStudentDetailId = null;

function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return {
    students: [],
    lessons: [],
    payments: [],   // {id, studentId, amount, date, note}
    expenses: [],   // {id, title, amount, category, date}
    settings: { notifLessons:true, notifPayments:true, reminderMinutes:30, currency:'ج.م' }
  };
}
function saveDB(){
  localStorage.setItem(DB_KEY, JSON.stringify(DB));
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function currency(){ return DB.settings.currency || 'ج.م'; }
function fmtMoney(n){
  n = Math.round(n||0);
  return n.toLocaleString('en-US') + ' ' + currency();
}

/* ---------------- Navigation ---------------- */
function goScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const navBtn = document.querySelector('.nav-item[data-screen="'+name+'"]');
  if(navBtn) navBtn.classList.add('active');
  currentScreen = name;
  document.getElementById('fab').style.display = (name==='settings') ? 'none' : 'flex';
  renderCurrentScreen();
}
function renderCurrentScreen(){
  if(currentScreen==='home') renderHome();
  else if(currentScreen==='schedule') renderSchedule();
  else if(currentScreen==='students') renderStudents();
  else if(currentScreen==='money') renderMoney();
}
function handleFab(){
  if(currentScreen==='students') openStudentSheet();
  else openLessonSheet();
}

/* ---------------- Sheets ---------------- */
function openSheet(id){ document.getElementById(id).classList.add('active'); }
function closeSheet(id){ document.getElementById(id).classList.remove('active'); }
document.querySelectorAll('.sheet-overlay').forEach(ov=>{
  ov.addEventListener('click', e=>{ if(e.target===ov) closeSheet(ov.id); });
});

function selectChip(el, hiddenInputId){
  const group = el.parentElement;
  group.querySelectorAll('.chip').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById(hiddenInputId).value = el.dataset.val;
}

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ---------------- Date helpers ---------------- */
function todayISO(){ return new Date().toISOString().slice(0,10); }
function fmtDateHuman(iso){
  const d = new Date(iso+'T00:00:00');
  const days = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return days[d.getDay()] + '، ' + d.getDate() + ' ' + months[d.getMonth()];
}
function fmtTime12(t){
  if(!t) return '';
  let [h,m] = t.split(':').map(Number);
  const ampm = h>=12 ? 'م' : 'ص';
  h = h % 12; if(h===0) h=12;
  return h + ':' + String(m).padStart(2,'0') + ' ' + ampm;
}
function startOfWeek(date){
  const d = new Date(date);
  const day = d.getDay(); // 0=Sunday
  d.setDate(d.getDate()-day);
  d.setHours(0,0,0,0);
  return d;
}
function isoAdd(iso, days){
  const d = new Date(iso+'T00:00:00');
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}

/* ============================================================
   STUDENTS
   ============================================================ */
function openStudentSheet(student){
  document.getElementById('studentSheetTitle').textContent = student ? 'تعديل بيانات الطالب' : 'طالب جديد';
  document.getElementById('studentId').value = student ? student.id : '';
  document.getElementById('studentName').value = student ? student.name : '';
  document.getElementById('studentPlace').value = student ? student.place : '';
  document.getElementById('studentPhone').value = student ? (student.phone||'') : '';
  document.getElementById('pricePerLesson').value = student ? (student.pricePerLesson||'') : '';
  document.getElementById('batchCount').value = student ? (student.batchCount||'') : '';
  document.getElementById('monthlyPrice').value = student ? (student.monthlyPrice||'') : '';

  // subject chip
  const subjWrap = document.querySelectorAll('#sheetStudent .chip-group')[0];
  subjWrap.querySelectorAll('.chip').forEach(c=>{
    c.classList.toggle('selected', student && c.dataset.val===student.subject);
  });
  document.getElementById('studentSubject').value = student ? student.subject : '';

  // payment type chip
  const payWrap = document.querySelectorAll('#sheetStudent .chip-group')[1];
  const payType = student ? student.paymentType : 'perLesson';
  payWrap.querySelectorAll('.chip').forEach(c=>{
    c.classList.toggle('selected', c.dataset.val===payType);
  });
  document.getElementById('paymentType').value = payType;
  refreshPaymentFields();

  openSheet('sheetStudent');
}
function refreshPaymentFields(){
  const type = document.getElementById('paymentType').value;
  document.getElementById('batchCountWrap').style.display = type==='perBatch' ? 'block' : 'none';
  document.getElementById('monthlyPriceWrap').style.display = type==='monthly' ? 'block' : 'none';
}
function saveStudent(){
  const name = document.getElementById('studentName').value.trim();
  if(!name){ toast('اكتب اسم الطالب الأول'); return; }
  const subject = document.getElementById('studentSubject').value || 'فرنساوي';
  const paymentType = document.getElementById('paymentType').value || 'perLesson';
  const id = document.getElementById('studentId').value || uid();

  const existing = DB.students.find(s=>s.id===id);
  const student = {
    id,
    name,
    subject,
    place: document.getElementById('studentPlace').value.trim(),
    phone: document.getElementById('studentPhone').value.trim(),
    paymentType,
    pricePerLesson: Number(document.getElementById('pricePerLesson').value)||0,
    batchCount: Number(document.getElementById('batchCount').value)||4,
    monthlyPrice: Number(document.getElementById('monthlyPrice').value)||0,
    colorIdx: existing ? existing.colorIdx : DB.students.length % AVATAR_COLORS.length,
    createdAt: existing ? existing.createdAt : Date.now()
  };
  if(existing){
    Object.assign(existing, student);
  }else{
    DB.students.push(student);
  }
  saveDB();
  closeSheet('sheetStudent');
  toast('تم حفظ الطالب');
  renderCurrentScreen();
}
function deleteStudent(){
  if(!confirm('متأكد عايز تمسح الطالب ده؟ هيتمسح معاه كل الحصص والمدفوعات بتاعته.')) return;
  DB.students = DB.students.filter(s=>s.id!==activeStudentDetailId);
  DB.lessons = DB.lessons.filter(l=>l.studentId!==activeStudentDetailId);
  DB.payments = DB.payments.filter(p=>p.studentId!==activeStudentDetailId);
  saveDB();
  closeSheet('sheetStudentDetail');
  toast('اتمسح الطالب');
  renderCurrentScreen();
}
function editStudentFromDetail(){
  const s = DB.students.find(x=>x.id===activeStudentDetailId);
  closeSheet('sheetStudentDetail');
  setTimeout(()=>openStudentSheet(s), 200);
}

function initials(name){
  return name.trim().split(' ').slice(0,2).map(w=>w[0]).join('');
}

/* Calculate what a student owes based on unpaid lessons */
function studentBalance(student){
  const lessons = DB.lessons.filter(l=>l.studentId===student.id && l.done);
  const totalPaid = DB.payments.filter(p=>p.studentId===student.id).reduce((a,p)=>a+p.amount,0);

  let totalEarned = 0;
  if(student.paymentType==='monthly'){
    // count distinct months with at least one done lesson
    const months = new Set(lessons.map(l=>l.date.slice(0,7)));
    totalEarned = months.size * (student.monthlyPrice||0);
  }else{
    totalEarned = lessons.length * (student.pricePerLesson||0);
  }
  return { totalEarned, totalPaid, due: Math.max(0, totalEarned - totalPaid) };
}

function renderStudents(){
  const list = document.getElementById('studentsList');
  document.getElementById('studentsCount').textContent = DB.students.length + ' طالب';
  if(DB.students.length===0){
    list.innerHTML = emptyState('مفيش طلاب لسه', 'دوس على زر + تحت وسجل أول طالب عندك');
    return;
  }
  list.innerHTML = DB.students.map(s=>{
    const bal = studentBalance(s);
    const color = AVATAR_COLORS[s.colorIdx % AVATAR_COLORS.length];
    const badge = bal.due>0
      ? `<span class="badge badge-owe">مستحق ${fmtMoney(bal.due)}</span>`
      : `<span class="badge badge-ok">مسدد</span>`;
    return `<div class="student-item" onclick="openStudentDetail('${s.id}')">
      <div class="avatar" style="background:${color}">${initials(s.name)}</div>
      <div class="student-info">
        <div class="student-name">${escapeHtml(s.name)}</div>
        <div class="student-meta">${s.subject} · ${escapeHtml(s.place||'مفيش مكان محدد')}</div>
      </div>
      ${badge}
    </div>`;
  }).join('');
}

function openStudentDetail(id){
  const s = DB.students.find(x=>x.id===id);
  if(!s) return;
  activeStudentDetailId = id;
  const color = AVATAR_COLORS[s.colorIdx % AVATAR_COLORS.length];
  document.getElementById('detailAvatar').style.background = color;
  document.getElementById('detailAvatar').textContent = initials(s.name);
  document.getElementById('detailName').textContent = s.name;

  let payLabel = '';
  if(s.paymentType==='perLesson') payLabel = fmtMoney(s.pricePerLesson)+' / حصة';
  else if(s.paymentType==='perBatch') payLabel = fmtMoney(s.pricePerLesson)+' / حصة (كل '+s.batchCount+' حصص)';
  else payLabel = fmtMoney(s.monthlyPrice)+' / شهر';
  document.getElementById('detailMeta').textContent = s.subject + ' · ' + payLabel;

  const bal = studentBalance(s);
  document.getElementById('detailPaid').textContent = fmtMoney(bal.totalPaid);
  document.getElementById('detailDue').textContent = fmtMoney(bal.due);

  const lessons = DB.lessons.filter(l=>l.studentId===id).sort((a,b)=> (b.date+b.start).localeCompare(a.date+a.start));
  const lessonsEl = document.getElementById('detailLessons');
  if(lessons.length===0){
    lessonsEl.innerHTML = emptyState('مفيش حصص متسجلة', '');
  }else{
    lessonsEl.innerHTML = lessons.map(l=>`
      <div class="lesson-item" onclick="openLessonDetail('${l.id}')">
        <div class="lesson-time">
          <div class="t1">${new Date(l.date+'T00:00:00').getDate()}</div>
          <div class="t2">${fmtTime12(l.start)}</div>
        </div>
        <div class="lesson-body">
          <div class="lesson-name">${l.done? '✓ ':''}${escapeHtml(s.name)}</div>
          <div class="lesson-place">${fmtDateHuman(l.date)}</div>
        </div>
      </div>`).join('');
  }
  openSheet('sheetStudentDetail');
}

function markStudentPaid(){
  const s = DB.students.find(x=>x.id===activeStudentDetailId);
  if(!s) return;
  const bal = studentBalance(s);
  const suggested = bal.due>0 ? bal.due : (s.paymentType==='monthly'? s.monthlyPrice : s.pricePerLesson*(s.paymentType==='perBatch'?s.batchCount:1));
  const amount = prompt('المبلغ المستلم من '+s.name+':', suggested||0);
  if(amount===null) return;
  const num = Number(amount);
  if(!num || num<=0){ toast('اكتب مبلغ صحيح'); return; }
  DB.payments.push({ id: uid(), studentId: s.id, amount:num, date: todayISO() });
  saveDB();
  toast('تم تسجيل الدفعة ✓');
  openStudentDetail(s.id);
  renderCurrentScreen();
}

/* ============================================================
   LESSONS / SCHEDULE
   ============================================================ */
function openLessonSheet(lesson){
  const sel = document.getElementById('lessonStudent');
  sel.innerHTML = DB.students.map(s=>`<option value="${s.id}">${escapeHtml(s.name)} — ${s.subject}</option>`).join('');
  if(DB.students.length===0){
    toast('سجل طالب الأول قبل ما تضيف حصة');
    return;
  }
  document.getElementById('lessonId').value = lesson ? lesson.id : '';
  document.getElementById('lessonDate').value = lesson ? lesson.date : todayISO();
  document.getElementById('lessonStart').value = lesson ? lesson.start : '17:00';
  document.getElementById('lessonEnd').value = lesson ? lesson.end : '18:00';
  document.getElementById('lessonRepeat').checked = false;
  document.getElementById('repeatWeeksWrap').style.display = 'none';

  if(lesson){
    sel.value = lesson.studentId;
    document.getElementById('lessonPlace').value = lesson.place || '';
  }else{
    sel.selectedIndex = 0;
    onLessonStudentChange();
  }
  openSheet('sheetLesson');
}
function onLessonStudentChange(){
  const s = DB.students.find(x=>x.id===document.getElementById('lessonStudent').value);
  if(s) document.getElementById('lessonPlace').value = s.place||'';
}
document.getElementById('lessonRepeat').addEventListener('change', function(){
  document.getElementById('repeatWeeksWrap').style.display = this.checked ? 'block' : 'none';
});

function saveLesson(){
  const studentId = document.getElementById('lessonStudent').value;
  const date = document.getElementById('lessonDate').value;
  const start = document.getElementById('lessonStart').value;
  const end = document.getElementById('lessonEnd').value;
  if(!studentId || !date || !start || !end){ toast('كمّل البيانات الأول'); return; }
  const place = document.getElementById('lessonPlace').value.trim();
  const id = document.getElementById('lessonId').value;

  if(id){
    const l = DB.lessons.find(x=>x.id===id);
    Object.assign(l, {studentId, date, start, end, place});
  }else{
    const repeat = document.getElementById('lessonRepeat').checked;
    const weeks = repeat ? (Number(document.getElementById('repeatWeeks').value)||1) : 1;
    for(let i=0;i<weeks;i++){
      DB.lessons.push({
        id: uid(), studentId, date: isoAdd(date, i*7), start, end, place, done:false
      });
    }
  }
  saveDB();
  closeSheet('sheetLesson');
  toast('تم حفظ الحصة');
  renderCurrentScreen();
  scheduleAllNotifications();
}

function openLessonDetail(id){
  const l = DB.lessons.find(x=>x.id===id);
  if(!l) return;
  activeLessonDetailId = id;
  const s = DB.students.find(x=>x.id===l.studentId);
  document.getElementById('lessonDetailTitle').textContent = s ? s.name : 'حصة';
  document.getElementById('lessonDetailSub').textContent =
    fmtDateHuman(l.date) + ' · ' + fmtTime12(l.start) + ' - ' + fmtTime12(l.end) + (l.place ? ' · '+l.place : '');
  document.getElementById('btnLessonDone').textContent = l.done ? 'إلغاء "تمت"' : 'تمت';
  openSheet('sheetLessonDetail');
}
function toggleLessonDone(){
  const l = DB.lessons.find(x=>x.id===activeLessonDetailId);
  if(!l) return;
  l.done = !l.done;
  saveDB();
  closeSheet('sheetLessonDetail');
  toast(l.done ? 'تمام، اتسجلت كحصة تمت ✓' : 'رجعت الحصة لغير منفذة');
  renderCurrentScreen();
}
function editLessonFromDetail(){
  const l = DB.lessons.find(x=>x.id===activeLessonDetailId);
  closeSheet('sheetLessonDetail');
  setTimeout(()=>openLessonSheet(l), 200);
}
function deleteLessonFromDetail(){
  if(!confirm('تمسح الحصة دي؟')) return;
  DB.lessons = DB.lessons.filter(x=>x.id!==activeLessonDetailId);
  saveDB();
  closeSheet('sheetLessonDetail');
  toast('اتمسحت الحصة');
  renderCurrentScreen();
}

function renderSchedule(){
  const base = new Date();
  base.setDate(base.getDate() + currentWeekOffset*7);
  const weekStart = startOfWeek(base);
  const days = [];
  for(let i=0;i<7;i++){
    const d = new Date(weekStart); d.setDate(d.getDate()+i);
    days.push(d.toISOString().slice(0,10));
  }
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  document.getElementById('scheduleWeekLabel').textContent =
    new Date(days[0]).getDate()+' '+months[new Date(days[0]).getMonth()]+' — '+new Date(days[6]).getDate()+' '+months[new Date(days[6]).getMonth()];

  const dayNamesShort = ['ح','ن','ث','ر','خ','ج','س'];
  const strip = document.getElementById('weekStrip');
  strip.innerHTML = days.map((d,i)=>{
    const isToday = d===todayISO();
    const count = DB.lessons.filter(l=>l.date===d).length;
    return `<div onclick="selectScheduleDay('${d}')" data-day="${d}" style="flex:1; min-width:44px; text-align:center; padding:10px 4px; border-radius:12px; cursor:pointer; background:${isToday?'var(--clay)':'var(--navy-2)'}; border:1px solid ${isToday?'var(--clay)':'var(--line)'};">
      <div style="font-size:11px; font-weight:700; color:${isToday?'#fff':'var(--cream-dim)'};">${dayNamesShort[i]}</div>
      <div style="font-size:16px; font-weight:800; margin-top:2px; color:${isToday?'#fff':'var(--cream)'};">${new Date(d).getDate()}</div>
      ${count>0?`<div style="width:5px;height:5px;border-radius:50%;background:${isToday?'#fff':'var(--clay-light)'};margin:4px auto 0;"></div>`:''}
    </div>`;
  }).join('');

  if(!window._selectedScheduleDay || currentWeekOffset===0){
    window._selectedScheduleDay = todayISO();
  }
  if(!days.includes(window._selectedScheduleDay)) window._selectedScheduleDay = days[0];
  renderScheduleDayList(window._selectedScheduleDay);
}
function selectScheduleDay(d){
  window._selectedScheduleDay = d;
  document.querySelectorAll('#weekStrip > div').forEach(el=>{
    const isSel = el.dataset.day===d;
    const isToday = el.dataset.day===todayISO();
    el.style.background = isSel ? 'var(--clay)' : 'var(--navy-2)';
    el.style.borderColor = isSel ? 'var(--clay)' : 'var(--line)';
  });
  renderScheduleDayList(d);
}
function renderScheduleDayList(day){
  const list = document.getElementById('scheduleList');
  const lessons = DB.lessons.filter(l=>l.date===day).sort((a,b)=>a.start.localeCompare(b.start));
  if(lessons.length===0){
    list.innerHTML = emptyState('مفيش حصص في اليوم ده', 'دوس + عشان تضيف حصة جديدة');
    return;
  }
  list.innerHTML = lessons.map(l=>{
    const s = DB.students.find(x=>x.id===l.studentId);
    if(!s) return '';
    const color = AVATAR_COLORS[s.colorIdx % AVATAR_COLORS.length];
    return `<div class="lesson-item" onclick="openLessonDetail('${l.id}')">
      <div class="lesson-time" style="background:${l.done?'rgba(76,138,94,0.25)':'var(--navy-3)'}">
        <div class="t1">${fmtTime12(l.start).split(' ')[0]}</div>
        <div class="t2">${fmtTime12(l.start).split(' ')[1]}</div>
      </div>
      <div class="lesson-body">
        <div class="lesson-name">${l.done?'✓ ':''}${escapeHtml(s.name)}</div>
        <div class="lesson-place">📍 ${escapeHtml(l.place||s.place||'مفيش مكان')}</div>
      </div>
      <div class="avatar" style="background:${color}; width:36px; height:36px; font-size:13px;">${initials(s.name)}</div>
    </div>`;
  }).join('');
}
function shiftWeek(dir){
  // Kept for the calendar-icon button: reset to current week
  currentWeekOffset = 0;
  window._selectedScheduleDay = todayISO();
  renderSchedule();
}

/* ============================================================
   MONEY
   ============================================================ */
function openExpenseSheet(){
  document.getElementById('expenseTitle').value='';
  document.getElementById('expenseAmount').value='';
  document.getElementById('expenseDate').value = todayISO();
  document.querySelectorAll('#sheetExpense .chip').forEach(c=>c.classList.remove('selected'));
  document.getElementById('expenseCategory').value='أخرى';
  openSheet('sheetExpense');
}
function saveExpense(){
  const title = document.getElementById('expenseTitle').value.trim();
  const amount = Number(document.getElementById('expenseAmount').value);
  if(!title || !amount){ toast('كمّل بيانات المصروف'); return; }
  DB.expenses.push({
    id: uid(), title, amount,
    category: document.getElementById('expenseCategory').value,
    date: document.getElementById('expenseDate').value || todayISO()
  });
  saveDB();
  closeSheet('sheetExpense');
  toast('تم تسجيل المصروف');
  renderCurrentScreen();
}
function deleteExpense(id){
  DB.expenses = DB.expenses.filter(e=>e.id!==id);
  saveDB();
  renderCurrentScreen();
}
function setMoneyPeriod(p){
  moneyPeriod = p;
  document.querySelectorAll('#screen-money .chip').forEach(c=>{
    c.classList.toggle('selected', c.dataset.period===p);
  });
  renderMoney();
}
function inPeriod(dateStr){
  if(moneyPeriod==='all') return true;
  const now = new Date();
  const d = new Date(dateStr+'T00:00:00');
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
}
function renderMoney(){
  const payments = DB.payments.filter(p=>inPeriod(p.date));
  const expenses = DB.expenses.filter(e=>inPeriod(e.date));
  const income = payments.reduce((a,p)=>a+p.amount,0);
  const expTotal = expenses.reduce((a,e)=>a+e.amount,0);
  document.getElementById('moneyIncome').textContent = fmtMoney(income);
  document.getElementById('moneyExpense').textContent = fmtMoney(expTotal);
  document.getElementById('moneyNet').textContent = fmtMoney(income-expTotal);

  const expList = document.getElementById('expensesList');
  if(expenses.length===0){
    expList.innerHTML = emptyState('مفيش مصروفات مسجلة', '');
  }else{
    expList.innerHTML = expenses.sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`
      <div class="lesson-item">
        <div class="lesson-time" style="background:rgba(200,90,68,0.2);">
          <div class="t1" style="font-size:12px;">${e.category}</div>
        </div>
        <div class="lesson-body">
          <div class="lesson-name">${escapeHtml(e.title)}</div>
          <div class="lesson-place">${fmtDateHuman(e.date)}</div>
        </div>
        <div style="font-weight:800; color:#E08C7A;">-${fmtMoney(e.amount)}</div>
        <div class="icon-btn" style="width:32px;height:32px;" onclick="deleteExpense('${e.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
        </div>
      </div>`).join('');
  }

  const payList = document.getElementById('paymentsList');
  if(payments.length===0){
    payList.innerHTML = emptyState('مفيش تحصيلات مسجلة', '');
  }else{
    payList.innerHTML = payments.sort((a,b)=>b.date.localeCompare(a.date)).map(p=>{
      const s = DB.students.find(x=>x.id===p.studentId);
      const color = s ? AVATAR_COLORS[s.colorIdx % AVATAR_COLORS.length] : '#666';
      return `<div class="lesson-item">
        <div class="avatar" style="background:${color}; width:38px; height:38px; font-size:13px;">${s?initials(s.name):'?'}</div>
        <div class="lesson-body">
          <div class="lesson-name">${s?escapeHtml(s.name):'طالب محذوف'}</div>
          <div class="lesson-place">${fmtDateHuman(p.date)}</div>
        </div>
        <div style="font-weight:800; color:#7FC492;">+${fmtMoney(p.amount)}</div>
      </div>`;
    }).join('');
  }
}

/* ============================================================
   HOME
   ============================================================ */
function renderHome(){
  document.getElementById('todayDate').textContent = fmtDateHuman(todayISO());
  const hour = new Date().getHours();
  const greet = hour<12 ? 'صباح الخير' : (hour<18 ? 'مساء النور' : 'مساء الخير');
  document.getElementById('greeting').textContent = greet + ' 👋';

  // month stats
  const now = new Date();
  const inMonth = d => { const dt=new Date(d+'T00:00:00'); return dt.getFullYear()===now.getFullYear() && dt.getMonth()===now.getMonth(); };
  const income = DB.payments.filter(p=>inMonth(p.date)).reduce((a,p)=>a+p.amount,0);
  const expense = DB.expenses.filter(e=>inMonth(e.date)).reduce((a,e)=>a+e.amount,0);
  document.getElementById('homeMonthIncome').textContent = fmtMoney(income);
  document.getElementById('homeMonthExpense').textContent = fmtMoney(expense);
  document.getElementById('homeMonthNet').textContent = fmtMoney(income-expense);

  // today's lessons
  const today = todayISO();
  const todayLessons = DB.lessons.filter(l=>l.date===today).sort((a,b)=>a.start.localeCompare(b.start));
  const tEl = document.getElementById('todayLessons');
  if(todayLessons.length===0){
    tEl.innerHTML = emptyState('مفيش حصص النهاردة', 'يوم مفتوح، استريح شوية 😌');
  }else{
    tEl.innerHTML = todayLessons.map(l=>{
      const s = DB.students.find(x=>x.id===l.studentId);
      if(!s) return '';
      const color = AVATAR_COLORS[s.colorIdx % AVATAR_COLORS.length];
      return `<div class="lesson-item" onclick="openLessonDetail('${l.id}')">
        <div class="lesson-time" style="background:${l.done?'rgba(76,138,94,0.25)':'var(--navy-3)'}">
          <div class="t1">${fmtTime12(l.start).split(' ')[0]}</div>
          <div class="t2">${fmtTime12(l.start).split(' ')[1]}</div>
        </div>
        <div class="lesson-body">
          <div class="lesson-name">${l.done?'✓ ':''}${escapeHtml(s.name)}</div>
          <div class="lesson-place">📍 ${escapeHtml(l.place||s.place||'مفيش مكان')}</div>
        </div>
        <div class="avatar" style="background:${color}; width:36px; height:36px; font-size:13px;">${initials(s.name)}</div>
      </div>`;
    }).join('');
  }

  // due payments
  const dueEl = document.getElementById('duePayments');
  const withDue = DB.students.map(s=>({s, bal:studentBalance(s)})).filter(x=>x.bal.due>0).sort((a,b)=>b.bal.due-a.bal.due);
  if(withDue.length===0){
    dueEl.innerHTML = emptyState('كل الطلاب مسددين 🎉', '');
  }else{
    dueEl.innerHTML = withDue.map(({s,bal})=>{
      const color = AVATAR_COLORS[s.colorIdx % AVATAR_COLORS.length];
      return `<div class="student-item" onclick="openStudentDetail('${s.id}')">
        <div class="avatar" style="background:${color}">${initials(s.name)}</div>
        <div class="student-info">
          <div class="student-name">${escapeHtml(s.name)}</div>
          <div class="student-meta">${s.subject}</div>
        </div>
        <span class="badge badge-owe">${fmtMoney(bal.due)}</span>
      </div>`;
    }).join('');
  }
}

/* ============================================================
   UTIL
   ============================================================ */
function emptyState(title, sub){
  return `<div class="empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>
    <p>${title}${sub?'<br><span style="opacity:0.7; font-weight:500;">'+sub+'</span>':''}</p>
  </div>`;
}
function escapeHtml(str){
  if(!str) return '';
  return str.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ============================================================
   SETTINGS
   ============================================================ */
function loadSettingsUI(){
  document.getElementById('notifLessons').checked = DB.settings.notifLessons;
  document.getElementById('notifPayments').checked = DB.settings.notifPayments;
  document.getElementById('reminderMinutes').value = DB.settings.reminderMinutes;
  document.getElementById('currencySelect').value = DB.settings.currency;
}
function saveSettings(){
  DB.settings.notifLessons = document.getElementById('notifLessons').checked;
  DB.settings.notifPayments = document.getElementById('notifPayments').checked;
  DB.settings.reminderMinutes = Number(document.getElementById('reminderMinutes').value);
  DB.settings.currency = document.getElementById('currencySelect').value;
  saveDB();
  renderCurrentScreen();
  toast('تم الحفظ');
}
function confirmReset(){
  if(confirm('متأكد عايز تمسح كل البيانات؟ الخطوة دي مينفعش ترجع فيها.')){
    localStorage.removeItem(DB_KEY);
    DB = loadDB();
    toast('اتمسحت كل البيانات');
    goScreen('home');
  }
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */
function requestNotifPermission(){
  if(!('Notification' in window)){ toast('المتصفح ده مبيدعمش الإشعارات'); return; }
  Notification.requestPermission().then(perm=>{
    if(perm==='granted'){ toast('تمام! الإشعارات اتفعلت ✓'); scheduleAllNotifications(); }
    else toast('محتاج تسمح بالإشعارات من إعدادات المتصفح');
  });
}
function scheduleAllNotifications(){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  // Simple in-session scheduling (works while the app/tab stays open).
  DB.lessons.filter(l=>!l.done).forEach(l=>{
    const dt = new Date(l.date+'T'+l.start+':00');
    const notifyAt = new Date(dt.getTime() - (DB.settings.reminderMinutes*60000));
    const now = new Date();
    if(DB.settings.notifLessons && notifyAt>now){
      const ms = notifyAt-now;
      if(ms < 24*3600*1000){ // only schedule within next 24h to avoid huge timers
        setTimeout(()=>{
          const s = DB.students.find(x=>x.id===l.studentId);
          fireNotification('معاد حصة قرّب 📚', (s?s.name:'') + ' الساعة ' + fmtTime12(l.start));
        }, ms);
      }
    }
  });
}
function fireNotification(title, body){
  if('Notification' in window && Notification.permission==='granted'){
    new Notification(title, { body, icon:'icon-192.png' });
  }
}

/* ============================================================
   INIT
   ============================================================ */
document.getElementById('expenseDate') && (document.getElementById('expenseDate').value = todayISO());
loadSettingsUI();
renderHome();
scheduleAllNotifications();

// Register service worker for offline + installability
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
