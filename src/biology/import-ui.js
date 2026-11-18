const { InlineKeyboard } = require('grammy');
const { randomBytes } = require('crypto');
const config=require('../config');
const { BioPackage:Package,BioMock:Mock,BioGroup:Group,BioSubmission:Submission,BioAttempt:Attempt }=require('../storage/postgres');
const { getSession,setSession,clearSession }=require('../bot/common');
const { downloadImport }=require('./importer');
const catalog=require('./catalog');
const service=require('./service');
const { InputError,esc,answerText,localTime }=require('./domain');
const { sendReport }=require('../lib/delivery');
const C={rename:'🏷 Nom va mavzu',upload:'📥 MOCK yuklash',all:'📚 Barcha MOCKlar',edit:'📝 MOCKni tahrirlash',remove:'🗑 MOCKni o‘chirish',send:'📤 Guruhga yuborish',results:'📊 Natijalar',rank:'🏆 Leaderboard',key:'🔑 Javoblar kaliti',retake:'🔄 Qayta topshirishga ruxsat'};
async function list(ctx,action='view',page=0) {
  const rows=await Package.find({status:{$ne:'deleted'}}).sort({createdAt:-1}).limit(1000);
  const kb=new InlineKeyboard();
  for(const p of rows.slice(page*15,page*15+15)) kb.text(`${p.status==='draft'?'📝':'✅'} ${p.mock_id} v${p.version}`,`cp:${action}:${p._id}`).row();
  if(page>0)kb.text('←',`cl:${action}:${page-1}`);
  if(rows.length>(page+1)*15)kb.text('→',`cl:${action}:${page+1}`);
  return ctx.reply(rows.length?'MOCKni tanlang:':'Hali import qilingan MOCK yo‘q. «📥 MOCK yuklash» orqali yuboring.',{reply_markup:kb});
}
async function card(ctx,p) {
  const kb=new InlineKeyboard().text('👁 Savollarni ko‘rish',`cq:${p._id}:0`).row().text('🔑 Kalit',`cp:key:${p._id}`).row();
  if(p.status==='draft')kb.text('✅ Qoralamani tasdiqlash',`ca:${p._id}`).row().text('📝 Tahrirlash',`cp:edit:${p._id}`);
  else kb.text('📤 Guruhga yuborish',`cp:send:${p._id}`);
  kb.row().text('🏷 Nom va mavzu',`cp:label:${p._id}`);
  return ctx.reply(`${p.title}\n${p.mock_id} · v${p.version}\n${p.grade}-sinf · ${p.question_count} savol\nMavzular: ${p.topics.join(', ')}\nHolat: ${p.status==='draft'?'Qoralama — hali o‘quvchilarga ochilmagan':'Tasdiqlangan'}\n${p.import_notes?.length ? '\n'+p.import_notes.join('\n')+'\n' : ''}\nSavollar va kalitni ko‘rib, tasdiqlang. HTML xavfsiz test oynasida avtomatik tuziladi.`,{reply_markup:kb});
}
async function choosePackage(ctx,packages,editId) {
  const token=randomBytes(4).toString('hex');
  setSession(ctx.from.id,{step:'import_pick',data:{packages,edit_id:editId,token}});
  const kb=new InlineKeyboard();
  packages.forEach((p,i)=>kb.text(`${p.mock_id} v${p.version} · ${p.question_count} savol`,`ci:${token}:${i}`).row());
  return ctx.reply(`ZIPda ${packages.length} ta MOCK qoldi. Qaysi birini qoralamaga saqlaymiz? Barchasining savollari va kalitlari tekshirildi.`,{reply_markup:kb});
}
function registerImportUI(bot,{admin,showGroups,menu,download=downloadImport}) {
  bot.hears(C.upload,async ctx=>{await admin(ctx);setSession(ctx.from.id,{step:'import_file',data:{}});return ctx.reply('ZIP: mock.json + answers.json, NOM_mock.json + NOM_answers.json yoki NOM_public.json + NOM_SERVER_ONLY_answers.json. HTML va BOT_INTEGRATSIYA.txt ixtiyoriy. Bitta ZIPda bir nechta MOCK bo‘lishi mumkin — tanlash tugmalari chiqadi.\nYoki bitta JSON: {"mock": {...}, "answer_key": {...}}.\n2 MB gacha; har bir MOCK 30 yoki 50 savol. /cancel — bekor qilish.');});
  bot.callbackQuery(/^ci:([a-f\d]{8}):(\d)$/,async ctx=>{
    await admin(ctx);const s=getSession(ctx.from.id),i=Number(ctx.match[2]);
    if(s?.step!=='import_pick'||s.data.token!==ctx.match[1]||!s.data.packages[i])throw new InputError('Bu ZIP tanlovi eskirgan. Faylni qayta yuboring.');
    const p=await catalog.savePackage(s.data.packages[i],s.data.edit_id);
    const remaining=s.data.packages.filter((_,index)=>index!==i);
    clearSession(ctx.from.id);await ctx.answerCallbackQuery();await menu(ctx,'✅ Tanlangan MOCK qoralamaga saqlandi.');await card(ctx,p);
    if(remaining.length&&!s.data.edit_id)return choosePackage(ctx,remaining);
  });
  for(const [name,action] of [['all','view'],['edit','edit'],['remove','remove'],['send','send'],['key','key'],['rename','label']])bot.hears(C[name],async ctx=>{await admin(ctx);clearSession(ctx.from.id);return list(ctx,action);});
  bot.callbackQuery(/^cl:(view|edit|remove|send|key|label):(\d{1,2})$/,async ctx=>{await admin(ctx);await ctx.answerCallbackQuery();return list(ctx,ctx.match[1],Number(ctx.match[2]));});
  bot.callbackQuery(/^cp:(view|edit|remove|send|key|label):([a-f\d]{24})$/,async ctx=>{
    await admin(ctx);const [_,action,id]=ctx.match,p=await Package.findById(id);
    if(!p||p.status==='deleted')throw new InputError('MOCK topilmadi.'); await ctx.answerCallbackQuery();
    if(action==='view')return card(ctx,p);
    if(action==='label'){setSession(ctx.from.id,{step:'import_label',data:{package_id:p._id}});return ctx.reply(`Yangi MOCK nomini yuboring. Hozirgi nom: ${p.title}`);}
    if(action==='key')return sendReport(ctx.api,ctx.chat.id,`🔑 <b>${esc(p.mock_id)} v${p.version}</b>\n`+p.questions.map((q,i)=>`${esc(q.question_id)}: ${p.answer_key[i]}`).join('\n'));
    if(action==='edit'){
      if(p.status!=='draft')throw new InputError('Tasdiqlangan versiya o‘zgarmaydi. JSONdagi version sonini oshirib yangi MOCK yuklang.');
      setSession(ctx.from.id,{step:'import_file',data:{edit_id:p._id}});return ctx.reply(`${p.mock_id} v${p.version} uchun tuzatilgan ZIP/JSON yuboring. Shu ID/versiya va barcha savollar/kalit bo‘lsin.`);
    }
    if(action==='remove')return ctx.reply(`${p.mock_id} v${p.version} katalogdan o‘chirilsinmi? Unga tegishli rejalashtirilgan testlar, saqlangan javoblar, natijalar va tahlil ham o‘chadi. Reyting qayta hisoblanadi.`,{reply_markup:new InlineKeyboard().text('🗑 Tasdiqlayman',`cd:${id}`)});
    const data={...catalog.snapshot(p),_id:randomBytes(12).toString('hex')};
    setSession(ctx.from.id,{step:'bio_group',data});return showGroups(ctx,true);
  });
  bot.callbackQuery(/^ca:([a-f\d]{24})$/,async ctx=>{await admin(ctx);const p=await Package.findOneAndUpdate({_id:ctx.match[1],status:'draft'},{$set:{status:'approved'}},{new:true});if(!p)throw new InputError('Qoralama topilmadi yoki allaqachon tasdiqlangan.');await ctx.answerCallbackQuery();return card(ctx,p);});
  bot.callbackQuery(/^cd:([a-f\d]{24})$/,async ctx=>{await admin(ctx);await catalog.deletePackage(ctx.match[1]);clearSession(ctx.from.id);await ctx.answerCallbackQuery();return ctx.editMessageText('MOCK, uning javoblari va natijalari o‘chirildi. Ilovadagi ro‘yxat va reytingdan ham olib tashlandi.');});
  bot.callbackQuery(/^cq:([a-f\d]{24}):(\d{1,2})$/,async ctx=>{
    await admin(ctx);const p=await Package.findById(ctx.match[1]),i=Number(ctx.match[2]),q=p?.questions?.[i];if(!q)throw new InputError('Savol topilmadi.');
    const kb=new InlineKeyboard();if(i>0)kb.text('←',`cq:${p._id}:${i-1}`);if(i<p.questions.length-1)kb.text('→',`cq:${p._id}:${i+1}`);
    kb.row().text('MOCK kartasi',`cp:view:${p._id}`);await ctx.answerCallbackQuery();
    return ctx.reply(`${i+1}/${p.question_count} · ${q.question_id}\n${q.text}\n\n${Object.entries(q.options).map(([k,v])=>`${k}) ${v}`).join('\n')}\n\nAdmin kaliti: ${p.answer_key[i]}`,{reply_markup:kb});
  });
  bot.hears([C.results,C.rank],async ctx=>{
    await admin(ctx);const rows=await Mock.find({status:{$in:['open','closed','daily']},kind:{$ne:'room'}}).sort({starts_at:-1}).limit(30);const kb=new InlineKeyboard();
    for(const m of rows)kb.text(`${m.title.slice(0,35)} · #${m.code}`,`cr:${m._id}`).row();
    return ctx.reply(rows.length?'Natija va leaderboard uchun MOCKni tanlang:':'Hali ochilgan mock yo‘q.',{reply_markup:kb});
  });
  bot.callbackQuery(/^cr:([a-f\d]{24})$/,async ctx=>{
    await admin(ctx);const m=await Mock.findById(ctx.match[1]);if(!m||m.status==='deleted')throw new InputError('Mock topilmadi.');await ctx.answerCallbackQuery();
    await sendReport(ctx.api,ctx.chat.id,(m.status==='open'?'⏳ Joriy natijalar (hali yakunlanmagan)\n':'')+await service.resultsText(m));
    return ctx.reply('Qayta topshirish kerak bo‘lsa:',{reply_markup:new InlineKeyboard().text('🔄 Ruxsat berish',`ct:${m.code}`)});
  });
  bot.hears(C.retake,async ctx=>{await admin(ctx);setSession(ctx.from.id,{step:'import_retake',data:{}});return ctx.reply('Mock kodi va Telegram ID yuboring: abc123 123456789\nRuxsat faqat ochiq mockda bir marta ishlaydi.');});
  bot.callbackQuery(/^ct:([a-f\d]{6})$/,async ctx=>{await admin(ctx);setSession(ctx.from.id,{step:'import_retake',data:{code:ctx.match[1]}});await ctx.answerCallbackQuery();return ctx.reply('Qayta topshiradigan o‘quvchining Telegram ID raqamini yuboring.');});
  bot.use(async(ctx,next)=>{
    const s=getSession(ctx.from.id);if(!ctx.message || !s?.step?.startsWith('import_'))return next();await admin(ctx);
    if(s.step==='import_label'){
      const title=ctx.message.text?.trim();if(!title||title.length>100)throw new InputError('Nom 1–100 belgi bo‘lsin.');
      s.data.title=title;s.step='import_topics';setSession(ctx.from.id,s);return ctx.reply('Mavzuni yuboring. Masalan: Hujayra, Fotosintez yoki 50–59-mavzular.');
    }
    if(s.step==='import_topics'){
      const text=ctx.message.text?.trim();if(!text||text.length>250)throw new InputError('Mavzu 1–250 belgi bo‘lsin.');
      const topics=text.split(',').map(x=>x.trim()).filter(Boolean);
      const p=await Package.findOneAndUpdate({_id:s.data.package_id,status:{$ne:'deleted'}},{$set:{title:s.data.title,topics}},{new:true});
      if(!p)throw new InputError('MOCK o‘chirilgan.');
      await Mock.updateMany({package_id:p._id,status:{$ne:'deleted'}},{$set:{title:p.title,topics}});
      clearSession(ctx.from.id);return card(ctx,p);
    }
    if(s.step==='import_file'){
      const imported=await download(ctx.api,ctx.message.document,config.BOT_TOKEN);
      if(imported.packages)return choosePackage(ctx,imported.packages,s.data.edit_id);
      const p=await catalog.savePackage(imported,s.data.edit_id);
      clearSession(ctx.from.id);await menu(ctx,'✅ MOCK tekshirildi va qoralamaga saqlandi.');return card(ctx,p);
    }
    if(s.step==='import_pick')return ctx.reply('Yuqoridagi MOCK tugmasini tanlang. Boshqa fayl uchun «📥 MOCK yuklash» yoki /cancel bosing.');
    if(s.step==='import_retake'){
      const text=s.data.code?`${s.data.code} ${ctx.message.text}`:ctx.message.text;
      const match=/^([a-f\d]{6}) (\d{1,16})$/.exec(text||'');if(!match||!Number.isSafeInteger(+match[2]))throw new InputError('Format: abc123 123456789');
      await catalog.permitRetake(match[1],+match[2]);clearSession(ctx.from.id);return ctx.reply('✅ Shu o‘quvchiga bir marta qayta topshirish ochildi. Mockni botdan qayta tanlasin.');
    }
  });
}
async function question(ctx,m,nonce,index,edit=false) {
  const a=await Attempt.findOne({mock_id:m._id,telegram_id:ctx.from.id}),q=m.questions[index];
  if(!q || !a || a.nonce!==nonce || a.state!=='active')throw new InputError('Urinish eskirgan. Mockni qayta oching.');
  const kb=new InlineKeyboard();for(const x of ['A','B','C','D'])kb.text(`${a.draft?.[q.question_id]===x?'✓ ':''}${x}`,`bq:${m._id}:${nonce.slice(0,8)}:${index}:${x}`);
  kb.row();if(index>0)kb.text('← Oldingi',`bq:${m._id}:${nonce.slice(0,8)}:${index-1}:N`);if(index<m.count-1)kb.text('Keyingi →',`bq:${m._id}:${nonce.slice(0,8)}:${index+1}:N`);
  kb.row().text('🏁 Yakunlash',`bf:${m._id}:${nonce.slice(0,8)}`);
  const text=`🧬 ${m.title}\n${index+1}/${m.count} · ${q.source_topic}\n${q.text}\n\n${Object.entries(q.options).map(([k,v])=>`${k}) ${v}`).join('\n')}\n\nBelgilandi: ${Object.keys(a.draft||{}).length}/${m.count} · Tugash: ${localTime(m.ends_at)}`;
  if(edit)return ctx.editMessageText(text,{reply_markup:kb}).catch(e=>{if(!e.description?.includes('message is not modified'))throw e;});
  return ctx.reply(text,{reply_markup:kb});
}
function registerQuizUI(bot) {
  bot.callbackQuery(/^bs:([a-f\d]{24})$/,async ctx=>{const {m,attempt}=await catalog.openForUser(ctx.api,ctx.from,ctx.match[1]);await ctx.answerCallbackQuery();return question(ctx,m,attempt.nonce,0);});
  bot.callbackQuery(/^bq:([a-f\d]{24}):([a-f\d]{8}):(\d{1,2}):([ABCDN])$/,async ctx=>{
    const {m,attempt}=await catalog.openForUser(ctx.api,ctx.from,ctx.match[1]);const index=Number(ctx.match[3]),q=m.questions[index];
    if(!q || !attempt.nonce.startsWith(ctx.match[2]))throw new InputError('Bu tugma eskirgan.');
    if(ctx.match[4]!=='N')await Attempt.updateOne({mock_id:m._id,telegram_id:ctx.from.id,nonce:attempt.nonce,state:'active'},{$set:{[`draft.${q.question_id}`]:ctx.match[4]}});
    await ctx.answerCallbackQuery();return question(ctx,m,attempt.nonce,index,true);
  });
  bot.callbackQuery(/^bf:([a-f\d]{24}):([a-f\d]{8})$/,async ctx=>{
    const {m,attempt}=await catalog.openForUser(ctx.api,ctx.from,ctx.match[1]);if(!attempt.nonce.startsWith(ctx.match[2]))throw new InputError('Bu tugma eskirgan.');
    const a=await Attempt.findOne({mock_id:m._id,telegram_id:ctx.from.id});const answers=m.questions.map(q=>a.draft?.[q.question_id]||'-');
    const token=randomBytes(4).toString('hex');const {BioProfile:Profile}=require('../storage/postgres');
    await Profile.updateOne({telegram_id:ctx.from.id},{$set:{pending:{mock_id:m._id,answers,nonce:attempt.nonce,token,until:new Date(m.ends_at).toISOString()}}});
    await ctx.answerCallbackQuery();return ctx.reply(`Yakunlaysizmi? Bo‘sh savollar: ${answers.filter(a=>a==='-').length}\n${answerText(answers)}\nTasdiqdan keyin o‘zgartirish uchun admin ruxsati kerak.`,{reply_markup:new InlineKeyboard().text('✅ Topshirish',`bc:${ctx.from.id}:${token}`)});
  });
}
module.exports={C,registerImportUI,registerQuizUI};
