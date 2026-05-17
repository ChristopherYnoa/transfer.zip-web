export default function DashboardLayout({ children }) {
  return (
    <>
      <div
        aria-hidden
        className="grain fixed inset-0 -z-10 pointer-events-none bg-linear-to-b from-primary-600 to-primary-300"
      />
      {children}
    </>
  );
}
