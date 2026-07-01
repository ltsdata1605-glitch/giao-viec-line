export default function ReportsPage() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Báo cáo & Thống kê</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Tính năng này đang được phát triển...</p>
      </div>
      
      <div className="glass rounded-2xl p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-bg-card)] flex items-center justify-center">
          <span className="text-3xl">📊</span>
        </div>
        <h2 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">Báo cáo tương tác Bot</h2>
        <p className="text-[var(--color-text-secondary)]">Biểu đồ thống kê số lượng tin nhắn và công việc sẽ sớm ra mắt trong bản cập nhật tiếp theo.</p>
      </div>
    </div>
  );
}
