import type { ThemeConfig } from 'antd'

/** Ant Design theme mapped from visual-ir tokens (CSS variables). */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: 'var(--color-primary)',
    colorError: 'var(--color-danger)',
    colorText: 'var(--color-text-body)',
    colorTextSecondary: 'var(--color-text-secondary)',
    colorTextTertiary: 'var(--color-text-tertiary)',
    colorTextPlaceholder: 'var(--color-text-placeholder)',
    colorBorder: 'var(--color-border)',
    colorBgContainer: 'var(--color-bg-content)',
    colorBgLayout: 'var(--color-bg-page)',
    borderRadius: 6,
    fontFamily: "var(--font-family), 'Noto Sans SC', sans-serif",
  },
  components: {
    Layout: {
      headerHeight: 52,
      siderBg: 'var(--color-bg-sidebar)',
      bodyBg: 'var(--color-bg-page)',
      headerBg: 'var(--color-bg-content)',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'color-mix(in srgb, var(--color-primary) 12%, white)',
      itemSelectedColor: 'var(--color-primary)',
      itemColor: 'var(--color-text-body)',
      itemHoverColor: 'var(--color-primary)',
    },
    Card: {
      borderRadiusLG: 8,
    },
    Table: {
      headerBg: '#fafafa',
      headerColor: 'var(--color-text-secondary)',
      borderColor: 'var(--color-border)',
      rowHoverBg: 'color-mix(in srgb, var(--color-primary) 4%, white)',
    },
    Button: {
      primaryShadow: 'none',
      colorPrimary: 'var(--color-primary)',
    },
  },
}
