import ProtectedRoute from '@/components/ProtectedRoute';

export default function AdminLayout({ children }) {
  return <ProtectedRoute role="admin">{children}</ProtectedRoute>;
}
