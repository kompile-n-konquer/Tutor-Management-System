import { useNavigate } from "react-router-dom";
import { useTheme } from "../../features/context/ThemeContext";
import GlobalSearch from "../search/GlobalSearch";

export default function TopNavBar({ title = "Tutor Management System", showSearch = true, avatarUrl }) {
  const navigate = useNavigate();
  const { isDark, setColorMode } = useTheme();

  return (
    <header className="flex justify-between items-center h-16 px-gutter sticky top-0 z-40 bg-surface/80 backdrop-blur-md shadow-sm">
      <div className="flex items-center gap-stack-md">
        <button className="md:hidden text-primary p-unit rounded hover:bg-surface-variant transition-colors">
          <span className="material-symbols-outlined">menu</span>
        </button>
        <span className="font-headline-md text-headline-md font-extrabold text-primary truncate">{title}</span>
      </div>

      <div className="flex items-center gap-stack-md">
        {showSearch && <GlobalSearch />}
        <button
          type="button"
          onClick={() => setColorMode(isDark ? "light" : "dark")}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="text-on-surface-variant hover:text-secondary hover:opacity-80 transition-colors p-unit rounded-full"
        >
          <span className="material-symbols-outlined">{isDark ? "light_mode" : "dark_mode"}</span>
        </button>
        <button
          type="button"
          onClick={() => navigate("/profile")}
          title="Profile"
          aria-label="Open profile"
          className="w-8 h-8 rounded-full bg-surface-container-high overflow-hidden shrink-0 ml-stack-sm border border-outline-variant cursor-pointer hover:opacity-80 transition-opacity"
        >
          {avatarUrl ? (
            <img alt="User avatar" className="w-full h-full object-cover" src={avatarUrl} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px]">person</span>
            </div>
          )}
        </button>
      </div>
    </header>
  );
}