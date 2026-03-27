import { Loading } from '@/components'
import { useAuth, useUser } from '@clerk/clerk-react'
import React from 'react'
import { Navigate } from 'react-router-dom'

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

  // Guest (non-logged-in user) can access auth routes
  if (!isSignedIn) {
    if (requiredRole === 'guest') {
      return <>{children}</>
    }
    return <Navigate to="/unauthorized" replace />
  }

  // Check admin role
  if (requiredRole === 'admin') {
    const userRole = user?.publicMetadata?.role as string | undefined
    if (userRole !== 'admin') {
      return <Navigate to="/unauthorized" replace />
    }
  }

  if (requiredRole === 'user') {
    const userRole = user?.publicMetadata?.role as string | undefined
    if (userRole !== 'user') {
      return <Navigate to="/unauthorized" replace />
    }
  }

  return <>{children}</>
}
