import ProtectedRoute from '@/components/ProtectedRoute';

export default function ClientLayout({ children }) {
  return <ProtectedRoute role="client">{children}</ProtectedRoute>;
}
