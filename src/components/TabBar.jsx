export default function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'calendar', label: 'Calendar' },
    { id: 'progress', label: 'Progress' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'account', label: 'Account' },
  ]

  return (
    <nav className="mx-auto flex max-w-lg gap-1 px-4 pt-4">
      {tabs.map((tab) => {
        const selected = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={[
              'flex-1 rounded-md px-1 py-2 text-xs font-medium sm:text-sm',
              selected
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50',
            ].join(' ')}
          >
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
