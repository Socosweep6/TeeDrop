import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import bcrypt from 'bcryptjs';
import prisma from '../../../../lib/prisma';

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          onboardingDone: user.onboardingDone,
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user, account }) {
      // Auto-create DB user on first OAuth sign-in
      if (account.provider === 'google' || account.provider === 'facebook') {
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
        });
        if (!existing) {
          await prisma.user.create({
            data: {
              name: user.name || 'User',
              email: user.email,
              password: null,
              tier: 'free',
              settings: {
                create: {
                  courses: [],
                  dayOfWeek: ['saturday'],
                  startTime: '07:00',
                  endTime: '09:00',
                  players: 4,
                },
              },
            },
          });
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // Credentials sign-in: user object is populated directly
      if (user) {
        token.tier = user.tier;
        token.onboardingDone = user.onboardingDone;
      }
      // OAuth sign-in: fetch from DB to get tier/onboardingDone
      if (account?.provider === 'google' || account?.provider === 'facebook') {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
        });
        if (dbUser) {
          token.sub = dbUser.id;
          token.tier = dbUser.tier;
          token.onboardingDone = dbUser.onboardingDone;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub;
        session.user.tier = token.tier;
        session.user.onboardingDone = token.onboardingDone;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'teedrop-secret-key-change-in-production',
});

export { handler as GET, handler as POST };
