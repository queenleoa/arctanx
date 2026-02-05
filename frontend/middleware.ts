import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Make the home route PUBLIC so users can see the landing page
const isPublicRoute = createRouteMatcher([
  '/',           // ← Add this - home page is now public
  '/sign-in(.*)', 
  '/sign-up(.*)'
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}