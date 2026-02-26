import NextAuth, { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import clientPromise from '@/lib/mongodb';
export const authOptions: AuthOptions = {
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
          access_type: 'offline',
          prompt: 'consent',
          include_granted_scopes: true,
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user, token }: any) {
      if (session.user) {
        session.user.id = user?.id || token?.sub;
      }
      return session;
    },
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
  },
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: true,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
