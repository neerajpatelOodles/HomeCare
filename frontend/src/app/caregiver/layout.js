import ProtectedRoute from '@/components/ProtectedRoute';

export default function CaregiverLayout({ children }) {
  return <ProtectedRoute role="caregiver">{children}</ProtectedRoute>;
}
