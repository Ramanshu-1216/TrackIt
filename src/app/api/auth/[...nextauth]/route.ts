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
    async signIn({ user, account }: any) {
      if (account?.provider === 'google' && account.access_token) {
        try {
          const client = await clientPromise;
          const db = client.db();
          await db.collection('accounts').updateOne(
            { provider: 'google', providerAccountId: account.providerAccountId },
            {
              $set: {
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                expires_at: account.expires_at,
                scope: account.scope,
                token_type: account.token_type,
                id_token: account.id_token,
              }
            },
            { upsert: true }
          );
          console.log('[Auth] Manually updated Google account tokens/scopes in DB');
        } catch (error) {
          console.error('[Auth] Error updating account in DB:', error);
        }
      }
      return true;
    },
    async session({ session, user, token }: any) {
      if (session.user) {
        session.user.id = user?.id || token?.sub;
        session.user.hasGmailScope = !!token?.hasGmailScope;
        console.log('[Auth] Session created/updated for user:', session.user.id, 'hasGmailScope:', session.user.hasGmailScope);
      }
      return session;
    },
    async jwt({ token, user, account }: any) {
      if (user) {
        token.id = user.id;
      }
      if (account) {
        console.log('[Auth] Account scope received:', account.scope);
        token.hasGmailScope = account.scope?.includes('https://www.googleapis.com/auth/gmail.readonly');
        console.log('[Auth] Token hasGmailScope set to:', token.hasGmailScope);
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
