import ProtectedRoute from '@/components/ProtectedRoute';

// HR and Admin share the applicant and caregiver pages.
export default function HrLayout({ children }) {
  return <ProtectedRoute roles={['hr', 'admin']}>{children}</ProtectedRoute>;
}
