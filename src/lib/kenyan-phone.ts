export function normalizeKenyanPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (/^2547\d{8}$/.test(digits)) return `+${digits}`
  if (/^07\d{8}$/.test(digits)) return `+254${digits.slice(1)}`
  if (/^7\d{8}$/.test(digits)) return `+254${digits}`
  return null
}

export function formatKenyanPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  let national = digits
  if (digits.startsWith('254')) {
    national = digits.slice(3)
  }
  else if (digits.startsWith('0')) {
    national = digits.slice(1)
  }

  if (national.length === 0 || (national[0] && national[0] !== '7')) {
    return value
  }

  const limited = national.slice(0, 9)
  const groups = [limited.slice(0, 1), limited.slice(1, 4), limited.slice(4, 7), limited.slice(7, 9)]
    .filter(Boolean)
  return `+254 ${groups.join(' ')}`
}
