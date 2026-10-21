import ProtectedRoute from '@/components/ProtectedRoute';

export default function StaffLayout({ children }) {
  return <ProtectedRoute role="staff">{children}</ProtectedRoute>;
}
