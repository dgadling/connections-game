// formatDiscordMention – Discord snowflake IDs → <@id>, usernames → @username
// If roleId is truthy, suppress individual mentions and return plain name (role ping mode)
export function formatDiscordMention(id, name = null, roleId = null) {
  // Role mode: suppress individual mentions, use plain name
  if (roleId) return name || null
  if (!id) return name || null
  if (/^\d{17,20}$/.test(id)) return `<@${id}>`
  return id.startsWith('@') ? id : '@' + id
}
