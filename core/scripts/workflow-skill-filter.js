'use strict';

function text(value) {
  return value == null ? '' : String(value);
}

function isWeaveProvidedSkill(skill) {
  if (!skill) return false;
  const source = text(skill.source);
  const id = text(skill.id);
  return source === 'weave'
    || source.startsWith('weave-')
    || id.startsWith('weave:')
    || id.startsWith('command:weave-');
}

function isSkillLikeEntry(skill) {
  if (!skill || typeof skill !== 'object') return false;
  if (!text(skill.id)) return false;
  if (!text(skill.source)) return false;
  return Boolean(text(skill.name) || text(skill.description) || text(skill.path));
}

function isVisibleWorkflowCandidate(skill) {
  if (!isSkillLikeEntry(skill)) return false;
  return !isWeaveProvidedSkill(skill);
}

module.exports = {
  isWeaveProvidedSkill,
  isSkillLikeEntry,
  isVisibleWorkflowCandidate,
};
