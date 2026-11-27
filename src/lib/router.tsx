import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'

export type Route = '/' | '/ai' | '/git' | '/jobs' | '/remotes'
const ROUTES: Route[] = ['/', '/ai', '/git', '/jobs', '/remotes']
const LEGACY: Record<string, Route> = { '#/git': '/git', '#/tokens': '/ai', '#/claude': '/ai', '#/ai': '/ai' }

export const currentRoute = (): Route => current()
const current = (): Route => {
  let p = location.pathname.replace(/\/+$/, '') || '/'
  if (p === '/claude') p = '/ai'
  return (ROUTES as string[]).includes(p) ? (p as Route) : '/'
}

/** Link cũ dạng #/git → đường dẫn sạch /git (không thêm mục lịch sử). */
function normalize() {
  const legacy = LEGACY[location.hash]
  if (legacy) history.replaceState(null, '', legacy)
  else if (location.pathname !== current() && location.pathname.replace(/\/+$/, '') !== current()) history.replaceState(null, '', current())
}

export function navigate(to: Route) {
  if (to === current()) return
  history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo(0, 0)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => { normalize(); return current() })
  useEffect(() => {
    const on = () => { normalize(); setRoute(current()) }
    window.addEventListener('popstate', on)
    window.addEventListener('hashchange', on)
    return () => { window.removeEventListener('popstate', on); window.removeEventListener('hashchange', on) }
  }, [])
  return route
}

/** Thẻ <a> điều hướng không tải lại trang; Ctrl/Cmd+click, chuột giữa vẫn mở tab mới. */
export function Link({ to, onClick, ...rest }: { to: Route } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={click} {...rest} />
}
