import ProtectedRoute from '@/components/ProtectedRoute';

export default function AdminLayout({ children }) {
  return <ProtectedRoute roles={['admin', 'hr']}>{children}</ProtectedRoute>;
}
