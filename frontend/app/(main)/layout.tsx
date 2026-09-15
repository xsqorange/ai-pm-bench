import Sidebar from "@/components/Sidebar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      {/* min-h-screen 让 chat 这类需要 flex-1 的页面有完整 viewport 高度可用,
          否则输入框会被挤压、内容无法滚动到顶端 */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen">{children}</main>
    </>
  );
}