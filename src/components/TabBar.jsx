import { Calendar, TrendingUp, Trophy, User } from 'lucide-react'

const tabs = [
  { id: 'calendar', label: 'Calendar', Icon: Calendar },
  { id: 'progress', label: 'Progress', Icon: TrendingUp },
  { id: 'leaderboard', label: 'Leaderboard', Icon: Trophy },
  { id: 'account', label: 'Account', Icon: User },
]

export default function TabBar({ active, onChange }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-orange-dim/25 bg-surface shadow-[0_-4px_16px_rgb(0_0_0/0.18)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-lg">
        {tabs.map(({ id, label, Icon }) => {
          const selected = active === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={[
                'flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium sm:text-xs',
                selected ? 'text-orange' : 'text-muted',
              ].join(' ')}
              aria-current={selected ? 'page' : undefined}
            >
              <Icon
                className="h-5 w-5"
                strokeWidth={selected ? 2.25 : 1.75}
                aria-hidden="true"
              />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
