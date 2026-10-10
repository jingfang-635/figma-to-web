import type { ComponentType, ReactNode } from 'react'
import {
  BarChartOutlined,
  CalendarOutlined,
  CloseOutlined,
  CrownOutlined,
  DownOutlined,
  FileDoneOutlined,
  GoldOutlined,
  HomeOutlined,
  LeftOutlined,
  LineChartOutlined,
  MedicineBoxOutlined,
  PieChartOutlined,
  PlusOutlined,
  RightOutlined,
  SkinOutlined,
  SmileOutlined,
  StarOutlined,
  StopOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'

/**
 * Symbol name → glyph. Keyed by the `symbol.name` carried in Layout IR
 * `icons[]`, so both the shell navigation and the in-page panels resolve the
 * same way and no screen has to keep its own label → icon table.
 */
const ICON_COMPONENTS: Record<string, ComponentType> = {
  BarChartOutlined,
  CalendarOutlined,
  CloseOutlined,
  CrownOutlined,
  DownOutlined,
  FileDoneOutlined,
  GoldOutlined,
  HomeOutlined,
  LeftOutlined,
  LineChartOutlined,
  MedicineBoxOutlined,
  PieChartOutlined,
  PlusOutlined,
  RightOutlined,
  SkinOutlined,
  SmileOutlined,
  StarOutlined,
  StopOutlined,
  TeamOutlined,
  UserOutlined,
}

/** `undefined` means the symbol is unknown — callers must not invent a glyph. */
export function iconComponentFor(
  name?: string,
): ComponentType | undefined {
  return name ? ICON_COMPONENTS[name] : undefined
}

export function iconNodeFor(name?: string): ReactNode {
  const Cmp = iconComponentFor(name)
  return Cmp ? <Cmp /> : null
}
