import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/clerk-react'
import { Loading } from '@/components'

interface RoleGuardProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'user' | 'guest'
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  children,
  requiredRole = 'user',
}) => {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()

  if (!isLoaded) {
    return <Loading />
  }

  // Guest (non-logged-in user) can access non-admin routes
  if (!isSignedIn) {
    if (requiredRole === 'admin') {
      return <Navigate to="/unauthorized" replace />
    }
    return <>{children}</>
  }

  // Check admin role
  if (requiredRole === 'admin') {
    const userRole = user?.publicMetadata?.role as string | undefined
    if (userRole !== 'admin') {
      return <Navigate to="/unauthorized" replace />
    }
  }

  return <>{children}</>
}
