// The standalone Edge runtime stores the existing bot documents in Postgres JSONB.
// Only the server-side service key can call these RPCs; Telegram authorization
// remains in the shared bot handlers. Mutations and unique constraints run in SQL.
const { randomBytes } = require('crypto');
let rpc;
function configureDatabase(call) { rpc = call; }
const dates = new Set(['createdAt', 'updatedAt', 'subscription_end_date', 'expires_at', 'submitted_at', 'accepted_at', 'draft_until', 'analyzed_at', 'finished_at', 'completed_at', 'lease_until', 'paid_at', 'paid_through']);
function revive(value, key) {
  if (value == null) return value;
  if (dates.has(key) && typeof value === 'string') return new Date(value);
  if (Array.isArray(value)) return value.map(x => revive(x));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v, k)]));
  return value;
}
function project(doc, fields) {
  if (!doc || !fields) return doc;
  const names = typeof fields === 'string' ? fields.split(/\s+/).filter(Boolean) : Object.keys(fields).filter(k => fields[k]);
  if (!names.length) return doc;
  if (names.some(k => k.startsWith('-'))) throw new Error('Only inclusion projections are supported');
  return Object.fromEntries(['_id', ...names].filter(k => doc[k] !== undefined).map(k => [k, doc[k]]));
}
const models = {};
class Query {
  constructor(model, op, filter, update, options = {}) {
    Object.assign(this, { model, op, filter, update, options, ordering: {}, populates: [] });
  }
  sort(order) { this.ordering = order; return this; }
  select(fields) { this.fields = fields; return this; }
  limit(n) { this.take = n; return this; }
  populate(field, fields) { this.populates.push([field, fields]); return this; }
  lean() { return this; }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
  async exec() {
    if (!rpc) throw new Error('Postgres adapter is not configured');
    let data = await rpc('enzo_documents', { p_collection: this.model.collection, p_operation: this.op,
      p_filter: this.filter || {}, p_update: this.update || {}, p_sort: this.ordering,
      p_limit: this.take || 0, p_options: { ...this.options, defaults: this.model.defaults,
        timestamps: this.model.timestamps, new_id: randomBytes(12).toString('hex') } });
    data = revive(data);
    if (['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'create'].includes(this.op)) {
      const list = Array.isArray(data) ? data : data ? [data] : [];
      for (const [field, fields] of this.populates) {
        const target = models[{ user: 'User', test: 'Test', graded_by: 'User' }[field]];
        if (!target) throw new Error('Unsupported relation');
        const ids = [...new Set(list.map(x => x[field]).filter(Boolean))];
        const related = await target.find({ _id: { $in: ids } }).select(fields).lean();
        const byId = new Map(related.map(x => [x._id, x]));
        list.forEach(x => { x[field] = byId.get(x[field]) || null; });
      }
      const selected = list.map(x => project(x, this.fields));
      return Array.isArray(data) ? selected : selected[0] || null;
    }
    return data;
  }
}
function model(name, collection, defaults = {}, timestamps = true) {
  const m = { collection, defaults, timestamps,
    find: f => new Query(m, 'find', f), findOne: f => new Query(m, 'findOne', f),
    findById: id => new Query(m, 'findOne', { _id: String(id) }),
    create: doc => new Query(m, 'create', {}, doc),
    findOneAndUpdate: (f, u, o) => new Query(m, 'findOneAndUpdate', f, u, o),
    findOneAndDelete: f => new Query(m, 'findOneAndDelete', f),
    updateOne: (f, u, o) => new Query(m, 'updateOne', f, u, o),
    updateMany: (f, u, o) => new Query(m, 'updateMany', f, u, o),
    deleteOne: f => new Query(m, 'deleteOne', f),
    countDocuments: f => new Query(m, 'count', f),
    exists: async f => Boolean(await m.findOne(f)),
    distinct: async (field, f) => [...new Set((await m.find(f)).flatMap(x => x[field] ?? []))],
    bulkWrite: async ops => {
      for (const op of ops) {
        if (!op.updateOne) throw new Error('Unsupported bulk operation');
        const { filter, update, upsert } = op.updateOne;
        await m.updateOne(filter, update, { upsert });
      }
    },
    aggregate: async pipeline => {
      // The standalone flow only uses this aggregation for the daily AI budget.
      if (pipeline.length !== 2 || !pipeline[0].$match || pipeline[1].$group?.count?.$sum !== '$read_count') throw new Error('Unsupported standalone aggregation');
      const rows = await m.find(pipeline[0].$match).select('read_count');
      return [{ _id: null, count: rows.reduce((s, r) => s + (r.read_count || 0), 0) }];
    },
  };
  models[name] = m; return m;
}
model('User', 'bot_students', { group_ids: [] });
models.User.nameKey = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
model('Attendance', 'bot_attendances');
model('TgLink', 'bot_tg_links');
model('Test', 'bot_tests', { submission_mode: 'answers', materials: [], answer_key: [], active: true });
model('Attempt', 'bot_attempts', { pending: false, answers: [], mistakes: [] });
model('GroupChat', 'bot_groups', { group_name: null, attendance_time: '14:00', days: [0, 1, 2, 3, 4, 5, 6], pay_day: 1, pay_time: '10:00', enabled: true });
model('JobLog', 'bot_job_logs');
model('BotSession', 'bot_sessions', {}, false);
model('LinkCode', 'bot_link_codes', {}, false);
model('ScreenshotResult', 'bot_screenshot_results', { needs_analysis: false, read_count: 1, report_chats: [] });
model('AttendanceReport', 'bot_attendance_reports', { result_ids: [] }, false);
module.exports = { ...models, configureDatabase, revive, project };
