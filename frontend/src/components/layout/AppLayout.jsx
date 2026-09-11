import Sidebar from "./Sidebar";
import TopNavBar from "./TopNavBar";
import useAuth from "../../hooks/useAuth";

/**
 * AppLayout
 * Every authenticated page (Allocation Board, Tutor Dashboard, Volunteer View, Profile...)
 * renders <AppLayout> around its own content. The user's role is read from the auth
 * context so the sidebar only shows navigation relevant to that role.
 */
export default function AppLayout({ title, showSearch = true, avatarUrl, children }) {
  const { role } = useAuth();
  return (
    <div className="bg-background text-on-background font-body-md min-h-screen flex">
      <Sidebar role={role} />
      <div className="flex-1 ml-0 md:ml-sidebar-width flex flex-col h-screen overflow-hidden">
        <TopNavBar title={title} showSearch={showSearch} avatarUrl={avatarUrl} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
