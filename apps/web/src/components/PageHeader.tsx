export function PageHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <header>
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{subtitle}</p>
    </header>
  )
}
