import { useNavigate } from 'react-router-dom';

/**
 * TopNavBar
 * `title` lets each page override the page-title text on the left (e.g. "TMS" on
 * small screens) while keeping the search box / icons / avatar consistent everywhere.
 */
export default function TopNavBar({ title = 'Tutor Management System', showSearch = true, avatarUrl }) {
  const navigate = useNavigate();

  return (
    <header className="flex justify-between items-center h-16 px-gutter sticky top-0 z-40 bg-surface/80 backdrop-blur-md shadow-sm">
      <div className="flex items-center gap-stack-md">
        <button className="md:hidden text-primary p-unit rounded hover:bg-surface-variant transition-colors">
          <span className="material-symbols-outlined">menu</span>
        </button>
        <span className="font-headline-md text-headline-md font-extrabold text-primary truncate">{title}</span>
      </div>

      <div className="flex items-center gap-stack-md">
        {showSearch && (
          <div className="relative hidden lg:block">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
              search
            </span>
            <input
              type="text"
              placeholder="Search..."
              className="pl-10 pr-4 py-2 bg-surface-container-high rounded-full border-none focus:ring-2 focus:ring-primary font-body-sm text-body-sm"
            />
          </div>
        )}
        <button className="text-on-surface-variant hover:text-secondary hover:opacity-80 transition-colors p-unit rounded-full">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <button className="text-on-surface-variant hover:text-secondary hover:opacity-80 transition-colors p-unit rounded-full">
          <span className="material-symbols-outlined">help_outline</span>
        </button>
        <div className="w-8 h-8 rounded-full bg-surface-container-high overflow-hidden shrink-0 ml-stack-sm border border-outline-variant cursor-pointer hover:opacity-80 transition-opacity">
          {avatarUrl ? (
            <img alt="User avatar" className="w-full h-full object-cover" src={avatarUrl} />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-on-surface-variant"
              onClick={() => navigate('/profile')}
            >
              <span className="material-symbols-outlined text-[18px]">person</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
