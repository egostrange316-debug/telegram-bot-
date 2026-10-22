const config = require('../config');

function rosterFilter(group) {
  return { role: 'student', ...(config.STANDALONE
    ? { group_ids: group._id }
    : group.group_name ? { group_name: group.group_name } : {}) };
}

function isMember(member) {
  return ['creator', 'administrator', 'member'].includes(member?.status)
    || (member?.status === 'restricted' && member.is_member === true);
}

function fullName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  return name.length >= 3 && name.length <= 80 && !name.startsWith('/') && /\p{L}/u.test(name) ? name : null;
}

module.exports = { rosterFilter, isMember, fullName };
