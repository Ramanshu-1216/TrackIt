import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/auth/signin',
  },
});

export const config = {
  matcher: [
    '/',
    '/orders/:path*',
    '/subscriptions/:path*',
    '/settings/:path*',
    '/api/orders/:path*',
    '/api/subscriptions/:path*',
    '/api/dashboard/:path*',
    '/api/sync/:path*',
    '/api/notifications/:path*',
  ],
};
