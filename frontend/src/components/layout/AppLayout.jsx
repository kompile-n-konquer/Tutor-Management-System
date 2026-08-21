import Sidebar from "./Sidebar";
import TopNavBar from "./TopNavBar";

/**
 * AppLayout
 * Every authenticated page (Allocation Board, Tutor Dashboard, Volunteer View, Profile...)
 * renders <AppLayout role="..."> around its own content instead of re-declaring the
 * sidebar/header markup itself.
 */
export default function AppLayout({ role, title, showSearch, avatarUrl, children }) {
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