export default function AdminCard({ children, className = "" }) {
  return (
    <div className={`p-5 sm:p-6 bg-white rounded-xl ${className}`}>
      {children}
    </div>
  );
}
