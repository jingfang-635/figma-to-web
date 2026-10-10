import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import chromeDoc from '../generated/chrome.json'
import { getLayoutIr, iconsByRole, textNodeAt } from '../ir/useLayoutIr'
import { isNavSectionLabel, navIconForSymbol, navSymbols } from './navIcons'

const ROUTE_BY_LABEL: Record<string, string> = {
  首页: '/',
  机构信息: '/organization',
  科室管理: '/departments',
  医生管理: '/doctors',
  排班管理: '/schedules',
}

type Appointment = { id: number; status: string; date: string }

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const homeIr = getLayoutIr('home')
  const chrome = chromeDoc.chrome
  const sidebar = chrome.sidebar
  const header = chrome.header
  const [badgeCount, setBadgeCount] = useState(0)

  // Shell icons come from the IR slots, in reading order — no label table.
  const brandIcon = iconsByRole(homeIr, 'brand-mark')[0]
  const navSlots = iconsByRole(homeIr, 'nav-item')

  const brandTitle = textNodeAt(homeIr.texts, 66, 15)
  const brandSubtitle = textNodeAt(homeIr.texts, 66, 36.8)
  const userName = textNodeAt(homeIr.texts, 1305, 7.5)
  const userRole = textNodeAt(homeIr.texts, 1305, 26.5)
  const logoutText = textNodeAt(homeIr.texts, 1390, 17)
  const avatarLetter = textNodeAt(homeIr.texts, 1277.63, 17)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const appts = await apiFetch<Appointment[]>('/api/appointments')
        if (cancelled) return
        const today = new Date().toISOString().slice(0, 10)
        setBadgeCount(
          appts.filter((a) => a.date === today && a.status === 'BOOKED').length,
        )
      } catch {
        /* chrome badge is best-effort */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedLabel =
    Object.entries(ROUTE_BY_LABEL).find(([_, path]) =>
      path === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(path),
    )?.[0] ?? '首页'

  const siderW = sidebar.width
  const headerH = header.bounds.height
  const symbols = navSymbols(homeIr)

  return (
    <div className="app-shell app-shell--fluid">
      <aside
        className="app-sider"
        style={{
          width: siderW,
          flex: `0 0 ${siderW}px`,
          background: 'var(--color-bg-sidebar)',
          borderRight: '1px solid var(--color-border)',
        }}
      >
        <div className="app-brand">
          <div className="app-brand-mark">
            {brandIcon?.symbol?.name ? (
              <span
                data-ir-icon={brandIcon.symbol.name}
                className="app-brand-mark__glyph"
              >
                {navIconForSymbol(brandIcon.symbol.name)}
              </span>
            ) : null}
          </div>
          <div className="app-brand__text">
            <div className="app-brand__title">
              {brandTitle?.characters}
            </div>
            <div className="app-brand__subtitle">
              {brandSubtitle?.characters}
            </div>
          </div>
        </div>

        <nav className="app-nav">
          {sidebar.items.map((item, index) => {
            const route = ROUTE_BY_LABEL[item.label]
            const section = isNavSectionLabel(item.label)
            const active = item.label === selectedLabel
            const showBadge = item.label === '预约记录' && badgeCount > 0
            const slot = section ? undefined : navSlots[index]
            const symbol = symbols[index]
            return (
              <div
                key={`${item.label}-${item.bounds.y}`}
                className={`app-nav-item${active ? ' is-active' : ''}${
                  route ? '' : ' is-disabled'
                }${section ? ' is-section' : ''}`}
                onClick={() => {
                  if (route) navigate(route)
                }}
                role={route ? 'link' : undefined}
                aria-disabled={!route}
              >
                {!section ? (
                  <span
                    className="app-nav-item__icon"
                    data-ir-icon={symbol}
                    data-ir-icon-node={slot?.nodeId}
                    style={slot?.color ? { color: slot.color } : undefined}
                  >
                    {navIconForSymbol(symbol)}
                  </span>
                ) : null}
                <span className="app-nav-item__label">{item.label}</span>
                {showBadge ? (
                  <span className="app-nav-badge">{badgeCount}</span>
                ) : null}
              </div>
            )
          })}
        </nav>
      </aside>

      <div className="app-right">
        <header
          className="app-header"
          style={{
            height: headerH,
            flex: `0 0 ${headerH}px`,
            background: 'var(--color-bg-content)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div className="app-header__spacer" />
          <div className="app-header__avatar">
            {avatarLetter?.characters || 'A'}
          </div>
          <div className="app-header__user">
            <span className="app-header__name">{userName?.characters}</span>
            <span className="app-header__role">{userRole?.characters}</span>
          </div>
          <span className="app-header__logout" onClick={logout} role="link">
            {logoutText?.characters || '退出'}
          </span>
        </header>

        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
