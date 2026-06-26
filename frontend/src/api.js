import toast from 'react-hot-toast'

export function csrf() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || ''
}

export function toastErr(e) {
  const msg = e?.message || String(e || 'Request failed')
  toast.error(msg)
  // also log for debugging
  console.error(e)
}

export async function api(path, opts={}) {
  const headers = { ...(opts.headers||{}) }
  if (opts.method && opts.method !== 'GET') headers['X-CSRF-Token'] = csrf()
  let r
  try {
    r = await fetch(path, { credentials: 'include', ...opts, headers })
  } catch (e) {
    throw new Error('Network error – check your connection')
  }
  if (r.status === 401 && !path.startsWith('/auth/')) {
    // session expired - force re-auth (but not for /auth/* endpoints where 401 means "not logged in")
    if (typeof window !== 'undefined') window.location.href = '/'
    throw new Error('Session expired – redirecting to login')
  }
  if (!r.ok) {
    const txt = await r.text().catch(()=>'')
    throw new Error(txt || `Request failed (${r.status})`)
  }
  const ct = r.headers.get('content-type') || ''
  if (ct.includes('json')) return await r.json()
  return await r.text()
}
